<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { useArenaStore } from '../../stores/arenaStore'

const game = useGameStore()
const ui = useUIStore()
const arena = useArenaStore()

function restart() {
  ui.clearSelection()
  ui.showGameOver = false
  if (game.isArenaMode) {
    arena.reset()
  } else {
    game.startGame()
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="game.winner" class="modal-overlay">
      <div class="modal-box">
        <div :class="['result-icon', game.winner === 'player1' ? 'win' : 'lose']">
          <Icon :icon="game.winner === 'player1' ? 'game-icons:laurel-crown' : 'game-icons:skull-crossed-bones'" />
        </div>
        <h2 :class="game.winner === 'player1' ? 'win-text' : 'lose-text'">
          {{ game.winner === 'player1' ? 'Zwycięstwo!' : 'Porażka' }}
        </h2>
        <p class="result-sub">
          {{ game.winner === 'player1' ? 'Chwała bohaterowi Słowian!' : 'Wróg okazał się silniejszy tym razem...' }}
        </p>
        <p class="round-info">Runda {{ game.roundNumber }}</p>
        <button class="restart-btn" @click="restart">
          <Icon icon="game-icons:cycle" />
          {{ game.isArenaMode ? 'Resetuj Arenę' : 'Zagraj ponownie' }}
        </button>
        <NuxtLink to="/" class="menu-link">
          <Icon icon="game-icons:exit-door" />
          Menu główne
        </NuxtLink>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(4px);
}

.modal-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 40px 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 24px 48px rgba(0,0,0,0.7);
}

.result-icon {
  font-size: 56px;
  line-height: 1;
}

.result-icon.win  { color: #fbbf24; }
.result-icon.lose { color: #64748b; }

h2 { margin: 0; font-size: 28px; }
.win-text  { color: #fbbf24; }
.lose-text { color: #94a3b8; }

.result-sub {
  color: #94a3b8;
  font-size: 14px;
  margin: 0;
}

.round-info {
  font-size: 12px;
  color: #475569;
  margin: 0;
}

.restart-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 24px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.restart-btn:hover { opacity: 0.85; }

.menu-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  text-decoration: none;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
  transition: color 0.15s, border-color 0.15s;
}
.menu-link:hover { color: #94a3b8; border-color: rgba(255,255,255,0.2); }

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.3s;
}
.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}
</style>
