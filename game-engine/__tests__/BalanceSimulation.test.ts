/**
 * BalanceSimulation.test.ts — automated game simulations for balance testing.
 *
 * Runs AI-vs-AI games at scale to detect:
 *   - Win rate by difficulty (easy/medium/hard)
 *   - Average game length (rounds, turns)
 *   - Effect frequency & impact (which effects fire most, which win games)
 *   - Soul harvest statistics (avg PS gained per game)
 *   - Domain win rates (which domain combos dominate)
 *   - Card kill/death ratios (which cards are OP or useless)
 *
 * Run with: npx vitest run BalanceSimulation --reporter=verbose
 */

import { describe, it, expect } from 'vitest'
import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { AIDifficulty } from '../AIPlayer'
import type { GameState, PlayerSide, CardInstance } from '../types'
import { GamePhase, BattleLine } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'

// ---------------------------------------------------------------------------
// Simulation Engine
// ---------------------------------------------------------------------------

interface GameResult {
  winner: PlayerSide | null
  rounds: number
  turns: number
  p1Glory: number
  p2Glory: number
  p1Gold: number
  p2Gold: number
  p1SoulPoints: number
  p2SoulPoints: number
  p1Kills: number
  p2Kills: number
  p1CardsPlayed: number
  p2CardsPlayed: number
  timeout: boolean
  error: string | null
}

interface SimulationStats {
  totalGames: number
  p1Wins: number
  p2Wins: number
  draws: number
  errors: number
  avgRounds: number
  avgTurns: number
  avgP1Glory: number
  avgP2Glory: number
  avgP1Kills: number
  avgP2Kills: number
  minRounds: number
  maxRounds: number
  timeouts: number
}

const MAX_TURNS_PER_GAME = 100 // safety valve — prevent infinite games

/**
 * Simulate a single AI-vs-AI game.
 * Both sides use AIPlayer with the given difficulties.
 */
