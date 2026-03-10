<script setup lang="ts">
/**
 * EggHatchVFX — crack + burst effect when Smocze Jajo hatches.
 * Watches uiStore.eggHatchVFX and renders:
 *   1. Crack lines on the egg card position
 *   2. Golden-green burst explosion
 *   3. 3 card silhouettes "flying out"
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import gsap from 'gsap'

const ui = useUIStore()
const active = ref(false)
const containerEl = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0, w: 0, h: 0 })

function getCardRect(instanceId: string) {
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`)
  if (!el) return null
  return el.getBoundingClientRect()
}

watch(() => ui.eggHatchVFX, (vfx) => {
  if (!vfx) { active.value = false; return }

  const rect = getCardRect(vfx.sourceId)
  if (!rect) return

  pos.value = { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  active.value = true

  nextTick(() => {
    if (!containerEl.value) return

    // Phase 1: Crack shards split apart (0-0.5s)
    const shards = containerEl.value.querySelectorAll('.egg-crack-shard')
    shards.forEach((el, i) => {
      const angle = (i * 90 + 45) * Math.PI / 180
      gsap.fromTo(el, { opacity: 0.8, x: 0, y: 0, rotation: 0 }, {
        opacity: 0,
        x: Math.cos(angle) * 30,
        y: Math.sin(angle) * 30,
        rotation: (i % 2 === 0 ? 1 : -1) * 25,
        duration: 0.5, delay: 0.3 + i * 0.05,
        ease: 'power2.out',
      })
    })

    // Phase 2: Burst (0.5s)
    const burst = containerEl.value.querySelector('.egg-burst')
    if (burst) {
      gsap.fromTo(burst, { scale: 0.3, opacity: 0.9 }, {
        scale: 4, opacity: 0,
        duration: 0.8, delay: 0.4,
        ease: 'power2.out',
      })
    }

    // Phase 3: Card silhouettes fly out (0.5-1.2s)
    const cards = containerEl.value.querySelectorAll('.egg-card-out')
    cards.forEach((el, i) => {
      const angle = -60 + i * 60 // -60, 0, 60 degrees
      const rad = (angle * Math.PI) / 180
      const dist = 120 + Math.random() * 40
      gsap.fromTo(el, {
        x: 0, y: 0, scale: 0.3, opacity: 1, rotation: 0,
      }, {
        x: Math.sin(rad) * dist,
        y: -Math.cos(rad) * dist,
        scale: 0.8,
        opacity: 0,
        rotation: angle * 0.5,
        duration: 0.7,
        delay: 0.5 + i * 0.1,
        ease: 'power2.out',
      })
    })

    // Cleanup
    gsap.delayedCall(1.8, () => { active.value = false })
  })
})

onUnmounted(() => { active.value = false })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" ref="containerEl" class="egg-hatch-container">
      <!-- Crack overlay on egg card -->
      <div
        class="egg-crack-overlay"
        :style="{
          left: pos.x + 'px',
          top: pos.y + 'px',
          width: pos.w + 'px',
          height: pos.h + 'px',
        }"
      >
        <div class="egg-crack-shard shard-1" />
        <div class="egg-crack-shard shard-2" />
        <div class="egg-crack-shard shard-3" />
        <div class="egg-crack-shard shard-4" />
      </div>

      <!-- Golden-green burst -->
      <div
        class="egg-burst"
        :style="{
          left: pos.x + pos.w / 2 + 'px',
          top: pos.y + pos.h / 2 + 'px',
        }"
      />

      <!-- 3 card silhouettes flying out -->
      <div
        v-for="n in 3"
        :key="n"
        class="egg-card-out"
        :style="{
          left: pos.x + pos.w / 2 + 'px',
          top: pos.y + pos.h / 2 + 'px',
        }"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.egg-hatch-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9996;
}

.egg-crack-overlay {
  position: absolute;
  pointer-events: none;
  overflow: visible;
  border-radius: 6px;
}

.egg-crack-shard {
  position: absolute;
  background: linear-gradient(135deg, rgba(200,168,78,0.6), rgba(251,191,36,0.3));
  border: 1px solid rgba(251,191,36,0.5);
  border-radius: 2px;
  will-change: transform, opacity;
}
.shard-1 { top: 10%; left: 15%; width: 35%; height: 40%; clip-path: polygon(20% 0%, 100% 30%, 80% 100%, 0% 70%); }
.shard-2 { top: 5%;  left: 50%; width: 40%; height: 45%; clip-path: polygon(0% 20%, 100% 0%, 90% 100%, 10% 80%); }
.shard-3 { top: 45%; left: 10%; width: 40%; height: 45%; clip-path: polygon(10% 0%, 90% 20%, 100% 100%, 0% 80%); }
.shard-4 { top: 50%; left: 45%; width: 45%; height: 40%; clip-path: polygon(0% 10%, 100% 0%, 80% 100%, 20% 90%); }

.egg-burst {
  position: absolute;
  width: 60px;
  height: 60px;
  margin-left: -30px;
  margin-top: -30px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.7) 0%, rgba(34, 197, 94, 0.4) 40%, transparent 70%);
  will-change: transform, opacity;
}

.egg-card-out {
  position: absolute;
  width: 24px;
  height: 34px;
  margin-left: -12px;
  margin-top: -17px;
  border-radius: 3px;
  background: linear-gradient(165deg, #c8a84e 0%, #22c55e 100%);
  border: 1px solid rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
  will-change: transform, opacity;
}
</style>
