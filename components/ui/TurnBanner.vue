<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/gameStore'

import { useUIStore } from '../../stores/uiStore'

const game = useGameStore()
const ui = useUIStore()
const showBanner = ref(false)
const bannerText = ref('')
const bannerSubText = ref('')
const bannerType = ref<'player' | 'ai' | 'season' | 'plunder' | 'timeout'>('player')
let bannerTimer: ReturnType<typeof setTimeout> | null = null
const bannerQueue: Array<{ text: string; type: typeof bannerType.value; duration: number; sub?: string }> = []
let _processingQueue = false

function showFor(text: string, type: typeof bannerType.value, duration: number, sub = '') {
  if (bannerTimer) clearTimeout(bannerTimer)
  bannerText.value = text
  bannerSubText.value = sub
  bannerType.value = type
  showBanner.value = true
  bannerTimer = setTimeout(() => {
    showBanner.value = false
    bannerTimer = null
    processQueue()
  }, duration)
}

function queueBanner(text: string, type: typeof bannerType.value, duration: number, sub = '') {
  bannerQueue.push({ text, type, duration, sub })
  if (!_processingQueue) processQueue()
}

function processQueue() {
  if (bannerQueue.length === 0) { _processingQueue = false; return }
  _processingQueue = true
  const next = bannerQueue.shift()!
  // Small delay between banners for smooth transition
  setTimeout(() => showFor(next.text, next.type, next.duration, next.sub), 300)
}

onUnmounted(() => {
  if (bannerTimer) clearTimeout(bannerTimer)
  bannerQueue.length = 0
})

const seasonNames: Record<string, string> = {
  spring: '🌸 Wiosna',
  summer: '☀ Lato',
  autumn: '🍂 Jesień',
  winter: '❄ Zima',
}

// Season change announcement
watch(() => game.season, (season, prevSeason) => {
  if (!prevSeason || season === prevSeason) return
  showFor(seasonNames[season] ?? season, 'season', 1800)
})

// Timeout banner — detect glory loss from timeout in actionLog
let _lastTimeoutLogLen = 0
watch(() => game.state?.actionLog.length ?? 0, (newLen) => {
  if (newLen <= _lastTimeoutLogLen) { _lastTimeoutLogLen = newLen; return }
  const log = game.state?.actionLog ?? []
  const newEntries = log.slice(_lastTimeoutLogLen)
  _lastTimeoutLogLen = newLen
  for (const entry of newEntries) {
    if (entry.type === 'glory' && entry.message.includes('CZAS MINĄŁ')) {
      // Show timeout banner, then queue the normal turn banner
      showFor('Czas minął!', 'timeout', 2200, 'Tracisz punkt sławy')
      queueBanner('Tura przeciwnika', 'ai', 1200)
      return // skip normal turn announcement for this cycle
    }
  }
})

// Turn change announcement
watch(() => game.currentTurn, (turn, prevTurn) => {
  if (!prevTurn || !turn) return
  if (showBanner.value && (bannerType.value === 'season' || bannerType.value === 'timeout')) return
  showFor(turn === 'player1' ? 'Twoja tura' : 'Tura przeciwnika', turn === 'player1' ? 'player' : 'ai', 1200)
})

// Plunder banner — detect plunder in actionLog
let _lastPlunderLogLen = 0
watch(() => game.state?.actionLog.length ?? 0, (newLen) => {
  if (newLen <= _lastPlunderLogLen) { _lastPlunderLogLen = newLen; return }
  const log = game.state?.actionLog ?? []
  const newEntries = log.slice(_lastPlunderLogLen)
  _lastPlunderLogLen = newLen
  for (const entry of newEntries) {
    if ((entry.type === 'glory' || entry.type === 'gold') && entry.message.includes('ŁUPIENIE')) {
      const isAI = entry.message.startsWith('AI')
      const isSlava = entry.type === 'glory'
      const currency = 'Punkt Sławy'
      if (isAI) {
        showFor('Zostałeś złupiony!', 'plunder', 2200, `Straciłeś ${currency}`)
      } else {
        showFor('Złupiłeś wroga!', 'plunder', 1800, `+1 ${currency}`)
      }
    }
  }
})
</script>