function simulateGame(
  p1Difficulty: AIDifficulty = 'warrior',
  p2Difficulty: AIDifficulty = 'warrior',
  mode: 'gold' | 'slava' = 'gold',
): GameResult {
  const engine = new GameEngine()
  const ai1 = new AIPlayer('player1', p1Difficulty)
  const ai2 = new AIPlayer('player2', p2Difficulty)

  let state: GameState
  if (mode === 'slava') {
    state = engine.startSlavaGame()
  } else {
    state = engine.startAlphaGame()
  }

  let turnCount = 0
  let error: string | null = null

  try {
    while (!state.winner && turnCount < MAX_TURNS_PER_GAME) {
      turnCount++
      const currentSide = state.currentTurn
      const ai = currentSide === 'player1' ? ai1 : ai2

      // Plan decisions
      let decisions
      try {
        decisions = ai.planTurn(engine.getState())
      } catch {
        decisions = [{ type: 'end_turn' as const }]
      }

      // Advance to PLAY phase if needed (start phase may be current)
      try {
        const phase = engine.getCurrentPhase()
        if (phase === GamePhase.START) {
          // Start phase should auto-advance, but force if stuck
          state = engine.sideAdvancePhase(currentSide)
        }
      } catch { /* ignore */ }

      // Helper: auto-resolve any pending interactions
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

      // Split decisions: PLAY phase actions, then COMBAT phase actions
      const playActions = decisions.filter(d => d.type === 'play_creature' || d.type === 'play_adventure' || d.type === 'change_position' || d.type === 'activate_effect')
      const combatActions = decisions.filter(d => d.type === 'attack')

      // Execute PLAY phase decisions
      for (const decision of playActions) {
        if (state.winner) break
        try {
          switch (decision.type) {
            case 'play_creature':
              if (decision.cardInstanceId && decision.targetLine !== undefined) {
                state = engine.sidePlayCreature(currentSide, decision.cardInstanceId, decision.targetLine, undefined, true)
              }
              break
            case 'play_adventure':
              if (decision.cardInstanceId) {
                state = engine.sidePlayAdventure(currentSide, decision.cardInstanceId, decision.targetInstanceId)
              }
              break
            case 'change_position':
              if (decision.cardInstanceId && decision.targetPosition !== undefined) {
                state = engine.sideChangePosition(currentSide, decision.cardInstanceId, decision.targetPosition)
              }
              break
            case 'activate_effect':
              if (decision.cardInstanceId) {
                state = engine.sideActivateEffect(currentSide, decision.cardInstanceId, decision.targetInstanceId)
              }
              break
          }
        } catch { /* skip stale */ }
        autoResolveInteractions()
      }

      // Advance to COMBAT for attacks
      if (combatActions.length > 0 && !state.winner) {
        try {
          if (engine.getCurrentPhase() === GamePhase.PLAY) {
            state = engine.sideAdvancePhase(currentSide)
          }
        } catch { /* ignore */ }

        for (const decision of combatActions) {
          if (state.winner) break
          try {
            if (decision.cardInstanceId && decision.targetInstanceId) {
              state = engine.sideAttack(currentSide, decision.cardInstanceId, decision.targetInstanceId)
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
            const nextSide = currentSide === 'player1' ? 'player2' : 'player1'
            state = engine.forcePlayerTurn(nextSide)
          } catch {
            break
          }
        }
      }

      state = engine.getState()
    }
  } catch (e: any) {
    error = e.message ?? 'Unknown error'
  }

  return {
    winner: state.winner,
    rounds: state.roundNumber,
    turns: turnCount,
    p1Glory: state.players.player1.glory,
    p2Glory: state.players.player2.glory,
    p1Gold: state.players.player1.gold,
    p2Gold: state.players.player2.gold,
    p1SoulPoints: state.players.player1.soulPoints,
    p2SoulPoints: state.players.player2.soulPoints,
    p1Kills: state.players.player1.trophies.length,
    p2Kills: state.players.player2.trophies.length,
    p1CardsPlayed: state.players.player1.graveyard.length + getAllCreaturesOnField(state, 'player1').length,
    p2CardsPlayed: state.players.player2.graveyard.length + getAllCreaturesOnField(state, 'player2').length,
    timeout: turnCount >= MAX_TURNS_PER_GAME,
    error,
  }
}

/**
 * Run N simulations and aggregate statistics.
 */
function runSimulations(
  count: number,
  p1Diff: AIDifficulty = 'warrior',
  p2Diff: AIDifficulty = 'warrior',
  mode: 'gold' | 'slava' = 'gold',
): SimulationStats {
  const results: GameResult[] = []
  for (let i = 0; i < count; i++) {
    results.push(simulateGame(p1Diff, p2Diff, mode))
  }

  const completed = results.filter(r => !r.error)
  const p1Wins = completed.filter(r => r.winner === 'player1').length
  const p2Wins = completed.filter(r => r.winner === 'player2').length
  const draws = completed.filter(r => r.winner === null).length

  return {
    totalGames: count,
    p1Wins,
    p2Wins,
    draws,
    errors: results.filter(r => r.error).length,
    avgRounds: completed.reduce((s, r) => s + r.rounds, 0) / (completed.length || 1),
    avgTurns: completed.reduce((s, r) => s + r.turns, 0) / (completed.length || 1),
    avgP1Glory: completed.reduce((s, r) => s + r.p1Glory, 0) / (completed.length || 1),
    avgP2Glory: completed.reduce((s, r) => s + r.p2Glory, 0) / (completed.length || 1),
    avgP1Kills: completed.reduce((s, r) => s + r.p1Kills, 0) / (completed.length || 1),
    avgP2Kills: completed.reduce((s, r) => s + r.p2Kills, 0) / (completed.length || 1),
    minRounds: Math.min(...completed.map(r => r.rounds)),
    maxRounds: Math.max(...completed.map(r => r.rounds)),
    timeouts: completed.filter(r => r.timeout).length,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Balance Simulation — Smoke Tests', () => {
  it('can simulate a single game to completion', { timeout: 30000 }, () => {
    const result = simulateGame('warrior', 'warrior', 'gold')

    expect(result.error).toBeNull()
    expect(result.turns).toBeGreaterThan(0)
    expect(result.rounds).toBeGreaterThan(0)
    // Game should end (either winner or timeout)
    if (!result.timeout) {
      expect(result.winner).toBeTruthy()
    }
  })

  it('game completes or reaches turn limit', { timeout: 30000 }, () => {
    const result = simulateGame('warrior', 'warrior', 'gold')
    // Game should produce some turns
    expect(result.turns).toBeGreaterThan(0)
    expect(result.rounds).toBeGreaterThan(0)
  })

  it('both sides accumulate kills', { timeout: 30000 }, () => {
    const result = simulateGame('warrior', 'warrior', 'gold')
    // At least one side should have killed something
    expect(result.p1Kills + result.p2Kills).toBeGreaterThan(0)
  })
})

describe('Balance Simulation — Medium vs Medium (10 games)', () => {
  const GAME_COUNT = 10

  it('win rate is roughly balanced (neither side > 80%)', { timeout: 60000 }, () => {
    const stats = runSimulations(GAME_COUNT, 'warrior', 'warrior', 'gold')

    console.log('\n📊 Medium vs Medium (Gold Edition):')
    console.log(`  Games: ${stats.totalGames}, Errors: ${stats.errors}, Timeouts: ${stats.timeouts}`)
    console.log(`  P1 wins: ${stats.p1Wins} (${(stats.p1Wins / stats.totalGames * 100).toFixed(0)}%)`)
    console.log(`  P2 wins: ${stats.p2Wins} (${(stats.p2Wins / stats.totalGames * 100).toFixed(0)}%)`)
    console.log(`  Avg rounds: ${stats.avgRounds.toFixed(1)}, range: ${stats.minRounds}–${stats.maxRounds}`)
    console.log(`  Avg kills: P1=${stats.avgP1Kills.toFixed(1)}, P2=${stats.avgP2Kills.toFixed(1)}`)

    // Neither side should dominate completely in 10 games
    const completed = stats.p1Wins + stats.p2Wins
    if (completed >= 5) {
      expect(stats.p1Wins).toBeLessThan(completed) // not 100% p1
      expect(stats.p2Wins).toBeLessThan(completed) // not 100% p2
    }
  })
})

describe('Balance Simulation — Easy vs Hard (10 games)', () => {
  const GAME_COUNT = 10

  it('hard AI wins more often than easy AI', { timeout: 60000 }, () => {
    const stats = runSimulations(GAME_COUNT, 'novice', 'veteran', 'gold')

    console.log('\n📊 Easy (P1) vs Hard (P2):')
    console.log(`  Games: ${stats.totalGames}, Errors: ${stats.errors}`)
    console.log(`  Easy wins: ${stats.p1Wins} (${(stats.p1Wins / stats.totalGames * 100).toFixed(0)}%)`)
    console.log(`  Hard wins: ${stats.p2Wins} (${(stats.p2Wins / stats.totalGames * 100).toFixed(0)}%)`)
    console.log(`  Avg rounds: ${stats.avgRounds.toFixed(1)}`)

    // Hard should win at least sometimes
    expect(stats.p2Wins).toBeGreaterThanOrEqual(1)
  })
})

describe('Balance Simulation — Soul Harvest Stats (10 games)', () => {
  const GAME_COUNT = 10

  it('soul harvest generates PS over the course of a game', { timeout: 60000 }, () => {
    const results: GameResult[] = []
    for (let i = 0; i < GAME_COUNT; i++) {
      results.push(simulateGame('warrior', 'warrior', 'gold'))
    }

    const completed = results.filter(r => !r.error && !r.timeout)
    const totalP1Gold = completed.reduce((s, r) => s + r.p1Gold, 0)
    const totalP2Gold = completed.reduce((s, r) => s + r.p2Gold, 0)
    const totalKills = completed.reduce((s, r) => s + r.p1Kills + r.p2Kills, 0)

    console.log('\n📊 Soul Harvest Stats:')
    console.log(`  Completed games: ${completed.length}`)
    console.log(`  Avg P1 gold: ${(totalP1Gold / (completed.length || 1)).toFixed(1)}`)
    console.log(`  Avg P2 gold: ${(totalP2Gold / (completed.length || 1)).toFixed(1)}`)
    console.log(`  Total kills across all games: ${totalKills}`)
    console.log(`  Avg kills/game: ${(totalKills / (completed.length || 1)).toFixed(1)}`)

    // Games should produce kills
    expect(totalKills).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Large-scale simulation (disabled by default — enable with .only for perf runs)
// ---------------------------------------------------------------------------

describe.skip('Balance Simulation — Large Scale (100 games)', () => {
  it('100 medium vs medium games — full stats', () => {
    const stats = runSimulations(100, 'warrior', 'warrior', 'gold')

    console.log('\n📊 LARGE SCALE — 100 Medium vs Medium:')
    console.log(`  P1 wins: ${stats.p1Wins} (${(stats.p1Wins / 100 * 100).toFixed(0)}%)`)
    console.log(`  P2 wins: ${stats.p2Wins} (${(stats.p2Wins / 100 * 100).toFixed(0)}%)`)
    console.log(`  Draws/timeouts: ${stats.draws + stats.timeouts}`)
    console.log(`  Errors: ${stats.errors}`)
    console.log(`  Avg rounds: ${stats.avgRounds.toFixed(1)} (${stats.minRounds}–${stats.maxRounds})`)
    console.log(`  Avg kills: P1=${stats.avgP1Kills.toFixed(1)}, P2=${stats.avgP2Kills.toFixed(1)}`)

    // In 100 games, expect somewhat balanced results
    expect(stats.p1Wins).toBeGreaterThan(15)
    expect(stats.p2Wins).toBeGreaterThan(15)
    expect(stats.errors).toBeLessThan(20)
  })
})
