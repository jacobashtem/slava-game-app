<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

// Pokaż podsumowanie tury gracza gdy jest gotowe
const showPlayer = computed(() => game.playerTurnSummary.length > 0)
// Pokaż podsumowanie AI gdy skończyło myśleć
const showAI = computed(() => game.aiTurnSummary.length > 0 && !game.isAIThinking)
</script>

<template>
  <!-- Podsumowanie tury GRACZA -->
  <Transition name="summary-slide">
    <div v-if="showPlayer" class="summary-panel player-panel">
      <div class="summary-header player-header">
        <span class="summary-title">Twoja tura — aktywne zdolności</span>
        <button class="summary-close" @click="game.dismissPlayerSummary()">✕</button>
      </div>
      <ul class="summary-list">
        <li v-for="(entry, i) in game.playerTurnSummary" :key="i" class="summary-entry player-entry">
          {{ entry }}
        </li>
      </ul>
      <button class="summary-ok player-ok" @click="game.dismissPlayerSummary()">OK</button>
    </div>
  </Transition>

  <!-- Podsumowanie tury AI -->
  <Transition name="summary-slide">
    <div v-if="showAI && !showPlayer" class="summary-panel ai-panel">
      <div class="summary-header">
        <span class="summary-title">Tura przeciwnika — podsumowanie</span>
        <button class="summary-close" @click="game.dismissAISummary()">✕</button>
      </div>
      <ul class="summary-list">
        <li v-for="(entry, i) in game.aiTurnSummary" :key="i" class="summary-entry">
          {{ entry }}
        </li>
      </ul>
      <button class="summary-ok" @click="game.dismissAISummary()">OK</button>
    </div>
  </Transition>
</template>

<style scoped>
.summary-panel {
  position: fixed;
  bottom: 160px;
  right: 16px;
  width: 280px;
  max-height: calc(100vh - 200px);
  background: #0c1220;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  z-index: 200;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-panel {
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.player-panel {
  border: 1px solid rgba(52, 211, 153, 0.4);
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  background: rgba(99, 102, 241, 0.1);
  border-bottom: 1px solid rgba(99, 102, 241, 0.2);
}

.summary-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #818cf8;
}

.player-header .summary-title {
  color: #34d399;
}

.player-entry::before {
  color: #34d399 !important;
}

.summary-close {
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  line-height: 1;
}

.summary-close:hover {
  color: #94a3b8;
}

.summary-list {
  list-style: none;
  padding: 6px 12px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.summary-entry {
  font-size: 10px;
  color: #cbd5e1;
  line-height: 1.5;
  padding-left: 10px;
  position: relative;
}

.summary-entry::before {
  content: '›';
  position: absolute;
  left: 0;
  color: #6366f1;
}

.summary-ok {
  display: block;
  width: calc(100% - 24px);
  margin: 6px 12px 10px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 4px;
  color: #818cf8;
  font-size: 11px;
  font-weight: 600;
  padding: 5px;
  cursor: pointer;
  transition: background 0.15s;
}

.summary-ok:hover {
  background: rgba(99, 102, 241, 0.3);
}

.player-ok {
  background: rgba(52, 211, 153, 0.1);
  border-color: rgba(52, 211, 153, 0.4);
  color: #34d399;
}
.player-ok:hover {
  background: rgba(52, 211, 153, 0.25);
}

.summary-slide-enter-active,
.summary-slide-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.summary-slide-enter-from,
.summary-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .summary-panel {
    bottom: auto;
    top: 50%;
    left: 50%;
    right: auto;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-height: 60vh;
  }
}
</style>
