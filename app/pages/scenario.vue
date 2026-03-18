<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useScenarioStore } from '../../stores/scenarioStore'
import { useGameStore } from '../../stores/gameStore'

definePageMeta({ ssr: false })

const scenario = useScenarioStore()
const game = useGameStore()
const gameReady = ref(false)
const showLoadPrompt = ref(false)

onMounted(async () => {
  // Check for saved campaign
  if (scenario.hasSave('noc_kupaly')) {
    showLoadPrompt.value = true
  } else {
    startFresh()
  }

  // Preload WebGPU modules + minimum delay
  const minDelay = new Promise(r => setTimeout(r, 1500))
  const modules = Promise.all([
    import('three/webgpu').catch(() => {}),
    import('three/tsl').catch(() => {}),
  ])
  await Promise.all([minDelay, modules])
  gameReady.value = true
})

onUnmounted(() => {
  scenario.reset()
})

function startFresh() {
  showLoadPrompt.value = false
  scenario.startScenario('noc_kupaly')
}

function loadSaved() {
  showLoadPrompt.value = false
  if (!scenario.loadCampaign('noc_kupaly')) {
    // Load failed — start fresh
    scenario.startScenario('noc_kupaly')
  }
}

// Watch for state changes to emit on_state_change events (win condition checks, immunity)
watch(
  () => game.state,
  (newState) => {
    if (!scenario.isScenarioMode || scenario.phase !== 'combat') return
    if (!newState) return
    scenario.processGameEvent('on_state_change')
  },
)

// Theme CSS variables
const themeStyles = computed(() => {
  const theme = scenario.currentTheme
  if (!theme) return {}
  const styles: Record<string, string> = {}
  if (theme.backgroundGradient) styles['--sc-bg'] = theme.backgroundGradient
  if (theme.ambientColor) styles['--sc-ambient'] = theme.ambientColor
  if (theme.fogDensity !== undefined) styles['--sc-fog-opacity'] = String(theme.fogDensity)
  return styles
})

function goHome() {
  scenario.reset()
  navigateTo('/')
}
</script>

<template>
  <div class="scenario-page" :style="themeStyles">
    <!-- Load prompt -->
    <div v-if="showLoadPrompt" class="sc-load-prompt-overlay">
      <div class="sc-load-prompt">
        <Icon icon="game-icons:campfire" class="sc-load-icon" />
        <h2 class="sc-load-title">Zapisana kampania</h2>
        <p class="sc-load-text">Masz zapisany postep. Kontynuowac?</p>
        <div class="sc-load-btns">
          <button class="sc-btn-retry" @click="loadSaved">
            <Icon icon="game-icons:save-arrow" /> Kontynuuj
          </button>
          <button class="sc-btn-quit" @click="startFresh">
            <Icon icon="game-icons:fire" /> Nowa gra
          </button>
        </div>
      </div>
    </div>

    <!-- Narrative overlay -->
    <ScenarioNarrative
      v-if="(scenario.phase === 'narrative' || scenario.phase === 'complete') && !showLoadPrompt"
      :lines="scenario.narrative"
      @dismiss="scenario.phase === 'complete' ? goHome() : scenario.dismissNarrative()"
    />

    <!-- Mid-combat narrative interruption -->
    <ScenarioNarrative
      v-if="scenario.narrativeInterruption && scenario.phase === 'combat'"
      :lines="scenario.narrativeInterruption"
      @dismiss="scenario.dismissInterruption()"
    />

    <!-- Rewards overlay -->
    <ScenarioRewards
      v-if="scenario.phase === 'rewards'"
    />

    <!-- Encounter lost overlay -->
    <div v-if="scenario.encounterResult === 'player_lose'" class="sc-lose-overlay">
      <div class="sc-lose-box">
        <Icon icon="game-icons:skull-crossed-bones" class="sc-lose-icon" />
        <h2 class="sc-lose-title">Porazka</h2>
        <p class="sc-lose-text">Druzyna polegla. Las pochlonoł odwaznych.</p>
        <div class="sc-lose-btns">
          <button class="sc-btn-retry" @click="scenario.restartEncounter()">
            <Icon icon="game-icons:cycle" /> Sprobuj ponownie
          </button>
          <button class="sc-btn-quit" @click="goHome">
            <Icon icon="game-icons:exit-door" /> Wroc do menu
          </button>
        </div>
      </div>
    </div>

    <!-- Progress HUD -->
    <ScenarioProgress />

    <!-- Game board (combat phase) -->
    <div v-if="scenario.phase === 'combat'" class="sc-board">
      <GameBoard v-if="gameReady" />
      <div v-else class="sc-loading">
        <Icon icon="game-icons:hooded-figure" class="sc-load-icon" />
        <p>Przygotowywanie...</p>
      </div>
    </div>

    <!-- Theme ambient overlay -->
    <div v-if="scenario.currentTheme?.ambientColor" class="sc-ambient-overlay" />
    <div v-if="scenario.currentTheme?.fogDensity" class="sc-fog-overlay" />
  </div>
