<script setup lang="ts">
/**
 * AttackVFX — per-attack-type visual effects rendered on hit target card.
 * Pure CSS animations — no external deps.
 * Watches uiStore.animatingHit + animatingAttackType.
 */
import { computed } from 'vue'
import { useUIStore } from '../../stores/uiStore'

const ui = useUIStore()

const isActive = computed(() => !!ui.animatingHit && ui.animatingAttackType !== null)
const attackType = computed(() => ui.animatingAttackType)
</script>

<template>
  <!-- VFX particles are rendered inside CreatureCard via class injection.
       This component provides global overlay effects (screen flash, etc.) -->
  <Teleport to="body">
    <!-- Screen flash on elemental attacks -->
    <div v-if="isActive && attackType === 1" class="vfx-screen-flash vfx-elemental-flash" />
    <!-- Screen flash on magic attacks -->
    <div v-if="isActive && attackType === 2" class="vfx-screen-flash vfx-magic-flash" />
  </Teleport>
</template>

<style scoped>
.vfx-screen-flash {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  animation: screen-flash 0.4s ease-out forwards;
}

.vfx-elemental-flash {
  background: radial-gradient(ellipse at center, rgba(251, 146, 60, 0.15) 0%, transparent 70%);
}

.vfx-magic-flash {
  background: radial-gradient(ellipse at center, rgba(168, 85, 247, 0.12) 0%, transparent 70%);
}

@keyframes screen-flash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
</style>
