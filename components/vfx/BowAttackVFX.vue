<script setup lang="ts">
/**
 * BowAttackVFX — energy bow + arrow projectile using WebGPU renderer + TSL nodes.
 * Faithful port of lucznik.html prototype.
 * Uses mx_noise_float for organic energy bow, arrow, and impact burst.
 *
 * Direction-aware: bow orientation and arrow flight direction adapt to
 * attacker → defender vector. Player cards shoot up, AI shoots down, etc.
 *
 * API:
 *   <BowAttackVFX ref="bowRef" />
 *   bowRef.value?.play(attackerEl, defenderEl, damage?)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

// Dynamic imports — WebGPU + TSL are heavy, load on demand
let THREE_GPU: typeof import('three/webgpu') | null = null
let TSL: {
  Fn: any; float: any; vec2: any; vec3: any; vec4: any
  uv: any; time: any; uniform: any; smoothstep: any; step: any
  mix: any; exp: any; abs: any; sin: any; cos: any; max: any; min: any
  mx_noise_float: any; atan: any
} | null = null

const containerRef = ref<HTMLDivElement | null>(null)
const threeCanvasRef = ref<HTMLCanvasElement | null>(null)
const sparkCanvasRef = ref<HTMLCanvasElement | null>(null)
const flashRef = ref<HTMLDivElement | null>(null)
const dmgRef = ref<HTMLDivElement | null>(null)

// State
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

function spawnEmbers(x: number, y: number, count: number, spread = 30, col = '100,180,255') {
  for (let i = 0; i < count; i++) {
    sparks.push(acquireSpark(
      x + (Math.random() - 0.5) * spread,
      y + (Math.random() - 0.5) * spread * 0.5,
      {
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2 - 0.5,
        life: 0.4 + Math.random() * 0.6,
        decay: 0.008 + Math.random() * 0.01,
        size: 1 + Math.random() * 2,
        color: col,
        gravity: -0.01,
        friction: 0.99,
      }
    ))
  }
}

// ===== WEBGPU + TSL MATERIALS =====

interface BowObj { mesh: any; uDraw: any; uIntensity: any; uCharge: any }
interface ArrowObj { mesh: any; uIntensity: any; uLength: any }
interface ImpactObj { mesh: any; uIntensity: any; uExpand: any }

let bowObj: BowObj | null = null
let arrowObj: ArrowObj | null = null
let impactObj: ImpactObj | null = null

function createEnergyBowMaterial(): BowObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, abs, max, min, mx_noise_float } = TSL

  const uDraw = uniform(0.0)
  const uIntensity = uniform(0.0)
  const uCharge = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false,
    side: THREE_GPU.DoubleSide, blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time

    const px = p.x.sub(0.5).mul(2.0)
    const py = p.y.sub(0.5).mul(2.0)

    // Bow arc — parabolic curve on the right
    const curvature = float(0.5)
    const arcX = float(0.6).sub(py.mul(py).mul(curvature))

    // Noise wobble
    const arcNoise = mx_noise_float(vec3(py.mul(4.0), t.mul(2.0), float(0.0))).mul(0.03)
    const arcDist = abs(px.sub(arcX).add(arcNoise))

    const arcWidth = float(0.04).add(uCharge.mul(0.02))
    const arcMask = exp(arcDist.mul(arcDist).negate().div(arcWidth.mul(arcWidth)))
    const arcYMask = smoothstep(float(0.9), float(0.8), abs(py))
    const arcFinal = arcMask.mul(arcYMask)

    // Bowstring — two lines from arc tips to nock point
    const tipY = float(0.85)
    const tipX = float(0.6).sub(tipY.mul(tipY).mul(curvature))
    const nockX = tipX.sub(uDraw.mul(0.8))
    const nockY = float(0.0)

    // Upper string distance
    const s1dx = nockX.sub(tipX)
    const s1dy = nockY.sub(tipY)
    const s1t = max(float(0.0), min(float(1.0),
      px.sub(tipX).mul(s1dx).add(py.sub(tipY).mul(s1dy))
        .div(s1dx.mul(s1dx).add(s1dy.mul(s1dy)).add(0.001))
    ))
    const s1cx = tipX.add(s1dx.mul(s1t))
    const s1cy = tipY.add(s1dy.mul(s1t))
    const s1dist = px.sub(s1cx).mul(px.sub(s1cx)).add(py.sub(s1cy).mul(py.sub(s1cy)))

    // Lower string distance
    const s2dy = nockY.sub(tipY.negate())
    const s2t = max(float(0.0), min(float(1.0),
      px.sub(tipX).mul(s1dx).add(py.sub(tipY.negate()).mul(s2dy))
        .div(s1dx.mul(s1dx).add(s2dy.mul(s2dy)).add(0.001))
    ))
    const s2cx = tipX.add(s1dx.mul(s2t))
    const s2cy = tipY.negate().add(s2dy.mul(s2t))
    const s2dist = px.sub(s2cx).mul(px.sub(s2cx)).add(py.sub(s2cy).mul(py.sub(s2cy)))

    const stringWidth = float(0.0008).add(uDraw.mul(0.0015))
    const string1 = exp(s1dist.negate().div(stringWidth))
    const string2 = exp(s2dist.negate().div(stringWidth))
    const stringMask = max(string1, string2).mul(uDraw.mul(2.0).min(1.0))

    const stringNoise = mx_noise_float(vec3(py.mul(8.0), t.mul(12.0), float(1.0)))
    const stringPulse = float(1.0).add(stringNoise.mul(uDraw).mul(0.3))

    // Nock point energy
    const nockDist = px.sub(nockX).mul(px.sub(nockX)).add(py.mul(py))
    const chargeRadius = float(0.01).add(uCharge.mul(0.06))
    const chargeMask = exp(nockDist.negate().div(chargeRadius))

    const ringDist = abs(nockDist.sqrt().sub(float(0.05).add(uCharge.mul(0.1))))
    const ringMask = exp(ringDist.mul(ringDist).negate().div(float(0.0008))).mul(uCharge)

    const chargeNoise = mx_noise_float(vec3(px.mul(20.0), py.mul(20.0), t.mul(5.0)))
    const chargeDots = smoothstep(float(0.65), float(0.7), chargeNoise)
      .mul(smoothstep(float(0.2), float(0.15), nockDist.sqrt()))
      .mul(uCharge)

    // Combine
    const totalMask = max(max(arcFinal, stringMask.mul(stringPulse)), max(chargeMask.mul(uCharge.mul(2.0)), max(ringMask, chargeDots)))

    const coolBlue = vec3(0.15, 0.4, 0.9)
    const brightBlue = vec3(0.3, 0.7, 1.0)
    const white = vec3(0.9, 0.95, 1.0)
    const c1 = mix(coolBlue, brightBlue, smoothstep(float(0.2), float(0.5), totalMask))
    const finalColor = mix(c1, white, smoothstep(float(0.5), float(0.9), totalMask))

    const edge = smoothstep(float(0.0), float(0.08), p.x).mul(smoothstep(float(1.0), float(0.92), p.x))
      .mul(smoothstep(float(0.0), float(0.08), p.y)).mul(smoothstep(float(1.0), float(0.92), p.y))

    const alpha = totalMask.mul(uIntensity).mul(edge)
    return vec4(finalColor, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 48, 48)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uDraw, uIntensity, uCharge }
}

function createEnergyArrowMaterial(): ArrowObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, step, mix, exp, abs, max, mx_noise_float } = TSL

  const uIntensity = uniform(0.0)
  const uLength = uniform(1.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false,
    side: THREE_GPU.DoubleSide, blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time

    const px = p.x
    const py = p.y.sub(0.5)
    const apy = abs(py)

    // Shaft
    const shaftEnd = float(0.75)
    const shaftWidth = float(0.018)
    const inShaft = smoothstep(shaftEnd, shaftEnd.sub(0.02), px)
    const shaftMask = exp(apy.mul(apy).negate().div(shaftWidth.mul(shaftWidth))).mul(inShaft)

    // Arrowhead
    const inHead = smoothstep(shaftEnd.sub(0.02), shaftEnd, px)
    const headProgress = px.sub(shaftEnd).div(float(1.0).sub(shaftEnd))
    const headHalfW = float(1.0).sub(headProgress).mul(0.12)
    const headMask = step(apy, headHalfW).mul(inHead)
    const headGlow = exp(apy.mul(apy).negate().div(headHalfW.add(0.01).mul(headHalfW.add(0.01))))
      .mul(inHead).mul(float(1.5))

    // Fletching
    const fletchEnd = float(0.28)
    const inFletch = smoothstep(fletchEnd, float(0.0), px)
    const fletchProgress = float(1.0).sub(px.div(fletchEnd).clamp(float(0.0), float(1.0)))
    const fletchHalfW = fletchProgress.mul(0.22)
    const fletchMask = step(apy, fletchHalfW).mul(inFletch).mul(0.85)

    // Energy trail along shaft
    const trailNoise = mx_noise_float(vec3(px.mul(6.0), py.mul(5.0), t.mul(10.0)))
    const trailGlow = exp(apy.mul(apy).negate().div(float(0.006)))
      .mul(inShaft)
      .mul(float(0.6).add(trailNoise.mul(0.4)))

    const totalMask = max(max(max(shaftMask, headMask), max(headGlow, fletchMask)), trailGlow)

    const shaftCol = vec3(0.4, 0.8, 1.0)
    const headCol = vec3(0.9, 0.95, 1.0)
    const fletchCol = vec3(0.3, 0.4, 1.0)

    const isHead = inHead.mul(step(apy, headHalfW.add(0.01)))
    const isFletch = inFletch.mul(step(apy, fletchHalfW.add(0.01)))
    const col0 = mix(shaftCol, headCol, isHead)
    const col1 = mix(col0, fletchCol, isFletch)
    const finalColor = mix(col1, vec3(1.0, 1.0, 1.0), smoothstep(float(0.5), float(1.0), totalMask))

    const alpha = totalMask.mul(uIntensity)
    return vec4(finalColor, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 32, 8)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uIntensity, uLength }
}

function createImpactMaterial(): ImpactObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')
  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, abs, max, mx_noise_float, atan } = TSL

  const uIntensity = uniform(0.0)
  const uExpand = uniform(0.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false,
    side: THREE_GPU.DoubleSide, blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time

    const px = p.x.sub(0.5)
    const py = p.y.sub(0.5)
    const dist = px.mul(px).add(py.mul(py)).sqrt()

    // Expanding ring
    const ringRadius = uExpand.mul(0.45)
    const ringDist = abs(dist.sub(ringRadius))
    const ringWidth = float(0.03).add(uExpand.mul(0.02))
    const ringMask = exp(ringDist.mul(ringDist).negate().div(ringWidth.mul(ringWidth)))

    // Central flash
    const flashMask = exp(dist.mul(dist).negate().div(float(0.01).add(uExpand.mul(0.03))))
    const centralFlash = flashMask.mul(float(1.0).sub(uExpand.mul(0.8)))

    // Noise rays
    const angle = atan(py, px)
    const rayNoise = mx_noise_float(vec3(angle.mul(3.0), dist.mul(5.0), t.mul(4.0)))
    const rays = smoothstep(float(0.5), float(0.7), rayNoise)
      .mul(smoothstep(float(0.4), float(0.1), dist))
      .mul(float(1.0).sub(uExpand.mul(0.6)))

    const totalMask = max(max(ringMask, centralFlash), rays)

    const blue = vec3(0.2, 0.5, 1.0)
    const white = vec3(0.95, 0.97, 1.0)
    const finalColor = mix(blue, white, smoothstep(float(0.3), float(0.8), totalMask))

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

// Screen → Three.js orthographic space
function s2t(sx: number, sy: number, W: number, H: number) {
  return { x: sx - W / 2, y: -(sy - H / 2) }
}

// ===== PUBLIC: play(attackerEl, defenderEl, damage?) =====

let isPlaying = false
let currentTl: gsap.core.Timeline | null = null

function play(attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) {
  if (isPlaying || !gpuReady.value) return
  if (!containerRef.value || !renderer || !scene || !camera) return
  if (!bowObj || !arrowObj || !impactObj) return
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

  // Attacker + Defender rects relative to scene
  const atkRect = attackerEl.getBoundingClientRect()
  const defRect = defenderEl.getBoundingClientRect()
  const acx = atkRect.left - sceneRect.left + atkRect.width / 2
  const acy = atkRect.top - sceneRect.top + atkRect.height / 2
  const dcx = defRect.left - sceneRect.left + defRect.width / 2
  const dcy = defRect.top - sceneRect.top + defRect.height / 2

  // Direction vector from attacker to defender
  const dirX = dcx - acx
  const dirY = dcy - acy
  const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1
  const angle = Math.atan2(dirY, dirX)

  container.style.display = 'block'
  startLoop()

  const defInner = defenderEl.querySelector('.card-inner') || defenderEl

  const bow = bowObj!
  const arrow = arrowObj!
  const impact = impactObj!

  if (currentTl) currentTl.kill()
  const tl = gsap.timeline({
    onComplete: () => {
      isPlaying = false
      currentTl = null
      container.style.display = 'none'
      bow.mesh.visible = false
      arrow.mesh.visible = false
      impact.mesh.visible = false
      sparks = []
      stopLoop()
    },
  })
  currentTl = tl

  // ── Phase 1: BOW APPEARS ──
  // Position bow over attacker, rotated toward defender
  const bp = s2t(acx, acy, W, H)
  bow.mesh.position.set(bp.x, bp.y, 1)
  bow.mesh.scale.set(atkRect.width * 1.4, atkRect.height * 1.2, 1)
  // Rotate bow so arrow shoots toward defender
  // The bow mesh in UV space has arc on right, shoots right → rotation = -angle
  bow.mesh.rotation.z = -angle
  bow.mesh.visible = true
  bow.uDraw.value = 0; bow.uIntensity.value = 0; bow.uCharge.value = 0

  tl.to(bow.uIntensity, { value: 1.5, duration: 0.4, ease: 'power2.out' })
  tl.to(attackerEl, { boxShadow: '0 0 20px rgba(100,180,255,0.4)', duration: 0.4 }, '<')

  // ── Phase 2: DRAW STRING ──
  tl.to(bow.uDraw, { value: 1.0, duration: 0.7, ease: 'power2.in' })
  tl.to(bow.uCharge, { value: 1.0, duration: 0.7, ease: 'power3.in' }, '<')
  tl.to(bow.uIntensity, { value: 2.5, duration: 0.7, ease: 'power2.in' }, '<')

  // Energy gathering embers around attacker
  tl.call(() => { spawnEmbers(acx, acy, 12, 60) }, undefined, '-=0.4')
  tl.call(() => { spawnEmbers(acx, acy, 15, 50) }, undefined, '-=0.2')

  // ── Phase 3: RELEASE ──
  tl.call(() => {
    // Snap bow back
    gsap.to(bow.uDraw, { value: 0, duration: 0.15, ease: 'elastic.out(1, 0.4)' })
    gsap.to(bow.uCharge, { value: 0, duration: 0.1 })
    gsap.to(bow.uIntensity, { value: 0.5, duration: 0.3 })

    // Screen flash
    if (flashRef.value) {
      flashRef.value.style.background = 'rgba(100,180,255,0.3)'
      gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
    }

    // Release burst embers
    spawnEmbers(acx + Math.cos(angle) * 40, acy + Math.sin(angle) * 40, 20, 40, '150,200,255')

    // Show arrow
    arrow.mesh.visible = true
    arrow.uIntensity.value = 2.0
  })

  // ── Phase 4: ARROW FLIGHT ──
  // Arrow starts from attacker edge, flies to defender
  const arrowStartX = acx + Math.cos(angle) * (atkRect.width / 2 + 10)
  const arrowStartY = acy + Math.sin(angle) * (atkRect.height / 2 + 10)
  // Arrow flies to center of defender card (passes through)
  const arrowEndX = dcx
  const arrowEndY = dcy

  // Perpendicular direction for arc
  const perpX = -Math.sin(angle)
  const perpY = Math.cos(angle)
  const arcHeight = -20

  const flightObj = { progress: 0 }
  tl.to(flightObj, {
    progress: 1,
    duration: 0.15,
    ease: 'power2.in',
    onUpdate: () => {
      const t = flightObj.progress
      const ax = arrowStartX + (arrowEndX - arrowStartX) * t + Math.sin(t * Math.PI) * perpX * arcHeight
      const ay = arrowStartY + (arrowEndY - arrowStartY) * t + Math.sin(t * Math.PI) * perpY * arcHeight

      // Arrow direction — constant angle from attacker to defender (no leveling)
      const p = s2t(ax, ay, W, H)
      arrow.mesh.position.set(p.x, p.y, 2)
      arrow.mesh.rotation.z = -angle
      arrow.mesh.scale.set(60, 14, 1)

      // Trail embers
      if (Math.random() > 0.4) {
        sparks.push(acquireSpark(ax, ay, {
          vx: (Math.random() - 0.5) * 1,
          vy: (Math.random() - 0.5) * 1,
          life: 0.3 + Math.random() * 0.3,
          decay: 0.02,
          size: 1 + Math.random(),
          color: '120,180,255',
          gravity: 0.03,
          friction: 0.98,
        }))
      }
    },
    // Impact fires IMMEDIATELY when arrow arrives — no gap
    onComplete: () => {
      arrow.mesh.visible = false
      arrow.uIntensity.value = 0

      // Impact burst — at center of defender card
      const ip = s2t(dcx, dcy, W, H)
      impact.mesh.position.set(ip.x, ip.y, 2)
      impact.mesh.scale.set(220, 220, 1)
      impact.mesh.visible = true
      impact.uIntensity.value = 3.0
      impact.uExpand.value = 0
      gsap.to(impact.uExpand, { value: 1.0, duration: 0.5, ease: 'power2.out' })
      gsap.to(impact.uIntensity, {
        value: 0, duration: 0.6, ease: 'power2.in',
        onComplete: () => { impact.mesh.visible = false },
      })

      // Screen flash — short
      if (flashRef.value) {
        flashRef.value.style.background = `radial-gradient(ellipse at ${(dcx / W) * 100}% ${(dcy / H) * 100}%, rgba(100,180,255,0.4), transparent 60%)`
        gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
      }

      // Embers burst at impact point
      spawnEmbers(dcx, dcy, 30, 60, '100,180,255')
      spawnEmbers(dcx, dcy, 15, 40, '200,220,255')

      // Shake defender (no rotation — CSS rotation on .card-attack must be preserved)
      const shakeTl2 = gsap.timeline()
      for (let i = 0; i < 10; i++) {
        const int = 10 * (1 - i / 10)
        shakeTl2.to(defenderEl, {
          x: (Math.random() - 0.5) * int * 2,
          y: (Math.random() - 0.5) * int,
          duration: 0.035,
        })
      }
      shakeTl2.to(defenderEl, { x: 0, y: 0, duration: 0.12 })

      // Defender border flash — shorter glow
      gsap.fromTo(defInner,
        { borderColor: '#3080ff', boxShadow: 'inset 0 0 70px rgba(40,120,255,0.8), 0 0 25px rgba(60,140,255,0.6)' },
        { borderColor: '', boxShadow: 'inset 0 0 0 rgba(40,120,255,0), 0 0 0 rgba(60,140,255,0)', duration: 0.9, delay: 0.2 }
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
  }, '<')

  // Fade bow during flight
  tl.to(bow.uIntensity, { value: 0, duration: 0.3 }, '<')
  tl.call(() => { bow.mesh.visible = false }, undefined, '+=0.1')

  // Remove attacker glow
  tl.to(attackerEl, { boxShadow: 'none', duration: 0.3 }, '<')

  // Lingering embers falling at impact
  tl.call(() => {
    for (let i = 0; i < 10; i++) {
      pendingTimeouts.push(setTimeout(() => {
        sparks.push(acquireSpark(
          dcx + (Math.random() - 0.5) * 80,
          dcy + (Math.random() - 0.5) * 40,
          {
            vx: (Math.random() - 0.5) * 0.3,
            vy: 0.3 + Math.random() * 0.5,
            life: 0.7, decay: 0.006, size: 1, color: '100,160,255',
            gravity: 0.03, friction: 0.998,
          }
        ))
      }, i * 80) as unknown as number)
    }
  }, undefined, '+=0.1')
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
      Fn: tslModule.Fn,
      float: tslModule.float,
      vec2: tslModule.vec2,
      vec3: tslModule.vec3,
      vec4: tslModule.vec4,
      uv: tslModule.uv,
      time: tslModule.time,
      uniform: tslModule.uniform,
      smoothstep: tslModule.smoothstep,
      step: tslModule.step,
      mix: tslModule.mix,
      exp: tslModule.exp,
      abs: tslModule.abs,
      sin: tslModule.sin,
      cos: tslModule.cos,
      max: tslModule.max,
      min: tslModule.min,
      mx_noise_float: tslModule.mx_noise_float,
      atan: tslModule.atan,
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

    // Create shader meshes
    bowObj = createEnergyBowMaterial()
    scene.add(bowObj.mesh)

    arrowObj = createEnergyArrowMaterial()
    scene.add(arrowObj.mesh)

    impactObj = createImpactMaterial()
    scene.add(impactObj.mesh)

    // Render one clear frame so the canvas buffer is transparent before first play()
    renderer.render(scene, camera)

    gpuReady.value = true
    console.info('[BowAttackVFX] Initialized successfully')
  } catch (e: any) {
    console.warn('[BowAttackVFX] Init failed:', e)
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
  bowObj?.mesh.geometry?.dispose()
  bowObj?.mesh.material?.dispose()
  arrowObj?.mesh.geometry?.dispose()
  arrowObj?.mesh.material?.dispose()
  impactObj?.mesh.geometry?.dispose()
  impactObj?.mesh.material?.dispose()
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
})

defineExpose({ play, gpuReady, gpuError })
</script>

<template>
  <div ref="containerRef" class="bow-attack-overlay" style="display: none;">
    <canvas ref="threeCanvasRef" class="bow-three-canvas" />
    <canvas ref="sparkCanvasRef" class="bow-spark-canvas" />
    <div ref="flashRef" class="bow-screen-flash" />
    <div ref="dmgRef" class="bow-damage-number">-5</div>
  </div>
</template>

<style scoped>
.bow-attack-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  overflow: hidden;
}
.bow-three-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}
.bow-spark-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 12;
  pointer-events: none;
}
.bow-screen-flash {
  position: absolute;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  opacity: 0;
}
.bow-damage-number {
  position: absolute;
  font-family: 'Cinzel Decorative', Georgia, serif;
  font-size: 52px;
  font-weight: 900;
  z-index: 25;
  opacity: 0;
  pointer-events: none;
  color: #5599ff;
  text-shadow: 0 0 20px rgba(60,140,255,0.9), 0 0 50px rgba(30,80,200,0.5), 2px 2px 0 #102040;
}
</style>
