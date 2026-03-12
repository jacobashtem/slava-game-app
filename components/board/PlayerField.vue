<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import BattleLine from './BattleLine.vue'
import { BattleLine as BL, AdventureType } from '../../game-engine/constants'
import type { PlayerState, ActiveEventCard, CardInstance } from '../../game-engine/types'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'

const props = defineProps<{
  playerState: PlayerState
  isPlayerSide: boolean
}>()

const game = useGameStore()
const ui = useUIStore()

// Filtruj zdarzenia: pokaż wszystkie OPRÓCZ lokacji (adventureType 2) — lokacje są osobno
const activeEvents = computed(() => {
  const all = game.state?.activeEvents ?? []
  return all.filter(ev => ev.cardData.adventureType !== AdventureType.LOCATION)
})

// Aktywna lokacja tego gracza (jeśli istnieje)
const activeLocation = computed<CardInstance | null>(() => props.playerState.activeLocation)

// Persistence → icon/label/color
function persistenceInfo(ev: ActiveEventCard) {
  const p = ev.cardData.persistence
  if (p === 'permanent') return { icon: 'game-icons:infinity', label: 'Trwały', color: '#a78bfa' }
  if (p === 'duration')  return { icon: 'game-icons:hourglass', label: ev.roundsRemaining !== null ? `${ev.roundsRemaining}` : '∞', color: '#fbbf24' }
  if (p === 'conditional') return { icon: 'game-icons:breaking-chain', label: 'War.', color: '#f87171' }
  return { icon: 'game-icons:scroll-unfurled', label: '', color: '#94a3b8' }
}

// Adventure type → color accent
function adventureColor(ev: ActiveEventCard) {
  const t = (ev.cardData as any).adventureType
  if (t === 0) return '#f59e0b'  // zdarzenie — amber
  if (t === 1) return '#6366f1'  // artefakt — indigo
  if (t === 2) return '#10b981'  // lokacja — emerald
  return '#94a3b8'
}

function ownerLabel(ev: ActiveEventCard): string {
  return ev.owner === 'player1' ? 'TY' : 'AI'
}

function ownerColor(ev: ActiveEventCard): string {
  return ev.owner === 'player1' ? '#4ade80' : '#f87171'
}
</script>

