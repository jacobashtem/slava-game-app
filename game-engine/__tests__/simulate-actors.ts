#!/usr/bin/env npx tsx
/**
 * Actor-based Balance Simulation — different strategies face each other.
 *
 * Usage:
 *   npm run balance:actors              # 50 games per matchup
 *   npm run balance:actors -- 100       # 100 games per matchup
 *
 * Actors (strategies):
 *   1. OSZCZĘDNY   — never enhances, hoards PS
 *   2. ULEPSZACZ   — enhances aggressively, spends PS freely
 *   3. ZBALANSOWANY — enhances when PS ≥ 4, stops at ≥ 8
 *   4. GRABIEŻCA   — prioritizes field clearance + plunder
 *   5. DOMYŚLNY    — current hard AI (baseline)
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { GameState, PlayerSide, CardInstance } from '../types'
import { GamePhase, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'

const args = process.argv.slice(2)
const GAMES_PER_MATCHUP = parseInt(args[0] || '50', 10)
const MAX_TURNS = 150

// ---------------------------------------------------------------------------
// Strategy definitions
// ---------------------------------------------------------------------------

interface Strategy {
  name: string
  short: string
  /** Should AI use enhanced adventure? Called with current PS and game state */
  shouldEnhance: (ps: number, state: GameState, side: PlayerSide) => boolean
  /** Should AI skip attack if exchange is bad? Lower = more aggressive */
  attackSkipThreshold: number
  /** Should AI prioritize plunder over normal attacks? */
  aggressivePlunder: boolean
}

const STRATEGIES: Strategy[] = [
  {
    name: 'Oszczędny',
    short: 'OSZ',
    shouldEnhance: () => false, // NIGDY nie ulepsza
    attackSkipThreshold: -30,
    aggressivePlunder: false,
  },
  {
    name: 'Ulepszacz',
    short: 'ULE',
    shouldEnhance: (ps) => ps >= 1, // ulepsza ZAWSZE gdy stać
    attackSkipThreshold: -30,
    aggressivePlunder: false,
  },
  {
    name: 'Zbalansowany',
    short: 'ZBA',
    shouldEnhance: (ps) => ps >= 4 && ps < 8, // ulepsza w środku, oszczędza bliżej celu
    attackSkipThreshold: -30,
    aggressivePlunder: false,
  },
  {
    name: 'Grabieżca',
    short: 'GRA',
    shouldEnhance: (ps) => ps >= 3 && ps < 9,
    attackSkipThreshold: -10, // bardziej agresywny — atakuje nawet złe wymiany
    aggressivePlunder: true,  // priorytetyzuje czyszczenie pola + łupienie
  },
  {
    name: 'Domyślny Hard',
    short: 'HAR',
    shouldEnhance: (ps) => ps >= 2 && ps < 9, // obecna hard AI + fix na 9 PS
    attackSkipThreshold: -30,
    aggressivePlunder: false,
  },
]

// ---------------------------------------------------------------------------
// Game result
// ---------------------------------------------------------------------------

interface GameResult {
  winner: PlayerSide | null
  winMethod: 'ps' | 'elimination' | 'timeout'
  rounds: number
  p1Gold: number; p2Gold: number
  p1Kills: number; p2Kills: number
  p1Enhanced: number; p2Enhanced: number
  p1Plunders: number; p2Plunders: number
}

// ---------------------------------------------------------------------------
// Simulation with strategy overrides
// ---------------------------------------------------------------------------

