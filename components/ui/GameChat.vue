<script setup lang="ts">
/**
 * GameChat — Slavic-themed in-game chat replacing ActionLog.
 *
 * Features:
 * - AI "narrator" posts game events as styled messages
 * - Player can type messages (shown locally)
 * - AI responds to player messages with themed quips
 * - Collapsible panel (like old ActionLog)
 * - Runic ornaments and dark atmosphere
 */
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

// ===== PANEL STATE =====
const panelOpen = ref(true)
const inputText = ref('')
const listRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

// ===== AI NARRATOR CONFIG =====
const AI_NAMES: Record<string, string> = {
  easy: 'Domowik',
  medium: 'Żerca',
  hard: 'Weles',
}
const AI_AVATARS: Record<string, string> = {
  easy: 'game-icons:fairy',
  medium: 'game-icons:hooded-figure',
  hard: 'game-icons:death-skull',
}

const aiName = computed(() => AI_NAMES[game.selectedDifficulty] ?? 'Żerca')
const aiAvatar = computed(() => AI_AVATARS[game.selectedDifficulty] ?? 'game-icons:hooded-figure')

// ===== MESSAGE TYPES =====
interface ChatMessage {
  id: number
  sender: 'ai' | 'player' | 'system'
  text: string
  icon?: string
  color?: string
  time: string
}

const typeIcons: Record<string, { icon: string; color: string }> = {
  attack:  { icon: 'game-icons:battle-axe', color: '#fb923c' },
  combat:  { icon: 'game-icons:sword-clash', color: '#fb923c' },
  death:   { icon: 'game-icons:skull-crossed-bones', color: '#ef4444' },
  play:    { icon: 'game-icons:card-play', color: '#4ade80' },
  phase:   { icon: 'game-icons:hourglass', color: '#a78bfa' },
  system:  { icon: 'game-icons:scroll-unfurled', color: '#fbbf24' },
  effect:  { icon: 'game-icons:magic-swirl', color: '#c084fc' },
  draw:    { icon: 'game-icons:card-draw', color: '#60a5fa' },
  gold:    { icon: 'game-icons:two-coins', color: '#c8a84e' },
  glory:   { icon: 'game-icons:laurels', color: '#c8a84e' },
  damage:  { icon: 'game-icons:drop', color: '#ef4444' },
}

let nextId = 0
const messages = ref<ChatMessage[]>([])

function now(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function pushMsg(sender: ChatMessage['sender'], text: string, icon?: string, color?: string) {
  messages.value.push({ id: nextId++, sender, text, icon, color, time: now() })
  // Keep last 50 messages
  if (messages.value.length > 50) messages.value.splice(0, messages.value.length - 50)
  scrollBottom()
}

function scrollBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

// ===== AI GREETING =====
const greetings: Record<string, string[]> = {
  easy: [
    'Witaj, wojowniku! Ja Domowik — duch twego domu. Postaram się nie za bardzo przeszkadzać… 🍄',
    'Ach, gość! Siadaj przy ognisku, Domowik cię poprowadzi. 🔥',
  ],
  medium: [
    'Żerca wita cię przy świętym ogniu. Bogowie patrzą — walcz dzielnie.',
    'Runy zostały rzucone. Żerca odczytuje twój los… Zaczynajmy.',
  ],
  hard: [
    'Weles otwiera bramy Nawii. Twoje dusze będą moje, śmiertelniku.',
    'Ciemność szepce twoje imię. Weles czeka na ofiarę…',
  ],
}

// ===== AI QUIP RESPONSES =====
const quips: Record<string, string[]> = {
  easy: [
    'Domowik kibicuje! Ale cicho, żeby nie usłyszeli…',
    'Oj, to był dobry ruch! Chyba…',
    'Domowik myśli, że dasz radę!',
    'Hm, może spróbuj coś innego?',
    '*szeleszczenie w kącie*',
  ],
  medium: [
    'Żerca kiwa głową z aprobatą.',
    'Bogowie obserwują twoje poczynania.',
    'Ciekawe zagranie… zobaczymy.',
    'Runy mówią, że los się zmienia.',
    'Perun grzmi w oddali.',
  ],
  hard: [
    'Weles się śmieje. Żałosne.',
    'Czy to wszystko na co cię stać?',
    'Nawiowie szepczą o twojej porażce.',
    'Twoje karty pachną strachem.',
    'Ciemność rośnie…',
  ],
}

function getRandomQuip(): string {
  const pool = quips[game.selectedDifficulty] ?? quips.medium!
  return pool[Math.floor(Math.random() * pool.length)]!
}

function getGreeting(): string {
  const pool = greetings[game.selectedDifficulty] ?? greetings.medium!
  return pool[Math.floor(Math.random() * pool.length)]!
}

// ===== INIT: AI greeting =====
let greeted = false
watch(() => game.gameStarted, (started) => {
  if (started && !greeted) {
    greeted = true
    messages.value = []
    setTimeout(() => pushMsg('ai', getGreeting()), 800)
  }
}, { immediate: true })

// ===== WATCH ACTION LOG: convert new entries to chat messages =====
let lastLogLen = 0
watch(() => game.actionLog?.length ?? 0, (newLen) => {
  if (newLen <= lastLogLen) { lastLogLen = newLen; return }
  const log = game.actionLog ?? []
  const newEntries = log.slice(lastLogLen)
  lastLogLen = newLen

  for (const entry of newEntries) {
    const tc = typeIcons[entry.type]
    pushMsg(
      entry.type === 'system' ? 'system' : 'ai',
      entry.message,
      tc?.icon,
      tc?.color,
    )
  }
})

// ===== PLAYER INPUT =====
function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  pushMsg('player', text)

  // AI responds after a short delay
  setTimeout(() => {
    pushMsg('ai', getRandomQuip())
  }, 600 + Math.random() * 800)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    sendMessage()
  }
}