<template>
  <!-- Template order: EVENTS, SUPPORT, RANGED, FRONT
       AI (left side, flex-direction: row):    EVENTS | L3 | L2 | L1 — EVENTS far left edge, FRONT near center divider
       Player (right side, flex-direction: row-reverse): L1 | L2 | L3 | EVENTS — FRONT near center divider, EVENTS far right edge
  -->
  <div :class="['player-field', { 'player-field--player': isPlayerSide, 'player-field--enemy': !isPlayerSide }]">
    <!-- Label: TY / WRÓG -->
    <div :class="['field-label', isPlayerSide ? 'field-label--player' : 'field-label--enemy']">
      {{ isPlayerSide ? 'TY' : 'WRÓG' }}
    </div>

    <!-- Aktywne zdarzenia: L4 — na zewnętrznej krawędzi pola, nie zaburza widoku linii bitwy -->
    <div class="events-zone">
      <div class="events-zone-label">
        <Icon icon="game-icons:scroll-unfurled" class="ez-label-icon" />
        <span>AKTYWNE</span>
      </div>
      <!-- Aktywna Lokacja tego gracza -->
      <div
        v-if="activeLocation"
        class="event-scroll event-scroll--location"
        :style="{ '--ev-color': '#10b981', '--ev-owner-color': isPlayerSide ? '#4ade80' : '#f87171' }"
        @mouseenter="ui.showTooltip(activeLocation.instanceId)"
        @mouseleave="ui.hideTooltip()"
      >
        <div class="ev-accent" />
        <div class="ev-header">
          <span class="ev-name">{{ (activeLocation.cardData as any).name }}</span>
        </div>
        <div class="ev-footer ev-footer--location">
          <Icon icon="game-icons:castle" class="ev-persist-icon" style="color: #10b981" />
          <span class="ev-persist-label" style="color: #10b981">Lokacja</span>
        </div>
      </div>

      <div v-if="activeEvents.length === 0 && !activeLocation" class="events-empty">—</div>
      <div
        v-for="ev in activeEvents"
        :key="ev.instanceId"
        class="event-scroll"
        :style="{ '--ev-color': adventureColor(ev), '--ev-owner-color': ownerColor(ev) }"
        @mouseenter="ui.showTooltip(ev.instanceId)"
        @mouseleave="ui.hideTooltip()"
      >
        <!-- Kolorowy accent bar po lewej -->
        <div class="ev-accent" />

        <!-- Górna część: nazwa + owner -->
        <div class="ev-header">
          <span class="ev-name">{{ ev.cardData.name }}</span>
          <span class="ev-owner" :style="{ color: ownerColor(ev) }">{{ ownerLabel(ev) }}</span>
        </div>

        <!-- Dolna część: persistence icon + counter -->
        <div class="ev-footer">
          <Icon :icon="persistenceInfo(ev).icon" class="ev-persist-icon" :style="{ color: persistenceInfo(ev).color }" />
          <!-- Duży widoczny licznik rund -->
          <span
            v-if="ev.roundsRemaining != null"
            class="ev-counter"
            :class="{ 'ev-counter-low': ev.roundsRemaining <= 1 }"
          >{{ ev.roundsRemaining }}</span>
          <span v-else class="ev-persist-label" :style="{ color: persistenceInfo(ev).color }">
            {{ persistenceInfo(ev).label }}
          </span>
        </div>
      </div>
    </div>

    <BattleLine
      :cards="playerState.field.lines[BL.SUPPORT]"
      :line="BL.SUPPORT"
      :side="playerState.side"
      :is-player-side="isPlayerSide"
    />
    <BattleLine
      :cards="playerState.field.lines[BL.RANGED]"
      :line="BL.RANGED"
      :side="playerState.side"
      :is-player-side="isPlayerSide"
    />
    <BattleLine
      :cards="playerState.field.lines[BL.FRONT]"
      :line="BL.FRONT"
      :side="playerState.side"
      :is-player-side="isPlayerSide"
    />
  </div>
</template>

<style scoped>
.player-field {
  display: flex;
  flex-direction: row;   /* AI: EVENTS | L3 | L2 | L1, FRONT rightmost (nearest divider), EVENTS on far edge */
  flex: 1;
  gap: 2px;
  min-height: 0;
  height: 100%;
  contain: layout style;
}

.player-field--player {
  flex-direction: row-reverse;  /* Player: L1 | L2 | L3 | EVENTS, FRONT leftmost (nearest divider), EVENTS on far edge */
  border-bottom: 1px solid rgba(34, 197, 94, 0.12);
}

.player-field--enemy {
  border-bottom: 1px solid rgba(239, 68, 68, 0.12);
  background: rgba(239, 68, 68, 0.02);
}

/* ===== LABEL TY / WRÓG ===== */
.field-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  flex-shrink: 0;
  user-select: none;
}

.field-label--player {
  color: rgba(134, 239, 172, 0.6);
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.06) 0%, rgba(34, 197, 94, 0.02) 100%);
  border-right: 2px solid rgba(34, 197, 94, 0.2);
  text-shadow: 0 0 8px rgba(34, 197, 94, 0.2);
}

.field-label--enemy {
  color: rgba(252, 165, 165, 0.6);
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.06) 0%, rgba(239, 68, 68, 0.02) 100%);
  border-left: 2px solid rgba(239, 68, 68, 0.2);
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.2);
}

