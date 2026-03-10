<script setup lang="ts">
/**
 * DrainParticles — reusable particle stream between two cards.
 * Used for: lifesteal (Strzyga), soul drain (Baba Jaga, Śmierć),
 * ATK siphon (Bezkost), stat drain (Latawica), etc.
 *
 * Watches uiStore.drainVFX and renders CSS particles flying from source to target.
 * Position is derived from card DOM elements via getBoundingClientRect().
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()
const containerEl = ref<HTMLElement | null>(null)
const particles = ref<{ id: number; x: number; y: number; tx: number; ty: number; color: string; delay: number }[]>([])
let particleId = 0

const colorMap: Record<string, string> = {
  red: '#ef4444',
  purple: '#a855f7',
  green: '#22c55e',
  gold: '#fbbf24',
  cyan: '#22d3ee',
  dark: '#6b21a8',
}

function getCardCenter(instanceId: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

watch(() => ui.drainVFX, (vfx) => {
  if (!vfx) { particles.value = []; return }

  const from = getCardCenter(vfx.from)
  const to = getCardCenter(vfx.to)
  if (!from || !to) return

  const count = 5
  const newParticles = []
  for (let i = 0; i < count; i++) {
    newParticles.push({
      id: ++particleId,
      x: from.x + (Math.random() - 0.5) * 20,
      y: from.y + (Math.random() - 0.5) * 20,
      tx: to.x + (Math.random() - 0.5) * 16,
      ty: to.y + (Math.random() - 0.5) * 16,
      color: colorMap[vfx.color] ?? vfx.color,
      delay: i * 0.08,
    })
  }
  particles.value = newParticles

  nextTick(() => {
    const els = containerEl.value?.querySelectorAll('.drain-dot')
    if (!els) return
    els.forEach((el, i) => {
      const p = newParticles[i]
      if (!p) return
      gsap.fromTo(el, {
        x: 0, y: 0, scale: 1, opacity: 0.9,
      }, {
        x: p.tx - p.x,
        y: p.ty - p.y,
        scale: 0.3,
        opacity: 0,
        duration: 0.7 + Math.random() * 0.3,
        delay: p.delay,
        ease: 'power2.in',
      })
    })
  })
})

onUnmounted(() => { particles.value = [] })
</script>

<template>
  <Teleport to="body">
    <div ref="containerEl" class="drain-container" v-if="particles.length">
      <div
        v-for="p in particles"
        :key="p.id"
        class="drain-dot"
        :style="{
          left: p.x + 'px',
          top: p.y + 'px',
          '--drain-color': p.color,
        }"
      />
      <div
        v-if="ui.drainVFX?.label"
        class="drain-label"
        :style="{
          left: ((particles[0]?.x ?? 0) + (particles[0]?.tx ?? 0)) / 2 + 'px',
          top: ((particles[0]?.y ?? 0) + (particles[0]?.ty ?? 0)) / 2 - 12 + 'px',
        }"
      >{{ ui.drainVFX.label }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.drain-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9995;
}

.drain-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--drain-color, #ef4444);
  box-shadow: 0 0 8px 3px var(--drain-color, #ef4444), 0 0 16px 6px color-mix(in srgb, var(--drain-color) 40%, transparent);
  will-change: transform, opacity;
}

.drain-label {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  color: #fbbf24;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  pointer-events: none;
  white-space: nowrap;
}
</style>
