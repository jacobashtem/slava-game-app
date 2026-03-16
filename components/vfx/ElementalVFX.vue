<script setup lang="ts">
/**
 * ElementalVFX — "Żar Żywiołu" (Elemental Blaze)
 * WebGPU + TSL elemental attack effect.
 *
 * Phases:
 *   1. Fire orb forms at attacker with swirling energy
 *   2. Orb launches along arc toward defender
 *   3. Impact: expanding fire ring + flash
 *   4. Flame embers scatter from impact point
 *
 * API: <ElementalVFX ref="r" />  →  r.play(attackerEl, defenderEl, damage?)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

let THREE_GPU: typeof import('three/webgpu') | null = null
let TSL: {
  Fn: any; float: any; vec3: any; vec4: any
  uv: any; time: any; uniform: any; smoothstep: any
  mix: any; exp: any; abs: any; mx_noise_float: any; sin: any; cos: any; atan: any; max: any
} | null = null

const containerRef = ref<HTMLDivElement | null>(null)
const threeCanvasRef = ref<HTMLCanvasElement | null>(null)
const sparkCanvasRef = ref<HTMLCanvasElement | null>(null)
const flashRef = ref<HTMLDivElement | null>(null)
const dmgRef = ref<HTMLDivElement | null>(null)

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

function spawnEmbers(cx: number, cy: number, count: number, spread: number, color = '255,140,30') {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 4
    sparks.push(acquireSpark(cx, cy, {
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0.4 + Math.random() * 0.5, decay: 0.012,
      size: 1.5 + Math.random() * 2, color,
      type: 'ember', gravity: 0.06, friction: 0.97,
    }))
  }
}

// ===== WEBGPU MATERIALS =====

interface OrbObj { mesh: any; uIntensity: any; uCharge: any }
interface ImpactObj { mesh: any; uIntensity: any; uExpand: any }

let orbObj: OrbObj | null = null
let impactObj: ImpactObj | null = null

function createFireOrbMaterial(): OrbObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float, sin } = TSL

  const uIntensity = uniform(0.0)
  const uCharge = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time
    const px = p.x.sub(0.5)
    const py = p.y.sub(0.5)
    const dist = px.mul(px).add(py.mul(py)).sqrt()

    // Fire noise — turbulent, multi-octave
    const n1 = mx_noise_float(vec3(px.mul(6.0), py.mul(6.0).sub(t.mul(2.0)), t.mul(3.0)))
    const n2 = mx_noise_float(vec3(px.mul(12.0), py.mul(12.0).sub(t.mul(3.5)), t.mul(5.0)))
    const noise = n1.mul(0.6).add(n2.mul(0.4))

    // Pulsing core radius
    const coreR = float(0.12).add(sin(t.mul(8.0)).mul(0.02)).add(uCharge.mul(0.08))
    const coreMask = exp(dist.mul(dist).negate().div(coreR.mul(coreR)))

    // Flame tendrils outward — noise-modulated
    const flameR = float(0.25).add(uCharge.mul(0.1))
    const flameMask = exp(dist.mul(dist).negate().div(flameR.mul(flameR)))
      .mul(smoothstep(float(0.3), float(0.6), noise))

    // Edge mask
    const edgeMask = smoothstep(float(0.5), float(0.38), dist)

    // Colors: white-hot core → orange flame → dark red edge
    const coreColor = vec3(1.0, 0.95, 0.8)
    const flameColor = vec3(1.0, 0.5, 0.1)
    const edgeColor = vec3(0.6, 0.1, 0.02)

    const color = mix(edgeColor, flameColor, flameMask)
    const finalColor = mix(color, coreColor, coreMask.mul(0.9))

    const alpha = coreMask.add(flameMask.mul(0.6)).mul(edgeMask).mul(uIntensity)

    return vec4(finalColor, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 24, 24)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uIntensity, uCharge }
}

function createFireImpactMaterial(): ImpactObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, abs, mx_noise_float, atan, max } = TSL

  const uIntensity = uniform(0.0)
  const uExpand = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time
    const px = p.x.sub(0.5)
    const py = p.y.sub(0.5)
    const dist = px.mul(px).add(py.mul(py)).sqrt()

    // Expanding fire ring
    const ringR = uExpand.mul(0.42)
    const ringDist = abs(dist.sub(ringR))
    const ringW = float(0.04).add(uExpand.mul(0.03))
    const ringMask = exp(ringDist.mul(ringDist).negate().div(ringW.mul(ringW)))

    // Central flash (fades quickly)
    const flashMask = exp(dist.mul(dist).negate().div(float(0.015).add(uExpand.mul(0.02))))
      .mul(float(1.0).sub(uExpand.mul(0.9)))

    // Fire rays (noise-based radial rays)
    const angle = atan(py, px)
    const rayNoise = mx_noise_float(vec3(angle.mul(4.0), dist.mul(6.0), t.mul(5.0)))
    const rays = smoothstep(float(0.45), float(0.7), rayNoise)
      .mul(smoothstep(float(0.4), float(0.1), dist))
      .mul(float(1.0).sub(uExpand.mul(0.7)))

    const totalMask = max(max(ringMask, flashMask), rays)

    // Fire colors
    const innerColor = vec3(1.0, 0.95, 0.8) // white-hot
    const midColor = vec3(1.0, 0.55, 0.1)   // orange
    const outerColor = vec3(0.7, 0.15, 0.02) // dark red

    const color = mix(outerColor, midColor, smoothstep(float(0.2), float(0.5), totalMask))
    const finalColor = mix(color, innerColor, smoothstep(float(0.6), float(0.9), totalMask))

    const edgeMask = smoothstep(float(0.5), float(0.42), dist)
    const alpha = totalMask.mul(uIntensity).mul(edgeMask)

    return vec4(finalColor, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 32)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uIntensity, uExpand }
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

  if (renderer && scene && camera) renderer.render(scene, camera)

  if (sCtx && sparkCanvasRef.value) {
    const w = sparkCanvasRef.value.width / (window.devicePixelRatio || 1)
    const h = sparkCanvasRef.value.height / (window.devicePixelRatio || 1)
    sCtx.clearRect(0, 0, w, h)
    tickSparks(sparks, sCtx!)
  }
}

function s2t(sx: number, sy: number, W: number, H: number) {
  return { x: sx - W / 2, y: -(sy - H / 2) }
}

// ===== PUBLIC: play(attackerEl, defenderEl, damage?) =====

let isPlaying = false
let currentTl: gsap.core.Timeline | null = null

function play(attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number): Promise<void> {
  if (isPlaying || !gpuReady.value) return Promise.resolve()
  if (!containerRef.value || !renderer || !scene || !camera) return Promise.resolve()
  if (!orbObj || !impactObj) return Promise.resolve()
  let _resolve: (() => void) | null = null
  const promise = new Promise<void>(r => { _resolve = r })
  isPlaying = true

  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0

  const container = containerRef.value
  const sceneEl = attackerEl.closest('.game-board') || attackerEl.closest('.va-battlefield') || attackerEl.closest('.p3-arena-row') || attackerEl.closest('.p3-arena-row-mini') || container.parentElement!
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

  const atkRect = attackerEl.getBoundingClientRect()
  const defRect = defenderEl.getBoundingClientRect()
  const acx = atkRect.left - sceneRect.left + atkRect.width / 2
  const acy = atkRect.top - sceneRect.top + atkRect.height / 2
  const dcx = defRect.left - sceneRect.left + defRect.width / 2
  const dcy = defRect.top - sceneRect.top + defRect.height / 2

  const dirX = dcx - acx, dirY = dcy - acy
  const angle = Math.atan2(dirY, dirX)
  const perpX = -Math.sin(angle)
  const perpY = Math.cos(angle)

  container.style.display = 'block'
  startLoop()

  const defInner = defenderEl.querySelector('.card-inner') || defenderEl
  const orb = orbObj!
  const impact = impactObj!

  if (currentTl) currentTl.kill()
  const tl = gsap.timeline({
    onComplete: () => {
      isPlaying = false
      currentTl = null
      container.style.display = 'none'
      orb.mesh.visible = false
      impact.mesh.visible = false
      sparks = []
      stopLoop()
      gsap.set(attackerEl, { clearProps: 'transform,boxShadow' })
      gsap.set(defenderEl, { clearProps: 'transform' })
      gsap.set(defInner, { clearProps: 'boxShadow,borderColor' })
      _resolve?.()
    },
  })
  currentTl = tl

  // ── Phase 1: Orb charges at attacker (0–0.6s) ──
  const op = s2t(acx, acy, W, H)
  orb.mesh.position.set(op.x, op.y, 1)
  orb.mesh.scale.set(55, 55, 1)
  orb.mesh.visible = true
  orb.uIntensity.value = 0
  orb.uCharge.value = 0

  tl.to(orb.uIntensity, { value: 2.0, duration: 0.4, ease: 'power2.out' })
  tl.to(orb.uCharge, { value: 1.0, duration: 0.6, ease: 'power3.in' }, '<')
  tl.to(attackerEl, { boxShadow: '0 0 25px rgba(255,140,30,0.5)', duration: 0.4 }, '<')

  // Fire embers gathering
  tl.call(() => { spawnEmbers(acx, acy, 15, 50, '255,180,60') }, undefined, 0.2)

  // ── Phase 2: Orb flies to defender (0.6–0.85s) ──
  const orbStartX = acx + Math.cos(angle) * (atkRect.width / 2 + 15)
  const orbStartY = acy + Math.sin(angle) * (atkRect.height / 2 + 15)
  const arcHeight = -25

  const flightObj = { progress: 0 }
  tl.to(flightObj, {
    progress: 1,
    duration: 0.25,
    ease: 'power2.in',
    onUpdate: () => {
      const t = flightObj.progress
      const fx = orbStartX + (dcx - orbStartX) * t + Math.sin(t * Math.PI) * perpX * arcHeight
      const fy = orbStartY + (dcy - orbStartY) * t + Math.sin(t * Math.PI) * perpY * arcHeight
      const p = s2t(fx, fy, W, H)
      orb.mesh.position.set(p.x, p.y, 1)

      // Shrink orb as it approaches
      const s = 55 - t * 15
      orb.mesh.scale.set(s, s, 1)

      // Trail flame
      if (Math.random() > 0.3) {
        sparks.push(acquireSpark(fx, fy, {
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          life: 0.3 + Math.random() * 0.2, decay: 0.025,
          size: 3 + Math.random() * 4,
          color: '255,120,20',
          type: 'flame', gravity: -0.02, friction: 0.96,
        }))
      }
    },
    onComplete: () => {
      orb.mesh.visible = false

      // ── Phase 3: Impact ──
      const ip = s2t(dcx, dcy, W, H)
      impact.mesh.position.set(ip.x, ip.y, 2)
      impact.mesh.scale.set(200, 200, 1)
      impact.mesh.visible = true
      impact.uIntensity.value = 2.5
      impact.uExpand.value = 0
      gsap.to(impact.uExpand, { value: 1.0, duration: 0.5, ease: 'power2.out' })
      gsap.to(impact.uIntensity, {
        value: 0, duration: 0.7, ease: 'power2.in',
        onComplete: () => { impact.mesh.visible = false },
      })

      // Screen flash — warm orange
      if (flashRef.value) {
        flashRef.value.style.background = `radial-gradient(ellipse at ${(dcx / W) * 100}% ${(dcy / H) * 100}%, rgba(255,140,30,0.4), transparent 60%)`
        gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
      }

      // Fire embers burst
      spawnEmbers(dcx, dcy, 35, 70, '255,140,30')
      spawnEmbers(dcx, dcy, 20, 50, '255,200,80')

      // Dark smoke after impact
      for (let i = 0; i < 6; i++) {
        sparks.push(acquireSpark(dcx + (Math.random() - 0.5) * 40, dcy + (Math.random() - 0.5) * 30, {
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.5 - Math.random() * 0.8,
          life: 0.8, decay: 0.008,
          size: 10 + Math.random() * 10,
          color: '40,30,20',
          type: 'smoke', gravity: -0.02, friction: 0.995,
        }))
      }

      // Shake defender
      const shakeTl = gsap.timeline()
      for (let i = 0; i < 10; i++) {
        const int = 10 * (1 - i / 10)
        shakeTl.to(defenderEl, {
          x: (Math.random() - 0.5) * int * 2,
          y: (Math.random() - 0.5) * int,
          duration: 0.035,
        })
      }
      shakeTl.to(defenderEl, { x: 0, y: 0, duration: 0.12 })

      // Defender glow — warm orange
      gsap.fromTo(defInner,
        { boxShadow: 'inset 0 0 70px rgba(255,100,20,0.8), 0 0 25px rgba(255,140,30,0.5)', borderColor: '#ff6020' },
        { boxShadow: 'inset 0 0 0 rgba(255,100,20,0), 0 0 0 rgba(255,140,30,0)', borderColor: '', duration: 1.0, delay: 0.2 }
      )

      // Damage number
      if (dmgRef.value) {
        dmgRef.value.textContent = damage ? `-${damage}` : '-?'
        dmgRef.value.style.left = (dcx - 22) + 'px'
        dmgRef.value.style.top = (dcy - 45) + 'px'
        gsap.fromTo(dmgRef.value,
          { opacity: 1, y: 0, scale: 0.3 },
          { opacity: 0, y: -70, scale: 1.4, duration: 1.2, ease: 'power2.out' }
        )
      }
    },
  })

  // Fade attacker glow during flight
  tl.to(attackerEl, { boxShadow: 'none', duration: 0.3 }, '<')

  // Lingering embers after impact
  tl.call(() => {
    for (let i = 0; i < 10; i++) {
      pendingTimeouts.push(setTimeout(() => {
        sparks.push(acquireSpark(
          dcx + (Math.random() - 0.5) * 60,
          dcy + (Math.random() - 0.5) * 30,
          {
            vx: (Math.random() - 0.5) * 0.3,
            vy: -0.3 - Math.random() * 0.5,
            life: 0.6, decay: 0.008,
            size: 1.5 + Math.random(),
            color: '255,160,60',
            type: 'ember', gravity: -0.02, friction: 0.998,
          }
        ))
      }, i * 70) as unknown as number)
    }
  }, undefined, '+=0.3')

  return promise
}

// ===== LIFECYCLE =====

async function initWebGPU() {
  try {
    if (!navigator.gpu) {
      gpuError.value = 'WebGPU nie jest wspierany'
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
      abs: tslModule.abs, mx_noise_float: tslModule.mx_noise_float,
      sin: tslModule.sin, cos: tslModule.cos,
      atan: tslModule.atan, max: tslModule.max,
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

    orbObj = createFireOrbMaterial()
    scene.add(orbObj.mesh)

    impactObj = createFireImpactMaterial()
    scene.add(impactObj.mesh)

    // Render one clear frame so the canvas buffer is transparent before first play()
    renderer.render(scene, camera)

    gpuReady.value = true
    console.info('[ElementalVFX] Initialized successfully')
  } catch (e: any) {
    console.warn('[ElementalVFX] Init failed:', e)
    gpuError.value = e.message || 'WebGPU init failed'
  }
}

onMounted(() => { mounted = true; initWebGPU() })

onUnmounted(() => {
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0
  mounted = false
  if (currentTl) { currentTl.kill(); currentTl = null }
  stopLoop()
  orbObj?.mesh.geometry?.dispose(); orbObj?.mesh.material?.dispose()
  impactObj?.mesh.geometry?.dispose(); impactObj?.mesh.material?.dispose()
  renderer?.dispose()
  renderer = null; scene = null; camera = null
})

defineExpose({ play, gpuReady, gpuError })
</script>

<template>
  <div ref="containerRef" class="elemental-vfx-overlay" style="display: none;">
    <canvas ref="threeCanvasRef" class="elemental-three-canvas" />
    <canvas ref="sparkCanvasRef" class="elemental-spark-canvas" />
    <div ref="flashRef" class="elemental-screen-flash" />
    <div ref="dmgRef" class="elemental-damage-number">-8</div>
  </div>
</template>

<style scoped>
.elemental-vfx-overlay {
  position: absolute; inset: 0; z-index: 50;
  pointer-events: none; overflow: hidden;
}
.elemental-three-canvas,
.elemental-spark-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; background: transparent;
}
.elemental-three-canvas { z-index: 10; }
.elemental-spark-canvas { z-index: 12; }
.elemental-screen-flash {
  position: absolute; inset: 0; z-index: 15;
  pointer-events: none; opacity: 0;
}
.elemental-damage-number {
  position: absolute;
  font-family: 'Cinzel Decorative', Georgia, serif;
  font-size: 50px; font-weight: 900;
  z-index: 25; opacity: 0; pointer-events: none;
  color: #ff6020;
  text-shadow: 0 0 20px rgba(255,100,20,0.9), 0 0 50px rgba(255,80,10,0.5), 2px 2px 0 #401000;
}
</style>
