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

const btnLabel = computed(() => {
  switch (game.currentPhase) {
    case GamePhase.START:   return '▶ DOBIERZ'
    case GamePhase.DRAW:    return '⚔ DO BOJU'
    case GamePhase.PLAY:    return skipCombat.value ? '⏭ ZAKOŃCZ' : '⚔ ATAKUJ'
    case GamePhase.COMBAT:  return '⏭ ZAKOŃCZ'
    case GamePhase.END:     return '⏭ ZAKOŃCZ'
    default: return '▶ DALEJ'
  }
})

const btnType = computed(() => {
  if (game.currentPhase === GamePhase.COMBAT || game.currentPhase === GamePhase.END || skipCombat.value) return 'end'
  if (game.currentPhase === GamePhase.PLAY) return 'combat'
  return 'next'
})
</script>

<template>
  <div class="phase-controls">
    <button
      v-if="game.currentPhase === GamePhase.PLAY && hasEnemiesOnField"
      :disabled="!game.isPlayerTurn || !!game.winner"
      class="ctrl-btn ctrl-pass"
      @click="() => { ui.clearSelection(); game.endTurn() }"
    >PAS</button>
    <button
      :disabled="!game.isPlayerTurn || !!game.winner"
      :class="['ctrl-btn', `ctrl-${btnType}`]"
      @click="handlePhase"
    >{{ btnLabel }}</button>
  </div>
</template>

<style scoped>
.phase-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ctrl-btn {
  padding: 6px 16px;
  border: 1px solid;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  font-family: var(--font-display, Georgia, serif);
}

.ctrl-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
  transform: none !important;
}

.ctrl-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

/* Next phase (dobierz, do boju) */
.ctrl-next {
  color: #c4b5fd;
  background: rgba(167,139,250,0.1);
  border-color: rgba(167,139,250,0.3);
}
.ctrl-next:hover:not(:disabled) {
  background: rgba(167,139,250,0.2);
  border-color: rgba(167,139,250,0.5);
}

/* Combat (atakuj) */
.ctrl-combat {
  color: #fbbf24;
  background: rgba(251,191,36,0.1);
  border-color: rgba(251,191,36,0.3);
}
.ctrl-combat:hover:not(:disabled) {
  background: rgba(251,191,36,0.2);
  border-color: rgba(251,191,36,0.5);
}

/* End turn */
.ctrl-end {
  color: #86efac;
  background: rgba(134,239,172,0.08);
  border-color: rgba(134,239,172,0.25);
}
.ctrl-end:hover:not(:disabled) {
  background: rgba(134,239,172,0.18);
  border-color: rgba(134,239,172,0.4);
}

/* Pass */
.ctrl-pass {
  color: #94a3b8;
  background: rgba(100,116,139,0.08);
  border-color: rgba(100,116,139,0.25);
  font-size: 12px;
}
.ctrl-pass:hover:not(:disabled) {
  background: rgba(100,116,139,0.18);
}
.ctrl-pass:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}
</style>
