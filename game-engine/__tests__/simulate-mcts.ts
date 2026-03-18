#!/usr/bin/env npx tsx
/**
 * MCTS Simulation Runner — testuje MCTS AI vs inne poziomy trudności.
 *
 * Usage:
 *   npx tsx game-engine/__tests__/simulate-mcts.ts              # 10 gier, mcts vs hard
 *   npx tsx game-engine/__tests__/simulate-mcts.ts 50           # 50 gier
 *   npx tsx game-engine/__tests__/simulate-mcts.ts 20 medium    # mcts vs medium
 *   npx tsx game-engine/__tests__/simulate-mcts.ts 10 hard 3000 # 3s budżet MCTS
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { AIDifficulty } from '../AIPlayer'
import type { GameState, PlayerSide, CardInstance } from '../types'
import { GamePhase, GOLD_EDITION_RULES } from '../constants'

const args = process.argv.slice(2)
const GAME_COUNT = parseInt(args[0] || '10', 10)
const OPPONENT_DIFFICULTY = (args[1] || 'veteran') as AIDifficulty
const MCTS_TIME_BUDGET = parseInt(args[2] || '2000', 10)
const MAX_TURNS = 150

interface GameResult {
  winner: PlayerSide | null
  winMethod: 'ps' | 'elimination' | 'timeout' | 'error'
  rounds: number
  turns: number
  p1Gold: number
  p2Gold: number
  mctsTime: number // total MCTS thinking time
}

function simulateGame(gameIndex: number): GameResult {
  const engine = new GameEngine()
  // Player1 = MCTS, Player2 = opponent
  const mctsAI = new AIPlayer('player1', 'legend', MCTS_TIME_BUDGET)
  const oppAI = new AIPlayer('player2', OPPONENT_DIFFICULTY)
  let state = engine.startAlphaGame()
  let turnCount = 0
  let mctsTime = 0
  let winMethod: GameResult['winMethod'] = 'timeout'

  function autoResolveInteractions() {
    let guard = 0
    while (state.pendingInteraction && guard++ < 10) {
      try {
        const choices = state.pendingInteraction.availableChoices
        const targets = state.pendingInteraction.availableTargetIds
        const choice = choices?.[0] ?? targets?.[0] ?? 'yes'
        state = engine.resolvePendingInteraction(choice)
        engine.lastCombatResult = null
      } catch {
        break
      }
    }
  }

  function executeTurn(ai: AIPlayer, side: PlayerSide) {
    // Auto-advance START phase
    try {
      if (engine.getCurrentPhase() === GamePhase.START) {
        state = engine.sideAdvancePhase(side)
      }
    } catch {
      return
    }

    // Plan turn (measure MCTS time)
    const t0 = Date.now()
    let decisions
    try {
      decisions = ai.planTurn(engine.getState())
    } catch (e) {
      console.error(`[Game ${gameIndex}] planTurn error for ${side}:`, e)
      decisions = [{ type: 'end_turn' as const }]
    }
    if (side === 'player1') mctsTime += Date.now() - t0

    const playActions = decisions.filter(
      (d) =>
        d.type === 'play_creature' ||
        d.type === 'play_adventure' ||
        d.type === 'change_position' ||
        d.type === 'activate_effect',
    )
    const combatActions = decisions.filter((d) => d.type === 'attack')
    const wantsPlunder = decisions.some((d) => d.type === 'plunder')

    // Execute PLAY actions
    for (const d of playActions) {
      if (state.winner) break
      try {
        switch (d.type) {
          case 'play_creature':
            if (d.cardInstanceId && d.targetLine !== undefined)
              state = engine.sidePlayCreature(
                side,
                d.cardInstanceId,
                d.targetLine,
                undefined,
                true,
              )
            break
          case 'play_adventure':
            if (d.cardInstanceId)
              state = engine.sidePlayAdventure(
                side,
                d.cardInstanceId,
                d.targetInstanceId,
                (d as any).useEnhanced,
                true,
              )
            break
          case 'change_position':
            if (d.cardInstanceId && d.targetPosition !== undefined)
              state = engine.sideChangePosition(
                side,
                d.cardInstanceId,
                d.targetPosition,
              )
            break
          case 'activate_effect':
            if (d.cardInstanceId)
              state = engine.sideActivateEffect(
                side,
                d.cardInstanceId,
                d.targetInstanceId,
              )
            break
        }
      } catch {}
      autoResolveInteractions()
    }

    // COMBAT
    if (combatActions.length > 0 && !state.winner) {
      try {
        if (engine.getCurrentPhase() === GamePhase.PLAY)
          state = engine.sideAdvancePhase(side)
      } catch {}
      for (const d of combatActions) {
        if (state.winner) break
        try {
          if (d.cardInstanceId && d.targetInstanceId) {
            state = engine.sideAttack(
              side,
              d.cardInstanceId,
              d.targetInstanceId,
            )
            engine.lastCombatResult = null
          }
        } catch {}
        autoResolveInteractions()
      }
    }

    // PLUNDER
    if (wantsPlunder && !state.winner) {
      try {
        state = engine.sidePlunder(side)
      } catch {}
    }

    // END TURN
    if (!state.winner) {
      try {
        state = engine.sideEndTurn(side)
      } catch {
        try {
          state = engine.forcePlayerTurn(
            side === 'player1' ? 'player2' : 'player1',
          )
        } catch {}
      }
    }

    state = engine.getState()
  }

  try {
    while (!state.winner && turnCount < MAX_TURNS) {
      turnCount++
      const currentSide = state.currentTurn
      const ai = currentSide === 'player1' ? mctsAI : oppAI

      executeTurn(ai, currentSide)

      if (state.winner) {
        const w = state.players[state.winner]
        winMethod =
          w.gold >= GOLD_EDITION_RULES.GLORY_WIN_TARGET ? 'ps' : 'elimination'
      }
    }
  } catch (e) {
    winMethod = 'error'
    console.error(`[Game ${gameIndex}] Fatal error:`, e)
  }

  return {
    winner: state.winner,
    winMethod,
    rounds: state.roundNumber,
    turns: turnCount,
    p1Gold: state.players.player1.gold,
    p2Gold: state.players.player2.gold,
    mctsTime,
  }
}

// ===== MAIN =====

console.log(`\n⚔  SŁAWA — MCTS Simulation`)
console.log(
  `   MCTS (P1, ${MCTS_TIME_BUDGET}ms) vs ${OPPONENT_DIFFICULTY.toUpperCase()} AI (P2)`,
)
console.log(`   Games: ${GAME_COUNT} | Max turns: ${MAX_TURNS}`)
console.log(`${'─'.repeat(70)}\n`)

const startTime = Date.now()
const results: GameResult[] = []

for (let i = 0; i < GAME_COUNT; i++) {
  const gameStart = Date.now()
  console.log(`  Game ${i + 1}/${GAME_COUNT}...`)
  const result = simulateGame(i + 1)
  const gameTime = ((Date.now() - gameStart) / 1000).toFixed(1)
  const winnerStr =
    result.winner === 'player1'
      ? 'MCTS ✓'
      : result.winner === 'player2'
        ? `${OPPONENT_DIFFICULTY} ✓`
        : 'draw'
  console.log(
    `    → ${winnerStr} | ${result.rounds} rund | ${result.p1Gold}/${result.p2Gold} PS | MCTS ${(result.mctsTime / 1000).toFixed(1)}s | ${result.winMethod} | ${gameTime}s`,
  )
  results.push(result)
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
const withWinner = results.filter((r) => r.winner)
const mctsWins = withWinner.filter((r) => r.winner === 'player1').length
const oppWins = withWinner.filter((r) => r.winner === 'player2').length
const timeouts = results.filter((r) => r.winMethod === 'timeout').length
const errors = results.filter((r) => r.winMethod === 'error').length
const avgMctsTime =
  results.reduce((s, r) => s + r.mctsTime, 0) / results.length
const avgRounds =
  results.reduce((s, r) => s + r.rounds, 0) / results.length

console.log(`\n${'═'.repeat(70)}`)
console.log(`📊  WYNIKI (${elapsed}s total)`)
console.log(`${'─'.repeat(70)}`)
console.log(
  `  MCTS (P1):     ${mctsWins} wins (${((mctsWins / (withWinner.length || 1)) * 100).toFixed(1)}%)`,
)
console.log(
  `  ${OPPONENT_DIFFICULTY.toUpperCase()} (P2):    ${oppWins} wins (${((oppWins / (withWinner.length || 1)) * 100).toFixed(1)}%)`,
)
console.log(`  Timeouts:      ${timeouts}`)
console.log(`  Errors:        ${errors}`)
console.log(`  Avg rounds:    ${avgRounds.toFixed(1)}`)
console.log(`  Avg MCTS time: ${(avgMctsTime / 1000).toFixed(1)}s per game`)
console.log(`${'═'.repeat(70)}\n`)
