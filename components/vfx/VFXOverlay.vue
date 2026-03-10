<script setup lang="ts">
/**
 * VFXOverlay — single overlay for ALL game VFX.
 *
 * Mounted once in GameBoard, covers the entire viewport.
 * Reads from useVFXOrchestrator().queue and renders matching effects.
 *
 * Current effects:
 *   1. Damage numbers (floating text via GSAP)
 *
 * Architecture:
 *   - HTML layer for text/labels (damage numbers, status text)
 *   - TresJS canvas layer will be added later for particles/shaders
 *   - Position is pre-captured at emit time (meta.pos) — NOT queried from DOM
 *     (card may be dead/removed by the time the watcher fires)
 */
import { watch, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { useVFXOrchestrator, type VFXEvent } from '../../composables/useVFXOrchestrator'

const vfx = useVFXOrchestrator()

let overlayEl: HTMLElement | null = null

onMounted(() => {
  overlayEl = document.querySelector('.vfx-overlay')
  vfx.setReady(true)
})

onUnmounted(() => {
  vfx.setReady(false)
  vfx.clear()
  overlayEl = null
})

/**
 * Render a single damage number: create DOM element, animate with GSAP, cleanup.
 * Position comes from meta.pos (pre-captured before state update).
 */
function renderDamageNumber(event: VFXEvent) {
  if (!overlayEl) {
    vfx.complete(event.id)
    return
  }

  // Use pre-captured position from meta (snapshotted before state update)
  const pos = event.meta?.pos as { x: number; y: number } | undefined
  if (!pos) {
    vfx.complete(event.id)
    return
  }

  // Create floating damage element
  const el = document.createElement('div')
  el.className = 'vfx-damage-number'
  el.textContent = `-${event.value}`
  // Position at card center, offset down slightly so it's visible even near top edge
  el.style.left = `${pos.x}px`
  el.style.top = `${pos.y + 20}px`
  el.style.color = event.color ?? '#ef4444'

  if (event.label) {
    el.classList.add('vfx-damage-counter')
  }

  overlayEl.appendChild(el)

  // GSAP tween: pop in big, float DOWN, fade out slowly (compositor-only: transform + opacity)
  gsap.fromTo(el,
    { y: 0, opacity: 0, scale: 0.3 },
    {
      keyframes: [
        { opacity: 1, scale: 1, duration: 0.15, ease: 'back.out(2)' },
        { opacity: 1, scale: 1, y: 20, duration: 0.8, ease: 'none' },
        { opacity: 0, y: 40, duration: 0.5, ease: 'power2.in' },
      ],
      onComplete: () => {
        el.remove()
        vfx.complete(event.id)
      },
    }
  )
}

// Watch the VFX queue and dispatch to renderers
watch(
  () => vfx.queue.value,
  (events) => {
    for (const event of events) {
      if ((event as any)._processing) continue
      ;(event as any)._processing = true

      switch (event.type) {
        case 'damage-number':
          renderDamageNumber(event)
          break
        default:
          vfx.complete(event.id)
      }
    }
  },
  { deep: true }
)
</script>

<template>
  <div
    class="vfx-overlay"
    aria-hidden="true"
  />
</template>

<style scoped>
.vfx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}
</style>

<style>
/* Damage number — unscoped so dynamically created elements get the styles */
.vfx-damage-number {
  position: absolute;
  font-family: var(--font-display, Georgia, serif);
  font-size: 42px;
  font-weight: 500;
  text-shadow:
    0 2px 6px rgba(0, 0, 0, 0.9),
    0 0 12px currentColor,
    0 0 24px currentColor;
  pointer-events: none;
  transform: translateX(-50%);
  z-index: 10000;
  white-space: nowrap;
  will-change: transform, opacity;
  letter-spacing: -0.02em;
}

.vfx-damage-counter {
  font-size: 34px;
}
</style>
