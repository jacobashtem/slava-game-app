/**
 * TurnManager — zarządza fazami tury: START → DRAW → PLAY → COMBAT → END
 */

import type { GameState, CardInstance, LogEntry, ActiveEventCard, CombatResult } from './types'
import { GamePhase, EffectTrigger, BattleLine, CardPosition } from './constants'
import type { PlayerSide } from './types'
import { cloneGameState, addLog, getAllCreaturesOnField, moveToGraveyard } from './GameStateUtils'
import { drawCard, drawCards } from './DeckBuilder'
import { placeCreatureOnField, canPlayCreature, canPlaceInLine, getFirstAvailableSlot } from './LineManager'
import { resolveAttack } from './CombatResolver'
import { getEffect, canActivateEffect } from './EffectRegistry'
import { GOLD_EDITION_RULES, SLAVA_RULES } from './constants'
import { grantTrophyBonus, checkHoliday, getEnhancedAdventureCost, applySeasonalBuffToNewCreature, checkBreakthrough } from './GloryManager'

// ===================================================================
// FAZY TURY
// ===================================================================

/**
 * START — resetuje flagi na początku tury.
 */
export function processStartPhase(state: GameState): { newState: GameState; log: LogEntry[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []

  const currentPlayer = newState.players[newState.currentTurn]

  // Resetuj liczniki tury
  currentPlayer.creaturesPlayedThisTurn = 0
  currentPlayer.adventuresPlayedThisTurn = 0

  // Resetuj flagi ataku dla kart aktualnego gracza
  for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
    for (const card of currentPlayer.field.lines[line]) {
      card.hasAttackedThisTurn = false
      card.hasMovedThisTurn = false
      // Usuń jednorazowe metadane
      delete card.metadata.canReturnToDeck
      delete card.metadata.canDefendAfterAttack
      delete card.metadata.attacksThisTurn
      delete card.metadata.justGrew
      delete card.metadata.justResurrected
    }
  }

  // Efekty tick: Zagorkinia klątwa (-1 ATK/-1 DEF co turę)
  for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
    for (const card of currentPlayer.field.lines[line]) {
      if (card.metadata.zagorkiniaCursed) {
        card.currentStats.attack = Math.max(0, card.currentStats.attack - 1)
        card.currentStats.defense -= 1
        log.push(addLog(newState, `${card.cardData.name}: Klątwa Zagorkini! -1 ATK/-1 DEF.`, 'effect'))
      }
    }
  }

  // Tick: przygody z limitowanym czasem trwania (odliczaj rundy, zdejmij gdy wygasną)
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    for (const card of getAllCreaturesForPlayer(newState, side)) {
      // Bezsilność: wrogowie wyciszeni przez X rund
      if (typeof card.metadata.bezsilnoscRounds === 'number') {
        card.metadata.bezsilnoscRounds = (card.metadata.bezsilnoscRounds as number) - 1
        if ((card.metadata.bezsilnoscRounds as number) <= 0) {
          delete card.metadata.bezsilnoscRounds
          delete card.metadata.bezsilnoscMeleeOnly
          card.isSilenced = false
          log.push(addLog(newState, `${card.cardData.name}: Bezsilność mija!`, 'effect'))
        }
      }
      // Swaćba: wróg nie może atakować X rund
      if (typeof card.metadata.swacbaRounds === 'number') {
        card.metadata.swacbaRounds = (card.metadata.swacbaRounds as number) - 1
        if ((card.metadata.swacbaRounds as number) <= 0) {
          delete card.metadata.swacbaRounds
          card.cannotAttack = false
          log.push(addLog(newState, `${card.cardData.name}: Swaćba mija — może znów atakować!`, 'effect'))
        }
      }
      // Misjonarze: wróg nie atakuje Magią X tur
      if (typeof card.metadata.misjonarzeRounds === 'number') {
        card.metadata.misjonarzeRounds = (card.metadata.misjonarzeRounds as number) - 1
        if ((card.metadata.misjonarzeRounds as number) <= 0) {
          delete card.metadata.misjonarzeRounds
          log.push(addLog(newState, `${card.cardData.name}: Misjonarze odchodzą — Magia znów dozwolona!`, 'effect'))
        }
      }
      // Zaćmienie: istoty wyciszone X tur
      if (typeof card.metadata.zacmienieRounds === 'number') {
        card.metadata.zacmienieRounds = (card.metadata.zacmienieRounds as number) - 1
        if ((card.metadata.zacmienieRounds as number) <= 0) {
          delete card.metadata.zacmienieRounds
          card.isSilenced = false
          log.push(addLog(newState, `${card.cardData.name}: Zaćmienie mija!`, 'effect'))
        }
      }
      // Kukła Marzanny: Nieumarli sparaliżowani X rund
      if (typeof card.metadata.kuklaDoubleVsUndead === 'number') {
        card.metadata.kuklaDoubleVsUndead = (card.metadata.kuklaDoubleVsUndead as number) - 1
        if ((card.metadata.kuklaDoubleVsUndead as number) <= 0) {
          delete card.metadata.kuklaDoubleVsUndead
          if (card.paralyzeRoundsLeft !== null) card.paralyzeRoundsLeft = 0
          card.cannotAttack = false
          log.push(addLog(newState, `${card.cardData.name}: Paraliż od Kukły Marzanny mija!`, 'effect'))
        }
      }
    }
  }

  // Efekty ON_TURN_START (generyczny loop — Cicha, Domowik, Świetle, Południca, Starszyzna, etc.)
  newState = processTurnStartEffects(newState, log)

  // Tick duration events and check conditional events (once per round, at player1 START)
  if (newState.currentTurn === 'player1') {
    newState = processActiveEvents(newState, log)
  }

  log.push(addLog(newState, `Tura ${newState.turnNumber} — Gracz ${newState.currentTurn} zaczyna.`, 'system'))

  newState.currentPhase = GamePhase.DRAW
  return { newState, log }
}

