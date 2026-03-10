<script setup lang="ts">
/**
 * AoEWave — radial/linear pulse effect originating from a card.
 * Used for: Morowa Dziewica (plague wave), Żar-ptak (fire nova),
 * Północnica (ice wave), Światogor (line slam).
 *
 * Watches uiStore.aoeWaveVFX and renders an expanding ring/line from the source card.
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()
const waveEl = ref<HTMLElement | null>(null)
const active = ref(false)
const waveStyle = ref<Record<string, string>>({})

function getCardCenter(instanceId: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

watch(() => ui.aoeWaveVFX, (vfx) => {
  if (!vfx) { active.value = false; return }

  const center = getCardCenter(vfx.sourceId)
  if (!center) return

  active.value = true

  if (vfx.shape === 'radial') {
    waveStyle.value = {
      left: center.x + 'px',
      top: center.y + 'px',
      width: '80px',
      height: '80px',
      marginLeft: '-40px',
      marginTop: '-40px',
      borderRadius: '50%',
      background: `radial-gradient(circle, ${vfx.color} 0%, transparent 70%)`,
    }
  } else {
    // Line: horizontal sweep from card
    waveStyle.value = {
      left: center.x + 'px',
      top: center.y - 30 + 'px',
      width: '40px',
      height: '60px',
      marginLeft: '-20px',
      borderRadius: '4px',
      background: `linear-gradient(90deg, transparent, ${vfx.color}, transparent)`,
    }
  }

  nextTick(() => {
    if (!waveEl.value) return
    if (vfx.shape === 'radial') {
      gsap.fromTo(waveEl.value, {
        scale: 0.3, opacity: 0.8,
      }, {
        scale: 5, opacity: 0,
        duration: 1.0, ease: 'power2.out',
        onComplete: () => { active.value = false },
      })
    } else {
      gsap.fromTo(waveEl.value, {
        scaleX: 1, opacity: 0.7,
      }, {
        scaleX: 20, opacity: 0,
        duration: 0.8, ease: 'power2.out',
        onComplete: () => { active.value = false },
      })
    }
  })
})

onUnmounted(() => { active.value = false })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" ref="waveEl" class="aoe-wave" :style="waveStyle" />
  </Teleport>
</template>

<style scoped>
.aoe-wave {
  position: fixed;
  pointer-events: none;
  z-index: 9994;
  will-change: transform, opacity;
}
</style>