<template>
  <Transition name="banner-slide">
    <div v-if="showBanner" :class="['turn-banner', `banner-${bannerType}`]" :key="bannerText">
      <div class="banner-light-sweep" />
      <div>{{ bannerText }}</div>
      <div v-if="bannerSubText" class="banner-sub">{{ bannerSubText }}</div>
    </div>
  </Transition>
</template>

<style scoped>
.turn-banner {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 150;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 14px 48px;
  border-radius: 8px;
  pointer-events: none;
  white-space: nowrap;
  text-shadow: 0 2px 12px rgba(0,0,0,0.8);
}
/* Expanding shockwave ring behind banner */
.turn-banner::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 120px;
  height: 120px;
  transform: translate(-50%, -50%) scale(0.5);
  border-radius: 50%;
  border: 2px solid currentColor;
  opacity: 0;
  animation: shockwave 0.8s ease-out forwards;
  pointer-events: none;
}
@keyframes shockwave {
  0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0.6; border-width: 3px; }
  100% { transform: translate(-50%, -50%) scale(6); opacity: 0; border-width: 1px; }
}

.banner-player {
  color: #86efac;
  background: rgba(34, 197, 94, 0.15);
  border: 2px solid rgba(34, 197, 94, 0.4);
  box-shadow: 0 0 40px rgba(34, 197, 94, 0.2);
  animation: banner-glow-green 1.2s ease-out;
}
@keyframes banner-glow-green {
  0%   { box-shadow: 0 0 80px rgba(34, 197, 94, 0.5), 0 0 120px rgba(34, 197, 94, 0.2); }
  100% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.2); }
}

.banner-ai {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
  border: 2px solid rgba(239, 68, 68, 0.4);
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.2);
  animation: banner-glow-red 1.2s ease-out;
}
@keyframes banner-glow-red {
  0%   { box-shadow: 0 0 80px rgba(239, 68, 68, 0.5), 0 0 120px rgba(239, 68, 68, 0.2); }
  100% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.2); }
}

.banner-season {
  color: #fde68a;
  background: rgba(251, 191, 36, 0.15);
  border: 2px solid rgba(251, 191, 36, 0.4);
  box-shadow: 0 0 50px rgba(251, 191, 36, 0.25);
  font-size: 32px;
}

.banner-plunder {
  color: #f97316;
  background: rgba(249, 115, 22, 0.18);
  border: 2px solid rgba(249, 115, 22, 0.5);
  box-shadow: 0 0 50px rgba(249, 115, 22, 0.3);
  text-align: center;
}

.banner-timeout {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.2);
  border: 2px solid rgba(239, 68, 68, 0.5);
  box-shadow: 0 0 60px rgba(239, 68, 68, 0.35);
  text-align: center;
}

.banner-sub {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.06em;
  opacity: 0.8;
  margin-top: 4px;
}

/* Horizontal light sweep across banner */
.banner-light-sweep {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}
.banner-light-sweep::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 255, 255, 0.15) 40%,
    rgba(255, 255, 255, 0.25) 50%,
    rgba(255, 255, 255, 0.15) 60%,
    transparent);
  animation: light-sweep 0.6s ease-out 0.15s forwards;
}
@keyframes light-sweep {
  0%   { left: -60%; }
  100% { left: 120%; }
}

.banner-slide-enter-active {
  transition: opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.banner-slide-leave-active {
  transition: opacity 0.4s ease-out, transform 0.4s ease-out;
}
.banner-slide-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.7);
}
.banner-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.1);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .turn-banner {
    font-size: 18px;
    padding: 10px 28px;
    letter-spacing: 0.06em;
  }
}
</style>
