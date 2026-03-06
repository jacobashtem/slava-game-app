/**
 * GameEngine — główna klasa orkiestrująca grę.
 * Łączy: TurnManager, CombatResolver, LineManager, DeckBuilder.
 * Store Pinia jest tylko adapterem który wywołuje metody tego silnika.
 */

import type { GameState, LogEntry, CardInstance } from './types'
import { GamePhase, BattleLine, CardPosition } from './constants'
import type { PlayerSide } from './types'
import { createInitialGameState, cloneGameState, addLog } from './GameStateUtils'
import { CardFactory } from './CardFactory'
import { buildRandomDeck, drawCards } from './DeckBuilder'
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
import { GOLD_EDITION_RULES, EffectTrigger } from './constants'
import { buildAlphaDeck } from './DeckBuilder'
import { getEffect } from './EffectRegistry'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

export class GameEngine {
  private state: GameState
  private factory: CardFactory
  private onStateChange?: (state: GameState) => void
  private onLogEntry?: (entry: LogEntry) => void
  private arenaMode = false

  constructor() {
    this.factory = new CardFactory()
    this.factory.loadCreatures(istotypData as any)
    this.factory.loadAdventures(przygodyData as any)
    this.state = createInitialGameState('gold')
  }

  // ===== SETUP =====

