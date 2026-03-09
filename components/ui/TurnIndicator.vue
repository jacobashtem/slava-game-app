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

const seasonInfo = computed(() => ({
  spring: { label: 'Wiosna', icon: '🌸' },
  summer: { label: 'Lato',   icon: '☀' },
  autumn: { label: 'Jesień', icon: '🍂' },
  winter: { label: 'Zima',   icon: '❄' },
}[game.season]))

// Season progress: which round within current season (1-3)
const seasonProgress = computed(() => {
  const r = game.roundNumber
  if (r <= 3) return r
  if (r <= 6) return r - 3
  if (r <= 9) return r - 6
  return Math.min(r - 9, 3) // winter goes on indefinitely, cap display at 3
})
</script>

<template>
  <div class="turn-indicator">
    <div :class="['turn-side', game.isPlayerTurn ? 'player-turn' : 'ai-turn']">
      {{ game.isPlayerTurn ? 'Twoja tura' : (game.isAIThinking ? 'Przeciwnik...' : 'Tura AI') }}
    </div>
    <div class="phase-badge">{{ phaseLabel }}</div>
    <div class="round-info">R.{{ game.roundNumber }}</div>
    <div class="season-badge" v-if="seasonInfo">
      {{ seasonInfo.icon }} {{ seasonInfo.label }}
      <span class="season-dots">
        <span v-for="i in 3" :key="i" :class="['dot', { filled: i <= seasonProgress }]" />
      </span>
    </div>
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
  font-weight: 800;
  font-size: 14px;
  padding: 3px 10px;
  border-radius: 4px;
  white-space: nowrap;
  font-family: var(--font-display, Georgia, serif);
  letter-spacing: 0.04em;
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

.season-badge {
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-display, Georgia, serif);
  color: #cbd5e1;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
  text-shadow: 0 0 6px rgba(200, 168, 78, 0.3);
}

.season-dots {
  display: flex;
  gap: 2px;
  align-items: center;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}

.dot.filled {
  background: #94a3b8;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
