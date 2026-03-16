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

/**
 * Zwraca najniższą zajętą linię WŁASNEGO pola (front obrońcy).
 */
export function getOwnFrontLine(state: GameState, side: PlayerSide): BattleLine | null {
  const lines = [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]
  for (const line of lines) {
    if (state.players[side].field.lines[line].length > 0) {
      return line
    }
  }
  return null
}

// ===== WALIDACJA WYSTAWIANIA =====

/**
 * Sprawdza czy gracz może wystawić kolejną istotę w tej turze.
 */
export function canPlayCreature(state: GameState, side: PlayerSide): boolean {
  const player = state.players[side]

  // Sprawdź limit pola (max 5 istot), chyba że Arkona lub Żupan jest aktywny
  const arkonaActive = player.activeLocation?.cardData.name === 'Arkona'
  const zupanActive = Object.values(player.field.lines).flat()
    .some(c => (c.cardData as any).effectId === 'zupan_no_field_limit')
  if (!arkonaActive && !zupanActive && getTotalCreatureCount(state, side) >= GOLD_EDITION_RULES.MAX_FIELD_CREATURES) {
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
  // Każda linia może mieć max 3 istoty (lub bez limitu z Arkoną)
  const maxPerLine = 3
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
  target: CardInstance,
  options?: { forcedByEffect?: boolean; skipRangeCheck?: boolean }
): { valid: boolean; reason?: string; softFail?: boolean } {
  const forced = !!options?.forcedByEffect

  // Wymuszony atak (Hipnoza) pomija: pozycję, hasAttacked, owner check, taunt, arena lock
  if (!forced) {
    if (attacker.position !== CardPosition.ATTACK) {
      return { valid: false, reason: 'Atakujący jest w pozycji obrony.' }
    }

    if (attacker.cannotAttack) {
      return { valid: false, reason: 'Atakujący nie może atakować (efekt statusu).' }
    }

    // Sztandar: nośnik nie może atakować
    if (attacker.equippedArtifacts.some((a: any) => ['adventure_sztandar', 'adventure_sztandar_enhanced'].includes(a.effectId))) {
      return { valid: false, reason: `${attacker.cardData.name} trzyma Sztandar — nie może atakować.` }
    }

    if (attacker.hasAttackedThisTurn) {
      // Leśnica: może atakować 2 razy na turę
      if ((attacker.cardData as any).effectId === 'lesnica_double_attack') {
        const attacks = (attacker.metadata.attacksThisTurn as number) ?? 0
        if (attacks >= 2) return { valid: false, reason: 'Leśnica już atakowała 2 razy w tej turze.' }
        // allow second attack — fall through
      } else {
        return { valid: false, reason: 'Atakujący już atakował w tej turze.' }
      }
    }

    if (attacker.owner === target.owner) {
      // Wąpierz (#89): może atakować sojuszników (musi żywić się krwią)
      if ((attacker.cardData as any).effectId !== 'wapierz_invincible_hunger') {
        return { valid: false, reason: 'Nie można atakować własnych istot.' }
      }
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
  }

  // Matecznik: ukryta istota nie może atakować ani być celem (nawet wymuszony)
  if (attacker.metadata.matecznikHidden) {
    return { valid: false, reason: `${attacker.cardData.name} ukryta w Mateczniku — nie może atakować.` }
  }
  if (target.metadata.matecznikHidden) {
    return { valid: false, reason: `${target.cardData.name} ukryta w Mateczniku — nie może być celem.` }
  }

  // Miecz Kladenet+: nośnik może atakować dowolną linię wroga (bypass line order restrictions)
  if (attacker.equippedArtifacts.some((a: any) => a.effectId === 'adventure_miecz_kladenet_enhanced')) {
    if (target.currentStats.defense > 0) {
      return { valid: true }
    }
    return { valid: false, reason: `${target.cardData.name} jest już martwa.` }
  }

  // Rusałka/Liczyrzepa: override typu ataku z metadata
  const attackType = (attacker.metadata.mirrorAttackType as AttackType)
    ?? (attacker.metadata.licyzrepaAttackTypeChosen as AttackType)
    ?? ((attacker.cardData as any).attackType as AttackType)
    ?? AttackType.MELEE

  // Chowaniec intercept / efekty pomijające zasięg
  if (options?.skipRangeCheck) return { valid: true }

  // Zasięg linii — zachowany nawet przy wymuszonym ataku (hipnoza respektuje zasięg)
  // Przy wymuszonym ataku: atakujący i cel są na tej samej stronie → symuluj zasięg jak gdyby byli naprzeciwko
  if (!forced) {
    const bitwaActive = state.activeEvents?.some(e => e.cardData.effectId === 'adventure_bitwa_nad_tollense')
    if (!bitwaActive) {
      const rangeCheck = checkAttackRange(state, attackType, attacker, target)
      if (!rangeCheck.valid) return rangeCheck
    }
  } else {
    // Wymuszony atak (hipnoza): zasięg na tej samej stronie
    const lineOrder = [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]
    const atkIdx = lineOrder.indexOf(attacker.line as BattleLine)
    const defIdx = lineOrder.indexOf(target.line as BattleLine)
    if (atkIdx >= 0 && defIdx >= 0) {
      if (attackType === AttackType.MELEE) {
        // Wręcz: ta sama linia lub sąsiednia
        if (Math.abs(atkIdx - defIdx) > 1) {
          return { valid: false, reason: `${attacker.cardData.name} (Wręcz) nie dosięgnie — za daleko.` }
        }
      } else if (attackType === AttackType.ELEMENTAL) {
        // Żywioł: jak wręcz (ta sama + sąsiednia), może bić latające ale tylko w zasięgu
        if (Math.abs(atkIdx - defIdx) > 1) {
          return { valid: false, reason: `${attacker.cardData.name} (Żywioł) nie dosięgnie — za daleko.` }
        }
      } else if (attackType === AttackType.RANGED) {
        // Dystans: własna linia + dalsze (L2→L2+L3, L1→L1+L2+L3)
        if (defIdx < atkIdx) {
          return { valid: false, reason: `${attacker.cardData.name} (Dystans) nie strzeli w tę stronę.` }
        }
      }
      // Magia: dowolna linia — brak ograniczeń
    }
  }

  // Sprawdź czy cel jest latający i czy atakujący może bić latające
  const targetFlying = isFlying(target)
  if (targetFlying && attackType === AttackType.MELEE && !isFlying(attacker)) {
    return { valid: false, reason: 'Atak Wręcz nie może bić latających istot.', softFail: true }
  }

  // ===== PASYWNE ODPORNOŚCI CELU =====
  // Rybi Król (#21): pobłogosławiony sojusznik ignoruje odporności
  if (attacker.metadata.rybiKrolBlessing) {
    // Pomiń WSZYSTKIE odporności celu — przejdź dalej
    return { valid: true }
  }
  const targetEffectId = (target.cardData as any).effectId

  // Buka (#97): wrogowie ze słabszym ATK muszą być w obronie (nie mogą atakować Buki)
  if (targetEffectId === 'buka_force_defense' && attacker.currentStats.attack < target.currentStats.attack) {
    return { valid: false, reason: `${target.cardData.name}: Twoja istota jest za słaba, żeby ją atakować.`, softFail: true }
  }

  // Matoha (#17): wrogie istoty z typem Magia nie mogą atakować (sprawdzone po stronie atakującego)
  const hasMaToha = getAllCreaturesOnField(state, target.owner)
    .some(c => (c.cardData as any).effectId === 'matoha_anti_magic')
  if (hasMaToha && attackType === AttackType.MAGIC) {
    return { valid: false, reason: 'Matoha blokuje ataki Magii.', softFail: true }
  }

  // Wilkołak (#87): odporny na Wręcz < 7
  if (targetEffectId === 'wilkolak_melee_immune' && attackType === AttackType.MELEE && attacker.currentStats.attack < 7) {
    return { valid: false, reason: `${target.cardData.name}: Wilkołak jest odporny na Wręcz < 7.`, softFail: true }
  }

  // Stukacz (#83): wrogowie z wyższym ATK nie mogą go atakować
  if (targetEffectId === 'stukacz_strong_immune' && attacker.currentStats.attack > target.currentStats.attack) {
    return { valid: false, reason: `${target.cardData.name}: Stukacz odpiera ataki silniejszych istot.`, softFail: true }
  }

  // Dydko (#101): silniejsi I równi nie mogą go uderzać
  if (targetEffectId === 'dydko_strong_immune' && attacker.currentStats.attack >= target.currentStats.attack) {
    return { valid: false, reason: `${target.cardData.name}: Dydko unika ataków równych i silniejszych.`, softFail: true }
  }

  // Kudłak (#73): odporny jeśli zadał obrażenia w tej rundzie
  if (targetEffectId === 'kudlak_conditional_immunity') {
    if ((target.metadata.kudlakDealtDamageThisRound as number) === state.roundNumber) {
      return { valid: false, reason: `${target.cardData.name}: Kudłak jest nietykalny w rundzie, w której atakował.`, softFail: true }
    }
  }

  // Łapiduch (#27): może atakować TYLKO demony (Weles, idDomain=4)
  const attackerEffectId = (attacker.cardData as any).effectId
  if (attackerEffectId === 'lapiduch_demon_hunter' && (target.cardData as any).idDomain !== 4) {
    return { valid: false, reason: `${attacker.cardData.name}: Łapiduch może atakować jedynie demony (Weles).`, softFail: true }
  }

  // Tur (#55): odporny na Dystans i Magię
  if (targetEffectId === 'tur_ranged_magic_immune'
      && (attackType === AttackType.RANGED || attackType === AttackType.MAGIC)) {
    return { valid: false, reason: `${target.cardData.name}: Tur jest odporny na Dystans i Magię.`, softFail: true }
  }

  // Grad (#104): odporny na Wręcz i Dystans — tylko Magia i Żywioł mogą go trafić
  if (targetEffectId === 'grad_magic_element_only'
      && attackType !== AttackType.MAGIC && attackType !== AttackType.ELEMENTAL) {
    return { valid: false, reason: `${target.cardData.name}: Grad jest odporny na ten typ ataku.`, softFail: true }
  }

  // Bałwan (#4): odporny na Żywioł
  if (targetEffectId === 'balwan_free_divine_favor' && attackType === AttackType.ELEMENTAL) {
    return { valid: false, reason: `${target.cardData.name}: Bałwan jest odporny na Żywioł!`, softFail: true }
  }

  // Ruslan Helmet+: nośnik niewidoczny w obronie (nie można go atakować jeśli sam nie atakował)
  if (target.metadata.ruslanHelmetStealth && !target.hasAttackedThisTurn) {
    return { valid: false, reason: `${target.cardData.name}: Niewidzialny w obronie! (Ruslan Helmet+)`, softFail: true }
  }

  // Kwiat Paproci+: immuneToAttackType — odporny na ataki tego samego typu
  if (typeof target.metadata.immuneToAttackType === 'number' && attackType === (target.metadata.immuneToAttackType as number)) {
    return { valid: false, reason: `${target.cardData.name}: Odporny na ten typ ataku! (Kwiat Paproci+)`, softFail: true }
  }

  // Sledovik / Srebrna Gałąź+: nośnik odporny na ataki z wybranej domeny
  if (typeof target.metadata.immuneToDomain === 'number') {
    const attackerDomain = (attacker.cardData as any).idDomain as number
    if (attackerDomain === (target.metadata.immuneToDomain as number)) {
      return { valid: false, reason: `${target.cardData.name}: Odporny na ataki z tej domeny!`, softFail: true }
    }
  }

  // Amulet z Rozetą: nośnik odporny na Magię
  if (attackType === AttackType.MAGIC && target.equippedArtifacts.some(a => (a as any).effectId === 'adventure_amulet_z_rozeta' || (a as any).effectId === 'adventure_amulet_z_rozeta_enhanced')) {
    return { valid: false, reason: `${target.cardData.name}: Amulet z Rozetą chroni przed Magią!`, softFail: true }
  }

  // Mavka (#111): sojusznicy w tej samej linii co Mavka nie mogą być celem ataków
  const hasMavkaShield = getAllCreaturesOnField(state, target.owner)
    .some(c => (c.cardData as any).effectId === 'mavka_line_shield'
          && c.instanceId !== target.instanceId
          && c.line === target.line
          && !c.isSilenced)
  if (hasMavkaShield) {
    return { valid: false, reason: `${target.cardData.name} jest chroniony przez Mavkę!`, softFail: true }
  }

  // Smocze Jajo (#113): blokuje wrogie ataki Żywiołem po stronie posiadacza
  const hasJajoShield = getAllCreaturesOnField(state, target.owner)
    .some(c => (c.cardData as any).effectId === 'smocze_jajo_hatch' && !c.isSilenced)
  if (hasJajoShield && attackType === AttackType.ELEMENTAL) {
    return { valid: false, reason: 'Smocze Jajo chroni przed atakami Żywiołu!', softFail: true }
  }

  return { valid: true }
}

function checkAttackRange(
  state: GameState,
  attackType: AttackType,
  attacker: CardInstance,
  target: CardInstance
): { valid: boolean; reason?: string; softFail?: boolean } {
  const attackerSide = attacker.owner
  const targetLine = target.line

  if (targetLine === null) {
    return { valid: false, reason: 'Cel nie jest na polu.' }
  }

  switch (attackType) {
    case AttackType.MELEE:
    case AttackType.ELEMENTAL: {
      // Liczyrzepa: może atakować dowolną linię (jak Magia)
      if ((attacker.cardData as any).effectId === 'liczyrzepa_choose_type') {
        return { valid: true }
      }
      // Wręcz/Żywioł może atakować TYLKO z linii L1 (Front)
      if (attacker.line !== BattleLine.FRONT) {
        return { valid: false, reason: 'Wręcz/Żywioł może atakować tylko z linii L1 (Front). Przenieś istotę do L1.' }
      }
      // Musi celować w pierwszą ZAJĘTĄ linię wroga (dynamiczny front)
      const frontLine = getEnemyFrontLine(state, attackerSide)
      if (frontLine === null) {
        return { valid: false, reason: 'Wróg nie ma istot na polu.' }
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
    if (enemy.isSilenced || enemy.metadata?.dziewiatkoParalyze) continue
    if (enemy.cardData.name === 'Błotnik' || enemy.activeEffects.some(e => e.effectId === 'blotnik_taunt')) {
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
  roundNumber: number,
  /** Nadpisz stronę pola (dla kart wystawianych na pole wroga) */
  overrideFieldSide?: PlayerSide,
  /** Indeks slotu w linii (0-based). Undefined = push na koniec. */
  slotIndex?: number
): void {
  const fieldSide = overrideFieldSide ?? card.owner
  const fieldPlayer = state.players[fieldSide]
  card.line = line
  card.turnsInPlay = 0
  card.roundEnteredPlay = roundNumber
  if (!overrideFieldSide) {
    // Aury są widoczne od razu (wpływają na pole, gracz musi o nich wiedzieć)
    const hasAura = (card.cardData as any).abilities?.some(
      (a: { trigger: string }) => a.trigger === 'AURA'
    )
    card.isRevealed = !!hasAura
  }

  // Usuń z ręki — szukaj w ręce oryginalnego gracza (currentTurn)
  for (const side of (['player1', 'player2'] as PlayerSide[])) {
    const handIdx = state.players[side].hand.findIndex(c => c.instanceId === card.instanceId)
    if (handIdx !== -1) {
      state.players[side].hand.splice(handIdx, 1)
      state.players[side].creaturesPlayedThisTurn += 1
      break
    }
  }

  // Assign visual slot position (metadata-only, used by UI for fixed-position rendering)
  const MAX_SLOTS = 3
  const finalSlot = slotIndex ?? getFirstAvailableSlot(fieldPlayer.field.lines[line], MAX_SLOTS)
  card.metadata.slotPosition = finalSlot

  // Engine array: always push (order doesn't matter for game logic, UI uses slotPosition)
  fieldPlayer.field.lines[line].push(card)
}

/**
 * Finds the first unoccupied visual slot in a line (0-based).
 * Cards track their slot via metadata.slotPosition.
 */
export function getFirstAvailableSlot(lineCards: CardInstance[], maxSlots = 3): number {
  const occupied = new Set<number>()
  for (const c of lineCards) {
    const s = c.metadata.slotPosition as number | undefined
    if (s !== undefined) occupied.add(s)
  }
  for (let i = 0; i < maxSlots; i++) {
    if (!occupied.has(i)) return i
  }
  return lineCards.length
}

/**
 * Usuwa istotę z pola (bez trafiania na cmentarz — użyj GameStateUtils.moveToGraveyard).
 */
export function removeFromField(state: GameState, instanceId: string): CardInstance | null {
  for (const player of Object.values(state.players)) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const idx = player.field.lines[line].findIndex(c => c.instanceId === instanceId)
      if (idx !== -1) {
        const card = player.field.lines[line].splice(idx, 1)[0]!
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
 * Alternatywna wygrana: zgromadzenie 15 PS (łupienie).
 */
export function checkWinCondition(state: GameState): PlayerSide | null {
  // Nie sprawdzaj wygranej przed pierwszą turą (obie talie jeszcze niedobrane)
  if (state.turnNumber <= 1 && state.roundNumber <= 1) return null

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    // Alternatywna wygrana: 15 PS
    if (state.players[side].glory >= GOLD_EDITION_RULES.GLORY_WIN_TARGET) {
      return side
    }

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
