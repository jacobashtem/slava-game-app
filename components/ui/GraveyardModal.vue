<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'

const ui = useUIStore()
const game = useGameStore()

const cards = computed(() => {
  if (!ui.graveyardViewerSide || !game.state) return []
  return game.state.players[ui.graveyardViewerSide].graveyard
})

const title = computed(() =>
  ui.graveyardViewerSide === 'player1' ? 'Twój cmentarz' : 'Cmentarz przeciwnika'
)

function domainColor(card: any): string {
  const colors: Record<number, string> = { 1: '#f5c542', 2: '#4caf50', 3: '#9c27b0', 4: '#c62828' }
  return colors[card.cardData.domain] ?? '#475569'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="ui.graveyardViewerSide" class="grave-overlay" @click.self="ui.closeGraveyardViewer()">
      <div class="grave-modal">
        <div class="modal-header">
          <span class="modal-title">{{ title }} ({{ cards.length }})</span>
          <button class="close-btn" @click="ui.closeGraveyardViewer()">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="cards.length === 0" class="empty-grave">Cmentarz jest pusty</div>
          <div v-else class="cards-grid">
            <div
              v-for="card in cards"
              :key="card.instanceId"
              class="grave-card"
              :style="card.cardData.cardType === 'creature' ? { '--domain-color': domainColor(card) } : {}"
            >
              <div class="card-header">
                <span class="card-type">{{ card.cardData.cardType === 'creature' ? 'Istota' : 'Przygoda' }}</span>
              </div>
              <div class="card-name">{{ card.cardData.name }}</div>
              <div v-if="card.cardData.cardType === 'creature'" class="card-stats">
                <span class="stat atk">⚔ {{ card.currentStats.attack }}</span>
                <span class="stat def">🛡 {{ card.currentStats.defense }}</span>
              </div>
              <div v-if="card.cardData.effectDescription" class="card-effect">
                {{ card.cardData.effectDescription }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.grave-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(3px);
}

.grave-modal {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  width: min(680px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #1e293b;
  flex-shrink: 0;
}

.modal-title {
  font-size: 13px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.close-btn {
  background: none;
  border: 1px solid #334155;
  color: #64748b;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}

.close-btn:hover {
  color: #e2e8f0;
  border-color: #475569;
}

.modal-body {
  overflow-y: auto;
  padding: 12px 16px;
  flex: 1;
}

.empty-grave {
  text-align: center;
  color: #475569;
  font-size: 13px;
  padding: 32px 0;
  font-style: italic;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.grave-card {
  background: #111827;
  border: 1px solid var(--domain-color, #334155);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0.85;
}

.card-header {
  display: flex;
  justify-content: space-between;
}

.card-type {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--domain-color, #64748b);
  font-weight: 700;
}

.card-name {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  line-height: 1.3;
}

.card-stats {
  display: flex;
  gap: 8px;
}

.stat {
  font-size: 11px;
  font-family: monospace;
  color: #94a3b8;
}

.stat.atk { color: #fca5a5; }
.stat.def { color: #93c5fd; }

.card-effect {
  font-size: 9px;
  color: #64748b;
  line-height: 1.4;
  margin-top: 2px;
}
</style>
