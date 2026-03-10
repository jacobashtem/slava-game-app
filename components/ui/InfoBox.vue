<script setup lang="ts">
import { useUIStore } from '../../stores/uiStore'

const ui = useUIStore()
</script>

<template>
  <TransitionGroup name="infobox" tag="div" class="infobox-container">
    <div
      v-for="box in ui.infoBoxes"
      :key="box.id"
      :class="['infobox', `infobox-${box.type}`]"
    >
      <span class="infobox-icon">{{ box.icon }}</span>
      <span class="infobox-text">{{ box.text }}</span>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.infobox-container {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.infobox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06);
  /* backdrop-filter removed for perf */
  white-space: nowrap;
}

.infobox-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.infobox-effect {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(139, 92, 246, 0.5);
  color: #c4b5fd;
}

.infobox-info {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(59, 130, 246, 0.5);
  color: #93c5fd;
}

.infobox-warning {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(251, 191, 36, 0.5);
  color: #fde68a;
}

.infobox-enter-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.infobox-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.infobox-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.95);
}
.infobox-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .infobox-container {
    top: 30px;
  }
  .infobox {
    font-size: 10px;
    padding: 4px 10px;
  }
}
</style>
