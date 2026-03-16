<script setup lang="ts">
/**
 * ResurrectVFX — "Wij Wstaje z Martwych"
 * WebGPU + TSL + GSAP + Canvas particles resurrection effect.
 *
 * Phases:
 *   1. Ground crack — dark energy seeps through fractures, screen trembles
 *   2. Necrotic portal — swirling green-gold vortex erupts from below
 *   3. Spirit wisps — dark ghosts spiral around the card
 *   4. Resurrection burst — golden shockwave, card revealed in divine glow
 *   5. Runic circle fades — ancient symbols dissolve into embers
 *
 * API: <ResurrectVFX ref="r" />  →  r.play(targetEl)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

let THREE_GPU: typeof import('three/webgpu') | null = null
let TSL: {
  Fn: any; float: any; vec3: any; vec4: any
  uv: any; time: any; uniform: any; smoothstep: any
  mix: any; exp: any; max: any; abs: any; mx_noise_float: any; sin: any; cos: any
} | null = null

const containerRef = ref<HTMLDivElement | null>(null)
const threeCanvasRef = ref<HTMLCanvasElement | null>(null)
const sparkCanvasRef = ref<HTMLCanvasElement | null>(null)

const gpuReady = ref(false)
const gpuError = ref<string | null>(null)

let renderer: any = null
let scene: any = null
let camera: any = null
let rafHandle = -1

let sparks: Spark[] = []
let sCtx: CanvasRenderingContext2D | null = null
let mounted = false
let loopActive = false
const pendingTimeouts: number[] = []

// ===== WEBGPU + TSL MATERIALS =====

interface PortalObj { mesh: any; uProgress: any; uIntensity: any }
interface BurstObj { mesh: any; uProgress: any; uIntensity: any }
interface RuneObj { mesh: any; uProgress: any; uIntensity: any }

let portalObj: PortalObj | null = null
let burstObj: BurstObj | null = null
let runeObj: RuneObj | null = null

function createPortalMaterial(): PortalObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float, sin, cos } = TSL

  const uProgress = uniform(0.0)
  const uIntensity = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time
    const px = p.x.sub(0.5)
    const py = p.y.sub(0.5)
    const dist = px.mul(px).add(py.mul(py)).sqrt()
    const angle = Fn(() => {
      return mx_noise_float(vec3(px.mul(2.0), py.mul(2.0), float(0.0))).mul(6.28)
    })()

    // Swirling vortex
    const swirl = sin(dist.mul(12.0).sub(t.mul(4.0)).add(angle)).mul(0.5).add(0.5)
    const n1 = mx_noise_float(vec3(
      px.mul(4.0).add(cos(t.mul(1.5)).mul(0.5)),
      py.mul(4.0).add(sin(t.mul(1.2)).mul(0.5)),
      t.mul(2.0)
    ))

    // Ring shape — hollow center, energy at edges
    const innerRing = smoothstep(float(0.08), float(0.15), dist)
    const outerRing = smoothstep(float(0.45), float(0.35), dist)
    const ringMask = innerRing.mul(outerRing)

    // Combine swirl + noise + ring
    const density = ringMask.mul(swirl.mul(0.6).add(n1.mul(0.4))).mul(uIntensity)

    // Green-gold necrotic color palette
    const greenGlow = vec3(0.15, 0.85, 0.3)
    const goldGlow = vec3(0.95, 0.75, 0.2)
    const darkCore = vec3(0.02, 0.12, 0.04)
    const color = mix(darkCore, mix(greenGlow, goldGlow, swirl), density)

    return vec4(color, density.mul(uProgress))
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 32)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uProgress, uIntensity }
}

function createBurstMaterial(): BurstObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, sin } = TSL

  const uProgress = uniform(0.0)
  const uIntensity = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const px = p.x.sub(0.5)
    const py = p.y.sub(0.5)
    const dist = px.mul(px).add(py.mul(py)).sqrt()

    // Expanding shockwave ring
    const ringRadius = uProgress.mul(0.5)
    const ringWidth = float(0.04)
    const ringMask = exp(dist.sub(ringRadius).abs().negate().div(ringWidth))

    // Inner bright core
    const coreSize = float(0.05).mul(float(1.0).sub(uProgress))
    const coreMask = exp(dist.mul(dist).negate().div(coreSize.mul(coreSize).add(0.001)))

    // Rays emanating outward
    const angle = Fn(() => {
      const a = px.atan2(py)
      return sin(a.mul(8.0).add(uProgress.mul(6.28))).mul(0.5).add(0.5)
    })()
    const rayMask = angle.mul(smoothstep(float(0.3), float(0.0), dist)).mul(float(1.0).sub(uProgress))

    const brightness = ringMask.add(coreMask.mul(3.0)).add(rayMask.mul(0.5))

    // Divine gold-white
    const coreColor = vec3(1.0, 0.98, 0.85)
    const edgeColor = vec3(0.95, 0.75, 0.15)
    const color = mix(edgeColor, coreColor, coreMask)

    return vec4(color, brightness.mul(uIntensity))
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 32)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uProgress, uIntensity }
}

function createRuneCircleMaterial(): RuneObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float, sin, cos } = TSL

  const uProgress = uniform(0.0)
  const uIntensity = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time
    const px = p.x.sub(0.5)
    const py = p.y.sub(0.5)
    const dist = px.mul(px).add(py.mul(py)).sqrt()

    // Thin rotating circle
    const circleWidth = float(0.015)
    const circleRadius = float(0.38)
    const circleMask = exp(dist.sub(circleRadius).abs().negate().div(circleWidth))

    // Inner circle
    const innerCircle = exp(dist.sub(float(0.2)).abs().negate().div(float(0.008)))

    // Rune glyphs — segments around the circle
    const angle = px.atan2(py)
    const segments = sin(angle.mul(12.0).add(t.mul(0.8))).mul(0.5).add(0.5)
    const runeGlow = segments.mul(circleMask).mul(0.8)

    // Rotation indicator dots
    const dotAngle = angle.add(t.mul(1.5))
    const dots = smoothstep(float(0.97), float(1.0), sin(dotAngle.mul(6.0)))
      .mul(circleMask)

    const brightness = runeGlow.add(innerCircle.mul(0.3)).add(dots.mul(0.5))

    // Ethereal green-gold
    const runeColor = mix(vec3(0.1, 0.7, 0.25), vec3(0.85, 0.7, 0.15), segments)

    return vec4(runeColor, brightness.mul(uIntensity).mul(uProgress))
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 32)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uProgress, uIntensity }
}

// ===== INIT =====

async function initWebGPU() {
  try {
    ;[THREE_GPU, TSL] = await Promise.all([
      import('three/webgpu'),
      import('three/tsl').then(m => ({
        Fn: m.Fn, float: m.float, vec3: m.vec3, vec4: m.vec4,
        uv: m.uv, time: m.time, uniform: m.uniform, smoothstep: m.smoothstep,
        mix: m.mix, exp: m.exp, max: m.max, abs: m.abs, mx_noise_float: m.mx_noise_float,
        sin: m.sin, cos: m.cos,
      })),
    ])

    const canvas = threeCanvasRef.value!
    renderer = new THREE_GPU.WebGPURenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    renderer.setClearColor(0x000000, 0)
    await renderer.init()

    scene = new THREE_GPU.Scene()
    camera = new THREE_GPU.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10)
    camera.position.z = 1

    portalObj = createPortalMaterial()
    burstObj = createBurstMaterial()
    runeObj = createRuneCircleMaterial()

    scene.add(portalObj.mesh)
    scene.add(burstObj.mesh)
    scene.add(runeObj.mesh)

    gpuReady.value = true
  } catch (e: any) {
    gpuError.value = e.message
    gpuReady.value = false
  }
}

// ===== SPARK PARTICLES =====

function emitSpiritWisps(cx: number, cy: number, w: number, h: number) {
  for (let i = 0; i < 15; i++) {
    const angle = (Math.PI * 2 * i) / 15
    const r = w * 0.3 + Math.random() * w * 0.15
    sparks.push(acquireSpark({
      x: cx + Math.cos(angle) * r * 0.3,
      y: cy + h * 0.2 + Math.random() * h * 0.1,
      vx: Math.cos(angle) * 1.5,
      vy: -2 - Math.random() * 3,
      size: 3 + Math.random() * 4,
      opacity: 0.8,
      color: ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#fde68a'][Math.floor(Math.random() * 5)]!,
      life: -Math.random() * 10,
      maxLife: 30 + Math.random() * 20,
      gravity: -0.15,
      friction: 0.96,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.2,
      shape: 'ember',
      scale: 1,
      scaleSpeed: -0.01,
    }))
  }
}

function emitGoldenBurst(cx: number, cy: number, w: number) {
  for (let i = 0; i < 30; i++) {
    const angle = (Math.PI * 2 * i) / 30 + Math.random() * 0.3
    const speed = 3 + Math.random() * 5
    sparks.push(acquireSpark({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      opacity: 1,
      color: ['#fbbf24', '#fde68a', '#f59e0b', '#ffffff', '#22c55e'][Math.floor(Math.random() * 5)]!,
      life: 0,
      maxLife: 20 + Math.random() * 15,
      gravity: -0.05,
      friction: 0.94,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      shape: 'ember',
      scale: 1.5,
      scaleSpeed: -0.03,
    }))
  }
}

function emitDarkSpirits(cx: number, cy: number, w: number, h: number) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8
    sparks.push(acquireSpark({
      x: cx + Math.cos(angle) * w * 0.2,
      y: cy + h * 0.1,
      vx: Math.cos(angle + Math.PI / 2) * 2,
      vy: -1.5 - Math.random() * 2,
      size: 6 + Math.random() * 8,
      opacity: 0.5,
      color: ['#1a1a2e', '#16213e', '#0f3460', '#2d1b69'][Math.floor(Math.random() * 4)]!,
      life: -Math.random() * 8,
      maxLife: 40 + Math.random() * 20,
      gravity: -0.08,
      friction: 0.98,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.15,
      shape: 'ember',
      scale: 2,
      scaleSpeed: -0.02,
    }))
  }
}

// ===== PLAY =====

let currentTl: gsap.core.Timeline | null = null

async function play(targetEl: HTMLElement): Promise<void> {
  if (!mounted) return
  return new Promise<void>((resolve) => {
    const rect = targetEl.getBoundingClientRect()
    const container = containerRef.value
    if (!container) { resolve(); return }

    const cRect = container.getBoundingClientRect()
    const cx = rect.left + rect.width / 2 - cRect.left
    const cy = rect.top + rect.height / 2 - cRect.top
    const w = rect.width
    const h = rect.height

    // Position spark canvas
    const sc = sparkCanvasRef.value
    if (sc) {
      sc.width = cRect.width
      sc.height = cRect.height
      sCtx = sc.getContext('2d')
    }

    // Position WebGPU canvas
    const tc = threeCanvasRef.value
    if (tc && renderer) {
      tc.style.left = `${cx - w * 0.6}px`
      tc.style.top = `${cy - h * 0.6}px`
      tc.style.width = `${w * 1.2}px`
      tc.style.height = `${h * 1.2}px`
      renderer.setSize(w * 1.2, h * 1.2)
    }

    // Show meshes
    if (portalObj) { portalObj.mesh.visible = true; portalObj.uProgress.value = 0; portalObj.uIntensity.value = 0 }
    if (burstObj) { burstObj.mesh.visible = true; burstObj.uProgress.value = 0; burstObj.uIntensity.value = 0 }
    if (runeObj) { runeObj.mesh.visible = true; runeObj.uProgress.value = 0; runeObj.uIntensity.value = 0 }

    // Start render loop
    if (!loopActive) {
      loopActive = true
      rafLoop.add('resurrect-vfx', () => {
        if (renderer && scene && camera) renderer.renderAsync(scene, camera)
        if (sCtx && sparkCanvasRef.value) {
          sCtx.clearRect(0, 0, sparkCanvasRef.value.width, sparkCanvasRef.value.height)
          tickSparks(sparks, sCtx)
        }
      })
    }

    // ===== TIMELINE =====
    const tl = gsap.timeline({
      onComplete: () => {
        cleanup()
        resolve()
      },
    })
    currentTl = tl

    // Phase 1: Screen shake + dark flash (0–0.5s)
    tl.to(targetEl, { x: -4, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, 0)
    tl.fromTo(container, { backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: 'rgba(10,20,10,0.3)', duration: 0.3, yoyo: true, repeat: 1 }, 0)

    // Phase 2: Rune circle appears (0.3–1.5s)
    if (runeObj) {
      tl.to(runeObj.uProgress, { value: 1, duration: 0.8, ease: 'power2.out' }, 0.3)
      tl.to(runeObj.uIntensity, { value: 0.7, duration: 0.5, ease: 'power2.out' }, 0.3)
    }

    // Phase 3: Portal opens (0.5–2s)
    if (portalObj) {
      tl.to(portalObj.uProgress, { value: 1, duration: 1.2, ease: 'power2.inOut' }, 0.5)
      tl.to(portalObj.uIntensity, { value: 1.0, duration: 0.8, ease: 'power2.out' }, 0.5)
    }

    // Phase 3b: Dark spirit wisps (0.8s)
    tl.call(() => emitDarkSpirits(cx, cy, w, h), [], 0.8)
    tl.call(() => emitSpiritWisps(cx, cy, w, h), [], 1.0)

    // Phase 4: Card rises from below (1.2–2s)
    tl.fromTo(targetEl,
      { y: 30, opacity: 0, scale: 0.8, filter: 'brightness(0.3) saturate(0)' },
      { y: 0, opacity: 1, scale: 1, filter: 'brightness(1.5) saturate(1.2)', duration: 0.8, ease: 'back.out(1.4)' },
      1.2
    )

    // Phase 5: Golden burst (1.8s)
    if (burstObj) {
      tl.to(burstObj.uIntensity, { value: 1.5, duration: 0.3, ease: 'power4.out' }, 1.8)
      tl.to(burstObj.uProgress, { value: 1, duration: 0.6, ease: 'power2.out' }, 1.8)
      tl.to(burstObj.uIntensity, { value: 0, duration: 0.4 }, 2.2)
    }
    tl.call(() => emitGoldenBurst(cx, cy, w), [], 1.8)

    // Phase 6: Card settles + divine glow (2–2.5s)
    tl.to(targetEl, { filter: 'brightness(1) saturate(1)', duration: 0.5, ease: 'power2.inOut' }, 2.0)

    // Phase 7: Portal + runes fade (2.2–3s)
    if (portalObj) tl.to(portalObj.uIntensity, { value: 0, duration: 0.6 }, 2.2)
    if (runeObj) tl.to(runeObj.uIntensity, { value: 0, duration: 0.8 }, 2.2)

    // More spirit particles during climax
    tl.call(() => emitSpiritWisps(cx, cy, w, h), [], 1.5)
  })
}

function cleanup() {
  loopActive = false
  rafLoop.remove('resurrect-vfx')
  sparks.length = 0
  if (portalObj) portalObj.mesh.visible = false
  if (burstObj) burstObj.mesh.visible = false
  if (runeObj) runeObj.mesh.visible = false
  if (sCtx && sparkCanvasRef.value) {
    sCtx.clearRect(0, 0, sparkCanvasRef.value.width, sparkCanvasRef.value.height)
  }
}

onMounted(async () => {
  mounted = true
  await initWebGPU()
})

onUnmounted(() => {
  mounted = false
  cleanup()
  if (currentTl) currentTl.kill()
  for (const t of pendingTimeouts) clearTimeout(t)
  if (renderer) { renderer.dispose(); renderer = null }
})

defineExpose({ play })
</script>

<template>
  <div ref="containerRef" class="resurrect-vfx-container">
    <canvas ref="threeCanvasRef" class="resurrect-vfx-three" />
    <canvas ref="sparkCanvasRef" class="resurrect-vfx-sparks" />
  </div>
</template>

<style scoped>
.resurrect-vfx-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 150;
  overflow: hidden;
}
.resurrect-vfx-three {
  position: absolute;
  pointer-events: none;
  z-index: 151;
}
.resurrect-vfx-sparks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 152;
}
</style>
