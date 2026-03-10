<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { SLAVA_RULES, SEASON_NAMES } from '../../game-engine/constants'

const game = useGameStore()

const playerGlory = computed(() => game.playerGlory)
const aiGlory = computed(() => game.aiGlory)
const target = SLAVA_RULES.GLORY_TARGET

const playerProgress = computed(() => Math.min(100, (playerGlory.value / target) * 100))
const aiProgress = computed(() => Math.min(100, (aiGlory.value / target) * 100))

const seasonInfo = computed(() => {
  const slava = game.slavaData
  if (!slava) return null
  const seasonNames = ['Zima', 'Wiosna', 'Lato', 'Jesień']
  const seasonIcons = ['❄', '🌸', '☀', '🍂']
  return {
    name: seasonNames[slava.currentSeason] ?? 'Zima',
    icon: seasonIcons[slava.currentSeason] ?? '❄',
    round: slava.seasonRound,
    maxRounds: 4,
  }
})

const holiday = computed(() => {
  const slava = game.slavaData
  if (!slava?.holiday) return null
  return {
    name: slava.holiday.name,
    reward: slava.holiday.reward,
    playerDone: slava.holiday.completed.player1,
    aiDone: slava.holiday.completed.player2,
  }
})
</script>

<template>
  <div class="glory-bar" v-if="game.gameMode === 'slava'">
    <!-- Player Glory -->
    <div class="gb-side gb-player">
      <span class="gb-label">TY</span>
      <div class="gb-track">
        <div class="gb-fill gb-fill-player" :style="{ width: playerProgress + '%' }" />
      </div>
      <span class="gb-value gb-val-player">{{ playerGlory }}<span class="gb-target">/{{ target }}</span></span>
    </div>

    <!-- Center: Season + Glory Icon -->
    <div class="gb-center">
      <Icon icon="game-icons:laurel-crown" class="gb-icon" />
      <span class="gb-ps-label">PS</span>
    </div>

    <!-- AI Glory -->
    <div class="gb-side gb-ai">
      <span class="gb-value gb-val-ai">{{ aiGlory }}<span class="gb-target">/{{ target }}</span></span>
      <div class="gb-track">
        <div class="gb-fill gb-fill-ai" :style="{ width: aiProgress + '%' }" />
      </div>
      <span class="gb-label">AI</span>
    </div>

    <!-- Season badge -->
    <div class="gb-season" v-if="seasonInfo">
      <span class="gb-season-icon">{{ seasonInfo.icon }}</span>
      <span class="gb-season-name">{{ seasonInfo.name }}</span>
      <span class="gb-season-round">{{ seasonInfo.round }}/{{ seasonInfo.maxRounds }}</span>
    </div>

    <!-- Holiday badge -->
    <div class="gb-holiday" v-if="holiday && !holiday.playerDone">
      <Icon icon="game-icons:party-popper" class="gb-holiday-icon" />
      <span class="gb-holiday-name">{{ holiday.name }}</span>
      <span class="gb-holiday-reward">+{{ holiday.reward }} PS</span>
    </div>
    <div class="gb-holiday gb-holiday-done" v-else-if="holiday && holiday.playerDone">
      <Icon icon="game-icons:check-mark" class="gb-holiday-icon" />
      <span class="gb-holiday-name">{{ holiday.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.glory-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(200, 168, 78, 0.15);
  border-radius: 6px;
  /* backdrop-filter removed for perf */
  flex-wrap: wrap;
}

.gb-side {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.gb-ai {
  flex-direction: row-reverse;
}

.gb-label {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: rgba(148, 163, 184, 0.5);
  flex-shrink: 0;
}

.gb-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}

.gb-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;
}

.gb-fill-player {
  background: linear-gradient(90deg, #22c55e, #86efac);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.gb-fill-ai {
  background: linear-gradient(90deg, #ef4444, #fca5a5);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
  float: right;
}

.gb-value {
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 500;
  flex-shrink: 0;
}

.gb-val-player { color: #86efac; }
.gb-val-ai { color: #fca5a5; }

.gb-target {
  font-size: 9px;
  font-weight: 400;
  color: rgba(148, 163, 184, 0.4);
}

.gb-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

.gb-icon {
  font-size: 18px;
  color: #c8a84e;
  filter: drop-shadow(0 0 4px rgba(200, 168, 78, 0.4));
}

.gb-ps-label {
  font-size: 7px;
  font-weight: 800;
  color: rgba(200, 168, 78, 0.6);
  letter-spacing: 0.15em;
}

/* Season */
.gb-season {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  flex-shrink: 0;
}

.gb-season-icon { font-size: 11px; }
.gb-season-name {
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-display, Georgia, serif);
  color: #cbd5e1;
}
.gb-season-round {
  font-size: 9px;
  color: rgba(148, 163, 184, 0.5);
  font-family: monospace;
}

/* Holiday */
.gb-holiday {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: rgba(251, 191, 36, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.15);
  border-radius: 4px;
  flex-shrink: 0;
}

.gb-holiday-icon { font-size: 10px; color: #fbbf24; }
.gb-holiday-name {
  font-size: 9px;
  font-weight: 700;
  color: #fbbf24;
}
.gb-holiday-reward {
  font-size: 9px;
  font-weight: 800;
  color: #86efac;
}

.gb-holiday-done {
  background: rgba(34, 197, 94, 0.06);
  border-color: rgba(34, 197, 94, 0.15);
}
.gb-holiday-done .gb-holiday-icon { color: #22c55e; }
.gb-holiday-done .gb-holiday-name { color: #86efac; text-decoration: line-through; }

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .glory-bar {
    gap: 4px;
    padding: 3px 6px;
    flex-wrap: nowrap;
  }
  .gb-value { font-size: 11px; }
  .gb-icon { font-size: 14px; }
  .gb-track { height: 4px; }
  .gb-season, .gb-holiday { display: none; }
}
</style>
