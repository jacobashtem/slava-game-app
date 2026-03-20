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
import { getAllCreaturesOnField } from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'
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
const FLAG_NO_L2 = args.includes('--no-l2')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASELINES_DIR = path.join(__dirname, 'baselines')
const EXPERIENCE_PATH = path.join(__dirname, '..', 'mcts', 'experience.json')

// ===== TYPES =====

interface GameResult {
  winner: PlayerSide | null
  winMethod: 'ps' | 'elimination' | 'ps_zero' | 'timeout' | 'error'
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
  // End-game details
  plunderCount: number
  winnerCardsLeft: number   // deck + hand + field
  loserCardsLeft: number
  loserFieldCount: number
  loserDeckCount: number
  loserHandCount: number
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
    psZeroCount: number
    totalPlunders: number
    avgWinnerCardsLeft: number
    avgLoserCardsLeft: number
    loserTrueEliminated: number  // loser had 0 cards left
    // Per-win-method round stats
    avgRoundsByMethod: { ps: number, elim: number, ps0: number }
    minRounds: number
    maxRounds: number
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
  const mctsAI = new AIPlayer('player1', 'legend', FLAG_BUDGET, FLAG_NO_L2)
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
  let plunderCount = 0

  // Game trace collection (Faza 4 + V7.3)
  const traceMoves: GameTraceMove[] = []
  const traceDeaths: import('../mcts/ExperienceDB').GameTraceDeath[] = []

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
    const turnEnhancedIds: string[] = []

    const playActions = decisions.filter(d =>
      d.type === 'play_creature' || d.type === 'play_adventure' ||
      d.type === 'change_position' || d.type === 'activate_effect')
    const combatActions = decisions.filter(d => d.type === 'attack')
    const wantsPlunder = decisions.some(d => (d.type as string) === 'plunder')

