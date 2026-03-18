/**
 * StateAdapter — most między silnikiem gry a MCTS.
 *
 * Odpowiada za:
 * - Generowanie dostępnych ruchów (getAvailableMoves)
 * - Aplikowanie ruchów na stan gry (applyMove)
 * - Wykrywanie stanów terminalnych (isTerminal)
 * - Heurystyczną ewaluację stanu (evaluate)
 * - Heurystyczny scoring ruchów do progressive widening (scoreMove)
 */

import type { GameState, CardInstance, AdventureCardData } from '../types'
import type { PlayerSide } from '../types'
import type { MCTSMove } from './types'
import { GamePhase, BattleLine, CardPosition, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField, canAttack, canPlayCreature, canPlaceInLine } from '../LineManager'
import { canActivateEffect, getEffect } from '../EffectRegistry'
import { getOpponentSide } from '../GameStateUtils'
import type { GameEngine } from '../GameEngine'
import { effectThreatTier, hasSynergy } from './StrategicPatterns'

// ===== HELPERS =====

function getPS(state: GameState, side: PlayerSide): number {
  return state.gameMode === 'slava'
    ? state.players[side].glory
    : state.players[side].gold
}

function canAffordEnhanced(state: GameState, side: PlayerSide): boolean {
  return getPS(state, side) >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST
}

// ===== MOVE GENERATION =====

/**
 * Wygeneruj wszystkie legalne ruchy dla danej strony w bieżącym stanie.
 * Ruchy NIE są posortowane — sortowanie robi MCTSPlayer (wg scoreMove).
 */