function simulateGame(s1: Strategy, s2: Strategy): GameResult {
  const engine = new GameEngine()
  const ai1 = new AIPlayer('player1', 'hard')
  const ai2 = new AIPlayer('player2', 'hard')
  let state = engine.startAlphaGame()
  let turnCount = 0

  let p1Enh = 0, p2Enh = 0, p1Plun = 0, p2Plun = 0
  let lastLogLen = 0

  function analyzeLogs(s: GameState) {
    for (let i = lastLogLen; i < s.actionLog.length; i++) {
      const msg = s.actionLog[i].message
      if (msg.includes('wzmocnion') || msg.includes('enhanced')) {
        if (msg.startsWith('Ty') || msg.includes('player1')) p1Enh++; else p2Enh++
      }
      if (msg.includes('ŁUPIENIE')) {
        if (msg.startsWith('Ty') || msg.includes('player1')) p1Plun++; else p2Plun++
      }
    }
    lastLogLen = s.actionLog.length
  }

  function autoResolve() {
    let g = 0
    while (state.pendingInteraction && g++ < 10) {
      try {
        const ch = state.pendingInteraction.availableChoices?.[0]
          ?? state.pendingInteraction.availableTargetIds?.[0] ?? 'yes'
        state = engine.resolvePendingInteraction(ch)
        engine.lastCombatResult = null
      } catch { break }
    }
  }

  try {
    while (!state.winner && turnCount < MAX_TURNS) {
      turnCount++
      const side = state.currentTurn
      const ai = side === 'player1' ? ai1 : ai2
      const strat = side === 'player1' ? s1 : s2
      const ps = state.gameMode === 'slava' ? state.players[side].glory : state.players[side].gold

      try { if (engine.getCurrentPhase() === GamePhase.START) state = engine.sideAdvancePhase(side) } catch {}

      let decisions
      try { decisions = ai.planTurn(engine.getState()) }
      catch { decisions = [{ type: 'end_turn' as const }] }

      const playActions = decisions.filter(d =>
        d.type === 'play_creature' || d.type === 'play_adventure' ||
        d.type === 'change_position' || d.type === 'activate_effect')
      const combatActions = decisions.filter(d => d.type === 'attack')
      const wantsPlunder = decisions.some(d => d.type === 'plunder')

      // PLAY phase — apply strategy overrides
      for (const d of playActions) {
        if (state.winner) break
        try {
          if (d.type === 'play_adventure' && d.cardInstanceId) {
            // Strategy override: should we enhance?
            const advCard = state.players[side].hand.find(c => c.instanceId === d.cardInstanceId)
            const hasEnhanced = (advCard?.cardData as any)?.enhancedEffectId
            const useEnh = hasEnhanced && strat.shouldEnhance(ps, state, side)
            state = engine.sidePlayAdventure(side, d.cardInstanceId, d.targetInstanceId, useEnh)
          } else if (d.type === 'play_creature' && d.cardInstanceId && d.targetLine !== undefined) {
            state = engine.sidePlayCreature(side, d.cardInstanceId, d.targetLine, undefined, true)
          } else if (d.type === 'change_position' && d.cardInstanceId && d.targetPosition !== undefined) {
            state = engine.sideChangePosition(side, d.cardInstanceId, d.targetPosition)
          } else if (d.type === 'activate_effect' && d.cardInstanceId) {
            // Strategy: don't spend PS on activation when close to winning
            const activationCost = (() => {
              const eff = (d.cardInstanceId && state.players[side].field)
                ? null : null // simplified
              return 0
            })()
            state = engine.sideActivateEffect(side, d.cardInstanceId, d.targetInstanceId)
          }
        } catch {}
        autoResolve()
      }

      // COMBAT phase
      if (combatActions.length > 0 && !state.winner) {
        try { if (engine.getCurrentPhase() === GamePhase.PLAY) state = engine.sideAdvancePhase(side) } catch {}
        for (const d of combatActions) {
          if (state.winner) break
          try {
            if (d.cardInstanceId && d.targetInstanceId)  {
              state = engine.sideAttack(side, d.cardInstanceId, d.targetInstanceId)
              engine.lastCombatResult = null
            }
          } catch {}
          autoResolve()
        }
      }

      // Plunder
      if ((wantsPlunder || strat.aggressivePlunder) && !state.winner && state.roundNumber >= 3) {
        const enemySide = side === 'player1' ? 'player2' : 'player1'
        if (getAllCreaturesOnField(state, enemySide).length === 0) {
          try { state = engine.sidePlunder(side) } catch {}
        }
      }

      if (!state.winner) {
        try { state = engine.sideEndTurn(side) }
        catch { try { state = engine.forcePlayerTurn(side === 'player1' ? 'player2' : 'player1') } catch { break } }
      }
      state = engine.getState()
      analyzeLogs(state)
    }
  } catch {}

  let winMethod: GameResult['winMethod'] = 'timeout'
  if (state.winner) {
    winMethod = state.players[state.winner].gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET ? 'ps' : 'elimination'
  }

  return {
    winner: state.winner, winMethod, rounds: state.roundNumber,
    p1Gold: state.players.player1.gold, p2Gold: state.players.player2.gold,
    p1Kills: state.players.player1.trophies.length, p2Kills: state.players.player2.trophies.length,
    p1Enhanced: p1Enh, p2Enhanced: p2Enh, p1Plunders: p1Plun, p2Plunders: p2Plun,
  }
}

