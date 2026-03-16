<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useMultiplayer } from '../../composables/useMultiplayer'
import { useGameStore } from '../../stores/gameStore'
import { useRouter } from 'vue-router'

definePageMeta({ ssr: false })

const router = useRouter()
const mp = useMultiplayer()
const game = useGameStore()

const displayName = ref(game.playerName || '')
const joinCode = ref('')
const selectedMode = ref<'slava' | 'gold'>('gold')
const view = ref<'menu' | 'join'>('menu')
const copied = ref(false)

async function handleCreate() {
  if (!displayName.value.trim()) return
  game.setPlayerProfile(displayName.value.trim(), game.playerIcon)
  await mp.createRoom(displayName.value.trim(), { gameMode: selectedMode.value })
}

async function handleJoin() {
  if (!displayName.value.trim() || !joinCode.value.trim()) return
  game.setPlayerProfile(displayName.value.trim(), game.playerIcon)
  await mp.joinRoom(joinCode.value.trim().toUpperCase(), displayName.value.trim())
}

function handleStart() { mp.startGame() }

watch(() => mp.mySide.value, (side) => {
  if (side) game.startMultiplayer(side)
}, { immediate: true })

watch(() => mp.gameStarted.value, (started) => {
  if (started) router.push('/game?mode=multiplayer')
})