export function getAvailableMoves(
  state: GameState,
  side: PlayerSide,
): MCTSMove[] {
  if (state.winner) return []
  if (state.currentTurn !== side) return [{ type: 'end_turn' }]
  if (state.pendingInteraction) return [{ type: 'end_turn' }]

  const moves: MCTSMove[] = []
  const player = state.players[side]
  const oppSide = getOpponentSide(side)

  // === FAZA PLAY ===
  if (state.currentPhase === GamePhase.PLAY) {
    // --- Wystawianie istot ---
    if (canPlayCreature(state, side)) {
      const creatures = player.hand.filter(
        (c) => c.cardData.cardType === 'creature',
      )
      for (const card of creatures) {
        const effect = getEffect((card.cardData as any).effectId)
        const targetSide = effect?.playOnEnemyField ? oppSide : side
        for (const line of [
          BattleLine.FRONT,
          BattleLine.RANGED,
          BattleLine.SUPPORT,
        ]) {
          if (canPlaceInLine(state, targetSide, line)) {
            moves.push({
              type: 'play_creature',
              cardInstanceId: card.instanceId,
              targetLine: line,
            })
          }
        }
      }
    }

    // --- Karty przygód ---
    const adventures = player.hand.filter(
      (c) => c.cardData.cardType === 'adventure',
    )
    const myField = getAllCreaturesOnField(state, side)
    const enemyField = getAllCreaturesOnField(state, oppSide)

    for (const adv of adventures) {
      const advData = adv.cardData as AdventureCardData
      const adventureType = (advData as any).adventureType as number

      if (adventureType === 1) {
        // ARTIFACT — cel: każdy sojusznik na polu
        for (const target of myField) {
          moves.push({
            type: 'play_adventure',
            cardInstanceId: adv.instanceId,
            targetInstanceId: target.instanceId,
            useEnhanced: false,
          })
          if (canAffordEnhanced(state, side) && advData.enhancedEffectId) {
            moves.push({
              type: 'play_adventure',
              cardInstanceId: adv.instanceId,
              targetInstanceId: target.instanceId,
              useEnhanced: true,
            })
          }
        }
        // Bez celu (jeśli pole puste, zagraj i tak — engine zdecyduje)
        if (myField.length === 0) {
          moves.push({
            type: 'play_adventure',
            cardInstanceId: adv.instanceId,
            useEnhanced: false,
          })
        }
      } else {
        // EVENT / LOCATION — ograniczone cele
        const targets: (string | undefined)[] = [undefined]
        if (enemyField.length > 0) {
          const strongest = enemyField.reduce((a, b) =>
            a.currentStats.attack + a.currentStats.defense >
            b.currentStats.attack + b.currentStats.defense
              ? a
              : b,
          )
          targets.push(strongest.instanceId)
        }
        if (myField.length > 0) {
          const strongest = myField.reduce((a, b) =>
            a.currentStats.attack + a.currentStats.defense >
            b.currentStats.attack + b.currentStats.defense
              ? a
              : b,
          )
          targets.push(strongest.instanceId)
        }

        for (const targetId of targets) {
          moves.push({
            type: 'play_adventure',
            cardInstanceId: adv.instanceId,
            targetInstanceId: targetId,
            useEnhanced: false,
          })
          if (canAffordEnhanced(state, side) && advData.enhancedEffectId) {
            moves.push({
              type: 'play_adventure',
              cardInstanceId: adv.instanceId,
              targetInstanceId: targetId,
              useEnhanced: true,
            })
          }
        }
      }
    }

    // --- Aktywacja zdolności ---
    const activatable = getAllCreaturesOnField(state, side).filter((c) =>
      canActivateEffect(state, c),
    )
    for (const creature of activatable) {
      const effect = getEffect((creature.cardData as any).effectId)
      if (!effect) continue
      const cost = effect.activationCost ?? 0
      if (cost > getPS(state, side)) continue

      if (effect.activationRequiresTarget) {
        const allCreatures = [
          ...getAllCreaturesOnField(state, side),
          ...getAllCreaturesOnField(state, oppSide),
        ]
        const validTargets = allCreatures.filter(
          (c) =>
            c.currentStats.defense > 0 &&
            (!effect.activationTargetFilter ||
              effect.activationTargetFilter(c, creature, state)),
        )
        for (const target of validTargets) {
          moves.push({
            type: 'activate_effect',
            cardInstanceId: creature.instanceId,
            targetInstanceId: target.instanceId,
          })
        }
      } else {
        moves.push({
          type: 'activate_effect',
          cardInstanceId: creature.instanceId,
        })
      }
    }

    // Przejście do fazy walki
    moves.push({ type: 'advance_to_combat' })
  }

  // === FAZA COMBAT ===
  if (state.currentPhase === GamePhase.COMBAT) {
    const myCreatures = getAllCreaturesOnField(state, side)

    // --- Zmiana pozycji ---
    for (const creature of myCreatures) {
      if (creature.position !== CardPosition.ATTACK) {
        moves.push({
          type: 'change_position',
          cardInstanceId: creature.instanceId,
          targetPosition: CardPosition.ATTACK,
        })
      }
      if (creature.position !== CardPosition.DEFENSE) {
        moves.push({
          type: 'change_position',
          cardInstanceId: creature.instanceId,
          targetPosition: CardPosition.DEFENSE,
        })
      }
    }

    // --- Ataki ---
    // Sprawdź limit ataków (ta sama logika co GameEngine.sideAttack)
    const sideCreatures = getAllCreaturesOnField(state, side)
    const normalAttacksUsed = sideCreatures
      .filter(
        (c) => (c.cardData as any).effectId !== 'kikimora_free_attack',
      )
      .filter((c) => {
        if (
          (c.cardData as any).effectId === 'lesnica_double_attack'
        ) {
          return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
        }
        return c.hasAttackedThisTurn
      }).length
    const hasChlop = sideCreatures.some(
      (c) => (c.cardData as any).effectId === 'chlop_extra_attack',
    )
    const maxAttacks = hasChlop ? 2 : 1

    if (normalAttacksUsed < maxAttacks) {
      const attackers = sideCreatures.filter(
        (c) =>
          c.position === CardPosition.ATTACK &&
          !c.hasAttackedThisTurn &&
          !c.cannotAttack,
      )
      const enemies = getAllCreaturesOnField(state, oppSide).filter(
        (c) => c.owner !== side,
      )

      for (const attacker of attackers) {
        for (const target of enemies) {
          if (canAttack(state, attacker, target).valid) {
            moves.push({
              type: 'attack',
              cardInstanceId: attacker.instanceId,
              targetInstanceId: target.instanceId,
            })
          }
        }
      }
    }

    // --- Łupienie ---
    if (
      state.roundNumber >= 3 &&
      getAllCreaturesOnField(state, oppSide).length === 0
    ) {
      moves.push({ type: 'plunder' })
    }
  }

  // End turn — zawsze dostępne
  if (!state.winner) {
    moves.push({ type: 'end_turn' })
  }

  return moves
}