/**
 * DRAW — gracz dobiera karty do pełnych 5 na ręce.
 */
export function processDrawPhase(state: GameState): { newState: GameState; log: LogEntry[]; drawn: CardInstance[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []
  const drawn: CardInstance[] = []

  const currentPlayer = newState.players[newState.currentTurn]
  const target = GOLD_EDITION_RULES.STARTING_HAND

  // Licho (#108): blokuje dobiór kart rywala (pusta ręka = może wziąć 1)
  const opponentSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
  const hasLicho = getAllCreaturesForPlayer(newState, opponentSide)
    .some(c => (c.cardData as any).effectId === 'licho_block_draw')
  if (hasLicho) {
    if (currentPlayer.hand.length === 0 && currentPlayer.deck.length > 0) {
      const card = currentPlayer.deck.shift()!
      currentPlayer.hand.push(card)
      drawn.push(card)
      log.push(addLog(newState, `Licho: Pusta ręka — dobierasz 1 kartę ratunkową.`, 'effect'))
    } else {
      log.push(addLog(newState, `Licho blokuje dobiór kart — wróg ma Licho na polu.`, 'effect'))
    }
    newState.currentPhase = GamePhase.PLAY
    return { newState, log, drawn }
  }

  // Bieda (#94): gracz mający Biedę na swoim polu nie może dobierać kart (pusta ręka = 1 karta)
  const hasBieda = getAllCreaturesForPlayer(newState, newState.currentTurn as PlayerSide)
    .some(c => (c.cardData as any).effectId === 'bieda_spy_block_draw')
  if (hasBieda) {
    if (currentPlayer.hand.length === 0 && currentPlayer.deck.length > 0) {
      // Pusta ręka — może dobrać 1 kartę ratunkową
      const card = currentPlayer.deck.shift()!
      currentPlayer.hand.push(card)
      drawn.push(card)
      log.push(addLog(newState, `Bieda: Pusta ręka — dobierasz 1 kartę ratunkową.`, 'effect'))
    } else {
      log.push(addLog(newState, `Bieda blokuje dobiór kart — Bieda na polu uniemożliwia dobiór.`, 'effect'))
    }
    newState.currentPhase = GamePhase.PLAY
    return { newState, log, drawn }
  }

  // Reshuffle cmentarza do talii gdy talia jest pusta
  if (currentPlayer.deck.length === 0 && currentPlayer.graveyard.length > 0) {
    const reshuffled = currentPlayer.graveyard
      .filter(c => c.cardData.cardType === 'creature')
      .map(c => { c.isRevealed = false; c.currentStats = { ...(c.cardData as any).stats }; c.poisonRoundsLeft = null; c.isSilenced = false; c.activeEffects = []; c.hasAttackedThisTurn = false; c.position = CardPosition.DEFENSE; c.cannotAttack = false; c.metadata = {}; c.equippedArtifacts = []; c.line = null; return c })
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j]!, reshuffled[i]!]
    }
    currentPlayer.deck.push(...reshuffled)
    currentPlayer.graveyard = currentPlayer.graveyard.filter(c => c.cardData.cardType !== 'creature')
    log.push(addLog(newState, `${newState.currentTurn}: Talia pusta — cmentarz (${reshuffled.length} istot) przetasowany z powrotem.`, 'system'))
  }

  while (currentPlayer.hand.length < target) {
    const card = drawCard(currentPlayer)
    if (!card) break
    drawn.push(card)
  }

  // Rehtra+: karty dobrane przez rywala są ujawniane
  {
    const opponentSide: PlayerSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
    const opponentLocation = newState.players[opponentSide].activeLocation
    if (opponentLocation && (opponentLocation.cardData as any).effectId === 'adventure_rehtra_enhanced') {
      for (const drawnCard of drawn) {
        drawnCard.isRevealed = true
      }
    }
  }

  if (drawn.length > 0) {
    log.push(addLog(newState, `${newState.currentTurn} dobiera ${drawn.length} kart${drawn.length === 1 ? 'ę' : drawn.length < 5 ? 'y' : ''}.`, 'draw'))
  } else if (currentPlayer.deck.length === 0 && currentPlayer.hand.length === 0) {
    log.push(addLog(newState, `${newState.currentTurn} nie ma kart w talii!`, 'system'))
  }

  // Trigger ON_ROUND_START dla pasywnych efektów (raz na rundę, przy turze player1)
  if (newState.currentTurn === 'player1') {
    newState = processRoundStartEffects(newState, log)
  }

  newState.currentPhase = GamePhase.PLAY
  return { newState, log, drawn }
}

/**
 * PLAY — gracz wystawia istoty i gra karty przygody.
 * Zwraca nowy stan po wystawieniu karty.
 */
