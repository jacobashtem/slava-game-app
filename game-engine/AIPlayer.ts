/**
 * AIPlayer — interfejs i implementacja gracza komputerowego.
 * Etap 2: EASY AI (losowa karta, losowy cel).
 * Etap 3: MEDIUM AI (heurystyki).
 */

import type { GameState, CardInstance } from './types'
import { BattleLine, CardPosition, GamePhase, AttackType } from './constants'
import type { PlayerSide } from './types'
import { cloneGameState, addLog } from './GameStateUtils'
import { canAttack, canPlayCreature, canPlaceInLine, getAllCreaturesOnField, getEnemyFrontLine } from './LineManager'
import { playCreature, playAdventure, performAttack, changePosition } from './TurnManager'
import { GOLD_EDITION_RULES } from './constants'

export type AIDifficulty = 'easy' | 'medium' | 'hard'

export interface AIDecision {
  type: 'play_creature' | 'play_adventure' | 'attack' | 'change_position' | 'end_turn'
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
}

// ===================================================================
// GŁÓWNA KLASA AI
// ===================================================================

export class AIPlayer {
  constructor(
    private side: PlayerSide,
    private difficulty: AIDifficulty = 'easy'
  ) {}

  /**
   * Zwraca listę decyzji dla całej tury AI.
   * GameEngine wykonuje je sekwencyjnie z opóźnieniami.
   */
  planTurn(state: GameState): AIDecision[] {
    switch (this.difficulty) {
      case 'easy': return this.planEasyTurn(state)
      case 'medium': return this.planMediumTurn(state)
      default: return this.planEasyTurn(state)
    }
  }

  // ===================================================================
  // EASY AI — losowe decyzje
  // ===================================================================

  private planEasyTurn(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []
    let currentState = cloneGameState(state)

    // FAZA PLAY: wylosuj istotę do wystawienia
    const player = currentState.players[this.side]
    const creaturesInHand = player.hand.filter(c => c.cardData.cardType === 'creature')

    if (creaturesInHand.length > 0 && canPlayCreature(currentState, this.side)) {
      const card = randomChoice(creaturesInHand)
      const line = this.chooseLineForCreature(currentState, card)
      if (line !== null) {
        decisions.push({
          type: 'play_creature',
          cardInstanceId: card.instanceId,
          targetLine: line,
        })
        // Symuluj wystawienie dla dalszego planowania
        try {
          const { newState } = playCreature(currentState, card.instanceId, line)
          currentState = newState
        } catch {}
      }
    }

    // FAZA PLAY: zagraj przygodę (efekt podstawowy darmowy)
    if (player.adventuresPlayedThisTurn === 0) {
      const adventuresInHand = player.hand.filter(c => c.cardData.cardType === 'adventure')
      if (adventuresInHand.length > 0) {
        const card = randomChoice(adventuresInHand)
        decisions.push({
          type: 'play_adventure',
          cardInstanceId: card.instanceId,
        })
      }
    }

    // FAZA COMBAT: zmień pozycje na Atak
    const myCreatures = getAllCreaturesOnField(currentState, this.side)
    const hasEnemies = getAllCreaturesOnField(currentState, this.side === 'player1' ? 'player2' : 'player1').length > 0

    for (const creature of myCreatures) {
      // 50% szans na zmianę pozycji
      if (Math.random() > 0.5 && creature.position !== CardPosition.ATTACK) {
        decisions.push({
          type: 'change_position',
          cardInstanceId: creature.instanceId,
          targetPosition: CardPosition.ATTACK,
        })
      }
    }

    // FAZA COMBAT: zaatakuj losowym atakującym
    const attackers = getAllCreaturesOnField(currentState, this.side)
      .filter(c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack)

    const enemies = getAllCreaturesOnField(currentState, this.side === 'player1' ? 'player2' : 'player1')

    for (const attacker of attackers) {
      const validTargets = enemies.filter(e => canAttack(currentState, attacker, e).valid)
      if (validTargets.length > 0) {
        const target = randomChoice(validTargets)
        decisions.push({
          type: 'attack',
          cardInstanceId: attacker.instanceId,
          targetInstanceId: target.instanceId,
        })
      }
    }

    decisions.push({ type: 'end_turn' })
    return decisions
  }

  // ===================================================================
  // MEDIUM AI — heurystyki
  // ===================================================================

  private planMediumTurn(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []
    let currentState = cloneGameState(state)
    const player = currentState.players[this.side]

    // PLAY: wystaw najsilniejszą istotę
    if (canPlayCreature(currentState, this.side)) {
      const creaturesInHand = player.hand
        .filter(c => c.cardData.cardType === 'creature')
        .sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))

      if (creaturesInHand.length > 0) {
        const card = creaturesInHand[0]
        const line = this.chooseLineStrategic(currentState, card)
        if (line !== null) {
          decisions.push({ type: 'play_creature', cardInstanceId: card.instanceId, targetLine: line })
          try {
            const { newState } = playCreature(currentState, card.instanceId, line)
            currentState = newState
          } catch {}
        }
      }
    }

    // COMBAT: ustaw pozycje — słabe istoty (def ≤ 2) w obronę, reszta w atak
    const myCreatures = getAllCreaturesOnField(currentState, this.side)
    for (const creature of myCreatures) {
      const shouldDefend = creature.currentStats.defense <= 2
      const targetPos = shouldDefend ? CardPosition.DEFENSE : CardPosition.ATTACK
      if (creature.position !== targetPos) {
        decisions.push({ type: 'change_position', cardInstanceId: creature.instanceId, targetPosition: targetPos })
      }
    }

    // COMBAT: atakuj optymalnie
    const attackers = getAllCreaturesOnField(currentState, this.side)
      .filter(c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack)

    const enemies = getAllCreaturesOnField(currentState, this.side === 'player1' ? 'player2' : 'player1')

    for (const attacker of attackers) {
      const validTargets = enemies.filter(e => canAttack(currentState, attacker, e).valid)
      if (validTargets.length === 0) continue

      // Priorytety celów:
      // 1. Cel który mogę zabić jednym ciosem
      // 2. Cel z najniższą obroną
      // 3. Cel z najwyższym atakiem

      let target = validTargets.find(t => t.currentStats.defense <= attacker.currentStats.attack)
        ?? validTargets.reduce((best, t) => t.currentStats.defense < best.currentStats.defense ? t : best)

      decisions.push({
        type: 'attack',
        cardInstanceId: attacker.instanceId,
        targetInstanceId: target.instanceId,
      })
    }

    decisions.push({ type: 'end_turn' })
    return decisions
  }

  // ===================================================================
  // HELPERS
  // ===================================================================

  private chooseLineForCreature(state: GameState, card: CardInstance): BattleLine | null {
    // Priorytet: L1 → L2 → L3 (wolne miejsce)
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      if (canPlaceInLine(state, this.side, line)) return line
    }
    return null
  }

  private chooseLineStrategic(state: GameState, card: CardInstance): BattleLine | null {
    const attackType = (card.cardData as any).attackType as AttackType

    // Wręcz/Żywioł → L1, Dystans → L2, Magia → L3 (jeśli dostępne)
    const preferredLine = attackType === AttackType.MAGIC
      ? BattleLine.SUPPORT
      : attackType === AttackType.RANGED
        ? BattleLine.RANGED
        : BattleLine.FRONT

    if (canPlaceInLine(state, this.side, preferredLine)) return preferredLine

    // Fallback: pierwsze wolne miejsce
    return this.chooseLineForCreature(state, card)
  }
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