// ===== MOVE APPLICATION =====

/**
 * Zastosuj ruch na stanie gry przez GameEngine.
 * Zwraca nowy stan lub null jeśli ruch nie powiódł się.
 *
 * Engine jest reużywany (loadState → apply → getState) — oszczędza inicjalizację.
 */
export function applyMove(
  engine: GameEngine,
  state: GameState,
  move: MCTSMove,
  side: PlayerSide,
): GameState | null {
  engine.loadState(state)

  try {
    switch (move.type) {
      case 'play_creature':
        engine.sidePlayCreature(
          side,
          move.cardInstanceId!,
          move.targetLine!,
          undefined,
          true, // skipStrelaCheck — symulacja nie wspiera Strela interakcji
        )
        break
      case 'play_adventure':
        engine.sidePlayAdventure(
          side,
          move.cardInstanceId!,
          move.targetInstanceId,
          move.useEnhanced ?? false,
          true,
        )
        break
      case 'attack':
        engine.sideAttack(side, move.cardInstanceId!, move.targetInstanceId!)
        engine.lastCombatResult = null
        break
      case 'change_position':
        engine.sideChangePosition(
          side,
          move.cardInstanceId!,
          move.targetPosition!,
        )
        break
      case 'activate_effect':
        engine.sideActivateEffect(
          side,
          move.cardInstanceId!,
          move.targetInstanceId,
        )
        break
      case 'advance_to_combat':
        engine.sideAdvancePhase(side)
        break
      case 'end_turn':
        engine.sideEndTurn(side)
        break
      case 'plunder':
        engine.sidePlunder(side)
        break
      case 'invoke_god':
        engine.sideInvokeGod(side, move.godId!, move.bidAmount ?? 1)
        break
      default:
        return null
    }

    // Auto-resolve pending interactions
    autoResolveInteractions(engine)

    return engine.getState()
  } catch {
    return null
  }
}

/**
 * Auto-rozwiąż oczekujące interakcje (Chowaniec, Kresnik, etc.).
 * Wybiera pierwszą dostępną opcję — wystarczające dla symulacji.
 */
function autoResolveInteractions(engine: GameEngine): void {
  let guard = 0
  let state = engine.getState()
  while (state.pendingInteraction && guard++ < 10) {
    try {
      const choices = state.pendingInteraction.availableChoices
      const targets = state.pendingInteraction.availableTargetIds
      const choice = choices?.[0] ?? targets?.[0] ?? 'yes'
      engine.resolvePendingInteraction(choice)
      engine.lastCombatResult = null
      state = engine.getState()
    } catch {
      break
    }
  }
}

// ===== TERMINAL CHECK =====

export function isTerminal(state: GameState): boolean {
  return state.winner !== null
}

// ===== HEURISTIC EVALUATION =====

/**
 * Ewaluacja heurystyczna V5 — threat-weighted, tempo, synergy.
 * Mirror of evaluateLight() but on full GameState.
 * Zwraca wartość w [0, 1] z perspektywy `side`.
 */
