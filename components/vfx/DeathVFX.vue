<script setup lang="ts">
/**
 * DeathVFX — "Cień Odchodzi" (Shadow Departs)
 * WebGPU + TSL death dissolution effect.
 *
 * Phases:
 *   1. Dark smoke veil gathers around card edges
 *   2. Smoke thickens, rises — card area consumed by dark mist
 *   3. Soul wisp (bright orb) emerges from center
 *   4. Soul rises gently, trailing light motes
 *   5. Smoke dissipates, card space is empty
 *
 * API: <DeathVFX ref="r" />  →  r.play(targetEl)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

let THREE_GPU: typeof import('three/webgpu') | null = null
let TSL: {
  Fn: any; float: any; vec3: any; vec4: any
  uv: any; time: any; uniform: any; smoothstep: any
  mix: any; exp: any; max: any; abs: any; mx_noise_float: any; sin: any
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

interface SmokeObj { mesh: any; uProgress: any; uIntensity: any }
interface SoulObj { mesh: any; uIntensity: any }

let smokeObj: SmokeObj | null = null
let soulObj: SoulObj | null = null

function createSmokeMaterial(): SmokeObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float } = TSL

  const uProgress = uniform(0.0)
  const uIntensity = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.NormalBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time

    // Card area = bottom 60% of plane, smoke rises into top 40%
    const px = p.x
    const py = float(1.0).sub(p.y) // flip Y: 0 = bottom (card), 1 = top (smoke rises to)

    // Multi-octave noise — scrolling upward for rising smoke effect
    const scroll = uProgress.mul(1.5)
    const n1 = mx_noise_float(vec3(px.mul(3.0), py.mul(2.5).sub(t.mul(0.4)).sub(scroll), t.mul(1.2)))
    const n2 = mx_noise_float(vec3(px.mul(6.0), py.mul(5.0).sub(t.mul(0.7)).sub(scroll.mul(1.5)), t.mul(1.8)))
    const n3 = mx_noise_float(vec3(px.mul(1.5), py.mul(1.2).sub(t.mul(0.2)).sub(scroll.mul(0.7)), t.mul(0.6)))

    // Combined noise
    const noise = n1.mul(0.5).add(n2.mul(0.25)).add(n3.mul(0.25))

    // Coverage: smoke rises from bottom. At progress=0, no smoke. At progress=1, fully covered.
    const coverHeight = uProgress.mul(1.8) // rises above card area
    const heightMask = smoothstep(coverHeight, coverHeight.sub(0.4), py)

    // Noise-modulated density
    const density = heightMask.mul(smoothstep(float(0.3), float(0.6), noise))

    // Edge fade (soft edges on sides)
    const edgeFadeX = smoothstep(float(0.0), float(0.1), px).mul(smoothstep(float(1.0), float(0.9), px))

    // Warm dissolution edge — subtle glow where smoke meets clear area
    const dissolveFront = smoothstep(coverHeight.sub(0.05), coverHeight.sub(0.2), py)
    const edgeGlow = dissolveFront.mul(float(1.0).sub(dissolveFront)).mul(4.0).mul(noise)

    // Colors
    const smokeColor = vec3(0.04, 0.02, 0.07) // deep dark purple-black
    const edgeWarm = vec3(0.35, 0.12, 0.06)   // warm ember tint at dissolution front
    const color = mix(smokeColor, edgeWarm, edgeGlow.mul(0.5))

    const alpha = density.mul(edgeFadeX).mul(uIntensity)

    return vec4(color, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 32)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uProgress, uIntensity }
}

function createSoulMaterial(): SoulObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float, sin } = TSL

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

    // Pulsing, organic shape — slightly deformed by noise
    const pulse = float(1.0).add(sin(t.mul(5.0)).mul(0.15))
    const nShape = mx_noise_float(vec3(px.mul(6.0), py.mul(6.0), t.mul(3.0)))
    const distort = dist.add(nShape.mul(0.04))

    // Bright core
    const coreSize = float(0.06).mul(pulse)
    const coreMask = exp(distort.mul(distort).negate().div(coreSize.mul(coreSize)))

    // Soft outer glow
    const glowSize = float(0.18).mul(pulse)
    const glowMask = exp(distort.mul(distort).negate().div(glowSize.mul(glowSize)))

    // Wispy tendrils trailing downward
    const tendrilNoise = mx_noise_float(vec3(px.mul(10.0), py.mul(8.0).add(t.mul(2.0)), t.mul(1.5)))
    const tendrilMask = smoothstep(float(0.0), float(0.15), py.negate()) // only below center
      .mul(smoothstep(float(0.3), float(0.0), dist))
      .mul(tendrilNoise)
      .mul(0.3)

    // Colors: warm white core → golden glow → faint trail
    const coreColor = vec3(1.0, 0.97, 0.9)
    const glowColor = vec3(0.9, 0.7, 0.35)
    const tendrilColor = vec3(0.7, 0.5, 0.2)

    const color = mix(mix(tendrilColor, glowColor, glowMask), coreColor, coreMask)
    const alpha = coreMask.add(glowMask.mul(0.5)).add(tendrilMask).mul(uIntensity)

    return vec4(color, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 24, 24)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uIntensity }
}

// ===== ANIMATION LOOP =====

function startLoop() {
  if (loopActive) return
  loopActive = true
  rafHandle = rafLoop.register(animate)
}

function stopLoop() {
  loopActive = false
  if (rafHandle >= 0) { rafLoop.unregister(rafHandle); rafHandle = -1 }
}

function animate() {
  if (!mounted || !loopActive) return

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }

  if (sCtx && sparkCanvasRef.value) {
    const w = sparkCanvasRef.value.width / (window.devicePixelRatio || 1)
    const h = sparkCanvasRef.value.height / (window.devicePixelRatio || 1)
    sCtx.clearRect(0, 0, w, h)
    tickSparks(sparks, sCtx!)
  }
}

// ===== COORDINATE HELPERS =====

function s2t(sx: number, sy: number, W: number, H: number) {
  return { x: sx - W / 2, y: -(sy - H / 2) }
}

// ===== PUBLIC: play(targetEl) =====

let isPlaying = false
let currentTl: gsap.core.Timeline | null = null
let lastAnimatedEl: HTMLElement | null = null
let lastAnimatedCardInner: HTMLElement | null = null
let lastOrigFilter: string | null = null

function play(targetEl: HTMLElement): Promise<void> {
  // Restore previous target's styles (showcase/arena reuse)
  if (lastAnimatedEl && lastAnimatedEl.isConnected) {
    lastAnimatedEl.style.visibility = ''
    gsap.set(lastAnimatedEl, { opacity: 1, scale: 1, y: 0 })
    if (lastAnimatedCardInner) {
      gsap.set(lastAnimatedCardInner, { filter: lastOrigFilter || 'none', boxShadow: 'none' })
    }
    lastAnimatedEl = null
    lastAnimatedCardInner = null
  }
  if (isPlaying || !gpuReady.value) return Promise.resolve()
  if (!containerRef.value || !renderer || !scene || !camera) return Promise.resolve()
  if (!smokeObj || !soulObj) return Promise.resolve()
  let _resolve: (() => void) | null = null
  const promise = new Promise<void>(r => { _resolve = r })
  isPlaying = true

  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0

  const container = containerRef.value
  const sceneEl = targetEl.closest('.game-board') || targetEl.closest('.va-battlefield') || targetEl.closest('.p3-arena-row') || targetEl.closest('.p3-arena-row-mini') || container.parentElement!
  const sceneRect = sceneEl.getBoundingClientRect()
  const W = sceneRect.width
  const H = sceneRect.height

  container.style.width = W + 'px'
  container.style.height = H + 'px'
  container.style.left = '0px'
  container.style.top = '0px'

  renderer.setSize(W, H)
  camera.left = -W / 2; camera.right = W / 2
  camera.top = H / 2; camera.bottom = -H / 2
  camera.updateProjectionMatrix()

  const dpr = window.devicePixelRatio || 1
  if (sparkCanvasRef.value) {
    sparkCanvasRef.value.width = W * dpr
    sparkCanvasRef.value.height = H * dpr
    sparkCanvasRef.value.style.width = W + 'px'
    sparkCanvasRef.value.style.height = H + 'px'
    sCtx = sparkCanvasRef.value.getContext('2d')
    if (sCtx) sCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const tRect = targetEl.getBoundingClientRect()
  const tcx = tRect.left - sceneRect.left + tRect.width / 2
  const tcy = tRect.top - sceneRect.top + tRect.height / 2
  const tw = tRect.width
  const th = tRect.height

  container.style.display = 'block'
  startLoop()

  const smoke = smokeObj!
  const soul = soulObj!

  // Position smoke plane: covers card + extra space above for rising smoke
  const smokeH = th * 2.2
  const smokeCY = tcy - th * 0.3 // shifted up so extra space is above card
  const sp = s2t(tcx, smokeCY, W, H)
  smoke.mesh.position.set(sp.x, sp.y, 1)
  smoke.mesh.scale.set(tw * 1.4, smokeH, 1)
  smoke.mesh.visible = true
  smoke.uProgress.value = 0
  smoke.uIntensity.value = 0

  // Soul wisp starts at card center, will rise
  const soulP = s2t(tcx, tcy, W, H)
  soul.mesh.position.set(soulP.x, soulP.y, 2)
  soul.mesh.scale.set(50, 50, 1)
  soul.mesh.visible = false
  soul.uIntensity.value = 0

  // Save original card styles for restoration
  const cardInner = targetEl.querySelector('.card-inner') || targetEl
  const origFilter = (cardInner as HTMLElement).style.filter
  const origTransform = targetEl.style.transform

  // Store ref so we can restore on next play() call (showcase/arena reuse)
  lastAnimatedEl = targetEl
  lastAnimatedCardInner = cardInner as HTMLElement
  lastOrigFilter = origFilter

  if (currentTl) currentTl.kill()
  const tl = gsap.timeline({
    onComplete: () => {
      isPlaying = false
      currentTl = null
      container.style.display = 'none'
      smoke.mesh.visible = false
      soul.mesh.visible = false
      sparks = []
      stopLoop()
      // Do NOT clear inline styles here — the card stays hidden until Vue
      // removes it from DOM via safeUpdateState(). Clearing visibility/opacity
      // would flash the card for 1 frame before removal.
      // For arena/showcase reuse, styles are restored at start of next play().
      _resolve?.()
    },
  })
  currentTl = tl

  // ── Phase 1: Card darkens + smoke gathers + card sinks (single pass, no re-brighten) ──
  tl.to(cardInner, {
    filter: 'brightness(0) saturate(0)',
    boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)',
    duration: 0.7, ease: 'power2.in',
  })
  tl.to(targetEl, {
    opacity: 0.3, scale: 0.85, y: 15,
    duration: 0.7, ease: 'power2.in',
  }, '<')
  tl.to(smoke.uIntensity, { value: 0.85, duration: 0.35, ease: 'power2.out' }, '<')
  tl.to(smoke.uProgress, { value: 1.0, duration: 0.7, ease: 'power1.in' }, '<')

  // Dark smoke particles from card edges
  tl.call(() => {
    for (let i = 0; i < 14; i++) {
      const edge = Math.random() > 0.5
      const sx = tcx + (edge ? (Math.random() > 0.5 ? -1 : 1) * tw * 0.5 : (Math.random() - 0.5) * tw)
      const sy = tcy + (Math.random() - 0.5) * th * 0.8
      sparks.push(acquireSpark(sx, sy, {
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.5 - Math.random() * 1.0,
        life: 0.7, decay: 0.012,
        size: 10 + Math.random() * 15,
        color: '15,10,25',
        type: 'smoke',
        gravity: -0.02, friction: 0.995, alpha: 0.5,
      }))
    }
  }, undefined, 0.1)

  // ── Phase 2: Card fully gone + soul emerges ──
  tl.to(targetEl, {
    opacity: 0, scale: 0.6, y: 30, duration: 0.3, ease: 'power3.in',
    onComplete: () => {
      // Hide card so Vue re-render can't flash it back
      targetEl.style.visibility = 'hidden'
    },
  })

  // Soul wisp emerges as card vanishes
  tl.call(() => {
    soul.mesh.visible = true
    gsap.to(soul.uIntensity, { value: 1.5, duration: 0.4, ease: 'power2.out' })
  }, undefined, '-=0.2')

  // Soul motes
  tl.call(() => {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 5 + Math.random() * 15
      sparks.push(acquireSpark(tcx + Math.cos(a) * r, tcy + Math.sin(a) * r, {
        vx: Math.cos(a) * -0.3, vy: -0.3 - Math.random() * 0.4,
        life: 0.6, decay: 0.02, size: 1.5 + Math.random(),
        color: '255,230,170', type: 'soul', gravity: -0.02, friction: 0.98, alpha: 0.8,
      }))
    }
  }, undefined, '-=0.05')

  // ── Phase 3: Soul rises ──
  const soulRiseTarget = s2t(tcx, tcy - th * 1.5, W, H)
  tl.to(soul.mesh.position, { y: soulRiseTarget.y, duration: 0.8, ease: 'power1.out' })
  tl.to(soul.uIntensity, { value: 0, duration: 0.6, ease: 'power2.in' }, '-=0.3')

  // Trail motes
  const trailObj = { progress: 0 }
  tl.to(trailObj, {
    progress: 1, duration: 0.5,
    onUpdate: () => {
      if (Math.random() > 0.6) {
        const cy = tcy - trailObj.progress * th * 1.2
        sparks.push(acquireSpark(tcx + (Math.random() - 0.5) * 8, cy, {
          vx: (Math.random() - 0.5) * 0.5, vy: 0.1 + Math.random() * 0.3,
          life: 0.4, decay: 0.025, size: 1 + Math.random(),
          color: '255,210,130', type: 'soul', gravity: 0.01, friction: 0.99, alpha: 0.6,
        }))
      }
    },
  }, '<')

  // ── Phase 4: Smoke fades + ash ──
  tl.to(smoke.uIntensity, { value: 0, duration: 0.4, ease: 'power2.in' }, '-=0.2')

  // Ash drifting
  tl.call(() => {
    for (let i = 0; i < 8; i++) {
      pendingTimeouts.push(setTimeout(() => {
        sparks.push(acquireSpark(
          tcx + (Math.random() - 0.5) * tw * 0.8,
          tcy - th * 0.3 + (Math.random() - 0.5) * th * 0.3,
          {
            vx: (Math.random() - 0.5) * 0.3, vy: 0.2 + Math.random() * 0.4,
            life: 0.7, decay: 0.012, size: 2 + Math.random() * 2,
            color: '80,70,90', type: 'ash', gravity: 0.02, friction: 0.997, alpha: 0.3,
          }
        ))
      }, i * 40) as unknown as number)
    }
  }, undefined, '-=0.3')

  return promise
}

// ===== LIFECYCLE =====

async function initWebGPU() {
  try {
    if (!navigator.gpu) {
      gpuError.value = 'WebGPU nie jest wspierany w tej przeglądarce'
      return
    }

    const [gpuModule, tslModule] = await Promise.all([
      import('three/webgpu'),
      import('three/tsl'),
    ])

    THREE_GPU = gpuModule
    TSL = {
      Fn: tslModule.Fn, float: tslModule.float,
      vec3: tslModule.vec3, vec4: tslModule.vec4,
      uv: tslModule.uv, time: tslModule.time,
      uniform: tslModule.uniform, smoothstep: tslModule.smoothstep,
      mix: tslModule.mix, exp: tslModule.exp,
      max: tslModule.max, abs: tslModule.abs,
      mx_noise_float: tslModule.mx_noise_float,
      sin: tslModule.sin,
    }

    const canvas = threeCanvasRef.value
    if (!canvas) return

    renderer = new THREE_GPU.WebGPURenderer({ canvas, alpha: true, antialias: true })
    await renderer.init()
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(window.devicePixelRatio)

    scene = new THREE_GPU.Scene()
    camera = new THREE_GPU.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.z = 10

    smokeObj = createSmokeMaterial()
    scene.add(smokeObj.mesh)

    soulObj = createSoulMaterial()
    scene.add(soulObj.mesh)

    // Render one clear frame so the canvas buffer is transparent before first play()
    renderer.render(scene, camera)

    gpuReady.value = true
    console.info('[DeathVFX] Initialized successfully')
  } catch (e: any) {
    console.warn('[DeathVFX] Init failed:', e)
    gpuError.value = e.message || 'WebGPU init failed'
  }
}

onMounted(() => {
  mounted = true
  initWebGPU()
})

onUnmounted(() => {
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0
  mounted = false
  if (currentTl) { currentTl.kill(); currentTl = null }
  stopLoop()
  smokeObj?.mesh.geometry?.dispose()
  smokeObj?.mesh.material?.dispose()
  soulObj?.mesh.geometry?.dispose()
  soulObj?.mesh.material?.dispose()
  renderer?.dispose()
  renderer = null; scene = null; camera = null
})

defineExpose({ play, gpuReady, gpuError })
</script>

<template>
  <div ref="containerRef" class="death-vfx-overlay" style="display: none;">
    <canvas ref="threeCanvasRef" class="death-three-canvas" />
    <canvas ref="sparkCanvasRef" class="death-spark-canvas" />
  </div>
</template>

<style scoped>
.death-vfx-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  overflow: hidden;
}
.death-three-canvas,
.death-spark-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: transparent;
}
.death-three-canvas { z-index: 10; }
.death-spark-canvas { z-index: 12; }
</style>
