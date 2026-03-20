#!/usr/bin/env npx tsx
/**
 * Mechanics Testing Tool — symuluje gry z konfigurowalnymi zasadami.
 *
 * Pozwala testować wpływ zmian mechanik na:
 * - Długość gier (avg rounds)
 * - Proporcję PS win vs eliminacja
 * - Czy ulepszenia (enhanced) są używane i opłacalne
 * - Jak szybko gracze zdobywają PS
 *
 * Usage:
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --ps-target 12
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --soul-threshold 15
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --enhanced-cost 2
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --starting-gold 3
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --games 200 --budget 100
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --no-enhanced
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --elimination-only
 *   npx tsx game-engine/__tests__/simulate-mechanics.ts --compare  (run default + variants)
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { GameState, PlayerSide } from '../types'
import { GamePhase, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'

// ===== CLI ARGS =====

const args = process.argv.slice(2)
function getFlag(name: string, def: string): string {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : def
}
function hasFlag(name: string): boolean { return args.includes(`--${name}`) }

const GAMES = parseInt(getFlag('games', '100'), 10)
const BUDGET_MS = parseInt(getFlag('budget', '100'), 10)
const PS_TARGET = parseInt(getFlag('ps-target', String(GOLD_EDITION_RULES.GLORY_WIN_TARGET)), 10)
const SOUL_THRESHOLD = parseInt(getFlag('soul-threshold', String(GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD)), 10)
const ENHANCED_COST = parseInt(getFlag('enhanced-cost', String(GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST)), 10)
const STARTING_GOLD = parseInt(getFlag('starting-gold', String(GOLD_EDITION_RULES.STARTING_GOLD)), 10)
const NO_ENHANCED = hasFlag('no-enhanced')
const ELIMINATION_ONLY = hasFlag('elimination-only')
const COMPARE_MODE = hasFlag('compare')
const MAX_TURNS = 200

// ===== TYPES =====

interface MechanicsResult {
  config: {
    psTarget: number
    soulThreshold: number
    enhancedCost: number
    startingGold: number
    noEnhanced: boolean
    eliminationOnly: boolean
    games: number
    budgetMs: number
  }
  results: {
    gamesPlayed: number
    p1Wins: number
    p2Wins: number
    timeouts: number
    avgRounds: number
    medianRounds: number
    psWins: number
    elimWins: number
    goldLossWins: number  // wins via opponent hitting 0 gold
    avgWinnerPS: number
    avgLoserPS: number
    avgSoulHarvests: number  // avg soul harvests per game
    enhancedPlayed: number   // total enhanced adventures played
    avgEnhancedPerGame: number
    roundDistribution: Record<string, number>  // '1-10': count, '11-20': count, etc.
  }
}

// ===== PATCHING RULES =====

function patchRules(rules: typeof GOLD_EDITION_RULES, config: MechanicsResult['config']): void {
  // @ts-expect-error — mutating const for testing
  rules.GLORY_WIN_TARGET = config.psTarget
  // @ts-expect-error
  rules.SOUL_HARVEST_THRESHOLD = config.soulThreshold
  // @ts-expect-error
  rules.ENHANCED_ADVENTURE_COST = config.enhancedCost
  // @ts-expect-error
  rules.STARTING_GOLD = config.startingGold
}

function restoreRules(): void {
  // @ts-expect-error
  GOLD_EDITION_RULES.GLORY_WIN_TARGET = 10
  // @ts-expect-error
  GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD = 20
  // @ts-expect-error
  GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST = 1
  // @ts-expect-error
  GOLD_EDITION_RULES.STARTING_GOLD = 5
}

// ===== SIMULATION =====

function simulateGame(config: MechanicsResult['config']): {
  winner: PlayerSide | null
  rounds: number
  winMethod: 'ps' | 'elimination' | 'gold_loss' | 'timeout'
  p1Gold: number
  p2Gold: number
  soulHarvests: number
  enhancedCount: number
} {
  const engine = new GameEngine()
  const ai1 = new AIPlayer('player1', 'novice', config.budgetMs)
  const ai2 = new AIPlayer('player2', 'novice', config.budgetMs)
  ai1.resetGame(); ai2.resetGame()

  let state = engine.startAlphaGame()
  let turns = 0
  let soulHarvests = 0
  let enhancedCount = 0
  const prevSP = [0, 0]

  while (!state.winner && turns < MAX_TURNS) {
    const side = state.currentTurn
    const ai = side === 'player1' ? ai1 : ai2
    const decisions = ai.planTurn(state)

    for (const d of decisions) {
      try {
        switch (d.type) {
          case 'play_creature':
            if (d.cardInstanceId && d.targetLine !== undefined)
              state = engine.sidePlayCreature(side, d.cardInstanceId, d.targetLine, undefined, true)
            break
          case 'play_adventure':
            if (d.cardInstanceId) {
              const useEnh = !config.noEnhanced && ((d as any).useEnhanced ?? false)
              state = engine.sidePlayAdventure(side, d.cardInstanceId, d.targetInstanceId, useEnh, true)
              if (useEnh) enhancedCount++
            }
            break
          case 'attack':
            if (d.cardInstanceId && d.targetInstanceId) {
              if (engine.getCurrentPhase() === GamePhase.PLAY)
                state = engine.sideAdvancePhase(side)
              state = engine.sideAttack(side, d.cardInstanceId, d.targetInstanceId)
              engine.lastCombatResult = null
            }
            break
          case 'change_position':
            if (d.cardInstanceId && d.targetPosition !== undefined)
              state = engine.sideChangePosition(side, d.cardInstanceId, d.targetPosition)
            break
          case 'activate_effect':
            if (d.cardInstanceId)
              state = engine.sideActivateEffect(side, d.cardInstanceId, d.targetInstanceId)
            break
          case 'advance_to_combat':
            if (engine.getCurrentPhase() === GamePhase.PLAY)
              state = engine.sideAdvancePhase(side)
            break
          case 'plunder':
            state = engine.sidePlunder(side)
            break
          case 'end_turn':
            state = engine.sideEndTurn(side)
            break
        }
        // Auto-resolve interactions
        let s2 = engine.getState()
        let guard = 0
        while (s2.pendingInteraction && guard++ < 10) {
          const c = s2.pendingInteraction.availableChoices?.[0] ?? s2.pendingInteraction.availableTargetIds?.[0] ?? 'yes'
          engine.resolvePendingInteraction(c)
          engine.lastCombatResult = null
          s2 = engine.getState()
        }
        state = engine.getState()
      } catch {}
    }

    // Track soul harvests
    const sideNum = side === 'player1' ? 0 : 1
    const currentSP = state.players[side].soulPoints
    if (currentSP < prevSP[sideNum]!) soulHarvests++ // SP dropped = harvest happened
    prevSP[sideNum] = currentSP

    turns++
    if (state.winner) break
  }

  // Determine win method
  let winMethod: 'ps' | 'elimination' | 'gold_loss' | 'timeout' = 'timeout'
  if (state.winner) {
    const wGold = state.players[state.winner].gold
    const lSide = state.winner === 'player1' ? 'player2' : 'player1'
    const lGold = state.players[lSide].gold
    if (lGold <= 0) winMethod = 'gold_loss'
    else if (wGold >= config.psTarget) winMethod = 'ps'
    else winMethod = 'elimination'
  }

  return {
    winner: state.winner,
    rounds: state.roundNumber,
    winMethod,
    p1Gold: state.players.player1.gold,
    p2Gold: state.players.player2.gold,
    soulHarvests,
    enhancedCount,
  }
}

function runScenario(config: MechanicsResult['config']): MechanicsResult {
  patchRules(GOLD_EDITION_RULES, config)

  const rounds: number[] = []
  let p1Wins = 0, p2Wins = 0, timeouts = 0
  let psWins = 0, elimWins = 0, goldLossWins = 0
  let totalWinnerPS = 0, totalLoserPS = 0, decidedGames = 0
  let totalHarvests = 0, totalEnhanced = 0

  const t0 = Date.now()
  for (let i = 0; i < config.games; i++) {
    const result = simulateGame(config)
    rounds.push(result.rounds)
    totalHarvests += result.soulHarvests
    totalEnhanced += result.enhancedCount

    if (result.winner === 'player1') p1Wins++
    else if (result.winner === 'player2') p2Wins++
    else timeouts++

    if (result.winner) {
      decidedGames++
      if (result.winMethod === 'ps') psWins++
      else if (result.winMethod === 'gold_loss') goldLossWins++
      else elimWins++
      totalWinnerPS += Math.max(result.p1Gold, result.p2Gold)
      totalLoserPS += Math.min(result.p1Gold, result.p2Gold)
    }

    if ((i + 1) % 10 === 0) {
      process.stderr.write(`  [${i + 1}/${config.games}] ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  // Round distribution
  const dist: Record<string, number> = {}
  for (const r of rounds) {
    const bucket = r <= 10 ? '1-10' : r <= 20 ? '11-20' : r <= 30 ? '21-30' : r <= 40 ? '31-40' : '41+'
    dist[bucket] = (dist[bucket] ?? 0) + 1
  }

  // Median
  const sorted = [...rounds].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!

  restoreRules()

  return {
    config,
    results: {
      gamesPlayed: config.games,
      p1Wins,
      p2Wins,
      timeouts,
      avgRounds: rounds.reduce((a, b) => a + b, 0) / rounds.length,
      medianRounds: median,
      psWins,
      elimWins,
      goldLossWins,
      avgWinnerPS: decidedGames > 0 ? totalWinnerPS / decidedGames : 0,
      avgLoserPS: decidedGames > 0 ? totalLoserPS / decidedGames : 0,
      avgSoulHarvests: totalHarvests / config.games,
      enhancedPlayed: totalEnhanced,
      avgEnhancedPerGame: totalEnhanced / config.games,
      roundDistribution: dist,
    },
  }
}

// ===== OUTPUT =====

function printResult(label: string, r: MechanicsResult): void {
  const R = r.results
  const C = r.config
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`📊  ${label}`)
  console.log(`${'─'.repeat(70)}`)
  console.log(`  Config: PS=${C.psTarget} | Soul=${C.soulThreshold} | Enhanced=${C.noEnhanced ? 'OFF' : `${C.enhancedCost}PS`} | Start=${C.startingGold} | ${C.eliminationOnly ? 'ELIM ONLY' : 'PS+ELIM'}`)
  console.log(`  Games: ${R.gamesPlayed} | Budget: ${C.budgetMs}ms`)
  console.log(`${'─'.repeat(70)}`)
  console.log(`  Avg Rounds:    ${R.avgRounds.toFixed(1)} (median ${R.medianRounds})`)
  console.log(`  PS Wins:       ${R.psWins} (${(R.psWins / R.gamesPlayed * 100).toFixed(0)}%)`)
  console.log(`  Elim Wins:     ${R.elimWins} (${(R.elimWins / R.gamesPlayed * 100).toFixed(0)}%)`)
  console.log(`  Gold=0 Wins:   ${R.goldLossWins} (${(R.goldLossWins / R.gamesPlayed * 100).toFixed(0)}%)`)
  console.log(`  Timeouts:      ${R.timeouts} (${(R.timeouts / R.gamesPlayed * 100).toFixed(0)}%)`)
  console.log(`  Avg PS Winner: ${R.avgWinnerPS.toFixed(1)} | Loser: ${R.avgLoserPS.toFixed(1)}`)
  console.log(`  Soul Harvests: ${R.avgSoulHarvests.toFixed(1)}/game`)
  console.log(`  Enhanced:      ${R.avgEnhancedPerGame.toFixed(1)}/game (${R.enhancedPlayed} total)`)
  console.log(`  Round Distribution:`)
  for (const [bucket, count] of Object.entries(R.roundDistribution).sort()) {
    const bar = '█'.repeat(Math.round(count / R.gamesPlayed * 40))
    console.log(`    ${bucket.padEnd(6)} ${String(count).padStart(3)} ${bar} ${(count / R.gamesPlayed * 100).toFixed(0)}%`)
  }
  console.log(`${'═'.repeat(70)}`)
}

// ===== MAIN =====

if (COMPARE_MODE) {
  // Compare multiple variants
  const baseConfig = {
    psTarget: 10, soulThreshold: 20, enhancedCost: 1,
    startingGold: 5, noEnhanced: false, eliminationOnly: false,
    games: GAMES, budgetMs: BUDGET_MS,
  }

  const variants: [string, Partial<MechanicsResult['config']>][] = [
    // === BASELINE ===
    ['BASELINE (PS=10, Soul=20, Start=5)', {}],

    // === PS TARGET ===
    ['PS Target = 15 (dluzsza gra)', { psTarget: 15 }],
    ['PS=15 + Harvest=15 (szybszy income)', { psTarget: 15, soulThreshold: 15 }],

    // === ASYMETRYCZNY BUFOR (game designer pick) ===
    ['Start=7, PS=12 (bufor anty-plunder)', { startingGold: 7, psTarget: 12 }],
    ['Start=8, PS=15 (duzy bufor)', { startingGold: 8, psTarget: 15 }],

    // === ENHANCED ADVENTURE COST ===
    ['Enhanced Cost = 2 (oszczednosc)', { enhancedCost: 2 }],
    ['No Enhanced (zero wydatkow)', { noEnhanced: true }],

    // === AGRESYWNE ===
    ['Start=3 (biedny start)', { startingGold: 3 }],
    ['Soul=15 (szybki harvest)', { soulThreshold: 15 }],

    // === HARDCORE/STRATEGICZNY ===
    ['Hardcore: PS=15,Soul=25,Enh=2,Start=3', { psTarget: 15, soulThreshold: 25, enhancedCost: 2, startingGold: 3 }],

    // === ELIMINATION ONLY ===
    ['Elimination Only (brak PS win)', { eliminationOnly: true }],
    ['Elim Only + No Enhanced', { eliminationOnly: true, noEnhanced: true }],
  ]

  console.log(`\n🔬  MECHANICS COMPARISON — ${GAMES} games × ${variants.length} variants | ${BUDGET_MS}ms budget`)

  for (const [label, overrides] of variants) {
    process.stderr.write(`\n🔬  Running: ${label}...\n`)
    const config = { ...baseConfig, ...overrides }
    const result = runScenario(config)
    printResult(label, result)
  }

  console.log(`\n✅  Comparison complete.`)
} else {
  // Single scenario
  const config: MechanicsResult['config'] = {
    psTarget: PS_TARGET,
    soulThreshold: SOUL_THRESHOLD,
    enhancedCost: ENHANCED_COST,
    startingGold: STARTING_GOLD,
    noEnhanced: NO_ENHANCED,
    eliminationOnly: ELIMINATION_ONLY,
    games: GAMES,
    budgetMs: BUDGET_MS,
  }

  process.stderr.write(`\n🔬  Simulating ${GAMES} games | PS=${PS_TARGET} Soul=${SOUL_THRESHOLD} Enhanced=${NO_ENHANCED ? 'OFF' : ENHANCED_COST} Start=${STARTING_GOLD}\n`)

  const result = runScenario(config)
  printResult('RESULTS', result)

  // JSON on stdout
  console.log(JSON.stringify(result, null, 2))
}
