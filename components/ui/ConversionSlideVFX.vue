<script setup lang="ts">
/**
 * ConversionSlideVFX — flash + glow when a card is converted/taken over.
 * Used for: Wiła (charm), Mara (sacrifice takeover).
 * Shows a colored pulse + label on the converted card.
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()
const active = ref(false)
const glowEl = ref<HTMLElement | null>(null)
const labelEl = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0, w: 0, h: 0 })
const color = ref('#a855f7')
const label = ref('')

const colorMap: Record<string, string> = {
  pink: '#ec4899',
  purple: '#a855f7',
  green: '#22c55e',
  red: '#ef4444',
}

function getCardRect(instanceId: string) {
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`)
  if (!el) return null
  return el.getBoundingClientRect()
}

watch(() => ui.conversionVFX, (vfx) => {
  if (!vfx) { active.value = false; return }

  const rect = getCardRect(vfx.cardId)
  if (!rect) return

  pos.value = { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  color.value = colorMap[vfx.color] ?? vfx.color
  label.value = vfx.label ?? ''
  active.value = true

  nextTick(() => {
    if (glowEl.value) {
      gsap.fromTo(glowEl.value,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1.15, duration: 0.3, ease: 'power2.out',
          onComplete: () => {
            gsap.to(glowEl.value, {
              opacity: 0, scale: 1.3,
              duration: 0.6, ease: 'power1.in',
              onComplete: () => { active.value = false },
            })
          }
        }
      )
    }
    if (labelEl.value) {
      gsap.fromTo(labelEl.value,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.25, delay: 0.1, ease: 'power2.out',
          onComplete: () => {
            gsap.to(labelEl.value, { opacity: 0, y: -15, duration: 0.5, delay: 0.3 })
          }
        }
      )
    }
  })
})

onUnmounted(() => { active.value = false })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="conversion-container">
      <div
        ref="glowEl"
        class="conversion-glow"
        :style="{
          left: pos.x - 8 + 'px',
          top: pos.y - 8 + 'px',
          width: pos.w + 16 + 'px',
          height: pos.h + 16 + 'px',
          '--conv-color': color,
        }"
      />
      <div
        v-if="label"
        ref="labelEl"
        class="conversion-label"
        :style="{
          left: pos.x + pos.w / 2 + 'px',
          top: pos.y - 18 + 'px',
          '--conv-color': color,
        }"
      >{{ label }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.conversion-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9995;
}

.conversion-glow {
  position: absolute;
  border-radius: 8px;
  border: 2px solid var(--conv-color, #a855f7);
  box-shadow:
    0 0 16px var(--conv-color, #a855f7),
    0 0 32px color-mix(in srgb, var(--conv-color) 40%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--conv-color) 20%, transparent);
  will-change: transform, opacity;
}

.conversion-label {
  position: absolute;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0,0,0,0.9);
  background: color-mix(in srgb, var(--conv-color) 70%, #000);
  padding: 2px 10px;
  border-radius: 4px;
  white-space: nowrap;
  will-change: transform, opacity;
}
</style>
