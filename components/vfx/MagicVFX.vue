<script setup lang="ts">
/**
 * MagicVFX — "Arcana" (Arcane Blast)
 * WebGPU + TSL magic attack effect.
 *
 * Phases:
 *   1. Big rune circle on ATTACKER (mage casting)
 *   2. Crystal orb condenses on DEFENDER with converging sparks
 *   3. Explosion — orb detonates, scatter, flash, shake
 *   4. Attacker rune circle fades away
 *
 * API: <MagicVFX ref="r" />  →  r.play(attackerEl, defenderEl, damage?)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

let THREE_GPU: typeof import('three/webgpu') | null = null
let TSL: {
  Fn: any; float: any; vec3: any; vec4: any
  uv: any; time: any; uniform: any; smoothstep: any
  mix: any; exp: any; abs: any; mx_noise_float: any
  sin: any; cos: any; atan: any; max: any; fract: any
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

// ===== WEBGPU MATERIALS =====

interface RuneCircleObj { mesh: any; uIntensity: any; uRadius: any; uRotation: any }
interface ImplosionObj { mesh: any; uIntensity: any; uPhase: any }

let runeObj: RuneCircleObj | null = null
let implosionObj: ImplosionObj | null = null

function createRuneCircleMaterial(): RuneCircleObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, abs, mx_noise_float, sin, cos, atan, fract } = TSL

  const uIntensity = uniform(0.0)
  const uRadius = uniform(0.35)
  const uRotation = uniform(0.0)

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

    // Angle + rotation
    const angle = atan(py, px).add(uRotation)

    // Ring shape
    const ringDist = abs(dist.sub(uRadius))
    const ringW = float(0.025)
    const ringMask = exp(ringDist.mul(ringDist).negate().div(ringW.mul(ringW)))

    // Inner ring (thinner, brighter)
    const innerRingDist = abs(dist.sub(uRadius.mul(0.7)))
    const innerRingMask = exp(innerRingDist.mul(innerRingDist).negate().div(float(0.015).mul(float(0.015))))
      .mul(0.5)

    // Rune marks — periodic bumps around the ring (6 runes)
    const runeCount = float(6.0)
    const runeAngle = fract(angle.div(float(Math.PI * 2)).mul(runeCount))
    const runePulse = smoothstep(float(0.35), float(0.5), runeAngle)
      .mul(smoothstep(float(0.65), float(0.5), runeAngle))
    const runeGlow = runePulse.mul(ringMask).mul(2.0)

    // Noise shimmer on the ring
    const shimmer = mx_noise_float(vec3(angle.mul(3.0), dist.mul(10.0), t.mul(4.0)))
    const shimmerMask = ringMask.mul(float(0.7).add(shimmer.mul(0.3)))

    // Mystic glow fill (very subtle, inside the circle)
    const innerGlow = smoothstep(uRadius, uRadius.mul(0.3), dist).mul(0.08)
      .mul(mx_noise_float(vec3(px.mul(3.0), py.mul(3.0), t.mul(2.0))).mul(0.5).add(0.5))

    // Colors: violet core → blue edges
    const runeColor = vec3(0.7, 0.3, 1.0)
    const glowColor = vec3(0.4, 0.2, 0.8)
    const coreColor = vec3(0.9, 0.8, 1.0)

    const baseColor = mix(glowColor, runeColor, shimmerMask)
    const color = mix(baseColor, coreColor, runeGlow.mul(0.6))

    const alpha = shimmerMask.add(runeGlow).add(innerRingMask).add(innerGlow)
    const edgeMask = smoothstep(float(0.5), float(0.45), dist)

    return vec4(color, alpha.mul(uIntensity).mul(edgeMask))
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 32)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uIntensity, uRadius, uRotation }
}

function createImplosionMaterial(): ImplosionObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float, abs, max } = TSL

  const uIntensity = uniform(0.0)
  // Phase: 0=ring circle, 0.4=contracted to orb, 0.7=orb pulsing, 1.0=explosion
  const uPhase = uniform(0.0)

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

    // === Phase 0–0.4: Contracting ring ===
    const contractPhase = smoothstep(float(0.0), float(0.4), uPhase)
    const ringR = float(0.38).sub(contractPhase.mul(0.34)) // 0.38 → 0.04
    const ringDist = abs(dist.sub(ringR))
    const ringW = float(0.025).add(contractPhase.mul(0.015))
    const ringMask = exp(ringDist.mul(ringDist).negate().div(ringW.mul(ringW)))
      .mul(float(1.0).sub(smoothstep(float(0.7), float(0.85), uPhase))) // fade out ring before explosion

    // === Phase 0.35–0.75: Crystal orb condensation ===
    const orbAppear = smoothstep(float(0.3), float(0.45), uPhase)
    const orbFade = float(1.0).sub(smoothstep(float(0.75), float(0.9), uPhase))
    const orbPhase = orbAppear.mul(orbFade)
    const orbR = float(0.05)
    const orbCore = exp(dist.mul(dist).negate().div(orbR.mul(orbR))).mul(orbPhase)
    // Pulsing shimmer on the orb
    const orbPulse = mx_noise_float(vec3(px.mul(20.0), py.mul(20.0), t.mul(8.0)))
    const orbShimmer = orbCore.mul(float(0.7).add(orbPulse.mul(0.3)))
    // Sharp crystalline outer edge
    const crystalEdge = exp(dist.mul(dist).negate().div(float(0.08).mul(float(0.08))))
      .sub(exp(dist.mul(dist).negate().div(float(0.04).mul(float(0.04)))))
      .mul(orbPhase).mul(0.6)

    // === Phase 0.75–1.0: Explosion outward ===
    const explodePhase = smoothstep(float(0.75), float(1.0), uPhase)
    const explodeRingR = float(0.04).add(explodePhase.mul(0.4))
    const explodeRingDist = abs(dist.sub(explodeRingR))
    const explodeRingW = float(0.03).add(explodePhase.mul(0.04))
    const explodeRing = exp(explodeRingDist.mul(explodeRingDist).negate().div(explodeRingW.mul(explodeRingW)))
      .mul(explodePhase)
    // Central flash burst
    const flashR = float(0.12).sub(explodePhase.mul(0.08))
    const flashMask = exp(dist.mul(dist).negate().div(flashR.mul(flashR)))
      .mul(explodePhase).mul(1.5)

    // Noise distortion on ring
    const noise = mx_noise_float(vec3(px.mul(8.0), py.mul(8.0), t.mul(5.0)))
    const distortedRing = ringMask.mul(float(0.7).add(noise.mul(0.3)))

    const totalMask = max(max(distortedRing, orbShimmer.add(crystalEdge)), max(explodeRing, flashMask))

    // Colors: violet ring, bright white-blue orb, white flash
    const ringColor = vec3(0.6, 0.3, 1.0)
    const orbColor = vec3(0.85, 0.75, 1.0)  // bright lavender crystal
    const flashColor = vec3(0.95, 0.9, 1.0) // near-white
    const orbWeight = orbShimmer.add(crystalEdge)
    const flashWeight = flashMask.add(explodeRing.mul(0.3))
    const color = mix(mix(ringColor, orbColor, orbWeight), flashColor, flashWeight)

    const edgeMask = smoothstep(float(0.5), float(0.42), dist)

    return vec4(color, totalMask.mul(uIntensity).mul(edgeMask))
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 24, 24)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uIntensity, uPhase }
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
  if (!runeObj || !implosionObj) return Promise.resolve()
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

  container.style.display = 'block'
  startLoop()

  const defInner = defenderEl.querySelector('.card-inner') || defenderEl
  const rune = runeObj!
  const implode = implosionObj!

  if (currentTl) currentTl.kill()
  const tl = gsap.timeline({
    onComplete: () => {
      isPlaying = false
      currentTl = null
      container.style.display = 'none'
      rune.mesh.visible = false
      implode.mesh.visible = false
      sparks = []
      stopLoop()
      _resolve?.()
    },
  })
  currentTl = tl

  // ── Phase 1: BIG rune circle on ATTACKER (the mage casting) ──
  const bigSize = Math.max(atkRect.width, atkRect.height) * 2.4
  const ap = s2t(acx, acy, W, H)
  rune.mesh.position.set(ap.x, ap.y, 1)
  rune.mesh.scale.set(bigSize, bigSize, 1)
  rune.mesh.visible = true
  rune.uIntensity.value = 0
  rune.uRadius.value = 0.35
  rune.uRotation.value = 0

  tl.to(rune.uIntensity, { value: 2.0, duration: 0.35, ease: 'power2.out' })
  // Rotation runs independently
  gsap.to(rune.uRotation, { value: Math.PI * 4, duration: 3.0, ease: 'none' })

  // Attacker glow
  tl.to(attackerEl, { boxShadow: '0 0 30px rgba(130,80,255,0.6)', duration: 0.3 }, '<')

  // Rune sparks orbiting attacker
  tl.call(() => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const r = bigSize * 0.17
      sparks.push(acquireSpark(acx + Math.cos(a) * r, acy + Math.sin(a) * r, {
        vx: -Math.sin(a) * 1.5, vy: Math.cos(a) * 1.5,
        life: 0.8, decay: 0.015,
        size: 1.5 + Math.random(), color: '160,100,255',
        type: 'rune', gravity: 0, friction: 0.99,
      }))
    }
  }, undefined, 0.15)

  // ── Phase 2: Crystal orb condenses on DEFENDER ──
  const smallSize = Math.max(defRect.width, defRect.height) * 1.6
  const dp = s2t(dcx, dcy, W, H)

  tl.call(() => {
    implode.mesh.position.set(dp.x, dp.y, 1.5)
    implode.mesh.scale.set(smallSize, smallSize, 1)
    implode.mesh.visible = true
    implode.uIntensity.value = 0
    implode.uPhase.value = 0.35

    gsap.to(implode.uIntensity, { value: 2.5, duration: 0.25, ease: 'power2.out' })

    // Orb pulsing condensation
    gsap.to(implode.uPhase, { value: 0.55, duration: 0.6, ease: 'sine.inOut' })

    // Sparks converging inward toward orb
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 30 + Math.random() * 20
      sparks.push(acquireSpark(dcx + Math.cos(a) * r, dcy + Math.sin(a) * r, {
        vx: -Math.cos(a) * 2.5, vy: -Math.sin(a) * 2.5,
        life: 0.5, decay: 0.02,
        size: 1.5 + Math.random(), color: '200,180,255',
        type: 'rune', gravity: 0, friction: 0.95,
      }))
    }
  }, undefined, 0.15)

  // ── Phase 3: Explosion — orb detonates after visible hold ──
  tl.call(() => {
    // Fast explosion phase
    gsap.to(implode.uPhase, { value: 1.0, duration: 0.2, ease: 'power3.in' })
    gsap.to(implode.uIntensity, {
      value: 0, duration: 0.4, delay: 0.15, ease: 'power2.in',
      onComplete: () => { implode.mesh.visible = false },
    })

    // Screen flash — violet
    if (flashRef.value) {
      flashRef.value.style.background = `radial-gradient(ellipse at ${(dcx / W) * 100}% ${(dcy / H) * 100}%, rgba(130,80,255,0.45), transparent 60%)`
      gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.2 })
    }

    // Scatter rune particles outward from explosion
    for (let i = 0; i < 25; i++) {
      const a = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 5
      sparks.push(acquireSpark(dcx, dcy, {
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.4 + Math.random() * 0.4, decay: 0.015,
        size: 1.5 + Math.random() * 2, color: '160,100,255',
        type: 'rune', gravity: 0.04, friction: 0.96,
      }))
    }

    // Mystic motes
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 1.5
      sparks.push(acquireSpark(dcx + (Math.random() - 0.5) * 20, dcy + (Math.random() - 0.5) * 20, {
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.5,
        life: 0.8, decay: 0.008,
        size: 5 + Math.random() * 6, color: '100,60,200',
        type: 'mote', gravity: -0.01, friction: 0.995,
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

    // Defender glow — violet
    gsap.fromTo(defInner,
      { boxShadow: 'inset 0 0 70px rgba(130,80,255,0.8), 0 0 25px rgba(160,100,255,0.5)', borderColor: '#8050ff' },
      { boxShadow: 'inset 0 0 0 rgba(130,80,255,0), 0 0 0 rgba(160,100,255,0)', borderColor: '', duration: 0.8, delay: 0.15 }
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
  }, undefined, '+=0.55')

  // ── Phase 4: Attacker rune circle lingers, then fades ──
  tl.to(rune.uIntensity, { value: 0, duration: 0.5, ease: 'power2.in' }, '+=0.25')
  tl.to(attackerEl, { boxShadow: 'none', duration: 0.35 }, '<')
  tl.call(() => { rune.mesh.visible = false })

  // Lingering motes
  tl.call(() => {
    for (let i = 0; i < 6; i++) {
      pendingTimeouts.push(setTimeout(() => {
        sparks.push(acquireSpark(
          dcx + (Math.random() - 0.5) * 50,
          dcy + (Math.random() - 0.5) * 30,
          {
            vx: (Math.random() - 0.5) * 0.3,
            vy: -0.2 - Math.random() * 0.4,
            life: 0.5, decay: 0.012,
            size: 3 + Math.random() * 3,
            color: '130,80,200',
            type: 'mote', gravity: -0.01, friction: 0.998,
          }
        ))
      }, i * 50) as unknown as number)
    }
  }, undefined, '-=0.3')

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
      fract: tslModule.fract,
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

    runeObj = createRuneCircleMaterial()
    scene.add(runeObj.mesh)

    implosionObj = createImplosionMaterial()
    scene.add(implosionObj.mesh)

    // Render one clear frame so the canvas buffer is transparent before first play()
    renderer.render(scene, camera)

    gpuReady.value = true
    console.info('[MagicVFX] Initialized successfully')
  } catch (e: any) {
    console.warn('[MagicVFX] Init failed:', e)
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
  runeObj?.mesh.geometry?.dispose(); runeObj?.mesh.material?.dispose()
  implosionObj?.mesh.geometry?.dispose(); implosionObj?.mesh.material?.dispose()
  renderer?.dispose()
  renderer = null; scene = null; camera = null
})

defineExpose({ play, gpuReady, gpuError })
</script>

<template>
  <div ref="containerRef" class="magic-vfx-overlay" style="display: none;">
    <canvas ref="threeCanvasRef" class="magic-three-canvas" />
    <canvas ref="sparkCanvasRef" class="magic-spark-canvas" />
    <div ref="flashRef" class="magic-screen-flash" />
    <div ref="dmgRef" class="magic-damage-number">-8</div>
  </div>
</template>

<style scoped>
.magic-vfx-overlay {
  position: absolute; inset: 0; z-index: 50;
  pointer-events: none; overflow: hidden;
}
.magic-three-canvas,
.magic-spark-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; background: transparent;
}
.magic-three-canvas { z-index: 10; }
.magic-spark-canvas { z-index: 12; }
.magic-screen-flash {
  position: absolute; inset: 0; z-index: 15;
  pointer-events: none; opacity: 0;
}
.magic-damage-number {
  position: absolute;
  font-family: 'Cinzel Decorative', Georgia, serif;
  font-size: 50px; font-weight: 900;
  z-index: 25; opacity: 0; pointer-events: none;
  color: #9060ff;
  text-shadow: 0 0 20px rgba(130,80,255,0.9), 0 0 50px rgba(100,50,255,0.5), 2px 2px 0 #200040;
}
</style>
