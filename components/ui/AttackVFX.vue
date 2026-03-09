<script setup lang="ts">
/**
 * AttackVFX — global screen-level visual effects for attacks.
 * Uses GSAP for smooth screen flashes, camera shakes, and impact effects.
 * Triggered by uiStore.animatingHit + animatingAttackType.
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()

const flashEl = ref<HTMLElement | null>(null)
const screenShakeEl = ref<HTMLElement | null>(null)

// Screen flash colors per attack type
const flashConfigs: Record<number, { color: string; intensity: number; duration: number }> = {
  0: { color: 'rgba(255, 80, 40, 0.12)', intensity: 0.9, duration: 0.25 },  // melee — red flash
  1: { color: 'rgba(251, 146, 60, 0.18)', intensity: 1, duration: 0.4 },    // elemental — orange fire
  2: { color: 'rgba(168, 85, 247, 0.15)', intensity: 1, duration: 0.5 },    // magic — purple
  3: { color: 'rgba(59, 130, 246, 0.1)', intensity: 0.7, duration: 0.2 },   // ranged — blue streak
}

watch(() => ui.animatingHit, (hitId) => {
  if (!hitId || ui.animatingAttackType === null) return

  const config = flashConfigs[ui.animatingAttackType] ?? flashConfigs[0]!

  nextTick(() => {
    // Screen flash
    if (flashEl.value) {
      // Set the flash gradient
      const isElemental = ui.animatingAttackType === 1
      const isMagic = ui.animatingAttackType === 2

      let gradient: string
      if (isElemental) {
        gradient = `radial-gradient(ellipse at center, ${config.color} 0%, rgba(239,68,68,0.06) 40%, transparent 70%)`
      } else if (isMagic) {
        gradient = `radial-gradient(ellipse at center, ${config.color} 0%, rgba(139,92,246,0.05) 40%, transparent 70%)`
      } else {
        gradient = `radial-gradient(ellipse at center, ${config.color} 0%, transparent 65%)`
      }

      gsap.set(flashEl.value, { background: gradient, opacity: 0, display: 'block' })
      gsap.to(flashEl.value, {
        opacity: config.intensity,
        duration: config.duration * 0.3,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(flashEl.value, {
            opacity: 0,
            duration: config.duration * 0.7,
            ease: 'power1.in',
            onComplete: () => {
              if (flashEl.value) gsap.set(flashEl.value, { display: 'none' })
            },
          })
        },
      })
    }

    // Screen shake (subtle — whole board trembles on melee/elemental)
    if (ui.animatingAttackType === 0 || ui.animatingAttackType === 1) {
      const board = document.querySelector('.game-board')
      if (board) {
        const intensity = ui.animatingAttackType === 0 ? 3 : 2
        gsap.to(board, {
          x: `random(-${intensity}, ${intensity})`,
          y: `random(-${intensity / 2}, ${intensity / 2})`,
          duration: 0.05,
          repeat: 5,
          yoyo: true,
          ease: 'power1.inOut',
          onComplete: () => { gsap.set(board, { x: 0, y: 0 }) },
        })
      }
    }
  })
})
</script>

<template>
  <Teleport to="body">
    <div ref="flashEl" class="vfx-screen-flash" style="display: none" />
  </Teleport>
</template>

<style scoped>
.vfx-screen-flash {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9998;
}
</style>
