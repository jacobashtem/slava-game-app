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
 * evaluateLight V7 — positional awareness + ability-centric + elimination-focused.
 *
 * V5 signals: threatPower, tempo, synergy, threatPenalty
 * V6 signals: raceScore, depletionRisk, wallPenalty, harvestProximity, goldZeroRisk
 * V7 NEW:
 *   1. Positional scoring — MELEE/ELEMENTAL on L2/L3 = stranded (can't attack)
 *   2. HP-adjusted threat — creature at low HP = discounted ability value
 *   3. Line dominance — controlling FRONT = initiative
 *   4. Gentler staleFactor — games avg ~18r, decay starts at R20
 *   5. Attack-type matching — MELEE-heavy vs backline-only = blocked
 *   6. Ability value > raw ATK — active abilities weighted 4x tier (was 3x), silenced 1.5x
 * V7.1 PLUNDER AWARENESS (fix for V7 regression — 63% PS→0 outcomes):
 *   7. Plunder vulnerability — my field empty + opp has creatures = danger
 *   8. Plunder opportunity — opp field empty + I have creatures = bonus
 *   9. Near-plunder — 1 killable creature left = preemptive warning
 *   10. Strengthened goldZeroRisk — PS≤1 is -0.15 (was -0.08)
 * Weight balance: PS weight partially restored (0.22), creature focus kept (0.08)
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

  // === Per-line field data (V7: positional analysis) ===
  const myBase = side * 3
  const oppBase = opp * 3
  const myFront = s.field[myBase]!
  const oppFront = s.field[oppBase]!

  const myCards = lightFieldCards(s, side)
  const oppCards = lightFieldCards(s, opp)

  // === Field analysis — single pass with V7 enhancements ===
  let myThreat = 0, oppThreat = 0
  let myActiveAtk = 0, myActiveCount = 0
  let oppActiveAtk = 0, oppActiveCount = 0
  let oppUnansweredThreats = 0
  let myTotalSoulValue = 0
  let oppTotalSoulValue = 0
  let myMaxAtk = 0
  let oppMaxDef = 0

  for (const c of myCards) {
    // V7: HP-adjusted ability value — low HP creature's ability is less relevant
    const hpRatio = c.maxDef > 0 ? Math.max(0.2, c.def / c.maxDef) : 1
    // V7: active abilities weighted 4x (was 3x), silenced 1.5x (was 3x)
    const abilityValue = effectThreatTier(c.effectId) * (c.isSilenced ? 1.5 : 4) * hpRatio
    myThreat += c.atk * 1.5 + c.def * 0.7 + abilityValue
    myTotalSoulValue += c.soulValue
    if (c.atk > myMaxAtk) myMaxAtk = c.atk
    if (c.position === 1 && !c.cannotAttack && c.paralyzeRounds < 0) {
      myActiveAtk += c.atk
      myActiveCount++
    }
  }
  for (const c of oppCards) {
    const tier = effectThreatTier(c.effectId)
    const hpRatio = c.maxDef > 0 ? Math.max(0.2, c.def / c.maxDef) : 1
    const abilityValue = tier * (c.isSilenced ? 1.5 : 4) * hpRatio
    oppThreat += c.atk * 1.5 + c.def * 0.7 + abilityValue
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

  // === Creature count (V7: increased weight in final score) ===
  const creatureScore = (myCards.length - oppCards.length) / 10

  // === Hand quality (V7: ability weight doubled 0.1→0.2) ===
  const myHandQuality = s.hands[side]!.reduce((sum, c) => sum + 1 + effectThreatTier(c.effectId) * 0.2, 0)
  const oppHandQuality = s.hands[opp]!.reduce((sum, c) => sum + 1 + effectThreatTier(c.effectId) * 0.2, 0)
  const handScore = (myHandQuality - oppHandQuality) / 20

  // === Soul harvest ===
  const myHarvest = Math.floor(s.soulPoints[side]! / threshold)
  const oppHarvest = Math.floor(s.soulPoints[opp]! / threshold)
  const myPartial = (s.soulPoints[side]! % threshold) / threshold
  const oppPartial = (s.soulPoints[opp]! % threshold) / threshold
  const soulScore = ((myHarvest + myPartial * 0.3) - (oppHarvest + oppPartial * 0.3)) / 5

  // === Elimination (V7: stronger gradient) ===
  const myTotal = s.deckCount[side]! + s.hands[side]!.length + myCards.length
  const oppTotal = s.deckCount[opp]! + s.hands[opp]!.length + oppCards.length
  let elimScore = 0
  if (s.deckCount[side]! === 0 && myCards.length === 0) elimScore -= 0.30
  else if (myTotal <= 2) elimScore -= 0.15
  else if (myTotal <= 4) elimScore -= 0.06
  if (s.deckCount[opp]! === 0 && oppCards.length === 0) elimScore += 0.30
  else if (oppTotal <= 2) elimScore += 0.15
  else if (oppTotal <= 4) elimScore += 0.06

  // === Anti-stall ===
  const passPenalty = s.consecutivePasses[side]! >= 3 ? -0.10
    : s.consecutivePasses[side]! >= 2 ? -0.03 : 0
  const oppPassBonus = s.consecutivePasses[opp]! >= 3 ? 0.10
    : s.consecutivePasses[opp]! >= 2 ? 0.03 : 0

  // =====================================================
  // V6 SIGNALS — multi-turn strategic awareness
  // =====================================================

  // 1. TIME-TO-WIN RACE
  const myHarvestRate = oppTotalSoulValue > 0 ? oppTotalSoulValue / threshold : 0
  const oppHarvestRate = myTotalSoulValue > 0 ? myTotalSoulValue / threshold : 0
  const myTurnsToWin = myHarvestRate > 0.01 ? (psTarget - myPS) / myHarvestRate : 99
  const oppTurnsToWin = oppHarvestRate > 0.01 ? (psTarget - oppPS) / oppHarvestRate : 99
  const raceScore = Math.max(-0.15, Math.min(0.15, (oppTurnsToWin - myTurnsToWin) / 20))

  // 2. DECK DEPLETION RISK
  const myRunway = s.deckCount[side]! + s.hands[side]!.filter(c => c.cardType === 0).length
  const oppRunway = s.deckCount[opp]! + s.hands[opp]!.filter(c => c.cardType === 0).length
  let depletionScore = (myRunway - oppRunway) / 30
  if (myRunway <= 3 && myCards.length <= 2) depletionScore -= 0.05

  // 3. BOARD WALL DETECTION
  let wallPenalty = 0
  if (oppCards.length > 0 && myMaxAtk > 0 && oppMaxDef > myMaxAtk * 3) {
    wallPenalty = -0.05
  }

  // 4. SOUL HARVEST PROXIMITY
  const mySoulGap = threshold - (s.soulPoints[side]! % threshold)
  const oppSoulGap = threshold - (s.soulPoints[opp]! % threshold)
  const harvestProximity = (oppSoulGap - mySoulGap) / threshold * 0.04
  const nearHarvestBonus = mySoulGap <= 5 ? 0.03 : 0
  const oppNearHarvestPenalty = oppSoulGap <= 5 ? -0.02 : 0

  // 5. GOLD ZERO RISK (V7.1: strengthened — PS→0 is 63% of game outcomes)
  const goldZeroRisk = myPS <= 1 ? -0.15 : myPS <= 2 ? -0.08 : myPS <= 3 ? -0.03 : 0
  const oppGoldZeroBonus = oppPS <= 1 ? 0.12 : oppPS <= 2 ? 0.06 : oppPS <= 3 ? 0.02 : 0

  // =====================================================
  // V7.1 NEW — PLUNDER AWARENESS (root cause of V7 regression)
  // =====================================================
  // Plunder: when enemy field empty + round >= 3 → steal 1 PS.
  // 63% of games end via PS→0. AI must understand plunder dynamics.

  let plunderScore = 0
  if (s.round >= 3) {
    // VULNERABILITY: my field empty, opp has creatures → I WILL be plundered
    if (myCards.length === 0 && oppCards.length > 0) {
      plunderScore -= 0.12
      // Worse the lower my PS — plunder at PS 1 = death
      if (myPS <= 1) plunderScore -= 0.15
      else if (myPS <= 2) plunderScore -= 0.08
      else if (myPS <= 3) plunderScore -= 0.04
    }
    // NEAR-VULNERABLE: I have 1 creature that opponent can kill → plunder next turn
    else if (myCards.length === 1 && oppActiveCount > 0) {
      const lastCreature = myCards[0]!
      if (lastCreature.def <= oppActiveAtk) {
        // My last creature will likely die → plunder incoming
        plunderScore -= 0.06
        if (myPS <= 2) plunderScore -= 0.06
      }
    }

    // OPPORTUNITY: opp field empty, I have creatures → I CAN plunder
    if (oppCards.length === 0 && myCards.length > 0) {
      plunderScore += 0.08
      if (oppPS <= 1) plunderScore += 0.12  // plunder = kill
      else if (oppPS <= 2) plunderScore += 0.06
      else if (oppPS <= 3) plunderScore += 0.03
    }
    // NEAR-OPPORTUNITY: opp has 1 creature I can kill → plunder next turn
    else if (oppCards.length === 1 && myActiveCount > 0) {
      const lastEnemy = oppCards[0]!
      if (lastEnemy.def <= myActiveAtk) {
        plunderScore += 0.04
        if (oppPS <= 2) plunderScore += 0.05
      }
    }
  }

  // =====================================================
  // V7 SIGNALS — positional + type awareness
  // =====================================================

  // V7-1. STRANDED MELEE — MELEE/ELEMENTAL on RANGED(L2)/SUPPORT(L3) = can't attack
  let myStranded = 0, oppStranded = 0
  for (let lineOff = 1; lineOff <= 2; lineOff++) {
    for (const c of s.field[myBase + lineOff]!) {
      if ((c.attackType === 0 || c.attackType === 1) && !c.cannotAttack) myStranded++
    }
    for (const c of s.field[oppBase + lineOff]!) {
      if ((c.attackType === 0 || c.attackType === 1) && !c.cannotAttack) oppStranded++
    }
  }
  const strandedScore = (oppStranded - myStranded) * 0.04

  // V7-3. LINE DOMINANCE — controlling FRONT = initiative
  const myFrontCount = myFront.length
  const oppFrontCount = oppFront.length
  let lineDominance = 0
  if (myFrontCount > 0 && oppFrontCount === 0 && oppCards.length > 0) {
    lineDominance = 0.06  // we hold front, enemy exposed behind
  } else if (oppFrontCount > 0 && myFrontCount === 0 && myCards.length > 0) {
    lineDominance = -0.04  // enemy holds front, we're exposed
  } else if (myFrontCount >= oppFrontCount + 2) {
    lineDominance = 0.03  // numerical front advantage
  }

  // V7-5. ATTACK-TYPE MATCHING — MELEE-heavy army vs enemy with empty FRONT
  let reachPenalty = 0
  if (oppFrontCount === 0 && oppCards.length > 0) {
    // Enemy has creatures but NOT on FRONT — my MELEE on FRONT can still reach
    // first non-empty enemy line, but if I have MELEE on L2/L3 they're useless
    // (already captured by strandedScore above)
    // Extra penalty: if ALL my attackers are MELEE and enemy backline is deep
    let myMeleeTotal = 0, myRangedMagic = 0
    for (const c of myCards) {
      if (c.cannotAttack) continue
      if (c.attackType === 0 || c.attackType === 1) myMeleeTotal++
      else myRangedMagic++
    }
    // Pure MELEE army has limited reach flexibility
    if (myMeleeTotal > 0 && myRangedMagic === 0 && oppCards.length >= 2) {
      reachPenalty = -0.04
    }
  }

  // === Staleness (V7: gentler — starts at R20, floor 0.5 not 0.3) ===
  const staleFactor = Math.max(0.5, 1 - Math.max(0, s.round - 20) * 0.02)

  // === FINAL SCORE (V7.1 weights — balanced: creature focus + plunder defense) ===
  const raw = 0.5
    + psScore * 0.22              // V7.1: 0.20→0.22 (PS defense matters — 63% PS→0 outcomes)
    + threatPowerScore * 0.18
    + raceScore * 0.06            // V7.1: 0.05→0.06
    + tempoScore * 0.06
    + synergyScore * 0.04
    + threatPenalty * 0.06
    + depletionScore * 0.07       // V7: 0.05→0.07
    + creatureScore * 0.08        // V7: 0.06→0.08
    + handScore * 0.04
    + soulScore * 0.06
    + harvestProximity
    + psProximity + oppProximity
    + elimScore
    + wallPenalty
    + goldZeroRisk + oppGoldZeroBonus
    + nearHarvestBonus + oppNearHarvestPenalty
    + passPenalty + oppPassBonus
    // V7 positional:
    + strandedScore
    + lineDominance
    + reachPenalty
    // V7.1 plunder awareness:
    + plunderScore

  return Math.max(0, Math.min(1, 0.5 + (raw - 0.5) * staleFactor))
}
