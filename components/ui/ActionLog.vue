<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

type LogItem = { message: string; type: string }
const playerLogs = computed((): LogItem[] => (game.playerCurrentLogs ?? []) as LogItem[])
const aiLogs = computed((): LogItem[] => (game.aiCurrentLogs ?? []) as LogItem[])

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

function getConfig(type: string | undefined) {
  return typeConfig[type ?? 'default'] ?? typeConfig.default
}
function logColor(entry: LogItem | undefined): string { return getConfig(entry?.type)?.color ?? '#64748b' }
function logIcon(entry: LogItem | undefined): string { return getConfig(entry?.type)?.icon ?? 'game-icons:perspective-dice-six' }
</script>

<template>
  <div class="action-log">
    <!-- LEWA KOLUMNA: logi tury gracza -->
    <div class="log-col log-col-player">
      <span class="log-label log-label-player">TY</span>
      <TransitionGroup name="log-slide" tag="div" class="log-entries">
        <span
          v-for="(entry, i) in playerLogs"
          :key="entry.message + i"
          class="log-entry"
          :style="{ '--log-color': logColor(entry) }"
        >
          <Icon :icon="logIcon(entry)" class="log-icon" />
          <span class="log-text">{{ entry.message }}</span>
        </span>
      </TransitionGroup>
    </div>

    <div class="log-divider">᛭</div>

    <!-- PRAWA KOLUMNA: logi tury AI -->
    <div class="log-col log-col-ai">
      <TransitionGroup name="log-slide" tag="div" class="log-entries">
        <span
          v-for="(entry, i) in aiLogs"
          :key="entry.message + i"
          class="log-entry"
          :style="{ '--log-color': logColor(entry) }"
        >
          <Icon :icon="logIcon(entry)" class="log-icon" />
          <span class="log-text">{{ entry.message }}</span>
        </span>
      </TransitionGroup>
      <span class="log-label log-label-ai">AI</span>
    </div>
  </div>
</template>

<style scoped>
.action-log {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  min-width: 0;
  width: 100%;
  padding: 2px 4px;
}

.log-col {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.log-col-player { justify-content: flex-start; }
.log-col-ai     { justify-content: flex-end; }

.log-label {
  font-family: var(--font-display, Georgia, serif);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 3px;
}

.log-label-player {
  color: #86efac;
  background: rgba(134,239,172,0.1);
  border: 1px solid rgba(134,239,172,0.2);
  text-shadow: 0 0 6px rgba(134,239,172,0.3);
}

.log-label-ai {
  color: #fca5a5;
  background: rgba(252,165,165,0.1);
  border: 1px solid rgba(252,165,165,0.2);
  text-shadow: 0 0 6px rgba(252,165,165,0.3);
}

.log-divider {
  font-size: 10px;
  color: rgba(200, 168, 78, 0.25);
  flex-shrink: 0;
  line-height: 1;
}

.log-entries {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
  overflow: hidden;
  position: relative;
}

.log-col-ai .log-entries {
  flex-direction: row-reverse;
}

.log-entry {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  color: var(--log-color, #94a3b8);
  background: color-mix(in srgb, var(--log-color, #94a3b8) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--log-color, #94a3b8) 18%, transparent);
}

.log-icon {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  opacity: 0.8;
}

.log-text {
  line-height: 1.3;
}

.log-slide-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.log-slide-enter-from   { opacity: 0; transform: translateY(-8px) scale(0.9); }
.log-slide-leave-active { transition: all 0.2s ease; position: absolute; }
.log-slide-leave-to     { opacity: 0; transform: translateX(-10px); }

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .action-log {
    display: none;
  }
}
</style>
