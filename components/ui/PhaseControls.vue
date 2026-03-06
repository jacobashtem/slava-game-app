<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { GamePhase } from '../../game-engine/constants'
import { getAllCreaturesOnField } from '../../game-engine/LineManager'

const game = useGameStore()
const ui = useUIStore()

const hasEnemiesOnField = computed(() => {
  if (!game.state) return false
  return getAllCreaturesOnField(game.state, 'player2').length > 0
})

// W PLAY phase: jeśli brak wrogów → od razu "Zakończ turę"
const skipCombat = computed(() =>
  game.currentPhase === GamePhase.PLAY && !hasEnemiesOnField.value
)

function handlePhase() {
  ui.clearSelection()
  if (
    game.currentPhase === GamePhase.END ||
    game.currentPhase === GamePhase.COMBAT ||
    skipCombat.value
  ) {
    game.endTurn()
  } else {
    game.advancePhase()
  }
}

function phaseButtonLabel() {
  switch (game.currentPhase) {
    case GamePhase.START:   return 'Dobierz →'
    case GamePhase.DRAW:    return 'Wystawiaj →'
    case GamePhase.PLAY:    return skipCombat.value ? 'Zakończ turę' : 'Atakuj →'
    case GamePhase.COMBAT:  return 'Zakończ turę'
    case GamePhase.END:     return 'Zakończ turę'
    default: return 'Dalej →'
  }
}
</script>

<template>
  <div class="phase-controls">
    <button
      v-if="game.currentPhase === GamePhase.PLAY && hasEnemiesOnField"
      :disabled="!game.isPlayerTurn || !!game.winner"
      class="pass-btn"
      @click="() => { ui.clearSelection(); game.endTurn() }"
    >
      Pas
    </button>
    <button
      :disabled="!game.isPlayerTurn || !!game.winner"
      class="phase-btn"
      @click="handlePhase"
    >
      {{ phaseButtonLabel() }}
    </button>
  </div>
</template>

<style scoped>
.phase-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.phase-btn {
  padding: 5px 14px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
  border-radius: 5px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  white-space: nowrap;
}

.phase-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.pass-btn {
  padding: 5px 10px;
  background: rgba(100,116,139,0.1);
  border: 1px solid rgba(100,116,139,0.35);
  border-radius: 5px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.pass-btn:hover:not(:disabled) { background: rgba(100,116,139,0.22); }
.pass-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.phase-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}
</style>