/* ===== STREFA AKTYWNYCH ZDARZEŃ ===== */
.events-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 4px 3px;
  width: 110px;
  flex-shrink: 0;
  border-left: 1px solid rgba(200, 168, 78, 0.1);
  border-right: 1px solid rgba(200, 168, 78, 0.1);
  overflow-y: auto;
  scrollbar-width: none;
  background: rgba(0, 0, 0, 0.15);
}
.events-zone::-webkit-scrollbar { display: none; }

/* Label: AKTYWNE */
.events-zone-label {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: rgba(200, 168, 78, 0.5);
  text-transform: uppercase;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(200, 168, 78, 0.08);
  width: 100%;
  justify-content: center;
  flex-shrink: 0;
}
.ez-label-icon {
  width: 10px;
  height: 10px;
  opacity: 0.5;
}

/* Pusty placeholder gdy brak aktywnych */
.events-empty {
  font-size: 10px;
  color: rgba(200, 168, 78, 0.15);
  text-align: center;
  padding: 4px 0;
}

/* Karta przygody — zwój */
.event-scroll {
  width: 102px;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--ev-color) 35%, transparent);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(10, 10, 30, 0.95) 100%);
  padding: 0;
  cursor: help;
  transition: transform 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  will-change: transform;
}

.event-scroll:hover {
  border-color: color-mix(in srgb, var(--ev-color) 70%, transparent);
  transform: scale(1.05);
  z-index: 5;
}

/* Kolorowy accent bar po lewej */
.ev-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--ev-color);
  opacity: 0.7;
}

/* Górna część: nazwa + owner */
.ev-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2px;
  padding: 4px 5px 2px 7px;
}

.ev-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 500;
  color: #e2e8f0;
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  flex: 1;
}

.ev-owner {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.08em;
  flex-shrink: 0;
  text-shadow: 0 0 4px currentColor;
}

/* Dolna część: ikona persistence + licznik */
.ev-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 5px 4px 7px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.03);
}

.ev-persist-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.8;
}

/* Duży widoczny licznik rund */
.ev-counter {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 500;
  color: #fbbf24;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.5), 0 1px 3px rgba(0, 0, 0, 0.8);
  line-height: 1;
  animation: counter-glow 2s ease-in-out infinite;
}

.ev-counter-low {
  color: #ef4444;
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.6), 0 1px 3px rgba(0, 0, 0, 0.8);
  animation: counter-urgent 1s ease-in-out infinite;
}

@keyframes counter-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}

@keyframes counter-urgent {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}

.ev-persist-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* Lokacja — specjalny styl */
.event-scroll--location {
  border-color: rgba(16, 185, 129, 0.4);
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(10, 10, 30, 0.95) 100%);
}
.event-scroll--location:hover {
  border-color: rgba(16, 185, 129, 0.7);
}
.ev-footer--location {
  background: rgba(6, 78, 59, 0.25);
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .player-field {
    flex-direction: column !important;
    height: auto;
    flex: 1;
    min-height: 0;
    gap: 1px;
  }
  .player-field--player {
    flex-direction: column-reverse !important;
    border-bottom: none;
  }
  .player-field--enemy {
    border-bottom: none;
  }

  /* Label ukryty na mobile — oszczędność miejsca, pozycja oczywista */
  .field-label {
    display: none;
  }

  /* Events zone: HIDDEN on mobile — saves vertical space */
  .events-zone {
    display: none;
  }
  .events-zone::-webkit-scrollbar { display: none; }
  .events-zone-label {
    writing-mode: vertical-rl;
    padding: 0 2px 0 0;
    border-bottom: none;
    border-right: 1px solid rgba(200,168,78,0.06);
    width: auto;
    font-size: 5px;
  }
  .event-scroll {
    width: 52px;
    min-width: 52px;
  }
  .ev-name { font-size: 6px; }
  .ev-owner { font-size: 5px; }
  .ev-counter { font-size: 12px; }
  .ev-persist-icon { width: 9px; height: 9px; }
  .ev-header { padding: 2px 3px 1px 5px; }
  .ev-footer { padding: 1px 3px 2px 5px; }
}
</style>
