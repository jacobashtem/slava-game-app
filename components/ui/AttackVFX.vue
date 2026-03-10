<script setup lang="ts">
/**
 * AttackVFX — global screen-level visual effects for attacks.
 * Uses GSAP for smooth screen flashes, camera shakes, and impact effects.
 * Triggered by uiStore.animatingHit + animatingAttackType.
 */
import { ref, watch, nextTick } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()

const flashEl = ref<HTMLElement | null>(null)
const ringEl = ref<HTMLElement | null>(null)

// Screen flash colors per attack type (longer durations for visual impact)
const flashConfigs: Record<number, { color: string; intensity: number; duration: number }> = {
  0: { color: 'rgba(255, 80, 40, 0.16)', intensity: 0.9, duration: 0.5 },   // melee — red flash
  1: { color: 'rgba(251, 146, 60, 0.22)', intensity: 1, duration: 0.7 },    // elemental — orange fire
  2: { color: 'rgba(168, 85, 247, 0.2)', intensity: 1, duration: 0.8 },     // magic — purple
  3: { color: 'rgba(59, 130, 246, 0.14)', intensity: 0.85, duration: 0.4 }, // ranged — blue streak
}

watch(() => ui.animatingHit, (hitId) => {
  if (!hitId || ui.animatingAttackType === null) return

  const atkType = ui.animatingAttackType
  const config = flashConfigs[atkType] ?? flashConfigs[0]!

  nextTick(() => {
    // Screen flash
    if (flashEl.value) {
      let gradient: string
      if (atkType === 1) {
        // Elemental: fiery ring gradient
        gradient = `radial-gradient(ellipse at center, ${config.color} 0%, rgba(255,80,20,0.08) 35%, transparent 65%)`
      } else if (atkType === 2) {
        // Magic: soft purple haze
        gradient = `radial-gradient(ellipse at center, ${config.color} 0%, rgba(139,92,246,0.06) 40%, transparent 65%)`
      } else if (atkType === 3) {
        // Ranged: directional streak (top → center)
        gradient = `linear-gradient(180deg, ${config.color} 0%, rgba(59,130,246,0.05) 40%, transparent 70%)`
      } else {
        gradient = `radial-gradient(ellipse at center, ${config.color} 0%, transparent 60%)`
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

    // Magic: expanding ring ripple (slower expansion)
    if (atkType === 2 && ringEl.value) {
      gsap.set(ringEl.value, { display: 'block', scale: 0.1, opacity: 0.7 })
      gsap.to(ringEl.value, {
        scale: 2.8, opacity: 0,
        duration: 1.0, ease: 'power2.out',
        onComplete: () => { if (ringEl.value) gsap.set(ringEl.value, { display: 'none' }) },
      })
    }

    // Screen shake — melee (heavy) / elemental (medium) / magic (subtle pulse)
    const board = document.querySelector('.game-board')
    if (board) {
      if (atkType === 0) {
        // Melee: heavy slam shake (slower, more dramatic)
        gsap.to(board, {
          x: 'random(-5, 5)', y: 'random(-3, 3)',
          duration: 0.07, repeat: 7, yoyo: true, ease: 'power1.inOut',
          onComplete: () => { gsap.set(board, { x: 0, y: 0 }) },
        })
      } else if (atkType === 1) {
        // Elemental: rumble (slower)
        gsap.to(board, {
          x: 'random(-3, 3)', y: 'random(-2, 2)',
          duration: 0.08, repeat: 5, yoyo: true, ease: 'power1.inOut',
          onComplete: () => { gsap.set(board, { x: 0, y: 0 }) },
        })
      } else if (atkType === 2) {
        // Magic: single pulse outward (deeper)
        gsap.fromTo(board, { scale: 1 },
          { scale: 1.008, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.out',
            onComplete: () => { gsap.set(board, { scale: 1 }) } }
        )
      }
    }
  })
})
</script>

<template>
  <Teleport to="body">
    <div ref="flashEl" class="vfx-screen-flash" style="display: none" />
    <div ref="ringEl" class="vfx-magic-ring" style="display: none" />
  </Teleport>
</template>

<style scoped>
.vfx-screen-flash {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9998;
}

.vfx-magic-ring {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 200px;
  height: 200px;
  margin: -100px 0 0 -100px;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.5);
  box-shadow: 0 0 30px 8px rgba(139, 92, 246, 0.3), inset 0 0 20px 4px rgba(168, 85, 247, 0.15);
  pointer-events: none;
  z-index: 9997;
}
</style>
