/**
 * useMultiplayer — client-side WebSocket composable for multiplayer rooms.
 * Connects to Nitro WS at /api/ws.
 */

import { ref, computed, onUnmounted } from 'vue'
import type { GameState, PlayerSide } from '../game-engine/types'
import type { ServerMessage, ClientMessage, RoomSettings } from '../server/utils/RoomManager'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

// Module-level singleton state (shared across components)
let ws: WebSocket | null = null
const status = ref<ConnectionStatus>('disconnected')
const roomId = ref<string | null>(null)
const roomCode = ref<string | null>(null)
const mySide = ref<PlayerSide | null>(null)
const opponentName = ref<string | null>(null)
const opponentConnected = ref(false)
const gameState = ref<GameState | null>(null)
const lastError = ref<string | null>(null)
const isHost = ref(false)
const gameStarted = ref(false)

// Callbacks for UI notifications
type EventCallback = (msg: ServerMessage) => void
const listeners = new Set<EventCallback>()

function getWsUrl(): string {
  const loc = window.location
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.host}/api/ws`
}

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve()
      return
    }

    status.value = 'connecting'
    ws = new WebSocket(getWsUrl())

    ws.onopen = () => {
      status.value = 'connected'
      resolve()
    }

    ws.onclose = () => {
      status.value = 'disconnected'
      ws = null
    }

    ws.onerror = () => {
      status.value = 'disconnected'
      reject(new Error('WebSocket connection failed'))
    }

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data)
        handleMessage(msg)
      } catch {
        console.error('[MP] Failed to parse message:', event.data)
      }
    }
  })
}

function handleMessage(msg: ServerMessage): void {
  lastError.value = null

  switch (msg.type) {
    case 'room_created':
      roomId.value = msg.roomId
      roomCode.value = msg.code
      mySide.value = msg.side
      isHost.value = true
      break

    case 'room_joined':
      roomId.value = msg.roomId
      mySide.value = msg.side
      opponentName.value = msg.opponentName
      opponentConnected.value = true
      isHost.value = false
      break

    case 'opponent_joined':
      opponentName.value = msg.opponentName
      opponentConnected.value = true
      break

    case 'opponent_disconnected':
      opponentConnected.value = false
      break

    case 'opponent_reconnected':
      opponentConnected.value = true
      break

    case 'game_started':
      gameState.value = msg.state
      gameStarted.value = true
      break

    case 'state_update':
      gameState.value = msg.state
      break

    case 'error':
      lastError.value = msg.message
      break

    case 'room_closed':
      resetState()
      lastError.value = msg.reason
      break
  }

  // Notify all listeners
  for (const cb of listeners) cb(msg)
}

function sendMessage(msg: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    lastError.value = 'Brak połączenia z serwerem.'
    return
  }
  ws.send(JSON.stringify(msg))
}

function resetState(): void {
  roomId.value = null
  roomCode.value = null
  mySide.value = null
  opponentName.value = null
  opponentConnected.value = false
  gameState.value = null
  gameStarted.value = false
  isHost.value = false
  lastError.value = null
}

function disconnect(): void {
  if (ws) {
    ws.close()
    ws = null
  }
  status.value = 'disconnected'
  resetState()
}

// ===== PUBLIC API =====

export function useMultiplayer() {
  const isMyTurn = computed(() => {
    if (!gameState.value || !mySide.value) return false
    return gameState.value.currentTurn === mySide.value
  })

  const myPlayer = computed(() => {
    if (!gameState.value || !mySide.value) return null
    return gameState.value.players[mySide.value]
  })

  const opponentPlayer = computed(() => {
    if (!gameState.value || !mySide.value) return null
    const oppSide: PlayerSide = mySide.value === 'player1' ? 'player2' : 'player1'
    return gameState.value.players[oppSide]
  })

  const isInRoom = computed(() => roomId.value !== null)

  // Room actions
  async function createRoom(displayName: string, settings: RoomSettings) {
    await connect()
    sendMessage({ type: 'create_room', displayName, settings })
  }

  async function joinRoom(code: string, displayName: string) {
    await connect()
    sendMessage({ type: 'join_room', code, displayName })
  }

  function startGame() {
    sendMessage({ type: 'start_game' })
  }

  // Game actions — all go through WebSocket
  function playCreature(cardInstanceId: string, targetLine: number, slotIndex?: number) {
    sendMessage({ type: 'play_creature', cardInstanceId, targetLine, slotIndex })
  }

  function playAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced?: boolean) {
    sendMessage({ type: 'play_adventure', cardInstanceId, targetInstanceId, useEnhanced })
  }

  function attack(attackerInstanceId: string, defenderInstanceId: string) {
    sendMessage({ type: 'attack', attackerInstanceId, defenderInstanceId })
  }

  function changePosition(cardInstanceId: string, newPosition: string) {
    sendMessage({ type: 'change_position', cardInstanceId, newPosition })
  }

  function moveCreatureLine(cardInstanceId: string, targetLine: number, slotIndex?: number) {
    sendMessage({ type: 'move_creature_line', cardInstanceId, targetLine, slotIndex })
  }

  function activateEffect(cardInstanceId: string, targetInstanceId?: string) {
    sendMessage({ type: 'activate_effect', cardInstanceId, targetInstanceId })
  }

  function drawCard() {
    sendMessage({ type: 'draw_card' })
  }

  function advancePhase() {
    sendMessage({ type: 'advance_phase' })
  }

  function endTurn() {
    sendMessage({ type: 'end_turn' })
  }

  function confirmOnPlay() {
    sendMessage({ type: 'confirm_on_play' })
  }

  function skipOnPlay() {
    sendMessage({ type: 'skip_on_play' })
  }

  function resolveInteraction(choice: string) {
    sendMessage({ type: 'resolve_interaction', choice })
  }

  function surrender() {
    sendMessage({ type: 'surrender' })
  }

  // Slava actions
  function invokeGod(godId: number, bid: number) {
    sendMessage({ type: 'invoke_god', godId, bid })
  }

  function activateFavor(targetInstanceId?: string) {
    sendMessage({ type: 'activate_favor', targetInstanceId })
  }

  function claimHoliday() {
    sendMessage({ type: 'claim_holiday' })
  }

  function plunder() {
    sendMessage({ type: 'plunder' })
  }

  // Event listener management — track per-component listeners for cleanup
  const _componentListeners = new Set<EventCallback>()

  function onServerMessage(cb: EventCallback) {
    listeners.add(cb)
    _componentListeners.add(cb)
  }

  // Cleanup on component unmount (don't disconnect — other components may use it)
  onUnmounted(() => {
    for (const cb of _componentListeners) {
      listeners.delete(cb)
    }
    _componentListeners.clear()
  })

  return {
    // State
    status,
    roomId,
    roomCode,
    mySide,
    opponentName,
    opponentConnected,
    gameState,
    lastError,
    isHost,
    gameStarted,
    isMyTurn,
    myPlayer,
    opponentPlayer,
    isInRoom,

    // Connection
    connect,
    disconnect,

    // Room
    createRoom,
    joinRoom,
    startGame,

    // Game actions
    playCreature,
    playAdventure,
    attack,
    changePosition,
    moveCreatureLine,
    activateEffect,
    drawCard,
    advancePhase,
    endTurn,
    confirmOnPlay,
    skipOnPlay,
    resolveInteraction,
    surrender,

    // Slava
    invokeGod,
    activateFavor,
    claimHoliday,
    plunder,

    // Events
    onServerMessage,
  }
}
