<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()
const showBanner = ref(false)
const bannerText = ref('')
const bannerSubText = ref('')
const bannerType = ref<'player' | 'ai' | 'season' | 'plunder'>('player')
let bannerTimer: ReturnType<typeof setTimeout> | null = null

function showFor(text: string, type: 'player' | 'ai' | 'season' | 'plunder', duration: number, sub = '') {
  if (bannerTimer) clearTimeout(bannerTimer)
  bannerText.value = text
  bannerSubText.value = sub
  bannerType.value = type
  showBanner.value = true
  bannerTimer = setTimeout(() => { showBanner.value = false; bannerTimer = null }, duration)
}

onUnmounted(() => { if (bannerTimer) clearTimeout(bannerTimer) })

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

// Turn change announcement
watch(() => game.currentTurn, (turn, prevTurn) => {
  if (!prevTurn || !turn) return
  if (showBanner.value && bannerType.value === 'season') return
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

.banner-player {
  color: #86efac;
  background: rgba(34, 197, 94, 0.15);
  border: 2px solid rgba(34, 197, 94, 0.4);
  box-shadow: 0 0 40px rgba(34, 197, 94, 0.2);
}

.banner-ai {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
  border: 2px solid rgba(239, 68, 68, 0.4);
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.2);
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

.banner-sub {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.06em;
  opacity: 0.8;
  margin-top: 4px;
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