export function playCreature(
  state: GameState,
  cardInstanceId: string,
  targetLine: BattleLine,
  slotIndex?: number
): { newState: GameState; log: LogEntry[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []

  const currentPlayer = newState.players[newState.currentTurn]

  // Znajdź kartę w ręce
  const handIdx = currentPlayer.hand.findIndex(c => c.instanceId === cardInstanceId)
  if (handIdx === -1) throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest w ręce.`)

  const card = currentPlayer.hand[handIdx]!

  if (card.cardData.cardType !== 'creature') {
    throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest istotą.`)
  }

  if (!canPlayCreature(newState, newState.currentTurn)) {
    throw new Error(`[TurnManager] Nie można teraz wystawić istoty (limit lub efekt).`)
  }

  if (!canPlaceInLine(newState, newState.currentTurn, targetLine)) {
    throw new Error(`[TurnManager] Linia ${targetLine} jest pełna.`)
  }

  // Łapiduch: gdy wróg ma Łapiducha na polu, nie można wystawiać demonów (Weles, idDomain=4)
  const opponentSide: PlayerSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
  const opponentHasLapiduch = getAllCreaturesOnField(newState, opponentSide)
    .some(c => (c.cardData as any).effectId === 'lapiduch_demon_hunter')
  if (opponentHasLapiduch && (card.cardData as any).idDomain === 4) {
    addLog(newState, `Łapiduch wroga blokuje wystawienie ${card.cardData.name} — demony nie mogą wejść na pole!`, 'effect')
    throw new Error(`[TurnManager] Łapiduch wroga blokuje wystawianie demonów (Weles).`)
  }

  // Sprawdź czy karta wystawiana na pole wroga (Wieszczy, Bieda)
  const effect = getEffect(card.cardData.effectId)
  const isEnemyFieldCard = effect?.playOnEnemyField === true

  if (isEnemyFieldCard) {
    // Wystawiamy na pole WROGA — zmień właściciela
    const enemySide: PlayerSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
    card.owner = enemySide
    card.isRevealed = true // karta wroga jest widoczna
    // Sprawdź limit pola wroga
    if (!canPlaceInLine(newState, enemySide, targetLine)) {
      throw new Error(`[TurnManager] Linia ${targetLine} wroga jest pełna.`)
    }
    placeCreatureOnField(newState, card, targetLine, newState.roundNumber, enemySide, slotIndex)
    applySeasonalBuffToNewCreature(newState, card)
    log.push(addLog(newState, `${newState.currentTurn} wystawia ${card.cardData.name} na pole wroga w linii ${targetLine}!`, 'play', [cardInstanceId]))
  } else {
    placeCreatureOnField(newState, card, targetLine, newState.roundNumber, undefined, slotIndex)
    applySeasonalBuffToNewCreature(newState, card)
    const cardDisplayName = card.owner === 'player2' ? 'zakrytą jednostkę' : card.cardData.name
    log.push(addLog(newState, `${newState.currentTurn} wystawia ${cardDisplayName} w linii ${targetLine}.`, 'play', [cardInstanceId]))
  }

  // Trigger ON_PLAY
  if (effect) {
    const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
    if (triggers.includes(EffectTrigger.ON_PLAY) && !card.isSilenced) {
      if (effect.activatable) {
        // Activatable ON_PLAY — czekamy na potwierdzenie gracza (gratis przy wystawieniu)
        newState.awaitingOnPlayConfirmation = card.instanceId
      } else if (effect.activationRequiresTarget && !card.owner.startsWith('player2')) {
        // ON_PLAY z wymaganym celem (np. Jaroszek) — pokaż modal wyboru celu
        const enemySide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
        const enemies = getAllCreaturesOnField(newState, enemySide)
          .filter(c => c.currentStats.defense > 0)
        if (enemies.length > 0) {
          newState.pendingInteraction = {
            type: 'on_play_target',
            sourceInstanceId: card.instanceId,
            respondingPlayer: newState.currentTurn,
            availableTargetIds: enemies.map(c => c.instanceId),
          }
          log.push(addLog(newState, `${card.cardData.name}: Wybierz cel efektu!`, 'effect'))
        }
      } else {
        // ON_PLAY z wymaganym celem dla AI — auto-wybór najsilniejszego wroga
        let target: any = undefined
        if (effect.activationRequiresTarget) {
          const enemySide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
          const enemies = getAllCreaturesOnField(newState, enemySide)
            .filter(c => c.currentStats.defense > 0)
          if (enemies.length > 0) {
            target = enemies.reduce((a, b) => a.currentStats.attack > b.currentStats.attack ? a : b)
          }
        }
        try {
          const effectResult = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_PLAY, target })
          newState = effectResult.newState
          log.push(...effectResult.log)
        } catch (err) {
          // ON_PLAY effect failed — skip silently
        }
      }
    }
  }

  return { newState, log }
}

/**
 * PLAY — gracz gra kartę przygody.
 */
