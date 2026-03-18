<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useScenarioStore } from '../../stores/scenarioStore'

const scenario = useScenarioStore()

const progressText = computed(() => {
  return `${scenario.encounterIdx + 1}/${scenario.encounterCount}`
})
</script>

<template>
  <div v-if="scenario.isScenarioMode && scenario.phase === 'combat'" class="sp-bar">
    <div class="sp-left">
      <Icon icon="game-icons:compass" class="sp-icon" />
      <span class="sp-encounter">Encounter {{ progressText }}</span>
      <span class="sp-sep">—</span>
      <span class="sp-title">{{ scenario.encounterTitle }}</span>
    </div>

    <!-- Survival counter -->
    <div v-if="scenario.isSurvivalEncounter" class="sp-survival">
      <Icon icon="game-icons:hourglass" class="sp-surv-icon" />
      <span>Przetrwaj: {{ scenario.survivalRounds }} / {{ scenario.survivalTarget }} rund</span>
    </div>

    <!-- Progress dots -->
    <div class="sp-dots">
      <span
        v-for="i in scenario.encounterCount"
        :key="i"
        :class="['sp-dot', {
          'sp-dot-done': i - 1 < scenario.encounterIdx,
          'sp-dot-current': i - 1 === scenario.encounterIdx,
        }]"
      />
    </div>
  </div>
</template>

<style scoped>
.sp-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  background: linear-gradient(180deg, rgba(4, 3, 10, 0.92) 0%, rgba(4, 3, 10, 0.6) 70%, transparent 100%);
  pointer-events: none;
}

.sp-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.sp-icon {
  font-size: 14px;
  color: rgba(200, 168, 78, 0.5);
}

.sp-encounter {
  font-size: 11px;
  font-weight: 700;
  color: rgba(200, 168, 78, 0.7);
  letter-spacing: 0.06em;
}

.sp-sep {
  color: rgba(148, 130, 100, 0.2);
  font-size: 11px;
}

.sp-title {
  font-size: 12px;
  color: rgba(200, 190, 170, 0.5);
  font-style: italic;
  font-family: Georgia, serif;
}

.sp-survival {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(248, 113, 113, 0.8);
  background: rgba(248, 113, 113, 0.06);
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid rgba(248, 113, 113, 0.15);
}

.sp-surv-icon {
  font-size: 12px;
}

.sp-dots {
  display: flex;
  gap: 5px;
}

.sp-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(200, 168, 78, 0.1);
  border: 1px solid rgba(200, 168, 78, 0.15);
  transition: all 0.3s;
}

.sp-dot-done {
  background: rgba(200, 168, 78, 0.5);
  border-color: rgba(200, 168, 78, 0.6);
}

.sp-dot-current {
  background: rgba(200, 100, 30, 0.7);
  border-color: rgba(200, 100, 30, 0.8);
  box-shadow: 0 0 6px rgba(200, 100, 30, 0.4);
}

@media (max-width: 600px) {
  .sp-bar { padding: 4px 10px; gap: 8px; }
  .sp-title { display: none; }
}
</style>
