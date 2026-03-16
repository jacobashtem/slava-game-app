<script setup lang="ts">
/**
 * GameChat — Slavic-themed in-game chat (no action log).
 *
 * Pure chat between player and AI narrator persona.
 * Player can set nick + icon. AI greets and responds in character.
 * Collapsible panel.
 */
import { computed, ref, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { useNarrator } from '../../composables/useNarrator'
import { useMultiplayer } from '../../composables/useMultiplayer'
const game = useGameStore()
const narrator = useNarrator()
const mp = useMultiplayer()

const isMP = computed(() => game.isMultiplayerMode)

// ===== PANEL STATE =====
const panelOpen = ref(true)
const inputText = ref('')
const listRef = ref<HTMLElement | null>(null)
const showProfile = ref(false)
const profileNameInput = ref(game.playerName || '')

// ===== PLAYER ICON OPTIONS =====
const PLAYER_ICONS = [
  'game-icons:viking-helmet',
  'game-icons:swords-emblem',
  'game-icons:wolf-head',
  'game-icons:bear-head',
  'game-icons:hawk-emblem',
  'game-icons:raven',
  'game-icons:crown',
  'game-icons:war-axe',
  'game-icons:fire-ring',
  'game-icons:triquetra',
  'game-icons:oak-leaf',
  'game-icons:eye-shield',
]

const playerDisplayName = computed(() => game.playerName || 'Wojownik')
const playerDisplayIcon = computed(() => game.playerIcon || 'game-icons:viking-helmet')

function selectIcon(icon: string) {
  game.setPlayerProfile(profileNameInput.value.trim() || game.playerName, icon)
}

function saveProfile() {
  game.setPlayerProfile(profileNameInput.value.trim() || 'Wojownik', game.playerIcon)
  showProfile.value = false
}

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
const AI_TITLES: Record<string, string> = {
  easy: 'duch domowy',
  medium: 'kapłan',
  hard: 'bóg zaświatów',
}

const aiName = computed(() => AI_NAMES[game.selectedDifficulty] ?? 'Żerca')
const aiAvatar = computed(() => AI_AVATARS[game.selectedDifficulty] ?? 'game-icons:hooded-figure')
const aiTitle = computed(() => AI_TITLES[game.selectedDifficulty] ?? 'narrator')

// ===== MESSAGES =====
interface ChatMessage {
  id: number
  sender: 'ai' | 'player'
  text: string
  time: string
}

let nextId = 0
const messages = ref<ChatMessage[]>([])

function now(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function pushMsg(sender: ChatMessage['sender'], text: string) {
  messages.value.push({ id: nextId++, sender, text, time: now() })
  if (messages.value.length > 50) messages.value.splice(0, messages.value.length - 50)
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

// ===== AI GREETINGS =====
const greetings: Record<string, string[]> = {
  easy: [
    'Witaj, wojowniku! Domowik — duch twego domu, do usług. Postaram się nie przeszkadzać… 🍄',
    'Ach, gość! Siadaj przy ognisku, opowiem ci co widzę z kąta izby. 🔥',
    'Domowik się kłania! Będę cicho szeptał podpowiedzi… ale nic nie obiecuję!',
  ],
  medium: [
    'Żerca wita cię przy świętym ogniu. Bogowie patrzą — walcz dzielnie.',
    'Runy zostały rzucone. Żerca odczytuje twój los… Zaczynajmy.',
    'Ogień płonie, wiatr niesie szept bogów. Żerca jest gotowy.',
  ],
  hard: [
    'Weles otwiera bramy Nawii. Twoje dusze będą moje, śmiertelniku.',
    'Ciemność szepce twoje imię. Weles czeka na ofiarę…',
    'Witaj w krainie cieni. Każda karta przybliża cię do mojego królestwa.',
  ],
}

// ===== AI RESPONSES =====
const quips: Record<string, string[]> = {
  easy: [
    'Domowik kibicuje! Ale cicho, żeby nie usłyszeli…',
    'Oj, to był dobry ruch! Chyba…',
    'Domowik myśli, że dasz radę!',
    'Hm, może spróbuj coś innego?',
    '*szeleszczenie w kącie izby*',
    'Ciiii… słyszę kroki wrogów…',
    'Domowik schował się za piecem, ale dalej kibicuje!',
    'A co tam u ciebie? Ja tu siedzę i patrzę.',
  ],
  medium: [
    'Żerca kiwa głową z aprobatą.',
    'Bogowie obserwują twoje poczynania.',
    'Ciekawe zagranie… zobaczymy co przyniesie.',
    'Runy mówią, że los się zmienia.',
    'Perun grzmi w oddali. Dobry znak.',
    'Ogień święty szepce odpowiedzi, lecz ja milczę.',
    'Cierpliwość, wojowniku. Bogowie wynagradzają wytrwałych.',
    'Żerca widzi przyszłość, ale nie zdradza jej.',
  ],
  hard: [
    'Weles się śmieje. Żałosne.',
    'Czy to wszystko na co cię stać?',
    'Nawiowie szepczą o twojej porażce.',
    'Twoje karty pachną strachem.',
    'Ciemność rośnie… i jest głodna.',
    'Każdy twój ruch przybliża koniec.',
    'Słyszę płacz twoich przodków.',
    'Weles jest cierpliwy. Weles zawsze wygrywa.',
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

// ===== INIT =====
let greeted = false
watch(() => game.gameStarted, (started) => {
  if (started && !greeted) {
    greeted = true
    messages.value = []
    setTimeout(() => pushMsg('ai', getGreeting()), 800)
  }
}, { immediate: true })

// ===== NARRATOR EVENT REACTIONS =====
let lastNarratorIdx = 0
watch(() => narrator.messages.value.length, (newLen) => {
  if (newLen <= lastNarratorIdx) { lastNarratorIdx = newLen; return }
  // In tutorial mode, suppress narrator — tutorial steps handle messages
  if (game.isTutorialMode) { lastNarratorIdx = newLen; return }
  const newMsgs = narrator.messages.value.slice(lastNarratorIdx)
  lastNarratorIdx = newLen
  for (const text of newMsgs) {
    pushMsg('ai', text)
  }
})


// ===== MULTIPLAYER CHAT: receive opponent messages =====
let lastMPChatLen = 0
watch(() => mp.chatMessages.value.length, (newLen) => {
  if (newLen <= lastMPChatLen) { lastMPChatLen = newLen; return }
  const newMsgs = mp.chatMessages.value.slice(lastMPChatLen)
  lastMPChatLen = newLen
  for (const msg of newMsgs) {
    pushMsg('ai', msg.text) // opponent messages show as "other" side
  }
})

// ===== PLAYER INPUT =====
function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  pushMsg('player', text)

  if (isMP.value) {
    // Multiplayer: send via WebSocket, no AI response
    mp.sendChat(text)
  } else {
    // Single-player: AI narrator responds
    setTimeout(() => pushMsg('ai', getRandomQuip()), 600 + Math.random() * 800)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    sendMessage()
  }
}

const show = computed(() => game.gameStarted && !game.isTutorialMode)
</script>

<template>
  <!-- Mobile toggle -->
  <button v-if="show" class="chat-mobile-toggle" @click="panelOpen = !panelOpen">
    <Icon icon="game-icons:talk" />
  </button>

  <Transition name="chat-slide">
    <div v-if="show && panelOpen" class="chat-panel">
      <!-- Header: two participants -->
      <div class="chat-header">
        <!-- AI / Opponent side -->
        <div class="ch-participant" @click="panelOpen = false">
          <Icon :icon="isMP ? 'game-icons:horned-helmet' : aiAvatar" class="ch-avatar ch-avatar-ai" />
          <div class="ch-info">
            <span class="ch-name">{{ isMP ? (mp.opponentName.value || 'Przeciwnik') : aiName }}</span>
            <span class="ch-title">{{ isMP ? 'gracz' : aiTitle }}</span>
          </div>
        </div>

        <div class="ch-vs">⚔</div>

        <!-- Player side -->
        <div class="ch-participant ch-participant-right" @click="showProfile = !showProfile">
          <div class="ch-info ch-info-right">
            <span class="ch-name ch-name-player">{{ playerDisplayName }}</span>
            <span class="ch-title">{{ game.selectedDifficulty }}</span>
          </div>
          <Icon :icon="playerDisplayIcon" class="ch-avatar ch-avatar-player" />
        </div>

        <button class="ch-close" @click.stop="panelOpen = false">
          <Icon icon="mdi:chevron-down" />
        </button>
      </div>

      <!-- Profile editor (inline) -->
      <Transition name="profile-slide">
        <div v-if="showProfile" class="profile-editor">
          <div class="pe-row">
            <input
              v-model="profileNameInput"
              class="pe-name-input"
              placeholder="Twój nick…"
              maxlength="20"
              @keydown.enter="saveProfile"
            />
            <button class="pe-save" @click="saveProfile">
              <Icon icon="mdi:check" />
            </button>
          </div>
          <div class="pe-icons">
            <button
              v-for="icon in PLAYER_ICONS" :key="icon"
              :class="['pe-icon-btn', { active: game.playerIcon === icon }]"
              @click="selectIcon(icon)"
            >
              <Icon :icon="icon" />
            </button>
          </div>
        </div>
      </Transition>

      <!-- Messages -->
      <div ref="listRef" class="chat-messages">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['chat-msg', `msg-${msg.sender}`]"
        >
          <template v-if="msg.sender === 'ai'">
            <Icon :icon="aiAvatar" class="msg-avatar msg-avatar-ai" />
            <div class="msg-col">
              <div class="msg-bubble msg-bubble-ai">{{ msg.text }}</div>
              <span class="msg-time">{{ msg.time }}</span>
            </div>
          </template>

          <template v-else>
            <div class="msg-col msg-col-right">
              <div class="msg-bubble msg-bubble-player">{{ msg.text }}</div>
              <span class="msg-time msg-time-right">{{ msg.time }}</span>
            </div>
            <Icon :icon="playerDisplayIcon" class="msg-avatar msg-avatar-player" />
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
          v-model="inputText"
          class="chat-input"
          :placeholder="isMP ? 'Napisz do przeciwnika…' : `Napisz do ${aiName}…`"
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
.chat-mobile-toggle { display: none; }

/* ===== PANEL ===== */
.chat-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
  width: 300px;
  max-height: 380px;
  background: linear-gradient(165deg, rgba(14, 10, 20, 0.97), rgba(8, 6, 14, 0.98));
  border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.18);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(200, 168, 78, 0.06);
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
  padding: 7px 8px;
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.06), rgba(120, 40, 15, 0.04));
  border-bottom: 1px solid rgba(200, 168, 78, 0.1);
  flex-shrink: 0;
  gap: 4px;
}