export function playAdventure(
  state: GameState,
  cardInstanceId: string,
  targetInstanceId?: string,
  useEnhanced = false
): { newState: GameState; log: LogEntry[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []

  const currentPlayer = newState.players[newState.currentTurn]

  const handIdx = currentPlayer.hand.findIndex(c => c.instanceId === cardInstanceId)
  if (handIdx === -1) throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest w ręce.`)

  const card = currentPlayer.hand[handIdx]!

  if (card.cardData.cardType !== 'adventure') {
    throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest przygodą.`)
  }

  // Koszt: podstawowy = DARMOWY, ulepszony = koszt w PS (glory)
  let adventureCost = 0
  if (useEnhanced) {
    adventureCost = getEnhancedAdventureCost(newState, newState.currentTurn)
  }

  // Tęsknica: blokuje enhanced adventures
  if (useEnhanced) {
    const opponentSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
    const hasTesknica = getAllCreaturesForPlayer(newState, opponentSide)
      .some(c => (c.cardData as any).effectId === 'tesknica_block_enhance')
    if (hasTesknica) {
      addLog(newState, `Tęsknica wroga blokuje ulepszenie zaklęcia!`, 'effect')
      throw new Error(`[TurnManager] Tęsknica blokuje ulepszanie zaklęć!`)
    }
  }

  if (adventureCost > 0 && currentPlayer.glory < adventureCost) {
    throw new Error(`[TurnManager] Brak PS. Potrzebujesz ${adventureCost} PS na ulepszony efekt.`)
  }
  currentPlayer.glory -= adventureCost
  currentPlayer.adventuresPlayedThisTurn += 1

  // Usuń z ręki
  currentPlayer.hand.splice(handIdx, 1)

  const adventureData = card.cardData as any
  const effectId = useEnhanced ? adventureData.enhancedEffectId : adventureData.effectId

  log.push(addLog(newState, `${newState.currentTurn} gra kartę przygody: ${card.cardData.name}${useEnhanced ? ' (wzmocnione)' : ''}.`, 'play', [cardInstanceId]))

  // Znajdź cel jeśli podano
  let targetCard: CardInstance | undefined
  if (targetInstanceId) {
    targetCard = findCardAnywhere(newState, targetInstanceId) ?? undefined
  }

  // Bzionek (#64): może przechwycić zaklęcie wymierzone w sojusznika
  if (targetCard && targetCard.owner !== newState.currentTurn) {
    const bzionek = getAllCreaturesForPlayer(newState, targetCard.owner)
      .find(c => (c.cardData as any).effectId === 'bzionek_spell_intercept'
             && c.instanceId !== targetCard!.instanceId
             && !c.isSilenced)
    if (bzionek) {
      log.push(addLog(newState, `Bzionek przechwytuje zaklęcie wymierzone w ${targetCard.cardData.name}!`, 'effect'))
      targetCard = bzionek
    }
  }

  // Żerca (#59): spellShield — jednorazowa tarcza na wrogie zaklęcie
  if (targetCard && targetCard.owner !== newState.currentTurn && targetCard.metadata.spellShield) {
    delete targetCard.metadata.spellShield
    log.push(addLog(newState, `Tarcza Żercy chroni ${targetCard.cardData.name} przed zaklęciem! (jednorazowa)`, 'effect'))
    // Karta przygody idzie na cmentarz, efekt nie odpala
    currentPlayer.graveyard.push(card)
    return { newState, log }
  }

  // Czarownica (#36): może przekierować zaklęcie na istotę rzucającego
  if (targetCard && targetCard.owner !== newState.currentTurn) {
    const czarownica = getAllCreaturesForPlayer(newState, targetCard.owner)
      .find(c => (c.cardData as any).effectId === 'czarownica_redirect_spell'
             && c.instanceId !== targetCard!.instanceId
             && !c.isSilenced)
    if (czarownica) {
      const usedFree = !!czarownica.metadata.czarownicaUsedFree
      const cost = usedFree ? 1 : 0
      const ownerSide = czarownica.owner as PlayerSide
      if (cost === 0 || newState.players[ownerSide].glory >= cost) {
        if (cost > 0) newState.players[ownerSide].glory -= cost
        czarownica.metadata.czarownicaUsedFree = true
        const casterSide = newState.currentTurn as PlayerSide
        const casterCreatures = getAllCreaturesForPlayer(newState, casterSide)
        if (casterCreatures.length > 0) {
          const newTarget = casterCreatures[Math.floor(Math.random() * casterCreatures.length)]!
          log.push(addLog(newState,
            `Czarownica przekierowuje zaklęcie z ${targetCard.cardData.name} na ${newTarget.cardData.name}!`,
            'effect'
          ))
          targetCard = newTarget
        }
      }
    }
  }

  // Julki (#39): cel karty przygody odporny na zaklęcia
  if (targetCard && (targetCard.cardData as any).effectId === 'julki_adventure_immunity' && !targetCard.isSilenced) {
    throw new Error(`[TurnManager] Julki są odporne na karty przygody!`)
  }

  // Zlot Czarownic: blokuje 3 kolejne przygody rywala
  const opponentSide2 = newState.currentTurn === 'player1' ? 'player2' : 'player1'
  const zlotEvent = newState.activeEvents.find(
    e => e.owner === opponentSide2 && e.cardData.effectId === 'adventure_zlot_czarownic'
      && (e.roundsRemaining ?? 0) > 0
  )
  if (zlotEvent) {
    zlotEvent.roundsRemaining = (zlotEvent.roundsRemaining ?? 1) - 1
    if (zlotEvent.roundsRemaining <= 0) {
      newState.activeEvents = newState.activeEvents.filter(e => e !== zlotEvent)
    }
    // Zwróć kartę do ręki (zablokowano)
    currentPlayer.hand.push(card)
    log.push(addLog(newState, `Zlot Czarownic blokuje zaklęcie ${card.cardData.name} — ${zlotEvent.roundsRemaining} blokad pozostało (Zlot Czarownic anuluje 3 kolejne przygody wroga).`, 'effect'))
    currentPlayer.adventuresPlayedThisTurn--
    currentPlayer.glory += adventureCost
    return { newState, log }
  }

  // Wykonaj efekt
  const effect = getEffect(effectId)
  if (effect) {
    try {
      const effectResult = effect.execute({
        state: newState,
        source: card,
        target: targetCard,
        trigger: EffectTrigger.ON_PLAY,
      })
      newState = effectResult.newState
      log.push(...effectResult.log)
    } catch (err) {
      // Adventure effect failed — skip silently
    }
  }

  // Route card based on type and persistence
  const adventureType = adventureData.adventureType
  const persistence = adventureData.persistence ?? 'instant'

  if (adventureType === 1 && targetCard) {
    // Artefakt: podepnij pod cel
    const targetOnField = findCardOnField(newState, targetInstanceId!)
    if (targetOnField) {
      targetOnField.equippedArtifacts.push(adventureData)
    } else {
      // Cel zniknął z pola — artefakt trafia na cmentarz (nie ginie w próżnię)
      currentPlayer.graveyard.push(card)
      log.push(addLog(newState, `${card.cardData.name}: Cel artefaktu zniknął z pola — karta odrzucona.`, 'effect'))
    }
  } else if (adventureType === 2) {
    // Lokacja: staje się activeLocation gracza
    const currentOwner = newState.players[newState.currentTurn]
    if (currentOwner.activeLocation) {
      currentOwner.graveyard.push(currentOwner.activeLocation)
    }
    currentOwner.activeLocation = card
  } else if (persistence !== 'instant') {
    // Zdarzenie z persistence: leży na stole jako ActiveEventCard
    let eventRoundsRemaining: number | null = persistence === 'duration' ? (adventureData.durationRounds ?? null) : null
    // Zlot Czarownic: roundsRemaining = liczba blokowanych przygód (nie rund)
    if (effectId === 'adventure_zlot_czarownic' || effectId === 'adventure_zlot_czarownic_enhanced') {
      eventRoundsRemaining = 3
    }
    const activeEvent: ActiveEventCard = {
      instanceId: card.instanceId,
      cardData: adventureData,
      owner: newState.currentTurn,
      playedOnRound: newState.roundNumber,
      roundsRemaining: eventRoundsRemaining,
      conditionEnd: adventureData.conditionEnd,
    }
    newState.activeEvents.push(activeEvent)
    log.push(addLog(
      newState,
      `${card.cardData.name} pozostaje w polu (${persistence === 'duration' ? `${activeEvent.roundsRemaining} rund` : persistence === 'conditional' ? 'warunek: ' + activeEvent.conditionEnd : 'trwały'}).`,
      'effect',
      [card.instanceId]
    ))
  } else {
    // Zdarzenie instant: na cmentarz
    newState.players[newState.currentTurn].graveyard.push(card)
  }

  return { newState, log }
}