    for (const d of playActions) {
      if (state.winner) break

      // Extract effectId for trace + enhanced tracking
      if (d.type === 'play_creature' || d.type === 'play_adventure') {
        if (d.cardInstanceId) {
          const card = state.players[side].hand.find(c => c.instanceId === d.cardInstanceId)
          if (card) {
            turnEffectIds.push((card.cardData as any).effectId ?? '')
            if (d.type === 'play_adventure' && (d as any).useEnhanced) {
              turnEnhancedIds.push((card.cardData as any).effectId ?? '')
            }
          }
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
      } catch (e: any) {
        if (turnCount > MAX_TURNS - 10) process.stderr.write(`    [WARN] advancePhase failed: ${e?.message}\n`)
      }
      const turnAttacks: import('../mcts/ExperienceDB').GameTraceAttack[] = []
      const graveBefore = state.players[getOpponentSide(side)].graveyard.length
      for (const d of combatActions) {
        if (state.winner) break
        try {
          if (d.cardInstanceId && d.targetInstanceId) {
            // Snapshot attacker/target effectIds before attack
            const atkCard = getAllCreaturesOnField(state, side).find(c => c.instanceId === d.cardInstanceId)
            const tgtCard = getAllCreaturesOnField(state, getOpponentSide(side)).find(c => c.instanceId === d.targetInstanceId)
            const atkEid = (atkCard?.cardData as any)?.effectId ?? ''
            const tgtEid = (tgtCard?.cardData as any)?.effectId ?? ''

            state = engine.sideAttack(side, d.cardInstanceId, d.targetInstanceId)
            engine.lastCombatResult = null

            // Check if target died
            const tgtAlive = getAllCreaturesOnField(state, getOpponentSide(side)).some(c => c.instanceId === d.targetInstanceId)
            if (atkEid && tgtEid) {
              turnAttacks.push({ attacker: atkEid, target: tgtEid, damage: 0, killed: !tgtAlive })
            }
            // Track deaths
            if (!tgtAlive && tgtEid) {
              traceDeaths.push({ effectId: tgtEid, round: state.roundNumber, side: side === 'player1' ? 1 : 0, killerEffectId: atkEid })
            }
            // Check if attacker died (counterattack)
            const atkAlive = getAllCreaturesOnField(state, side).some(c => c.instanceId === d.cardInstanceId)
            if (!atkAlive && atkEid) {
              traceDeaths.push({ effectId: atkEid, round: state.roundNumber, side: sideNum, killerEffectId: tgtEid })
            }
          }
        } catch (e: any) {
          if (turnCount > MAX_TURNS - 10) process.stderr.write(`    [WARN] attack failed: ${e?.message}\n`)
        }
        autoResolve()
      }
      // Store attacks in current trace move (added later)
    } else if (turnCount > MAX_TURNS - 5 && !state.winner) {
      // Near timeout — log why no combat actions
      const myField = getAllCreaturesOnField(state, side)
      const oppField = getAllCreaturesOnField(state, getOpponentSide(side))
      process.stderr.write(`    [STALL R${state.roundNumber}] ${side}: field=${myField.length}v${oppField.length} combatActions=${combatActions.length} playActions=${playActions.length} decisions=${decisions.map(d=>d.type).join(',')}\n`)
    }

    if (wantsPlunder && !state.winner) {
      try {
        // Plunder requires COMBAT phase — advance if still in PLAY
        if (engine.getCurrentPhase() === GamePhase.PLAY)
          state = engine.sideAdvancePhase(side)
        const psBefore = state.players[side === 'player1' ? 'player2' : 'player1'].gold
        state = engine.sidePlunder(side)
        const psAfter = state.players[side === 'player1' ? 'player2' : 'player1'].gold
        if (psAfter < psBefore) plunderCount++
      } catch {}
    }

    if (!state.winner) {
      try { state = engine.sideEndTurn(side) }
      catch {
        try { state = engine.forcePlayerTurn(side === 'player1' ? 'player2' : 'player1') }
        catch {}
      }
    }
    state = engine.getState()

    // Record trace move (V6: enriched with opponent field + PS + field counts)
    if (turnEffectIds.length > 0) {
      const oppSide = side === 'player1' ? 'player2' : 'player1'
      const oppFieldCreatures = getAllCreaturesOnField(state, oppSide)
      traceMoves.push({
        round: state.roundNumber,
        side: sideNum,
        effectIds: turnEffectIds,
        opponentFieldEffectIds: oppFieldCreatures.map(c => (c.cardData as any).effectId ?? ''),
        myPS: state.players[side].gold,
        oppPS: state.players[oppSide].gold,
        myFieldCount: getAllCreaturesOnField(state, side).length,
        oppFieldCount: oppFieldCreatures.length,
        enhancedIds: turnEnhancedIds.length > 0 ? turnEnhancedIds : undefined,
        attacks: turnAttacks?.length > 0 ? turnAttacks : undefined,
      })
    }
  }

  try {
    while (!state.winner && turnCount < MAX_TURNS) {
      turnCount++
      executeTurn(state.currentTurn === 'player1' ? mctsAI : oppAI, state.currentTurn)
      if (state.winner) {
        const w = state.players[state.winner]
        const loserSide = state.winner === 'player1' ? 'player2' : 'player1'
        const loser = state.players[loserSide]
        if (w.gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET) {
          winMethod = 'ps'
        } else if (loser.gold <= 0) {
          winMethod = 'ps_zero'
        } else {
          winMethod = 'elimination'
        }
      }
    }
  } catch { winMethod = 'error' }

  // Build game trace (V7.3: + deaths + survivors)
  let trace: GameTrace | null = null
  if (state.winner) {
    // Collect survivors (creatures still on field at game end)
    const survivors: import('../mcts/ExperienceDB').GameTraceSurvivor[] = []
    for (const s of ['player1', 'player2'] as const) {
      const sideNum = s === 'player1' ? 0 : 1
      for (const c of getAllCreaturesOnField(state, s)) {
        const cd = c.cardData as any
        survivors.push({
          effectId: cd.effectId ?? '',
          side: sideNum,
          finalAtk: c.currentStats.attack,
          finalDef: c.currentStats.defense,
          baseAtk: cd.stats?.attack ?? c.currentStats.maxAttack,
          baseDef: cd.stats?.defense ?? c.currentStats.maxDefense,
        })
      }
    }

    trace = {
      winner: state.winner === 'player1' ? 0 : 1,
      rounds: state.roundNumber,
      moves: traceMoves,
      winMethod: winMethod as 'ps' | 'elimination' | 'ps_zero' | 'gold_loss',
      finalPS: [state.players.player1.gold, state.players.player2.gold],
      deaths: traceDeaths.length > 0 ? traceDeaths : undefined,
      survivors: survivors.length > 0 ? survivors : undefined,
    }
  }

