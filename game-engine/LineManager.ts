/**
 * LineManager — zarządza polem 3-liniowym.
 * Walidacja pozycji, zasięg ataku, dynamiczny front.
 */

import type { GameState, CardInstance, PlayerState } from './types'
import { BattleLine, AttackType, CardPosition } from './constants'
import type { PlayerSide } from './types'
import { GOLD_EDITION_RULES } from './constants'

// ===== ODCZYT POLA =====

export function getLine(state: GameState, side: PlayerSide, line: BattleLine): CardInstance[] {
  return state.players[side].field.lines[line]
}

export function getAllCreaturesOnField(state: GameState, side: PlayerSide): CardInstance[] {
  const player = state.players[side]
  return [
    ...player.field.lines[BattleLine.FRONT],
    ...player.field.lines[BattleLine.RANGED],
    ...player.field.lines[BattleLine.SUPPORT],
  ]
}

export function getTotalCreatureCount(state: GameState, side: PlayerSide): number {
  return getAllCreaturesOnField(state, side).length
}

// ===== DYNAMICZNY FRONT =====

/**
 * Zwraca pierwszą ZAJĘTĄ linię wroga — to jest "front" dla ataków Wręcz.
 * Jeśli L1 pusta → L2 staje się frontem. Jeśli L1 i L2 puste → L3.
 */
export function getEnemyFrontLine(state: GameState, attackerSide: PlayerSide): BattleLine | null {
  const defenderSide: PlayerSide = attackerSide === 'player1' ? 'player2' : 'player1'
  const lines = [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]

  for (const line of lines) {
    if (state.players[defenderSide].field.lines[line].length > 0) {
      return line
    }
  }
  return null  // wróg nie ma żadnych istot na polu
}

// ===== WALIDACJA WYSTAWIANIA =====

/**
 * Sprawdza czy gracz może wystawić kolejną istotę w tej turze.
 */
export function canPlayCreature(state: GameState, side: PlayerSide): boolean {
  const player = state.players[side]

  // Sprawdź limit pola (max 5 istot), chyba że Arkona jest aktywna
  const arkonaActive = player.activeLocation?.cardData.name === 'Arkona'
  if (!arkonaActive && getTotalCreatureCount(state, side) >= GOLD_EDITION_RULES.MAX_FIELD_CREATURES) {
    return false
  }

  // Sprawdź limit wystawiania na turę
  if (player.creaturesPlayedThisTurn >= GOLD_EDITION_RULES.PLAY_LIMIT_CREATURES) {
    return false
  }

  // Sprawdź efekt Areny: rywal nie może wystawić więcej istot niż zagrywający
  const opponentSide: PlayerSide = side === 'player1' ? 'player2' : 'player1'
  const opponent = state.players[opponentSide]
  const arenaEffect = opponent.activeLocation?.cardData.name === 'Arena'
  if (arenaEffect) {
    const opponentCount = getTotalCreatureCount(state, opponentSide)
    if (getTotalCreatureCount(state, side) >= opponentCount) {
      return false
    }
  }

  return true
}

/**
 * Sprawdza czy dane pole (linia) jest dostępna dla wystawianej istoty.
 * W Gold Edition: istoty mogą być wystawiane w dowolnej linii.
 */
export function canPlaceInLine(state: GameState, side: PlayerSide, line: BattleLine): boolean {
  const creatures = getLine(state, side, line)
  // Każda linia może mieć max 5 istot (lub bez limitu z Arkoną)
  const maxPerLine = 5
  return creatures.length < maxPerLine
}

// ===== WALIDACJA ATAKÓW =====

/**
 * Czy attacker może zaatakować target?
 * Uwzględnia: typ ataku, linie, latanie, dynamiczny front, Błotnik, etc.
 */
export function canAttack(
  state: GameState,
  attacker: CardInstance,
  target: CardInstance
): { valid: boolean; reason?: string } {
  if (attacker.position !== CardPosition.ATTACK) {
    return { valid: false, reason: 'Atakujący jest w pozycji obrony.' }
  }

  if (attacker.cannotAttack) {
    return { valid: false, reason: 'Atakujący nie może atakować (efekt statusu).' }
  }

  if (attacker.hasAttackedThisTurn) {
    return { valid: false, reason: 'Atakujący już atakował w tej turze.' }
  }

  if (attacker.owner === target.owner) {
    return { valid: false, reason: 'Nie można atakować własnych istot.' }
  }

  const attackerSide = attacker.owner
  const defenderSide = target.owner
  const attackType = (attacker.cardData as any).attackType as AttackType

  // Bitwa Nad Tollense: all creatures ignore line restrictions
  const bitwaActive = state.activeEvents?.some(e => e.cardData.effectId === 'adventure_bitwa_nad_tollense')
  if (!bitwaActive) {
    const rangeCheck = checkAttackRange(state, attackType, attacker, target)
    if (!rangeCheck.valid) return rangeCheck
  }

  // Sprawdź czy cel jest latający i czy atakujący może bić latające
  const targetFlying = isFlying(target)
  if (targetFlying && attackType === AttackType.MELEE && !isFlying(attacker)) {
    return { valid: false, reason: 'Atak Wręcz nie może bić latających istot.' }
  }

  // Sprawdź Błotnik — jeśli wróg ma Błotnika w zasięgu, musi go atakować
  const tauntTarget = findTauntTarget(state, attacker)
  if (tauntTarget && tauntTarget.instanceId !== target.instanceId) {
    return { valid: false, reason: `Musisz atakować ${tauntTarget.cardData.name} (Błotnik).` }
  }

  // Sprawdź Arena (enhanced) — czy karta ma lock na konkretny cel
  if (attacker.metadata.arenaLocked && attacker.metadata.arenaLockedToTarget !== target.instanceId) {
    return { valid: false, reason: 'Zraniona karta musi atakować swego oprawcę (Arena).' }
  }

  return { valid: true }
}

