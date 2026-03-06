<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { GamePhase } from '../../game-engine/constants'

const game = useGameStore()

const phaseLabel = computed(() => ({
  [GamePhase.START]:  'Start',
  [GamePhase.DRAW]:   'Dobierz',
  [GamePhase.PLAY]:   'Wystawiaj',
  [GamePhase.COMBAT]: 'Walka',
  [GamePhase.END]:    'Koniec',
}[game.currentPhase] ?? game.currentPhase))
</script>

<template>
  <div class="turn-indicator">
    <div :class="['turn-side', game.isPlayerTurn ? 'player-turn' : 'ai-turn']">
      {{ game.isPlayerTurn ? 'Twoja tura' : (game.isAIThinking ? 'Przeciwnik...' : 'Tura AI') }}
    </div>
    <div class="phase-badge">{{ phaseLabel }}</div>
    <div class="round-info">R.{{ game.roundNumber }}</div>
  </div>
</template>

<style scoped>
.turn-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.turn-side {
  font-weight: 700;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.player-turn {
  color: #86efac;
  background: rgba(134, 239, 172, 0.12);
  border: 1px solid rgba(134, 239, 172, 0.25);
}

.ai-turn {
  color: #fca5a5;
  background: rgba(252, 165, 165, 0.12);
  border: 1px solid rgba(252, 165, 165, 0.25);
  animation: blink 1.2s ease infinite;
}

.phase-badge {
  color: #a78bfa;
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(167, 139, 250, 0.1);
  border-radius: 3px;
  white-space: nowrap;
}

.round-info {
  color: var(--text-muted);
  font-size: 10px;
  font-family: monospace;
  white-space: nowrap;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