.ch-participant {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background 0.15s;
  flex: 1;
  min-width: 0;
}
.ch-participant:hover { background: rgba(200, 168, 78, 0.06); }
.ch-participant-right { justify-content: flex-end; }

.ch-avatar {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.ch-avatar-ai {
  color: rgba(200, 168, 78, 0.7);
  filter: drop-shadow(0 0 3px rgba(200, 100, 30, 0.25));
}
.ch-avatar-player {
  color: rgba(100, 160, 250, 0.7);
  filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.25));
}

.ch-info { display: flex; flex-direction: column; min-width: 0; }
.ch-info-right { align-items: flex-end; }

.ch-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  color: rgba(200, 168, 78, 0.85);
  letter-spacing: 0.04em;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ch-name-player { color: rgba(140, 180, 240, 0.85); }

.ch-title {
  font-size: 9px;
  color: rgba(148, 130, 100, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ch-vs {
  font-size: 12px;
  color: rgba(200, 168, 78, 0.15);
  flex-shrink: 0;
  margin: 0 2px;
}

.ch-close {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: rgba(200, 168, 78, 0.35);
  font-size: 14px;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.ch-close:hover { color: rgba(200, 168, 78, 0.8); background: rgba(200, 168, 78, 0.08); }

/* ===== PROFILE EDITOR ===== */
.profile-editor {
  padding: 8px 10px;
  background: rgba(59, 130, 246, 0.04);
  border-bottom: 1px solid rgba(59, 130, 246, 0.1);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pe-row {
  display: flex;
  gap: 4px;
}

.pe-name-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(100, 160, 250, 0.15);
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11px;
  color: rgba(186, 210, 245, 0.9);
  outline: none;
  font-family: inherit;
}
.pe-name-input::placeholder { color: rgba(148, 160, 180, 0.3); }
.pe-name-input:focus { border-color: rgba(100, 160, 250, 0.35); }

.pe-save {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: rgba(140, 180, 240, 0.8);
  font-size: 14px;
  transition: all 0.15s;
}
.pe-save:hover { background: rgba(59, 130, 246, 0.2); color: #93bbfd; }

.pe-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.pe-icon-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  border: 1px solid rgba(100, 160, 250, 0.08);
  color: rgba(148, 160, 180, 0.5);
  font-size: 15px;
  transition: all 0.15s;
}
.pe-icon-btn:hover { color: rgba(140, 180, 240, 0.8); background: rgba(59, 130, 246, 0.08); border-color: rgba(100, 160, 250, 0.2); }
.pe-icon-btn.active {
  color: rgba(140, 180, 240, 0.95);
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.2);
}

.profile-slide-enter-active, .profile-slide-leave-active { transition: all 0.2s ease; }
.profile-slide-enter-from, .profile-slide-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }

/* ===== MESSAGES ===== */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.1) transparent;
  min-height: 0;
  max-height: 220px;
}

