<script setup lang="ts">
/**
 * SoulHarvestBar — Żniwo Dusz / Nawie
 * Dual progress bars showing soul accumulation toward the next PS.
 * When a creature dies, accumulated ATK+DEF fills the bar.
 * At 20 points → +1 PS, bar resets.
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { GOLD_EDITION_RULES, SLAVA_RULES } from '../../game-engine/constants'

const game = useGameStore()

const threshold = computed(() =>
  game.gameMode === 'slava'
    ? SLAVA_RULES.SOUL_HARVEST_THRESHOLD
    : GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD
)

const playerSoul = computed(() => game.playerSoulPoints)
const aiSoul = computed(() => game.aiSoulPoints)

const playerProgress = computed(() => Math.min(100, (playerSoul.value / threshold.value) * 100))
const aiProgress = computed(() => Math.min(100, (aiSoul.value / threshold.value) * 100))

// Flash animation when PS is gained
const playerFlash = ref(false)
const aiFlash = ref(false)

// Track previous PS to detect gains
const prevPlayerPS = ref(0)
const prevAiPS = ref(0)

watch(() => game.gameMode === 'slava' ? game.playerGlory : game.playerGold, (newVal) => {
  if (newVal > prevPlayerPS.value && prevPlayerPS.value > 0) {
    playerFlash.value = true
    setTimeout(() => { playerFlash.value = false }, 1200)
  }
  prevPlayerPS.value = newVal
})

watch(() => game.gameMode === 'slava' ? game.aiGlory : game.aiGold, (newVal) => {
  if (newVal > prevAiPS.value && prevAiPS.value > 0) {
    aiFlash.value = true
    setTimeout(() => { aiFlash.value = false }, 1200)
  }
  prevAiPS.value = newVal
})
</script>

<template>
  <div class="soul-bar">
    <!-- Player soul -->
    <div :class="['sb-side sb-player', { 'sb-flash': playerFlash }]">
      <Icon icon="token:songbird" class="sb-bird sb-bird-player" />
      <div class="sb-track">
        <div
          class="sb-fill sb-fill-player"
          :style="{ width: playerProgress + '%' }"
        />
        <div class="sb-ember" v-if="playerProgress > 10" :style="{ left: playerProgress + '%' }" />
      </div>
      <span class="sb-counter sb-counter-player">{{ playerSoul }}<span class="sb-threshold">/{{ threshold }}</span></span>
    </div>

    <!-- Center: soul icon -->
    <div class="sb-center">
      <Icon icon="token:songbird" class="sb-soul-icon" />
      <span class="sb-label">NAWIE</span>
    </div>

    <!-- AI soul -->
    <div :class="['sb-side sb-ai', { 'sb-flash': aiFlash }]">
      <span class="sb-counter sb-counter-ai">{{ aiSoul }}<span class="sb-threshold">/{{ threshold }}</span></span>
      <div class="sb-track">
        <div
          class="sb-fill sb-fill-ai"
          :style="{ width: aiProgress + '%' }"
        />
        <div class="sb-ember" v-if="aiProgress > 10" :style="{ right: (100 - aiProgress) + '%' }" />
      </div>
      <Icon icon="token:songbird" class="sb-bird sb-bird-ai" />
    </div>
  </div>
</template>

<style scoped>
.soul-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: rgba(10, 5, 20, 0.6);
  border: 1px solid rgba(160, 120, 255, 0.12);
  border-radius: 5px;
}

.sb-side {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  transition: filter 0.3s ease;
}

.sb-ai {
  flex-direction: row-reverse;
}

.sb-flash {
  animation: soulPulse 1.2s ease-out;
}

@keyframes soulPulse {
  0% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
  20% { filter: brightness(1.8) drop-shadow(0 0 14px rgba(180, 140, 255, 0.9)); }
  100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
}

.sb-bird {
  font-size: 15px;
  flex-shrink: 0;
  opacity: 0.7;
}

.sb-bird-player {
  color: #c4b5fd;
}

.sb-bird-ai {
  color: #fca5a5;
}

.sb-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: visible;
  position: relative;
  min-width: 36px;
}

.sb-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}

.sb-fill-player {
  background: linear-gradient(90deg, #6d28d9, #a78bfa, #c4b5fd);
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.sb-fill-ai {
  background: linear-gradient(90deg, #fca5a5, #ef4444, #b91c1c);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  float: right;
}

/* Glowing ember at the tip of the progress bar */
.sb-ember {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #e9d5ff;
  box-shadow: 0 0 6px 2px rgba(168, 139, 250, 0.7), 0 0 12px 4px rgba(139, 92, 246, 0.4);
  animation: emberGlow 1.5s ease-in-out infinite alternate;
  pointer-events: none;
}

@keyframes emberGlow {
  0% { opacity: 0.6; box-shadow: 0 0 4px 1px rgba(168, 139, 250, 0.5); }
  100% { opacity: 1; box-shadow: 0 0 8px 3px rgba(168, 139, 250, 0.9), 0 0 16px 6px rgba(139, 92, 246, 0.4); }
}

.sb-counter {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 24px;
  text-align: center;
}

.sb-counter-player {
  color: #c4b5fd;
}

.sb-counter-ai {
  color: #fca5a5;
}

.sb-threshold {
  font-size: 16px;
  font-weight: 500;
}

.sb-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  padding: 0 2px;
}

.sb-soul-icon {
  font-size: 28px;
  color: #a78bfa;
  filter: drop-shadow(0 0 6px rgba(139, 92, 246, 0.6));
  animation: soulFloat 3s ease-in-out infinite;
}

@keyframes soulFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

.sb-label {
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: rgba(168, 139, 250, 0.5);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .soul-bar {
    gap: 3px;
    padding: 2px 5px;
  }
  .sb-counter { font-size: 14px; }
  .sb-threshold { font-size: 12px; }
  .sb-soul-icon { font-size: 20px; }
  .sb-track { height: 4px; }
  .sb-bird { font-size: 11px; }
  .sb-ember { width: 5px; height: 5px; }
}
</style>
