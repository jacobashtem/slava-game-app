<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
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

const btnConfig = computed(() => {
  switch (game.currentPhase) {
    case GamePhase.START:  return { label: 'DOBIERZ',  icon: 'game-icons:card-draw', type: 'next' }
    case GamePhase.DRAW:   return { label: 'DO BOJU',  icon: 'game-icons:crossed-swords', type: 'next' }
    case GamePhase.PLAY:   return skipCombat.value
      ? { label: 'KONIEC TURY', icon: 'game-icons:hourglass', type: 'end' }
      : { label: 'ATAKUJ',  icon: 'game-icons:sword-clash', type: 'combat' }
    case GamePhase.COMBAT: return { label: 'KONIEC TURY', icon: 'game-icons:hourglass', type: 'end' }
    case GamePhase.END:    return { label: 'KONIEC TURY', icon: 'game-icons:hourglass', type: 'end' }
    default:               return { label: 'DALEJ',   icon: 'game-icons:forward', type: 'next' }
  }
})
</script>

<template>
  <div class="phase-controls">
    <button
      v-if="game.currentPhase === GamePhase.PLAY && hasEnemiesOnField"
      :disabled="!game.isPlayerTurn || !!game.winner"
      class="ctrl-btn ctrl-pass"
      @click="() => { ui.clearSelection(); game.endTurn() }"
    >
      <Icon icon="game-icons:white-flag" class="btn-icon" />
      PASUJ
    </button>
    <button
      :disabled="!game.isPlayerTurn || !!game.winner"
      :class="['ctrl-btn', `ctrl-${btnConfig.type}`]"
      @click="handlePhase"
    >
      <Icon :icon="btnConfig.icon" class="btn-icon" />
      {{ btnConfig.label }}
    </button>
  </div>
</template>

<style scoped>
.phase-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 22px;
  border: 1px solid;
  border-radius: 5px;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  white-space: nowrap;
  font-family: var(--font-display, Georgia, serif);
  position: relative;
  overflow: hidden;
}

.btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.ctrl-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}

.ctrl-btn:disabled {
  opacity: 0.2;
  cursor: not-allowed;
  transform: none !important;
}

.ctrl-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.ctrl-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

/* Next phase (dobierz, do boju) */
.ctrl-next {
  color: #c4b5fd;
  background: linear-gradient(180deg, rgba(167,139,250,0.15) 0%, rgba(139,92,246,0.08) 100%);
  border-color: rgba(167,139,250,0.35);
  box-shadow: 0 2px 8px rgba(139,92,246,0.15);
}
.ctrl-next:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(167,139,250,0.25) 0%, rgba(139,92,246,0.15) 100%);
  border-color: rgba(167,139,250,0.6);
  box-shadow: 0 4px 16px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
}

/* Combat (atakuj) */
.ctrl-combat {
  color: #fbbf24;
  background: linear-gradient(180deg, rgba(251,191,36,0.15) 0%, rgba(217,119,6,0.08) 100%);
  border-color: rgba(251,191,36,0.35);
  box-shadow: 0 2px 8px rgba(251,191,36,0.15);
}
.ctrl-combat:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(251,191,36,0.25) 0%, rgba(217,119,6,0.15) 100%);
  border-color: rgba(251,191,36,0.6);
  box-shadow: 0 4px 16px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
}

/* End turn */
.ctrl-end {
  color: #86efac;
  background: linear-gradient(180deg, rgba(134,239,172,0.12) 0%, rgba(34,197,94,0.06) 100%);
  border-color: rgba(134,239,172,0.3);
  box-shadow: 0 2px 8px rgba(34,197,94,0.1);
}
.ctrl-end:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(134,239,172,0.22) 0%, rgba(34,197,94,0.12) 100%);
  border-color: rgba(134,239,172,0.5);
  box-shadow: 0 4px 16px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
}

/* Pass (PASUJ) — same size as other buttons */
.ctrl-pass {
  color: #cbd5e1;
  background: linear-gradient(180deg, rgba(148,163,184,0.18) 0%, rgba(100,116,139,0.10) 100%);
  border-color: rgba(148,163,184,0.4);
  box-shadow: 0 2px 8px rgba(100,116,139,0.2);
}
.ctrl-pass:hover:not(:disabled) {
  color: #e2e8f0;
  background: linear-gradient(180deg, rgba(148,163,184,0.28) 0%, rgba(100,116,139,0.18) 100%);
  border-color: rgba(148,163,184,0.6);
  box-shadow: 0 4px 16px rgba(100,116,139,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .phase-controls {
    gap: 3px;
  }
  .ctrl-btn {
    font-size: 9px;
    padding: 4px 8px;
    gap: 3px;
    letter-spacing: 0.06em;
  }
  .btn-icon {
    width: 12px;
    height: 12px;
  }
  .ctrl-pass {
    font-size: 8px;
    padding: 3px 6px;
  }
}
</style>
