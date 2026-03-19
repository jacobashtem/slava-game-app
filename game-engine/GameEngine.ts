/**
 * GameEngine — główna klasa orkiestrująca grę.
 * Łączy: TurnManager, CombatResolver, LineManager, DeckBuilder.
 * Store Pinia jest tylko adapterem który wywołuje metody tego silnika.
 */

import type { GameState, LogEntry, CardInstance, CombatResult } from './types'
import { GamePhase, BattleLine, CardPosition } from './constants'
import type { PlayerSide } from './types'
import { createInitialGameState, cloneGameState, addLog, moveToGraveyard, removeCardFromField } from './GameStateUtils'
import { CardFactory } from './CardFactory'
import { buildRandomDeck, drawCards, GOLD_EDITION_DECK_CONFIG } from './DeckBuilder'
import { checkWinCondition, getAllCreaturesOnField, canAttack } from './LineManager'
import {
  processStartPhase,
  processDrawPhase,
  processEndPhase,
  playCreature,
  playAdventure,
  performAttack,
  changePosition,
  moveCreatureLine,
  activateCreatureEffect,
  drawCardManually,
} from './TurnManager'
import { resumeCombatCounterattack } from './CombatResolver'
import { GOLD_EDITION_RULES, SLAVA_RULES, EffectTrigger } from './constants'
import { buildAlphaDeck } from './DeckBuilder'
import { getEffect, HATCHABLE_DRAGONS, hatchDragon } from './EffectRegistry'
import {
  createInitialSlavaState,
  checkSlavaWinCondition,
  grantPassiveIncome,
  grantTrophyBonus,
  checkHoliday,
  claimHoliday,
  processSeasonChange,
  resetTurnTracking,
  checkBreakthrough,
  executeDivineFavor,
  startAuction,
  placeBid,
  resolveAuction,
  aiAuctionDecision,
  activatePendingFavor,
  performPlunder,
} from './GloryManager'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

/** Get the opponent side */
export function opponentOf(side: PlayerSide): PlayerSide {
  return side === 'player1' ? 'player2' : 'player1'
}

export class GameEngine {
  private state: GameState
  private factory: CardFactory
  private onStateChange?: (state: GameState) => void
  private onLogEntry?: (entry: LogEntry) => void
  private arenaMode = false

  /** Last combat result — sideband for VFX (read after playerAttack/aiAttack, then clear) */
  lastCombatResult: CombatResult | null = null

  constructor() {
    this.factory = new CardFactory()
    this.factory.loadCreatures(istotypData as any)
    this.factory.loadAdventures(przygodyData as any)
    this.state = createInitialGameState('gold')
  }

  // ===== SETUP =====

