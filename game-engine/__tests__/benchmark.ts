#!/usr/bin/env npx tsx
/**
 * MCTS Benchmark Harness V4 — z game trace collection + ExperienceDB training.
 *
 * Produkuje:
 * - JSON na stdout (parsowalne, do CI/porównań)
 * - Human-readable summary na stderr
 * - Opcjonalnie zapisuje baseline do baselines/{name}.json
 * - Opcjonalnie porównuje z zapisanym baseline'em
 * - Game traces → ExperienceDB (Faza 4 training)
 *
 * Usage:
 *   npm run benchmark                          # 20 gier, mcts vs veteran
 *   npm run benchmark -- 50                    # 50 gier
 *   npm run benchmark -- 20 --name v4-macro    # zapisz jako v4-macro
 *   npm run benchmark -- 20 --compare v3-before # porównaj z v3-before
 *   npm run benchmark -- 20 --budget 3000      # 3s MCTS budget
 *   npm run benchmark -- 100 --train           # trenuj ExperienceDB
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { AIDifficulty } from '../AIPlayer'
import type { GameState, PlayerSide } from '../types'
import { GamePhase, GOLD_EDITION_RULES } from '../constants'
import type { MCTSStats } from '../mcts/types'
import { ExperienceDB } from '../mcts/ExperienceDB'
import type { GameTrace, GameTraceMove } from '../mcts/ExperienceDB'

// ===== CLI ARGS =====

const args = process.argv.slice(2)
const positionalArgs = args.filter(a => !a.startsWith('--'))
const GAME_COUNT = parseInt(positionalArgs[0] || '20', 10)
const OPPONENT = (positionalArgs[1] || 'veteran') as AIDifficulty
const MAX_TURNS = 150

// Named flags
const FLAG_NAME = args.includes('--name') ? args[args.indexOf('--name') + 1] : null
const FLAG_COMPARE = args.includes('--compare') ? (args[args.indexOf('--compare') + 1] || 'latest') : null
const FLAG_BUDGET = args.includes('--budget') ? parseInt(args[args.indexOf('--budget') + 1] || '2000', 10) : 2000
const FLAG_SAVE = FLAG_NAME !== null || (!FLAG_COMPARE && !args.includes('--no-save'))
const FLAG_TRAIN = args.includes('--train')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASELINES_DIR = path.join(__dirname, 'baselines')
const EXPERIENCE_PATH = path.join(__dirname, '..', 'mcts', 'experience.json')

// ===== TYPES =====

interface GameResult {
  winner: PlayerSide | null
  winMethod: 'ps' | 'elimination' | 'timeout' | 'error'
  rounds: number
  p1Gold: number
  p2Gold: number
  mctsTimeMs: number
  mctsDecisions: number
  // Per-decision MCTS stats (aggregated)
  totalIterations: number
  totalTreeNodes: number
  totalRolloutDepth: number
  totalBestMoveWR: number
  earlyTerminations: number
  // Game trace (Faza 4)
  trace: GameTrace | null
}

interface BenchmarkResult {
  name: string
  timestamp: string
  config: {
    games: number
    opponent: string
    timeBudgetMs: number
    maxTurns: number
  }
  results: {
    gamesPlayed: number
    gamesWithWinner: number
    mctsWins: number
    oppWins: number
    timeouts: number
    errors: number
    winRate: number
    timeoutRate: number
    avgRounds: number
    avgPSWinner: number
    avgPSLoser: number
    psWinCount: number
    elimWinCount: number
  }
  mcts: {
    avgIterationsPerDecision: number
    avgTreeNodes: number
    avgRolloutDepth: number
    avgTimePerDecisionMs: number
    avgBestMoveWR: number
    earlyTerminationRate: number
    totalDecisions: number
  }
}

// ===== EXPERIENCE DB =====

let experienceDB: ExperienceDB | null = null

// Always load + train experience (every benchmark makes AI smarter)
experienceDB = AIPlayer.initExperience()
if (fs.existsSync(EXPERIENCE_PATH)) {
  try {
    experienceDB.deserialize(fs.readFileSync(EXPERIENCE_PATH, 'utf-8'))
    process.stderr.write(`📚  Experience DB: ${experienceDB.gamesPlayed} games loaded\n`)
  } catch {
    process.stderr.write(`⚠  Could not load experience, starting fresh\n`)
  }
}

// ===== GAME SIMULATION =====

function simulateGame(): GameResult {
  const engine = new GameEngine()
  const mctsAI = new AIPlayer('player1', 'legend', FLAG_BUDGET)
  const oppAI = new AIPlayer('player2', OPPONENT)

  // Reset per-game state (TT, tree reuse)
  mctsAI.resetGame()
  oppAI.resetGame()

  let state = engine.startAlphaGame()
  let turnCount = 0
  let mctsTimeMs = 0
  let mctsDecisions = 0
  let totalIterations = 0
  let totalTreeNodes = 0
  let totalRolloutDepth = 0
  let totalBestMoveWR = 0
  let earlyTerminations = 0
  let winMethod: GameResult['winMethod'] = 'timeout'

  // Game trace collection (Faza 4)
  const traceMoves: GameTraceMove[] = []

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

  function executeTurn(ai: AIPlayer, side: PlayerSide) {
    try {
      if (engine.getCurrentPhase() === GamePhase.START)
        state = engine.sideAdvancePhase(side)
    } catch { return }

    const t0 = Date.now()
    let decisions
    try { decisions = ai.planTurn(engine.getState()) }
    catch { decisions = [{ type: 'end_turn' as const }] }
    const dt = Date.now() - t0

    if (side === 'player1') {
      mctsTimeMs += dt
      mctsDecisions++

      const stats: MCTSStats | null = ai.lastSearchStats ?? null
      if (stats) {
        totalIterations += stats.iterations
        totalTreeNodes += stats.treeNodes
        totalRolloutDepth += stats.avgRolloutDepth
        totalBestMoveWR += stats.bestMoveWinRate
        if (stats.timeElapsedMs < FLAG_BUDGET * 0.9 && stats.iterations > 50) {
          earlyTerminations++
        }
      }
    }

    // Collect trace: extract effectIds of played cards
    const sideNum = side === 'player1' ? 0 : 1
    const turnEffectIds: string[] = []

    const playActions = decisions.filter(d =>
      d.type === 'play_creature' || d.type === 'play_adventure' ||
      d.type === 'change_position' || d.type === 'activate_effect')
    const combatActions = decisions.filter(d => d.type === 'attack')
    const wantsPlunder = decisions.some(d => (d.type as string) === 'plunder')

    for (const d of playActions) {
      if (state.winner) break

      // Extract effectId for trace
      if (d.type === 'play_creature' || d.type === 'play_adventure') {
        if (d.cardInstanceId) {
          const card = state.players[side].hand.find(c => c.instanceId === d.cardInstanceId)
          if (card) turnEffectIds.push((card.cardData as any).effectId ?? '')
        }
      }

      try {
        switch (d.type) {
          case 'play_creature':
            if (d.cardInstanceId && d.targetLine !== undefined)
              state = engine.sidePlayCreature(side, d.cardInstanceId, d.targetLine, undefined, true)
            break
          case 'play_adventure':
            if (d.cardInstanceId)
              state = engine.sidePlayAdventure(side, d.cardInstanceId, d.targetInstanceId, (d as any).useEnhanced, true)
            break
          case 'change_position':
            if (d.cardInstanceId && d.targetPosition !== undefined)
              state = engine.sideChangePosition(side, d.cardInstanceId, d.targetPosition)
            break
          case 'activate_effect':
            if (d.cardInstanceId)
              state = engine.sideActivateEffect(side, d.cardInstanceId, d.targetInstanceId)
            break
        }
      } catch {}
      autoResolve()
    }

    if (combatActions.length > 0 && !state.winner) {
      try {
        if (engine.getCurrentPhase() === GamePhase.PLAY)
          state = engine.sideAdvancePhase(side)
      } catch {}
      for (const d of combatActions) {
        if (state.winner) break
        try {
          if (d.cardInstanceId && d.targetInstanceId) {
            state = engine.sideAttack(side, d.cardInstanceId, d.targetInstanceId)
            engine.lastCombatResult = null
          }
        } catch {}
        autoResolve()
      }
    }

    if (wantsPlunder && !state.winner) {
      try { state = engine.sidePlunder(side) } catch {}
    }

    if (!state.winner) {
      try { state = engine.sideEndTurn(side) }
      catch {
        try { state = engine.forcePlayerTurn(side === 'player1' ? 'player2' : 'player1') }
        catch {}
      }
    }
    state = engine.getState()

    // Record trace move
    if (turnEffectIds.length > 0) {
      traceMoves.push({
        round: state.roundNumber,
        side: sideNum,
        effectIds: turnEffectIds,
      })
    }
  }

  try {
    while (!state.winner && turnCount < MAX_TURNS) {
      turnCount++
      executeTurn(state.currentTurn === 'player1' ? mctsAI : oppAI, state.currentTurn)
      if (state.winner) {
        const w = state.players[state.winner]
        winMethod = w.gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET ? 'ps' : 'elimination'
      }
    }
  } catch { winMethod = 'error' }

  // Build game trace
  let trace: GameTrace | null = null
  if (state.winner) {
    trace = {
      winner: state.winner === 'player1' ? 0 : 1,
      rounds: state.roundNumber,
      moves: traceMoves,
    }
  }

  return {
    winner: state.winner, winMethod, rounds: state.roundNumber,
    p1Gold: state.players.player1.gold, p2Gold: state.players.player2.gold,
    mctsTimeMs, mctsDecisions, totalIterations, totalTreeNodes,
    totalRolloutDepth, totalBestMoveWR, earlyTerminations, trace,
  }
}

// ===== AGGREGATION =====

function aggregate(results: GameResult[]): BenchmarkResult {
  const withWinner = results.filter(r => r.winner !== null)
  const mctsWins = withWinner.filter(r => r.winner === 'player1').length
  const oppWins = withWinner.filter(r => r.winner === 'player2').length
  const timeouts = results.filter(r => r.winMethod === 'timeout').length
  const errors = results.filter(r => r.winMethod === 'error').length
  const psWins = withWinner.filter(r => r.winMethod === 'ps').length
  const elimWins = withWinner.filter(r => r.winMethod === 'elimination').length

  const winnerPS = withWinner.map(r => r.winner === 'player1' ? r.p1Gold : r.p2Gold)
  const loserPS = withWinner.map(r => r.winner === 'player1' ? r.p2Gold : r.p1Gold)

  const totalDecisions = results.reduce((s, r) => s + r.mctsDecisions, 0)
  const totalIter = results.reduce((s, r) => s + r.totalIterations, 0)
  const totalNodes = results.reduce((s, r) => s + r.totalTreeNodes, 0)
  const totalDepth = results.reduce((s, r) => s + r.totalRolloutDepth, 0)
  const totalWR = results.reduce((s, r) => s + r.totalBestMoveWR, 0)
  const totalEarlyTerm = results.reduce((s, r) => s + r.earlyTerminations, 0)
  const totalMctsTime = results.reduce((s, r) => s + r.mctsTimeMs, 0)

  return {
    name: FLAG_NAME || 'latest',
    timestamp: new Date().toISOString(),
    config: {
      games: GAME_COUNT,
      opponent: OPPONENT,
      timeBudgetMs: FLAG_BUDGET,
      maxTurns: MAX_TURNS,
    },
    results: {
      gamesPlayed: results.length,
      gamesWithWinner: withWinner.length,
      mctsWins,
      oppWins,
      timeouts,
      errors,
      winRate: withWinner.length > 0 ? mctsWins / withWinner.length : 0,
      timeoutRate: results.length > 0 ? timeouts / results.length : 0,
      avgRounds: results.reduce((s, r) => s + r.rounds, 0) / (results.length || 1),
      avgPSWinner: winnerPS.length > 0 ? winnerPS.reduce((a, b) => a + b, 0) / winnerPS.length : 0,
      avgPSLoser: loserPS.length > 0 ? loserPS.reduce((a, b) => a + b, 0) / loserPS.length : 0,
      psWinCount: psWins,
      elimWinCount: elimWins,
    },
    mcts: {
      avgIterationsPerDecision: totalDecisions > 0 ? totalIter / totalDecisions : 0,
      avgTreeNodes: totalDecisions > 0 ? totalNodes / totalDecisions : 0,
      avgRolloutDepth: totalDecisions > 0 ? totalDepth / totalDecisions : 0,
      avgTimePerDecisionMs: totalDecisions > 0 ? totalMctsTime / totalDecisions : 0,
      avgBestMoveWR: totalDecisions > 0 ? totalWR / totalDecisions : 0,
      earlyTerminationRate: totalDecisions > 0 ? totalEarlyTerm / totalDecisions : 0,
      totalDecisions,
    },
  }
}

// ===== COMPARISON =====

function compareBaselines(current: BenchmarkResult, baseline: BenchmarkResult): string[] {
  const lines: string[] = []
  const delta = (cur: number, base: number, label: string, suffix = '', better: 'higher' | 'lower' = 'higher') => {
    const diff = cur - base
    const pct = base !== 0 ? ((diff / base) * 100).toFixed(1) : 'N/A'
    const arrow = diff > 0 ? (better === 'higher' ? '▲' : '▼') : diff < 0 ? (better === 'higher' ? '▼' : '▲') : '='
    const good = (diff > 0 && better === 'higher') || (diff < 0 && better === 'lower')
    const color = good ? '🟢' : diff === 0 ? '⚪' : '🔴'
    lines.push(`  ${color} ${label.padEnd(30)} ${base.toFixed(2)}${suffix} → ${cur.toFixed(2)}${suffix}  ${arrow} ${pct}%`)
  }

  lines.push(`\n📊  PORÓWNANIE: "${current.name}" vs "${baseline.name}"`)
  lines.push('─'.repeat(70))

  delta(current.results.winRate, baseline.results.winRate, 'Win Rate', '', 'higher')
  delta(current.results.timeoutRate, baseline.results.timeoutRate, 'Timeout Rate', '', 'lower')
  delta(current.results.avgRounds, baseline.results.avgRounds, 'Avg Rounds', '', 'lower')
  delta(current.mcts.avgIterationsPerDecision, baseline.mcts.avgIterationsPerDecision, 'Avg Iterations/Decision', '', 'higher')
  delta(current.mcts.avgTreeNodes, baseline.mcts.avgTreeNodes, 'Avg Tree Nodes', '', 'higher')
  delta(current.mcts.avgBestMoveWR, baseline.mcts.avgBestMoveWR, 'Avg Best Move WR', '', 'higher')
  delta(current.mcts.avgTimePerDecisionMs, baseline.mcts.avgTimePerDecisionMs, 'Avg Time/Decision (ms)', 'ms', 'lower')

  return lines
}

// ===== MAIN =====

const startTime = Date.now()
const results: GameResult[] = []

process.stderr.write(`\n⚔  MCTS V4 Benchmark — ${GAME_COUNT} games | MCTS vs ${OPPONENT.toUpperCase()} | ${FLAG_BUDGET}ms budget`)
if (FLAG_TRAIN) process.stderr.write(' | TRAINING')
process.stderr.write('\n' + '─'.repeat(70) + '\n')

for (let i = 0; i < GAME_COUNT; i++) {
  const t0 = Date.now()
  const result = simulateGame()
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  const winStr = result.winner === 'player1' ? 'MCTS ✓' : result.winner === 'player2' ? `${OPPONENT} ✓` : 'timeout'
  const avgIter = result.mctsDecisions > 0 ? Math.round(result.totalIterations / result.mctsDecisions) : 0
  process.stderr.write(`  [${i + 1}/${GAME_COUNT}] ${winStr.padEnd(10)} ${result.rounds}r ${result.p1Gold}/${result.p2Gold}PS ${avgIter}iter/dec ${dt}s\n`)
  results.push(result)

  // Always record game trace to ExperienceDB
  if (experienceDB && result.trace) {
    experienceDB.recordGame(result.trace)
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
const benchmark = aggregate(results)

// Human-readable summary on stderr
process.stderr.write('\n' + '═'.repeat(70) + '\n')
process.stderr.write(`📊  WYNIKI (${elapsed}s)\n`)
process.stderr.write('─'.repeat(70) + '\n')
process.stderr.write(`  Win Rate:          ${(benchmark.results.winRate * 100).toFixed(1)}% (${benchmark.results.mctsWins}W/${benchmark.results.oppWins}L)\n`)
process.stderr.write(`  Timeouts:          ${benchmark.results.timeouts} (${(benchmark.results.timeoutRate * 100).toFixed(0)}%)\n`)
process.stderr.write(`  Avg Rounds:        ${benchmark.results.avgRounds.toFixed(1)}\n`)
process.stderr.write(`  PS Wins:           ${benchmark.results.psWinCount} | Elim Wins: ${benchmark.results.elimWinCount}\n`)
process.stderr.write(`  Avg PS Winner:     ${benchmark.results.avgPSWinner.toFixed(1)} | Loser: ${benchmark.results.avgPSLoser.toFixed(1)}\n`)
process.stderr.write('─'.repeat(70) + '\n')
process.stderr.write(`  Iter/Decision:     ${benchmark.mcts.avgIterationsPerDecision.toFixed(0)}\n`)
process.stderr.write(`  Tree Nodes:        ${benchmark.mcts.avgTreeNodes.toFixed(1)}\n`)
process.stderr.write(`  Rollout Depth:     ${benchmark.mcts.avgRolloutDepth.toFixed(1)}\n`)
process.stderr.write(`  Time/Decision:     ${benchmark.mcts.avgTimePerDecisionMs.toFixed(0)}ms\n`)
process.stderr.write(`  Best Move WR:      ${(benchmark.mcts.avgBestMoveWR * 100).toFixed(1)}%\n`)
process.stderr.write(`  Early Term Rate:   ${(benchmark.mcts.earlyTerminationRate * 100).toFixed(1)}%\n`)
process.stderr.write(`  Total Decisions:   ${benchmark.mcts.totalDecisions}\n`)
process.stderr.write('═'.repeat(70) + '\n')

// Compare with baseline if requested
if (FLAG_COMPARE) {
  const baselinePath = path.join(BASELINES_DIR, `${FLAG_COMPARE}.json`)
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as BenchmarkResult
    const comparison = compareBaselines(benchmark, baseline)
    for (const line of comparison) process.stderr.write(line + '\n')
  } else {
    process.stderr.write(`\n⚠  Baseline "${FLAG_COMPARE}" nie znaleziony w ${baselinePath}\n`)
  }
}

// Save baseline
if (FLAG_SAVE) {
  const saveName = FLAG_NAME || 'latest'
  const savePath = path.join(BASELINES_DIR, `${saveName}.json`)
  fs.mkdirSync(BASELINES_DIR, { recursive: true })
  fs.writeFileSync(savePath, JSON.stringify(benchmark, null, 2))
  process.stderr.write(`\n💾  Baseline zapisany: ${savePath}\n`)
}

// Always save experience DB (cumulative learning)
if (experienceDB) {
  fs.writeFileSync(EXPERIENCE_PATH, experienceDB.serialize())
  process.stderr.write(`📚  Experience saved: ${experienceDB.gamesPlayed} games → ${EXPERIENCE_PATH}\n`)
}

// JSON on stdout (parseable)
console.log(JSON.stringify(benchmark, null, 2))