/**
 * Ręczne dobranie karty podczas fazy PLAY (do limitu 5 na ręce).
 */
export function drawCardManually(state: GameState): { newState: GameState; log: LogEntry[] } {
  const newState = cloneGameState(state)
  const log: LogEntry[] = []
  const currentPlayer = newState.players[newState.currentTurn]

  if (currentPlayer.hand.length >= GOLD_EDITION_RULES.STARTING_HAND) {
    throw new Error('Masz już 5 kart na ręce.')
  }
  if (currentPlayer.deck.length === 0) {
    throw new Error('Nie ma kart w talii.')
  }

  const card = drawCard(currentPlayer)
  if (!card) throw new Error('Nie ma kart w talii.')

  // Rehtra+: ujawnij dobieraną kartę jeśli przeciwnik ma tę lokację
  {
    const opponentSide: PlayerSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'
    const opponentLocation = newState.players[opponentSide].activeLocation
    if (opponentLocation && (opponentLocation.cardData as any).effectId === 'adventure_rehtra_enhanced') {
      card.isRevealed = true
    }
  }

  log.push(addLog(newState, `${newState.currentTurn} dobiera kartę z talii.`, 'draw'))
  return { newState, log }
}

/**
 * PLAY/COMBAT — gracz aktywuje zdolność istoty (⚡ kliknięcie).
 * Sprawdza: activatable, cooldown, koszt PS, uciszenie.
 * Wykonuje efekt z triggerem ON_ACTIVATE.
 */
