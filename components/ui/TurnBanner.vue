<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()
const showBanner = ref(false)
const bannerText = ref('')
const bannerType = ref<'player' | 'ai' | 'season'>('player')

const seasonNames: Record<string, string> = {
  spring: '🌸 Wiosna',
  summer: '☀ Lato',
  autumn: '🍂 Jesień',
  winter: '❄ Zima',
}

// Season change announcement
watch(() => game.season, (season, prevSeason) => {
  if (!prevSeason || season === prevSeason) return
  bannerText.value = seasonNames[season] ?? season
  bannerType.value = 'season'
  showBanner.value = true
  setTimeout(() => { showBanner.value = false }, 1800)
})

// Turn change announcement
watch(() => game.currentTurn, (turn, prevTurn) => {
  if (!prevTurn || !turn) return
  // Don't show turn banner if season banner is showing
  if (showBanner.value && bannerType.value === 'season') return
  if (turn === 'player1') {
    bannerText.value = 'Twoja tura'
    bannerType.value = 'player'
  } else {
    bannerText.value = 'Tura przeciwnika'
    bannerType.value = 'ai'
  }
  showBanner.value = true
  setTimeout(() => { showBanner.value = false }, 1200)
})
</script>

<template>
  <Transition name="banner-slide">
    <div v-if="showBanner" :class="['turn-banner', `banner-${bannerType}`]" :key="bannerText">
      {{ bannerText }}
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

.banner-slide-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.banner-slide-leave-active {
  transition: all 0.4s ease-out;
}
.banner-slide-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.7);
}
.banner-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.1);
}
</style>
