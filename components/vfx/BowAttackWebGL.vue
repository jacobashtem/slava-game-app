<script setup lang="ts">
/**
 * BowAttackWebGL — energy bow + arrow projectile using WebGL renderer + GLSL.
 * WebGL port of BowAttackVFX (WebGPU/TSL version).
 * Uses hash-based noise instead of mx_noise_float.
 *
 * API identical to BowAttackVFX:
 *   <BowAttackWebGL ref="bowRef" />
 *   bowRef.value?.play(attackerEl, defenderEl, damage?)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

const containerRef = ref<HTMLDivElement | null>(null)
const threeCanvasRef = ref<HTMLCanvasElement | null>(null)
const sparkCanvasRef = ref<HTMLCanvasElement | null>(null)
const flashRef = ref<HTMLDivElement | null>(null)
const dmgRef = ref<HTMLDivElement | null>(null)

const ready = ref(false)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let rafHandle = -1
let sparks: Spark[] = []
let sCtx: CanvasRenderingContext2D | null = null
let mounted = false
let loopActive = false
const pendingTimeouts: number[] = []

// ===== GLSL SHADERS =====

const commonVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Hash-based noise (replacing mx_noise_float)
const noiseGlsl = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
`

// ── BOW SHADER ──
const bowFrag = /* glsl */ `
  uniform float uDraw;
  uniform float uIntensity;
  uniform float uCharge;
  uniform float uTime;
  varying vec2 vUv;

  ${noiseGlsl}

  void main() {
    float px = (vUv.x - 0.5) * 2.0;
    float py = (vUv.y - 0.5) * 2.0;

    // Bow arc
    float curvature = 0.5;
    float arcX = 0.6 - py * py * curvature;
    float arcNoise = noise(vec3(py * 4.0, uTime * 2.0, 0.0)) * 0.03;
    float arcDist = abs(px - arcX + arcNoise);
    float arcWidth = 0.04 + uCharge * 0.02;
    float arcMask = exp(-(arcDist * arcDist) / (arcWidth * arcWidth));
    float arcYMask = smoothstep(0.9, 0.8, abs(py));
    float arcFinal = arcMask * arcYMask;

    // Bowstring
    float tipY = 0.85;
    float tipX = 0.6 - tipY * tipY * curvature;
    float nockX = tipX - uDraw * 0.8;

    // Upper string — point-to-segment distance
    float s1dx = nockX - tipX;
    float s1dy = 0.0 - tipY;
    float s1len2 = s1dx * s1dx + s1dy * s1dy + 0.001;
    float s1t = clamp(((px - tipX) * s1dx + (py - tipY) * s1dy) / s1len2, 0.0, 1.0);
    float s1cx = tipX + s1dx * s1t;
    float s1cy = tipY + s1dy * s1t;
    float s1dist = (px - s1cx) * (px - s1cx) + (py - s1cy) * (py - s1cy);

    // Lower string
    float s2dy = 0.0 - (-tipY);
    float s2len2 = s1dx * s1dx + s2dy * s2dy + 0.001;
    float s2t = clamp(((px - tipX) * s1dx + (py - (-tipY)) * s2dy) / s2len2, 0.0, 1.0);
    float s2cx = tipX + s1dx * s2t;
    float s2cy = -tipY + s2dy * s2t;
    float s2dist = (px - s2cx) * (px - s2cx) + (py - s2cy) * (py - s2cy);

    float stringWidth = 0.0008 + uDraw * 0.0015;
    float string1 = exp(-s1dist / stringWidth);
    float string2 = exp(-s2dist / stringWidth);
    float stringMask = max(string1, string2) * min(uDraw * 2.0, 1.0);

    float stringNoise = noise(vec3(py * 8.0, uTime * 12.0, 1.0));
    float stringPulse = 1.0 + stringNoise * uDraw * 0.3;

    // Nock point energy
    float nockDist = (px - nockX) * (px - nockX) + py * py;
    float chargeRadius = 0.01 + uCharge * 0.06;
    float chargeMask = exp(-nockDist / chargeRadius);

    float ringDist = abs(sqrt(nockDist) - (0.05 + uCharge * 0.1));
    float ringMask = exp(-(ringDist * ringDist) / 0.0008) * uCharge;

    float chargeNoise = noise(vec3(px * 20.0, py * 20.0, uTime * 5.0));
    float chargeDots = smoothstep(0.65, 0.7, chargeNoise)
      * smoothstep(0.2, 0.15, sqrt(nockDist))
      * uCharge;

    // Combine
    float totalMask = max(max(arcFinal, stringMask * stringPulse),
                          max(chargeMask * uCharge * 2.0, max(ringMask, chargeDots)));

    vec3 coolBlue = vec3(0.15, 0.4, 0.9);
    vec3 brightBlue = vec3(0.3, 0.7, 1.0);
    vec3 white = vec3(0.9, 0.95, 1.0);
    vec3 c1 = mix(coolBlue, brightBlue, smoothstep(0.2, 0.5, totalMask));
    vec3 finalColor = mix(c1, white, smoothstep(0.5, 0.9, totalMask));

    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x)
               * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);

    float alpha = totalMask * uIntensity * edge;
    gl_FragColor = vec4(finalColor, alpha);
  }
`

