/**
 * RoomManager — zarządzanie pokojami multiplayer.
 * Pokoje żyją w pamięci procesu Node.js (Nitro).
 * Każdy pokój to jedna gra, max 2 graczy.
 */

import type { GameState, PlayerSide, CardInstance } from '../../game-engine/types'
import { CardPosition } from '../../game-engine/constants'
import { GameEngine } from '../../game-engine/GameEngine'

// ===== TYPES =====

export interface RoomPlayer {
  peerId: string       // crossws peer.id
  side: PlayerSide
  displayName: string
  connected: boolean
  lastSeen: number
}

export interface Room {
  id: string
  code: string         // 4-char join code (uppercase)
  host: string         // peerId of host
  players: RoomPlayer[]
  engine: GameEngine | null
  gameMode: 'gold' | 'slava'
  status: 'waiting' | 'playing' | 'finished'
  createdAt: number
  settings: RoomSettings
}

export interface RoomSettings {
  gameMode: 'gold' | 'slava'
  hostDomains?: number[]
}

export type ServerMessage =
  | { type: 'room_created'; roomId: string; code: string; side: PlayerSide }
  | { type: 'room_joined'; roomId: string; side: PlayerSide; opponentName: string }
  | { type: 'opponent_joined'; opponentName: string }
  | { type: 'opponent_disconnected' }
  | { type: 'opponent_reconnected' }
  | { type: 'game_started'; state: GameState }
  | { type: 'state_update'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'room_closed'; reason: string }

export type ClientMessage =
  | { type: 'create_room'; displayName: string; settings: RoomSettings }
  | { type: 'join_room'; code: string; displayName: string }
  | { type: 'start_game' }
  // Game actions — mirror GameEngine player methods
  | { type: 'play_creature'; cardInstanceId: string; targetLine: number; slotIndex?: number }
  | { type: 'play_adventure'; cardInstanceId: string; targetInstanceId?: string; useEnhanced?: boolean }
  | { type: 'attack'; attackerInstanceId: string; defenderInstanceId: string }
  | { type: 'change_position'; cardInstanceId: string; newPosition: string }
  | { type: 'move_creature_line'; cardInstanceId: string; targetLine: number; slotIndex?: number }
  | { type: 'activate_effect'; cardInstanceId: string; targetInstanceId?: string }
  | { type: 'draw_card' }
  | { type: 'advance_phase' }
  | { type: 'end_turn' }
  | { type: 'confirm_on_play' }
  | { type: 'skip_on_play' }
  | { type: 'resolve_interaction'; choice: string }
  | { type: 'surrender' }
  // Slava actions
  | { type: 'invoke_god'; godId: number; bid: number }
  | { type: 'activate_favor'; targetInstanceId?: string }
  | { type: 'claim_holiday' }
  | { type: 'plunder' }

// ===== ROOM MANAGER =====

const rooms = new Map<string, Room>()
const peerToRoom = new Map<string, string>()  // peerId → roomId

// Room cleanup: remove rooms older than 2 hours
const ROOM_TTL = 2 * 60 * 60 * 1000

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789' // no ambiguous chars
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export function createRoom(peerId: string, displayName: string, settings: RoomSettings): Room {
  cleanupStaleRooms()

  const room: Room = {
    id: generateRoomId(),
    code: generateCode(),
    host: peerId,
    players: [{
      peerId,
      side: 'player1',
      displayName,
      connected: true,
      lastSeen: Date.now(),
    }],
    engine: null,
    gameMode: settings.gameMode,
    status: 'waiting',
    createdAt: Date.now(),
    settings,
  }

  rooms.set(room.id, room)
  peerToRoom.set(peerId, room.id)
  return room
}

export function joinRoom(peerId: string, code: string, displayName: string): { room: Room | null; error?: string } {
  const room = findRoomByCode(code)
  if (!room) return { room: null, error: 'Nie znaleziono pokoju o tym kodzie.' }
  if (room.status !== 'waiting') return { room: null, error: 'Gra w tym pokoju już trwa.' }
  if (room.players.length >= 2) return { room: null, error: 'Pokój jest pełny.' }

  const player: RoomPlayer = {
    peerId,
    side: 'player2',
    displayName,
    connected: true,
    lastSeen: Date.now(),
  }

  room.players.push(player)
  peerToRoom.set(peerId, room.id)
  return { room }
}

export function findRoomByCode(code: string): Room | undefined {
  const upper = code.toUpperCase()
  for (const room of rooms.values()) {
    if (room.code === upper) return room
  }
  return undefined
}

export function getRoomForPeer(peerId: string): Room | undefined {
  const roomId = peerToRoom.get(peerId)
  if (!roomId) return undefined
  return rooms.get(roomId)
}

export function getPlayerInRoom(room: Room, peerId: string): RoomPlayer | undefined {
  return room.players.find(p => p.peerId === peerId)
}

export function getOpponent(room: Room, peerId: string): RoomPlayer | undefined {
  return room.players.find(p => p.peerId !== peerId)
}

export function startGame(room: Room): GameState {
  const engine = new GameEngine()
  engine.startGame(room.gameMode)

  // Mark both players as human on the engine's internal state
  const s = engine.getState()
  s.players.player1.isAI = false
  s.players.player2.isAI = false
  engine.loadState(s)

  room.engine = engine
  room.status = 'playing'
  return engine.getState()
}

/**
 * Execute a player action on the engine. Returns new state or error.
 * Validates that the action is from the correct player whose turn it is.
 */