export function evaluate(state: GameState, side: PlayerSide): number {
  if (state.winner === side) return 1.0
  if (state.winner !== null) return 0.0

  const oppSide = getOpponentSide(side)
  const me = state.players[side]
  const opp = state.players[oppSide]

  const psTarget = GOLD_EDITION_RULES.GLORY_WIN_TARGET
  const myPS = getPS(state, side)
  const oppPS = getPS(state, oppSide)

  // === PS ===
  const psScore = (myPS - oppPS) / (psTarget * 2)
  const psProximityBonus =
    myPS >= psTarget - 1 ? 0.15 : myPS >= psTarget - 2 ? 0.05 : 0
  const oppPsProximityPenalty =
    oppPS >= psTarget - 1 ? -0.15 : oppPS >= psTarget - 2 ? -0.05 : 0

  // === Threat-weighted field power ===
  const myCreatures = getAllCreaturesOnField(state, side)
  const oppCreatures = getAllCreaturesOnField(state, oppSide)

  let myThreat = 0, oppThreat = 0
  let myActiveAtk = 0, myActiveCount = 0
  let oppActiveAtk = 0, oppActiveCount = 0
  let oppUnansweredThreats = 0

  for (const c of myCreatures) {
    const eid = (c.cardData as any).effectId ?? ''
    myThreat += c.currentStats.attack * 1.5 + c.currentStats.defense * 0.7 + effectThreatTier(eid) * 3
    if (c.position === CardPosition.ATTACK && !c.cannotAttack && (c.paralyzeRoundsLeft ?? -1) < 0) {
      myActiveAtk += c.currentStats.attack
      myActiveCount++
    }
  }
  for (const c of oppCreatures) {
    const eid = (c.cardData as any).effectId ?? ''
    const tier = effectThreatTier(eid)
    oppThreat += c.currentStats.attack * 1.5 + c.currentStats.defense * 0.7 + tier * 3
    if (c.position === CardPosition.ATTACK && !c.cannotAttack && (c.paralyzeRoundsLeft ?? -1) < 0) {
      oppActiveAtk += c.currentStats.attack
      oppActiveCount++
    }
    if (tier >= 5 && !c.isSilenced) oppUnansweredThreats++
  }

  const totalThreat = myThreat + oppThreat || 1
  const threatPowerScore = (myThreat - oppThreat) / totalThreat

  // === Tempo ===
  const myAvgAtk = myActiveCount > 0 ? myActiveAtk / myActiveCount : 0
  const oppAvgAtk = oppActiveCount > 0 ? oppActiveAtk / oppActiveCount : 0
  const tempoScore = (myActiveCount * myAvgAtk - oppActiveCount * oppAvgAtk) / 20

  // === Synergy ===
  let mySynergies = 0, oppSynergies = 0
  for (let i = 0; i < myCreatures.length; i++) {
    for (let j = i + 1; j < myCreatures.length; j++) {
      const eid1 = (myCreatures[i]!.cardData as any).effectId ?? ''
      const eid2 = (myCreatures[j]!.cardData as any).effectId ?? ''
      if (eid1 && eid2 && hasSynergy(eid1, eid2)) mySynergies++
    }
  }
  for (let i = 0; i < oppCreatures.length; i++) {
    for (let j = i + 1; j < oppCreatures.length; j++) {
      const eid1 = (oppCreatures[i]!.cardData as any).effectId ?? ''
      const eid2 = (oppCreatures[j]!.cardData as any).effectId ?? ''
      if (eid1 && eid2 && hasSynergy(eid1, eid2)) oppSynergies++
    }
  }
  const synergyScore = (mySynergies - oppSynergies) * 0.02

  // === Threat penalty ===
  const threatPenalty = -oppUnansweredThreats * 0.03

  // === Creature count ===
  const creatureScore = (myCreatures.length - oppCreatures.length) / 10

  // === Hand (quality-aware) ===
  const myHandQ = me.hand.reduce((s, c) => s + 1 + effectThreatTier((c.cardData as any).effectId ?? '') * 0.1, 0)
  const oppHandQ = opp.hand.reduce((s, c) => s + 1 + effectThreatTier((c.cardData as any).effectId ?? '') * 0.1, 0)
  const handScore = (myHandQ - oppHandQ) / 20

  // === Soul Harvest ===
  const myHarvestFull = Math.floor(me.soulPoints / GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD)
  const oppHarvestFull = Math.floor(opp.soulPoints / GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD)
  const myPartial = (me.soulPoints % GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD) / GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD
  const oppPartial = (opp.soulPoints % GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD) / GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD
  const soulScore = ((myHarvestFull + myPartial * 0.3) - (oppHarvestFull + oppPartial * 0.3)) / 5

  // === Elimination ===
  const myTotal = me.deck.length + me.hand.length + myCreatures.length
  const oppTotal = opp.deck.length + opp.hand.length + oppCreatures.length
  let elimScore = 0
  if (me.deck.length === 0 && myCreatures.length === 0) elimScore -= 0.30
  else if (myTotal <= 3) elimScore -= 0.10
  if (opp.deck.length === 0 && oppCreatures.length === 0) elimScore += 0.30
  else if (oppTotal <= 3) elimScore += 0.10

  // V6: Gold zero risk
  const goldZeroRisk = myPS <= 1 ? -0.08 : myPS <= 2 ? -0.03 : 0
  const oppGoldZeroBonus = oppPS <= 1 ? 0.06 : oppPS <= 2 ? 0.02 : 0

  // V6: Deck depletion
  const myRunway = me.deck.length + me.hand.filter(c => c.cardData.cardType === 'creature').length
  const oppRunway = opp.deck.length + opp.hand.filter(c => c.cardData.cardType === 'creature').length
  const depletionScore = (myRunway - oppRunway) / 30

  const raw = 0.5
    + psScore * 0.25
    + threatPowerScore * 0.18
    + tempoScore * 0.06
    + synergyScore * 0.04
    + threatPenalty * 0.06
    + depletionScore * 0.05
    + creatureScore * 0.06
    + handScore * 0.04
    + soulScore * 0.06
    + psProximityBonus
    + oppPsProximityPenalty
    + elimScore
    + goldZeroRisk + oppGoldZeroBonus

  return Math.max(0, Math.min(1, raw))
}

