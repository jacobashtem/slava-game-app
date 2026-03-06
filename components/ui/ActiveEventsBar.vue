<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import type { ActiveEventCard } from '../../game-engine/types'

const game = useGameStore()

const events = computed(() => game.state?.activeEvents ?? [])

function durationLabel(event: ActiveEventCard): string {
  if (event.cardData.persistence === 'permanent') return 'Trwały'
  if (event.cardData.persistence === 'duration') {
    return event.roundsRemaining !== null ? `${event.roundsRemaining} rund` : '∞'
  }
  if (event.cardData.persistence === 'conditional') {
    return 'Warunek'
  }
  return ''
}

function badgeClass(event: ActiveEventCard): string {
  if (event.cardData.persistence === 'permanent') return 'badge-permanent'
  if (event.cardData.persistence === 'duration') return 'badge-duration'
  if (event.cardData.persistence === 'conditional') return 'badge-conditional'
  return ''
}

function ownerLabel(event: ActiveEventCard): string {
  return event.owner === 'player1' ? 'Ty' : 'AI'
}
</script>

<template>
  <Transition name="events-bar-fade">
    <div v-if="events.length > 0" class="active-events-bar">
      <span class="events-label">W grze:</span>
      <div class="events-list">
        <div
          v-for="event in events"
          :key="event.instanceId"
          class="event-chip"
          :title="event.cardData.effectDescription"
        >
          <span class="event-name">{{ event.cardData.name }}</span>
          <span class="event-owner">({{ ownerLabel(event) }})</span>
          <span :class="['event-badge', badgeClass(event)]">{{ durationLabel(event) }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.active-events-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: rgba(99, 102, 241, 0.05);
  border-top: 1px solid rgba(99, 102, 241, 0.15);
  border-bottom: 1px solid rgba(99, 102, 241, 0.15);
  min-height: 28px;
  overflow-x: auto;
  flex-shrink: 0;
}

.events-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #475569;
  white-space: nowrap;
}

.events-list {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  align-items: center;
}

.event-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 4px;
  padding: 2px 7px;
  white-space: nowrap;
  cursor: default;
}

.event-chip:hover {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.1);
}

.event-name {
  font-size: 10px;
  font-weight: 600;
  color: #c7d2fe;
}

.event-owner {
  font-size: 9px;
  color: #475569;
}

.event-badge {
  font-size: 8px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.04em;
}

.badge-permanent {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.15);
  border: 1px solid rgba(167, 139, 250, 0.3);
}

.badge-duration {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.badge-conditional {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.3);
}

.events-bar-fade-enter-active,
.events-bar-fade-leave-active {
  transition: opacity 0.3s, max-height 0.3s;
  max-height: 40px;
  overflow: hidden;
}
.events-bar-fade-enter-from,
.events-bar-fade-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
