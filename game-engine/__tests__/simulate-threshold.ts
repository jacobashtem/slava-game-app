#!/usr/bin/env npx tsx
/**
 * PS Threshold Test — does higher win target make enhancing worthwhile?
 *
 * Tests Oszczędny vs Ulepszacz at different PS win targets (10, 12, 15, 20).
 * If higher threshold reduces Oszczędny's dominance, it means
 * enhancing needs more time to pay off.
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { GameState, PlayerSide } from '../types'
import { GamePhase, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'

const GAMES_PER_TEST = parseInt(process.argv[2] || '40', 10)
const MAX_TURNS = 200
const THRESHOLDS = [10, 12, 15, 20]

function simulateGame(threshold: number, p1Enhances: boolean, p2Enhances: boolean): {
  winner: PlayerSide | null; rounds: number; p1Gold: number; p2Gold: number; timeout: boolean
} {
  const engine = new GameEngine()
  const ai1 = new AIPlayer('player1', 'hard')
  const ai2 = new AIPlayer('player2', 'hard')
  let state = engine.startAlphaGame()

  // Override win target (hack: mutate constant for this game)
  const origTarget = GOLD_EDITION_RULES.GLORY_WIN_TARGET
  ;(GOLD_EDITION_RULES as any).GLORY_WIN_TARGET = threshold

  let turnCount = 0
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
      const shouldEnhance = side === 'player1' ? p1Enhances : p2Enhances

      try { if (engine.getCurrentPhase() === GamePhase.START) state = engine.sideAdvancePhase(side) } catch {}

      let decisions
      try { decisions = ai.planTurn(engine.getState()) } catch { decisions = [{ type: 'end_turn' as const }] }

      const playActions = decisions.filter(d => d.type === 'play_creature' || d.type === 'play_adventure' || d.type === 'change_position' || d.type === 'activate_effect')
      const combatActions = decisions.filter(d => d.type === 'attack')

      for (const d of playActions) {
        if (state.winner) break
        try {
          if (d.type === 'play_adventure' && d.cardInstanceId) {
            const card = state.players[side].hand.find(c => c.instanceId === d.cardInstanceId)
            const hasEnh = (card?.cardData as any)?.enhancedEffectId
            const ps = state.gameMode === 'slava' ? state.players[side].glory : state.players[side].gold
            // Strategy override
            const useEnh = hasEnh && shouldEnhance && ps >= 1 && ps < threshold - 1
            state = engine.sidePlayAdventure(side, d.cardInstanceId, d.targetInstanceId, useEnh)
          } else if (d.type === 'play_creature' && d.cardInstanceId && d.targetLine !== undefined) {
            state = engine.sidePlayCreature(side, d.cardInstanceId, d.targetLine, undefined, true)
          } else if (d.type === 'change_position' && d.cardInstanceId && d.targetPosition !== undefined) {
            state = engine.sideChangePosition(side, d.cardInstanceId, d.targetPosition)
          } else if (d.type === 'activate_effect' && d.cardInstanceId) {
            state = engine.sideActivateEffect(side, d.cardInstanceId, d.targetInstanceId)
          }
        } catch {}
        autoResolve()
      }

      if (combatActions.length > 0 && !state.winner) {
        try { if (engine.getCurrentPhase() === GamePhase.PLAY) state = engine.sideAdvancePhase(side) } catch {}
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

      // Plunder
      if (!state.winner && state.roundNumber >= 3) {
        const enemySide = side === 'player1' ? 'player2' : 'player1'
        if (getAllCreaturesOnField(state, enemySide).length === 0)
          try { state = engine.sidePlunder(side) } catch {}
      }

      if (!state.winner) {
        try { state = engine.sideEndTurn(side) }
        catch { try { state = engine.forcePlayerTurn(side === 'player1' ? 'player2' : 'player1') } catch { break } }
      }
      state = engine.getState()
    }
  } catch {}

  // Restore original threshold
  ;(GOLD_EDITION_RULES as any).GLORY_WIN_TARGET = origTarget

  return {
    winner: state.winner,
    rounds: state.roundNumber,
    p1Gold: state.players.player1.gold,
    p2Gold: state.players.player2.gold,
    timeout: turnCount >= MAX_TURNS,
  }
}

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------

console.log(`\n⚔  Test Progu PS — Oszczędny vs Ulepszacz`)
console.log(`   ${GAMES_PER_TEST} gier per scenariusz`)
console.log(`${'═'.repeat(70)}\n`)

type Matchup = { label: string; p1Enh: boolean; p2Enh: boolean }
const matchups: Matchup[] = [
  { label: 'Oszczędny vs Oszczędny', p1Enh: false, p2Enh: false },
  { label: 'Oszczędny vs Ulepszacz', p1Enh: false, p2Enh: true },
  { label: 'Ulepszacz vs Oszczędny', p1Enh: true, p2Enh: false },
  { label: 'Ulepszacz vs Ulepszacz', p1Enh: true, p2Enh: true },
]

console.log(`  ${'Próg PS'.padEnd(8)} ${'Matchup'.padEnd(26)} ${'P1 WR'.padStart(6)} ${'Rund'.padStart(6)} ${'P1 PS'.padStart(6)} ${'P2 PS'.padStart(6)} ${'TO'.padStart(4)}`)
console.log(`  ${'─'.repeat(66)}`)

for (const threshold of THRESHOLDS) {
  for (const m of matchups) {
    const results = []
    for (let i = 0; i < GAMES_PER_TEST; i++) {
      results.push(simulateGame(threshold, m.p1Enh, m.p2Enh))
    }

    const completed = results.filter(r => r.winner)
    const p1w = completed.filter(r => r.winner === 'player1').length
    const wr = completed.length > 0 ? (p1w / completed.length * 100).toFixed(0) : '—'
    const avgR = (results.reduce((s, r) => s + r.rounds, 0) / results.length).toFixed(0)
    const avgP1 = (results.reduce((s, r) => s + r.p1Gold, 0) / results.length).toFixed(1)
    const avgP2 = (results.reduce((s, r) => s + r.p2Gold, 0) / results.length).toFixed(1)
    const to = results.filter(r => r.timeout).length

    const flag = Number(wr) >= 60 ? ' 🟢' : Number(wr) <= 40 ? ' 🔴' : ''
    console.log(`  ${String(threshold).padEnd(8)} ${m.label.padEnd(26)} ${(wr + '%').padStart(6)} ${avgR.padStart(6)} ${avgP1.padStart(6)} ${avgP2.padStart(6)} ${String(to).padStart(4)}${flag}`)
  }
  console.log(`  ${'─'.repeat(66)}`)
}

// Summary
console.log(`\n📊  Podsumowanie: WR Oszczędnego vs Ulepszacza per próg`)
console.log(`${'═'.repeat(50)}`)

for (const threshold of THRESHOLDS) {
  // We already printed — just extract the key matchup
  process.stdout.write(`  Próg ${String(threshold).padEnd(3)} PS: `)
  // Re-run just the key matchup for clean summary
  const key = []
  for (let i = 0; i < GAMES_PER_TEST; i++) key.push(simulateGame(threshold, false, true))
  const c = key.filter(r => r.winner)
  const p1w = c.filter(r => r.winner === 'player1').length
  const wr = c.length > 0 ? (p1w / c.length * 100).toFixed(0) : '?'
  const bar = '█'.repeat(Math.round(Number(wr) / 2.5))
  const to = key.filter(r => r.timeout).length
  console.log(`Oszczędny ${wr}% ${bar}  (TO: ${to})`)
}

console.log(`\n${'═'.repeat(50)}\n`)
