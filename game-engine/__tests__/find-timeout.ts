#!/usr/bin/env npx tsx
/**
 * Timeout hunter — runs games until it finds a timeout, then dumps detailed diagnostics.
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import { getAllCreaturesOnField, canAttack } from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'
import { CardPosition } from '../constants'

const MAX_ROUNDS = 76
const BUDGET = 200
const MAX_ATTEMPTS = 30

for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const engine = new GameEngine()
  engine.startGame()
  const ai1 = new AIPlayer('player1', 'novice', BUDGET)
  const ai2 = new AIPlayer('player2', 'novice', BUDGET)
  ai1.resetGame(); ai2.resetGame()
  let state = engine.getState()
  let stallLog: string[] = []

  while (!state.winner && state.roundNumber < MAX_ROUNDS) {
    const side = state.currentTurn
    const ai = side === 'player1' ? ai1 : ai2
    const decisions = ai.planTurn(state)

    // Track stall patterns every round after round 5
    const myField = getAllCreaturesOnField(state, side)
    const oppField = getAllCreaturesOnField(state, getOpponentSide(side))
    const attacks = decisions.filter(d => d.type === 'attack')
    const positions = decisions.filter(d => d.type === 'change_position')

    if (state.roundNumber > 5 && state.roundNumber % 5 === 0) {
      const ps1 = state.players.player1.glory
      const ps2 = state.players.player2.glory
      const sp1 = state.players.player1.soulPoints
      const sp2 = state.players.player2.soulPoints
      stallLog.push(`R${state.roundNumber} ${side}: ps=${ps1}/${ps2} sp=${sp1}/${sp2} field=${myField.length}v${oppField.length} atk=${attacks.length} pos=${positions.length}`)
    }

    for (const d of decisions) {
      try {
        switch (d.type) {
          case 'play_creature': engine.sidePlayCreature(side, d.cardInstanceId!, d.targetLine!, undefined, true); break
          case 'play_adventure': engine.sidePlayAdventure(side, d.cardInstanceId!, d.targetInstanceId, d.useEnhanced ?? false, true); break
          case 'attack': engine.sideAttack(side, d.cardInstanceId!, d.targetInstanceId!); engine.lastCombatResult = null; break
          case 'change_position': engine.sideChangePosition(side, d.cardInstanceId!, d.targetPosition!); break
          case 'activate_effect': engine.sideActivateEffect(side, d.cardInstanceId!, d.targetInstanceId); break
          case 'plunder': engine.sidePlunder(side); break
          case 'end_turn': engine.sideEndTurn(side); break
        }
        let s2 = engine.getState()
        let guard = 0
        while (s2.pendingInteraction && guard++ < 10) {
          const c = s2.pendingInteraction.availableChoices?.[0] ?? s2.pendingInteraction.availableTargetIds?.[0] ?? 'yes'
          engine.resolvePendingInteraction(c)
          engine.lastCombatResult = null
          s2 = engine.getState()
        }
      } catch {}
    }
    state = engine.getState()
  }

  if (state.winner) {
    process.stderr.write(`  [${attempt + 1}] ${state.winner} won R${state.roundNumber}\n`)
    continue
  }

  // === TIMEOUT FOUND — DUMP EVERYTHING ===
  console.log(`\n${'='.repeat(70)}`)
  console.log(`TIMEOUT GAME #${attempt + 1}`)
  console.log(`${'='.repeat(70)}`)
  console.log(`Rounds: ${state.roundNumber}`)
  console.log(`PS: p1=${state.players.player1.glory} p2=${state.players.player2.glory}`)
  console.log(`Soul Points: p1=${state.players.player1.soulPoints} p2=${state.players.player2.soulPoints}`)
  console.log(`Consecutive Passes: p1=${state.players.player1.consecutivePasses} p2=${state.players.player2.consecutivePasses}`)

  for (const side of ['player1', 'player2'] as const) {
    const field = getAllCreaturesOnField(state, side)
    const hand = state.players[side].hand
    const deck = state.players[side].deck
    console.log(`\n--- ${side} ---`)
    console.log(`  Deck: ${deck.length} | Hand: ${hand.length} (${hand.filter(c => c.cardData.cardType === 'creature').length} creatures)`)
    console.log(`  Field (${field.length}):`)
    for (const c of field) {
      const eid = (c.cardData as any).effectId ?? 'none'
      const artifacts = c.equippedArtifacts.map((a: any) => a.effectId || a.cardData?.effectId || '?').join(',')
      console.log(`    ${c.cardData.name} (${eid}) ${c.currentStats.attack}/${c.currentStats.defense} L${c.line} ${c.position === CardPosition.ATTACK ? 'ATK' : 'DEF'}${c.isImmune ? ' IMMUNE' : ''}${c.isSilenced ? ' SILENCED' : ''}${c.cannotAttack ? ' CANT_ATK' : ''}${artifacts ? ` artifacts=[${artifacts}]` : ''}`)
    }
  }

  // Attack analysis
  console.log(`\n--- ATTACK ANALYSIS ---`)
  for (const side of ['player1', 'player2'] as const) {
    const my = getAllCreaturesOnField(state, side)
    const opp = getAllCreaturesOnField(state, getOpponentSide(side))
    console.log(`\n${side} (${my.length} creatures, ${my.filter(c => c.position === CardPosition.ATTACK).length} in ATK):`)
    for (const a of my) {
      if (a.position !== CardPosition.ATTACK) continue
      if (a.cannotAttack) { console.log(`  ${a.cardData.name}: CANT_ATTACK`); continue }
      let anyValid = false
      for (const t of opp) {
        const r = canAttack(state, a, t)
        if (r.valid) {
          anyValid = true
          console.log(`  ${a.cardData.name} L${a.line} -> ${t.cardData.name} L${t.line}: VALID (kill=${t.currentStats.defense <= a.currentStats.attack})`)
        } else {
          console.log(`  ${a.cardData.name} L${a.line} -> ${t.cardData.name} L${t.line}: ${r.reason}`)
        }
      }
      if (!anyValid && opp.length > 0) console.log(`  ${a.cardData.name}: NO VALID TARGETS`)
    }
  }

  // Stall log
  console.log(`\n--- STALL LOG ---`)
  for (const line of stallLog) console.log(`  ${line}`)

  break // found one timeout, that's enough
}