function copyCode() {
  if (mp.roomCode.value) {
    globalThis.navigator.clipboard.writeText(mp.roomCode.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function onCodeInput(e: Event) {
  const input = e.target as HTMLInputElement
  joinCode.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

// Embers
const embers = ref<{ x: number; delay: number; dur: number; size: number }[]>([])
onMounted(() => {
  embers.value = Array.from({ length: 16 }, () => ({
    x: Math.random() * 100,
    delay: Math.random() * 12,
    dur: 9 + Math.random() * 10,
    size: 1.5 + Math.random() * 2.5,
  }))
})
</script>

<template>
  <div class="lobby-page">
    <!-- Background -->
    <div class="lb-bg">
      <div class="lb-fog lb-fog-1" />
      <div class="lb-fog lb-fog-2" />
      <div class="lb-vignette" />
      <div
        v-for="(e, i) in embers" :key="i"
        class="lb-ember"
        :style="{ left: e.x + '%', animationDelay: e.delay + 's', animationDuration: e.dur + 's', '--sz': e.size + 'px' }"
      />
    </div>

    <!-- Back button -->
    <NuxtLink to="/" class="lb-back">
      <Icon icon="mdi:arrow-left" />
      <span>Powrót</span>
    </NuxtLink>

    <!-- Content -->
    <div class="lb-content">
      <!-- Header emblem -->
      <div class="lb-header">
        <svg viewBox="0 0 120 8" class="lb-orn"><path d="M0 4 Q15 0 30 4 Q45 8 60 4 Q75 0 90 4 Q105 8 120 4" fill="none" stroke="rgba(200,168,78,0.2)" stroke-width="1"/></svg>
        <div class="lb-emblem">
          <Icon icon="game-icons:swords-emblem" class="lb-emblem-icon" />
        </div>
        <h1 class="lb-title">Komnata Wojenna</h1>
        <p class="lb-subtitle">Multiplayer</p>
        <svg viewBox="0 0 120 8" class="lb-orn"><path d="M0 4 Q15 8 30 4 Q45 0 60 4 Q75 8 90 4 Q105 0 120 4" fill="none" stroke="rgba(200,168,78,0.2)" stroke-width="1"/></svg>
      </div>

      <!-- Error -->
      <div v-if="mp.lastError.value" class="lb-error">
        <Icon icon="game-icons:broken-shield" class="lb-error-icon" />
        {{ mp.lastError.value }}
      </div>

      <!-- Connecting -->
      <div v-if="mp.status.value === 'connecting'" class="lb-status">
        <div class="lb-status-dot" />
        Łączenie z serwerem…
      </div>

      <!-- ===== MENU ===== -->
      <template v-if="!mp.isInRoom.value">

        <div v-if="view === 'menu'" class="lb-form">
          <!-- Name -->
          <div class="lb-field">
            <label class="lb-label">
              <Icon icon="game-icons:quill-ink" class="lb-label-icon" />
              Twoje imię wojownika
            </label>
            <input
              v-model="displayName"
              type="text" maxlength="20"
              placeholder="Wpisz imię…"
              class="lb-input"
            />
          </div>

          <!-- Mode -->
          <div class="lb-field">
            <label class="lb-label">
              <Icon icon="game-icons:crossed-swords" class="lb-label-icon" />
              Tryb bitwy
            </label>
            <div class="lb-mode-row">
              <button :class="['lb-mode', { active: selectedMode === 'gold' }]" @click="selectedMode = 'gold'">
                <Icon icon="game-icons:crown-coin" class="lb-mode-icon" />
                <span class="lb-mode-name">Złota Edycja</span>
              </button>
              <button :class="['lb-mode', { active: selectedMode === 'slava' }]" @click="selectedMode = 'slava'">
                <Icon icon="game-icons:sword-clash" class="lb-mode-icon" />
                <span class="lb-mode-name">Sława!</span>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="lb-actions">
            <button class="lb-btn lb-btn-create" :disabled="!displayName.trim()" @click="handleCreate()">
              <Icon icon="game-icons:campfire" class="lb-btn-icon" />
              <span>Rozpal ognisko</span>
              <span class="lb-btn-hint">Utwórz pokój</span>
            </button>
            <button class="lb-btn lb-btn-join" :disabled="!displayName.trim()" @click="view = 'join'">
              <Icon icon="game-icons:compass" class="lb-btn-icon" />
              <span>Znajdź ognisko</span>
              <span class="lb-btn-hint">Dołącz do pokoju</span>
            </button>
          </div>
        </div>

        <!-- ===== JOIN ===== -->
        <div v-if="view === 'join'" class="lb-form">
          <button class="lb-back-inline" @click="view = 'menu'">
            <Icon icon="mdi:arrow-left" /> Wróć
          </button>

          <div class="lb-field">
            <label class="lb-label">
              <Icon icon="game-icons:rune-stone" class="lb-label-icon" />
              Kod ogniska
            </label>
            <div class="lb-code-input-wrap">
              <input
                :value="joinCode"
                type="text" maxlength="4"
                placeholder="· · · ·"
                class="lb-input lb-code-input"
                @input="onCodeInput"
              />
            </div>
          </div>

          <button class="lb-btn lb-btn-join" :disabled="joinCode.length < 4" @click="handleJoin()">
            <Icon icon="game-icons:compass" class="lb-btn-icon" />
            <span>Dołącz do bitwy</span>
          </button>
        </div>
      </template>

      <!-- ===== WAITING ROOM ===== -->
      <template v-if="mp.isInRoom.value && !mp.gameStarted.value">
        <div class="lb-waiting">
          <!-- Room code -->
          <div class="lb-code-display">
            <span class="lb-code-label">Kod ogniska</span>
            <div class="lb-code-runes">
              <span v-for="(ch, i) in (mp.roomCode.value ?? '').split('')" :key="i" class="lb-rune-char">{{ ch }}</span>
            </div>
            <button :class="['lb-copy', { copied }]" @click="copyCode">
              <Icon :icon="copied ? 'mdi:check' : 'game-icons:scroll-unfurled'" />
              {{ copied ? 'Skopiowano!' : 'Kopiuj kod' }}
            </button>
          </div>

          <!-- Two banners -->
          <div class="lb-banners">
            <!-- Host / Player 1 -->
            <div class="lb-banner lb-banner-left">
              <div class="lb-banner-glow" />
              <Icon icon="game-icons:viking-helmet" class="lb-banner-icon" />
              <span class="lb-banner-name">{{ mp.isHost.value ? 'Ty' : (mp.opponentName.value || '???') }}</span>
              <span v-if="mp.isHost.value" class="lb-banner-badge">HOST</span>
              <div class="lb-banner-status lb-status-on" />
            </div>

            <div class="lb-vs-divider">
              <Icon icon="game-icons:sword-clash" class="lb-vs-icon" />
            </div>

            <!-- Opponent / Player 2 -->
            <div :class="['lb-banner', 'lb-banner-right', { 'lb-banner-empty': !mp.opponentConnected.value }]">
              <div class="lb-banner-glow lb-glow-red" />
              <Icon :icon="mp.opponentConnected.value ? 'game-icons:horned-helmet' : 'game-icons:hooded-figure'" class="lb-banner-icon" />
              <span class="lb-banner-name">
                {{ mp.opponentConnected.value
                  ? (mp.isHost.value ? (mp.opponentName.value || 'Przeciwnik') : 'Ty')
                  : 'Oczekiwanie…' }}
              </span>
              <div :class="['lb-banner-status', mp.opponentConnected.value ? 'lb-status-on' : 'lb-status-off']" />
            </div>
          </div>

          <!-- Start / Wait -->
          <button
            v-if="mp.isHost.value"
            class="lb-btn lb-btn-start"
            :disabled="!mp.opponentConnected.value"
            @click="handleStart()"
          >
            <Icon icon="game-icons:war-axe" class="lb-btn-icon" />
            <span>Do boju!</span>
          </button>

          <div v-else class="lb-wait-hint">
            <div class="lb-wait-flame" />
            Host rozpocznie bitwę…
          </div>

          <button class="lb-btn-leave" @click="mp.disconnect()">
            <Icon icon="mdi:logout" /> Opuść ognisko
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lobby-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #04030a;
  overflow: hidden;
  padding: 20px;
}

/* ===== BACKGROUND ===== */
.lb-bg { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }

.lb-fog {
  position: absolute;
  border-radius: 50%;
  animation: lb-fog 12s ease-in-out infinite;
}
.lb-fog-1 {
  width: 110%; height: 50%; bottom: -15%; left: -5%;
  background: radial-gradient(ellipse, rgba(140, 50, 10, 0.1) 0%, transparent 55%);
}
.lb-fog-2 {
  width: 70%; height: 70%; top: -20%; right: -10%;
  background: radial-gradient(ellipse, rgba(60, 20, 80, 0.06) 0%, transparent 50%);
  animation-delay: -6s;
}
@keyframes lb-fog {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.08); }
}

.lb-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 25%, rgba(0, 0, 0, 0.75) 100%);
}

