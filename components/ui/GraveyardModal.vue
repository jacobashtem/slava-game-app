<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'

const ui = useUIStore()
const game = useGameStore()

// Creature images
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.png', { eager: true, import: 'default' }) as Record<string, string>
const creatureImgs = Object.fromEntries(
  Object.entries(_creatureImgModules)
    .map(([key, val]) => { const m = key.match(/(\d+)\.png$/); return m ? [parseInt(m[1]!), val] : null })
    .filter(Boolean) as [number, string][]
) as Record<number, string>

const cards = computed(() => {
  if (!ui.graveyardViewerSide || !game.state) return []
  return game.state.players[ui.graveyardViewerSide].graveyard
})

const title = computed(() =>
  ui.graveyardViewerSide === 'player1' ? 'Twój cmentarz' : 'Cmentarz przeciwnika'
)

function domainColor(card: any): string {
  const colors: Record<number, string> = { 1: '#d4a843', 2: '#4a9e4a', 3: '#8b5fc7', 4: '#c44040' }
  return colors[card.cardData?.domain] ?? '#475569'
}

function cardImg(card: any): string | null {
  if (card.cardData?.cardType !== 'creature') return null
  return creatureImgs[card.cardData.id] ?? creatureImgs[117] ?? null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="grave-fade">
      <div v-if="ui.graveyardViewerSide" class="grave-overlay" @click.self="ui.closeGraveyardViewer()">
        <div class="grave-modal">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-ornament-l" />
            <Icon icon="game-icons:tombstone" class="header-icon" />
            <span class="modal-title">{{ title }}</span>
            <span class="modal-count">({{ cards.length }})</span>
            <div class="header-ornament-r" />
            <button class="close-btn" @click="ui.closeGraveyardViewer()">
              <Icon icon="game-icons:cancel" />
            </button>
          </div>

          <!-- Ornamental line -->
          <div class="header-line" />

          <!-- Body -->
          <div class="modal-body">
            <div v-if="cards.length === 0" class="empty-grave">
              <Icon icon="game-icons:ghost" class="empty-icon" />
              <span>Cmentarz jest pusty</span>
            </div>
            <div v-else class="cards-grid">
              <div
                v-for="card in cards"
                :key="card.instanceId"
                class="grave-card"
                :style="{ '--dc': domainColor(card) }"
                @mouseenter="ui.showTooltip(card.instanceId)"
                @mouseleave="ui.hideTooltip()"
              >
                <!-- Thumbnail art -->
                <div class="card-thumb">
                  <img v-if="cardImg(card)" :src="cardImg(card)!" class="thumb-img" />
                  <Icon v-else icon="game-icons:scroll-unfurled" class="thumb-placeholder" />
                  <div class="thumb-vignette" />
                </div>

                <!-- Info -->
                <div class="card-info">
                  <span class="card-type" :style="{ color: 'var(--dc)' }">
                    {{ card.cardData.cardType === 'creature' ? 'Istota' : 'Przygoda' }}
                  </span>
                  <span class="card-name">{{ card.cardData.name }}</span>
                  <div v-if="card.cardData.cardType === 'creature'" class="card-stats">
                    <span class="stat-atk">
                      <Icon icon="game-icons:crossed-swords" class="stat-icon" />
                      {{ (card as any).currentStats?.attack ?? '?' }}
                    </span>
                    <span class="stat-def">
                      <Icon icon="game-icons:shield" class="stat-icon" />
                      {{ (card as any).currentStats?.defense ?? '?' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.grave-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  /* backdrop-filter removed for perf */
}

.grave-modal {
  background: linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%);
  border: 1px solid rgba(200, 168, 78, 0.15);
  border-radius: 12px;
  width: min(720px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.7),
    0 0 1px 0 rgba(200, 168, 78, 0.1) inset;
  animation: modal-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.9) translateY(16px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  flex-shrink: 0;
}

.header-icon {
  font-size: 18px;
  color: rgba(200, 168, 78, 0.5);
}

.modal-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 17px;
  font-weight: 500;
  color: #e2e8f0;
  letter-spacing: 0.08em;
}

.modal-count {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.header-ornament-l, .header-ornament-r {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.12));
}
.header-ornament-r {
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.12), transparent);
}

.close-btn {
  background: none;
  border: 1px solid rgba(200, 168, 78, 0.15);
  color: #64748b;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.close-btn:hover {
  color: #e2e8f0;
  border-color: rgba(200, 168, 78, 0.35);
  background: rgba(200, 168, 78, 0.06);
}

/* Ornamental line */
.header-line {
  height: 1px;
  margin: 0 18px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.2) 20%, rgba(200, 168, 78, 0.2) 80%, transparent);
}

/* Body */
.modal-body {
  overflow-y: auto;
  padding: 14px 18px;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.15) transparent;
}

.empty-grave {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 13px;
  padding: 40px 0;
  font-style: italic;
  font-family: var(--font-display, Georgia, serif);
}
.empty-icon {
  font-size: 36px;
  opacity: 0.3;
}

/* Cards grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

/* Individual grave card */
.grave-card {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 10, 25, 0.9) 100%);
  border: 1px solid color-mix(in srgb, var(--dc, #475569) 30%, transparent);
  border-radius: 8px;
  overflow: hidden;
  cursor: help;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  display: flex;
  flex-direction: column;
}
.grave-card:hover {
  border-color: color-mix(in srgb, var(--dc) 60%, transparent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 8px 1px color-mix(in srgb, var(--dc) 15%, transparent);
  transform: translateY(-2px);
}

/* Thumbnail */
.card-thumb {
  position: relative;
  width: 100%;
  height: 80px;
  overflow: hidden;
  background: #080810;
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0.6;
  filter: grayscale(0.4) brightness(0.8);
}
.thumb-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 28px;
  color: rgba(200, 168, 78, 0.2);
}
.thumb-vignette {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 40%, rgba(10, 10, 25, 0.95) 100%);
  pointer-events: none;
}

/* Info section */
.card-info {
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-type {
  font-size: 7px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.card-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 15px;
  font-weight: 500;
  color: #e2e8f0;
  line-height: 1.2;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.card-stats {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.stat-atk, .stat-def {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 12px;
  font-weight: 500;
}
.stat-atk { color: #fb923c; }
.stat-def { color: #60a5fa; }
.stat-icon { width: 11px; height: 11px; opacity: 0.7; }

/* Transitions */
.grave-fade-enter-active { transition: opacity 0.3s; }
.grave-fade-leave-active { transition: opacity 0.2s; }
.grave-fade-enter-from, .grave-fade-leave-to { opacity: 0; }

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .grave-modal {
    width: 96vw;
    max-height: 90vh;
    border-radius: 10px;
  }
  .cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 6px;
  }
  .card-name {
    font-size: 12px;
  }
}
</style>