.chat-msg {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  animation: msg-appear 0.25s ease-out;
}
.msg-player { justify-content: flex-end; }

@keyframes msg-appear {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg-avatar {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 3px;
  opacity: 0.5;
}
.msg-avatar-ai { color: rgba(200, 168, 78, 0.6); }
.msg-avatar-player { color: rgba(100, 160, 250, 0.6); }

.msg-col { display: flex; flex-direction: column; gap: 1px; max-width: 80%; }
.msg-col-right { align-items: flex-end; }

.msg-bubble {
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.5;
  word-break: break-word;
}

.msg-bubble-ai {
  background: rgba(200, 168, 78, 0.06);
  border: 1px solid rgba(200, 168, 78, 0.1);
  color: rgba(200, 190, 170, 0.85);
  border-top-left-radius: 2px;
}

.msg-bubble-player {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.07));
  border: 1px solid rgba(59, 130, 246, 0.18);
  color: rgba(186, 210, 245, 0.9);
  border-top-right-radius: 2px;
}

.msg-time {
  font-size: 9px;
  color: rgba(148, 130, 100, 0.25);
  padding: 0 2px;
}
.msg-time-right { text-align: right; }

/* ===== SEPARATOR ===== */
.chat-sep { padding: 0 12px; flex-shrink: 0; }
.sep-svg { width: 100%; height: 6px; display: block; }

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
  padding: 7px 10px;
  font-size: 12.5px;
  color: rgba(226, 232, 240, 0.85);
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
}
.chat-input::placeholder { color: rgba(148, 130, 100, 0.3); font-style: italic; }
.chat-input:focus { border-color: rgba(200, 168, 78, 0.3); background: rgba(255, 255, 255, 0.04); }

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
.chat-send:hover:not(:disabled) { background: rgba(200, 168, 78, 0.15); color: rgba(200, 168, 78, 0.9); }
.chat-send:disabled { opacity: 0.3; cursor: default; }

/* ===== TRANSITIONS ===== */
.chat-slide-enter-active, .chat-slide-leave-active { transition: opacity 0.25s, transform 0.25s; }
.chat-slide-enter-from, .chat-slide-leave-to { opacity: 0; transform: translateY(20px) scale(0.95); }

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
    width: 250px;
    max-height: 240px;
    border-radius: 8px;
    z-index: 155;
  }
  .chat-messages { max-height: 110px; padding: 4px 6px 2px; gap: 5px; }
  .chat-header { padding: 5px 6px; }
  .ch-avatar { width: 14px; height: 14px; }
  .ch-name { font-size: 9px; }
  .ch-title { font-size: 6.5px; }
  .ch-vs { font-size: 8px; }
  .msg-bubble { font-size: 9px; padding: 4px 7px; }
  .msg-avatar { width: 12px; height: 12px; }
  .msg-time { font-size: 6.5px; }
  .chat-input { font-size: 9px; padding: 4px 6px; }
  .chat-send { width: 24px; height: 24px; font-size: 12px; }
  .chat-input-row { padding: 4px 6px 6px; }
  .pe-icon-btn { width: 24px; height: 24px; font-size: 12px; }
  .pe-name-input { font-size: 9px; }
}
</style>