const show = computed(() => game.gameStarted)
</script>

<template>
  <!-- Mobile toggle -->
  <button v-if="show" class="chat-mobile-toggle" @click="panelOpen = !panelOpen">
    <Icon icon="game-icons:talk" />
  </button>

  <Transition name="chat-slide">
    <div v-if="show && panelOpen" class="chat-panel">
      <!-- Header -->
      <div class="chat-header" @click="panelOpen = false">
        <div class="ch-left">
          <Icon :icon="aiAvatar" class="ch-avatar" />
          <div class="ch-info">
            <span class="ch-name">{{ aiName }}</span>
            <span class="ch-status">narrator</span>
          </div>
        </div>
        <div class="ch-orn">⟡</div>
        <button class="ch-close" @click.stop="panelOpen = false">
          <Icon icon="mdi:chevron-down" />
        </button>
      </div>

      <!-- Messages -->
      <div ref="listRef" class="chat-messages">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['chat-msg', `msg-${msg.sender}`]"
        >
          <!-- AI / System message -->
          <template v-if="msg.sender === 'ai' || msg.sender === 'system'">
            <div class="msg-bubble msg-bubble-ai" :style="msg.color ? { '--mc': msg.color } : {}">
              <Icon v-if="msg.icon" :icon="msg.icon" class="msg-type-icon" />
              <span class="msg-text">{{ msg.text }}</span>
            </div>
            <span class="msg-time">{{ msg.time }}</span>
          </template>

          <!-- Player message -->
          <template v-else>
            <span class="msg-time msg-time-right">{{ msg.time }}</span>
            <div class="msg-bubble msg-bubble-player">
              <span class="msg-text">{{ msg.text }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Runic separator -->
      <div class="chat-sep">
        <svg viewBox="0 0 200 6" class="sep-svg">
          <path d="M0 3 Q25 0 50 3 Q75 6 100 3 Q125 0 150 3 Q175 6 200 3" fill="none" stroke="rgba(200,168,78,0.15)" stroke-width="0.8"/>
        </svg>
      </div>

      <!-- Input -->
      <div class="chat-input-row">
        <input
          ref="inputRef"
          v-model="inputText"
          class="chat-input"
          placeholder="Napisz do narratora…"
          maxlength="120"
          @keydown="onKeydown"
        />
        <button class="chat-send" :disabled="!inputText.trim()" @click="sendMessage">
          <Icon icon="game-icons:quill-ink" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ===== MOBILE TOGGLE ===== */
.chat-mobile-toggle {
  display: none;
}

/* ===== PANEL ===== */
.chat-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
  width: 290px;
  max-height: 340px;
  background:
    linear-gradient(165deg, rgba(14, 10, 20, 0.97) 0%, rgba(8, 6, 14, 0.98) 100%);
  border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.18);
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(200, 168, 78, 0.06);
  z-index: 150;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(12px);
}

/* ===== HEADER ===== */
.chat-header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background:
    linear-gradient(90deg, rgba(200, 168, 78, 0.06) 0%, rgba(120, 40, 15, 0.04) 100%);
  border-bottom: 1px solid rgba(200, 168, 78, 0.1);
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.chat-header:hover {
  background:
    linear-gradient(90deg, rgba(200, 168, 78, 0.1) 0%, rgba(120, 40, 15, 0.06) 100%);
}

.ch-left {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
}

.ch-avatar {
  width: 22px;
  height: 22px;
  color: rgba(200, 168, 78, 0.7);
  filter: drop-shadow(0 0 4px rgba(200, 100, 30, 0.3));
}