export function activateCreatureEffect(
  state: GameState,
  cardInstanceId: string,
  targetInstanceId?: string
): { newState: GameState; log: LogEntry[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []

  const card = findCardOnField(newState, cardInstanceId)
  if (!card) throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest na polu.`)
  if (card.owner !== newState.currentTurn) throw new Error(`[TurnManager] To nie twoja karta.`)

  const effect = getEffect((card.cardData as any).effectId)
  if (!effect?.activatable) throw new Error(`[TurnManager] Karta "${card.cardData.name}" nie ma aktywowanej zdolności.`)
  if (card.isSilenced) throw new Error(`[TurnManager] "${card.cardData.name}" jest uciszony.`)

  // Darmowa aktywacja oczekująca (ON_PLAY pominięty) — pomija cooldown i koszt
  const isFreeActivation = !!(card.metadata.freeActivationPending)

  const cooldown = effect.activationCooldown ?? 'unlimited'
  if (!isFreeActivation) {
    // Sprawdź cooldown
    if (cooldown === 'per_round' && (card.metadata.lastActivatedRound as number) >= newState.roundNumber) {
      throw new Error(`"${card.cardData.name}": zdolność już użyta w tej rundzie.`)
    }
    if (cooldown === 'per_turn' && (card.metadata.lastActivatedTurn as number) >= newState.turnNumber) {
      throw new Error(`"${card.cardData.name}": zdolność już użyta w tej turze.`)
    }
    if (cooldown === 'once' && ((card.metadata.activationCount as number) ?? 0) > 0) {
      throw new Error(`"${card.cardData.name}": zdolność można użyć tylko raz.`)
    }
  }

  // Sprawdź i pobierz koszt (PS = glory)
  const cost = isFreeActivation ? 0 : (effect.activationCost ?? 0)
  const owner = newState.players[newState.currentTurn]
  if (owner.glory < cost) {
    throw new Error(`Brak PS. Masz ${owner.glory} PS, potrzebujesz ${cost}.`)
  }
  owner.glory -= cost

  // Znajdź cel (jeśli podano)
  let targetCard: CardInstance | undefined
  if (targetInstanceId) {
    targetCard = findCardOnField(newState, targetInstanceId) ?? undefined
  }

  // Wykonaj efekt
  try {
    const result = effect.execute({
      state: newState,
      source: card,
      target: targetCard,
      trigger: EffectTrigger.ON_ACTIVATE,
    })
    newState = result.newState
    log.push(...result.log)
  } catch (err) {
    // Activation failed — refund
    owner.glory += cost
  }

  // Zaktualizuj metadane cooldownu (szukamy karty w zaktualizowanym stanie)
  const cardAfter = findCardOnField(newState, cardInstanceId)
  if (cardAfter) {
    if (isFreeActivation) {
      // Darmowa aktywacja: wyczyść flagę, nie dotykaj activationCount
      delete cardAfter.metadata.freeActivationPending
    } else {
      if (cooldown === 'per_round') cardAfter.metadata.lastActivatedRound = newState.roundNumber
      if (cooldown === 'per_turn') cardAfter.metadata.lastActivatedTurn = newState.turnNumber
      cardAfter.metadata.activationCount = ((cardAfter.metadata.activationCount as number) ?? 0) + 1
    }
  }

  log.unshift(addLog(
    newState,
    `${card.cardData.name} aktywuje: "${effect.name}"${cost > 0 ? ` (-${cost} PS)` : ''}.`,
    'effect',
    [cardInstanceId]
  ))

  return { newState, log }
}

/**
 * COMBAT — atak. Deleguje do CombatResolver.
 */
export function performAttack(
  state: GameState,
  attackerInstanceId: string,
  defenderInstanceId: string,
  options?: { skipChowaniecCheck?: boolean; skipBrzeginaCheck?: boolean; forceBrzeginaSkip?: boolean; forcedByEffect?: boolean; skipRangeCheck?: boolean }
): { newState: GameState; log: LogEntry[]; combatResult?: CombatResult } {
  if (state.currentPhase !== GamePhase.COMBAT && !options?.forcedByEffect) {
    throw new Error(`[TurnManager] Nie jesteś w fazie COMBAT (jesteś w ${state.currentPhase}).`)
  }

  // Chowaniec: intercept check — jeśli defender jest ludzkim graczem i ma Chowańca w DEFENSE
  if (!options?.skipChowaniecCheck) {
    const defCard = (() => {
      for (const side of ['player1', 'player2'] as const) {
        for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
          const found = state.players[side].field.lines[line].find(c => c.instanceId === defenderInstanceId)
          if (found) return found
        }
      }
      return null
    })()

    if (defCard && !state.players[defCard.owner as 'player1' | 'player2'].isAI) {
      const defOwner = defCard.owner as 'player1' | 'player2'
      const chowaniec = getAllCreaturesOnField(state, defOwner).find(c =>
        (c.cardData as any).effectId === 'chowaniec_intercept' &&
        c.instanceId !== defenderInstanceId &&
        !c.isSilenced &&
        c.currentStats.defense > 0
      )
      if (chowaniec) {
        const pendingState = cloneGameState(state)
        pendingState.pendingInteraction = {
          type: 'chowaniec_intercept',
          sourceInstanceId: chowaniec.instanceId,
          respondingPlayer: defOwner,
          attackerInstanceId,
          targetInstanceId: defenderInstanceId,
        }
        addLog(pendingState, `${chowaniec.cardData.name}: Może przejąć atak na ${defCard.cardData.name}! Czy interweniować?`, 'effect')
        return { newState: pendingState, log: [] }
      }
    }
  }

  // Zapamiętaj linię obrońcy przed atakiem (do checkBreakthrough)
  const defenderCard = findCardAnywhere(state, defenderInstanceId)
  const defenderLineBefore = defenderCard?.line ?? null

  const { newState, result } = resolveAttack(state, attackerInstanceId, defenderInstanceId, { forceBrzeginaSkip: options?.forceBrzeginaSkip, forcedByEffect: options?.forcedByEffect, skipRangeCheck: options?.skipRangeCheck })

  // Brzegina paused combat — pendingInteraction already set, return early
  if (result.brzeginaPaused) {
    return { newState, log: result.log, combatResult: result }
  }

  // Sława: sprawdź przełamanie linii (atak na pustą linię wroga → +1/-1 PS)
  if (result.defenderDied && defenderLineBefore != null) {
    const attackerSide = (result.attacker.owner ?? 'player1') as import('./types').PlayerSide
    const breakthroughLog = checkBreakthrough(newState, attackerSide, defenderLineBefore)
    result.log.push(...breakthroughLog)
  }

  // Kościej: po walce sprawdź czy w cmentarzu gracza jest Kościej z flagą kosciejCanPaidResurrect
  for (const side of ['player1', 'player2'] as const) {
    if (newState.players[side].isAI) continue  // AI auto-decyduje (nie wskrzesza za PS)
    const grave = newState.players[side].graveyard
    const kosciej = grave.find(c => c.metadata.kosciejCanPaidResurrect)
    if (kosciej && newState.players[side].glory >= 1) {
      delete kosciej.metadata.kosciejCanPaidResurrect
      newState.pendingInteraction = {
        type: 'kosciej_resurrect',
        sourceInstanceId: kosciej.instanceId,
        respondingPlayer: side,
        metadata: { cost: 1 },
      }
      addLog(newState, `${kosciej.cardData.name}: Serce wciąż bije! Wskrzesić za 1 PS?`, 'effect')
      return { newState, log: result.log, combatResult: result }
    }
  }

  return { newState, log: result.log, combatResult: result }
}

/**
 * Zmiana pozycji karty (Atak ↔ Obrona).
 */
export function changePosition(
  state: GameState,
  cardInstanceId: string,
  newPosition: CardPosition
): { newState: GameState; log: LogEntry[] } {
  const newState = cloneGameState(state)
  const card = findCardOnField(newState, cardInstanceId)

  if (!card) throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest na polu.`)
  if (card.owner !== newState.currentTurn) throw new Error(`[TurnManager] To nie twoja karta.`)

  if (card.metadata.positionLocked) throw new Error(`[TurnManager] ${card.cardData.name} jest unieruchomiona — nie może zmieniać pozycji (Łucznik).`)

  const oldPosition = card.position
  card.position = newPosition

  const log: LogEntry[] = [
    addLog(newState, `${card.cardData.name} zmienia pozycję: ${oldPosition} → ${newPosition}.`, 'system', [cardInstanceId])
  ]

  return { newState, log }
}

/**
 * PLAY — przesuwa istotę z jednej linii do innej (bez kosztu wystawienia).
 */