.lb-ember {
  position: absolute; bottom: -8px;
  width: var(--sz, 2px); height: var(--sz, 2px);
  border-radius: 50%;
  background: rgba(200, 100, 30, 0.6);
  box-shadow: 0 0 3px rgba(200, 80, 20, 0.3);
  animation: lb-rise linear infinite;
  will-change: transform, opacity;
}
@keyframes lb-rise {
  0%   { transform: translateY(0); opacity: 0; }
  6%   { opacity: 0.8; }
  50%  { transform: translateY(-50vh) translateX(8px); opacity: 0.4; }
  100% { transform: translateY(-105vh) translateX(-4px); opacity: 0; }
}

/* ===== BACK BUTTON ===== */
.lb-back {
  position: fixed; top: 16px; left: 16px; z-index: 10;
  display: flex; align-items: center; gap: 4px;
  color: rgba(200, 168, 78, 0.5);
  text-decoration: none; font-size: 12px; letter-spacing: 0.04em;
  padding: 6px 12px; border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(4, 3, 10, 0.7);
  backdrop-filter: blur(6px);
  transition: all 0.15s;
}
.lb-back:hover { color: rgba(200, 168, 78, 0.9); border-color: rgba(200, 168, 78, 0.25); }

/* ===== CONTENT ===== */
.lb-content {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; align-items: center;
  max-width: 420px; width: 100%;
  gap: 20px;
}

/* ===== HEADER ===== */
.lb-header {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.lb-orn { width: 160px; height: 8px; }

.lb-emblem {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  margin: 8px 0 4px;
  position: relative;
}
.lb-emblem::before {
  content: ''; position: absolute; inset: -4px;
  border-radius: 50%;
  border: 1.5px solid rgba(200, 168, 78, 0.2);
  animation: lb-spin 20s linear infinite;
}
@keyframes lb-spin { to { transform: rotate(360deg); } }

.lb-emblem-icon { font-size: 30px; color: rgba(200, 168, 78, 0.7); filter: drop-shadow(0 0 8px rgba(200, 100, 30, 0.3)); }

.lb-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 28px; font-weight: 500; letter-spacing: 0.15em;
  color: #ddd6c1; margin: 0;
  text-shadow: 0 0 30px rgba(200, 100, 30, 0.2), 0 2px 8px rgba(0, 0, 0, 0.8);
}

.lb-subtitle {
  font-size: 10px; color: rgba(200, 168, 78, 0.45);
  letter-spacing: 0.2em; text-transform: uppercase; font-weight: 700; margin: 0;
}

/* ===== ERROR / STATUS ===== */
.lb-error {
  display: flex; align-items: center; gap: 8px;
  background: rgba(200, 40, 30, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: rgba(252, 165, 165, 0.9); border-radius: 8px;
  padding: 10px 14px; font-size: 12px; width: 100%;
}
.lb-error-icon { font-size: 16px; flex-shrink: 0; opacity: 0.7; }

.lb-status {
  display: flex; align-items: center; gap: 8px;
  color: rgba(148, 130, 100, 0.6); font-size: 12px; font-style: italic;
}
.lb-status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(200, 168, 78, 0.5);
  animation: lb-blink 1.2s ease-in-out infinite;
}
@keyframes lb-blink { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

/* ===== FORM ===== */
.lb-form {
  width: 100%;
  display: flex; flex-direction: column; gap: 18px;
  background: rgba(14, 10, 20, 0.6);
  border: 1px solid rgba(200, 168, 78, 0.08);
  border-radius: 12px;
  padding: 24px;
  backdrop-filter: blur(8px);
}

.lb-field { display: flex; flex-direction: column; gap: 6px; }

.lb-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; color: rgba(200, 168, 78, 0.55);
  text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;
}
.lb-label-icon { font-size: 12px; opacity: 0.6; }

