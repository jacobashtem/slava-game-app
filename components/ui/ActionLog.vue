<script setup lang="ts">
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

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
    <!-- LEWA KOLUMNA: logi tury gracza -->
    <div class="log-col log-col-player">
      <span class="log-label log-label-player">TY</span>
      <TransitionGroup name="log-slide" tag="div" class="log-entries">
        <span
          v-for="(entry, i) in game.playerCurrentLogs"
          :key="entry.message + i"
          :class="['log-entry', entryClass(entry.type)]"
        >
          {{ entry.message }}
        </span>
      </TransitionGroup>
    </div>

    <div class="log-divider" />

    <!-- PRAWA KOLUMNA: logi tury AI -->
    <div class="log-col log-col-ai">
      <span class="log-label log-label-ai">AI</span>
      <TransitionGroup name="log-slide" tag="div" class="log-entries">
        <span
          v-for="(entry, i) in game.aiCurrentLogs"
          :key="entry.message + i"
          :class="['log-entry', entryClass(entry.type)]"
        >
          {{ entry.message }}
        </span>
      </TransitionGroup>
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
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 3px;
  opacity: 0.7;
}

.log-label-player {
  color: #86efac;
  background: rgba(134,239,172,0.08);
  border: 1px solid rgba(134,239,172,0.15);
}

.log-label-ai {
  color: #818cf8;
  background: rgba(129,140,248,0.08);
  border: 1px solid rgba(129,140,248,0.15);
}

.log-divider {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.log-entries {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: nowrap;
  overflow: hidden;
  position: relative;
}

.log-col-ai .log-entries {
  flex-direction: row-reverse;
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
.log-slide-enter-from   { opacity: 0; transform: translateY(-6px); }
.log-slide-leave-active { transition: all 0.2s ease; position: absolute; }
.log-slide-leave-to     { opacity: 0; }
</style>