export function moveCreatureLine(
  state: GameState,
  cardInstanceId: string,
  targetLine: BattleLine,
  slotIndex?: number
): { newState: GameState; log: LogEntry[] } {
  const newState = cloneGameState(state)
  const log: LogEntry[] = []
  const currentPlayer = newState.players[newState.currentTurn]

  let foundCard: CardInstance | null = null
  let foundLine: BattleLine | null = null

  for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
    const idx = currentPlayer.field.lines[line].findIndex(c => c.instanceId === cardInstanceId)
    if (idx !== -1) {
      foundCard = currentPlayer.field.lines[line][idx]!
      foundLine = line
      break
    }
  }

  if (!foundCard || foundLine === null) {
    throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest na polu.`)
  }

  if (foundLine === targetLine) {
    // Same line — swap slot positions if target slot is occupied
    if (slotIndex !== undefined) {
      const occupant = currentPlayer.field.lines[targetLine]
        .find(c => (c.metadata.slotPosition as number) === slotIndex && c.instanceId !== cardInstanceId)
      if (occupant) {
        occupant.metadata.slotPosition = foundCard.metadata.slotPosition
      }
      foundCard.metadata.slotPosition = slotIndex
    }
    return { newState, log }
  }

  if (!canPlaceInLine(newState, newState.currentTurn, targetLine)) {
    throw new Error(`[TurnManager] Linia ${targetLine} jest pełna.`)
  }

  // Przesuń kartę
  const srcLine = currentPlayer.field.lines[foundLine]
  const srcIdx = srcLine.findIndex(c => c.instanceId === cardInstanceId)
  if (srcIdx !== -1) srcLine.splice(srcIdx, 1)
  foundCard.line = targetLine
  // Assign visual slot in target line
  const targetSlot = slotIndex ?? getFirstAvailableSlot(currentPlayer.field.lines[targetLine])
  foundCard.metadata.slotPosition = targetSlot
  currentPlayer.field.lines[targetLine].push(foundCard)

  log.push(addLog(
    newState,
    `${foundCard.cardData.name} przesuwa się: L${foundLine} → L${targetLine}.`,
    'system',
    [cardInstanceId]
  ))

  return { newState, log }
}

/**
 * END — kończy turę, przekazuje ją drugiemu graczowi.
 */
export function processEndPhase(state: GameState): { newState: GameState; log: LogEntry[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []

  log.push(addLog(newState, `${newState.currentTurn} kończy turę.`, 'system'))

  // Trigger ON_TURN_END dla kart aktualnego gracza
  newState = processTurnEndEffects(newState, log)

  // Sława: trofea + święto check na koniec tury
  if (newState.gameMode === 'slava') {
    const trophyLogs = grantTrophyBonus(newState)
    log.push(...trophyLogs)
    const holidayLogs = checkHoliday(newState)
    log.push(...holidayLogs)
  }

  // Zmień turę
  const nextPlayer: PlayerSide = newState.currentTurn === 'player1' ? 'player2' : 'player1'

  // Jeśli zagrał player2, zwiększ numer rundy
  if (newState.currentTurn === 'player2') {
    newState.roundNumber += 1
    log.push(addLog(newState, `=== Runda ${newState.roundNumber} ===`, 'system'))
  }

  newState.currentTurn = nextPlayer
  newState.turnNumber += 1
  newState.currentPhase = GamePhase.START

  return { newState, log }
}

// ===================================================================
// PRZEJŚCIE FAZY
// ===================================================================

export function advancePhase(state: GameState): { newState: GameState; log: LogEntry[] } {
  const newState = cloneGameState(state)
  const log: LogEntry[] = []

  const phases = [GamePhase.START, GamePhase.DRAW, GamePhase.PLAY, GamePhase.COMBAT, GamePhase.END]
  const currentIdx = phases.indexOf(newState.currentPhase)
  const nextPhase = phases[(currentIdx + 1) % phases.length]!

  newState.currentPhase = nextPhase
  log.push(addLog(newState, `Faza: ${nextPhase}`, 'system'))

  return { newState, log }
}

// ===================================================================
// EFEKTY TUROWE
// ===================================================================

function processTurnStartEffects(state: GameState, log: LogEntry[]): GameState {
  let newState = cloneGameState(state)

  // Tick paraliżu: odliczaj co rundę (player1 start = nowa runda)
  if (newState.currentTurn === 'player1') {
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      for (const card of getAllCreaturesForPlayer(newState, side)) {
        if (card.paralyzeRoundsLeft !== null && card.paralyzeRoundsLeft > 0) {
          card.paralyzeRoundsLeft -= 1
          if (card.paralyzeRoundsLeft <= 0) {
            card.paralyzeRoundsLeft = null
            card.cannotAttack = false
            card.isGrounded = false
            delete card.metadata.dziewiatkoParalyze
            log.push(addLog(newState, `${card.cardData.name}: Paraliż mija! Premie i lot przywrócone.`, 'effect'))
          }
        }
      }
    }
  }

  // Likantropia: decay — 2 rundy bez zabójstwa = -½ ATK i DEF
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    for (const card of getAllCreaturesForPlayer(newState, side)) {
      if (!card.metadata.likantropiaActive) continue
      const lastKill = (card.metadata.likantropiaLastKillRound as number) ?? 0
      if (newState.roundNumber - lastKill >= 2 && newState.roundNumber > 0) {
        card.currentStats.attack = Math.floor(card.currentStats.attack / 2)
        card.currentStats.defense = Math.max(1, Math.floor(card.currentStats.defense / 2))
        card.metadata.likantropiaLastKillRound = newState.roundNumber  // reset żeby nie halvować co rundę
        log.push(addLog(newState, `Likantropia: ${card.cardData.name} słabnie bez ofiar! Staty zredukowane.`, 'effect'))
      }
    }
  }

  // Odpal ON_TURN_START efekty dla OBU stron (Cicha, Południca itp. działają każdą turę)
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    for (const card of getAllCreaturesForPlayer(newState, side)) {
      if (card.isSilenced) continue
      const effectId = (card.cardData as any).effectId
      // Ogranicz do tury właściciela dla efektów z własnego pola (ON_TURN_START = tylko właściciel)
      // Wyjątek: Cicha i Południca dotyczą obu stron — zawsze odpalają
      const effect = getEffect(effectId)
      if (!effect) continue
      const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
      if (!triggers.includes(EffectTrigger.ON_TURN_START)) continue
      // Karta właściciela — odpal tylko w jego turę; karty "globalne" odpalaj zawsze
      if (card.owner !== newState.currentTurn
          && !['cicha_kill_weak', 'poludnica_kill_weakest'].includes(effectId)) continue
      try {
        const result = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_TURN_START })
        newState = result.newState
        log.push(...result.log)
      } catch {}
    }
  }

  return newState
}

function processRoundStartEffects(state: GameState, log: LogEntry[]): GameState {
  let newState = cloneGameState(state)

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const creatures = getAllCreaturesForPlayer(newState, side)
    for (const card of creatures) {
      const effect = getEffect(card.cardData.effectId)
      if (!effect || card.isSilenced) continue
      const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
      if (triggers.includes(EffectTrigger.ON_ROUND_START)) {
        try {
          const result = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_ROUND_START })
          newState = result.newState
          log.push(...result.log)
        } catch {}
      }
    }
  }
  return newState
}

function processTurnEndEffects(state: GameState, log: LogEntry[]): GameState {
  let newState = cloneGameState(state)
  const currentPlayer = newState.players[newState.currentTurn]

  const creatures = [
    ...currentPlayer.field.lines[BattleLine.FRONT],
    ...currentPlayer.field.lines[BattleLine.RANGED],
    ...currentPlayer.field.lines[BattleLine.SUPPORT],
  ]

  for (const card of creatures) {
    const effect = getEffect(card.cardData.effectId)
    if (!effect || card.isSilenced) continue
    const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
    if (triggers.includes(EffectTrigger.ON_TURN_END)) {
      try {
        const result = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_TURN_END })
        newState = result.newState
        log.push(...result.log)
      } catch {}
    }
  }

  // Trucizna Dziewiątka: -3 DEF na koniec tury WŁAŚCICIELA zatrutej karty
  // Szukaj zatrutych kart aktualnego gracza (tego kto kończy turę)
  const poisonDead: CardInstance[] = []
  for (const card of creatures) {
    if (card.metadata.dziewiatkoPoison && card.currentStats.defense > 0) {
      const prevDef = card.currentStats.defense
      card.currentStats.defense -= 3
      if (card.currentStats.defense <= 0) card.currentStats.defense = 0
      log.push(addLog(newState, `Trucizna: ${card.cardData.name} traci 3 DEF (${prevDef} → ${Math.max(0, card.currentStats.defense)}).`, 'effect'))
      if (card.currentStats.defense <= 0) {
        log.push(addLog(newState, `${card.cardData.name} pada od trucizny Dziewiątka!`, 'death'))
        poisonDead.push(card)
      }
    }
  }
  for (const dead of poisonDead) {
    moveToGraveyard(newState, dead)
  }

  return newState
}

// ===================================================================
// ACTIVE EVENTS
// ===================================================================

/**
 * Ticks down duration events and checks conditional events each round.
 * Called once per round at the start of player1's turn.
 */
function processActiveEvents(state: GameState, log: LogEntry[]): GameState {
  const newState = cloneGameState(state)
  const toExpire: string[] = []

  for (const event of newState.activeEvents) {
    if (event.roundsRemaining !== null) {
      // duration: tick down
      event.roundsRemaining -= 1
      if (event.roundsRemaining <= 0) {
        toExpire.push(event.instanceId)
      }
    } else if (event.cardData.persistence === 'conditional') {
      // conditional: check the condition
      const expired = checkConditionalExpiry(newState, event)
      if (expired) {
        toExpire.push(event.instanceId)
      }
    }
    // permanent: never expires
  }

  for (const id of toExpire) {
    const idx = newState.activeEvents.findIndex(e => e.instanceId === id)
    if (idx === -1) continue
    const [expired] = newState.activeEvents.splice(idx, 1)
    if (!expired) continue
    newState.players[expired.owner].graveyard.push({
      instanceId: expired.instanceId,
      cardData: expired.cardData,
      currentStats: { attack: 0, defense: 0, maxDefense: 0, maxAttack: 0 },
      position: 0 as any,
      line: null,
      activeEffects: [],
      equippedArtifacts: [],
      isRevealed: true,
      turnsInPlay: 0,
      roundEnteredPlay: 0,
      owner: expired.owner,
      isSilenced: false,
      isImmune: false,
      cannotAttack: false,
      isGrounded: false,
      hasAttackedThisTurn: false,
      hasMovedThisTurn: false,
      poisonRoundsLeft: null,
      paralyzeRoundsLeft: null,
      metadata: {},
    })
    log.push(addLog(newState, `${expired.cardData.name} wygasa i trafia na cmentarz — zdarzenie dobiegło końca (czas trwania wyczerpany).`, 'effect'))
  }

  return newState
}

/**
 * Returns true if the conditional event's end condition is met.
 */
function checkConditionalExpiry(state: GameState, event: ActiveEventCard): boolean {
  // "Bitwa Nad Tollense" — ends when any player has 0 creatures on field
  if (event.cardData.effectId === 'adventure_bitwa_nad_tollense') {
    const p1Empty = getAllCreaturesForPlayer(state, 'player1').length === 0
    const p2Empty = getAllCreaturesForPlayer(state, 'player2').length === 0
    return p1Empty || p2Empty
  }
  // Add other conditional checks here as needed
  return false
}

// ===================================================================
// HELPERS
// ===================================================================

function getAllCreaturesForPlayer(state: GameState, side: PlayerSide) {
  const player = state.players[side]
  return [
    ...player.field.lines[BattleLine.FRONT],
    ...player.field.lines[BattleLine.RANGED],
    ...player.field.lines[BattleLine.SUPPORT],
  ]
}

function findCardOnField(state: GameState, instanceId: string): CardInstance | null {
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = state.players[side].field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
  }
  return null
}

function findCardAnywhere(state: GameState, instanceId: string): CardInstance | null {
  for (const player of Object.values(state.players)) {
    const inHand = player.hand.find(c => c.instanceId === instanceId)
    if (inHand) return inHand
    const onField = findCardOnField(state, instanceId)
    if (onField) return onField
  }
  return null
}
