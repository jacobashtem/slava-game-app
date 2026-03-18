/**
 * MacroMoveGenerator — generuje pełne sekwencje PLAY-phase dla MCTS.
 *
 * MacroMove = istota + przygoda + aktywacja + advance_to_combat.
 * Zamiast analizować 1 ruch, MCTS porównuje pełne strategie tury.
 *
 * Algorytm:
 * 1. Enumeruj opcje istot: każda z ręki × preferowana linia + fallback + "skip"
 * 2. Dla każdej: zastosuj przez GameEngine → stan pośredni
 * 3. Enumeruj przygody: brak / top-2 single / top-1 enhanced
 * 4. Enumeruj aktywacje: brak / top-1
 * 5. Łącznie: ~6 × 3 × 2 = ~36 macro-moves
 *
 * Pruning: cap wg budżetu (novice=8, warrior=16, veteran=30, legend=40).
 * Common prefix: istoty co różnią się tylko przygodą → creature applied raz.
 */

import type { GameState, CardInstance } from '../types'
import type { PlayerSide } from '../types'
import type { MCTSMove, MacroMove } from './types'
import { moveKey } from './types'
import { BattleLine, CardPosition, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField, canPlayCreature, canPlaceInLine } from '../LineManager'
import { canActivateEffect, getEffect } from '../EffectRegistry'
import { getOpponentSide } from '../GameStateUtils'
import type { GameEngine } from '../GameEngine'
import { applyMove, scoreMove } from './StateAdapter'
import { effectThreatTier, assessGameSituation, canAffordEnhancedSmart, hasSynergy } from './StrategicPatterns'
import { gameStateToLight, lightFieldCount } from './LightweightState'
import { generateCombatPlans } from './CombatPlanGenerator'

// ===== RESULT TYPE =====

export interface MacroMoveResult {
  macros: MacroMove[]
  /** Pre-computed final states per macro key (unika re-apply w MCTSPlayer) */
  states: Map<string, GameState>
}

// ===== LINE SELECTION =====

function preferredLine(attackType: number): BattleLine {
  switch (attackType) {
    case 2: return BattleLine.SUPPORT  // MAGIC
    case 3: return BattleLine.RANGED   // RANGED
    default: return BattleLine.FRONT   // MELEE, ELEMENTAL
  }
}

function fallbackLine(preferred: BattleLine): BattleLine {
  switch (preferred) {
    case BattleLine.FRONT: return BattleLine.RANGED
    case BattleLine.RANGED: return BattleLine.FRONT
    case BattleLine.SUPPORT: return BattleLine.RANGED
    default: return BattleLine.FRONT
  }
}

// ===== HELPERS =====

function getPS(state: GameState, side: PlayerSide): number {
  return state.gameMode === 'slava'
    ? state.players[side].glory
    : state.players[side].gold
}

function canAffordEnhanced(state: GameState, side: PlayerSide): boolean {
  return getPS(state, side) >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST
}

// ===== GENERATOR =====