// ── ARROW SHADER ──
const arrowFrag = /* glsl */ `
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;

  ${noiseGlsl}

  void main() {
    float px = vUv.x;
    float py = vUv.y - 0.5;
    float apy = abs(py);

    // Shaft
    float shaftEnd = 0.75;
    float shaftWidth = 0.018;
    float inShaft = smoothstep(shaftEnd, shaftEnd - 0.02, px);
    float shaftMask = exp(-(apy * apy) / (shaftWidth * shaftWidth)) * inShaft;

    // Arrowhead
    float inHead = smoothstep(shaftEnd - 0.02, shaftEnd, px);
    float headProgress = (px - shaftEnd) / (1.0 - shaftEnd);
    float headHalfW = (1.0 - headProgress) * 0.12;
    float headMask = step(apy, headHalfW) * inHead;
    float headGlow = exp(-(apy * apy) / ((headHalfW + 0.01) * (headHalfW + 0.01))) * inHead * 1.5;

    // Fletching
    float fletchEnd = 0.28;
    float inFletch = smoothstep(fletchEnd, 0.0, px);
    float fletchProgress = 1.0 - clamp(px / fletchEnd, 0.0, 1.0);
    float fletchHalfW = fletchProgress * 0.22;
    float fletchMask = step(apy, fletchHalfW) * inFletch * 0.85;

    // Energy trail
    float trailNoise = noise(vec3(px * 6.0, py * 5.0, uTime * 10.0));
    float trailGlow = exp(-(apy * apy) / 0.006) * inShaft * (0.6 + trailNoise * 0.4);

    float totalMask = max(max(max(shaftMask, headMask), max(headGlow, fletchMask)), trailGlow);

    vec3 shaftCol = vec3(0.4, 0.8, 1.0);
    vec3 headCol = vec3(0.9, 0.95, 1.0);
    vec3 fletchCol = vec3(0.3, 0.4, 1.0);

    float isHead = inHead * step(apy, headHalfW + 0.01);
    float isFletch = inFletch * step(apy, fletchHalfW + 0.01);
    vec3 col0 = mix(shaftCol, headCol, isHead);
    vec3 col1 = mix(col0, fletchCol, isFletch);
    vec3 finalColor = mix(col1, vec3(1.0), smoothstep(0.5, 1.0, totalMask));

    float alpha = totalMask * uIntensity;
    gl_FragColor = vec4(finalColor, alpha);
  }
`

// ── IMPACT SHADER ──
const impactFrag = /* glsl */ `
  uniform float uIntensity;
  uniform float uExpand;
  uniform float uTime;
  varying vec2 vUv;

  ${noiseGlsl}

  void main() {
    float px = vUv.x - 0.5;
    float py = vUv.y - 0.5;
    float dist = sqrt(px * px + py * py);

    // Expanding ring
    float ringRadius = uExpand * 0.45;
    float ringDist = abs(dist - ringRadius);
    float ringWidth = 0.03 + uExpand * 0.02;
    float ringMask = exp(-(ringDist * ringDist) / (ringWidth * ringWidth));

    // Central flash
    float flashMask = exp(-(dist * dist) / (0.01 + uExpand * 0.03));
    float centralFlash = flashMask * (1.0 - uExpand * 0.8);

    // Noise rays
    float angle = atan(py, px);
    float rayNoise = noise(vec3(angle * 3.0, dist * 5.0, uTime * 4.0));
    float rays = smoothstep(0.5, 0.7, rayNoise)
               * smoothstep(0.4, 0.1, dist)
               * (1.0 - uExpand * 0.6);

    float totalMask = max(max(ringMask, centralFlash), rays);

    vec3 blue = vec3(0.2, 0.5, 1.0);
    vec3 white = vec3(0.95, 0.97, 1.0);
    vec3 finalColor = mix(blue, white, smoothstep(0.3, 0.8, totalMask));

    float edgeMask = smoothstep(0.5, 0.42, dist);
    float alpha = totalMask * uIntensity * edgeMask;
    gl_FragColor = vec4(finalColor, alpha);
  }
`

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