  startAlphaGame(): GameState {
    this.arenaMode = false
    this.state = createInitialGameState('gold')

    const deck1 = buildAlphaDeck(this.factory, 'player1')
    const deck2 = buildAlphaDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    drawCards(this.state.players.player1, GOLD_EDITION_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, GOLD_EDITION_RULES.STARTING_HAND)

    this.state.players.player1.gold = GOLD_EDITION_RULES.STARTING_GOLD
    this.state.players.player2.gold = GOLD_EDITION_RULES.STARTING_GOLD

    const startLog = addLog(this.state, 'Gra Alpha rozpoczęta! Tylko sprawdzone karty.', 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  startGame(gameMode: 'gold' | 'slava' = 'gold'): GameState {
    this.arenaMode = false
    this.state = createInitialGameState(gameMode)

    // Zbuduj talie
    const deck1 = buildRandomDeck(this.factory, 'player1')
    const deck2 = buildRandomDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    // Dobierz karty startowe
    drawCards(this.state.players.player1, GOLD_EDITION_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, GOLD_EDITION_RULES.STARTING_HAND)

    this.state.players.player1.gold = GOLD_EDITION_RULES.STARTING_GOLD
    this.state.players.player2.gold = GOLD_EDITION_RULES.STARTING_GOLD

    const startLog = addLog(this.state, 'Gra rozpoczęta! Tryb: ' + gameMode, 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    // Zaczyna faza START dla player1
    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
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

  // ===== AKCJE GRACZA =====

  /**
   * Gracz wystawia istotę z ręki na pole.
   */
  playerPlayCreature(cardInstanceId: string, targetLine: BattleLine): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.PLAY)

    const { newState, log } = playCreature(this.state, cardInstanceId, targetLine)
    this.applyStateAndLog(newState, log)

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz gra kartę przygody.
   */
  playerPlayAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.PLAY)

    const { newState, log } = playAdventure(this.state, cardInstanceId, targetInstanceId, useEnhanced)
    this.applyStateAndLog(newState, log)

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz wykonuje atak.
   */
  playerAttack(attackerInstanceId: string, defenderInstanceId: string): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.COMBAT)

    // Limit: tylko jeden atak na turę
    const alreadyAttacked = getAllCreaturesOnField(this.state, 'player1').some(c => c.hasAttackedThisTurn)
    if (alreadyAttacked) {
      throw new Error('Możesz wykonać tylko jeden atak na turę.')
    }

    const { newState, log } = performAttack(this.state, attackerInstanceId, defenderInstanceId)
    this.applyStateAndLog(newState, log)

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz zmienia pozycję karty (Atak/Obrona).
   */
  playerChangePosition(cardInstanceId: string, newPos: CardPosition): GameState {
    this.assertPlayerTurn()

    const { newState, log } = changePosition(this.state, cardInstanceId, newPos)
    this.applyStateAndLog(newState, log)

    return cloneGameState(this.state)
  }

  /**
   * Gracz przesuwa istotę między liniami.
   */
  playerMoveCreatureLine(cardInstanceId: string, targetLine: BattleLine): GameState {
    this.assertPlayerTurn()

    const { newState, log } = moveCreatureLine(this.state, cardInstanceId, targetLine)
    this.applyStateAndLog(newState, log)

    return cloneGameState(this.state)
  }

  /**
   * Gracz przechodzi do następnej fazy.
   */
  /**
   * Gracz aktywuje zdolność istoty (kliknięcie ⚡).
   */
  playerActivateEffect(cardInstanceId: string, targetInstanceId?: string): GameState {
    this.assertPlayerTurn()
    const { newState, log } = activateCreatureEffect(this.state, cardInstanceId, targetInstanceId)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
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
      console.warn('[GameEngine] confirmOnPlay error:', err)
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

  /**
   * Gracz ręcznie dobiera kartę podczas fazy PLAY (do 5 kart na ręce).
   */
  playerDrawCard(): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.PLAY)
    const { newState, log } = drawCardManually(this.state)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  playerAdvancePhase(): GameState {
    this.assertPlayerTurn()

    const currentPhase = this.state.currentPhase

    if (currentPhase === GamePhase.PLAY) {
      // PLAY → COMBAT
      let newState = cloneGameState(this.state)
      newState.currentPhase = GamePhase.COMBAT
      const log = [addLog(newState, 'Faza walki!', 'system')]
      this.applyStateAndLog(newState, log)
    } else if (currentPhase === GamePhase.COMBAT) {
      // COMBAT → END
      this.playerEndTurn()
    }

    return cloneGameState(this.state)
  }

  /**
   * Gracz kończy turę.
   */
  playerEndTurn(): GameState {
    this.assertPlayerTurn()

    const { newState, log } = processEndPhase(this.state)
    this.applyStateAndLog(newState, log)

    // Uruchom START + DRAW dla AI (lub następnej tury gracza)
    this.state = this.runStartPhase(this.state)
    this.notifyStateChange()

    // Jeśli to tura AI, uruchom AI
    if (this.state.players[this.state.currentTurn].isAI) {
      // AI jest wyzwalane asynchronicznie przez store
      return cloneGameState(this.state)
    }

    return cloneGameState(this.state)
  }

  // ===== AI EXECUTION (bez sprawdzania kolejki gracza) =====

  aiPlayCreature(cardInstanceId: string, targetLine: BattleLine): GameState {
    this.assertPhase(GamePhase.PLAY)
    const { newState, log } = playCreature(this.state, cardInstanceId, targetLine)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  aiPlayAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false): GameState {
    this.assertPhase(GamePhase.PLAY)
    const { newState, log } = playAdventure(this.state, cardInstanceId, targetInstanceId, useEnhanced)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  aiAdvanceToCombat(): GameState {
    if (this.state.currentPhase === GamePhase.PLAY) {
      const newState = cloneGameState(this.state)
      newState.currentPhase = GamePhase.COMBAT
      const log = [addLog(newState, 'Faza walki!', 'system')]
      this.applyStateAndLog(newState, log)
    }
    return cloneGameState(this.state)
  }

  aiAttack(attackerInstanceId: string, defenderInstanceId: string): GameState {
    this.assertPhase(GamePhase.COMBAT)
    const { newState, log } = performAttack(this.state, attackerInstanceId, defenderInstanceId)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  aiChangePosition(cardInstanceId: string, newPos: CardPosition): GameState {
    const { newState, log } = changePosition(this.state, cardInstanceId, newPos)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  aiEndTurn(): GameState {
    const { newState, log } = processEndPhase(this.state)
    this.applyStateAndLog(newState, log)
    this.state = this.runStartPhase(this.state)
    this.notifyStateChange()
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
