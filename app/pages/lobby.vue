<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMultiplayer } from '../../composables/useMultiplayer'
import { useGameStore } from '../../stores/gameStore'
import { useRouter } from 'vue-router'

const router = useRouter()
const mp = useMultiplayer()
const game = useGameStore()

const displayName = ref('')
const joinCode = ref('')
const selectedMode = ref<'slava' | 'gold'>('slava')
const view = ref<'menu' | 'create' | 'join'>('menu')

async function handleCreate() {
  if (!displayName.value.trim()) return
  await mp.createRoom(displayName.value.trim(), { gameMode: selectedMode.value })
}

async function handleJoin() {
  if (!displayName.value.trim() || !joinCode.value.trim()) return
  await mp.joinRoom(joinCode.value.trim().toUpperCase(), displayName.value.trim())
}

function handleStart() {
  mp.startGame()
}

// Set up gameStore for multiplayer when side is assigned
watch(() => mp.mySide.value, (side) => {
  if (side) game.startMultiplayer(side)
}, { immediate: true })

// Navigate to game when game starts
watch(() => mp.gameStarted.value, (started) => {
  if (started) {
    router.push('/game?mode=multiplayer')
  }
})

function copyCode() {
  if (mp.roomCode.value) {
    globalThis.navigator.clipboard.writeText(mp.roomCode.value)
  }
}

// Format code input: uppercase, max 4 chars
function onCodeInput(e: Event) {
  const input = e.target as HTMLInputElement
  joinCode.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
}
</script>

<template>
  <div class="lobby-page">
    <div class="lobby-card">
      <h1 class="lobby-title">Sława Vol.2 — Multiplayer</h1>

      <!-- Error display -->
      <div v-if="mp.lastError.value" class="lobby-error">
        {{ mp.lastError.value }}
      </div>

      <!-- Connection status -->
      <div v-if="mp.status.value === 'connecting'" class="lobby-status">
        Łączenie z serwerem...
      </div>

      <!-- MENU -->
      <template v-if="!mp.isInRoom.value">
        <div v-if="view === 'menu'" class="lobby-menu">
          <div class="lobby-name-row">
            <label for="name-input">Twoje imię</label>
            <input
              id="name-input"
              v-model="displayName"
              type="text"
              maxlength="20"
              placeholder="Wpisz imię..."
              class="lobby-input"
            />
          </div>

          <div class="lobby-mode-row">
            <label>Tryb gry</label>
            <div class="mode-buttons">
              <button
                :class="['mode-btn', { active: selectedMode === 'slava' }]"
                @click="selectedMode = 'slava'"
              >Sława</button>
              <button
                :class="['mode-btn', { active: selectedMode === 'gold' }]"
                @click="selectedMode = 'gold'"
              >Gold Edition</button>
            </div>
          </div>

          <div class="lobby-actions">
            <button
              class="lobby-btn btn-create"
              :disabled="!displayName.trim()"
              @click="view = 'create'; handleCreate()"
            >Utwórz pokój</button>
            <button
              class="lobby-btn btn-join"
              :disabled="!displayName.trim()"
              @click="view = 'join'"
            >Dołącz do pokoju</button>
          </div>
        </div>

        <!-- JOIN VIEW -->
        <div v-if="view === 'join'" class="lobby-join">
          <button class="back-btn" @click="view = 'menu'">&larr; Wróć</button>
          <label for="code-input">Kod pokoju</label>
          <input
            id="code-input"
            :value="joinCode"
            type="text"
            maxlength="4"
            placeholder="ABCD"
            class="lobby-input code-input"
            @input="onCodeInput"
          />
          <button
            class="lobby-btn btn-join"
            :disabled="joinCode.length < 4"
            @click="handleJoin()"
          >Dołącz</button>
        </div>
      </template>

      <!-- WAITING ROOM -->
      <template v-if="mp.isInRoom.value && !mp.gameStarted.value">
        <div class="waiting-room">
          <div class="room-code-display">
            <span class="room-code-label">Kod pokoju</span>
            <span class="room-code-value">{{ mp.roomCode.value }}</span>
            <button class="copy-btn" @click="copyCode">
              Kopiuj
            </button>
          </div>

          <div class="players-list">
            <div class="player-slot filled">
              <span class="player-dot host"></span>
              <span>{{ mp.isHost.value ? 'Ty (host)' : mp.opponentName.value }}</span>
            </div>
            <div :class="['player-slot', { filled: mp.opponentConnected.value }]">
              <span :class="['player-dot', { connected: mp.opponentConnected.value }]"></span>
              <span v-if="mp.opponentConnected.value">
                {{ mp.isHost.value ? mp.opponentName.value : 'Ty' }}
              </span>
              <span v-else class="waiting-text">Oczekiwanie na gracza...</span>
            </div>
          </div>

          <button
            v-if="mp.isHost.value"
            class="lobby-btn btn-start"
            :disabled="!mp.opponentConnected.value"
            @click="handleStart()"
          >Rozpocznij grę</button>

          <p v-else class="waiting-hint">Host rozpocznie grę...</p>

          <button class="lobby-btn btn-leave" @click="mp.disconnect()">Opuść pokój</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lobby-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  padding: 20px;
}

