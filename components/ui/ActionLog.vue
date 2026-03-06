<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

// Ostatnie 5 wpisów do paska
const recentLog = computed(() => {
  const log = game.actionLog
  return log.slice(-5)
})

function entryClass(type: string) {
  if (type === 'attack' || type === 'combat') return 'log-attack'
  if (type === 'death') return 'log-death'
  if (type === 'play') return 'log-play'
  if (type === 'phase') return 'log-phase'
  if (type === 'system') return 'log-system'
  return 'log-default'
}
</script>

<template>
  <div class="action-log">
    <TransitionGroup name="log-slide" tag="div" class="log-entries">
      <span
        v-for="(entry, i) in recentLog"
        :key="entry.message + i"
        :class="['log-entry', entryClass(entry.type)]"
      >
        {{ entry.message }}
      </span>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.action-log {
  overflow: hidden;
  min-width: 0;
}

.log-entries {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: nowrap;
  overflow: hidden;
}

.log-entry {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 3px;
  white-space: nowrap;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}

.log-attack { color: #fca5a5; }
.log-death  { color: #f87171; }
.log-play   { color: #86efac; }
.log-phase  { color: #a78bfa; font-weight: 600; }
.log-system { color: #fbbf24; }
.log-default { color: #94a3b8; }

.log-slide-enter-active { transition: all 0.25s ease; }
.log-slide-enter-from   { opacity: 0; transform: translateY(-8px); }
.log-slide-leave-active { transition: all 0.2s ease; position: absolute; }
.log-slide-leave-to     { opacity: 0; }
</style>