export function generateMacroMoves(
  engine: GameEngine,
  state: GameState,
  side: PlayerSide,
  maxMacros: number,
): MacroMoveResult {
  const genStart = Date.now()
  const allMacros: MacroMove[] = []
  const stateCache = new Map<string, GameState>()
  const oppSide = getOpponentSide(side)
  const player = state.players[side]

  // V5: Budget-aware generation — cap prefix groups based on maxMacros
  // novice=8 macros → max 3 creature options, veteran=30 → max 6
  const maxPrefixGroups = maxMacros <= 8 ? 3 : maxMacros <= 16 ? 4 : 6
  const maxAdvPerGroup = maxMacros <= 8 ? 2 : 3
  const maxActPerAdv = maxMacros <= 16 ? 1 : 2
  // V7: Combat plans per play macro
  const maxCombatPlans = maxMacros <= 8 ? 2 : 3

  // V5: Game situation for context-aware scoring
  const lightState = gameStateToLight(state)
  const sideNum = side === 'player1' ? 0 : 1
  const situation = assessGameSituation(lightState, sideNum)

  // === 1. Creature options (preferred + fallback line, + skip) ===
  interface CreatureOption {
    creature: CardInstance | null
    line: BattleLine | null
  }

  const creatureOptions: CreatureOption[] = [{ creature: null, line: null }] // skip

  if (canPlayCreature(state, side)) {
    const creatures = player.hand
      .filter(c => c.cardData.cardType === 'creature')
      .sort((a, b) =>
        scoreMove(state, { type: 'play_creature', cardInstanceId: b.instanceId }, side) -
        scoreMove(state, { type: 'play_creature', cardInstanceId: a.instanceId }, side),
      )

    // Deduplicate by card (not line)
    const seen = new Set<string>()
    for (const c of creatures) {
      if (seen.has(c.instanceId)) continue
      seen.add(c.instanceId)

      const atkType = (c.cardData as any).attackType ?? 0
      const effect = getEffect((c.cardData as any).effectId)
      const targetSide = effect?.playOnEnemyField ? oppSide : side
      // MELEE/ELEMENTAL: prefer FRONT (L1) — required for attacking
      // Override preferredLine if there are enemies (MELEE MUST be on L1 to attack)
      const enemyPresent = getAllCreaturesOnField(state, oppSide).length > 0
      const pref = (atkType <= 1 && enemyPresent) ? BattleLine.FRONT : preferredLine(atkType)
      const fb = fallbackLine(pref)

      let added = false
      if (canPlaceInLine(state, targetSide, pref)) {
        creatureOptions.push({ creature: c, line: pref })
        added = true
      }
      // Fallback line — ale NIE dla MELEE/ELEMENTAL kiedy wróg istnieje
      // (MELEE na L2 nie może atakować → bezużyteczne)
      const skipFallback = atkType <= 1 && enemyPresent && pref === BattleLine.FRONT
      if (!skipFallback && canPlaceInLine(state, targetSide, fb)) {
        creatureOptions.push({ creature: c, line: fb })
        added = true
      }
      // Fallback to any line — but NOT L2/L3 for MELEE/ELEMENTAL when enemies exist
      // (MELEE can only attack from L1 FRONT — placing on L2/L3 makes it useless)
      if (!added) {
        const skipNonFront = atkType <= 1 && enemyPresent
        for (const l of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
          if (skipNonFront && l !== BattleLine.FRONT) continue
          if (canPlaceInLine(state, targetSide, l)) {
            creatureOptions.push({ creature: c, line: l })
            break
          }
        }
      }
    }
  }

  // === 2. Common prefix: group by creature, apply once ===
  interface PrefixGroup {
    creatureStep: MCTSMove | null
    creatureScore: number
    stateAfterCreature: GameState
  }
  const prefixGroups = new Map<string, PrefixGroup>()

  for (const opt of creatureOptions) {
    // Budget-aware: cap prefix groups to avoid eating entire time budget
    if (prefixGroups.size >= maxPrefixGroups + 1) break // +1 for 'skip' group

    const groupKey = opt.creature ? `${opt.creature.instanceId}:L${opt.line}` : 'skip'
    if (prefixGroups.has(groupKey)) continue

    let stateAfterCreature: GameState
    let creatureStep: MCTSMove | null = null
    let creatureScore = 0

    if (opt.creature && opt.line !== null) {
      creatureStep = {
        type: 'play_creature',
        cardInstanceId: opt.creature.instanceId,
        targetLine: opt.line,
      }
      const applied = applyMove(engine, state, creatureStep, side)
      if (!applied) continue // skip invalid moves
      stateAfterCreature = applied
      creatureScore = scoreMove(state, creatureStep, side)
    } else {
      stateAfterCreature = state
    }

    prefixGroups.set(groupKey, { creatureStep, creatureScore, stateAfterCreature })
  }

  // === 3. For each prefix, enumerate adventures + activations ===
  for (const [, group] of prefixGroups) {
    const { creatureStep, creatureScore, stateAfterCreature } = group

    // --- Adventure options ---
    interface AdvOption {
      step: MCTSMove | null
      score: number
      stateAfterAdv: GameState
    }
    const advOptions: AdvOption[] = [{ step: null, score: 0, stateAfterAdv: stateAfterCreature }]

    const adventures = stateAfterCreature.players[side].hand
      .filter(c => c.cardData.cardType === 'adventure')

    if (adventures.length > 0) {
      const advCandidates: { step: MCTSMove, score: number }[] = []
      const myField = getAllCreaturesOnField(stateAfterCreature, side)
      const enemyField = getAllCreaturesOnField(stateAfterCreature, oppSide)
      const currentPS = getPS(stateAfterCreature, side)
      const oppPS = getPS(stateAfterCreature, oppSide)

      for (const adv of adventures) {
        const advData = adv.cardData as any
        const advType = advData.adventureType as number
        const advEffectId = advData.effectId ?? ''

        if (advType === 1) {
          // ARTIFACT → target with highest effectThreatTier (not just raw stats)
          if (myField.length > 0) {
            const target = myField.reduce((a, b) => {
              const aVal = a.currentStats.attack + a.currentStats.defense + effectThreatTier((a.cardData as any).effectId ?? '') * 3
              const bVal = b.currentStats.attack + b.currentStats.defense + effectThreatTier((b.cardData as any).effectId ?? '') * 3
              return aVal > bVal ? a : b
            })
            const step: MCTSMove = {
              type: 'play_adventure',
              cardInstanceId: adv.instanceId,
              targetInstanceId: target.instanceId,
              useEnhanced: false,
            }
            // Contextual score: artifact on high-threat creature is much better
            const targetTier = effectThreatTier((target.cardData as any).effectId ?? '')
            const contextScore = scoreMove(stateAfterCreature, step, side) + targetTier * 2
            advCandidates.push({ step, score: contextScore })

            // Enhanced: smart PS management
            if (canAffordEnhanced(stateAfterCreature, side) && advData.enhancedEffectId &&
                canAffordEnhancedSmart(currentPS, oppPS, stateAfterCreature.roundNumber)) {
              const enhStep: MCTSMove = { ...step, useEnhanced: true }
              advCandidates.push({ step: enhStep, score: contextScore + 3 })
            }
          }
        } else {
          // EVENT / LOCATION → contextual scoring
          const bestTarget = enemyField.length > 0
            ? enemyField.reduce((a, b) =>
              a.currentStats.attack + a.currentStats.defense >
              b.currentStats.attack + b.currentStats.defense ? a : b,
            )
            : null

          const step: MCTSMove = {
            type: 'play_adventure',
            cardInstanceId: adv.instanceId,
            targetInstanceId: bestTarget?.instanceId,
            useEnhanced: false,
          }
          // Contextual: debuffs/damage more valuable vs more enemies
          let contextScore = scoreMove(stateAfterCreature, step, side)
          if (enemyField.length >= 3) contextScore += 4 // mass effects shine
          if (enemyField.length === 0) contextScore -= 3 // no targets

          // Synergy: creature+adventure combo bonus
          if (group.creatureStep && group.creatureStep.cardInstanceId) {
            const creatureCard = player.hand.find(c => c.instanceId === group.creatureStep!.cardInstanceId)
            if (creatureCard) {
              const creatureEid = (creatureCard.cardData as any).effectId ?? ''
              if (creatureEid && advEffectId && hasSynergy(creatureEid, advEffectId)) {
                contextScore += 5
              }
            }
          }

          advCandidates.push({ step, score: contextScore })

          // Enhanced events — smart PS management
          if (canAffordEnhanced(stateAfterCreature, side) && advData.enhancedEffectId &&
              canAffordEnhancedSmart(currentPS, oppPS, stateAfterCreature.roundNumber)) {
            const enhStep: MCTSMove = { ...step, useEnhanced: true }
            advCandidates.push({ step: enhStep, score: contextScore + 3 })
          }
        }
      }

      // Top adventures (budget-aware: novice=2, veteran=3)
      advCandidates.sort((a, b) => b.score - a.score)
      for (const cand of advCandidates.slice(0, maxAdvPerGroup)) {
        const applied = applyMove(engine, stateAfterCreature, cand.step, side)
        advOptions.push({
          step: cand.step,
          score: cand.score,
          stateAfterAdv: applied ?? stateAfterCreature,
        })
      }
    }

    // --- For each adventure, enumerate activations ---
    for (const advOpt of advOptions) {
      interface ActOption {
        step: MCTSMove | null
        score: number
        finalState: GameState
      }
      const actOptions: ActOption[] = [{ step: null, score: 0, finalState: advOpt.stateAfterAdv }]

      const activatable = getAllCreaturesOnField(advOpt.stateAfterAdv, side)
        .filter(c => canActivateEffect(advOpt.stateAfterAdv, c))

      // Top activations (budget-aware: novice=1, veteran=2)
      const activatableSlice = activatable.slice(0, maxActPerAdv)
      for (const creature of activatableSlice) {
        const effect = getEffect((creature.cardData as any).effectId)
        if (!effect) continue
        const cost = effect.activationCost ?? 0
        const ps = getPS(advOpt.stateAfterAdv, side)
        if (cost > ps) continue

        let targetId: string | undefined
        let validTarget = true
        if (effect.activationRequiresTarget) {
          const all = [
            ...getAllCreaturesOnField(advOpt.stateAfterAdv, side),
            ...getAllCreaturesOnField(advOpt.stateAfterAdv, oppSide),
          ].filter(c =>
            c.currentStats.defense > 0 &&
            (!effect.activationTargetFilter || effect.activationTargetFilter(c, creature, advOpt.stateAfterAdv)),
          )
          if (all.length > 0) targetId = all[0]!.instanceId
          else validTarget = false
        }
        if (validTarget) {
          const step: MCTSMove = {
            type: 'activate_effect',
            cardInstanceId: creature.instanceId,
            targetInstanceId: targetId,
          }
          const applied = applyMove(engine, advOpt.stateAfterAdv, step, side)
          actOptions.push({
            step,
            score: 12 + effectThreatTier((creature.cardData as any).effectId ?? '') * 2,
            finalState: applied ?? advOpt.stateAfterAdv,
          })
        }
      }

      // --- Combine steps → Full-Turn MacroMove (play + combat) ---
      for (const actOpt of actOptions) {
        const playSteps: MCTSMove[] = []
        let totalScore = 0

        if (creatureStep) {
          playSteps.push(creatureStep)
          totalScore += creatureScore
        }
        if (advOpt.step) {
          playSteps.push(advOpt.step)
          totalScore += advOpt.score
        }
        if (actOpt.step) {
          playSteps.push(actOpt.step)
          totalScore += actOpt.score
        }

        // V5: Situation-aware scoring bonus
        if (situation.phase === 'closing' && situation.winPath === 'ps_race') {
          if (advOpt.step?.useEnhanced) totalScore -= 5
          if (!creatureStep && !advOpt.step) totalScore += 3
        }
        if (situation.posture === 'defensive') {
          if (creatureStep?.cardInstanceId) {
            const c = player.hand.find(h => h.instanceId === creatureStep!.cardInstanceId)
            if (c && c.currentStats.defense >= 5) totalScore += 4
          }
        }
        if (!creatureStep && !advOpt.step && !actOpt.step) {
          const myFieldCount = lightFieldCount(lightState, sideNum)
          if (myFieldCount >= 4) totalScore += 3
          if (situation.phase === 'endgame') totalScore += 2
        }

        // V7: Generate combat plans → full-turn macros
        const lightForCombat = gameStateToLight(actOpt.finalState)
        const combatPlans = generateCombatPlans(lightForCombat, sideNum, maxCombatPlans)
        const playKey = playSteps.map(s => moveKey(s)).join('>')

        for (const cp of combatPlans) {
          const fullSteps: MCTSMove[] = [...playSteps, { type: 'advance_to_combat' }, ...cp.steps]
          const fullKey = playKey + '>>' + cp.key
          allMacros.push({ key: fullKey, steps: fullSteps, heuristicScore: totalScore + cp.heuristicScore })
          stateCache.set(fullKey, actOpt.finalState)
        }
      }
    }
  }

  // === 4. Dedup, sort, prune ===
  const seen = new Set<string>()
  const deduped: MacroMove[] = []
  for (const m of allMacros) {
    if (!seen.has(m.key)) {
      seen.add(m.key)
      deduped.push(m)
    }
  }

  deduped.sort((a, b) => b.heuristicScore - a.heuristicScore)
  const pruned = deduped.slice(0, maxMacros)

  // Only return states for pruned macros
  const prunedStates = new Map<string, GameState>()
  for (const m of pruned) {
    const s = stateCache.get(m.key)
    if (s) prunedStates.set(m.key, s)
  }

  return { macros: pruned, states: prunedStates }
}
