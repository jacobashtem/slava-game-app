<script lang="ts">
/**
 * FireVFX — 3D fire particle overlay for elemental attacks on creature cards.
 * Uses TresJS (@tresjs/core) + Three.js for GPU-accelerated fire particles.
 * Client-only: wrapped in <ClientOnly> to avoid SSR issues.
 *
 * Usage:
 *   <FireVFX :active="isOnFire" :intensity="0.8" />
 *
 * Place inside a position:relative parent (e.g. card wrapper, ~160x224px).
 */
import { onUnmounted, defineComponent, h, type PropType } from 'vue'
import { TresCanvas, useLoop } from '@tresjs/core'
import {
  BufferGeometry,
  Float32BufferAttribute,
  AdditiveBlending,
  Color,
  PointsMaterial,
  TextureLoader,
} from 'three'

// ---------------------------------------------------------------------------
// Constants & helpers (shared between outer wrapper and inner FireScene)
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 180

// Card half-dimensions in Three.js world units (camera at z=5, fov=45)
const HALF_W = 1.2
const HALF_H = 1.7

// Color temperature gradient: base (white-yellow) -> tip (dark ember)
const COLOR_STOPS = [
  new Color(1.0, 0.95, 0.6),  // white-yellow (base)
  new Color(1.0, 0.7, 0.1),   // bright orange
  new Color(1.0, 0.35, 0.05), // deep orange
  new Color(0.8, 0.1, 0.02),  // red
  new Color(0.3, 0.02, 0.0),  // dark ember (tip)
]

function lerpColor(out: Color, t: number): void {
  const clamped = Math.max(0, Math.min(1, t))
  const idx = clamped * (COLOR_STOPS.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, COLOR_STOPS.length - 1)
  const frac = idx - lo
  out.r = COLOR_STOPS[lo]!.r + (COLOR_STOPS[hi]!.r - COLOR_STOPS[lo]!.r) * frac
  out.g = COLOR_STOPS[lo]!.g + (COLOR_STOPS[hi]!.g - COLOR_STOPS[lo]!.g) * frac
  out.b = COLOR_STOPS[lo]!.b + (COLOR_STOPS[hi]!.b - COLOR_STOPS[lo]!.b) * frac
}

/** Generate a soft radial-gradient circle as a data-URL texture for particles. */
function createFireTexture(): string {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.15, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.4, 'rgba(255,200,80,0.5)')
  g.addColorStop(0.7, 'rgba(255,80,20,0.15)')
  g.addColorStop(1, 'rgba(255,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return canvas.toDataURL()
}

interface Particle {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  life: number      // 0 = just born, 1 = dead
  maxLife: number
  seed: number       // per-particle random for turbulence phase
  baseSize: number
}

function spawnParticle(p: Particle, intensity: number): void {
  const edge = Math.random()
  if (edge < 0.45) {
    // Bottom edge — main flame source
    p.x = (Math.random() - 0.5) * HALF_W * 2
    p.y = -HALF_H + Math.random() * HALF_H * 0.15
  } else if (edge < 0.7) {
    // Left edge
    p.x = -HALF_W + (Math.random() - 0.5) * HALF_W * 0.15
    p.y = -HALF_H + Math.random() * HALF_H * 1.4
  } else if (edge < 0.95) {
    // Right edge
    p.x = HALF_W - (Math.random() - 0.5) * HALF_W * 0.15
    p.y = -HALF_H + Math.random() * HALF_H * 1.4
  } else {
    // Center (inner flames licking up)
    p.x = (Math.random() - 0.5) * HALF_W * 1.2
    p.y = -HALF_H * 0.5 + Math.random() * HALF_H * 0.5
  }
  p.z = (Math.random() - 0.5) * 0.3

  const speed = (0.5 + Math.random() * 1.5) * intensity
  p.vx = (Math.random() - 0.5) * 0.3
  p.vy = speed
  p.vz = (Math.random() - 0.5) * 0.1

  p.life = 0
  p.maxLife = 0.4 + Math.random() * 0.8
  p.seed = Math.random() * 1000
  p.baseSize = (0.06 + Math.random() * 0.12) * intensity
}

