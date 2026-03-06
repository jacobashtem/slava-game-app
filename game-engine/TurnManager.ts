/**
 * TurnManager — zarządza fazami tury: START → DRAW → PLAY → COMBAT → END
 */

import type { GameState, CardInstance, LogEntry, ActiveEventCard } from './types'
import { GamePhase, EffectTrigger, BattleLine, CardPosition } from './constants'
import type { PlayerSide } from './types'
import { cloneGameState, addLog } from './GameStateUtils'
import { drawCard } from './DeckBuilder'
import { placeCreatureOnField, canPlayCreature, canPlaceInLine } from './LineManager'
import { resolveAttack } from './CombatResolver'
import { getEffect, canActivateEffect } from './EffectRegistry'
import { GOLD_EDITION_RULES } from './constants'

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
    }
  }

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

  while (currentPlayer.hand.length < target) {
    const card = drawCard(currentPlayer)
    if (!card) break
    drawn.push(card)
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
  targetLine: BattleLine
): { newState: GameState; log: LogEntry[] } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []

  const currentPlayer = newState.players[newState.currentTurn]

  // Znajdź kartę w ręce
  const handIdx = currentPlayer.hand.findIndex(c => c.instanceId === cardInstanceId)
  if (handIdx === -1) throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest w ręce.`)

  const card = currentPlayer.hand[handIdx]

  if (card.cardData.cardType !== 'creature') {
    throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest istotą.`)
  }

  if (!canPlayCreature(newState, newState.currentTurn)) {
    throw new Error(`[TurnManager] Nie można teraz wystawić istoty (limit lub efekt).`)
  }

  if (!canPlaceInLine(newState, newState.currentTurn, targetLine)) {
    throw new Error(`[TurnManager] Linia ${targetLine} jest pełna.`)
  }

  placeCreatureOnField(newState, card, targetLine, newState.roundNumber)
  const cardDisplayName = card.owner === 'player2' ? 'zakrytą jednostkę' : card.cardData.name
  log.push(addLog(newState, `${newState.currentTurn} wystawia ${cardDisplayName} w linii ${targetLine}.`, 'play', [cardInstanceId]))

  // Trigger ON_PLAY
  const effect = getEffect(card.cardData.effectId)
  if (effect) {
    const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
    if (triggers.includes(EffectTrigger.ON_PLAY) && !card.isSilenced) {
      if (effect.activatable) {
        // Activatable ON_PLAY — czekamy na potwierdzenie gracza (gratis przy wystawieniu)
        newState.awaitingOnPlayConfirmation = card.instanceId
      } else {
        try {
          const effectResult = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_PLAY })
          newState = effectResult.newState
          log.push(...effectResult.log)
        } catch (err) {
          console.warn(`[TurnManager] Błąd ON_PLAY efektu "${card.cardData.effectId}":`, err)
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

  const card = currentPlayer.hand[handIdx]

  if (card.cardData.cardType !== 'adventure') {
    throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest przygodą.`)
  }

  // Koszt: podstawowy = DARMOWY, ulepszony = 2 ZŁ
  const adventureCost = useEnhanced ? GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST : 0
  if (adventureCost > 0 && currentPlayer.gold < adventureCost) {
    throw new Error(`[TurnManager] Brak Złocisza. Potrzebujesz ${adventureCost} ZŁ na ulepszony efekt.`)
  }

  // Sprawdź limit przygód na turę
  if (currentPlayer.adventuresPlayedThisTurn >= GOLD_EDITION_RULES.PLAY_LIMIT_ADVENTURES) {
    throw new Error(`[TurnManager] Możesz zagrać tylko ${GOLD_EDITION_RULES.PLAY_LIMIT_ADVENTURES} przygodę na turę.`)
  }

  currentPlayer.gold -= adventureCost
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
      console.warn(`[TurnManager] Błąd efektu przygody "${effectId}":`, err)
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
    const activeEvent: ActiveEventCard = {
      instanceId: card.instanceId,
      cardData: adventureData,
      owner: newState.currentTurn,
      playedOnRound: newState.roundNumber,
      roundsRemaining: persistence === 'duration' ? (adventureData.durationRounds ?? null) : null,
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

  log.push(addLog(newState, `${newState.currentTurn} dobiera kartę z talii.`, 'draw'))
  return { newState, log }
}

/**
 * PLAY/COMBAT — gracz aktywuje zdolność istoty (⚡ kliknięcie).
 * Sprawdza: activatable, cooldown, koszt ZŁ, uciszenie.
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

  // Sprawdź i pobierz koszt ZŁ
  const cost = isFreeActivation ? 0 : (effect.activationCost ?? 0)
  const owner = newState.players[newState.currentTurn]
  if (owner.gold < cost) {
    throw new Error(`Brak Złocisza. Masz ${owner.gold} ZŁ, potrzebujesz ${cost}.`)
  }
  owner.gold -= cost

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
    console.warn(`[TurnManager] activateCreatureEffect error for "${effect.id}":`, err)
    owner.gold += cost // zwróć złoto jeśli błąd
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
    `${card.cardData.name} aktywuje: "${effect.name}"${cost > 0 ? ` (-${cost} ZŁ)` : ''}.`,
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
  defenderInstanceId: string
): { newState: GameState; log: LogEntry[] } {
  if (state.currentPhase !== GamePhase.COMBAT) {
    throw new Error(`[TurnManager] Nie jesteś w fazie COMBAT (jesteś w ${state.currentPhase}).`)
  }

  const { newState, result } = resolveAttack(state, attackerInstanceId, defenderInstanceId)
  return { newState, log: result.log }
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
  targetLine: BattleLine
): { newState: GameState; log: LogEntry[] } {
  const newState = cloneGameState(state)
  const log: LogEntry[] = []
  const currentPlayer = newState.players[newState.currentTurn]

  let foundCard: CardInstance | null = null
  let foundLine: BattleLine | null = null

  for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
    const idx = currentPlayer.field.lines[line].findIndex(c => c.instanceId === cardInstanceId)
    if (idx !== -1) {
      foundCard = currentPlayer.field.lines[line][idx]
      foundLine = line
      break
    }
  }

  if (!foundCard || foundLine === null) {
    throw new Error(`[TurnManager] Karta ${cardInstanceId} nie jest na polu.`)
  }

  if (foundLine === targetLine) {
    return { newState, log }
  }

  if (!canPlaceInLine(newState, newState.currentTurn, targetLine)) {
    throw new Error(`[TurnManager] Linia ${targetLine} jest pełna.`)
  }

  // Przesuń kartę
  const srcLine = currentPlayer.field.lines[foundLine]
  srcLine.splice(srcLine.findIndex(c => c.instanceId === cardInstanceId), 1)
  foundCard.line = targetLine
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
  const nextPhase = phases[(currentIdx + 1) % phases.length]

  newState.currentPhase = nextPhase
  log.push(addLog(newState, `Faza: ${nextPhase}`, 'system'))

  return { newState, log }
}

// ===================================================================
// EFEKTY TUROWE
// ===================================================================

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
      metadata: {},
    })
    log.push(addLog(newState, `${expired.cardData.name} wygasa i trafia na cmentarz.`, 'effect'))
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
