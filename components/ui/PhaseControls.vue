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
  const oppSide = game.mySide === 'player1' ? 'player2' : 'player1'
  return getAllCreaturesOnField(game.state, oppSide).length > 0
})

const skipCombat = computed(() =>
  game.currentPhase === GamePhase.PLAY && !hasEnemiesOnField.value
)

const canPlunder = computed(() => {
  if (!game.state) return false
  const s = game.state
  if (s.roundNumber < 3 || hasEnemiesOnField.value || !game.isPlayerTurn) return false
  if (s.currentPhase !== GamePhase.PLAY && s.currentPhase !== GamePhase.COMBAT) return false
  const enemyCurrency = s.gameMode === 'slava' ? s.players.player2.glory : s.players.player2.gold
  return (enemyCurrency ?? 0) > 0
})

const plunderLabel = computed(() => 'ZŁUP (1 PS)')

function handlePhase() {
  ui.clearSelection()

  // ZŁUP: zamiast normalnej fazy combat — łup i kończ turę
  if (canPlunder.value && (game.currentPhase === GamePhase.PLAY || game.currentPhase === GamePhase.COMBAT)) {
    game.plunder()
    game.endTurn()
    return
  }

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
    case GamePhase.DRAW:   return { label: 'DO BOJU',  icon: 'game-icons:battle-axe', type: 'next' }
    case GamePhase.PLAY:
      if (canPlunder.value) return { label: plunderLabel.value,  icon: 'game-icons:treasure-map', type: 'plunder' }
      return skipCombat.value
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
      <Icon icon="mdi:hand-back-left" class="btn-icon" />
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
  gap: 8px;
  padding: 10px 24px;
  border: 1px solid;
  border-radius: 5px;
  font-size: 19px;
  font-weight: 600;
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
  width: 22px;
  height: 22px;
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

/* Plunder (złup) */
.ctrl-plunder {
  color: #f97316;
  background: linear-gradient(180deg, rgba(249,115,22,0.15) 0%, rgba(234,88,12,0.08) 100%);
  border-color: rgba(249,115,22,0.35);
  box-shadow: 0 2px 8px rgba(249,115,22,0.15);
}
.ctrl-plunder:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(249,115,22,0.25) 0%, rgba(234,88,12,0.15) 100%);
  border-color: rgba(249,115,22,0.6);
  box-shadow: 0 4px 16px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
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
    gap: 4px;
  }
  .ctrl-btn {
    font-size: 11px;
    padding: 8px 14px;
    gap: 5px;
    letter-spacing: 0.06em;
    border-radius: 6px;
    /* Ensure minimum touch target 44px (Apple HIG) */
    min-height: 36px;
    -webkit-tap-highlight-color: transparent;
  }
  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.95);
    transition: transform 0.08s ease;
  }
  .btn-icon {
    width: 14px;
    height: 14px;
  }
  .ctrl-pass {
    font-size: 10px;
    padding: 8px 12px;
  }
}
</style>
