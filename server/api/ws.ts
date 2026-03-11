/**
 * Nitro WebSocket handler — multiplayer game rooms.
 * Uses crossws (built into Nitro 2.x).
 *
 * Client connects: ws://host/api/ws
 * Then sends JSON messages per ClientMessage type.
 */

import type { Peer } from 'crossws'
import {
  createRoom,
  joinRoom,
  getRoomForPeer,
  getPlayerInRoom,
  getOpponent,
  startGame,
  executeAction,
  filterStateForPlayer,
  handleDisconnect,
  type ServerMessage,
  type ClientMessage,
} from '../utils/RoomManager'

function send(peer: Peer, msg: ServerMessage): void {
  peer.send(JSON.stringify(msg))
}

function sendToPeer(peers: Map<string, Peer>, peerId: string, msg: ServerMessage): void {
  const peer = peers.get(peerId)
  if (peer) send(peer, msg)
}

// Global peer registry (crossws doesn't give us access to all peers)
const activePeers = new Map<string, Peer>()

export default defineWebSocketHandler({
  open(peer) {
    activePeers.set(peer.id, peer)
  },

  close(peer) {
    activePeers.delete(peer.id)
    const { room, player } = handleDisconnect(peer.id)
    if (room && player) {
      const opponent = room.players.find(p => p.peerId !== peer.id)
      if (opponent?.connected) {
        sendToPeer(activePeers, opponent.peerId, { type: 'opponent_disconnected' })
      }
    }
  },

  error(peer, error) {
    console.error(`[WS] Peer ${peer.id} error:`, error)
    activePeers.delete(peer.id)
    handleDisconnect(peer.id)
  },

  message(peer, rawMessage) {
    let msg: ClientMessage
    try {
      const text = typeof rawMessage === 'string' ? rawMessage : rawMessage.text()
      msg = JSON.parse(text)
    } catch {
      send(peer, { type: 'error', message: 'Nieprawidłowy format wiadomości.' })
      return
    }

    switch (msg.type) {
      case 'create_room': {
        // Check if peer is already in a room
        const existing = getRoomForPeer(peer.id)
        if (existing) {
          send(peer, { type: 'error', message: 'Jesteś już w pokoju. Rozłącz się najpierw.' })
          return
        }

        const room = createRoom(peer.id, msg.displayName, msg.settings)
        send(peer, {
          type: 'room_created',
          roomId: room.id,
          code: room.code,
          side: 'player1',
        })
        break
      }

      case 'join_room': {
        const existing = getRoomForPeer(peer.id)
        if (existing) {
          send(peer, { type: 'error', message: 'Jesteś już w pokoju.' })
          return
        }

        const { room, error } = joinRoom(peer.id, msg.code, msg.displayName)
        if (error || !room) {
          send(peer, { type: 'error', message: error || 'Nie udało się dołączyć.' })
          return
        }

        // Notify joiner
        const host = room.players.find(p => p.side === 'player1')!
        send(peer, {
          type: 'room_joined',
          roomId: room.id,
          side: 'player2',
          opponentName: host.displayName,
        })

        // Notify host
        sendToPeer(activePeers, host.peerId, {
          type: 'opponent_joined',
          opponentName: msg.displayName,
        })
        break
      }

      case 'start_game': {
        const room = getRoomForPeer(peer.id)
        if (!room) {
          send(peer, { type: 'error', message: 'Nie jesteś w pokoju.' })
          return
        }
        if (room.host !== peer.id) {
          send(peer, { type: 'error', message: 'Tylko host może rozpocząć grę.' })
          return
        }
        if (room.players.length < 2) {
          send(peer, { type: 'error', message: 'Potrzeba 2 graczy.' })
          return
        }
        if (room.status !== 'waiting') {
          send(peer, { type: 'error', message: 'Gra już trwa.' })
          return
        }

        const fullState = startGame(room)

        // Send filtered state to each player
        for (const p of room.players) {
          const filtered = filterStateForPlayer(fullState, p.side)
          sendToPeer(activePeers, p.peerId, { type: 'game_started', state: filtered })
        }
        break
      }

      // All game actions
      default: {
        const room = getRoomForPeer(peer.id)
        if (!room) {
          send(peer, { type: 'error', message: 'Nie jesteś w pokoju.' })
          return
        }

        const { state, error } = executeAction(room, peer.id, msg)
        if (error) {
          send(peer, { type: 'error', message: error })
          return
        }

        if (state) {
          // Broadcast filtered state to both players
          for (const p of room.players) {
            const filtered = filterStateForPlayer(state, p.side)
            sendToPeer(activePeers, p.peerId, { type: 'state_update', state: filtered })
          }
        }
        break
      }
    }
  },
})
