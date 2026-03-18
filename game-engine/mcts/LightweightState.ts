/**
 * LightweightState — ultra-szybka reprezentacja stanu gry do symulacji MCTS.
 *
 * Problem: JSON.stringify/parse pełnego GameState kosztuje ~2ms.
 * LightState klonuje się w <0.05ms (40-200x szybciej).
 *
 * Jak? Zamiast serializować ~100KB z cardData/actionLog/lore,
 * przechowujemy TYLKO dane potrzebne do symulacji:
 * - Statystyki kart (ATK/DEF/effectId/position)
 * - Strefowe tablice (hand/field/deck count)
 * - Globalne liczniki (PS/soulPoints/round/turn)
 *
 * Karty to płaskie obiekty z ~15 polami — spread copy w <0.01ms.
 */

import type { GameState, CardInstance, PlayerSide } from '../types'
import { BattleLine, CardPosition, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField } from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'
import { effectThreatTier, countFieldSynergies } from './StrategicPatterns'

// ===== LIGHT CARD =====

export interface LightCard {
  instanceId: string
  effectId: string
  atk: number
  def: number
  maxDef: number
  maxAtk: number
  soulValue: number
  position: number      // 0=DEFENSE, 1=ATTACK
  attackType: number    // 0=MELEE, 1=ELEMENTAL, 2=MAGIC, 3=RANGED
  cardType: number      // 0=creature, 1=adventure
  owner: number         // 0=player1, 1=player2
  domain: number        // 1=Perun, 2=Zyvi, 3=Undead, 4=Weles
  hasAttacked: boolean
  cannotAttack: boolean
  isSilenced: boolean
  isFlying: boolean
  isImmune: boolean
  isGrounded: boolean
  poisonRounds: number  // -1=brak, 0+=ile rund do śmierci
  paralyzeRounds: number // -1=brak, 0+=ile rund do odblokowania
  turnsInPlay: number
  artifactCount: number
}

// ===== LIGHT ADVENTURE =====

export interface LightAdventure {
  instanceId: string
  effectId: string
  enhancedEffectId: string
  adventureType: number  // 0=event, 1=artifact, 2=location
}

// ===== LIGHT STATE =====

export interface LightState {
  // Per player [0]=player1, [1]=player2
  ps: [number, number]
  soulPoints: [number, number]
  deckCount: [number, number]
  creaturesPlayed: [number, number]

  // Hands — actual creatures (rollout needs to pick which to play)
  hands: [LightCard[], LightCard[]]

  // Decks — shuffled creatures (rollout draws from here)
  decks: [LightCard[], LightCard[]]

  // Field — 6 arrays: [p1Front, p1Ranged, p1Support, p2Front, p2Ranged, p2Support]
  field: [LightCard[], LightCard[], LightCard[], LightCard[], LightCard[], LightCard[]]

  // Adventure hands (separate from creature hands)
  adventureHands: [LightAdventure[], LightAdventure[]]
  adventuresPlayed: [number, number]

  // Anti-stall: ile tur z rzędu gracz nie atakował mając istoty
  consecutivePasses: [number, number]

  // Global
  currentTurn: number   // 0 or 1
  round: number
  winner: number        // -1=none, 0=player1 wins, 1=player2 wins
}

// ===== CONVERSION: GameState → LightState =====

function cardToLight(card: CardInstance): LightCard {
  return {
    instanceId: card.instanceId,
    effectId: (card.cardData as any).effectId ?? '',
    atk: card.currentStats.attack,
    def: card.currentStats.defense,
    maxDef: card.currentStats.maxDefense,
    maxAtk: card.currentStats.maxAttack,
    soulValue: card.currentStats.soulValue ?? (card.currentStats.attack + card.currentStats.defense),
    position: card.position === CardPosition.ATTACK ? 1 : 0,
    attackType: (card.cardData as any).attackType ?? 0,
    cardType: card.cardData.cardType === 'creature' ? 0 : 1,
    owner: card.owner === 'player1' ? 0 : 1,
    domain: (card.cardData as any).domain ?? 0,
    hasAttacked: card.hasAttackedThisTurn,
    cannotAttack: card.cannotAttack,
    isSilenced: card.isSilenced,
    isFlying: (card.cardData as any).combat?.isFlying ?? false,
    isImmune: card.isImmune,
    isGrounded: card.isGrounded,
    poisonRounds: card.poisonRoundsLeft ?? -1,
    paralyzeRounds: card.paralyzeRoundsLeft ?? -1,
    turnsInPlay: card.turnsInPlay,
    artifactCount: card.equippedArtifacts.length,
  }
}

