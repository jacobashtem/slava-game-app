<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

// Panel open/closed state (desktop: minimized toggle, mobile: hidden by default)
const panelOpen = ref(true)

// Last 12 entries from unified action log
const entries = computed(() => {
  const log = game.actionLog ?? []
  return log.slice(-12)
})

const show = computed(() => entries.value.length > 0 && game.gameStarted)

// Auto-scroll to bottom
const listRef = ref<HTMLElement | null>(null)
watch(entries, () => {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
})

const typeConfig: Record<string, { icon: string; color: string }> = {
  attack:  { icon: 'game-icons:crossed-swords', color: '#fb923c' },
  combat:  { icon: 'game-icons:sword-clash',    color: '#fb923c' },
  death:   { icon: 'game-icons:skull-crossed-bones', color: '#ef4444' },
  play:    { icon: 'game-icons:card-play',       color: '#4ade80' },
  phase:   { icon: 'game-icons:hourglass',       color: '#a78bfa' },
  system:  { icon: 'game-icons:scroll-unfurled', color: '#fbbf24' },
  effect:  { icon: 'game-icons:magic-swirl',     color: '#c084fc' },
  draw:    { icon: 'game-icons:card-draw',       color: '#60a5fa' },
  default: { icon: 'game-icons:perspective-dice-six', color: '#64748b' },
}

function cfg(type: string) {
  return typeConfig[type] ?? typeConfig.default
}
</script>

<template>
  <!-- Mobile: small toggle button only -->
  <button v-if="show" class="log-mobile-toggle" @click="panelOpen = !panelOpen">
    <Icon icon="game-icons:scroll-unfurled" />
  </button>

  <Transition name="log-slide">
    <div v-if="show && panelOpen" class="log-panel">
      <div class="log-header" @click="panelOpen = false">
        <Icon icon="game-icons:scroll-unfurled" class="log-header-icon" />
        <span class="log-title">Dziennik</span>
        <span class="log-toggle">✕</span>
      </div>
      <ul ref="listRef" class="log-list">
        <li
          v-for="(entry, i) in entries"
          :key="entry.message + i"
          class="log-row"
          :style="{ '--lc': cfg(entry.type).color }"
        >
          <Icon :icon="cfg(entry.type).icon" class="log-icon" />
          <span class="log-text">{{ entry.message }}</span>
        </li>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
/* Mobile toggle button — hidden on desktop, visible on mobile */
.log-mobile-toggle {
  display: none;
}

.log-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
  width: 260px;
  max-height: 260px;
  background: rgba(12, 18, 32, 0.95);
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.25);
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  z-index: 150;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(6px);
}

.log-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px 4px;
  background: rgba(200, 168, 78, 0.08);
  border-bottom: 1px solid rgba(200, 168, 78, 0.12);
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}
.log-header:hover {
  background: rgba(200, 168, 78, 0.14);
}
.log-header-icon {
  width: 12px;
  height: 12px;
  color: rgba(200, 168, 78, 0.6);
}
.log-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(200, 168, 78, 0.7);
  flex: 1;
}
.log-toggle {
  font-size: 10px;
  color: rgba(200, 168, 78, 0.4);
  line-height: 1;
}

.log-list {
  list-style: none;
  margin: 0;
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(200,168,78,0.15) transparent;
}

.log-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--lc, #94a3b8);
  padding: 2px 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--lc, #94a3b8) 6%, transparent);
}

.log-icon {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.7;
}

.log-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

/* Transitions */
.log-slide-enter-active,
.log-slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.log-slide-enter-from,
.log-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  /* On mobile: panel hidden by default, toggle button visible */
  .log-mobile-toggle {
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

  .log-panel {
    position: fixed;
    top: 62px;
    left: 4px;
    bottom: auto;
    right: auto;
    width: 220px;
    max-height: 150px;
    border-radius: 6px;
    z-index: 155;
  }
  .log-header { padding: 3px 6px 2px; }
  .log-title { font-size: 8px; }
  .log-header-icon { width: 9px; height: 9px; }
  .log-toggle { font-size: 8px; }
  .log-list { padding: 2px 4px; gap: 1px; }
  .log-row { font-size: 8px; padding: 1px 3px; }
  .log-icon { width: 8px; height: 8px; }
}
</style>
