#!/usr/bin/env npx tsx
/**
 * AI Diagnostic Script — plays 1 game between two novice AIs (200ms budget)
 * and logs EVERY decision in detail to stderr.
 *
 * Purpose: understand WHY the AI does or doesn't attack.
 *
 * Usage:
 *   npx tsx game-engine/__tests__/diagnose-ai.ts
 */

import { GameEngine } from '../GameEngine'
import { AIPlayer } from '../AIPlayer'
import type { AIDecision } from '../AIPlayer'
import type { GameState, PlayerSide, CardInstance } from '../types'
import { GamePhase, CardPosition, BattleLine } from '../constants'
import { getAllCreaturesOnField, canAttack } from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'
import { generateMacroMoves } from '../mcts/MacroMoveGenerator'

const MAX_ROUNDS = 30
const BUDGET_MS = 200

const log = (...args: any[]) => process.stderr.write(args.join(' ') + '\n')
const separator = () => log('='.repeat(80))
const thinSep = () => log('-'.repeat(60))

// ===== HELPERS =====

function creatureSummary(c: CardInstance): string {
  const pos = c.position === CardPosition.ATTACK ? 'ATK' : 'DEF'
  const effectId = (c.cardData as any).effectId ?? '?'
  const attacked = c.hasAttackedThisTurn ? ' [ATTACKED]' : ''
  const cantAtk = c.cannotAttack ? ' [CANT_ATK]' : ''
  return `  ${c.cardData.name} (${effectId}) ${c.currentStats.attack}/${c.currentStats.defense} pos=${pos} line=L${c.line}${attacked}${cantAtk}`
}

function fieldSummary(state: GameState, side: PlayerSide): string[] {
  const creatures = getAllCreaturesOnField(state, side)
  if (creatures.length === 0) return ['  (empty field)']
  return creatures.map(creatureSummary)
}

function handSummary(state: GameState, side: PlayerSide): string {
  const hand = state.players[side].hand
  const creatures = hand.filter(c => c.cardData.cardType === 'creature')
  const adventures = hand.filter(c => c.cardData.cardType === 'adventure')
  return `${hand.length} cards (${creatures.length} creatures, ${adventures.length} adventures)`
}

function getPS(state: GameState, side: PlayerSide): number {
  return state.gameMode === 'slava' ? state.players[side].glory : state.players[side].gold
}

function decisionTypeSummary(decisions: AIDecision[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const d of decisions) {
    counts[d.type] = (counts[d.type] ?? 0) + 1
  }
  return counts
}

function macroStepTypeLabel(type: string): string {
  switch (type) {
    case 'play_creature': return 'CREATURE'
    case 'play_adventure': return 'ADVENTURE'
    case 'activate_effect': return 'ACTIVATION'
    case 'advance_to_combat': return 'COMBAT'
    case 'end_turn': return 'END'
    default: return type.toUpperCase()
  }
}

// ===== ATTACK ANALYSIS =====