// ===== THREE.JS OBJECTS =====

// Typed uniform accessors — avoids TS "possibly undefined" on uniforms dict access
type Uniforms = Record<string, THREE.IUniform>
interface BowObj { mesh: THREE.Mesh; u: { uDraw: THREE.IUniform; uIntensity: THREE.IUniform; uCharge: THREE.IUniform; uTime: THREE.IUniform } }
interface ArrowObj { mesh: THREE.Mesh; u: { uIntensity: THREE.IUniform; uTime: THREE.IUniform } }
interface ImpactObj { mesh: THREE.Mesh; u: { uIntensity: THREE.IUniform; uExpand: THREE.IUniform; uTime: THREE.IUniform } }

let bowObj: BowObj | null = null
let arrowObj: ArrowObj | null = null
let impactObj: ImpactObj | null = null
let clock: THREE.Clock | null = null

function createBowMesh(): BowObj {
  const u = {
    uDraw: { value: 0.0 } as THREE.IUniform,
    uIntensity: { value: 0.0 } as THREE.IUniform,
    uCharge: { value: 0.0 } as THREE.IUniform,
    uTime: { value: 0.0 } as THREE.IUniform,
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: commonVert,
    fragmentShader: bowFrag,
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 48, 48), material)
  mesh.visible = false
  return { mesh, u }
}

function createArrowMesh(): ArrowObj {
  const u = {
    uIntensity: { value: 0.0 } as THREE.IUniform,
    uTime: { value: 0.0 } as THREE.IUniform,
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: commonVert,
    fragmentShader: arrowFrag,
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 32, 8), material)
  mesh.visible = false
  return { mesh, u }
}

function createImpactMesh(): ImpactObj {
  const u = {
    uIntensity: { value: 0.0 } as THREE.IUniform,
    uExpand: { value: 0.0 } as THREE.IUniform,
    uTime: { value: 0.0 } as THREE.IUniform,
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: commonVert,
    fragmentShader: impactFrag,
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 32, 32), material)
  mesh.visible = false
  return { mesh, u }
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

  const t = clock?.getElapsedTime() ?? 0
  if (bowObj) bowObj.u.uTime.value = t
  if (arrowObj) arrowObj.u.uTime.value = t
  if (impactObj) impactObj.u.uTime.value = t

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

// ===== PUBLIC: play(attackerEl, defenderEl, damage?) =====

let isPlaying = false
let currentTl: gsap.core.Timeline | null = null