function advToLight(card: CardInstance): LightAdventure {
  const data = card.cardData as any
  return {
    instanceId: card.instanceId,
    effectId: data.effectId ?? '',
    enhancedEffectId: data.enhancedEffectId ?? '',
    adventureType: data.adventureType ?? 0,
  }
}

export function gameStateToLight(state: GameState): LightState {
  const p1 = state.players.player1
  const p2 = state.players.player2

  const getPS = (side: 'player1' | 'player2') =>
    state.gameMode === 'slava' ? state.players[side].glory : state.players[side].gold

  return {
    ps: [getPS('player1'), getPS('player2')],
    soulPoints: [p1.soulPoints, p2.soulPoints],
    deckCount: [p1.deck.length, p2.deck.length],
    creaturesPlayed: [p1.creaturesPlayedThisTurn, p2.creaturesPlayedThisTurn],

    hands: [
      p1.hand.filter(c => c.cardData.cardType === 'creature').map(cardToLight),
      p2.hand.filter(c => c.cardData.cardType === 'creature').map(cardToLight),
    ],
    decks: [
      p1.deck.filter(c => c.cardData.cardType === 'creature').map(cardToLight),
      p2.deck.filter(c => c.cardData.cardType === 'creature').map(cardToLight),
    ],
    adventureHands: [
      p1.hand.filter(c => c.cardData.cardType === 'adventure').map(advToLight),
      p2.hand.filter(c => c.cardData.cardType === 'adventure').map(advToLight),
    ],
    adventuresPlayed: [p1.adventuresPlayedThisTurn, p2.adventuresPlayedThisTurn],

    field: [
      p1.field.lines[BattleLine.FRONT].map(cardToLight),
      p1.field.lines[BattleLine.RANGED].map(cardToLight),
      p1.field.lines[BattleLine.SUPPORT].map(cardToLight),
      p2.field.lines[BattleLine.FRONT].map(cardToLight),
      p2.field.lines[BattleLine.RANGED].map(cardToLight),
      p2.field.lines[BattleLine.SUPPORT].map(cardToLight),
    ],

    consecutivePasses: [p1.consecutivePasses, p2.consecutivePasses],
    currentTurn: state.currentTurn === 'player1' ? 0 : 1,
    round: state.roundNumber,
    winner: state.winner === null ? -1 : state.winner === 'player1' ? 0 : 1,
  }
}

// ===== CLONE — ultra-fast (<0.05ms) =====

export function cloneLightState(s: LightState): LightState {
  return {
    ps: [s.ps[0], s.ps[1]],
    soulPoints: [s.soulPoints[0], s.soulPoints[1]],
    deckCount: [s.deckCount[0], s.deckCount[1]],
    creaturesPlayed: [s.creaturesPlayed[0], s.creaturesPlayed[1]],
    consecutivePasses: [s.consecutivePasses[0], s.consecutivePasses[1]],
    hands: [
      s.hands[0].map(c => ({ ...c })),
      s.hands[1].map(c => ({ ...c })),
    ],
    decks: [
      s.decks[0].map(c => ({ ...c })),
      s.decks[1].map(c => ({ ...c })),
    ],
    adventureHands: [
      s.adventureHands[0].map(a => ({ ...a })),
      s.adventureHands[1].map(a => ({ ...a })),
    ],
    adventuresPlayed: [s.adventuresPlayed[0], s.adventuresPlayed[1]],
    field: [
      s.field[0].map(c => ({ ...c })),
      s.field[1].map(c => ({ ...c })),
      s.field[2].map(c => ({ ...c })),
      s.field[3].map(c => ({ ...c })),
      s.field[4].map(c => ({ ...c })),
      s.field[5].map(c => ({ ...c })),
    ],
    currentTurn: s.currentTurn,
    round: s.round,
    winner: s.winner,
  }
}

// ===== FIELD HELPERS =====

/** Wszystkie istoty na polu danego gracza (3 linie) */
export function lightFieldCards(s: LightState, side: number): LightCard[] {
  const base = side * 3 // 0=p1 (lines 0,1,2), 1=p2 (lines 3,4,5)
  return [...s.field[base]!, ...s.field[base + 1]!, ...s.field[base + 2]!]
}

/** Liczba istot na polu */
export function lightFieldCount(s: LightState, side: number): number {
  const base = side * 3
  return s.field[base]!.length + s.field[base + 1]!.length + s.field[base + 2]!.length
}