function analyzeAttackPotential(state: GameState, side: PlayerSide): void {
  const oppSide = getOpponentSide(side)
  const myCreatures = getAllCreaturesOnField(state, side)
  const enemyCreatures = getAllCreaturesOnField(state, oppSide)

  const inAttackPos = myCreatures.filter(c => c.position === CardPosition.ATTACK)
  const inDefensePos = myCreatures.filter(c => c.position === CardPosition.DEFENSE)
  const alreadyAttacked = myCreatures.filter(c => c.hasAttackedThisTurn)
  const cantAttack = myCreatures.filter(c => c.cannotAttack)

  log(`  [ATTACK ANALYSIS]`)
  log(`    My creatures: ${myCreatures.length} total (${inAttackPos.length} ATK pos, ${inDefensePos.length} DEF pos)`)
  log(`    Already attacked this turn: ${alreadyAttacked.length}`)
  log(`    Cannot attack (status): ${cantAttack.length}`)
  log(`    Enemy creatures: ${enemyCreatures.length}`)

  if (inAttackPos.length === 0) {
    log(`    >> NO creatures in ATTACK position -- cannot attack`)
    return
  }

  if (enemyCreatures.length === 0) {
    log(`    >> Enemy field EMPTY -- plunder possible (round >= 3: ${state.roundNumber >= 3})`)
    return
  }

  // Check each potential attacker vs each potential target
  for (const attacker of inAttackPos) {
    if (attacker.hasAttackedThisTurn) {
      log(`    ${attacker.cardData.name}: already attacked`)
      continue
    }
    if (attacker.cannotAttack) {
      log(`    ${attacker.cardData.name}: cannot attack (status effect)`)
      continue
    }

    let hasValidTarget = false
    for (const target of enemyCreatures) {
      const result = canAttack(state, attacker, target)
      if (result.valid) {
        hasValidTarget = true
        const kill = target.currentStats.defense <= attacker.currentStats.attack
        const survive = attacker.currentStats.defense > target.currentStats.attack
        const threat = target.currentStats.attack * 2 + target.currentStats.defense
        let score = 0
        if (kill) score += 100
        if (kill && survive) score += 50
        if (!survive && !kill) score -= 80
        score += threat * 2
        if (kill) score += threat * 3

        const verdict = score < -30 ? 'SKIPPED (score < -30)' : 'VIABLE'
        log(`    ${attacker.cardData.name} ${attacker.currentStats.attack}/${attacker.currentStats.defense} -> ${target.cardData.name} ${target.currentStats.attack}/${target.currentStats.defense}: score=${score} kill=${kill} survive=${survive} [${verdict}]`)
      } else {
        log(`    ${attacker.cardData.name} -> ${target.cardData.name}: INVALID (${result.reason})`)
      }
    }
    if (!hasValidTarget) {
      log(`    ${attacker.cardData.name}: NO valid targets`)
    }
  }
}

// ===== MACRO ANALYSIS =====

function analyzeMacros(engine: GameEngine, state: GameState, side: PlayerSide): void {
  const maxMacros = 8 // novice budget
  const { macros } = generateMacroMoves(engine, state, side, maxMacros)

  log(`  [MACRO MOVES GENERATED: ${macros.length}]`)
  const typeCounts: Record<string, number> = {
    'skip_only': 0,
    'creature': 0,
    'adventure': 0,
    'activation': 0,
  }
  for (const macro of macros) {
    const hasCreature = macro.steps.some(s => s.type === 'play_creature')
    const hasAdventure = macro.steps.some(s => s.type === 'play_adventure')
    const hasActivation = macro.steps.some(s => s.type === 'activate_effect')
    if (!hasCreature && !hasAdventure && !hasActivation) typeCounts['skip_only']!++
    if (hasCreature) typeCounts['creature']!++
    if (hasAdventure) typeCounts['adventure']!++
    if (hasActivation) typeCounts['activation']!++

    const stepLabels = macro.steps
      .filter(s => s.type !== 'advance_to_combat')
      .map(s => {
        let label = macroStepTypeLabel(s.type)
        if (s.cardInstanceId) {
          // Try to find card name from state
          const card = state.players[side].hand.find(c => c.instanceId === s.cardInstanceId)
            ?? getAllCreaturesOnField(state, side).find(c => c.instanceId === s.cardInstanceId)
          if (card) label += `(${card.cardData.name})`
        }
        if (s.targetLine !== undefined) label += ` L${s.targetLine}`
        if (s.useEnhanced) label += ' ENH'
        return label
      })
    const stepsStr = stepLabels.length > 0 ? stepLabels.join(' + ') : '(skip all)'
    log(`    [${macro.heuristicScore.toFixed(0).padStart(4)}] ${stepsStr}`)
  }
  log(`    Types: skip=${typeCounts['skip_only']} creature=${typeCounts['creature']} adv=${typeCounts['adventure']} act=${typeCounts['activation']}`)
}

// ===== AUTO-RESOLVE =====

function autoResolve(engine: GameEngine, state: GameState): GameState {
  let guard = 0
  while (state.pendingInteraction && guard++ < 10) {
    try {
      const ch = state.pendingInteraction.availableChoices?.[0]
        ?? state.pendingInteraction.availableTargetIds?.[0] ?? 'yes'
      state = engine.resolvePendingInteraction(ch)
      engine.lastCombatResult = null
    } catch { break }
  }
  return state
}

// ===== MAIN =====