</template>

<style scoped>
.scenario-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--sc-bg, #04030a);
  position: relative;
}

.sc-board {
  width: 100%;
  height: 100%;
}

.sc-board :deep(.game-board) {
  height: 100%;
}

/* ===== THEME OVERLAYS ===== */
.sc-ambient-overlay {
  position: fixed;
  inset: 0;
  background: var(--sc-ambient, transparent);
  pointer-events: none;
  z-index: 1;
  mix-blend-mode: overlay;
  opacity: 0.3;
}

.sc-fog-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(4, 3, 10, 0.8) 100%);
  pointer-events: none;
  z-index: 1;
  opacity: var(--sc-fog-opacity, 0);
}

/* ===== LOADING ===== */
.sc-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: rgba(148, 130, 100, 0.4);
}

.sc-load-icon {
  font-size: 48px;
  color: rgba(200, 168, 78, 0.2);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
}

/* ===== LOAD PROMPT ===== */
.sc-load-prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 3, 10, 0.95);
}

.sc-load-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 36px 44px;
  text-align: center;
}

.sc-load-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 22px;
  font-weight: 500;
  color: rgba(200, 190, 170, 0.7);
  margin: 0;
}

.sc-load-text {
  font-size: 13px;
  color: rgba(148, 130, 100, 0.5);
  font-style: italic;
  font-family: Georgia, serif;
  margin: 0;
}

.sc-load-btns {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

/* ===== LOSE OVERLAY ===== */
.sc-lose-overlay {
  position: fixed;
  inset: 0;
  z-index: 190;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 3, 10, 0.9);
}

.sc-lose-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 40px;
  text-align: center;
}

.sc-lose-icon {
  font-size: 50px;
  color: rgba(120, 80, 60, 0.6);
  filter: drop-shadow(0 0 8px rgba(120, 40, 15, 0.3));
}

.sc-lose-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 28px;
  font-weight: 500;
  color: rgba(160, 140, 120, 0.7);
  margin: 0;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
}

.sc-lose-text {
  font-size: 13px;
  color: rgba(148, 130, 100, 0.5);
  font-style: italic;
  font-family: Georgia, serif;
  margin: 0;
}

.sc-lose-btns {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.sc-btn-retry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.3);
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.15), rgba(200, 168, 78, 0.08));
  color: rgba(200, 168, 78, 0.9);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.sc-btn-retry:hover {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.25), rgba(200, 168, 78, 0.12));
  border-color: rgba(200, 168, 78, 0.5);
}

.sc-btn-quit {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid rgba(100, 80, 60, 0.15);
  background: transparent;
  color: rgba(148, 130, 100, 0.4);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.sc-btn-quit:hover {
  color: rgba(200, 100, 80, 0.7);
  border-color: rgba(200, 100, 80, 0.2);
}
</style>
