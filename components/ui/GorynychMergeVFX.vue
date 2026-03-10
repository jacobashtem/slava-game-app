<script setup lang="ts">
/**
 * GorynychMergeVFX — dragon cards pulled into Gorynych + growth burst.
 * Watches uiStore.gorynychMergeVFX. Renders:
 *   1. Source dragon cards sliding toward Gorynych (GSAP translate)
 *   2. Fire particles trailing behind
 *   3. Growth burst on Gorynych at the end
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()
const active = ref(false)
const containerEl = ref<HTMLElement | null>(null)
const mergeItems = ref<{ id: number; sx: number; sy: number; tx: number; ty: number }[]>([])
const burstPos = ref({ x: 0, y: 0 })
const showBurst = ref(false)
let itemId = 0

function getCardCenter(instanceId: string) {
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

watch(() => ui.gorynychMergeVFX, (vfx) => {
  if (!vfx) { active.value = false; showBurst.value = false; return }

  const target = getCardCenter(vfx.targetId)
  if (!target) return

  burstPos.value = target
  const items: typeof mergeItems.value = []

  for (const srcId of vfx.sourceIds) {
    const src = getCardCenter(srcId)
    if (!src) continue
    items.push({
      id: ++itemId,
      sx: src.x, sy: src.y,
      tx: target.x, ty: target.y,
    })
  }

  if (items.length === 0) return
  mergeItems.value = items
  active.value = true
  showBurst.value = false

  nextTick(() => {
    if (!containerEl.value) return

    // Animate each source dragon flying to Gorynych
    const dots = containerEl.value.querySelectorAll('.merge-dragon')
    dots.forEach((el, i) => {
      const item = items[i]
      if (!item) return
      gsap.fromTo(el, {
        x: 0, y: 0, scale: 1, opacity: 0.9,
      }, {
        x: item.tx - item.sx,
        y: item.ty - item.sy,
        scale: 0.2,
        opacity: 0,
        duration: 0.6,
        delay: i * 0.15,
        ease: 'power2.in',
      })
    })

    // Fire burst on Gorynych after dragons absorbed
    const burstDelay = 0.6 + items.length * 0.15
    gsap.delayedCall(burstDelay, () => {
      showBurst.value = true
      nextTick(() => {
        const burst = containerEl.value?.querySelector('.merge-burst')
        if (burst) {
          gsap.fromTo(burst, { scale: 0.3, opacity: 1 }, {
            scale: 4, opacity: 0,
            duration: 0.7, ease: 'power2.out',
            onComplete: () => { active.value = false; showBurst.value = false },
          })
        }
      })
    })
  })
})

onUnmounted(() => { active.value = false })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" ref="containerEl" class="merge-container">
      <!-- Dragon orbs flying to Gorynych -->
      <div
        v-for="item in mergeItems"
        :key="item.id"
        class="merge-dragon"
        :style="{
          left: item.sx + 'px',
          top: item.sy + 'px',
        }"
      />

      <!-- Growth burst at Gorynych position -->
      <div
        v-if="showBurst"
        class="merge-burst"
        :style="{
          left: burstPos.x + 'px',
          top: burstPos.y + 'px',
        }"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.merge-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9995;
}

.merge-dragon {
  position: absolute;
  width: 20px;
  height: 20px;
  margin-left: -10px;
  margin-top: -10px;
  border-radius: 50%;
  background: radial-gradient(circle, #fbbf24 0%, #ef4444 50%, transparent 70%);
  box-shadow: 0 0 12px rgba(251, 146, 60, 0.7), 0 0 24px rgba(239, 68, 68, 0.4);
  will-change: transform, opacity;
}

.merge-burst {
  position: absolute;
  width: 50px;
  height: 50px;
  margin-left: -25px;
  margin-top: -25px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.8) 0%, rgba(239, 68, 68, 0.5) 30%, rgba(251, 146, 60, 0.2) 60%, transparent 80%);
  will-change: transform, opacity;
}
</style>