function checkAttackRange(
  state: GameState,
  attackType: AttackType,
  attacker: CardInstance,
  target: CardInstance
): { valid: boolean; reason?: string } {
  const attackerSide = attacker.owner
  const targetLine = target.line

  if (targetLine === null) {
    return { valid: false, reason: 'Cel nie jest na polu.' }
  }

  switch (attackType) {
    case AttackType.MELEE:
    case AttackType.ELEMENTAL: {
      // Wręcz/Żywioł może atakować TYLKO z linii L1 (Front)
      if (attacker.line !== BattleLine.FRONT) {
        return { valid: false, reason: 'Wręcz/Żywioł może atakować tylko z linii L1 (Front). Przenieś istotę do L1.' }
      }
      // Musi celować w pierwszą ZAJĘTĄ linię wroga (dynamiczny front)
      const frontLine = getEnemyFrontLine(state, attackerSide)
      if (frontLine === null) {
        return { valid: false, reason: 'Wróg nie ma istot na polu.' }
      }
      // Wyjątek: Żywioł może bić latające w dowolnej linii
      if (attackType === AttackType.ELEMENTAL && isFlying(target)) {
        return { valid: true }
      }
      if (targetLine !== frontLine) {
        return { valid: false, reason: `Wręcz/Żywioł musi celować w linię L${frontLine} (aktualny front wroga).` }
      }
      return { valid: true }
    }

    case AttackType.MAGIC:
    case AttackType.RANGED: {
      // Magia/Dystans — dowolna linia, z dowolnej własnej linii
      return { valid: true }
    }

    default:
      return { valid: false, reason: 'Nieznany typ ataku.' }
  }
}

function isFlying(card: CardInstance): boolean {
  if (card.isGrounded) return false
  return (card.cardData as any).isFlying === true
}

function findTauntTarget(state: GameState, attacker: CardInstance): CardInstance | null {
  const defenderSide: PlayerSide = attacker.owner === 'player1' ? 'player2' : 'player1'
  const enemies = getAllCreaturesOnField(state, defenderSide)

  for (const enemy of enemies) {
    if (enemy.cardData.name === 'Błotnik' || enemy.activeEffects.some(e => e.effectId === 'blotnik_taunt')) {
      // Sprawdź czy Błotnik jest w zasięgu ataku
      const canTargetBłotnik = canAttackIgnoringTaunt(state, attacker, enemy)
      if (canTargetBłotnik) return enemy
    }
  }
  return null
}

// Sprawdza zasięg bez sprawdzania tauntu (dla samego Błotnika)
function canAttackIgnoringTaunt(state: GameState, attacker: CardInstance, target: CardInstance): boolean {
  const attackType = (attacker.cardData as any).attackType as AttackType
  const result = checkAttackRange(state, attackType, attacker, target)
  return result.valid
}

// ===== WYSTAWIANIE KART =====

/**
 * Umieszcza istotę na polu w wybranej linii.
 * Nie sprawdza walidacji — użyj canPlayCreature przed wywołaniem.
 */
export function placeCreatureOnField(
  state: GameState,
  card: CardInstance,
  line: BattleLine,
  roundNumber: number
): void {
  const player = state.players[card.owner]
  card.line = line
  card.turnsInPlay = 0
  card.roundEnteredPlay = roundNumber
  card.isRevealed = false  // ujawnia się dopiero przy ataku/obronie

  // Usuń z ręki
  const handIdx = player.hand.findIndex(c => c.instanceId === card.instanceId)
  if (handIdx !== -1) {
    player.hand.splice(handIdx, 1)
  }

  player.field.lines[line].push(card)
  player.creaturesPlayedThisTurn += 1
}

/**
 * Usuwa istotę z pola (bez trafiania na cmentarz — użyj GameStateUtils.moveToGraveyard).
 */
export function removeFromField(state: GameState, instanceId: string): CardInstance | null {
  for (const player of Object.values(state.players)) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const idx = player.field.lines[line].findIndex(c => c.instanceId === instanceId)
      if (idx !== -1) {
        const [card] = player.field.lines[line].splice(idx, 1)
        card.line = null
        return card
      }
    }
  }
  return null
}

// ===== WALIDACJA WYGRANEJ =====

/**
 * Gold Edition: wróg przegrywa gdy nie ma istot na polu ORAZ talia jest pusta
 * lub nie ma istot nigdzie (pole + ręka + talia).
 */
export function checkWinCondition(state: GameState): PlayerSide | null {
  // Nie sprawdzaj wygranej przed pierwszą turą (obie talie jeszcze niedobrane)
  if (state.turnNumber <= 1 && state.roundNumber <= 1) return null

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const opponent: PlayerSide = side === 'player1' ? 'player2' : 'player1'
    const opp = state.players[opponent]

    const deckEmpty = opp.deck.length === 0
    const noCreaturesOnField = getTotalCreatureCount(state, opponent) === 0
    const noCreaturesInHand = opp.hand.filter(c => c.cardData.cardType === 'creature').length === 0
    const noCreaturesInDeck = opp.deck.filter(c => c.cardData.cardType === 'creature').length === 0

    // Wygrana: talia pusta I brak istot na polu, LUB brak istot absolutnie wszędzie
    if ((deckEmpty && noCreaturesOnField) || (noCreaturesOnField && noCreaturesInHand && noCreaturesInDeck)) {
      return side
    }
  }
  return null
}
