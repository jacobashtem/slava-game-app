<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { useArenaStore } from '../../stores/arenaStore'

const game = useGameStore()
const ui = useUIStore()
const arena = useArenaStore()

const isWin = computed(() => game.winner === 'player1')

const stats = computed(() => {
  if (!game.state) return null
  const p = game.state.players.player1
  const a = game.state.players.player2
  return {
    round: game.roundNumber,
    season: game.season,
    playerKills: a.graveyard.length,
    aiKills: p.graveyard.length,
    playerGold: p.gold,
    playerGlory: p.glory,
    aiGlory: a.glory,
    playerDeck: p.deck.length,
    isSlava: game.state.gameMode === 'slava',
  }
})

const seasonLabel: Record<string, string> = {
  spring: 'Wiosna', summer: 'Lato', autumn: 'Jesień', winter: 'Zima',
}

function restart() {
  ui.clearSelection()
  ui.showGameOver = false
  if (game.isArenaMode) {
    arena.reset()
  } else if (game.gameMode === 'slava') {
    game.startSlavaGame()
  } else {
    game.startAlphaGame()
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="game.winner" class="modal-overlay">
      <!-- Radial glow behind modal -->
      <div :class="['modal-glow', isWin ? 'glow-win' : 'glow-lose']" />

      <div :class="['modal-box', isWin ? 'box-win' : 'box-lose']">
        <!-- Top ornament -->
        <div class="ornament-top" />

        <!-- Icon -->
        <div :class="['result-icon', isWin ? 'win' : 'lose']">
          <Icon :icon="isWin ? 'game-icons:laurel-crown' : 'game-icons:skull-crossed-bones'" />
        </div>

        <!-- Title -->
        <h2 :class="isWin ? 'win-text' : 'lose-text'">
          {{ isWin ? 'ZWYCIĘSTWO' : 'PORAŻKA' }}
        </h2>
        <p class="result-sub">
          {{ isWin ? 'Chwała bohaterowi Słowian!' : 'Wróg okazał się silniejszy...' }}
        </p>

        <!-- Stats -->
        <div v-if="stats" class="game-stats">
          <div class="stat-row">
            <span class="stat-label"><Icon icon="game-icons:sundial" class="stat-icon" /> Runda</span>
            <span class="stat-val">{{ stats.round }} · {{ seasonLabel[stats.season] ?? stats.season }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label"><Icon icon="game-icons:crossed-swords" class="stat-icon stat-kill" /> Zabici</span>
            <span class="stat-val stat-kills">{{ stats.playerKills }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label"><Icon icon="game-icons:tombstone" class="stat-icon stat-loss" /> Straceni</span>
            <span class="stat-val stat-losses">{{ stats.aiKills }}</span>
          </div>
          <div v-if="stats.isSlava" class="stat-row">
            <span class="stat-label"><Icon icon="game-icons:laurel-crown" class="stat-icon" style="color:#86efac" /> Sława</span>
            <span class="stat-val" style="color:#86efac">{{ stats.playerGlory }} vs {{ stats.aiGlory }}</span>
          </div>
          <div v-else class="stat-row">
            <span class="stat-label"><Icon icon="game-icons:two-coins" class="stat-icon stat-gold" /> Złoto</span>
            <span class="stat-val stat-gold-val">{{ stats.playerGold }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label"><Icon icon="game-icons:card-pickup" class="stat-icon" /> Talia</span>
            <span class="stat-val">{{ stats.playerDeck }}</span>
          </div>
        </div>

        <!-- Bottom ornament -->
        <div class="ornament-bottom" />

        <!-- Buttons -->
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
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(8px);
}

.modal-glow {
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.3;
  pointer-events: none;
  animation: glow-breathe 3s ease-in-out infinite;
}
.glow-win  { background: radial-gradient(circle, #fbbf24 0%, transparent 70%); }
.glow-lose { background: radial-gradient(circle, #ef4444 0%, transparent 70%); }

@keyframes glow-breathe {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50%      { opacity: 0.35; transform: scale(1.1); }
}

.modal-box {
  position: relative;
  background: linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%);
  border: 1px solid;
  border-radius: 16px;
  padding: 36px 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.8),
    0 0 1px 0 rgba(255, 255, 255, 0.1) inset;
  animation: modal-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  min-width: 320px;
}

.box-win  { border-color: rgba(251, 191, 36, 0.3); }
.box-lose { border-color: rgba(100, 116, 139, 0.3); }

@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.85) translateY(20px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Ornamental lines */
.ornament-top, .ornament-bottom {
  width: 120px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold) 30%, var(--gold) 70%, transparent);
  opacity: 0.25;
}

.result-icon {
  font-size: 64px;
  line-height: 1;
  animation: icon-entrance 0.6s ease-out 0.2s both;
}
@keyframes icon-entrance {
  from { opacity: 0; transform: scale(0.5) rotate(-15deg); }
  to   { opacity: 1; transform: scale(1) rotate(0); }
}

.result-icon.win  { color: #fbbf24; filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5)); }
.result-icon.lose { color: #64748b; filter: drop-shadow(0 0 10px rgba(100, 116, 139, 0.3)); }

h2 {
  margin: 0;
  font-size: 32px;
  font-family: var(--font-display, Georgia, serif);
  letter-spacing: 0.15em;
  animation: title-entrance 0.4s ease-out 0.3s both;
}
@keyframes title-entrance {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.win-text {
  color: #fbbf24;
  text-shadow: 0 0 30px rgba(251, 191, 36, 0.4), 0 2px 4px rgba(0, 0, 0, 0.5);
}
.lose-text {
  color: #94a3b8;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.result-sub {
  color: #64748b;
  font-size: 13px;
  margin: 0;
  font-style: italic;
  font-family: Georgia, serif;
}

/* Stats table */
.game-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 260px;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(200, 168, 78, 0.1);
  border-radius: 10px;
  margin: 4px 0;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.stat-label {
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}
.stat-kill { color: #4ade80; }
.stat-loss { color: #f87171; }
.stat-gold { color: #fbbf24; }

.stat-val {
  color: #94a3b8;
  font-weight: 600;
  font-family: monospace;
}

.stat-kills    { color: #4ade80; }
.stat-losses   { color: #f87171; }
.stat-gold-val { color: #fbbf24; }

/* Buttons */
.restart-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 28px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.8), rgba(124, 58, 237, 0.8));
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.05em;
}
.restart-btn:hover {
  background: linear-gradient(135deg, rgba(99, 90, 249, 0.9), rgba(144, 78, 255, 0.9));
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
  transform: translateY(-1px);
}

.menu-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  text-decoration: none;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.15s;
}
.menu-link:hover {
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.15);
}

.modal-fade-enter-active { transition: opacity 0.4s; }
.modal-fade-leave-active { transition: opacity 0.3s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .modal-box {
    max-width: 92vw;
    padding: 20px 16px;
  }
}
</style>
