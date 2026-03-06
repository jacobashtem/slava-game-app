<script setup lang="ts">
import { computed } from 'vue'
import PlayerField from './PlayerField.vue'
import PlayerHand from '../ui/PlayerHand.vue'
import TurnIndicator from '../ui/TurnIndicator.vue'
import PhaseControls from '../ui/PhaseControls.vue'
import ActionLog from '../ui/ActionLog.vue'
import DeckPile from '../ui/DeckPile.vue'
import CardTooltip from '../ui/CardTooltip.vue'
import GameOverModal from '../ui/GameOverModal.vue'
import GraveyardModal from '../ui/GraveyardModal.vue'
import GameHint from '../ui/GameHint.vue'
import AISummaryPanel from '../ui/AISummaryPanel.vue'
import CardBack from '../cards/CardBack.vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { BattleLine } from '../../game-engine/constants'

const game = useGameStore()
const ui = useUIStore()

const player = computed(() => game.state?.players.player1)
const ai = computed(() => game.state?.players.player2)

const onPlayDescription = computed(() => {
  const cardId = game.state?.awaitingOnPlayConfirmation
  if (!cardId || !game.state) return ''
  const allCards = [
    ...game.state.players.player1.field.lines[BattleLine.FRONT],
    ...game.state.players.player1.field.lines[BattleLine.RANGED],
    ...game.state.players.player1.field.lines[BattleLine.SUPPORT],
  ]
  const card = allCards.find(c => c.instanceId === cardId)
  if (!card) return ''
  return `${card.cardData.name}: ${(card.cardData as any).effectDescription ?? ''}`
})
</script>

<template>
  <div class="game-board" v-if="game.state && player && ai">

    <!-- ===== PASEK GÓRNY ===== -->
    <div class="top-bar">
      <div class="top-bar-left">
        <TurnIndicator />
      </div>
      <div class="top-bar-center">
        <ActionLog />
      </div>
      <div class="top-bar-right">
        <PhaseControls />
      </div>
    </div>

    <!-- ===== GŁÓWNA PLANSZA (lewa-prawa) ===== -->
    <div class="board-main">

      <!-- LEWA KOLUMNA: info AI -->
      <div class="sidebar sidebar-ai">
        <DeckPile
          :deck-count="ai.deck.length"
          :hand-count="ai.hand.length"
          :grave-count="ai.graveyard.length"
          :gold="ai.gold"
          :is-a-i="true"
          @open-graveyard="ui.openGraveyardViewer('player2')"
        />
        <div class="sidebar-spacer" />
        <button
          v-if="!game.winner"
          class="surrender-side-btn"
          @click="ui.confirmingSurrender = true"
          title="Poddaj grę"
        >
          🏳
        </button>
      </div>

      <!-- POLE WALKI AI (3 kolumny: L3|L2|L1, L1 przy środku) -->
      <PlayerField :player-state="ai" :is-player-side="false" />

      <!-- ŚRODKOWY SEPARATOR (pionowy) -->
      <div class="center-divider">
        <div class="divider-line" />
        <div class="divider-badge">⚔</div>
        <div class="divider-line" />
      </div>

      <!-- POLE WALKI GRACZA (3 kolumny: L1|L2|L3, L1 przy środku) -->
      <PlayerField :player-state="player" :is-player-side="true" />

      <!-- PRAWA KOLUMNA: info gracza -->
      <div class="sidebar sidebar-player">
        <DeckPile
          :deck-count="player.deck.length"
          :hand-count="player.hand.length"
          :grave-count="player.graveyard.length"
          :gold="player.gold"
          :is-a-i="false"
          :enhanced-active="ui.isEnhancedMode"
          @open-graveyard="ui.openGraveyardViewer('player1')"
          @toggle-enhanced="ui.toggleEnhancedMode()"
        />
      </div>
    </div>

    <!-- ===== WSKAZÓWKA KONTEKSTOWA ===== -->
    <GameHint />

    <!-- ===== RĘKA GRACZA (dolny pasek) ===== -->
    <PlayerHand />

    <!-- ===== TOAST: limit wystawiania ===== -->
    <Transition name="toast-fade">
      <div v-if="ui.playLimitToast" class="play-limit-toast">
        {{ ui.playLimitToast }}
      </div>
    </Transition>

    <!-- ON_PLAY Confirmation -->
    <Transition name="onplay-fade">
      <div v-if="game.state?.awaitingOnPlayConfirmation" class="onplay-confirm">
        <div class="onplay-box">
          <div class="onplay-title">Efekt przy wystawieniu (GRATIS)</div>
          <div class="onplay-desc">{{ onPlayDescription }}</div>
          <div class="onplay-btns">
            <button class="onplay-yes" @click="game.confirmOnPlay()">TAK — Aktywuj</button>
            <button class="onplay-no" @click="game.skipOnPlay()">NIE — Pomiń</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== POTWIERDZENIE PODDANIA ===== -->
    <Transition name="onplay-fade">
      <div v-if="ui.confirmingSurrender" class="onplay-confirm" @click.self="ui.confirmingSurrender = false">
        <div class="onplay-box">
          <div class="onplay-title">Poddanie gry</div>
          <div class="onplay-desc">Czy na pewno chcesz poddać grę?</div>
          <div class="onplay-btns">
            <button class="onplay-yes" style="border-color:rgba(239,68,68,0.5);color:#fca5a5;background:rgba(239,68,68,0.15)" @click="() => { ui.confirmingSurrender = false; game.surrender() }">TAK — Poddaj</button>
            <button class="onplay-no" @click="ui.confirmingSurrender = false">NIE — Wróć</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== POTWIERDZENIE PŁATNEJ ZDOLNOŚCI ===== -->
    <Transition name="onplay-fade">
      <div v-if="ui.pendingActivation" class="onplay-confirm">
        <div class="onplay-box">
          <div class="onplay-title">Aktywacja zdolności</div>
          <div class="onplay-desc">
            Czy chcesz wydać <strong>{{ ui.pendingActivation.cost }} ZŁ</strong> na aktywację zdolności
            <strong>{{ ui.pendingActivation.cardName }}</strong>?
          </div>
          <div class="onplay-btns">
            <button class="onplay-yes" @click="() => { const id = ui.pendingActivation!.cardInstanceId; ui.pendingActivation = null; game.activateCreatureEffect(id) }">TAK — Aktywuj</button>
            <button class="onplay-no" @click="ui.pendingActivation = null">NIE — Anuluj</button>
          </div>
        </div>
      </div>
    </Transition>

    <CardTooltip />
    <AISummaryPanel />
    <GameOverModal />
    <GraveyardModal />
  </div>

  <div v-else class="board-loading">
    <div class="loading-spinner" />
    Ładowanie gry...
  </div>
