<script setup lang="ts">
import { Icon } from '@iconify/vue'
import CardBack from '../cards/CardBack.vue'

defineProps<{
  deckCount: number
  handCount: number
  graveCount: number
  gold?: number
  isAI?: boolean
  enhancedActive?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-graveyard'): void
  (e: 'toggle-enhanced'): void
}>()
</script>

<template>
  <div :class="['deck-pile', { 'deck-pile--ai': isAI }]">
    <!-- Talia -->
    <div class="pile-section" v-tip="'Talia'">
      <div class="card-stack">
        <CardBack :small="true" />
        <span class="pile-count">{{ deckCount }}</span>
      </div>
      <Icon icon="game-icons:card-pile" class="pile-icon" />
    </div>

    <!-- Cmentarz -->
    <div class="pile-section pile-section--clickable" v-tip="'Cmentarz (kliknij aby przeglądać)'" @click="emit('open-graveyard')">
      <div class="grave-icon-wrap">
        <Icon icon="game-icons:tombstone" class="grave-icon" />
        <span class="pile-count">{{ graveCount }}</span>
      </div>
      <span class="grave-label">Cmentarz</span>
    </div>

    <!-- Złoto — dla gracza klikalnie (enhanced), dla AI tylko informacyjnie -->
    <div
      v-if="gold !== undefined"
      :class="['pile-section', 'gold-section', { 'gold-section--active': !isAI && enhancedActive, 'gold-section--low': !isAI && (gold ?? 0) < 1 }]"
      :data-tip="isAI ? 'Złocisze przeciwnika' : ((gold ?? 0) >= 1 ? 'Kliknij aby zagrać kartę wzmocnioną (1 ZŁ)' : 'Za mało złota na wzmocnienie (potrzebujesz 1 ZŁ)')"
      @click="!isAI && (gold ?? 0) >= 1 ? emit('toggle-enhanced') : undefined"
      :style="isAI ? {} : { cursor: 'pointer' }"
    >
      <Icon icon="game-icons:gold-bar" :class="['gold-icon', { 'gold-icon--enhanced': enhancedActive }]" />
      <span class="gold-count">{{ gold }} ZŁ</span>
      <span v-if="!isAI && enhancedActive" class="enhanced-label">⚡ WZM.</span>
    </div>
  </div>
</template>

<style scoped>
.deck-pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  min-width: 60px;
}

.pile-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  position: relative;
}
.pile-section[data-tip]:hover::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #475569;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
  width: max-content;
  max-width: 220px;
  pointer-events: none;
}
.gold-section[data-tip]:hover::after {
  bottom: auto;
  top: calc(100% + 6px);
}
.gold-section[data-tip]:hover::before {
  content: '';
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  border: 4px solid transparent;
  border-bottom-color: #334155;
  pointer-events: none;
}

.card-stack {
  position: relative;
  width: 52px;
  height: 72px;
}

.card-stack .pile-count {
  position: absolute;
  bottom: -8px;
  right: -4px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 700;
  color: #e2e8f0;
  font-family: monospace;
}

.pile-icon {
  font-size: 11px;
  color: var(--text-muted);
}

.hand-backs {
  display: flex;
  margin-left: -24px;
}

.hand-back-card {
  margin-left: -24px;
}

.pile-count.small {
  font-size: 10px;
  color: var(--text-muted);
}

.pile-section--clickable {
  cursor: pointer;
  border-radius: 4px;
  padding: 2px 4px;
  transition: background 0.15s;
}

.pile-section--clickable:hover {
  background: rgba(255,255,255,0.06);
}

.grave-label {
  font-size: 8px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.grave-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grave-icon {
  font-size: 28px;
  color: #475569;
}

.grave-icon-wrap .pile-count {
  position: absolute;
  bottom: -4px;
  right: -6px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  font-family: monospace;
}

.gold-section {
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 5px;
  border: 1px solid transparent;
  transition: border-color 0.2s, background 0.2s;
}

.gold-section:hover:not(.gold-section--low) {
  border-color: rgba(251, 191, 36, 0.4);
  background: rgba(251, 191, 36, 0.06);
}

.gold-section--active {
  border-color: rgba(251, 191, 36, 0.8) !important;
  background: rgba(251, 191, 36, 0.12) !important;
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.3);
}

.gold-section--low {
  opacity: 0.5;
  cursor: not-allowed !important;
}

.gold-icon {
  font-size: 18px;
  color: #fbbf24;
  transition: transform 0.2s;
}

.gold-icon--enhanced {
  color: #f59e0b;
  filter: drop-shadow(0 0 4px #fbbf24);
}

.gold-count {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
  font-family: monospace;
}

.enhanced-label {
  font-size: 8px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