// ---------------------------------------------------------------------------
// FireScene — child component rendered INSIDE TresCanvas so useLoop() works.
// ---------------------------------------------------------------------------
const FireScene = defineComponent({
  name: 'FireScene',
  props: {
    intensity: { type: Number as PropType<number>, default: 0.8 },
    active: { type: Boolean as PropType<boolean>, default: false },
  },
  setup(props) {
    // --- Geometry + Material ---
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))

    const texture = new TextureLoader().load(createFireTexture())
    const material = new PointsMaterial({
      size: 0.2,
      map: texture,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    })

    // --- Particle pool ---
    const particles: Particle[] = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: Particle = {
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 1, maxLife: 1, seed: 0, baseSize: 0.1,
      }
      spawnParticle(p, props.intensity)
      p.life = Math.random() // stagger so they don't all pop in at once
      particles.push(p)
    }

    const tempColor = new Color()
    let elapsed = 0

    function tick(delta: number) {
      const posAttr = geometry.getAttribute('position') as Float32BufferAttribute
      const colAttr = geometry.getAttribute('color') as Float32BufferAttribute

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i]!

        // Advance life (faster fade-out when inactive)
        p.life += delta / p.maxLife
        if (!props.active) p.life += delta * 2.5

        // Respawn or hide
        if (p.life >= 1) {
          if (props.active) {
            spawnParticle(p, props.intensity)
          } else {
            posAttr.setXYZ(i, 0, -10, 0)
            colAttr.setXYZ(i, 0, 0, 0)
            continue
          }
        }

        const t = p.life

        // --- Turbulence (multi-frequency sin waves) ---
        const turbX = Math.sin(elapsed * 8 + p.seed) * 0.4
                     + Math.sin(elapsed * 13 + p.seed * 2.7) * 0.2
        const turbY = Math.sin(elapsed * 6 + p.seed * 1.3) * 0.1
        const turbZ = Math.sin(elapsed * 5 + p.seed * 3.1) * 0.1

        // --- Physics: heat-rise + turbulence ---
        p.vx += turbX * delta * 2
        p.vy += (0.5 + props.intensity * 0.5) * delta
        p.vz += turbZ * delta

        // Damping (lateral drag, vertical stays strong)
        p.vx *= 0.97
        p.vz *= 0.97

        p.x += p.vx * delta
        p.y += (p.vy + turbY) * delta
        p.z += p.vz * delta

        posAttr.setXYZ(i, p.x, p.y, p.z)

        // --- Color from temperature gradient ---
        lerpColor(tempColor, t)

        // Alpha envelope: quick fade-in, sustained, ember fade-out
        let alpha: number
        if (t < 0.05)      alpha = t / 0.05
        else if (t > 0.6)  alpha = 1 - (t - 0.6) / 0.4
        else                alpha = 1
        alpha *= props.intensity

        colAttr.setXYZ(i,
          tempColor.r * alpha,
          tempColor.g * alpha,
          tempColor.b * alpha,
        )
      }

      posAttr.needsUpdate = true
      colAttr.needsUpdate = true

      // Global size flicker (PointsMaterial has a single uniform size)
      material.size = 0.18 * props.intensity * (0.9 + Math.sin(elapsed * 15) * 0.1)
    }

    // --- Render loop via TresJS ---
    const { onBeforeRender } = useLoop()
    onBeforeRender(({ delta }: { delta: number }) => {
      elapsed += delta
      tick(delta)
    })

    // --- Cleanup ---
    onUnmounted(() => {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    })

    return { geometry, material }
  },
  render() {
    return h('TresPoints', [
      h('primitive', { object: this.geometry, attach: 'geometry' }),
      h('primitive', { object: this.material, attach: 'material' }),
    ])
  },
})

// ---------------------------------------------------------------------------
// FireVFX — outer wrapper (the component consumers import)
// ---------------------------------------------------------------------------
export default defineComponent({
  name: 'FireVFX',
  components: { TresCanvas, FireScene },
  props: {
    active: { type: Boolean as PropType<boolean>, required: true },
    intensity: { type: Number as PropType<number>, default: 0.8 },
  },
  setup(props) {
    return { props }
  },
})
</script>

<template>
  <div v-if="active" class="fire-vfx-wrapper">
    <ClientOnly>
      <TresCanvas
        :alpha="true"
        :antialias="false"
        :stencil="false"
        :depth="false"
        power-preference="low-power"
        :clear-color="0x000000"
        style="width: 100%; height: 100%;"
      >
        <TresPerspectiveCamera :position="[0, 0, 5]" :fov="45" />
        <FireScene :active="props.active" :intensity="props.intensity" />
      </TresCanvas>
    </ClientOnly>
  </div>
</template>

<style scoped>
.fire-vfx-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  overflow: hidden;
  border-radius: 8px;
}

/* Ensure the canvas fills the wrapper exactly */
.fire-vfx-wrapper :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
</style>
