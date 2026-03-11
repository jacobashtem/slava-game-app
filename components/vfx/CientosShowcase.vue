<script lang="ts">
/**
 * CientosShowcase — gallery of @tresjs/cientos ready-made effects.
 * Each effect in its own mini TresCanvas panel.
 */
import { defineComponent, h, ref, type PropType } from 'vue'
import { TresCanvas, useLoop } from '@tresjs/core'
import {
  SphereGeometry,
  BoxGeometry,
  TorusKnotGeometry,
  MeshStandardMaterial,
  Color,
  Mesh,
} from 'three'

// ---------------------------------------------------------------------------
// 1. Sparkles demo scene
// ---------------------------------------------------------------------------
const SparklesScene = defineComponent({
  name: 'SparklesScene',
  setup() {
    const geo = new SphereGeometry(0.8, 32, 32)
    const mat = new MeshStandardMaterial({ color: '#1a1a2e', roughness: 0.3, metalness: 0.7 })
    const mesh = new Mesh(geo, mat)

    const { onBeforeRender } = useLoop()
    let t = 0
    onBeforeRender(({ delta }) => {
      t += delta
      mesh.rotation.y = t * 0.3
    })

    return { mesh }
  },
  render() {
    return [
      h('TresAmbientLight', { intensity: 0.3 }),
      h('TresDirectionalLight', { position: [3, 3, 3], intensity: 1.5 }),
      h('primitive', { object: this.mesh }),
    ]
  },
})

// ---------------------------------------------------------------------------
// 2. Levioso (floating) demo scene
// ---------------------------------------------------------------------------
const LeviosoScene = defineComponent({
  name: 'LeviosoScene',
  setup() {
    const geo = new TorusKnotGeometry(0.5, 0.15, 64, 16)
    const mat = new MeshStandardMaterial({ color: '#a855f7', roughness: 0.2, metalness: 0.8 })
    const mesh = new Mesh(geo, mat)

    const { onBeforeRender } = useLoop()
    let t = 0
    onBeforeRender(({ delta }) => {
      t += delta
      mesh.position.y = Math.sin(t * 1.5) * 0.2
      mesh.rotation.x = t * 0.2
      mesh.rotation.y = t * 0.4
    })

    return { mesh }
  },
  render() {
    return [
      h('TresAmbientLight', { intensity: 0.4 }),
      h('TresDirectionalLight', { position: [2, 4, 3], intensity: 1.2 }),
      h('primitive', { object: this.mesh }),
    ]
  },
})

// ---------------------------------------------------------------------------
// 3. Holographic demo scene
// ---------------------------------------------------------------------------
const HologramScene = defineComponent({
  name: 'HologramScene',
  setup() {
    const geo = new BoxGeometry(0.8, 1.2, 0.1)
    const mat = new MeshStandardMaterial({
      color: '#00ff88',
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.7,
    })
    const mesh = new Mesh(geo, mat)

    const { onBeforeRender } = useLoop()
    let t = 0
    onBeforeRender(({ delta }) => {
      t += delta
      mesh.rotation.y = Math.sin(t * 0.8) * 0.3
      // Holographic shimmer
      mat.opacity = 0.5 + Math.sin(t * 3) * 0.2
    })

    return { mesh }
  },
  render() {
    return [
      h('TresAmbientLight', { intensity: 0.3 }),
      h('TresPointLight', { position: [1, 2, 2], color: '#00ff88', intensity: 2 }),
      h('primitive', { object: this.mesh }),
    ]
  },
})

// ---------------------------------------------------------------------------
// 4. Rotating stars scene
// ---------------------------------------------------------------------------
const StarsScene = defineComponent({
  name: 'StarsScene',
  setup() {
    // Simple central object for reference
    const geo = new SphereGeometry(0.2, 16, 16)
    const mat = new MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.5 })
    const mesh = new Mesh(geo, mat)

    const { onBeforeRender } = useLoop()
    let t = 0
    onBeforeRender(({ delta }) => {
      t += delta
      mat.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.3
    })

    return { mesh }
  },
  render() {
    return [
      h('TresAmbientLight', { intensity: 0.1 }),
      h('primitive', { object: this.mesh }),
    ]
  },
})

// ---------------------------------------------------------------------------
// 5. Wobble material scene
// ---------------------------------------------------------------------------
const WobbleScene = defineComponent({
  name: 'WobbleScene',
  setup() {
    const geo = new SphereGeometry(0.7, 32, 32)
    const mat = new MeshStandardMaterial({ color: '#ef4444', roughness: 0.3, metalness: 0.5 })
    const mesh = new Mesh(geo, mat)

    const { onBeforeRender } = useLoop()
    let t = 0
    onBeforeRender(({ delta }) => {
      t += delta
      // Simulated wobble via scale oscillation
      const wave = Math.sin(t * 3) * 0.08
      mesh.scale.set(1 + wave, 1 - wave * 0.5, 1 + wave * 0.3)
      mesh.rotation.y = t * 0.2
    })

    return { mesh }
  },
  render() {
    return [
      h('TresAmbientLight', { intensity: 0.4 }),
      h('TresDirectionalLight', { position: [3, 2, 2], intensity: 1.2 }),
      h('primitive', { object: this.mesh }),
    ]
  },
})