function play(attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) {
  if (isPlaying || !ready.value) return
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

  const atkRect = attackerEl.getBoundingClientRect()
  const defRect = defenderEl.getBoundingClientRect()
  const acx = atkRect.left - sceneRect.left + atkRect.width / 2
  const acy = atkRect.top - sceneRect.top + atkRect.height / 2
  const dcx = defRect.left - sceneRect.left + defRect.width / 2
  const dcy = defRect.top - sceneRect.top + defRect.height / 2

  const dirX = dcx - acx
  const dirY = dcy - acy
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
  const bp = s2t(acx, acy, W, H)
  bow.mesh.position.set(bp.x, bp.y, 1)
  bow.mesh.scale.set(atkRect.width * 1.4, atkRect.height * 1.2, 1)
  bow.mesh.rotation.z = -angle
  bow.mesh.visible = true
  bow.u.uDraw.value = 0
  bow.u.uIntensity.value = 0
  bow.u.uCharge.value = 0

  tl.to(bow.u.uIntensity, { value: 1.5, duration: 0.4, ease: 'power2.out' })
  tl.to(attackerEl, { boxShadow: '0 0 20px rgba(100,180,255,0.4)', duration: 0.4 }, '<')

  // ── Phase 2: DRAW STRING ──
  tl.to(bow.u.uDraw, { value: 1.0, duration: 0.7, ease: 'power2.in' })
  tl.to(bow.u.uCharge, { value: 1.0, duration: 0.7, ease: 'power3.in' }, '<')
  tl.to(bow.u.uIntensity, { value: 2.5, duration: 0.7, ease: 'power2.in' }, '<')

  tl.call(() => { spawnEmbers(acx, acy, 12, 60) }, undefined, '-=0.4')
  tl.call(() => { spawnEmbers(acx, acy, 15, 50) }, undefined, '-=0.2')

  // ── Phase 3: RELEASE ──
  tl.call(() => {
    gsap.to(bow.u.uDraw, { value: 0, duration: 0.15, ease: 'elastic.out(1, 0.4)' })
    gsap.to(bow.u.uCharge, { value: 0, duration: 0.1 })
    gsap.to(bow.u.uIntensity, { value: 0.5, duration: 0.3 })

    if (flashRef.value) {
      flashRef.value.style.background = 'rgba(100,180,255,0.3)'
      gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
    }

    spawnEmbers(acx + Math.cos(angle) * 40, acy + Math.sin(angle) * 40, 20, 40, '150,200,255')

    arrow.mesh.visible = true
    arrow.u.uIntensity.value = 2.0
  })

  // ── Phase 4: ARROW FLIGHT ──
  const arrowStartX = acx + Math.cos(angle) * (atkRect.width / 2 + 10)
  const arrowStartY = acy + Math.sin(angle) * (atkRect.height / 2 + 10)
  // Arrow flies to center of defender card (passes through)
  const arrowEndX = dcx
  const arrowEndY = dcy

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

      // Arrow direction — constant angle (no leveling at sharp angles)
      const p = s2t(ax, ay, W, H)
      arrow.mesh.position.set(p.x, p.y, 2)
      arrow.mesh.rotation.z = -angle
      arrow.mesh.scale.set(60, 14, 1)

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
      arrow.u.uIntensity.value = 0

      // Impact burst — at center of defender card
      const ip = s2t(dcx, dcy, W, H)
      impact.mesh.position.set(ip.x, ip.y, 2)
      impact.mesh.scale.set(220, 220, 1)
      impact.mesh.visible = true
      impact.u.uIntensity.value = 3.0
      impact.u.uExpand.value = 0
      gsap.to(impact.u.uExpand, { value: 1.0, duration: 0.5, ease: 'power2.out' })
      gsap.to(impact.u.uIntensity, {
        value: 0, duration: 0.6, ease: 'power2.in',
        onComplete: () => { impact.mesh.visible = false },
      })

      if (flashRef.value) {
        flashRef.value.style.background = `radial-gradient(ellipse at ${(dcx / W) * 100}% ${(dcy / H) * 100}%, rgba(100,180,255,0.4), transparent 60%)`
        gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
      }

      spawnEmbers(dcx, dcy, 30, 60, '100,180,255')
      spawnEmbers(dcx, dcy, 15, 40, '200,220,255')

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

  tl.to(bow.u.uIntensity, { value: 0, duration: 0.3 }, '<')
  tl.call(() => { bow.mesh.visible = false }, undefined, '+=0.1')
  tl.to(attackerEl, { boxShadow: 'none', duration: 0.3 }, '<')

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

function initWebGL() {
  const canvas = threeCanvasRef.value
  if (!canvas) return

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(window.devicePixelRatio)

    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.z = 10
    clock = new THREE.Clock()

    bowObj = createBowMesh()
    scene.add(bowObj.mesh)

    arrowObj = createArrowMesh()
    scene.add(arrowObj.mesh)

    impactObj = createImpactMesh()
    scene.add(impactObj.mesh)

    // Render one clear frame so the canvas buffer is transparent before first play()
    renderer.render(scene, camera)

    ready.value = true
    console.info('[BowWebGL] Initialized successfully')
  } catch (e: any) {
    console.warn('[BowWebGL] Init failed:', e)
  }
}

onMounted(() => {
  mounted = true
  initWebGL()
})

onUnmounted(() => {
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0
  mounted = false
  if (currentTl) { currentTl.kill(); currentTl = null }
  stopLoop()
  bowObj?.mesh.geometry?.dispose()
  ;(bowObj?.mesh.material as THREE.ShaderMaterial)?.dispose()
  arrowObj?.mesh.geometry?.dispose()
  ;(arrowObj?.mesh.material as THREE.ShaderMaterial)?.dispose()
  impactObj?.mesh.geometry?.dispose()
  ;(impactObj?.mesh.material as THREE.ShaderMaterial)?.dispose()
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  clock = null
})

defineExpose({ play, ready })
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
  background: transparent;
}
.bow-spark-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 12;
  pointer-events: none;
  background: transparent;
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