.lb-input {
  width: 100%; padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(200, 168, 78, 0.12);
  border-radius: 8px; color: #e2e8f0; font-size: 14px;
  outline: none; transition: border-color 0.2s; font-family: inherit;
  box-sizing: border-box;
}
.lb-input::placeholder { color: rgba(148, 130, 100, 0.3); }
.lb-input:focus { border-color: rgba(200, 168, 78, 0.35); background: rgba(255, 255, 255, 0.04); }

.lb-code-input {
  font-size: 32px; text-align: center; letter-spacing: 0.4em;
  font-family: var(--font-display, Georgia, serif);
  color: rgba(200, 168, 78, 0.9);
  text-transform: uppercase;
}

/* Mode selector */
.lb-mode-row { display: flex; gap: 8px; }

.lb-mode {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background: rgba(200, 168, 78, 0.02);
  color: rgba(148, 130, 100, 0.5);
  cursor: pointer; transition: all 0.2s; font-family: inherit;
}
.lb-mode:hover { border-color: rgba(200, 168, 78, 0.15); color: rgba(200, 168, 78, 0.7); }
.lb-mode.active {
  border-color: rgba(200, 168, 78, 0.35);
  background: rgba(200, 168, 78, 0.06);
  color: rgba(200, 168, 78, 0.9);
  box-shadow: 0 0 12px rgba(200, 100, 30, 0.08);
}
.lb-mode-icon { font-size: 20px; }
.lb-mode-name { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }

/* Actions */
.lb-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }

.lb-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px; border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; width: 100%;
  position: relative; overflow: hidden;
  font-family: var(--font-display, Georgia, serif);
  letter-spacing: 0.06em;
}
.lb-btn:disabled { opacity: 0.3; cursor: default; }
.lb-btn:active:not(:disabled) { transform: scale(0.98); }
.lb-btn-icon { font-size: 18px; }
.lb-btn-hint { font-size: 9px; opacity: 0.5; font-weight: 400; letter-spacing: 0.08em; }

.lb-btn-create {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.15), rgba(200, 168, 78, 0.08));
  color: rgba(200, 168, 78, 0.9);
  border-color: rgba(200, 168, 78, 0.25);
}
.lb-btn-create:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.25), rgba(200, 168, 78, 0.12));
  border-color: rgba(200, 168, 78, 0.4);
  box-shadow: 0 0 20px rgba(200, 100, 30, 0.1);
}

.lb-btn-join {
  background: rgba(59, 130, 246, 0.06);
  color: rgba(140, 180, 240, 0.85);
  border-color: rgba(59, 130, 246, 0.2);
}
.lb-btn-join:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.35);
}

.lb-btn-start {
  background: linear-gradient(135deg, rgba(200, 168, 78, 0.2), rgba(200, 100, 30, 0.12));
  color: rgba(200, 168, 78, 1);
  border-color: rgba(200, 168, 78, 0.4);
  font-size: 16px; padding: 16px;
  text-shadow: 0 0 12px rgba(200, 100, 30, 0.3);
}
.lb-btn-start:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(200, 168, 78, 0.3), rgba(200, 100, 30, 0.2));
  box-shadow: 0 0 30px rgba(200, 100, 30, 0.15);
}

.lb-back-inline {
  all: unset; cursor: pointer;
  display: flex; align-items: center; gap: 4px;
  color: rgba(148, 130, 100, 0.5); font-size: 11px;
  transition: color 0.15s;
}
.lb-back-inline:hover { color: rgba(200, 168, 78, 0.8); }

/* ===== WAITING ROOM ===== */
.lb-waiting {
  width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 20px;
  background: rgba(14, 10, 20, 0.6);
  border: 1px solid rgba(200, 168, 78, 0.08);
  border-radius: 12px; padding: 28px 24px;
  backdrop-filter: blur(8px);
}

