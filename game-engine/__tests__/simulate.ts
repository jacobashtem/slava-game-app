#!/usr/bin/env npx tsx
/**
 * Balance Simulation Runner — standalone CLI tool.
 *
 * Usage:
 *   npm run balance              # 100 games, medium vs medium
 *   npm run balance -- 500       # 500 games
 *   npm run balance -- 1000 hard # 1000 games, hard AI
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { AIDifficulty } from '../AIPlayer'
import type { GameState, PlayerSide, CardInstance, LogEntry } from '../types'
import { GamePhase, BattleLine, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'

const args = process.argv.slice(2)
const GAME_COUNT = parseInt(args[0] || '100', 10)
const AI_DIFFICULTY = (args[1] || 'veteran') as AIDifficulty
const MAX_TURNS = 150

// ---------------------------------------------------------------------------
// Per-card tracking
// ---------------------------------------------------------------------------

interface CardStats {
  cardId: number
  name: string
  effectId: string
  domain: string
  soulValue: number
  baseAtk: number
  baseDef: number
  timesDrawn: number
  timesPlayed: number
  totalDeaths: number
  gamesWonWhenDrawn: number
  gamesLostWhenDrawn: number
}

const cardStatsMap = new Map<number, CardStats>()
const DOMAIN_NAMES = ['', 'Perun', 'Żywi', 'Nieumarli', 'Weles']

function getOrCreateCardStats(card: CardInstance): CardStats {
  const id = (card.cardData as any).id as number
  if (!cardStatsMap.has(id)) {
    const stats = (card.cardData as any).stats
    cardStatsMap.set(id, {
      cardId: id, name: card.cardData.name,
      effectId: (card.cardData as any).effectId ?? '',
      domain: DOMAIN_NAMES[Number((card.cardData as any).domain)] || '?',
      soulValue: stats?.soulValue ?? 0,
      baseAtk: stats?.attack ?? 0, baseDef: stats?.defense ?? 0,
      timesDrawn: 0, timesPlayed: 0, totalDeaths: 0,
      gamesWonWhenDrawn: 0, gamesLostWhenDrawn: 0,
    })
  }
  return cardStatsMap.get(id)!
}

// ---------------------------------------------------------------------------
// Game result
// ---------------------------------------------------------------------------

interface GameResult {
  winner: PlayerSide | null
  winMethod: 'ps' | 'elimination' | 'timeout' | 'error'
  rounds: number
  turns: number
  p1Gold: number; p2Gold: number
  p1SoulPoints: number; p2SoulPoints: number
  p1Kills: number; p2Kills: number
  // New metrics
  p1EnhancedUsed: number; p2EnhancedUsed: number
  p1PlunderCount: number; p2PlunderCount: number
  p1SoulHarvests: number; p2SoulHarvests: number  // PS from soul harvest
  fastestPS: number  // round when first player hit 10 PS
  p1CardIds: Set<number>; p2CardIds: Set<number>
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function simulateGame(): GameResult {
  const engine = new GameEngine()
  const ai1 = new AIPlayer('player1', AI_DIFFICULTY)
  const ai2 = new AIPlayer('player2', AI_DIFFICULTY)
  let state = engine.startAlphaGame()
  let turnCount = 0
  let winMethod: GameResult['winMethod'] = 'timeout'
  const p1CardIds = new Set<number>()
  const p2CardIds = new Set<number>()

  // Log analysis counters
  let p1Enhanced = 0, p2Enhanced = 0
  let p1Plunder = 0, p2Plunder = 0
  let p1Harvests = 0, p2Harvests = 0
  let fastestPS = 999
  let lastLogLen = 0

  function analyzeNewLogs(s: GameState) {
    const logs = s.actionLog
    if (logs.length <= lastLogLen) { lastLogLen = logs.length; return }
    for (let i = lastLogLen; i < logs.length; i++) {
      const e = logs[i]
      const msg = e.message
      // Enhanced adventure usage
      if (msg.includes('wzmocnion') || msg.includes('ulepszon') || msg.includes('enhanced')) {
        if (msg.startsWith('Ty') || msg.includes('player1')) p1Enhanced++
        else p2Enhanced++
      }
      // Plunder
      if (msg.includes('ŁUPIENIE')) {
        if (msg.startsWith('Ty') || msg.includes('player1')) p1Plunder++
        else p2Plunder++
      }
      // Soul harvest PS
      if (msg.includes('ŻNIWO DUSZ')) {
        if (msg.startsWith('Ty') || msg.includes('player1')) p1Harvests++
        else p2Harvests++
      }
    }
    // Check PS win timing
    if (s.players.player1.gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET && fastestPS > s.roundNumber)
      fastestPS = s.roundNumber
    if (s.players.player2.gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET && fastestPS > s.roundNumber)
      fastestPS = s.roundNumber
    lastLogLen = logs.length
  }

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
    trackCards(state)
    while (!state.winner && turnCount < MAX_TURNS) {
      turnCount++
      const currentSide = state.currentTurn
      const ai = currentSide === 'player1' ? ai1 : ai2

      try {
        if (engine.getCurrentPhase() === GamePhase.START)
          state = engine.sideAdvancePhase(currentSide)
      } catch {}

      let decisions
      try { decisions = ai.planTurn(engine.getState()) }
      catch { decisions = [{ type: 'end_turn' as const }] }

      const playActions = decisions.filter(d =>
        d.type === 'play_creature' || d.type === 'play_adventure' ||
        d.type === 'change_position' || d.type === 'activate_effect')
      const combatActions = decisions.filter(d => d.type === 'attack')
      const wantsPlunder = decisions.some(d => d.type === 'plunder')

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
                state = engine.sidePlayAdventure(currentSide, d.cardInstanceId, d.targetInstanceId, (d as any).useEnhanced)
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
        } catch {}
        autoResolveInteractions()
      }

      if (combatActions.length > 0 && !state.winner) {
        try {
          if (engine.getCurrentPhase() === GamePhase.PLAY)
            state = engine.sideAdvancePhase(currentSide)
        } catch {}
        for (const d of combatActions) {
          if (state.winner) break
          try {
            if (d.cardInstanceId && d.targetInstanceId) {
              state = engine.sideAttack(currentSide, d.cardInstanceId, d.targetInstanceId)
              engine.lastCombatResult = null
            }
          } catch {}
          autoResolveInteractions()
        }
      }

      // Plunder if enemy field empty
      if (wantsPlunder && !state.winner) {
        try { state = engine.sidePlunder(currentSide) } catch {}
      }

      if (!state.winner) {
        try { state = engine.sideEndTurn(currentSide) }
        catch {
          try { state = engine.forcePlayerTurn(currentSide === 'player1' ? 'player2' : 'player1') }
          catch { break }
        }
      }
      state = engine.getState()
      analyzeNewLogs(state)
      trackCards(state)
    }
  } catch {}

  // Determine win method
  if (state.winner) {
    const w = state.players[state.winner]
    winMethod = w.gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET ? 'ps' : 'elimination'
  }

  // Post-game card stats
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const p = state.players[side]
    for (const line of Object.values(p.field.lines))
      for (const c of line as CardInstance[])
        if (c.cardData.cardType === 'creature') getOrCreateCardStats(c).timesPlayed++
    for (const c of p.graveyard)
      if (c.cardData.cardType === 'creature') { getOrCreateCardStats(c).timesPlayed++; getOrCreateCardStats(c).totalDeaths++ }
  }

  for (const id of new Set([...p1CardIds, ...p2CardIds])) {
    const findCard = (s: GameState, cid: number): CardInstance | null => {
      for (const side of ['player1', 'player2'] as PlayerSide[]) {
        for (const c of [...s.players[side].hand, ...s.players[side].deck, ...s.players[side].graveyard, ...s.players[side].trophies])
          if ((c?.cardData as any)?.id === cid) return c
        for (const line of Object.values(s.players[side].field.lines))
          for (const c of line as CardInstance[])
            if ((c?.cardData as any)?.id === cid) return c
      }
      return null
    }
    const card = findCard(state, id)
    if (!card) continue
    const cs = getOrCreateCardStats(card)
    if (p1CardIds.has(id)) { cs.timesDrawn++; if (state.winner === 'player1') cs.gamesWonWhenDrawn++; else if (state.winner === 'player2') cs.gamesLostWhenDrawn++ }
    if (p2CardIds.has(id)) { cs.timesDrawn++; if (state.winner === 'player2') cs.gamesWonWhenDrawn++; else if (state.winner === 'player1') cs.gamesLostWhenDrawn++ }
  }

  return {
    winner: state.winner, winMethod, rounds: state.roundNumber, turns: turnCount,
    p1Gold: state.players.player1.gold, p2Gold: state.players.player2.gold,
    p1SoulPoints: state.players.player1.soulPoints, p2SoulPoints: state.players.player2.soulPoints,
    p1Kills: state.players.player1.trophies.length, p2Kills: state.players.player2.trophies.length,
    p1EnhancedUsed: p1Enhanced, p2EnhancedUsed: p2Enhanced,
    p1PlunderCount: p1Plunder, p2PlunderCount: p2Plunder,
    p1SoulHarvests: p1Harvests, p2SoulHarvests: p2Harvests,
    fastestPS: fastestPS < 999 ? fastestPS : 0,
    p1CardIds, p2CardIds,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\n⚔  SŁAWA — Balance Simulation`)
console.log(`   Games: ${GAME_COUNT} | AI: ${AI_DIFFICULTY} vs ${AI_DIFFICULTY} | Max turns: ${MAX_TURNS}`)
console.log(`${'─'.repeat(70)}\n`)

const startTime = Date.now()
const results: GameResult[] = []
let dots = 0

for (let i = 0; i < GAME_COUNT; i++) {
  results.push(simulateGame())
  const pct = Math.floor(((i + 1) / GAME_COUNT) * 50)
  while (dots < pct) { process.stdout.write('█'); dots++ }
}
process.stdout.write('\n\n')

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
const completed = results.filter(r => r.winMethod !== 'error')
const withWinner = completed.filter(r => r.winner)
const p1Wins = withWinner.filter(r => r.winner === 'player1').length
const p2Wins = withWinner.filter(r => r.winner === 'player2').length
const timeouts = completed.filter(r => r.winMethod === 'timeout').length
const psWins = withWinner.filter(r => r.winMethod === 'ps').length
const elimWins = withWinner.filter(r => r.winMethod === 'elimination').length

// ===========================================================================
// 1) WYNIKI OGÓLNE
// ===========================================================================
console.log(`📊  WYNIKI OGÓLNE (${elapsed}s)`)
console.log(`${'─'.repeat(70)}`)
console.log(`  Gry:             ${GAME_COUNT}`)
console.log(`  Zakończone:      ${withWinner.length}  |  Timeout: ${timeouts}  |  Błędy: ${results.filter(r => r.winMethod === 'error').length}`)
console.log(`  P1 wygrane:      ${p1Wins} (${(p1Wins / (withWinner.length || 1) * 100).toFixed(1)}%)`)
console.log(`  P2 wygrane:      ${p2Wins} (${(p2Wins / (withWinner.length || 1) * 100).toFixed(1)}%)`)
console.log(`  Wygrana via PS:   ${psWins} (${(psWins / (withWinner.length || 1) * 100).toFixed(0)}%)`)
console.log(`  Wygrana via elim: ${elimWins} (${(elimWins / (withWinner.length || 1) * 100).toFixed(0)}%)`)
console.log()

// ===========================================================================
// 2) TEMPO PS — kiedy najszybciej wbijane 10 PS
// ===========================================================================
const avgRounds = completed.reduce((s, r) => s + r.rounds, 0) / (completed.length || 1)
const avgKills = completed.reduce((s, r) => s + r.p1Kills + r.p2Kills, 0) / (completed.length || 1)
const avgPS = withWinner.reduce((s, r) => s + Math.max(r.p1Gold, r.p2Gold), 0) / (withWinner.length || 1)
const avgLoserPS = withWinner.reduce((s, r) => s + Math.min(r.p1Gold, r.p2Gold), 0) / (withWinner.length || 1)
const fastestGames = withWinner.filter(r => r.fastestPS > 0)
const fastestPSround = fastestGames.length > 0 ? Math.min(...fastestGames.map(r => r.fastestPS)) : 0
const avgFastestPS = fastestGames.length > 0 ? fastestGames.reduce((s, r) => s + r.fastestPS, 0) / fastestGames.length : 0

console.log(`⏱  TEMPO GRY & PS`)
console.log(`${'─'.repeat(70)}`)
console.log(`  Avg rund:            ${avgRounds.toFixed(1)} (min: ${Math.min(...completed.map(r => r.rounds))}, max: ${Math.max(...completed.map(r => r.rounds))})`)
console.log(`  Avg zabójstw/grę:    ${avgKills.toFixed(1)}`)
console.log(`  Avg PS zwycięzcy:    ${avgPS.toFixed(1)}`)
console.log(`  Avg PS przegranego:  ${avgLoserPS.toFixed(1)}`)
console.log(`  Najszybsze 10 PS:    runda ${fastestPSround || '—'}`)
console.log(`  Avg runda 10 PS:     ${avgFastestPS > 0 ? avgFastestPS.toFixed(1) : '—'}`)
console.log()

// ===========================================================================
// 3) ŻNIWO DUSZ & ŁUPIENIE
// ===========================================================================
const totalHarvests = completed.reduce((s, r) => s + r.p1SoulHarvests + r.p2SoulHarvests, 0)
const totalPlunders = completed.reduce((s, r) => s + r.p1PlunderCount + r.p2PlunderCount, 0)
const totalEnhanced = completed.reduce((s, r) => s + r.p1EnhancedUsed + r.p2EnhancedUsed, 0)

// Enhanced vs win correlation
const enhancedWins = withWinner.filter(r => {
  const winnerEnhanced = r.winner === 'player1' ? r.p1EnhancedUsed : r.p2EnhancedUsed
  const loserEnhanced = r.winner === 'player1' ? r.p2EnhancedUsed : r.p1EnhancedUsed
  return winnerEnhanced > loserEnhanced
}).length

console.log(`🔮  ŻNIWO DUSZ / ŁUPIENIE / ULEPSZENIA`)
console.log(`${'─'.repeat(70)}`)
console.log(`  Soul Harvest PS:     ${totalHarvests} total (${(totalHarvests / (completed.length || 1)).toFixed(2)} / grę)`)
console.log(`  Łupienia:            ${totalPlunders} total (${(totalPlunders / (completed.length || 1)).toFixed(2)} / grę)`)
console.log(`  Ulepszenia (enh.):   ${totalEnhanced} total (${(totalEnhanced / (completed.length || 1)).toFixed(2)} / grę)`)
console.log(`  Więcej ulepszeń → wygrana:  ${enhancedWins}/${withWinner.length} (${(enhancedWins / (withWinner.length || 1) * 100).toFixed(0)}%)`)
console.log()

// ===========================================================================
// 4) TRUDNOŚĆ ZDOBYCIA 10 PS
// ===========================================================================
const psDistribution = withWinner.map(r => {
  const wGold = r.winner === 'player1' ? r.p1Gold : r.p2Gold
  const lGold = r.winner === 'player1' ? r.p2Gold : r.p1Gold
  return { wGold, lGold, rounds: r.rounds }
})

const psRanges = [
  { label: '10+ PS', count: psDistribution.filter(d => d.wGold >= 10).length },
  { label: '7-9 PS', count: psDistribution.filter(d => d.wGold >= 7 && d.wGold < 10).length },
  { label: '5-6 PS', count: psDistribution.filter(d => d.wGold >= 5 && d.wGold < 7).length },
  { label: '< 5 PS', count: psDistribution.filter(d => d.wGold < 5).length },
]

console.log(`🎯  DYSTRYBUCJA PS ZWYCIĘZCY`)
console.log(`${'─'.repeat(70)}`)
for (const r of psRanges) {
  const bar = '█'.repeat(Math.round(r.count / (withWinner.length || 1) * 40))
  console.log(`  ${r.label.padEnd(10)} ${String(r.count).padStart(4)} (${(r.count / (withWinner.length || 1) * 100).toFixed(0).padStart(3)}%) ${bar}`)
}
console.log()

// ===========================================================================
// 5) POPSUTE / OP / SŁABE KARTY
// ===========================================================================
const allCards = [...cardStatsMap.values()].filter(c => c.timesDrawn >= Math.max(5, GAME_COUNT * 0.05))

const opCards = allCards.filter(c => c.gamesWonWhenDrawn / (c.timesDrawn || 1) > 0.62).sort((a, b) =>
  (b.gamesWonWhenDrawn / (b.timesDrawn || 1)) - (a.gamesWonWhenDrawn / (a.timesDrawn || 1)))

if (opCards.length > 0) {
  console.log(`🔴  OP KARTY (WR > 62%)`)
  console.log(`${'─'.repeat(70)}`)
  console.log(`  ${'Karta'.padEnd(22)} ${'Dom'.padEnd(6)} ${'ATK'.padStart(4)} ${'DEF'.padStart(4)} ${'SV'.padStart(3)} ${'WR%'.padStart(5)} ${'Gier'.padStart(5)} ${'W'.padStart(4)} ${'Efekt'.padEnd(20)}`)
  for (const c of opCards.slice(0, 15)) {
    const wr = (c.gamesWonWhenDrawn / (c.timesDrawn || 1) * 100).toFixed(0)
    console.log(`  ${c.name.slice(0, 21).padEnd(22)} ${c.domain.slice(0, 5).padEnd(6)} ${String(c.baseAtk).padStart(4)} ${String(c.baseDef).padStart(4)} ${String(c.soulValue).padStart(3)} ${(wr + '%').padStart(5)} ${String(c.timesDrawn).padStart(5)} ${String(c.gamesWonWhenDrawn).padStart(4)} ${c.effectId.slice(0, 20)}`)
  }
  console.log()
}

const weakCards = allCards.filter(c => c.gamesWonWhenDrawn / (c.timesDrawn || 1) < 0.35).sort((a, b) =>
  (a.gamesWonWhenDrawn / (a.timesDrawn || 1)) - (b.gamesWonWhenDrawn / (b.timesDrawn || 1)))

if (weakCards.length > 0) {
  console.log(`🔵  SŁABE KARTY (WR < 35%)`)
  console.log(`${'─'.repeat(70)}`)
  console.log(`  ${'Karta'.padEnd(22)} ${'Dom'.padEnd(6)} ${'ATK'.padStart(4)} ${'DEF'.padStart(4)} ${'SV'.padStart(3)} ${'WR%'.padStart(5)} ${'Gier'.padStart(5)} ${'Die'.padStart(4)} ${'Efekt'.padEnd(20)}`)
  for (const c of weakCards.slice(0, 20)) {
    const wr = (c.gamesWonWhenDrawn / (c.timesDrawn || 1) * 100).toFixed(0)
    console.log(`  ${c.name.slice(0, 21).padEnd(22)} ${c.domain.slice(0, 5).padEnd(6)} ${String(c.baseAtk).padStart(4)} ${String(c.baseDef).padStart(4)} ${String(c.soulValue).padStart(3)} ${(wr + '%').padStart(5)} ${String(c.timesDrawn).padStart(5)} ${String(c.totalDeaths).padStart(4)} ${c.effectId.slice(0, 20)}`)
  }
  console.log()
}

// Survival ratio — cards that die almost every time they're played
const fragile = [...cardStatsMap.values()]
  .filter(c => c.timesPlayed >= 5 && c.totalDeaths / c.timesPlayed > 0.85)
  .sort((a, b) => (b.totalDeaths / b.timesPlayed) - (a.totalDeaths / a.timesPlayed))

if (fragile.length > 0) {
  console.log(`💀  KRUCHE KARTY (giną >85% czasu)`)
  console.log(`${'─'.repeat(70)}`)
  console.log(`  ${'Karta'.padEnd(22)} ${'Dom'.padEnd(6)} ${'DEF'.padStart(4)} ${'Play'.padStart(5)} ${'Die'.padStart(4)} ${'%Die'.padStart(5)}`)
  for (const c of fragile.slice(0, 10)) {
    const dieRate = (c.totalDeaths / c.timesPlayed * 100).toFixed(0)
    console.log(`  ${c.name.slice(0, 21).padEnd(22)} ${c.domain.slice(0, 5).padEnd(6)} ${String(c.baseDef).padStart(4)} ${String(c.timesPlayed).padStart(5)} ${String(c.totalDeaths).padStart(4)} ${(dieRate + '%').padStart(5)}`)
  }
  console.log()
}

// ===========================================================================
// 6) PEŁNY RANKING
// ===========================================================================
const ranked = [...cardStatsMap.values()]
  .filter(c => c.timesDrawn >= 2)
  .sort((a, b) => (b.gamesWonWhenDrawn / (b.timesDrawn || 1)) - (a.gamesWonWhenDrawn / (a.timesDrawn || 1)))

console.log(`📋  PEŁNY RANKING`)
console.log(`${'─'.repeat(80)}`)
console.log(`  ${'#'.padStart(3)} ${'Karta'.padEnd(22)} ${'Dom'.padEnd(6)} ${'A/D'.padStart(5)} ${'WR%'.padStart(5)} ${'Gier'.padStart(5)} ${'W'.padStart(4)} ${'L'.padStart(4)} ${'Play'.padStart(5)} ${'Die'.padStart(4)} ${'SV'.padStart(3)}`)

for (let i = 0; i < ranked.length; i++) {
  const c = ranked[i]
  const wr = (c.gamesWonWhenDrawn / (c.timesDrawn || 1) * 100).toFixed(0)
  const flag = Number(wr) > 62 ? ' 🔴' : Number(wr) < 35 ? ' 🔵' : ''
  console.log(`  ${String(i + 1).padStart(3)} ${c.name.slice(0, 21).padEnd(22)} ${c.domain.slice(0, 5).padEnd(6)} ${(c.baseAtk + '/' + c.baseDef).padStart(5)} ${(wr + '%').padStart(5)} ${String(c.timesDrawn).padStart(5)} ${String(c.gamesWonWhenDrawn).padStart(4)} ${String(c.gamesLostWhenDrawn).padStart(4)} ${String(c.timesPlayed).padStart(5)} ${String(c.totalDeaths).padStart(4)} ${String(c.soulValue).padStart(3)}${flag}`)
}

// ===========================================================================
// PODSUMOWANIE
// ===========================================================================
console.log(`\n${'═'.repeat(80)}`)
console.log(`✅  Symulacja: ${GAME_COUNT} gier w ${elapsed}s | AI: ${AI_DIFFICULTY}`)
console.log(`    Zakończone: ${withWinner.length} | PS wins: ${psWins} | Elim wins: ${elimWins} | Timeouts: ${timeouts}`)
console.log(`    Avg rund: ${avgRounds.toFixed(1)} | Avg PS zwycięzcy: ${avgPS.toFixed(1)} | Najszybsze 10PS: runda ${fastestPSround || '—'}`)
console.log(`    Kart w rankingu: ${ranked.length}`)
// ===========================================================================
// 7) ANALIZA TIMEOUTÓW
// ===========================================================================
const timeoutGames = results.filter(r => r.winMethod === 'timeout')
if (timeoutGames.length > 0) {
  console.log(`⏰  ANALIZA TIMEOUTÓW (${timeoutGames.length} gier)`)
  console.log(`${'─'.repeat(70)}`)
  const avgTOps = timeoutGames.reduce((s, r) => s + Math.max(r.p1Gold, r.p2Gold), 0) / timeoutGames.length
  const avgTOkills = timeoutGames.reduce((s, r) => s + r.p1Kills + r.p2Kills, 0) / timeoutGames.length
  const avgTOharvests = timeoutGames.reduce((s, r) => s + r.p1SoulHarvests + r.p2SoulHarvests, 0) / timeoutGames.length
  console.log(`  Avg max PS w timeout:    ${avgTOps.toFixed(1)} (cel: 10)`)
  console.log(`  Avg zabójstw w timeout:  ${avgTOkills.toFixed(1)}`)
  console.log(`  Avg soul harvest PS:     ${avgTOharvests.toFixed(1)}`)
  // PS distribution in timeouts
  const to9 = timeoutGames.filter(r => Math.max(r.p1Gold, r.p2Gold) >= 9).length
  const to8 = timeoutGames.filter(r => Math.max(r.p1Gold, r.p2Gold) >= 8).length
  const to7 = timeoutGames.filter(r => Math.max(r.p1Gold, r.p2Gold) >= 7).length
  console.log(`  Bliskie (≥9 PS):         ${to9}/${timeoutGames.length}`)
  console.log(`  Bliskie (≥8 PS):         ${to8}/${timeoutGames.length}`)
  console.log(`  Bliskie (≥7 PS):         ${to7}/${timeoutGames.length}`)
  console.log()
}

console.log(`${'═'.repeat(80)}\n`)