export function executeAction(
  room: Room,
  peerId: string,
  message: ClientMessage
): { state?: GameState; error?: string } {
  if (!room.engine || room.status !== 'playing') {
    return { error: 'Gra nie jest aktywna.' }
  }

  const player = getPlayerInRoom(room, peerId)
  if (!player) return { error: 'Nie jesteś w tym pokoju.' }

  const engine = room.engine
  const currentState = engine.getState()
  const side = player.side

  // Interaction responses can come from either player (respondingPlayer)
  const isInteraction = message.type === 'resolve_interaction'
  const pendingResponder = currentState.pendingInteraction?.respondingPlayer

  if (!isInteraction) {
    // Normal actions: must be your turn
    if (currentState.currentTurn !== side) {
      return { error: 'Nie Twoja tura.' }
    }
  } else {
    // Interaction: must be the responding player
    if (pendingResponder && pendingResponder !== side) {
      return { error: 'Ta interakcja nie jest skierowana do Ciebie.' }
    }
  }

  try {
    let newState: GameState

    switch (message.type) {
      case 'play_creature':
        newState = engine.sidePlayCreature(side, message.cardInstanceId, message.targetLine, message.slotIndex)
        break
      case 'play_adventure':
        newState = engine.sidePlayAdventure(side, message.cardInstanceId, message.targetInstanceId, message.useEnhanced)
        break
      case 'attack':
        newState = engine.sideAttack(side, message.attackerInstanceId, message.defenderInstanceId)
        break
      case 'change_position': {
        const pos = message.newPosition === 'attack' ? CardPosition.ATTACK : CardPosition.DEFENSE
        newState = engine.sideChangePosition(side, message.cardInstanceId, pos)
        break
      }
      case 'move_creature_line':
        newState = engine.sideMoveCreatureLine(side, message.cardInstanceId, message.targetLine, message.slotIndex)
        break
      case 'activate_effect':
        newState = engine.sideActivateEffect(side, message.cardInstanceId, message.targetInstanceId)
        break
      case 'draw_card':
        newState = engine.sideDrawCard(side)
        break
      case 'advance_phase':
        newState = engine.sideAdvancePhase(side)
        break
      case 'end_turn':
        newState = engine.sideEndTurn(side)
        break
      case 'confirm_on_play':
        newState = engine.confirmOnPlay()
        break
      case 'skip_on_play':
        newState = engine.skipOnPlay()
        break
      case 'resolve_interaction':
        newState = engine.resolvePendingInteraction(message.choice)
        break
      case 'surrender':
        newState = engine.surrender(side)
        room.status = 'finished'
        break
      // Slava actions
      case 'invoke_god':
        newState = engine.sideInvokeGod(side, message.godId, message.bid)
        break
      case 'activate_favor':
        newState = engine.sideActivateFavor(side, message.targetInstanceId)
        break
      case 'claim_holiday':
        newState = engine.sideClaimHoliday(side)
        break
      case 'plunder':
        newState = engine.sidePlunder(side)
        break
      default:
        return { error: `Nieznana akcja: ${(message as any).type}` }
    }

    // Check if game is over
    if (newState.winner) {
      room.status = 'finished'
    }

    return { state: newState }
  } catch (err: any) {
    return { error: err.message || 'Błąd wykonania akcji.' }
  }
}

/**
 * Filter GameState for a specific player — hide opponent's hand cards.
 */
export function filterStateForPlayer(state: GameState, side: PlayerSide): GameState {
  const opponentSide: PlayerSide = side === 'player1' ? 'player2' : 'player1'

  // Deep clone via JSON (same approach as engine)
  const filtered = JSON.parse(JSON.stringify(state)) as GameState

  // Hide opponent's hand — show card count but not actual cards
  const opponentHand = filtered.players[opponentSide].hand
  filtered.players[opponentSide].hand = opponentHand.map((card: CardInstance) => ({
    ...card,
    cardData: {
      ...card.cardData,
      // Blank out card identity unless revealed
      ...(card.isRevealed ? {} : {
        name: '???',
        effectId: 'hidden',
        effectDescription: '',
        lore: '',
      }),
    },
  }))

  // Hide opponent's deck contents entirely (just preserve length)
  const deckLen = filtered.players[opponentSide].deck.length
  filtered.players[opponentSide].deck = new Array(deckLen).fill(null) as any

  return filtered
}

export function handleDisconnect(peerId: string): { room?: Room; player?: RoomPlayer } {
  const room = getRoomForPeer(peerId)
  if (!room) return {}

  const player = getPlayerInRoom(room, peerId)
  if (player) {
    player.connected = false
    player.lastSeen = Date.now()
  }

  peerToRoom.delete(peerId)

  // If both disconnected and game not started, destroy room
  if (room.status === 'waiting' && room.players.every(p => !p.connected)) {
    rooms.delete(room.id)
    return {}
  }

  return { room, player }
}

export function handleReconnect(peerId: string, room: Room, side: PlayerSide): void {
  const player = room.players.find(p => p.side === side)
  if (player) {
    player.peerId = peerId
    player.connected = true
    player.lastSeen = Date.now()
    peerToRoom.set(peerId, room.id)
  }
}

export function removeRoom(roomId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  for (const p of room.players) {
    peerToRoom.delete(p.peerId)
  }
  rooms.delete(roomId)
}

function cleanupStaleRooms(): void {
  const now = Date.now()
  for (const [id, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL) {
      for (const p of room.players) peerToRoom.delete(p.peerId)
      rooms.delete(id)
    }
  }
}

// Diagnostic: current room count
export function getRoomCount(): number {
  return rooms.size
}