/** Zero-allocation: czy na polu jest aktywny efekt? */
export function hasFieldEffect(s: LightState, side: number, effectId: string): boolean {
  const base = side * 3
  for (let i = 0; i < 3; i++) {
    for (const c of s.field[base + i]!) {
      if (c.effectId === effectId && !c.isSilenced) return true
    }
  }
  return false
}

/** Zero-allocation: iteruj po kartach na polu */
export function forEachFieldCard(s: LightState, side: number, fn: (c: LightCard) => boolean | void): void {
  const base = side * 3
  for (let i = 0; i < 3; i++) {
    for (const c of s.field[base + i]!) {
      if (fn(c) === false) return
    }
  }
}

/**
 * Evaluation V5 — domain-aware with threat-weighted power, tempo, synergy.
 *
 * Weights:
 *   psScore      * 0.30
 *   threatPower  * 0.22
 *   tempo        * 0.07
 *   synergy      * 0.05
 *   threatPenalty* 0.08 (negative — unanswered threats)
 *   creatureScore* 0.08
 *   handScore    * 0.05
 *   soulScore    * 0.08
 */
/**
 * evaluateLight V6 — multi-turn strategic awareness.
 *
 * V5 signals: threatPower, tempo, synergy, threatPenalty
 * V6 NEW: raceScore, depletionRisk, wallPenalty, harvestProximity, goldZeroRisk
 */
