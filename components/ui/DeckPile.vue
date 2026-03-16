<script setup lang="ts">
import { Icon } from '@iconify/vue'
import CardBack from '../cards/CardBack.vue'

const props = defineProps<{
  deckCount: number
  handCount: number
  graveCount: number
  glory?: number
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
        <span class="pile-count deck-count">{{ deckCount }}</span>
      </div>
    </div>

    <!-- Punkty Sławy (PS) -->
    <div
      v-if="glory !== undefined"
      :class="['pile-section', 'gold-section', { 'gold-section--active': !isAI && enhancedActive, 'gold-section--low': !isAI && (glory ?? 0) < 1 }]"
      v-tip="isAI ? 'PS przeciwnika' : ((glory ?? 0) >= 1 ? 'Punkty Sławy — kliknij aby zagrać kartę wzmocnioną (1 PS)' : 'Za mało PS na wzmocnienie')"
      @click="!isAI && (glory ?? 0) >= 1 ? emit('toggle-enhanced') : undefined"
      :style="isAI ? {} : { cursor: 'pointer' }"
    >
      <div class="gold-display">
        <Icon icon="game-icons:laurel-crown" class="gold-icon" style="color: #86efac;" />
        <span class="gold-count" style="color: #86efac;">{{ glory }}</span>
      </div>
      <span class="glory-label">PS</span>
      <span v-if="!isAI && enhancedActive" class="enhanced-label">
        <Icon icon="game-icons:lightning-trio" class="enhanced-icon" />
        WZM.
      </span>
    </div>

    <!-- Ornament -->
    <div class="pile-ornament" />

    <!-- Cmentarz -->
    <div class="pile-section pile-section--clickable" v-tip="'Cmentarz (kliknij aby przeglądać)'" @click="emit('open-graveyard')">
      <div class="grave-wrap">
        <Icon icon="game-icons:tombstone" class="grave-icon" />
        <span class="grave-count">{{ graveCount }}</span>
      </div>
      <span class="grave-label">Cmentarz</span>
    </div>
  </div>
</template>

<style scoped>
.deck-pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(200, 168, 78, 0.04) 0%, transparent 70%),
    linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(10,10,20,0.6) 100%);
  border: 1px solid rgba(200, 168, 78, 0.15);
  border-radius: 10px;
  min-width: 68px;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* Subtle runic corner */
.deck-pile::before {
  content: '᛭';
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 8px;
  color: rgba(200, 168, 78, 0.15);
  pointer-events: none;
}

.pile-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  position: relative;
}

.card-stack {
  position: relative;
  width: 52px;
  height: 72px;
}

.pile-count {
  position: absolute;
  bottom: -6px;
  right: -4px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(200, 168, 78, 0.25);
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 800;
  color: #e2e8f0;
  font-family: var(--font-display, Georgia, serif);
  z-index: 2;
}

.pile-ornament {
  width: 80%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.2), transparent);
}

/* ===== ZŁOTO ===== */
.gold-section {
  gap: 3px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(134, 239, 172, 0.2);
  background: rgba(134, 239, 172, 0.04);
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  box-shadow: 0 0 8px rgba(134, 239, 172, 0.05);
}

.gold-section:hover:not(.gold-section--low) {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(251, 191, 36, 0.08);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.1);
}

.gold-section--active {
  border-color: rgba(251, 191, 36, 0.8) !important;
  background: rgba(251, 191, 36, 0.15) !important;
  box-shadow: 0 0 16px rgba(251, 191, 36, 0.25), inset 0 0 8px rgba(251, 191, 36, 0.05);
  animation: gold-active-glow 2s ease-in-out infinite;
}

@keyframes gold-active-glow {
  0%, 100% { box-shadow: 0 0 12px rgba(251, 191, 36, 0.2); }
  50%      { box-shadow: 0 0 20px rgba(251, 191, 36, 0.4), 0 0 6px rgba(251, 191, 36, 0.2); }
}

.gold-section--low {
  opacity: 0.4;
  cursor: not-allowed !important;
  border-color: rgba(100, 116, 139, 0.15);
  background: transparent;
}

.gold-display {
  display: flex;
  align-items: center;
  gap: 4px;
}

.gold-icon {
  font-size: 24px;
  color: #86efac;
  filter: drop-shadow(0 0 6px rgba(134, 239, 172, 0.4));
}

.gold-count {
  font-family: var(--font-display, Georgia, serif);
  font-size: 26px;
  font-weight: 500;
  color: #86efac;
  text-shadow: 0 0 10px rgba(134, 239, 172, 0.3), 0 0 20px rgba(134, 239, 172, 0.1);
  line-height: 1;
}

.glory-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: rgba(134, 239, 172, 0.6);
  text-transform: uppercase;
}

.enhanced-label {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 7px;
  font-weight: 800;
  color: #fbbf24;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 4px rgba(251, 191, 36, 0.4);
}

.enhanced-icon {
  width: 10px;
  height: 10px;
}

/* ===== CMENTARZ ===== */
.pile-section--clickable {
  cursor: pointer;
  border-radius: 6px;
  padding: 4px 6px;
  transition: background 0.15s ease;
}

.pile-section--clickable:hover {
  background: rgba(100, 116, 139, 0.12);
}
.pile-section--clickable:hover .grave-icon {
  color: #94a3b8;
  filter: drop-shadow(0 0 6px rgba(148, 163, 184, 0.3));
}

.grave-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grave-icon {
  font-size: 26px;
  color: #475569;
  transition: color 0.2s ease, filter 0.2s ease;
}

.grave-count {
  position: absolute;
  bottom: -3px;
  right: -6px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 10px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  font-family: var(--font-display, Georgia, serif);
}

.grave-label {
  font-size: 7px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .deck-pile {
    gap: 6px;
    padding: 6px 4px;
    min-width: 0;
    border: none;
    background: transparent;
  }
  .deck-pile::before { display: none; }
  .card-stack {
    width: 42px;
    height: 58px;
  }
  .gold-section {
    padding: 4px 6px;
  }
  .gold-icon { font-size: 16px; }
  .gold-count { font-size: 16px; }
  .grave-icon { font-size: 22px; }
  .pile-count { font-size: 10px; }
  .grave-count { font-size: 9px; }
}
</style>