/* Code display */
.lb-code-display {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.lb-code-label {
  font-size: 9px; color: rgba(200, 168, 78, 0.4);
  text-transform: uppercase; letter-spacing: 0.15em; font-weight: 600;
}
.lb-code-runes {
  display: flex; gap: 6px;
}
.lb-rune-char {
  width: 44px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display, Georgia, serif);
  font-size: 28px; font-weight: 600;
  color: rgba(200, 168, 78, 0.9);
  background: rgba(200, 168, 78, 0.04);
  border: 1px solid rgba(200, 168, 78, 0.15);
  border-radius: 6px;
  text-shadow: 0 0 10px rgba(200, 100, 30, 0.3);
  animation: lb-rune-in 0.4s ease-out both;
}
.lb-rune-char:nth-child(2) { animation-delay: 0.08s; }
.lb-rune-char:nth-child(3) { animation-delay: 0.16s; }
.lb-rune-char:nth-child(4) { animation-delay: 0.24s; }

@keyframes lb-rune-in {
  from { opacity: 0; transform: translateY(8px) scale(0.8); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.lb-copy {
  display: flex; align-items: center; gap: 5px;
  background: rgba(200, 168, 78, 0.06);
  border: 1px solid rgba(200, 168, 78, 0.12);
  color: rgba(200, 168, 78, 0.6);
  border-radius: 6px; padding: 5px 14px;
  cursor: pointer; font-size: 10px; letter-spacing: 0.04em;
  transition: all 0.15s; font-family: inherit;
}
.lb-copy:hover { border-color: rgba(200, 168, 78, 0.3); color: rgba(200, 168, 78, 0.9); }
.lb-copy.copied { border-color: rgba(74, 222, 128, 0.3); color: rgba(74, 222, 128, 0.8); }

/* Banners */
.lb-banners {
  display: flex; align-items: center; gap: 12px; width: 100%;
}

.lb-banner {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px 8px;
  border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.12);
  background: rgba(200, 168, 78, 0.03);
  position: relative; overflow: hidden;
  transition: all 0.3s;
}
.lb-banner-empty {
  border-style: dashed;
  opacity: 0.5;
}

.lb-banner-glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center bottom, rgba(200, 168, 78, 0.06) 0%, transparent 70%);
  pointer-events: none;
}
.lb-glow-red {
  background: radial-gradient(ellipse at center bottom, rgba(200, 60, 40, 0.06) 0%, transparent 70%);
}

.lb-banner-icon {
  font-size: 28px;
  color: rgba(200, 168, 78, 0.6);
  z-index: 1;
}
.lb-banner-right .lb-banner-icon { color: rgba(200, 100, 80, 0.6); }

.lb-banner-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 12px; font-weight: 600;
  color: rgba(226, 232, 240, 0.8);
  letter-spacing: 0.05em; z-index: 1;
  text-align: center;
}

.lb-banner-badge {
  font-size: 7px; font-weight: 700;
  color: rgba(200, 168, 78, 0.7);
  background: rgba(200, 168, 78, 0.1);
  border: 1px solid rgba(200, 168, 78, 0.2);
  border-radius: 3px;
  padding: 1px 6px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lb-banner-status {
  width: 8px; height: 8px; border-radius: 50%;
  z-index: 1;
}
.lb-status-on {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}
.lb-status-off {
  background: rgba(100, 116, 139, 0.4);
  animation: lb-blink 1.5s ease-in-out infinite;
}

.lb-vs-divider {
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.lb-vs-icon {
  font-size: 22px;
  color: rgba(200, 168, 78, 0.2);
  filter: drop-shadow(0 0 4px rgba(200, 100, 30, 0.15));
}

/* Wait hint */
.lb-wait-hint {
  display: flex; align-items: center; gap: 8px;
  color: rgba(148, 130, 100, 0.5);
  font-size: 12px; font-style: italic;
}
.lb-wait-flame {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(200, 100, 30, 0.5);
  animation: lb-blink 2s ease-in-out infinite;
}

.lb-btn-leave {
  all: unset; cursor: pointer;
  display: flex; align-items: center; gap: 5px;
  color: rgba(239, 68, 68, 0.4);
  font-size: 11px; letter-spacing: 0.04em;
  padding: 6px 14px; border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.1);
  transition: all 0.15s; font-family: inherit;
}
.lb-btn-leave:hover { color: rgba(239, 68, 68, 0.8); border-color: rgba(239, 68, 68, 0.25); }

/* ===== MOBILE ===== */
@media (max-width: 480px) {
  .lb-content { gap: 14px; }
  .lb-title { font-size: 22px; letter-spacing: 0.1em; }
  .lb-form { padding: 18px; gap: 14px; }
  .lb-waiting { padding: 20px 16px; }
  .lb-rune-char { width: 36px; height: 44px; font-size: 22px; }
  .lb-banner { padding: 12px 6px; }
  .lb-banner-icon { font-size: 22px; }
  .lb-banner-name { font-size: 10px; }
  .lb-btn { padding: 12px; font-size: 13px; }
}
</style>