// ---------------------------------------------------------------------------
// Run all matchups
// ---------------------------------------------------------------------------

console.log(`\n⚔  SŁAWA — Actor-based Balance Simulation`)
console.log(`   ${GAMES_PER_MATCHUP} gier per matchup | ${STRATEGIES.length} aktorów | ${STRATEGIES.length * (STRATEGIES.length)} matchupów`)
console.log(`${'═'.repeat(76)}\n`)

interface MatchupResult {
  s1: Strategy; s2: Strategy
  s1Wins: number; s2Wins: number; timeouts: number; total: number
  avgRounds: number
  s1AvgPS: number; s2AvgPS: number
  s1AvgEnh: number; s2AvgEnh: number
  s1AvgPlun: number; s2AvgPlun: number
}

const matchups: MatchupResult[] = []
const stratWins: Record<string, number> = {}
const stratGames: Record<string, number> = {}
const stratTimeouts: Record<string, number> = {}
for (const s of STRATEGIES) { stratWins[s.short] = 0; stratGames[s.short] = 0; stratTimeouts[s.short] = 0 }

let totalMatchups = 0
const totalCombinations = STRATEGIES.length * STRATEGIES.length
const startTime = Date.now()

for (const s1 of STRATEGIES) {
  for (const s2 of STRATEGIES) {
    totalMatchups++
    process.stdout.write(`  [${totalMatchups}/${totalCombinations}] ${s1.short} vs ${s2.short}...`)

    const results: GameResult[] = []
    for (let i = 0; i < GAMES_PER_MATCHUP; i++) {
      results.push(simulateGame(s1, s2))
    }

    const completed = results.filter(r => r.winner)
    const s1w = completed.filter(r => r.winner === 'player1').length
    const s2w = completed.filter(r => r.winner === 'player2').length
    const to = results.filter(r => r.winMethod === 'timeout').length

    matchups.push({
      s1, s2, s1Wins: s1w, s2Wins: s2w, timeouts: to, total: GAMES_PER_MATCHUP,
      avgRounds: results.reduce((s, r) => s + r.rounds, 0) / results.length,
      s1AvgPS: results.reduce((s, r) => s + r.p1Gold, 0) / results.length,
      s2AvgPS: results.reduce((s, r) => s + r.p2Gold, 0) / results.length,
      s1AvgEnh: results.reduce((s, r) => s + r.p1Enhanced, 0) / results.length,
      s2AvgEnh: results.reduce((s, r) => s + r.p2Enhanced, 0) / results.length,
      s1AvgPlun: results.reduce((s, r) => s + r.p1Plunders, 0) / results.length,
      s2AvgPlun: results.reduce((s, r) => s + r.p2Plunders, 0) / results.length,
    })

    stratWins[s1.short] += s1w; stratWins[s2.short] += s2w
    stratGames[s1.short] += GAMES_PER_MATCHUP; stratGames[s2.short] += GAMES_PER_MATCHUP
    stratTimeouts[s1.short] += to; stratTimeouts[s2.short] += to

    const wr = completed.length > 0 ? (s1w / completed.length * 100).toFixed(0) : '?'
    process.stdout.write(` ${s1.short} ${wr}% | TO: ${to}\n`)
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

// ---------------------------------------------------------------------------
// Matrix output
// ---------------------------------------------------------------------------

console.log(`\n📊  MACIERZ WYGRANYCH (% wygranych P1/wiersz vs P2/kolumna)`)
console.log(`${'═'.repeat(76)}`)

// Header
process.stdout.write('  '.padEnd(16))
for (const s of STRATEGIES) process.stdout.write(s.short.padStart(8))
console.log()
process.stdout.write('  '.padEnd(16))
for (const _ of STRATEGIES) process.stdout.write('────────')
console.log()

for (const s1 of STRATEGIES) {
  process.stdout.write(`  ${s1.name.slice(0, 13).padEnd(14)}`)
  for (const s2 of STRATEGIES) {
    const m = matchups.find(m => m.s1.short === s1.short && m.s2.short === s2.short)!
    const completed = m.s1Wins + m.s2Wins
    const wr = completed > 0 ? (m.s1Wins / completed * 100).toFixed(0) : '—'
    const flag = Number(wr) >= 60 ? '🟢' : Number(wr) <= 40 ? '🔴' : '  '
    process.stdout.write(`${flag}${wr.padStart(4)}% `)
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Overall strategy ranking
// ---------------------------------------------------------------------------

console.log(`\n🏆  RANKING STRATEGII (ogólny win rate)`)
console.log(`${'═'.repeat(76)}`)
console.log(`  ${'#'.padStart(2)} ${'Strategia'.padEnd(18)} ${'WR%'.padStart(6)} ${'Wygr'.padStart(6)} ${'Gier'.padStart(6)} ${'Timeout'.padStart(8)} ${'Opis'}`)

const ranking = STRATEGIES
  .map(s => ({
    ...s,
    wr: stratWins[s.short] / (stratGames[s.short] - stratTimeouts[s.short] || 1) * 100,
    wins: stratWins[s.short],
    games: stratGames[s.short],
    to: stratTimeouts[s.short],
  }))
  .sort((a, b) => b.wr - a.wr)

for (let i = 0; i < ranking.length; i++) {
  const r = ranking[i]
  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '
  console.log(`${medal}${String(i + 1).padStart(2)} ${r.name.padEnd(18)} ${r.wr.toFixed(1).padStart(5)}% ${String(r.wins).padStart(6)} ${String(r.games).padStart(6)} ${String(r.to).padStart(8)}`)
}

// ---------------------------------------------------------------------------
// Per-matchup details
// ---------------------------------------------------------------------------

console.log(`\n📋  SZCZEGÓŁY MATCHUPÓW`)
console.log(`${'═'.repeat(76)}`)
console.log(`  ${'Matchup'.padEnd(20)} ${'WR P1'.padStart(6)} ${'Rund'.padStart(6)} ${'PS P1'.padStart(6)} ${'PS P2'.padStart(6)} ${'Enh1'.padStart(6)} ${'Enh2'.padStart(6)} ${'Łup1'.padStart(6)} ${'Łup2'.padStart(6)} ${'TO'.padStart(4)}`)

for (const m of matchups) {
  const completed = m.s1Wins + m.s2Wins
  const wr = completed > 0 ? (m.s1Wins / completed * 100).toFixed(0) : '—'
  const label = `${m.s1.short} vs ${m.s2.short}`
  console.log(`  ${label.padEnd(20)} ${(wr + '%').padStart(6)} ${m.avgRounds.toFixed(0).padStart(6)} ${m.s1AvgPS.toFixed(1).padStart(6)} ${m.s2AvgPS.toFixed(1).padStart(6)} ${m.s1AvgEnh.toFixed(1).padStart(6)} ${m.s2AvgEnh.toFixed(1).padStart(6)} ${m.s1AvgPlun.toFixed(1).padStart(6)} ${m.s2AvgPlun.toFixed(1).padStart(6)} ${String(m.timeouts).padStart(4)}`)
}

console.log(`\n${'═'.repeat(76)}`)
console.log(`✅  Symulacja aktorów: ${totalCombinations} matchupów × ${GAMES_PER_MATCHUP} gier = ${totalCombinations * GAMES_PER_MATCHUP} gier w ${elapsed}s`)
console.log(`${'═'.repeat(76)}\n`)
