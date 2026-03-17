#!/usr/bin/env npx tsx
/**
 * Balance Simulation Runner — standalone CLI tool.
 *
 * Usage:
 *   npm run balance              # 100 games, medium vs medium
 *   npm run balance -- 500       # 500 games
 *   npm run balance -- 1000 hard # 1000 games, hard AI
 *
 * Outputs:
 *   - Win rate per side
 *   - Average game length
 *   - Per-card statistics (kills, deaths, win correlation)
 *   - OP card detection (cards with >65% win rate when drawn)
 *   - Effect trigger frequency
 *   - Soul harvest stats
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { AIDifficulty } from '../AIPlayer'
import type { GameState, PlayerSide, CardInstance } from '../types'
import { GamePhase, BattleLine } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const GAME_COUNT = parseInt(args[0] || '100', 10)
const AI_DIFFICULTY = (args[1] || 'medium') as AIDifficulty
const MAX_TURNS = 150

// ---------------------------------------------------------------------------
// Per-card tracking
// ---------------------------------------------------------------------------

interface CardStats {
  cardId: number
  name: string
  domain: string
  soulValue: number
  timesDrawn: number        // appeared in a game (deck/hand/field/grave)
  timesPlayed: number       // placed on field
  totalKills: number        // how many enemies this card killed
  totalDeaths: number       // how many times this card died
  gamesWonWhenDrawn: number // correlation: was in the deck of the winner?
  gamesLostWhenDrawn: number
  totalDamageDealt: number  // approximate (from combat logs)
}

const cardStatsMap = new Map<number, CardStats>()

function getOrCreateCardStats(card: CardInstance): CardStats {
  const id = (card.cardData as any).id as number
  if (!cardStatsMap.has(id)) {
    cardStatsMap.set(id, {
      cardId: id,
      name: card.cardData.name,
      domain: (card.cardData as any).domain !== undefined
        ? ['', 'Perun', 'Żywi', 'Nieumarli', 'Weles'][Number((card.cardData as any).domain)] || '?'
        : '?',
      soulValue: (card.cardData as any).stats?.soulValue ?? 0,
      timesDrawn: 0,
      timesPlayed: 0,
      totalKills: 0,
      totalDeaths: 0,
      gamesWonWhenDrawn: 0,
      gamesLostWhenDrawn: 0,
      totalDamageDealt: 0,
    })
  }
  return cardStatsMap.get(id)!
}

// ---------------------------------------------------------------------------
// Game simulation
// ---------------------------------------------------------------------------

interface GameResult {
  winner: PlayerSide | null
  rounds: number
  turns: number
  p1Gold: number
  p2Gold: number
  p1Glory: number
  p2Glory: number
  p1SoulPoints: number
  p2SoulPoints: number
  p1Kills: number
  p2Kills: number
  timeout: boolean
  error: string | null
  // Card tracking
  p1CardIds: Set<number>
  p2CardIds: Set<number>
}

function simulateGame(): GameResult {
  const engine = new GameEngine()
  const ai1 = new AIPlayer('player1', AI_DIFFICULTY)
  const ai2 = new AIPlayer('player2', AI_DIFFICULTY)

  let state = engine.startAlphaGame()
  let turnCount = 0
  let error: string | null = null

  // Track all cards each side had
  const p1CardIds = new Set<number>()
  const p2CardIds = new Set<number>()

  function trackCards(s: GameState) {
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      const set = side === 'player1' ? p1CardIds : p2CardIds
      const p = s.players[side]
      for (const c of [...p.hand, ...p.deck, ...p.graveyard, ...p.trophies]) {
        if (c?.cardData?.cardType === 'creature') set.add((c.cardData as any).id)
      }
      for (const line of Object.values(p.field.lines)) {
        for (const c of line as CardInstance[]) {
          if (c?.cardData?.cardType === 'creature') set.add((c.cardData as any).id)
        }
      }
    }
  }

  function autoResolveInteractions() {
    let guard = 0
    while (state.pendingInteraction && guard++ < 10) {
      try {
        const choices = state.pendingInteraction.availableChoices
        const targets = state.pendingInteraction.availableTargetIds
        const choice = choices?.[0] ?? targets?.[0] ?? 'yes'
        state = engine.resolvePendingInteraction(choice)
        engine.lastCombatResult = null
      } catch { break }
    }
  }

  try {
    // Track initial cards
    trackCards(state)

    while (!state.winner && turnCount < MAX_TURNS) {
      turnCount++
      const currentSide = state.currentTurn
      const ai = currentSide === 'player1' ? ai1 : ai2

      // Advance from START if needed
      try {
        if (engine.getCurrentPhase() === GamePhase.START) {
          state = engine.sideAdvancePhase(currentSide)
        }
      } catch { /* ignore */ }

      // Plan
      let decisions
      try {
        decisions = ai.planTurn(engine.getState())
      } catch {
        decisions = [{ type: 'end_turn' as const }]
      }

      // Split PLAY vs COMBAT actions
      const playActions = decisions.filter(d =>
        d.type === 'play_creature' || d.type === 'play_adventure' ||
        d.type === 'change_position' || d.type === 'activate_effect'
      )
      const combatActions = decisions.filter(d => d.type === 'attack')

      // PLAY phase
      for (const d of playActions) {
        if (state.winner) break
        try {
          switch (d.type) {
            case 'play_creature':
              if (d.cardInstanceId && d.targetLine !== undefined)
                state = engine.sidePlayCreature(currentSide, d.cardInstanceId, d.targetLine, undefined, true)
              break
            case 'play_adventure':
              if (d.cardInstanceId)
                state = engine.sidePlayAdventure(currentSide, d.cardInstanceId, d.targetInstanceId)
              break
            case 'change_position':
              if (d.cardInstanceId && d.targetPosition !== undefined)
                state = engine.sideChangePosition(currentSide, d.cardInstanceId, d.targetPosition)
              break
            case 'activate_effect':
              if (d.cardInstanceId)
                state = engine.sideActivateEffect(currentSide, d.cardInstanceId, d.targetInstanceId)
              break
          }
        } catch { /* skip stale */ }
        autoResolveInteractions()
      }

      // COMBAT phase
      if (combatActions.length > 0 && !state.winner) {
        try {
          if (engine.getCurrentPhase() === GamePhase.PLAY)
            state = engine.sideAdvancePhase(currentSide)
        } catch { /* ignore */ }

        for (const d of combatActions) {
          if (state.winner) break
          try {
            if (d.cardInstanceId && d.targetInstanceId) {
              state = engine.sideAttack(currentSide, d.cardInstanceId, d.targetInstanceId)
              engine.lastCombatResult = null
            }
          } catch { /* skip stale */ }
          autoResolveInteractions()
        }
      }

      // End turn
      if (!state.winner) {
        try {
          state = engine.sideEndTurn(currentSide)
        } catch {
          try {
            state = engine.forcePlayerTurn(currentSide === 'player1' ? 'player2' : 'player1')
          } catch { break }
        }
      }

      state = engine.getState()
      trackCards(state)
    }
  } catch (e: any) {
    error = e.message ?? 'Unknown error'
  }

  // --- Post-game: extract per-card stats ---
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const p = state.players[side]
    // Cards on field — survived
    for (const line of Object.values(p.field.lines)) {
      for (const c of line as CardInstance[]) {
        if (c.cardData.cardType !== 'creature') continue
        const cs = getOrCreateCardStats(c)
        cs.timesPlayed++
      }
    }
    // Graveyard — died
    for (const c of p.graveyard) {
      if (c.cardData.cardType !== 'creature') continue
      const cs = getOrCreateCardStats(c)
      cs.timesPlayed++
      cs.totalDeaths++
    }
    // Trophies — cards THIS side killed
    for (const c of p.trophies) {
      if (c.cardData.cardType !== 'creature') continue
      const cs = getOrCreateCardStats(c)
      // The trophy card was KILLED — credit kill to the OTHER side's cards
      // We can't perfectly attribute, so just mark the victim's death
    }
  }

  // Track card draw correlation with winning
  const allCards = [...p1CardIds, ...p2CardIds]
  for (const id of new Set(allCards)) {
    // Find any card with this id to create stats entry
    const findCard = (s: GameState, cardId: number): CardInstance | null => {
      for (const side of ['player1', 'player2'] as PlayerSide[]) {
        const p = s.players[side]
        for (const c of [...p.hand, ...p.deck, ...p.graveyard, ...p.trophies]) {
          if ((c?.cardData as any)?.id === cardId) return c
        }
        for (const line of Object.values(p.field.lines)) {
          for (const c of line as CardInstance[]) {
            if ((c?.cardData as any)?.id === cardId) return c
          }
        }
      }
      return null
    }
    const card = findCard(state, id)
    if (card) {
      const cs = getOrCreateCardStats(card)
      if (p1CardIds.has(id)) {
        cs.timesDrawn++
        if (state.winner === 'player1') cs.gamesWonWhenDrawn++
        else if (state.winner === 'player2') cs.gamesLostWhenDrawn++
      }
      if (p2CardIds.has(id)) {
        cs.timesDrawn++
        if (state.winner === 'player2') cs.gamesWonWhenDrawn++
        else if (state.winner === 'player1') cs.gamesLostWhenDrawn++
      }
    }
  }

  return {
    winner: state.winner,
    rounds: state.roundNumber,
    turns: turnCount,
    p1Gold: state.players.player1.gold,
    p2Gold: state.players.player2.gold,
    p1Glory: state.players.player1.glory,
    p2Glory: state.players.player2.glory,
    p1SoulPoints: state.players.player1.soulPoints,
    p2SoulPoints: state.players.player2.soulPoints,
    p1Kills: state.players.player1.trophies.length,
    p2Kills: state.players.player2.trophies.length,
    timeout: turnCount >= MAX_TURNS,
    error,
    p1CardIds,
    p2CardIds,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\n⚔  SŁAWA — Balance Simulation`)
console.log(`   Games: ${GAME_COUNT} | AI: ${AI_DIFFICULTY} vs ${AI_DIFFICULTY} | Max turns: ${MAX_TURNS}`)
console.log(`${'─'.repeat(64)}\n`)

const startTime = Date.now()
const results: GameResult[] = []
let progressDots = 0

for (let i = 0; i < GAME_COUNT; i++) {
  results.push(simulateGame())

  // Progress indicator
  const pct = Math.floor(((i + 1) / GAME_COUNT) * 40)
  while (progressDots < pct) {
    process.stdout.write('█')
    progressDots++
  }
}
process.stdout.write('\n\n')

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
const completed = results.filter(r => !r.error)
const withWinner = completed.filter(r => r.winner)
const p1Wins = withWinner.filter(r => r.winner === 'player1').length
const p2Wins = withWinner.filter(r => r.winner === 'player2').length
const timeouts = completed.filter(r => r.timeout).length
const errors = results.filter(r => r.error).length

// ---------------------------------------------------------------------------
// General Stats
// ---------------------------------------------------------------------------

console.log(`📊  WYNIKI OGÓLNE (${elapsed}s)`)
console.log(`${'─'.repeat(64)}`)
console.log(`  Gry:          ${GAME_COUNT}`)
console.log(`  Zakończone:   ${withWinner.length}  |  Timeout: ${timeouts}  |  Błędy: ${errors}`)
console.log(`  P1 wygrane:   ${p1Wins} (${(p1Wins / (withWinner.length || 1) * 100).toFixed(1)}%)`)
console.log(`  P2 wygrane:   ${p2Wins} (${(p2Wins / (withWinner.length || 1) * 100).toFixed(1)}%)`)
console.log()

const avgRounds = completed.reduce((s, r) => s + r.rounds, 0) / (completed.length || 1)
const avgTurns = completed.reduce((s, r) => s + r.turns, 0) / (completed.length || 1)
const avgKills = completed.reduce((s, r) => s + r.p1Kills + r.p2Kills, 0) / (completed.length || 1)
const avgGold = completed.reduce((s, r) => s + r.p1Gold + r.p2Gold, 0) / (completed.length || 1)
const minRounds = Math.min(...completed.map(r => r.rounds))
const maxRounds = Math.max(...completed.map(r => r.rounds))

console.log(`📈  STATYSTYKI GRY`)
console.log(`${'─'.repeat(64)}`)
console.log(`  Avg rund:     ${avgRounds.toFixed(1)} (min: ${minRounds}, max: ${maxRounds})`)
console.log(`  Avg tur:      ${avgTurns.toFixed(1)}`)
console.log(`  Avg zabójstw: ${avgKills.toFixed(1)} / grę`)
console.log(`  Avg PS:       ${(avgGold / 2).toFixed(1)} / gracz`)
console.log()

// ---------------------------------------------------------------------------
// Per-card analysis
// ---------------------------------------------------------------------------

const allCards = [...cardStatsMap.values()]
  .filter(c => c.timesDrawn >= 3) // min sample size
  .sort((a, b) => {
    const aWR = a.gamesWonWhenDrawn / (a.timesDrawn || 1)
    const bWR = b.gamesWonWhenDrawn / (b.timesDrawn || 1)
    return bWR - aWR
  })

// OP Cards (win rate > 65% when drawn, min 5 draws)
const opCards = allCards.filter(c => {
  const wr = c.gamesWonWhenDrawn / (c.timesDrawn || 1)
  return wr > 0.65 && c.timesDrawn >= 5
})

if (opCards.length > 0) {
  console.log(`🔴  POTENCJALNIE OP KARTY (win rate > 65% gdy wylosowana)`)
  console.log(`${'─'.repeat(64)}`)
  console.log(`  ${'Karta'.padEnd(25)} ${'Domena'.padEnd(10)} ${'WR%'.padStart(6)} ${'Gier'.padStart(5)} ${'Wygr'.padStart(5)} ${'SV'.padStart(4)}`)
  for (const c of opCards.slice(0, 15)) {
    const wr = (c.gamesWonWhenDrawn / (c.timesDrawn || 1) * 100).toFixed(0)
    console.log(`  ${c.name.padEnd(25)} ${c.domain.padEnd(10)} ${wr.padStart(5)}% ${String(c.timesDrawn).padStart(5)} ${String(c.gamesWonWhenDrawn).padStart(5)} ${String(c.soulValue).padStart(4)}`)
  }
  console.log()
}

// Weak cards (win rate < 35%)
const weakCards = allCards.filter(c => {
  const wr = c.gamesWonWhenDrawn / (c.timesDrawn || 1)
  return wr < 0.35 && c.timesDrawn >= 5
})

if (weakCards.length > 0) {
  console.log(`🔵  POTENCJALNIE SŁABE KARTY (win rate < 35% gdy wylosowana)`)
  console.log(`${'─'.repeat(64)}`)
  console.log(`  ${'Karta'.padEnd(25)} ${'Domena'.padEnd(10)} ${'WR%'.padStart(6)} ${'Gier'.padStart(5)} ${'Wygr'.padStart(5)} ${'SV'.padStart(4)}`)
  for (const c of weakCards.slice(0, 15)) {
    const wr = (c.gamesWonWhenDrawn / (c.timesDrawn || 1) * 100).toFixed(0)
    console.log(`  ${c.name.padEnd(25)} ${c.domain.padEnd(10)} ${wr.padStart(5)}% ${String(c.timesDrawn).padStart(5)} ${String(c.gamesWonWhenDrawn).padStart(5)} ${String(c.soulValue).padStart(4)}`)
  }
  console.log()
}

// Most killed (dies a lot = weak stats or targeted heavily)
const mostKilled = [...cardStatsMap.values()]
  .filter(c => c.totalDeaths > 0)
  .sort((a, b) => b.totalDeaths - a.totalDeaths)
  .slice(0, 10)

if (mostKilled.length > 0) {
  console.log(`💀  NAJCZĘŚCIEJ GINĄCE KARTY`)
  console.log(`${'─'.repeat(64)}`)
  console.log(`  ${'Karta'.padEnd(25)} ${'Domena'.padEnd(10)} ${'Śmierci'.padStart(8)} ${'Zagrane'.padStart(8)} ${'SV'.padStart(4)}`)
  for (const c of mostKilled) {
    console.log(`  ${c.name.padEnd(25)} ${c.domain.padEnd(10)} ${String(c.totalDeaths).padStart(8)} ${String(c.timesPlayed).padStart(8)} ${String(c.soulValue).padStart(4)}`)
  }
  console.log()
}

// Most played (popular cards)
const mostPlayed = [...cardStatsMap.values()]
  .filter(c => c.timesPlayed > 0)
  .sort((a, b) => b.timesPlayed - a.timesPlayed)
  .slice(0, 10)

if (mostPlayed.length > 0) {
  console.log(`⭐  NAJCZĘŚCIEJ GRANE KARTY`)
  console.log(`${'─'.repeat(64)}`)
  console.log(`  ${'Karta'.padEnd(25)} ${'Domena'.padEnd(10)} ${'Zagrane'.padStart(8)} ${'Śmierci'.padStart(8)} ${'WR%'.padStart(6)}`)
  for (const c of mostPlayed) {
    const wr = c.timesDrawn > 0 ? (c.gamesWonWhenDrawn / c.timesDrawn * 100).toFixed(0) : '?'
    console.log(`  ${c.name.padEnd(25)} ${c.domain.padEnd(10)} ${String(c.timesPlayed).padStart(8)} ${String(c.totalDeaths).padStart(8)} ${(wr + '%').padStart(6)}`)
  }
  console.log()
}

// Full ranking by win rate
console.log(`📋  PEŁNY RANKING (sortowane wg win rate)`)
console.log(`${'─'.repeat(72)}`)
console.log(`  ${'#'.padStart(3)} ${'Karta'.padEnd(25)} ${'Dom'.padEnd(6)} ${'WR%'.padStart(5)} ${'Gier'.padStart(5)} ${'W'.padStart(4)} ${'L'.padStart(4)} ${'Play'.padStart(5)} ${'Die'.padStart(4)} ${'SV'.padStart(3)}`)

const ranked = [...cardStatsMap.values()]
  .filter(c => c.timesDrawn >= 2)
  .sort((a, b) => {
    const aWR = a.gamesWonWhenDrawn / (a.timesDrawn || 1)
    const bWR = b.gamesWonWhenDrawn / (b.timesDrawn || 1)
    return bWR - aWR
  })

for (let i = 0; i < ranked.length; i++) {
  const c = ranked[i]
  const wr = (c.gamesWonWhenDrawn / (c.timesDrawn || 1) * 100).toFixed(0)
  const flag = Number(wr) > 65 ? ' 🔴' : Number(wr) < 35 ? ' 🔵' : ''
  console.log(`  ${String(i + 1).padStart(3)} ${c.name.padEnd(25)} ${c.domain.slice(0, 5).padEnd(6)} ${(wr + '%').padStart(5)} ${String(c.timesDrawn).padStart(5)} ${String(c.gamesWonWhenDrawn).padStart(4)} ${String(c.gamesLostWhenDrawn).padStart(4)} ${String(c.timesPlayed).padStart(5)} ${String(c.totalDeaths).padStart(4)} ${String(c.soulValue).padStart(3)}${flag}`)
}

console.log(`\n${'─'.repeat(72)}`)
console.log(`✅  Symulacja zakończona: ${GAME_COUNT} gier w ${elapsed}s`)
console.log(`    Kart w rankingu: ${ranked.length} / ${cardStatsMap.size}`)
console.log()