.lobby-card {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 16px;
  padding: 40px;
  max-width: 440px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.lobby-title {
  font-family: 'Kanyon', serif;
  font-size: 24px;
  color: #f1f5f9;
  text-align: center;
  margin: 0 0 28px;
}

.lobby-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 16px;
}

.lobby-status {
  color: #94a3b8;
  text-align: center;
  font-size: 13px;
  margin-bottom: 12px;
}

/* Name & mode */
.lobby-name-row, .lobby-mode-row {
  margin-bottom: 20px;
}

.lobby-name-row label,
.lobby-mode-row label,
.lobby-join label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lobby-input {
  width: 100%;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.lobby-input:focus {
  border-color: rgba(99, 102, 241, 0.5);
}

.code-input {
  font-size: 28px;
  text-align: center;
  letter-spacing: 0.3em;
  font-family: monospace;
  text-transform: uppercase;
}

.mode-buttons {
  display: flex;
  gap: 8px;
}

.mode-btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.4);
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.mode-btn.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.5);
  color: #a5b4fc;
}

/* Buttons */
.lobby-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lobby-btn {
  padding: 12px;
  border-radius: 10px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  width: 100%;
}

.lobby-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.lobby-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-create {
  background: linear-gradient(135deg, #6366f1, #818cf8);
  color: white;
}

.btn-join {
  background: linear-gradient(135deg, #059669, #34d399);
  color: white;
}

.btn-start {
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #1e293b;
}

.btn-leave {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  margin-top: 12px;
  font-size: 13px;
}

.back-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 16px;
  padding: 0;
}

/* Waiting room */
.waiting-room {
  text-align: center;
}

.room-code-display {
  margin-bottom: 24px;
}

.room-code-label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.room-code-value {
  display: block;
  font-size: 48px;
  font-family: monospace;
  font-weight: 700;
  color: #a5b4fc;
  letter-spacing: 0.2em;
  margin-bottom: 8px;
}

.copy-btn {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  border-radius: 6px;
  padding: 4px 16px;
  cursor: pointer;
  font-size: 12px;
}

.players-list {
  margin-bottom: 24px;
}

.player-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 8px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.1);
  color: #64748b;
  font-size: 14px;
}

.player-slot.filled {
  color: #f1f5f9;
  border-color: rgba(148, 163, 184, 0.2);
}

.player-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #475569;
}

.player-dot.host {
  background: #4ade80;
}

.player-dot.connected {
  background: #4ade80;
}

.waiting-text {
  color: #64748b;
  font-style: italic;
}

.waiting-hint {
  color: #94a3b8;
  font-size: 13px;
  margin: 16px 0 0;
}

/* Join view */
.lobby-join {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 480px) {
  .lobby-card {
    padding: 24px;
  }
  .room-code-value {
    font-size: 36px;
  }
}
</style>
