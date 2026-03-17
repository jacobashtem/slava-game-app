/**
 * Pomocnicze funkcje operujące na GameState.
 * Wszystkie operacje są immutability-friendly (klonują stan).
 */

import type { GameState, CardInstance, LogEntry, PlayerState } from './types'
import { GamePhase, BattleLine } from './constants'

// ===== KLONOWANIE =====

export function cloneGameState(state: GameState): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  // JSON.stringify strips functions — re-attach holiday condition from original
  if (state.slavaData?.holiday && clone.slavaData?.holiday) {
    clone.slavaData.holiday.condition = state.slavaData.holiday.condition
  }
  return clone
}

export function cloneCard(card: CardInstance): CardInstance {
  return JSON.parse(JSON.stringify(card))
}

// ===== LOGOWANIE =====

export function addLog(state: GameState, message: string, type: LogEntry['type'], involvedCards?: string[]): LogEntry {
  return {
    round: state.roundNumber,
    turn: state.turnNumber,
    phase: state.currentPhase,
    message,
    type,
    involvedCards,
  }
}

// ===== DAMAGE =====

/**
 * Zadaje obrażenia karcie. Zwraca deltę (faktyczne obrażenia po wszystkich modifikatorach).
 * NIE usuwa karty z pola — sprawdź card.currentStats.defense <= 0 po wywołaniu.
 */
export function dealDamage(card: CardInstance, amount: number): number {
  const actualDamage = Math.max(0, amount)
  card.currentStats.defense -= actualDamage
  return actualDamage
}

export function healCard(card: CardInstance, amount: number): number {
  const healed = Math.min(amount, card.currentStats.maxDefense - card.currentStats.defense)
  card.currentStats.defense += healed
  return healed
}

// ===== FIELD MANAGEMENT =====

export function removeCardFromField(state: GameState, instanceId: string): CardInstance | null {
  for (const player of Object.values(state.players)) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const idx = player.field.lines[line].findIndex(c => c.instanceId === instanceId)
      if (idx !== -1) {
        const removed = player.field.lines[line].splice(idx, 1)[0]!
        return removed
      }
    }
  }
  return null
}

export function moveToGraveyard(state: GameState, card: CardInstance): void {
  const player = state.players[card.owner]
  const removed = removeCardFromField(state, card.instanceId)
  if (removed) {
    removed.line = null
    player.graveyard.push(removed)
  }
}

export function getFirstOccupiedLine(state: GameState, playerSide: string): BattleLine | null {
  const player = state.players[playerSide as 'player1' | 'player2']
  for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
    if (player.field.lines[line].length > 0) return line
  }
  return null
}

export function getAllCreaturesOnField(state: GameState, playerSide: string): CardInstance[] {
  const player = state.players[playerSide as 'player1' | 'player2']
  return [
    ...player.field.lines[BattleLine.FRONT],
    ...player.field.lines[BattleLine.RANGED],
    ...player.field.lines[BattleLine.SUPPORT],
  ]
}

export function getTotalCreaturesOnField(state: GameState, playerSide: string): number {
  return getAllCreaturesOnField(state, playerSide).length
}

// ===== OPPONENT =====

export function getOpponentSide(side: 'player1' | 'player2'): 'player1' | 'player2' {
  return side === 'player1' ? 'player2' : 'player1'
}

export function getOpponent(state: GameState, side: 'player1' | 'player2'): PlayerState {
  return state.players[getOpponentSide(side)]
}

// ===== INITIAL STATE =====

export function createEmptyFieldState() {
  return {
    lines: {
      [BattleLine.FRONT]: [],
      [BattleLine.RANGED]: [],
      [BattleLine.SUPPORT]: [],
    },
  }
}

export function createInitialPlayerState(side: 'player1' | 'player2', isAI: boolean) {
  return {
    side,
    isAI,
    deck: [],
    hand: [],
    field: createEmptyFieldState(),
    graveyard: [],
    trophies: [],
    glory: 0,
    gold: 5, // Gold Edition starting gold
    soulPoints: 0,
    activeLocation: null,
    handLimit: 10,
    creaturesPlayedThisTurn: 0,
    adventuresPlayedThisTurn: 0,
  }
}

export function createInitialGameState(gameMode: 'gold' | 'slava' = 'gold'): GameState {
  return {
    players: {
      player1: createInitialPlayerState('player1', false),
      player2: createInitialPlayerState('player2', true),
    },
    currentTurn: 'player1',
    currentPhase: GamePhase.START,
    roundNumber: 1,
    seasonOffset: 0,
    turnNumber: 1,
    actionLog: [],
    winner: null,
    gameMode,
    activeEvents: [],
    activeAdventureEffects: [],
    awaitingOnPlayConfirmation: null,
  }
}