log('')
separator()
log('AI DIAGNOSTIC — 1 game, two novice AIs (200ms budget each)')
separator()
log('')

const engine = new GameEngine()
const ai1 = new AIPlayer('player1', 'novice', BUDGET_MS)
const ai2 = new AIPlayer('player2', 'novice', BUDGET_MS)
ai1.resetGame()
ai2.resetGame()

let state = engine.startAlphaGame()
let lastRound = 0

log(`Game started. Mode: ${state.gameMode}. First turn: ${state.currentTurn}`)
log('')

while (!state.winner && state.roundNumber <= MAX_ROUNDS) {
  const side = state.currentTurn
  const oppSide = getOpponentSide(side)
  const ai = side === 'player1' ? ai1 : ai2

  // Track round transitions
  if (state.roundNumber !== lastRound) {
    lastRound = state.roundNumber
    separator()
    log(`ROUND ${state.roundNumber}`)
    separator()
  }

  thinSep()
  log(`TURN: ${side} | Phase: ${engine.getCurrentPhase()}`)
  log(`  PS: ${side}=${getPS(state, side)} | ${oppSide}=${getPS(state, oppSide)}`)
  log(`  Soul Points: ${side}=${state.players[side].soulPoints} | ${oppSide}=${state.players[oppSide].soulPoints}`)
  log(`  Hand: ${handSummary(state, side)}`)
  log(`  Consecutive Passes: ${state.players[side].consecutivePasses}`)
  log(`  ${side} field:`)
  for (const line of fieldSummary(state, side)) log(line)
  log(`  ${oppSide} field:`)
  for (const line of fieldSummary(state, oppSide)) log(line)

  // Advance to PLAY if in START
  try {
    if (engine.getCurrentPhase() === GamePhase.START) {
      state = engine.sideAdvancePhase(side)
      log(`  (advanced from START to ${engine.getCurrentPhase()})`)
    }
  } catch (e: any) {
    log(`  ERROR advancing phase: ${e.message}`)
    break
  }

  // Analyze macros BEFORE AI decides (use separate engine to avoid corrupting state)
  log('')
  const analyzeEngine = new GameEngine()
  analyzeMacros(analyzeEngine, state, side)

  // AI plans turn
  log('')
  log(`  [AI PLANNING...]`)
  const t0 = Date.now()
  let decisions: AIDecision[]
  try {
    decisions = ai.planTurn(engine.getState())
  } catch (e: any) {
    log(`  ERROR in planTurn: ${e.message}`)
    decisions = [{ type: 'end_turn' }]
  }
  const dt = Date.now() - t0
  log(`  [AI DECIDED in ${dt}ms] ${decisions.length} decisions`)

  // Log MCTS stats
  const stats = ai.lastSearchStats
  if (stats) {
    log(`  [MCTS STATS] iterations=${stats.iterations} treeNodes=${stats.treeNodes} movesConsidered=${stats.movesConsidered} bestVisits=${stats.bestMoveVisits} bestWR=${(stats.bestMoveWinRate * 100).toFixed(1)}%`)
  }

  // Log each decision
  const typeCounts = decisionTypeSummary(decisions)
  log(`  [DECISION TYPES] ${JSON.stringify(typeCounts)}`)

  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i]!
    let detail = `  [${i}] ${d.type}`
    if (d.cardInstanceId) {
      const card = state.players[side].hand.find(c => c.instanceId === d.cardInstanceId)
        ?? getAllCreaturesOnField(state, side).find(c => c.instanceId === d.cardInstanceId)
      if (card) detail += ` "${card.cardData.name}"`
      else detail += ` id=${d.cardInstanceId}`
    }
    if (d.targetInstanceId) {
      const target = [...getAllCreaturesOnField(state, side), ...getAllCreaturesOnField(state, oppSide)]
        .find(c => c.instanceId === d.targetInstanceId)
      if (target) detail += ` -> "${target.cardData.name}" (${target.currentStats.attack}/${target.currentStats.defense})`
      else detail += ` -> target=${d.targetInstanceId}`
    }
    if (d.targetLine !== undefined) detail += ` L${d.targetLine}`
    if (d.targetPosition !== undefined) detail += ` pos=${d.targetPosition}`
    if (d.useEnhanced) detail += ' ENHANCED'
    log(detail)
  }

  // Execute PLAY decisions
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
            state = engine.sidePlayCreature(side, d.cardInstanceId, d.targetLine, undefined, true)
          break
        case 'play_adventure':
          if (d.cardInstanceId)
            state = engine.sidePlayAdventure(side, d.cardInstanceId, d.targetInstanceId, d.useEnhanced, true)
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
    } catch (e: any) {
      log(`  EXEC ERROR [${d.type}]: ${e.message}`)
    }
    state = autoResolve(engine, state)
  }

  // Combat phase
  log('')
  log(`  [COMBAT PHASE]`)
  log(`  Attack decisions: ${combatActions.length}`)
  log(`  Plunder wanted: ${wantsPlunder}`)

  // Analyze attack potential with updated state (after play actions)
  const stateBeforeCombat = engine.getState()
  analyzeAttackPotential(stateBeforeCombat, side)

  if (combatActions.length > 0 && !state.winner) {
    try {
      if (engine.getCurrentPhase() === GamePhase.PLAY)
        state = engine.sideAdvancePhase(side)
    } catch (e: any) {
      log(`  ERROR advancing to combat: ${e.message}`)
    }

    for (const d of combatActions) {
      if (state.winner) break
      try {
        if (d.cardInstanceId && d.targetInstanceId) {
          log(`  EXECUTING ATTACK: ${d.cardInstanceId} -> ${d.targetInstanceId}`)
          state = engine.sideAttack(side, d.cardInstanceId, d.targetInstanceId)
          const cr = engine.lastCombatResult
          if (cr) {
            log(`    Combat result: attackerDied=${cr.attackerDied} defenderDied=${cr.defenderDied} dmgToDefender=${cr.damageToDefender} dmgToAttacker=${cr.damageToAttacker} counterattack=${cr.counterattackOccurred}`)
            if (cr.softFail) log(`    Soft fail: ${cr.softFailReason}`)
            if (cr.effectsTriggered.length > 0) log(`    Effects triggered: ${cr.effectsTriggered.join(', ')}`)
            if (cr.soulHarvested && cr.soulHarvested.length > 0) {
              for (const sh of cr.soulHarvested) log(`    Soul harvest: ${sh.cardName} sv=${sh.soulValue} +${sh.psGained}PS to ${sh.side}`)
            }
          }
          engine.lastCombatResult = null
        }
      } catch (e: any) {
        log(`  ATTACK ERROR: ${e.message}`)
      }
      state = autoResolve(engine, state)
    }
  }

  if (wantsPlunder && !state.winner) {
    try {
      state = engine.sidePlunder(side)
      log(`  PLUNDER executed`)
    } catch (e: any) {
      log(`  PLUNDER ERROR: ${e.message}`)
    }
  }

  // Check creatures after combat — did anyone actually attack?
  const postCombatCreatures = getAllCreaturesOnField(engine.getState(), side)
  const anyAttacked = postCombatCreatures.some(c => c.hasAttackedThisTurn)
  log(`  [POST-COMBAT] Any creature attacked this turn: ${anyAttacked}`)

  // End turn
  if (!state.winner) {
    try {
      state = engine.sideEndTurn(side)
    } catch {
      try {
        state = engine.forcePlayerTurn(oppSide)
      } catch {}
    }
  }
  state = engine.getState()

  log(`  [END OF TURN] PS: p1=${getPS(state, 'player1')} p2=${getPS(state, 'player2')} | Round: ${state.roundNumber} | Next: ${state.currentTurn}`)
  log(`  Consecutive passes after turn: p1=${state.players.player1.consecutivePasses} p2=${state.players.player2.consecutivePasses}`)

  if (state.winner) {
    log('')
    separator()
    log(`WINNER: ${state.winner} | PS: p1=${getPS(state, 'player1')} p2=${getPS(state, 'player2')}`)
    separator()
  }

  log('')
}

if (!state.winner) {
  separator()
  log(`GAME ENDED: No winner after ${MAX_ROUNDS} rounds (timeout)`)
  log(`Final PS: p1=${getPS(state, 'player1')} p2=${getPS(state, 'player2')}`)
  separator()
}

log('')
log('Diagnostic complete.')