  // End-game card counts
  const winnerSide = state.winner ?? 'player1'
  const loserSide = state.winner === 'player1' ? 'player2' : 'player1'
  const wp = state.players[winnerSide]
  const lp = state.players[loserSide]
  const loserFieldCount = getAllCreaturesOnField(state, loserSide).length
  const loserDeckCount = lp.deck.length
  const loserHandCount = lp.hand.filter(c => c.cardData.cardType === 'creature').length
  const winnerCardsLeft = wp.deck.length + wp.hand.filter(c => c.cardData.cardType === 'creature').length + getAllCreaturesOnField(state, winnerSide).length
  const loserCardsLeft = loserDeckCount + loserHandCount + loserFieldCount

  return {
    winner: state.winner, winMethod, rounds: state.roundNumber,
    p1Gold: state.players.player1.gold, p2Gold: state.players.player2.gold,
    mctsTimeMs, mctsDecisions, totalIterations, totalTreeNodes,
    totalRolloutDepth, totalBestMoveWR, earlyTerminations, trace,
    plunderCount, winnerCardsLeft, loserCardsLeft, loserFieldCount, loserDeckCount, loserHandCount,
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
  const psZeroWins = withWinner.filter(r => r.winMethod === 'ps_zero').length
  const totalPlunders = results.reduce((s, r) => s + r.plunderCount, 0)
  const avgWinnerCards = withWinner.length > 0 ? withWinner.reduce((s, r) => s + r.winnerCardsLeft, 0) / withWinner.length : 0
  const avgLoserCards = withWinner.length > 0 ? withWinner.reduce((s, r) => s + r.loserCardsLeft, 0) / withWinner.length : 0
  const loserZeroCards = withWinner.filter(r => r.loserCardsLeft === 0).length

  // Per-win-method round averages
  const psRounds = withWinner.filter(r => r.winMethod === 'ps').map(r => r.rounds)
  const elimRounds = withWinner.filter(r => r.winMethod === 'elimination').map(r => r.rounds)
  const ps0Rounds = withWinner.filter(r => r.winMethod === 'ps_zero').map(r => r.rounds)
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const allRounds = results.map(r => r.rounds)

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
      psZeroCount: psZeroWins,
      totalPlunders,
      avgWinnerCardsLeft: Math.round(avgWinnerCards * 10) / 10,
      avgLoserCardsLeft: Math.round(avgLoserCards * 10) / 10,
      loserTrueEliminated: loserZeroCards,
      avgRoundsByMethod: {
        ps: Math.round(avg(psRounds) * 10) / 10,
        elim: Math.round(avg(elimRounds) * 10) / 10,
        ps0: Math.round(avg(ps0Rounds) * 10) / 10,
      },
      minRounds: allRounds.length > 0 ? Math.min(...allRounds) : 0,
      maxRounds: allRounds.length > 0 ? Math.max(...allRounds) : 0,
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

// ===== GRACEFUL SHUTDOWN (SIGINT) =====

const FLUSH_INTERVAL = 50  // save experience every N games
let interrupted = false

function saveProgress() {
  if (experienceDB) {
    fs.writeFileSync(EXPERIENCE_PATH, experienceDB.serialize())
    process.stderr.write(`\n📚  Experience saved: ${experienceDB.gamesPlayed} games → ${EXPERIENCE_PATH}\n`)
  }
  if (results.length > 0 && FLAG_SAVE) {
    const partial = aggregate(results)
    const saveName = FLAG_NAME || 'latest'
    const savePath = path.join(BASELINES_DIR, `${saveName}.json`)
    fs.mkdirSync(BASELINES_DIR, { recursive: true })
    fs.writeFileSync(savePath, JSON.stringify(partial, null, 2))
    process.stderr.write(`💾  Baseline (${results.length}/${GAME_COUNT} games): ${savePath}\n`)
  }
}

process.on('SIGINT', () => {
  if (interrupted) process.exit(1) // double Ctrl+C = force quit
  interrupted = true
  process.stderr.write(`\n\n⚠  Ctrl+C — saving progress (${results.length}/${GAME_COUNT} games)...\n`)
  saveProgress()
  process.exit(0)
})

// ===== MAIN =====

const startTime = Date.now()
const results: GameResult[] = []

process.stderr.write(`\n⚔  MCTS V4 Benchmark — ${GAME_COUNT} games | MCTS vs ${OPPONENT.toUpperCase()} | ${FLAG_BUDGET}ms budget`)
if (FLAG_NO_L2) process.stderr.write(' | L2 DISABLED')
if (FLAG_TRAIN) process.stderr.write(' | TRAINING')
process.stderr.write('\n' + '─'.repeat(70) + '\n')

for (let i = 0; i < GAME_COUNT; i++) {
  if (interrupted) break

  const t0 = Date.now()
  const result = simulateGame()
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  const winStr = result.winner === 'player1' ? 'MCTS ✓' : result.winner === 'player2' ? `${OPPONENT} ✓` : 'timeout'
  const methodStr = result.winMethod === 'ps' ? 'PS' : result.winMethod === 'ps_zero' ? 'PS0' : result.winMethod === 'elimination' ? 'ELIM' : result.winMethod
  const avgIter = result.mctsDecisions > 0 ? Math.round(result.totalIterations / result.mctsDecisions) : 0
  const plunderStr = result.plunderCount > 0 ? ` ${result.plunderCount}plr` : ''
  process.stderr.write(`  [${i + 1}/${GAME_COUNT}] ${winStr.padEnd(10)} ${result.rounds}r ${result.p1Gold}/${result.p2Gold}PS ${methodStr} L:${result.loserCardsLeft}cards${plunderStr} ${avgIter}iter/dec ${dt}s\n`)
  results.push(result)

  // Always record game trace to ExperienceDB
  if (experienceDB && result.trace) {
    experienceDB.recordGame(result.trace)
  }

  // Periodic flush — save experience every N games (survives Ctrl+C between flushes)
  if (experienceDB && (i + 1) % FLUSH_INTERVAL === 0) {
    fs.writeFileSync(EXPERIENCE_PATH, experienceDB.serialize())
    process.stderr.write(`    💾 flush: ${experienceDB.gamesPlayed} games saved\n`)
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
process.stderr.write(`  Win Methods:       PS≥10: ${benchmark.results.psWinCount} | Elimination: ${benchmark.results.elimWinCount} | PS→0: ${benchmark.results.psZeroCount}\n`)
const rm = benchmark.results.avgRoundsByMethod
process.stderr.write(`  Rounds/Method:     PS≥10: ${rm.ps}r | Elim: ${rm.elim}r | PS→0: ${rm.ps0}r | min: ${benchmark.results.minRounds}r | max: ${benchmark.results.maxRounds}r\n`)
process.stderr.write(`  Avg PS Winner:     ${benchmark.results.avgPSWinner.toFixed(1)} | Loser: ${benchmark.results.avgPSLoser.toFixed(1)}\n`)
process.stderr.write(`  Cards Left:        Winner avg ${benchmark.results.avgWinnerCardsLeft} | Loser avg ${benchmark.results.avgLoserCardsLeft} | Loser 0 cards: ${benchmark.results.loserTrueEliminated}/${benchmark.results.gamesWithWinner}\n`)
process.stderr.write(`  Plunders:          ${benchmark.results.totalPlunders} total (${(benchmark.results.totalPlunders / (benchmark.results.gamesPlayed || 1)).toFixed(1)}/game)\n`)
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