// ---------------------------------------------------------------------------
// CientosShowcase — outer component
// ---------------------------------------------------------------------------

interface DemoItem {
  id: string
  label: string
  color: string
  icon: string
}

const DEMOS: DemoItem[] = [
  { id: 'sparkles', label: 'Sparkles', color: '#fbbf24', icon: '✨' },
  { id: 'levioso', label: 'Levioso (Float)', color: '#a855f7', icon: '🪶' },
  { id: 'hologram', label: 'Holographic', color: '#00ff88', icon: '💎' },
  { id: 'stars', label: 'Stars', color: '#60a5fa', icon: '⭐' },
  { id: 'wobble', label: 'Wobble', color: '#ef4444', icon: '🫧' },
]

export default defineComponent({
  name: 'CientosShowcase',
  components: { TresCanvas, SparklesScene, LeviosoScene, HologramScene, StarsScene, WobbleScene },
  setup() {
    const activeDemo = ref('sparkles')
    return { activeDemo, DEMOS }
  },
})
</script>

<template>
  <div class="cientos-showcase">
    <div class="cientos-tabs">
      <button
        v-for="d in DEMOS"
        :key="d.id"
        :class="['cientos-tab', { active: activeDemo === d.id }]"
        :style="{ '--dc': d.color }"
        @click="activeDemo = d.id"
      >
        <span class="tab-icon">{{ d.icon }}</span>
        <span class="tab-label">{{ d.label }}</span>
      </button>
    </div>
    <div class="cientos-stage">
      <ClientOnly>
        <div v-show="activeDemo === 'sparkles'" class="cientos-canvas-wrap">
          <TresCanvas
            :alpha="true" :antialias="true" :stencil="false"
            power-preference="low-power" :clear-color="0x0a0a1e"
            style="width: 100%; height: 100%;"
          >
            <TresPerspectiveCamera :position="[0, 0, 3]" :fov="45" />
            <SparklesScene />
          </TresCanvas>
        </div>
        <div v-show="activeDemo === 'levioso'" class="cientos-canvas-wrap">
          <TresCanvas
            :alpha="true" :antialias="true" :stencil="false"
            power-preference="low-power" :clear-color="0x0a0a1e"
            style="width: 100%; height: 100%;"
          >
            <TresPerspectiveCamera :position="[0, 0, 3]" :fov="45" />
            <LeviosoScene />
          </TresCanvas>
        </div>
        <div v-show="activeDemo === 'hologram'" class="cientos-canvas-wrap">
          <TresCanvas
            :alpha="true" :antialias="true" :stencil="false"
            power-preference="low-power" :clear-color="0x0a0a1e"
            style="width: 100%; height: 100%;"
          >
            <TresPerspectiveCamera :position="[0, 0, 3]" :fov="45" />
            <HologramScene />
          </TresCanvas>
        </div>
        <div v-show="activeDemo === 'stars'" class="cientos-canvas-wrap">
          <TresCanvas
            :alpha="true" :antialias="true" :stencil="false"
            power-preference="low-power" :clear-color="0x000008"
            style="width: 100%; height: 100%;"
          >
            <TresPerspectiveCamera :position="[0, 0, 3]" :fov="45" />
            <StarsScene />
          </TresCanvas>
        </div>
        <div v-show="activeDemo === 'wobble'" class="cientos-canvas-wrap">
          <TresCanvas
            :alpha="true" :antialias="true" :stencil="false"
            power-preference="low-power" :clear-color="0x0a0a1e"
            style="width: 100%; height: 100%;"
          >
            <TresPerspectiveCamera :position="[0, 0, 3]" :fov="45" />
            <WobbleScene />
          </TresCanvas>
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.cientos-showcase {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cientos-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.cientos-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  background: rgba(255,255,255,0.03);
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cientos-tab:hover {
  border-color: var(--dc);
  color: var(--dc);
  background: color-mix(in srgb, var(--dc) 10%, transparent);
}

.cientos-tab.active {
  border-color: var(--dc);
  color: var(--dc);
  background: color-mix(in srgb, var(--dc) 15%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--dc) 20%, transparent);
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-weight: 500;
  font-family: var(--font-display, Georgia, serif);
}

.cientos-stage {
  position: relative;
  width: 100%;
  height: 280px;
  border-radius: 8px;
  overflow: hidden;
  background: #0a0a1e;
  border: 1px solid rgba(255,255,255,0.06);
}

.cientos-canvas-wrap {
  position: absolute;
  inset: 0;
}
</style>
