<script setup lang="ts">
import { computed } from 'vue'
import BattleLine from './BattleLine.vue'
import { BattleLine as BL } from '../../game-engine/constants'
import type { PlayerState } from '../../game-engine/types'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'

defineProps<{
  playerState: PlayerState
  isPlayerSide: boolean
}>()

const game = useGameStore()
const ui = useUIStore()
const activeEvents = computed(() => game.state?.activeEvents ?? [])

function durationLabel(event: any): string {
  if (event.cardData.persistence === 'permanent') return 'Trwały'
  if (event.cardData.persistence === 'duration') return event.roundsRemaining !== null ? `${event.roundsRemaining}r` : '∞'
  if (event.cardData.persistence === 'conditional') return 'Warunek'
  return ''
}

function ownerLabel(event: any): string {
  return event.owner === 'player1' ? 'Ty' : 'AI'
}
</script>

<template>
  <!-- Template order: SUPPORT, RANGED, FRONT
       AI (left side): flex-direction row → SUPPORT|RANGED|FRONT — FRONT rightmost (nearest center divider)
       Player (right side): flex-direction row-reverse → renders as FRONT|RANGED|SUPPORT — FRONT leftmost (nearest center divider)
  -->
  <div :class="['player-field', { 'player-field--player': isPlayerSide }]">
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

    <!-- Aktywne zdarzenia: widoczne tylko na planszy gracza, między L1 a L2 -->
    <div v-if="isPlayerSide && activeEvents.length > 0" class="events-zone">
      <div
        v-for="ev in activeEvents"
        :key="ev.instanceId"
        class="event-mini-card"
        @mouseenter="ui.showTooltip(ev.instanceId)"
        @mouseleave="ui.hideTooltip()"
      >
        <div class="ev-name">{{ ev.cardData.name }}</div>
        <div class="ev-meta">
          <span class="ev-owner">{{ ownerLabel(ev) }}</span>
          <span class="ev-dur">{{ durationLabel(ev) }}</span>
        </div>
      </div>
    </div>

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
  flex-direction: row;   /* AI default: L3 | L2 | L1, FRONT rightmost (nearest divider) */
  flex: 1;
  gap: 4px;
  min-height: 0;
  height: 100%;
}

.player-field--player {
  flex-direction: row-reverse;  /* Player: renders as L1 | L2 | L3, FRONT leftmost (nearest divider) */
}

/* ===== STREFA AKTYWNYCH ZDARZEŃ ===== */
.events-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 3px;
  width: 70px;
  flex-shrink: 0;
  border-left: 1px dashed rgba(99, 102, 241, 0.25);
  border-right: 1px dashed rgba(99, 102, 241, 0.25);
  overflow-y: auto;
}

.event-mini-card {
  width: 62px;
  border-radius: 4px;
  border: 1px solid rgba(99, 102, 241, 0.45);
  background: rgba(30, 27, 75, 0.7);
  padding: 4px 5px;
  cursor: default;
  transition: border-color 0.15s, background 0.15s;
  flex-shrink: 0;
}

.event-mini-card:hover {
  border-color: rgba(139, 92, 246, 0.8);
  background: rgba(99, 102, 241, 0.15);
}

.ev-name {
  font-size: 8px;
  font-weight: 700;
  color: #c7d2fe;
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ev-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3px;
  gap: 2px;
}

.ev-owner {
  font-size: 7px;
  color: #475569;
}

.ev-dur {
  font-size: 7px;
  font-weight: 700;
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
  padding: 1px 3px;
  border-radius: 2px;
}
</style>