</template>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: var(--bg-board);
  color: var(--text-primary);
}

/* ====== PASEK GÓRNY ====== */
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border-default);
  background: rgba(0,0,0,0.35);
  flex-shrink: 0;
  min-height: 44px;
}

.top-bar-left { flex: 0 0 auto; }
.top-bar-center { flex: 1; min-width: 0; }
.top-bar-right { flex: 0 0 auto; }

/* ====== GŁÓWNA PLANSZA ====== */
.board-main {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ====== SIDEBARY ====== */
.sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-right: 1px solid var(--border-default);
  background: rgba(0,0,0,0.15);
  flex-shrink: 0;
  width: 80px;
}

.sidebar-player {
  border-right: none;
  border-left: 1px solid var(--border-default);
}

/* AI hand backs */
.ai-hand-backs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

.ai-back {
  margin-top: -20px;
}
.ai-back:first-child {
  margin-top: 0;
}

.empty-hand-label {
  font-size: 9px;
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
}

/* ====== SEPARATOR ŚRODKOWY (pionowy) ====== */
.center-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  flex-shrink: 0;
  width: 24px;
}

.divider-line {
  flex: 1;
  width: 1px;
  background: rgba(255,255,255,0.08);
}

.divider-badge {
  font-size: 14px;
  color: #475569;
  padding: 4px 0;
  writing-mode: vertical-rl;
}

/* ====== LOADING ====== */
.board-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-muted);
  font-size: 16px;
  gap: 12px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(139, 92, 246, 0.2);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ====== PLAY LIMIT TOAST ====== */
.play-limit-toast {
  position: fixed;
  bottom: 180px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  border: 1px solid #f87171;
  color: #fca5a5;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 6px;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

/* ===== SURRENDER (sidebar) ===== */
.sidebar-spacer { flex: 1; }

.surrender-side-btn {
  padding: 5px 6px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  color: rgba(239, 68, 68, 0.35);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}
.surrender-side-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.5);
}

.toast-fade-enter-active { transition: all 0.25s ease; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(10px); }
.toast-fade-leave-active { transition: all 0.3s ease; }
.toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-6px); }

/* ===== ON_PLAY CONFIRMATION ===== */
.onplay-confirm {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  background: rgba(0,0,0,0.5);
}

.onplay-box {
  background: #0f172a;
  border: 1px solid rgba(139,92,246,0.5);
  border-radius: 10px;
  padding: 20px 24px;
  max-width: 340px;
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.2);
}

.onplay-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a78bfa;
}

.onplay-desc {
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.5;
}

.onplay-btns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.onplay-yes {
  flex: 1;
  padding: 8px 0;
  background: rgba(139,92,246,0.2);
  border: 1px solid rgba(139,92,246,0.5);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.onplay-yes:hover { background: rgba(139,92,246,0.35); }

.onplay-no {
  flex: 1;
  padding: 8px 0;
  background: rgba(100,116,139,0.1);
  border: 1px solid rgba(100,116,139,0.3);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.onplay-no:hover { background: rgba(100,116,139,0.2); }

.onplay-fade-enter-active, .onplay-fade-leave-active { transition: opacity 0.2s; }
.onplay-fade-enter-from, .onplay-fade-leave-to { opacity: 0; }
</style>