export function evaluateLight(s: LightState, side: number): number {
  if (s.winner === side) return 1.0
  if (s.winner !== -1) return 0.0

  const opp = 1 - side
  const psTarget = GOLD_EDITION_RULES.GLORY_WIN_TARGET
  const threshold = GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD

  // === PS ===
  const myPS = s.ps[side]!
  const oppPS = s.ps[opp]!
  const psScore = (myPS - oppPS) / (psTarget * 2)
  const psProximity = myPS >= psTarget - 1 ? 0.15 : myPS >= psTarget - 2 ? 0.05 : 0
  const oppProximity = oppPS >= psTarget - 1 ? -0.15 : oppPS >= psTarget - 2 ? -0.05 : 0

  // === Field analysis (single pass over both sides) ===
  const myCards = lightFieldCards(s, side)
  const oppCards = lightFieldCards(s, opp)
  let myThreat = 0, oppThreat = 0
  let myActiveAtk = 0, myActiveCount = 0
  let oppActiveAtk = 0, oppActiveCount = 0
  let oppUnansweredThreats = 0
  let myTotalSoulValue = 0   // V6: soul value of my creatures (what opp gains killing them)
  let oppTotalSoulValue = 0  // V6: soul value of opp creatures (what I gain killing them)
  let myMaxAtk = 0           // V6: for wall detection
  let oppMaxDef = 0          // V6: for wall detection

  for (const c of myCards) {
    myThreat += c.atk * 1.5 + c.def * 0.7 + effectThreatTier(c.effectId) * 3
    myTotalSoulValue += c.soulValue
    if (c.atk > myMaxAtk) myMaxAtk = c.atk
    if (c.position === 1 && !c.cannotAttack && c.paralyzeRounds < 0) {
      myActiveAtk += c.atk
      myActiveCount++
    }
  }
  for (const c of oppCards) {
    const tier = effectThreatTier(c.effectId)
    oppThreat += c.atk * 1.5 + c.def * 0.7 + tier * 3
    oppTotalSoulValue += c.soulValue
    if (c.def > oppMaxDef) oppMaxDef = c.def
    if (c.position === 1 && !c.cannotAttack && c.paralyzeRounds < 0) {
      oppActiveAtk += c.atk
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
  const mySynergies = countFieldSynergies(s, side)
  const oppSynergies = countFieldSynergies(s, opp)
  const synergyScore = (mySynergies - oppSynergies) * 0.02

  // === Threat penalty ===
  const threatPenalty = -oppUnansweredThreats * 0.03

  // === Creature count ===
  const creatureScore = (myCards.length - oppCards.length) / 10

  // === Hand quality ===
  const myHandQuality = s.hands[side]!.reduce((sum, c) => sum + 1 + effectThreatTier(c.effectId) * 0.1, 0)
  const oppHandQuality = s.hands[opp]!.reduce((sum, c) => sum + 1 + effectThreatTier(c.effectId) * 0.1, 0)
  const handScore = (myHandQuality - oppHandQuality) / 20

  // === Soul harvest ===
  const myHarvest = Math.floor(s.soulPoints[side]! / threshold)
  const oppHarvest = Math.floor(s.soulPoints[opp]! / threshold)
  const myPartial = (s.soulPoints[side]! % threshold) / threshold
  const oppPartial = (s.soulPoints[opp]! % threshold) / threshold
  const soulScore = ((myHarvest + myPartial * 0.3) - (oppHarvest + oppPartial * 0.3)) / 5

  // === Elimination ===
  const myTotal = s.deckCount[side]! + s.hands[side]!.length + myCards.length
  const oppTotal = s.deckCount[opp]! + s.hands[opp]!.length + oppCards.length
  let elimScore = 0
  if (s.deckCount[side]! === 0 && myCards.length === 0) elimScore -= 0.30
  else if (myTotal <= 3) elimScore -= 0.10
  if (s.deckCount[opp]! === 0 && oppCards.length === 0) elimScore += 0.30
  else if (oppTotal <= 3) elimScore += 0.10

  // === Anti-stall ===
  const passPenalty = s.consecutivePasses[side]! >= 3 ? -0.10
    : s.consecutivePasses[side]! >= 2 ? -0.03 : 0
  const oppPassBonus = s.consecutivePasses[opp]! >= 3 ? 0.10
    : s.consecutivePasses[opp]! >= 2 ? 0.03 : 0

  // =====================================================
  // V6 NEW SIGNALS — multi-turn strategic awareness
  // =====================================================

  // 1. TIME-TO-WIN RACE: who wins the PS race?
  //    harvestRate = how much PS I gain per "clearing opponent's field"
  const myHarvestRate = oppTotalSoulValue > 0 ? oppTotalSoulValue / threshold : 0
  const oppHarvestRate = myTotalSoulValue > 0 ? myTotalSoulValue / threshold : 0
  const myTurnsToWin = myHarvestRate > 0.01 ? (psTarget - myPS) / myHarvestRate : 99
  const oppTurnsToWin = oppHarvestRate > 0.01 ? (psTarget - oppPS) / oppHarvestRate : 99
  const raceScore = Math.max(-0.15, Math.min(0.15, (oppTurnsToWin - myTurnsToWin) / 20))

  // 2. DECK DEPLETION RISK: who runs out of creatures first?
  const myRunway = s.deckCount[side]! + s.hands[side]!.filter(c => c.cardType === 0).length
  const oppRunway = s.deckCount[opp]! + s.hands[opp]!.filter(c => c.cardType === 0).length
  let depletionScore = (myRunway - oppRunway) / 30
  if (myRunway <= 3 && myCards.length <= 2) depletionScore -= 0.05 // urgency: almost out

  // 3. BOARD WALL DETECTION: can I break through opponent's defense?
  let wallPenalty = 0
  if (oppCards.length > 0 && myMaxAtk > 0 && oppMaxDef > myMaxAtk * 3) {
    wallPenalty = -0.05 // opponent has unbreakable wall
  }

  // 4. SOUL HARVEST PROXIMITY: how close am I to next harvest?
  const mySoulGap = threshold - (s.soulPoints[side]! % threshold)
  const oppSoulGap = threshold - (s.soulPoints[opp]! % threshold)
  const harvestProximity = (oppSoulGap - mySoulGap) / threshold * 0.04
  // Extra: almost harvesting (< 5 points away)
  const nearHarvestBonus = mySoulGap <= 5 ? 0.03 : 0
  const oppNearHarvestPenalty = oppSoulGap <= 5 ? -0.02 : 0

  // 5. GOLD ZERO RISK: danger of instant loss from 0 gold
  const goldZeroRisk = myPS <= 1 ? -0.08 : myPS <= 2 ? -0.03 : 0
  const oppGoldZeroBonus = oppPS <= 1 ? 0.06 : oppPS <= 2 ? 0.02 : 0

  // === Staleness ===
  const staleFactor = Math.max(0.3, 1 - Math.max(0, s.round - 15) * 0.03)

  // === FINAL SCORE (V6 weights) ===
  const raw = 0.5
    + psScore * 0.25
    + threatPowerScore * 0.18
    + raceScore * 0.08           // V6 NEW
    + tempoScore * 0.06
    + synergyScore * 0.04
    + threatPenalty * 0.06
    + depletionScore * 0.05      // V6 NEW
    + creatureScore * 0.06
    + handScore * 0.04
    + soulScore * 0.06
    + harvestProximity            // V6 NEW (pre-scaled)
    + psProximity + oppProximity
    + elimScore
    + wallPenalty                 // V6 NEW (additive)
    + goldZeroRisk + oppGoldZeroBonus  // V6 NEW (additive)
    + nearHarvestBonus + oppNearHarvestPenalty  // V6 NEW (additive)
    + passPenalty + oppPassBonus

  return Math.max(0, Math.min(1, 0.5 + (raw - 0.5) * staleFactor))
}