// ===== MOVE SCORING (dla progressive widening) =====

/**
 * Heurystyczny scoring ruchu — wyższy = bardziej obiecujący.
 * Używany do sortowania ruchów w MCTSNode (najlepsze eksplorowane pierwsze).
 */
export function scoreMove(
  state: GameState,
  move: MCTSMove,
  side: PlayerSide,
): number {
  const oppSide = getOpponentSide(side)

  switch (move.type) {
    case 'play_creature': {
      const card = state.players[side].hand.find(
        (c) => c.instanceId === move.cardInstanceId,
      )
      if (!card) return 0
      const eid = (card.cardData as any).effectId ?? ''
      let score = card.currentStats.attack + card.currentStats.defense
      // V5: effectThreatTier-based scoring instead of flat bonuses
      score += effectThreatTier(eid) * 2
      const effect = getEffect(eid)
      if (effect) {
        const triggers = Array.isArray(effect.trigger)
          ? effect.trigger
          : [effect.trigger]
        if (triggers.some((t) => String(t) === 'on_play')) score += 5
        if (effect.activatable) score += 3
      }
      return score + 5
    }

    case 'attack': {
      const attacker = findCardOnField(state, side, move.cardInstanceId!)
      const target = findCardOnField(state, oppSide, move.targetInstanceId!)
      if (!attacker || !target) return 0
      const canKill = target.currentStats.defense <= attacker.currentStats.attack
      const willSurvive =
        attacker.currentStats.defense > target.currentStats.attack
      const targetTier = effectThreatTier((target.cardData as any).effectId ?? '')
      let score = canKill ? 25 : 5
      if (canKill && willSurvive) score += 15
      if (!canKill && !willSurvive) score -= 10
      score += target.currentStats.attack * 2
      score += targetTier * 3  // V5: prioritize high-threat targets
      return Math.max(0, score)
    }

    case 'activate_effect':
      return 12

    case 'play_adventure':
      return move.useEnhanced ? 10 : 7

    case 'change_position':
      return 4

    case 'plunder':
      return 18

    case 'advance_to_combat':
      return 3

    case 'end_turn':
      return 1

    default:
      return 0
  }
}

function findCardOnField(
  state: GameState,
  side: PlayerSide,
  instanceId: string,
): CardInstance | null {
  return (
    getAllCreaturesOnField(state, side).find(
      (c) => c.instanceId === instanceId,
    ) ?? null
  )
}