.ch-info {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ch-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 12px;
  font-weight: 600;
  color: rgba(200, 168, 78, 0.85);
  letter-spacing: 0.06em;
  line-height: 1.2;
}

.ch-status {
  font-size: 8px;
  color: rgba(148, 130, 100, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.ch-orn {
  font-size: 10px;
  color: rgba(200, 168, 78, 0.12);
  margin: 0 6px;
}

.ch-close {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: rgba(200, 168, 78, 0.4);
  font-size: 16px;
  transition: color 0.15s, background 0.15s;
}
.ch-close:hover {
  color: rgba(200, 168, 78, 0.8);
  background: rgba(200, 168, 78, 0.08);
}

/* ===== MESSAGES ===== */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.1) transparent;
  min-height: 0;
  max-height: 220px;
}

.chat-msg {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  animation: msg-appear 0.25s ease-out;
}

@keyframes msg-appear {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg-player {
  justify-content: flex-end;
}

/* Bubbles */
.msg-bubble {
  max-width: 85%;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 1.45;
  word-break: break-word;
}

.msg-bubble-ai {
  background: rgba(200, 168, 78, 0.06);
  border: 1px solid rgba(200, 168, 78, 0.1);
  color: rgba(200, 190, 170, 0.85);
  border-top-left-radius: 2px;
  display: flex;
  align-items: flex-start;
  gap: 5px;
}

.msg-type-icon {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--mc, rgba(200, 168, 78, 0.5));
  opacity: 0.8;
}

.msg-bubble-player {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.08));
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: rgba(186, 210, 245, 0.9);
  border-top-right-radius: 2px;
}

.msg-text {
  flex: 1;
}

.msg-time {
  font-size: 8px;
  color: rgba(148, 130, 100, 0.3);
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 1px;
}

.msg-time-right {
  order: 0;
}

/* System messages */
.msg-system .msg-bubble-ai {
  background: rgba(251, 191, 36, 0.05);
  border-color: rgba(251, 191, 36, 0.12);
  color: rgba(251, 191, 36, 0.6);
  font-style: italic;
  font-size: 9.5px;
}

/* ===== SEPARATOR ===== */
.chat-sep {
  padding: 0 12px;
  flex-shrink: 0;
}

.sep-svg {
  width: 100%;
  height: 6px;
  display: block;
}

/* ===== INPUT ===== */
.chat-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 8px;
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(200, 168, 78, 0.1);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 10.5px;
  color: rgba(226, 232, 240, 0.85);
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
}

.chat-input::placeholder {
  color: rgba(148, 130, 100, 0.3);
  font-style: italic;
}

.chat-input:focus {
  border-color: rgba(200, 168, 78, 0.3);
  background: rgba(255, 255, 255, 0.04);
}

.chat-send {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(200, 168, 78, 0.08);
  border: 1px solid rgba(200, 168, 78, 0.15);
  color: rgba(200, 168, 78, 0.6);
  font-size: 14px;
  transition: all 0.15s;
}

.chat-send:hover:not(:disabled) {
  background: rgba(200, 168, 78, 0.15);
  color: rgba(200, 168, 78, 0.9);
  border-color: rgba(200, 168, 78, 0.3);
}

.chat-send:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ===== TRANSITIONS ===== */
.chat-slide-enter-active,
.chat-slide-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}

.chat-slide-enter-from,
.chat-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

/* ===== MOBILE ===== */
@media (max-width: 767px) {
  .chat-mobile-toggle {
    display: flex;
    position: fixed;
    top: 30px;
    left: 4px;
    z-index: 160;
    width: 28px;
    height: 28px;
    align-items: center;
    justify-content: center;
    background: rgba(12, 18, 32, 0.9);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 6px;
    color: rgba(200, 168, 78, 0.7);
    font-size: 14px;
    cursor: pointer;
    padding: 0;
    backdrop-filter: blur(4px);
  }

  .chat-panel {
    position: fixed;
    top: 62px;
    left: 4px;
    bottom: auto;
    width: 240px;
    max-height: 200px;
    border-radius: 8px;
    z-index: 155;
  }

  .chat-messages { max-height: 100px; padding: 4px 6px 2px; gap: 4px; }
  .chat-header { padding: 5px 8px; }
  .ch-avatar { width: 16px; height: 16px; }
  .ch-name { font-size: 10px; }
  .ch-status { font-size: 7px; }
  .msg-bubble { font-size: 9px; padding: 3px 7px; }
  .msg-type-icon { width: 9px; height: 9px; }
  .msg-time { font-size: 7px; }
  .chat-input { font-size: 9px; padding: 4px 6px; }
  .chat-send { width: 24px; height: 24px; font-size: 12px; }
  .chat-input-row { padding: 4px 6px 6px; }
}
</style>