  startAlphaGame(playerDomainFilter?: number[]): GameState {
    this.arenaMode = false
    this.state = createInitialGameState('gold')

    // Losowa pora roku startowa (offset 0–3 przesuwa sezon, runda zawsze = 1)
    this.state.seasonOffset = Math.floor(Math.random() * 4)

    // Losowy gracz zaczyna
    this.state.currentTurn = Math.random() < 0.5 ? 'player1' : 'player2'

    const playerConfig = playerDomainFilter
      ? { ...GOLD_EDITION_DECK_CONFIG, domainFilter: playerDomainFilter }
      : undefined
    const deck1 = buildAlphaDeck(this.factory, 'player1', playerConfig)
    const deck2 = buildAlphaDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    drawCards(this.state.players.player1, GOLD_EDITION_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, GOLD_EDITION_RULES.STARTING_HAND)

    this.state.players.player1.glory = GOLD_EDITION_RULES.STARTING_GOLD
    this.state.players.player2.glory = GOLD_EDITION_RULES.STARTING_GOLD

    const who = this.state.currentTurn === 'player1' ? 'Ty zaczynasz!' : 'Przeciwnik zaczyna!'
    const startLog = addLog(this.state, `Gra Alpha rozpoczęta! ${who}`, 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  /**
   * Tutorial mode — deterministic decks, player always first, easy AI.
   * Cards are hand-picked for teaching: melee, ranged, magic, elemental + 2 adventures.
   */
  startTutorialGame(): GameState {
    this.arenaMode = false
    this.state = createInitialGameState('gold')
    this.state.seasonOffset = 0 // Wiosna
    this.state.currentTurn = 'player1' // Gracz zawsze pierwszy

    // Deterministic tutorial decks — simple, diverse cards
    // Player: melee tank, ranged, healer, elemental, magic + adventures
    const playerCreatureIds = [8, 55, 13, 6, 51, 17, 54, 47, 19, 28] // Błotnik, Tur, Dziki Myśliwy, Brzegina, Wołch, Matoha, Polewik, Starszyzna, Rodzanice, Świetle
    const playerAdventureIds = [6, 10, 3] // Okaleczenie, Rusałczy Taniec, Oblęd
    const aiCreatureIds = [82, 85, 69, 92, 75, 70, 79, 65, 68, 80] // Strzyga, Utopiec, Homen, Bazyliszek, Topielec, Kostobój, Południca, Boginki, Ghul, Poroniec
    const aiAdventureIds = [6, 3, 7] // Okaleczenie, Oblęd, Arkona

    const buildDeck = (creatureIds: number[], adventureIds: number[], owner: 'player1' | 'player2') => {
      const deck: CardInstance[] = []
      for (const id of creatureIds) {
        const card = this.factory.createCreatureInstance(id, owner)
        if (card) deck.push(card)
      }
      for (const id of adventureIds) {
        const card = this.factory.createAdventureInstance(id, owner)
        if (card) deck.push(card)
      }
      return deck
    }

    this.state.players.player1.deck = buildDeck(playerCreatureIds, playerAdventureIds, 'player1')
    this.state.players.player2.deck = buildDeck(aiCreatureIds, aiAdventureIds, 'player2')

    drawCards(this.state.players.player1, 5)
    drawCards(this.state.players.player2, 5)

    this.state.players.player1.glory = 3 // Mniej PS — tutorial uczy oszczędzania
    this.state.players.player2.glory = 3

    const startLog = addLog(this.state, 'Samouczek rozpoczęty! Żerca poprowadzi Cię przez zasady.', 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  startGame(gameMode: 'gold' | 'slava' = 'gold', playerDomainFilter?: number[]): GameState {
    this.arenaMode = false
    this.state = createInitialGameState(gameMode)

    // Losowa pora roku startowa (offset 0–3 przesuwa sezon, runda zawsze = 1)
    this.state.seasonOffset = Math.floor(Math.random() * 4)

    // Losowy gracz zaczyna
    this.state.currentTurn = Math.random() < 0.5 ? 'player1' : 'player2'

    // Zbuduj talie
    const playerConfig = playerDomainFilter
      ? { ...GOLD_EDITION_DECK_CONFIG, domainFilter: playerDomainFilter }
      : undefined
    const deck1 = buildRandomDeck(this.factory, 'player1', playerConfig)
    const deck2 = buildRandomDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    // Dobierz karty startowe
    drawCards(this.state.players.player1, GOLD_EDITION_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, GOLD_EDITION_RULES.STARTING_HAND)

    this.state.players.player1.glory = GOLD_EDITION_RULES.STARTING_GOLD
    this.state.players.player2.glory = GOLD_EDITION_RULES.STARTING_GOLD

    // Initialize slava data if applicable
    if (gameMode === 'slava') {
      this.state.slavaData = createInitialSlavaState(this.state.roundNumber, this.state.seasonOffset)
      this.state.players.player1.glory = 5
      this.state.players.player2.glory = 5
    }

    const who = this.state.currentTurn === 'player1' ? 'Ty zaczynasz!' : 'Przeciwnik zaczyna!'
    const startLog = addLog(this.state, `Gra rozpoczęta! ${who}`, 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    // Zaczyna faza START dla player1
    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  // ===== TRYB SŁAWA! =====

  startSlavaGame(playerDomainFilter?: number[]): GameState {
    this.arenaMode = false
    this.state = createInitialGameState('slava')

    // Sława: runda 1, losowy sezon startowy
    this.state.seasonOffset = Math.floor(Math.random() * 4)

    // Losowy gracz zaczyna
    this.state.currentTurn = Math.random() < 0.5 ? 'player1' : 'player2'

    // Zbuduj talie (losowe, pełna pula)
    const playerConfig = playerDomainFilter
      ? { ...GOLD_EDITION_DECK_CONFIG, domainFilter: playerDomainFilter }
      : undefined
    const deck1 = buildRandomDeck(this.factory, 'player1', playerConfig)
    const deck2 = buildRandomDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    // Dobierz karty startowe
    drawCards(this.state.players.player1, SLAVA_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, SLAVA_RULES.STARTING_HAND)

    // W Sława: PS startowe = 0 (income +1/turę)
    this.state.players.player1.glory = 0
    this.state.players.player2.glory = 0

    // Inicjalizuj SlavaState
    this.state.slavaData = createInitialSlavaState(this.state.roundNumber, this.state.seasonOffset)

    const startLog = addLog(this.state, '⚔ TRYB SŁAWA! Cel: zdobądź 10 Punktów Sławy!', 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    // runStartPhase handles processSeasonChange + passive income + draw
    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  // ===== SLAVA: LEGACY WRAPPERS (single-player backward compat) =====

  playerInvokeGod(godId: number, bid: number): GameState {
    return this.sideInvokeGod('player1', godId, bid)
  }

  aiInvokeGod(godId: number, bid: number): GameState {
    return this.sideInvokeGod('player2', godId, bid)
  }

  playerActivateFavor(targetInstanceId?: string): GameState {
    return this.sideActivateFavor('player1', targetInstanceId)
  }

  aiActivateFavor(targetInstanceId?: string): GameState {
    return this.sideActivateFavor('player2', targetInstanceId)
  }

  playerClaimHoliday(): GameState {
    return this.sideClaimHoliday('player1')
  }

  playerPlunder(): GameState {
    return this.sidePlunder('player1')
  }

  aiPlunder(): GameState {
    return this.sidePlunder('player2')
  }

  /**
   * Load a GameState directly into the engine (for multiplayer setup, state patches).
   */
  loadState(newState: GameState): void {
    this.state = cloneGameState(newState)
  }

  // ===== ARENA =====

  /**
   * Załaduj dowolny customowy GameState (dla trybu Arena/playground).
   */
  setupArena(customState: GameState): GameState {
    this.arenaMode = true
    this.state = cloneGameState(customState)
    this.notifyStateChange()
    return cloneGameState(this.state)
  }



  // ===== AKCJE GRACZA (single-player wrappers → side* methods) =====

  playerPlayCreature(cardInstanceId: string, targetLine: BattleLine, slotIndex?: number): GameState {
    return this.sidePlayCreature('player1', cardInstanceId, targetLine, slotIndex)
  }

  playerPlayAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false): GameState {
    return this.sidePlayAdventure('player1', cardInstanceId, targetInstanceId, useEnhanced)
  }

  playerAttack(attackerInstanceId: string, defenderInstanceId: string): GameState {
    return this.sideAttack('player1', attackerInstanceId, defenderInstanceId)
  }

  playerChangePosition(cardInstanceId: string, newPos: CardPosition): GameState {
    return this.sideChangePosition('player1', cardInstanceId, newPos)
  }

  playerMoveCreatureLine(cardInstanceId: string, targetLine: BattleLine, slotIndex?: number): GameState {
    return this.sideMoveCreatureLine('player1', cardInstanceId, targetLine, slotIndex)
  }

  playerActivateEffect(cardInstanceId: string, targetInstanceId?: string): GameState {
    return this.sideActivateEffect('player1', cardInstanceId, targetInstanceId)
  }

  /**
   * Gracz potwierdza wykonanie efektu ON_PLAY przy wystawieniu (gratis).
   */
  confirmOnPlay(): GameState {
    const cardId = this.state.awaitingOnPlayConfirmation
    if (!cardId) return cloneGameState(this.state)

    const newState = cloneGameState(this.state)
    newState.awaitingOnPlayConfirmation = null

    const card = getAllCreaturesOnField(newState, 'player1').find(c => c.instanceId === cardId)
      ?? getAllCreaturesOnField(newState, 'player2').find(c => c.instanceId === cardId)
    if (!card) return cloneGameState(this.state)

    const effect = getEffect((card.cardData as any).effectId)
    if (!effect) return cloneGameState(this.state)

    try {
      const result = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_PLAY })
      this.applyStateAndLog(result.newState, result.log)
    } catch (err) {
      // ON_PLAY effect failed — fallback to state without effect
      this.state = newState
    }

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz rezygnuje z efektu ON_PLAY (klika NIE).
   * Jeśli karta ma też zdolność activatable, zaznacza freeActivationPending,
   * żeby gracz mógł skorzystać z darmowej aktywacji później (przycisk ⚡).
   */
  skipOnPlay(): GameState {
    const cardId = this.state.awaitingOnPlayConfirmation
    const newState = cloneGameState(this.state)
    newState.awaitingOnPlayConfirmation = null

    if (cardId) {
      const card = getAllCreaturesOnField(newState, 'player1').find(c => c.instanceId === cardId)
        ?? getAllCreaturesOnField(newState, 'player2').find(c => c.instanceId === cardId)
      const effect = card ? getEffect((card.cardData as any).effectId) : null
      if (card && effect?.activatable) {
        card.metadata.freeActivationPending = true
      }
    }

    this.applyStateAndLog(newState, [addLog(newState, 'Efekt przy wystawieniu pominięty.', 'system')])
    return cloneGameState(this.state)
  }

  /**
   * Gracz poddaje grę.
   */
  surrender(side: 'player1' | 'player2'): GameState {
    const newState = cloneGameState(this.state)
    newState.winner = side === 'player1' ? 'player2' : 'player1'
    const log = [addLog(newState, `${side} poddaje grę!`, 'system')]
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  playerDrawCard(): GameState {
    return this.sideDrawCard('player1')
  }

  playerAdvancePhase(): GameState {
    return this.sideAdvancePhase('player1')
  }

  playerEndTurn(): GameState {
    return this.sideEndTurn('player1')
  }

  // ===== AI WRAPPERS (single-player backward compat) =====

  aiPlayCreature(cardInstanceId: string, targetLine: BattleLine, skipStrelaCheck = false): GameState {
    return this.sidePlayCreature('player2', cardInstanceId, targetLine, undefined, skipStrelaCheck)
  }

  aiPlayAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false, skipStrelaCheck = false): GameState {
    return this.sidePlayAdventure('player2', cardInstanceId, targetInstanceId, useEnhanced, skipStrelaCheck)
  }

  aiAdvanceToCombat(): GameState {
    return this.sideAdvancePhase('player2')
  }

  aiAttack(attackerInstanceId: string, defenderInstanceId: string): GameState {
    return this.sideAttack('player2', attackerInstanceId, defenderInstanceId)
  }

  aiChangePosition(cardInstanceId: string, newPos: CardPosition): GameState {
    return this.sideChangePosition('player2', cardInstanceId, newPos)
  }

  aiActivateEffect(cardInstanceId: string, targetInstanceId?: string): GameState {
    return this.sideActivateEffect('player2', cardInstanceId, targetInstanceId)
  }

  aiEndTurn(): GameState {
    return this.sideEndTurn('player2')
  }

  // ===== UNIFIED SIDE-AWARE METHODS (multiplayer-safe) =====

  sidePlayCreature(side: PlayerSide, cardInstanceId: string, targetLine: BattleLine, slotIndex?: number, skipStrelaCheck = false): GameState {
    this.assertTurnOf(side)
    this.assertPhase(GamePhase.PLAY)

    // Strela: opponent (if human) may intercept
    if (!skipStrelaCheck) {
      const opponent = opponentOf(side)
      const opponentPlayer = this.state.players[opponent]
      if (!opponentPlayer.isAI) {
        const strelaCard = opponentPlayer.hand.find(
          c => (c.cardData as any).effectId === 'strela_flash_counter'
        )
        if (strelaCard) {
          const pendingState = cloneGameState(this.state)
          pendingState.pendingInteraction = {
            type: 'strela_intercept',
            sourceInstanceId: strelaCard.instanceId,
            respondingPlayer: opponent,
            metadata: { playingSide: side, aiCardInstanceId: cardInstanceId, aiTargetLine: targetLine, aiCardType: 'creature' },
          }
          addLog(pendingState, `Przeciwnik zagrywa kartę! Strela jest w ręce — czy chcesz przerwać?`, 'effect')
          this.applyStateAndLog(pendingState, [])
          return cloneGameState(this.state)
        }
      }
    }

    const { newState, log } = playCreature(this.state, cardInstanceId, targetLine, slotIndex)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sidePlayAdventure(side: PlayerSide, cardInstanceId: string, targetInstanceId?: string, useEnhanced = false, skipStrelaCheck = false): GameState {
    this.assertTurnOf(side)
    this.assertPhase(GamePhase.PLAY)

    if (!skipStrelaCheck) {
      const opponent = opponentOf(side)
      const opponentPlayer = this.state.players[opponent]
      if (!opponentPlayer.isAI) {
        const strelaCard = opponentPlayer.hand.find(
          c => (c.cardData as any).effectId === 'strela_flash_counter'
        )
        if (strelaCard) {
          const pendingState = cloneGameState(this.state)
          pendingState.pendingInteraction = {
            type: 'strela_intercept',
            sourceInstanceId: strelaCard.instanceId,
            respondingPlayer: opponent,
            metadata: { playingSide: side, aiCardInstanceId: cardInstanceId, aiTargetInstanceId: targetInstanceId, aiCardType: 'adventure', aiUseEnhanced: useEnhanced },
          }
          addLog(pendingState, `Przeciwnik zagrywa kartę! Strela jest w ręce — czy chcesz przerwać?`, 'effect')
          this.applyStateAndLog(pendingState, [])
          return cloneGameState(this.state)
        }
      }
    }

    const { newState, log } = playAdventure(this.state, cardInstanceId, targetInstanceId, useEnhanced)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sideAttack(side: PlayerSide, attackerInstanceId: string, defenderInstanceId: string): GameState {
    this.assertTurnOf(side)
    this.assertPhase(GamePhase.COMBAT)

    // Guard: skip if attacker or defender no longer on field (killed by earlier attack/intercept)
    const opponent = side === 'player1' ? 'player2' : 'player1'
    if (!getAllCreaturesOnField(this.state, side).some(c => c.instanceId === attackerInstanceId) ||
        !getAllCreaturesOnField(this.state, opponent).some(c => c.instanceId === defenderInstanceId)) {
      return cloneGameState(this.state)
    }

    const sideCreatures = getAllCreaturesOnField(this.state, side)

    // Przyjaźń+: free attack check
    const attacker = sideCreatures.find(c => c.instanceId === attackerInstanceId)
    const hasFreeAttack = attacker && ((attacker.metadata.freeAttacksLeft as number) ?? 0) > 0

    if (!hasFreeAttack) {
      // Kikimora: her attack doesn't use attack slot
      const normalAttacksUsed = sideCreatures
        .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
        .filter(c => {
          // Leśnica: can attack 2x — only counts if both slots used
          if ((c.cardData as any).effectId === 'lesnica_double_attack') {
            return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
          }
          return c.hasAttackedThisTurn
        }).length
      // Chłop: AURA gives +1 attack slot
      const hasChlop = sideCreatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
      const maxAttacks = hasChlop ? 2 : 1
      if (normalAttacksUsed >= maxAttacks) {
        throw new Error('Możesz wykonać tylko jeden atak na turę.')
      }
    }

    // Liczyrzepa: choose attack type before attacking
    const attackerCard = sideCreatures.find(c => c.instanceId === attackerInstanceId)
    if (attackerCard && (attackerCard.cardData as any).effectId === 'liczyrzepa_choose_type') {
      const pendingState = cloneGameState(this.state)
      pendingState.pendingInteraction = {
        type: 'liczyrzepa_type',
        sourceInstanceId: attackerInstanceId,
        respondingPlayer: side,
        availableChoices: ['Wręcz', 'Żywioł', 'Magia', 'Dystans'],
        targetInstanceId: defenderInstanceId,
      }
      addLog(pendingState, `${attackerCard.cardData.name}: Wybierz typ ataku przed uderzeniem!`, 'effect')
      this.applyStateAndLog(pendingState, [])
      return cloneGameState(this.state)
    }

    const { newState, log, combatResult } = performAttack(this.state, attackerInstanceId, defenderInstanceId)
    this.lastCombatResult = combatResult ?? null
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sideChangePosition(side: PlayerSide, cardInstanceId: string, newPos: CardPosition): GameState {
    this.assertTurnOf(side)
    const { newState, log } = changePosition(this.state, cardInstanceId, newPos)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  sideMoveCreatureLine(side: PlayerSide, cardInstanceId: string, targetLine: BattleLine, slotIndex?: number): GameState {
    this.assertTurnOf(side)
    const { newState, log } = moveCreatureLine(this.state, cardInstanceId, targetLine, slotIndex)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  sideActivateEffect(side: PlayerSide, cardInstanceId: string, targetInstanceId?: string): GameState {
    this.assertTurnOf(side)

    // Dziewiątko: AKCJA = pełny atak dystansowy → kamikaze → trucizna/paraliż
    const dziewiatkoCard = getAllCreaturesOnField(this.state, side).find(c => c.instanceId === cardInstanceId)
    if (dziewiatkoCard && (dziewiatkoCard.cardData as any).effectId === 'dziewiatko_deathmark' && targetInstanceId) {
      // Override attackType to Ranged BEFORE activation (karta i tak ginie)
      const cardBefore = getAllCreaturesOnField(this.state, side).find(c => c.instanceId === cardInstanceId)
      if (cardBefore) {
        (cardBefore.cardData as any).attackType = 3 // AttackType.RANGED
      }

      // Run activateCreatureEffect for cooldown/cost/validation only
      const { newState: activatedState, log: activateLog } = activateCreatureEffect(this.state, cardInstanceId, targetInstanceId)
      this.applyStateAndLog(activatedState, activateLog)

      // Perform real ranged attack through combat pipeline
      try {
        const { newState: combatState, log: combatLog, combatResult } = performAttack(
          this.state, cardInstanceId, targetInstanceId,
          { forcedByEffect: true, skipChowaniecCheck: true, skipBrzeginaCheck: true }
        )
        this.lastCombatResult = combatResult ?? null
        this.applyStateAndLog(combatState, combatLog)
      } catch {
        // Attack failed (target died, etc.)
      }

      // Kamikaze: Dziewiątko ginie (jeśli jeszcze na polu — mogło zginąć od kontrataku)
      const dziewiatkoStillAlive = getAllCreaturesOnField(this.state, side).find(c => c.instanceId === cardInstanceId)
      if (dziewiatkoStillAlive) {
        const kamikazeState = cloneGameState(this.state)
        const kamikazeCard = getAllCreaturesOnField(kamikazeState, side).find(c => c.instanceId === cardInstanceId)
        if (kamikazeCard) {
          kamikazeCard.currentStats.defense = 0
          moveToGraveyard(kamikazeState, kamikazeCard)
          const kamikazeLog = [addLog(kamikazeState, `Dziewiątko poświęca się — śmiertelne żądło!`, 'death')]
          this.applyStateAndLog(kamikazeState, kamikazeLog)
        }
      }

      // Jeśli cel przeżył — modal trucizna/paraliż (chyba że cel jest odporny)
      const targetStillAlive = getAllCreaturesOnField(this.state, opponentOf(side)).find(c => c.instanceId === targetInstanceId)
      if (targetStillAlive && targetStillAlive.currentStats.defense > 0) {
        if (targetStillAlive.isImmune) {
          const immuneState = cloneGameState(this.state)
          addLog(immuneState, `${targetStillAlive.cardData.name}: ODPORNY — trucizna Dziewiątka nie działa!`, 'effect')
          this.applyStateAndLog(immuneState, [])
        } else {
          const poisonState = cloneGameState(this.state)
          poisonState.pendingInteraction = {
            type: 'dziewiatko_poison',
            sourceInstanceId: cardInstanceId,
            respondingPlayer: side,
            targetInstanceId,
            availableChoices: ['trucizna', 'paraliz'],
          }
          addLog(poisonState, `Wybierz efekt trucizny na ${targetStillAlive.cardData.name}!`, 'effect')
          this.applyStateAndLog(poisonState, [])
        }
      }

      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    const { newState, log } = activateCreatureEffect(this.state, cardInstanceId, targetInstanceId)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sideAdvancePhase(side: PlayerSide): GameState {
    this.assertTurnOf(side)
    const currentPhase = this.state.currentPhase
    if (currentPhase === GamePhase.PLAY) {
      const newState = cloneGameState(this.state)
      newState.currentPhase = GamePhase.COMBAT
      const log = [addLog(newState, 'Faza walki!', 'system')]
      this.applyStateAndLog(newState, log)
    } else if (currentPhase === GamePhase.COMBAT) {
      this.sideEndTurn(side)
    }
    return cloneGameState(this.state)
  }

  sideEndTurn(side: PlayerSide): GameState {
    this.assertTurnOf(side)
    const { newState, log } = processEndPhase(this.state)
    this.applyStateAndLog(newState, log)
    this.state = this.runStartPhase(this.state)
    this.notifyStateChange()
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sideDrawCard(side: PlayerSide): GameState {
    this.assertTurnOf(side)
    const { newState, log } = drawCardManually(this.state)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  // === SLAVA unified ===

  sideInvokeGod(side: PlayerSide, godId: number, bid: number): GameState {
    this.assertTurnOf(side)
    if (this.state.gameMode !== 'slava' || !this.state.slavaData) {
      throw new Error('Boże Łaski dostępne tylko w trybie Sława!')
    }
    if (this.state.slavaData.pendingFavor) {
      throw new Error('Już jest oczekująca łaska boga!')
    }
    const god = this.state.slavaData.gods.find(g => g.id === godId)
    if (!god) throw new Error('Nieznany bóg!')
    if (god.usedThisCycle) throw new Error('Bóg już użyty w tej porze roku!')
    if (this.state.players[side].glory < bid) throw new Error('Za mało PS!')

    const opponent = opponentOf(side)
    const newState = cloneGameState(this.state)
    const auction = startAuction(godId, side, bid)

    if (this.state.players[opponent].isAI) {
      // AI responds immediately
      const aiResponse = aiAuctionDecision(newState, auction)
      if (aiResponse.bid) {
        placeBid(auction, opponent, aiResponse.amount)
        newState.slavaData!.activeAuction = auction
        newState.pendingInteraction = {
          type: 'auction_bid',
          sourceInstanceId: `god-${godId}`,
          respondingPlayer: side,
          metadata: { godId, currentBid: aiResponse.amount, currentBidder: opponent, godName: god.name },
        }
        this.applyStateAndLog(newState, [addLog(newState, `AI przebija licytację o ${god.name}: ${aiResponse.amount} PS!`, 'glory')])
      } else {
        const resolveLogs = resolveAuction(newState, auction)
        this.applyStateAndLog(newState, resolveLogs)
        this.checkWinAndNotify()
      }
    } else {
      // Human opponent — pending interaction for them to counter-bid
      newState.slavaData!.activeAuction = auction
      newState.pendingInteraction = {
        type: 'auction_bid',
        sourceInstanceId: `god-${godId}`,
        respondingPlayer: opponent,
        metadata: { godId, currentBid: bid, currentBidder: side, godName: god.name },
      }
      this.applyStateAndLog(newState, [addLog(newState, `Licytacja o łaskę ${god.name}: ${bid} PS!`, 'glory')])
    }

    return cloneGameState(this.state)
  }

  sideActivateFavor(side: PlayerSide, targetInstanceId?: string): GameState {
    this.assertTurnOf(side)
    if (this.state.gameMode !== 'slava' || !this.state.slavaData?.pendingFavor) {
      throw new Error('Brak oczekującej łaski boga!')
    }
    const favor = this.state.slavaData.pendingFavor
    if (favor.winnerSide !== side) {
      throw new Error('Ta łaska nie należy do ciebie!')
    }
    if (favor.wonOnRound >= this.state.roundNumber) {
      throw new Error('Łaska będzie dostępna od następnej rundy!')
    }

    const newState = cloneGameState(this.state)
    const log = activatePendingFavor(newState, targetInstanceId)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sideClaimHoliday(side: PlayerSide): GameState {
    this.assertTurnOf(side)
    if (this.state.gameMode !== 'slava' || !this.state.slavaData) {
      throw new Error('Święta dostępne tylko w trybie Sława!')
    }
    const newState = cloneGameState(this.state)
    const log = claimHoliday(newState, side)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  sidePlunder(side: PlayerSide): GameState {
    this.assertTurnOf(side)
    if (this.state.currentPhase !== GamePhase.COMBAT) {
      throw new Error('Łupienie możliwe tylko w fazie walki!')
    }
    if (this.state.roundNumber < 3) throw new Error('Łupienie dostępne od 3. rundy!')

    const newState = cloneGameState(this.state)
    const log = performPlunder(newState, side)
    if (log.length === 0) {
      throw new Error('Nie można łupić — wróg ma istoty na polu lub 0 PS!')
    }
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  // ===== PENDING INTERACTION RESOLVER =====

  /**
   * Rozwiązuje oczekującą interakcję gracza (np. Alkonost hipnoza, Kresnik wybór buffy).
   * `choice` — instanceId karty lub string z opcją (zależnie od typu interakcji).
   */
  resolvePendingInteraction(choice: string): GameState {
    const interaction = this.state.pendingInteraction
    if (!interaction) throw new Error('[GameEngine] Brak oczekującej interakcji.')

    const newState = cloneGameState(this.state)
    delete newState.pendingInteraction

    // Chowaniec: przejmij atak (tak) lub przepuść (nie)
    if (interaction.type === 'chowaniec_intercept') {
      const attackerId = interaction.attackerInstanceId!
      const originalTargetId = interaction.targetInstanceId!
      const chowaniecId = interaction.sourceInstanceId
      const actualTargetId = choice === 'yes' ? chowaniecId : originalTargetId

      if (choice === 'yes') {
        const originalTarget = this.findCardInState(newState, originalTargetId)
        addLog(newState, `Chowaniec przejmuje atak na ${originalTarget?.cardData.name ?? 'sojusznika'} — staje w obronie!`, 'effect')
      }
      try {
        const { newState: afterAtk, log: atkLog, combatResult } = performAttack(newState, attackerId, actualTargetId, { skipChowaniecCheck: true, forcedByEffect: choice === 'yes', skipRangeCheck: choice === 'yes' })
        if (combatResult) this.lastCombatResult = combatResult
        this.applyStateAndLog(afterAtk, atkLog)
      } catch (e: any) {
        console.warn('[Chowaniec] performAttack failed:', e?.message ?? e)
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Dziewiątko: wybór trucizny (śmierć) lub paraliżu na celu
    if (interaction.type === 'dziewiatko_poison') {
      const targetCard = this.findCardInState(newState, interaction.targetInstanceId!)
      if (targetCard && targetCard.currentStats.defense > 0) {
        if (choice === 'trucizna') {
          targetCard.metadata.dziewiatkoPoison = true
          addLog(newState, `${targetCard.cardData.name} został zatruty! Traci 3 DEF co turę.`, 'effect')
        } else {
          targetCard.paralyzeRoundsLeft = 3
          targetCard.cannotAttack = true
          targetCard.metadata.dziewiatkoParalyze = true
          // Uziemienie — latające istoty tracą lot podczas paraliżu
          if ((targetCard.cardData as any).isFlying) targetCard.isGrounded = true
          addLog(newState, `${targetCard.cardData.name} sparaliżowany na 3 tury! Premie, atak i Pożegnanie zablokowane.`, 'effect')
        }
      }
      // Rozlicz śmierć Dziewiątka
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (sourceCard && sourceCard.currentStats.defense <= 0) {
        moveToGraveyard(newState, sourceCard)
      }
      this.applyStateAndLog(newState, [])
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    if (interaction.type === 'alkonost_target') {
      // Hipnoza: zhipnotyzowana wroga istota atakuje swojego sojusznika
      const hypnotizedId = interaction.attackerInstanceId!
      const victimId = choice

      // Zhipnotyzowany mógł już atakować w tej turze — chwilowo zresetuj flagę
      const fields = [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT] as const
      for (const side of ['player1', 'player2'] as PlayerSide[]) {
        for (const line of fields) {
          const card = newState.players[side].field.lines[line].find(c => c.instanceId === hypnotizedId)
          if (card) card.hasAttackedThisTurn = false
        }
      }

      const { newState: afterForced, log, combatResult } = performAttack(newState, hypnotizedId, victimId, { forcedByEffect: true })
      // Zachowaj combatResult żeby gameStore mógł emitować VFX
      if (combatResult) this.lastCombatResult = combatResult
      // Po wymuszonym ataku: przywróć flagę (to był dodatkowy atak, nie normalny slot)
      for (const side of ['player1', 'player2'] as PlayerSide[]) {
        for (const line of fields) {
          const card = afterForced.players[side].field.lines[line].find(c => c.instanceId === hypnotizedId)
          if (card) card.hasAttackedThisTurn = true
        }
      }
      this.applyStateAndLog(afterForced, log)
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Kresnik: zastosuj wybraną premię przez ponowne wywołanie efektu z metadata
    if (interaction.type === 'kresnik_buff') {
      const effect = getEffect('kresnik_choose_buff')
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (effect && sourceCard) {
        const result = effect.execute({
          state: newState,
          source: sourceCard,
          trigger: EffectTrigger.ON_PLAY,
          metadata: { kresnikBuff: choice },
        })
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Baba: zastosuj wybraną domenę
    if (interaction.type === 'baba_domain') {
      const effect = getEffect('baba_bonus_vs_type')
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (effect && sourceCard) {
        const result = effect.execute({
          state: newState,
          source: sourceCard,
          trigger: EffectTrigger.ON_PLAY,
          metadata: { babaDomain: choice },
        })
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Cmentarna Baba: wskrzesz wybranego Nieumarłego z cmentarza
    if (interaction.type === 'cmentarna_baba_resurrect') {
      const ownerSide = interaction.respondingPlayer
      const owner = newState.players[ownerSide]
      const gravIdx = owner.graveyard.findIndex(c => c.instanceId === choice)
      if (gravIdx !== -1) {
        const toResurrect = owner.graveyard.splice(gravIdx, 1)[0]!
        toResurrect.currentStats.defense = (toResurrect.cardData as any).stats.defense
        toResurrect.line = BattleLine.FRONT
        toResurrect.turnsInPlay = 0
        owner.field.lines[BattleLine.FRONT].push(toResurrect)
        const log = addLog(newState, `Cmentarna Baba: Wskrzesza ${toResurrect.cardData.name} z cmentarza!`, 'effect')
        this.applyStateAndLog(newState, [log])
      } else {
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Wielkolud: kontratakuje wybranego wroga
    if (interaction.type === 'wielkolud_counter') {
      const wielkolud = this.findCardInState(newState, interaction.sourceInstanceId)
      const chosen = this.findCardInState(newState, choice)
      if (wielkolud && chosen) {
        const damage = wielkolud.currentStats.attack
        chosen.currentStats.defense -= damage
        const log = addLog(newState,
          `${wielkolud.cardData.name}: Kontratakuje ${chosen.cardData.name} za ${damage} obrażeń!`,
          'effect'
        )
        // Usuń martwe jednostki
        for (const side of ['player1', 'player2'] as PlayerSide[]) {
          for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
            const dead = newState.players[side].field.lines[line].filter(c => c.currentStats.defense <= 0)
            for (const dc of dead) {
              newState.players[side].field.lines[line] = newState.players[side].field.lines[line].filter(c => c.instanceId !== dc.instanceId)
              newState.players[side].graveyard.push(dc)
              addLog(newState, `${dc.cardData.name} ginie od kontrataku Wielkoluda!`, 'death')
            }
          }
        }
        this.applyStateAndLog(newState, [log])
      } else {
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Inkluz: przekaż skradzioną premię wybranemu sojusznikowi
    if (interaction.type === 'inkluz_recipient') {
      const stolenRaw = interaction.metadata?.stolenEffect as string | undefined
      const recipient = this.findCardInState(newState, choice)
      if (stolenRaw && recipient) {
        try {
          const stolen = JSON.parse(stolenRaw)
          recipient.activeEffects.push(stolen)
          const log = addLog(newState,
            `Inkluz: Przekazuje premię "${stolen.effectId}" do ${recipient.cardData.name}!`,
            'effect'
          )
          this.applyStateAndLog(newState, [log])
        } catch {
          this.applyStateAndLog(newState, [])
        }
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Liczyrzepa: ustaw wybrany typ i wykonaj właściwy atak
    if (interaction.type === 'liczyrzepa_type') {
      const card = this.findCardInState(newState, interaction.sourceInstanceId)
      const targetId = interaction.targetInstanceId
      if (card && targetId) {
        const typeMap: Record<string, number> = {
          'Wręcz': 0, 'Żywioł': 1, 'Magia': 2, 'Dystans': 3,
        }
        card.metadata.licyzrepaAttackTypeChosen = typeMap[choice] ?? 0
        const { newState: afterAtk, log: atkLog } = performAttack(newState, card.instanceId, targetId)
        // Wyczyść tymczasowy typ po ataku
        for (const side of ['player1', 'player2'] as PlayerSide[]) {
          for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
            const found = afterAtk.players[side].field.lines[line].find(c => c.instanceId === card.instanceId)
            if (found) delete found.metadata.licyzrepaAttackTypeChosen
          }
        }
        this.applyStateAndLog(afterAtk, atkLog)
      } else {
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Smocze Jajo: gracz wybrał smoka do wyklucia
    if (interaction.type === 'smocze_jajo_hatch') {
      const egg = this.findCardInState(newState, interaction.sourceInstanceId)
      const dragon = HATCHABLE_DRAGONS.find(d => d.choiceId === choice)
      if (egg && dragon) {
        const result = hatchDragon(newState, egg, { instanceId: egg.instanceId, owner: egg.owner, cardData: egg.cardData }, dragon, [])
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // ON_PLAY / ON_ACTIVATE z wymaganym celem (np. Jaroszek, Jędza)
    if (interaction.type === 'on_play_target') {
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      const targetCard = this.findCardInState(newState, choice)
      const isActivation = !!(interaction.metadata?.isActivation)
      const paidCost = interaction.metadata?.paidCost as number | undefined
      if (sourceCard && targetCard) {
        // Odlicz koszt aktywacji (płatna + target)
        if (isActivation && paidCost && paidCost > 0) {
          const owner = newState.players[interaction.respondingPlayer]
          if (owner.glory < paidCost) {
            throw new Error('Za mało PS na aktywację zdolności.')
          }
          owner.glory -= paidCost
        }
        const effect = getEffect((sourceCard.cardData as any).effectId)
        if (effect) {
          const trigger = isActivation ? EffectTrigger.ON_ACTIVATE : EffectTrigger.ON_PLAY
          const result = effect.execute({
            state: newState,
            source: sourceCard,
            trigger,
            target: targetCard,
          })
          // Zaktualizuj cooldown metadane dla aktywacji
          if (isActivation && effect.activatable) {
            const cardAfter = this.findCardInState(result.newState, interaction.sourceInstanceId)
            if (cardAfter) {
              const cooldown = effect.activationCooldown ?? 'unlimited'
              if (cooldown === 'per_round') cardAfter.metadata.lastActivatedRound = result.newState.roundNumber
              if (cooldown === 'per_turn') cardAfter.metadata.lastActivatedTurn = result.newState.turnNumber
              cardAfter.metadata.activationCount = ((cardAfter.metadata.activationCount as number) ?? 0) + 1
            }
          }
          this.applyStateAndLog(result.newState, result.log)
        } else {
          this.applyStateAndLog(newState, [])
        }
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Strela: przerwanie zagrania karty (side-aware)
    if (interaction.type === 'strela_intercept') {
      const strelaId = interaction.sourceInstanceId
      const meta = interaction.metadata ?? {}
      // respondingPlayer = side holding Strela, playingSide = side that played the card
      const strelaSide = interaction.respondingPlayer
      const playingSide = (meta.playingSide as PlayerSide) ?? opponentOf(strelaSide)

      if (choice === 'yes') {
        // Play Strela from hand onto field (free, Line 1)
        const strelaInHand = newState.players[strelaSide].hand.find(c => c.instanceId === strelaId)
        if (strelaInHand) {
          newState.players[strelaSide].hand = newState.players[strelaSide].hand.filter(c => c.instanceId !== strelaId)
          strelaInHand.line = BattleLine.FRONT
          newState.players[strelaSide].field.lines[BattleLine.FRONT].push(strelaInHand)

          // Opponent's card goes back to bottom of deck
          const cardId = meta.aiCardInstanceId as string
          const card = newState.players[playingSide].hand.find(c => c.instanceId === cardId)
          if (card) {
            newState.players[playingSide].hand = newState.players[playingSide].hand.filter(c => c.instanceId !== cardId)
            newState.players[playingSide].deck.push(card)
            addLog(newState, `Strela! Wchodzi na pole — karta "${card.cardData.name}" trafia na spód talii.`, 'effect')
          } else {
            addLog(newState, `Strela! Wchodzi na pole z ręki.`, 'effect')
          }
        }
        this.applyStateAndLog(newState, [])
        this.checkWinAndNotify()
        return cloneGameState(this.state)
      } else {
        // Decline — card plays normally (skip Strela check)
        this.applyStateAndLog(newState, [])
        if (meta.aiCardType === 'creature') {
          return this.sidePlayCreature(playingSide, meta.aiCardInstanceId as string, meta.aiTargetLine as BattleLine, undefined, true)
        } else {
          return this.sidePlayAdventure(playingSide, meta.aiCardInstanceId as string, meta.aiTargetInstanceId as string | undefined, !!meta.aiUseEnhanced, true)
        }
      }
    }

    // Brzegina: gracz decyduje czy cofnąć obrażenia
    if (interaction.type === 'brzegina_shield') {
      const meta = interaction.metadata ?? {}
      const targetId = interaction.targetInstanceId!
      const damageToHeal = (meta.damageToHeal as number) ?? 0
      const attackerInstanceId = meta.attackerInstanceId as string
      const defenderDefBeforeHit = (meta.defenderDefBeforeHit as number) ?? 0

      if (choice === 'yes' && damageToHeal > 0) {
        // Cofnij obrażenia na obrońcy — atak anulowany, brak kontrataku
        const defCard = getAllCreaturesOnField(newState, 'player1').find(c => c.instanceId === targetId)
          ?? getAllCreaturesOnField(newState, 'player2').find(c => c.instanceId === targetId)
        if (defCard) {
          defCard.currentStats.defense += damageToHeal
        }
        // Koszt PS + oznacz użycie
        const brzegina = getAllCreaturesOnField(newState, 'player1').find(c => c.instanceId === interaction.sourceInstanceId)
          ?? getAllCreaturesOnField(newState, 'player2').find(c => c.instanceId === interaction.sourceInstanceId)
        const firstUseFree = brzegina && !(brzegina.metadata.brzeginaUsedFree as boolean)
        if (brzegina) {
          if (!firstUseFree) {
            newState.players[interaction.respondingPlayer].glory -= 1
          }
          brzegina.metadata.brzeginaUsedFree = true
        }
        const costLabel = firstUseFree ? '' : ' (-1 PS)'
        addLog(newState, `${brzegina?.cardData.name ?? 'Brzegina'}: Tarcza! ${defCard?.cardData.name ?? 'Sojusznik'} odzyskuje ${damageToHeal} DEF${costLabel}.`, 'effect')
        this.applyStateAndLog(newState, [])
      } else {
        // Odrzucono tarczę — wznów walkę (kontratak + death checks)
        if (attackerInstanceId && targetId) {
          const { newState: resumedState } = resumeCombatCounterattack(
            newState, attackerInstanceId, targetId, damageToHeal, defenderDefBeforeHit
          )
          this.applyStateAndLog(resumedState, [])
        } else {
          this.applyStateAndLog(newState, [])
        }
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Kościej: gracz decyduje czy wskrzesić za PS
    if (interaction.type === 'kosciej_resurrect') {
      if (choice === 'yes') {
        const side = interaction.respondingPlayer
        const owner = newState.players[side]
        const gravIdx = owner.graveyard.findIndex(c => c.instanceId === interaction.sourceInstanceId)
        if (gravIdx !== -1 && owner.glory >= 1) {
          owner.glory -= 1
          const kosciej = owner.graveyard.splice(gravIdx, 1)[0]!
          kosciej.currentStats.defense = (kosciej.cardData as any).stats.defense
          kosciej.line = BattleLine.FRONT
          kosciej.metadata.justResurrected = true
          owner.field.lines[BattleLine.FRONT].push(kosciej)
          // Usuń z trofeów wroga
          const enemySide = side === 'player1' ? 'player2' : 'player1'
          const trophyIdx = newState.players[enemySide].trophies.findIndex(c => c.instanceId === interaction.sourceInstanceId)
          if (trophyIdx !== -1) newState.players[enemySide].trophies.splice(trophyIdx, 1)
          const log = addLog(newState, `${kosciej.cardData.name}: Wskrzeszony za 1 PS! Wraca na L1!`, 'effect')
          this.applyStateAndLog(newState, [log])
        } else {
          const failLog = addLog(newState, `${interaction.sourceInstanceId}: Nie można wskrzesić — brak PS lub karty!`, 'system')
          this.applyStateAndLog(newState, [failLog])
        }
      } else {
        const skipLog = addLog(newState, `Kościej: Gracz rezygnuje z wskrzeszenia.`, 'effect')
        this.applyStateAndLog(newState, [skipLog])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Śmierć: gracz decyduje czy uratować ginącą istotę za 1 PS
    if (interaction.type === 'smierc_save') {
      const meta = interaction.metadata ?? {}
      if (choice === 'yes') {
        const owner = newState.players[interaction.respondingPlayer]
        const deadId = meta.deadCardId as string
        const deadOwner = meta.deadCardOwner as PlayerSide
        if (owner.glory >= 1 && deadId) {
          const gravPlayer = newState.players[deadOwner]
          const idx = gravPlayer.graveyard.findIndex(c => c.instanceId === deadId)
          if (idx !== -1) {
            owner.glory -= 1
            const saved = gravPlayer.graveyard.splice(idx, 1)[0]!
            saved.currentStats = { ...(saved.cardData as any).stats }
            saved.line = null
            gravPlayer.deck.push(saved)
            const log = addLog(newState, `Śmierć: Uratowała ${saved.cardData.name} za 1 PS! Wraca do talii.`, 'effect')
            this.applyStateAndLog(newState, [log])
          } else {
            this.applyStateAndLog(newState, [])
          }
        } else {
          this.applyStateAndLog(newState, [])
        }
      } else {
        const log = addLog(newState, `Śmierć: ${meta.deadCardName ?? 'Istota'} nie została uratowana.`, 'effect')
        this.applyStateAndLog(newState, [log])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Najemnik: wróg decyduje czy przekupić
    if (interaction.type === 'najemnik_bribe') {
      if (choice === 'yes') {
        const briber = interaction.respondingPlayer
        const owner = newState.players[briber]
        if (owner.glory >= 1) {
          owner.glory -= 1
          const najemnik = this.findCardInState(newState, interaction.sourceInstanceId)
          if (najemnik) {
            removeCardFromField(newState, najemnik.instanceId)
            najemnik.owner = briber
            najemnik.line = BattleLine.FRONT
            newState.players[briber].field.lines[BattleLine.FRONT].push(najemnik)
            const log = addLog(newState, `Najemnik przekupiony! ${najemnik.cardData.name} przechodzi na stronę ${briber} za 1 PS.`, 'effect')
            this.applyStateAndLog(newState, [log])
          } else {
            this.applyStateAndLog(newState, [])
          }
        } else {
          this.applyStateAndLog(newState, [addLog(newState, 'Brak PS na przekupienie Najemnika!', 'effect')])
        }
      } else {
        this.applyStateAndLog(newState, [addLog(newState, 'Najemnik pozostaje lojalny — wróg nie zapłacił.', 'effect')])
      }
      return cloneGameState(this.state)
    }

    // Dziwożona: gracz wybrał kartę do oddania
    if (interaction.type === 'dziwolzona_swap') {
      const effect = getEffect('dziwolzona_swap_cards')
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (effect && sourceCard) {
        const result = effect.execute({
          state: newState,
          source: sourceCard,
          trigger: EffectTrigger.ON_KILL,
          metadata: { dziwolzonaChoice: choice },
        })
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Czart: suwak DEF→ATK
    if (interaction.type === 'czart_shift') {
      const amount = parseInt(choice, 10)
      if (isNaN(amount) || amount < 0) {
        this.applyStateAndLog(newState, [])
        return cloneGameState(this.state)
      }
      const effect = getEffect('czart_shift_stats')
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (effect && sourceCard) {
        const result = effect.execute({
          state: newState,
          source: sourceCard,
          trigger: EffectTrigger.ON_ACTIVATE,
          metadata: { czartShiftAmount: amount },
        })
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Lamia: gracz wybiera nagrodę po śmierci (1 PS lub 5 kart)
    if (interaction.type === 'lamia_death_choice') {
      const side = interaction.respondingPlayer
      const owner = newState.players[side]
      if (choice === 'glory') {
        owner.glory += 1
        const log = addLog(newState, `Lamia: Skarby! +1 PS. (PS: ${owner.glory})`, 'effect')
        this.applyStateAndLog(newState, [log])
      } else {
        drawCards(owner, 5)
        const log = addLog(newState, `Lamia: Mądrość! Dobierasz 5 kart.`, 'effect')
        this.applyStateAndLog(newState, [log])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Auction bid — licytacja o Bożą Łaskę (tryb Sława)
    if (interaction.type === 'auction_bid') {
      const meta = interaction.metadata ?? {}
      const godId = meta.godId as number
      const auction = newState.slavaData?.activeAuction

      if (choice === 'pass' || !auction) {
        // Gracz pasuje → AI wygrywa licytację (favor czeka do następnej rundy)
        if (auction) {
          const resolveLogs = resolveAuction(newState, auction)
          this.applyStateAndLog(newState, resolveLogs)
        } else {
          this.applyStateAndLog(newState, [])
        }
      } else {
        // Gracz przebija
        const bidAmount = parseInt(choice, 10)
        if (auction && !isNaN(bidAmount) && bidAmount > auction.currentHighBid) {
          placeBid(auction, 'player1', bidAmount)
          // AI odpowiada
          const aiResp = aiAuctionDecision(newState, auction)
          if (aiResp.bid) {
            placeBid(auction, 'player2', aiResp.amount)
            newState.pendingInteraction = {
              type: 'auction_bid',
              sourceInstanceId: `god-${godId}`,
              respondingPlayer: 'player1',
              metadata: { godId, currentBid: aiResp.amount, currentBidder: 'player2', godName: meta.godName },
            }
            this.applyStateAndLog(newState, [addLog(newState, `AI przebija: ${aiResp.amount} PS!`, 'glory')])
          } else {
            // AI pasuje → gracz wygrywa (favor czeka do następnej rundy)
            const resolveLogs = resolveAuction(newState, auction)
            this.applyStateAndLog(newState, resolveLogs)
          }
        } else {
          this.applyStateAndLog(newState, [addLog(newState, 'Nieprawidłowa stawka!', 'system')])
        }
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Pozostałe typy — fallback
    this.applyStateAndLog(newState, [])
    return cloneGameState(this.state)
  }

  private findCardInState(state: GameState, instanceId: string) {
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
        const found = state.players[side].field.lines[line].find(c => c.instanceId === instanceId)
        if (found) return found
      }
    }
    return null
  }

  /**
   * Ustawia pendingInteraction na wewnętrznym stanie silnika i zwraca kopię.
   */
  injectPendingInteraction(interaction: GameState['pendingInteraction']): GameState {
    const newState = cloneGameState(this.state)
    newState.pendingInteraction = interaction
    this.state = newState
    return cloneGameState(this.state)
  }

  /**
   * Awaryjne przywrócenie tury (gdy AI się zawiesi lub multiplayer desync).
   */
  forcePlayerTurn(side: PlayerSide = 'player1'): GameState {
    const newState = cloneGameState(this.state)
    newState.currentTurn = side
    newState.currentPhase = GamePhase.PLAY
    delete newState.pendingInteraction
    newState.awaitingOnPlayConfirmation = null
    this.state = newState
    return cloneGameState(this.state)
  }

  // ===== ODCZYT STANU =====

  getState(): GameState {
    return cloneGameState(this.state)
  }

  getCurrentPhase(): GamePhase {
    return this.state.currentPhase
  }

  getCurrentTurn(): PlayerSide {
    return this.state.currentTurn
  }

  getLegalAttackTargets(attackerInstanceId: string): CardInstance[] {
    const defenderSide: PlayerSide = this.state.currentTurn === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(this.state, defenderSide)
    const attacker = this.findAttacker(attackerInstanceId)
    if (!attacker) return []
    return enemies.filter((e: CardInstance) => canAttack(this.state, attacker, e).valid)
  }

  // ===== CALLBACKS =====

  onStateChanged(callback: (state: GameState) => void): void {
    this.onStateChange = callback
  }

  onLog(callback: (entry: LogEntry) => void): void {
    this.onLogEntry = callback
  }

  // ===== INTERNALS =====

  private runStartPhase(state: GameState): GameState {
    let s = state

    // Sława: process season change at round start (player1 turn)
    if (s.gameMode === 'slava' && s.slavaData && s.currentTurn === 'player1') {
      const seasonLogs = processSeasonChange(s)
      this.pushLogs(seasonLogs)
    }

    // Sława: pasywny dochód +1 PS na każdej turze
    if (s.gameMode === 'slava') {
      const incomeLogs = grantPassiveIncome(s)
      this.pushLogs(incomeLogs)
      resetTurnTracking(s)
    }

    const { newState: afterStart, log: startLog } = processStartPhase(s)
    s = afterStart
    this.pushLogs(startLog)

    const { newState: afterDraw, log: drawLog } = processDrawPhase(s)
    s = afterDraw
    this.pushLogs(drawLog)

    return s
  }

  private applyStateAndLog(newState: GameState, log: LogEntry[]): void {
    this.state = newState
    this.pushLogs(log)
    this.notifyStateChange()
  }

  private pushLogs(logs: LogEntry[]): void {
    for (const entry of logs) {
      this.state.actionLog.push(entry)
      this.onLogEntry?.(entry)
    }
  }

  private notifyStateChange(): void {
    this.onStateChange?.(cloneGameState(this.state))
  }

  private checkWinAndNotify(): void {
    if (this.arenaMode) return

    // Slava: sprawdź PS >= 10
    if (this.state.gameMode === 'slava') {
      const slavaWinner = checkSlavaWinCondition(this.state)
      if (slavaWinner) {
        this.state.winner = slavaWinner
        const winnerLabel = slavaWinner === 'player1' ? 'GRACZ' : 'AI'
        const glory = this.state.players[slavaWinner].glory
        const log = addLog(this.state, `⚔ KONIEC GRY! ${winnerLabel} zdobywa ${glory} PS! SŁAWA!`, 'system')
        this.state.actionLog.push(log)
        this.onLogEntry?.(log)
        this.notifyStateChange()
        return
      }
    }

    // Gold Edition: PS win conditions
    if (this.state.gameMode === 'gold') {
      const p1Gold = this.state.players.player1.gold
      const p2Gold = this.state.players.player2.gold
      const target = GOLD_EDITION_RULES.GLORY_WIN_TARGET

      // Gold <= 0 → przegrana
      if (p1Gold <= 0 && p2Gold > 0) {
        this.state.winner = 'player2'
        const log = addLog(this.state, `KONIEC GRY! AI wygrywa — Gracz stracił całe złoto!`, 'system')
        this.state.actionLog.push(log)
        this.onLogEntry?.(log)
        this.notifyStateChange()
        return
      }
      if (p2Gold <= 0 && p1Gold > 0) {
        this.state.winner = 'player1'
        const log = addLog(this.state, `KONIEC GRY! Gracz wygrywa — AI stracił całe złoto!`, 'system')
        this.state.actionLog.push(log)
        this.onLogEntry?.(log)
        this.notifyStateChange()
        return
      }
      if (p1Gold <= 0 && p2Gold <= 0) {
        // Both at 0 — whoever's turn it is loses (they failed to recover)
        this.state.winner = this.state.currentTurn === 'player1' ? 'player2' : 'player1'
        const log = addLog(this.state, `KONIEC GRY! Obaj bez złota — przegrywa aktywny gracz!`, 'system')
        this.state.actionLog.push(log)
        this.onLogEntry?.(log)
        this.notifyStateChange()
        return
      }

      // Gold >= target → wygrana (ale jeśli obaj >= target, trzeba mieć przewagę 2)
      const p1Wins = p1Gold >= target
      const p2Wins = p2Gold >= target
      if (p1Wins && p2Wins) {
        // Both at target — need 2-point lead at end of round
        if (p1Gold >= p2Gold + 2) {
          this.state.winner = 'player1'
          const log = addLog(this.state, `KONIEC GRY! Gracz wygrywa z ${p1Gold} złota (przewaga 2+)!`, 'system')
          this.state.actionLog.push(log)
          this.onLogEntry?.(log)
          this.notifyStateChange()
          return
        }
        if (p2Gold >= p1Gold + 2) {
          this.state.winner = 'player2'
          const log = addLog(this.state, `KONIEC GRY! AI wygrywa z ${p2Gold} złota (przewaga 2+)!`, 'system')
          this.state.actionLog.push(log)
          this.onLogEntry?.(log)
          this.notifyStateChange()
          return
        }
        // Both >= target but no 2-point lead — game continues
      } else if (p1Wins) {
        this.state.winner = 'player1'
        const log = addLog(this.state, `KONIEC GRY! Gracz zdobywa ${p1Gold} złota! ZWYCIĘSTWO!`, 'system')
        this.state.actionLog.push(log)
        this.onLogEntry?.(log)
        this.notifyStateChange()
        return
      } else if (p2Wins) {
        this.state.winner = 'player2'
        const log = addLog(this.state, `KONIEC GRY! AI zdobywa ${p2Gold} złota! ZWYCIĘSTWO!`, 'system')
        this.state.actionLog.push(log)
        this.onLogEntry?.(log)
        this.notifyStateChange()
        return
      }
    }

    // Gold Edition: sprawdź wyczerpanie talii/pola (eliminacja)
    const winner = checkWinCondition(this.state)
    if (winner) {
      this.state.winner = winner
      const log = addLog(this.state, `KONIEC GRY! Wygrywa: ${winner}!`, 'system')
      this.state.actionLog.push(log)
      this.onLogEntry?.(log)
      this.notifyStateChange()
    }
  }

  private assertPlayerTurn(): void {
    const current = this.state.players[this.state.currentTurn]
    if (current.isAI) {
      throw new Error(`[GameEngine] To tura AI, nie gracza.`)
    }
  }

  private assertTurnOf(side: PlayerSide): void {
    if (this.state.currentTurn !== side) {
      throw new Error(`[GameEngine] Teraz tura ${this.state.currentTurn}, nie ${side}.`)
    }
  }

  private assertPhase(expected: GamePhase): void {
    if (this.state.currentPhase !== expected) {
      throw new Error(`[GameEngine] Oczekiwana faza ${expected}, jest ${this.state.currentPhase}.`)
    }
  }

  private findAttacker(instanceId: string): CardInstance | null {
    const player = this.state.players[this.state.currentTurn]
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = player.field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
    return null
  }
}

// Singleton do użycia w testach
export const gameEngine = new GameEngine()
