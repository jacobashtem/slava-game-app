<script setup lang="ts">
/**
 * SlashAttackVFX — full choreographed slash attack.
 * Standalone Three.js WebGL + 2D canvas sparks + GSAP timeline.
 * Based on the WebGPU TSL reference, translated to GLSL for browser compat.
 *
 * Usage:
 *   <SlashAttackVFX ref="slashRef" />
 *   slashRef.value?.play(attackerEl, defenderEl)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

// ===== EXPOSED API =====
const containerRef = ref<HTMLDivElement | null>(null)
const threeCanvasRef = ref<HTMLCanvasElement | null>(null)
const sparkCanvasRef = ref<HTMLCanvasElement | null>(null)
const flashRef = ref<HTMLDivElement | null>(null)
const dmgRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let rafHandle = -1
let sparks: Spark[] = []
let sCtx: CanvasRenderingContext2D | null = null
let mounted = false
let loopActive = false
const pendingTimeouts: number[] = []

// ===== GLSL SHADERS — translated from TSL reference =====

const slashVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const slashFrag = /* glsl */ `
  uniform float uProgress;
  uniform float uLife;
  uniform float uWidth;
  uniform float uDistort;
  uniform float uTime;
  uniform vec3 uSlashColor;
  uniform float uIntensity;
  varying vec2 vUv;

  // Simple noise function
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

  void main() {
    float px = vUv.x;
    float py = vUv.y - 0.5;

    // Edge mask
    float edgeFadeX = smoothstep(0.0, 0.05, px) * smoothstep(1.0, 0.95, px);
    float edgeFadeY = smoothstep(0.5, 0.35, abs(py));

    // Organic noise distortion
    vec3 noiseCoord = vec3(px * 8.0, py * 5.0, uTime * 3.0);
    float n = noise(noiseCoord) * uDistort * 0.04;
    float distortedY = py + n;

    // Progressive reveal — left to right
    float revealMask = smoothstep(uProgress, uProgress - 0.04, px);

    // Slash shape — Gaussian across Y
    float shape = exp(-(distortedY * distortedY) / (uWidth * uWidth));

    // Hot core — very tight center
    float coreWidth = uWidth * 0.2;
    float core = exp(-(distortedY * distortedY) / (coreWidth * coreWidth));

    // Edge flicker
    float edgeNoise = noise(vec3(px * 18.0, py * 12.0, uTime * 8.0));
    float edgeMask = shape * (0.7 + edgeNoise * 0.3);

    // Color gradient: white core → slash color → dark edge
    vec3 edgeColor = uSlashColor * vec3(0.4, 0.2, 0.3);
    vec3 midColor = uSlashColor;
    vec3 coreColor = vec3(1.0, 1.0, 0.95);

    vec3 col = mix(edgeColor, midColor, shape);
    vec3 finalCol = mix(col, coreColor, core * 0.8);

    float alpha = edgeMask * revealMask * uLife * edgeFadeX * edgeFadeY * uIntensity;

    gl_FragColor = vec4(finalCol, alpha);
  }
`

// ===== SPARK PARTICLE SYSTEM (shared) =====

function spawnSlashSparks(x1: number, y1: number, x2: number, y2: number, count: number) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = -dy / len, ny = dx / len
  for (let i = 0; i < count; i++) {
    const t = Math.random()
    const px = x1 + dx * t, py = y1 + dy * t
    const side = (Math.random() - 0.5) * 2
    const speed = 2 + Math.random() * 7
    sparks.push(acquireSpark(px, py, {
      vx: nx * side * speed + (Math.random() - 0.5) * 2,
      vy: ny * side * speed + (Math.random() - 0.5) * 2,
      life: 0.3 + Math.random() * 0.5,
      decay: 0.012 + Math.random() * 0.015,
      size: 1 + Math.random() * 2.5,
      color: Math.random() > 0.3 ? '255,230,180' : '255,160,80',
      type: 'spark',
      gravity: 0.06, friction: 0.97,
      angle: Math.atan2(ny * side, nx * side),
      spin: (Math.random() - 0.5) * 0.2,
    }))
  }
  // Metal shards
  for (let i = 0; i < Math.floor(count * 0.3); i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 5
    sparks.push(acquireSpark((x1 + x2) / 2, (y1 + y2) / 2, {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.3,
      decay: 0.02,
      size: 2 + Math.random() * 3,
      color: '200,210,230',
      type: 'shard',
      gravity: 0.1, friction: 0.97,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.5,
    }))
  }
}

// ===== THREE.JS SETUP =====

interface SlashObj {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
}
const slashPool: SlashObj[] = []

function createSlashMaterial(color: { r: number; g: number; b: number }, intensity: number): SlashObj {
  const material = new THREE.ShaderMaterial({
    vertexShader: slashVert,
    fragmentShader: slashFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0.0 },
      uLife: { value: 1.0 },
      uWidth: { value: 0.08 },
      uDistort: { value: 1.0 },
      uTime: { value: 0.0 },
      uSlashColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
      uIntensity: { value: intensity },
    },
  })

  const geo = new THREE.PlaneGeometry(1, 1, 64, 16)
  const mesh = new THREE.Mesh(geo, material)
  mesh.visible = false

  return { mesh, mat: material }
}

function positionSlash(
  s: SlashObj, W: number, H: number,
  x1: number, y1: number, x2: number, y2: number, thickness: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2

  const tx = cx - W / 2
  const ty = -(cy - H / 2)

  s.mesh.position.set(tx, ty, 1)
  s.mesh.rotation.z = -angle
  s.mesh.scale.set(len * 1.3, thickness, 1)
  s.mesh.visible = true

  s.mat.uniforms.uProgress!.value = 0
  s.mat.uniforms.uLife!.value = 1.0
  s.mat.uniforms.uWidth!.value = 0.08
}

// ===== ANIMATION LOOP =====

let startTime = 0

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

  const now = performance.now() / 1000
  // Update shader time
  for (const s of slashPool) {
    s.mat.uniforms.uTime!.value = now - startTime
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }

  // Draw 2D sparks
  if (sCtx && sparkCanvasRef.value) {
    const w = sparkCanvasRef.value.width / (window.devicePixelRatio || 1)
    const h = sparkCanvasRef.value.height / (window.devicePixelRatio || 1)
    sCtx.clearRect(0, 0, w, h)
    tickSparks(sparks, sCtx!)
  }
}

// ===== PUBLIC: play(attackerEl, defenderEl) =====

let isPlaying = false
let currentTl: gsap.core.Timeline | null = null

function play(attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) {
  if (isPlaying) { console.warn('[SlashVFX] Already playing, skipped'); return }
  if (!containerRef.value || !renderer || !scene || !camera) {
    console.warn('[SlashVFX] Not ready:', { container: !!containerRef.value, renderer: !!renderer, scene: !!scene, camera: !!camera })
    return
  }
  // console.info('[SlashVFX] play() called, dmg:', damage)
  isPlaying = true

  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0

  const container = containerRef.value
  // Position overlay over the game board (or showcase arena row)
  const sceneEl = attackerEl.closest('.game-board') || attackerEl.closest('.p3-arena-row') || containerRef.value!.parentElement!
  const sceneRect = sceneEl.getBoundingClientRect()
  const W = sceneRect.width
  const H = sceneRect.height

  // Resize canvases
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

  // Defender position relative to scene
  const defRect = defenderEl.getBoundingClientRect()
  const dcx = defRect.left - sceneRect.left + defRect.width / 2
  const dcy = defRect.top - sceneRect.top + defRect.height / 2
  const dw = defRect.width
  const dh = defRect.height

  // Show container and start render loop
  container.style.display = 'block'
  startTime = performance.now() / 1000
  startLoop()

  const defInner = defenderEl.querySelector('.card-inner') || defenderEl

  // Direction from attacker to defender (for directional windup/lunge)
  const atkRect = attackerEl.getBoundingClientRect()
  const acx = atkRect.left - sceneRect.left + atkRect.width / 2
  const acy = atkRect.top - sceneRect.top + atkRect.height / 2
  const dirX = dcx - acx
  const dirY = dcy - acy
  const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1
  const nx = dirX / dist
  const ny = dirY / dist

  if (currentTl) currentTl.kill()
  const tl = gsap.timeline({
    onComplete: () => {
      isPlaying = false
      currentTl = null
      container.style.display = 'none'
      slashPool.forEach(s => { s.mesh.visible = false })
      sparks = []
      stopLoop()
    },
  })
  currentTl = tl

  // ── WINDUP: attacker pulls back (away from defender) ──
  tl.to(attackerEl, { x: -nx * 14, y: -ny * 14, duration: 0.3, ease: 'power2.in' })

  // Gather sparks around attacker
  tl.call(() => {
    const aRect2 = attackerEl.getBoundingClientRect()
    const ax = aRect2.left - sceneRect.left + aRect2.width / 2
    const ay = aRect2.top - sceneRect.top + aRect2.height / 2
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2
      const d = 25 + Math.random() * 35
      sparks.push(acquireSpark(ax + Math.cos(angle) * d, ay + Math.sin(angle) * d, {
        vx: -Math.cos(angle) * 3, vy: -Math.sin(angle) * 3,
        life: 0.5, decay: 0.025, size: 1.5, color: '220,200,255', type: 'ember', friction: 0.94,
      }))
    }
  }, undefined, 0.1)

  // ── LUNGE: attacker lunges toward defender ──
  const lungeX = nx * Math.min(120, dist * 0.4)
  const lungeY = ny * Math.min(120, dist * 0.4)
  tl.to(attackerEl, { x: lungeX, y: lungeY, duration: 0.1, ease: 'power4.in' })
  tl.call(() => {
    // Trail sparks behind the attacker during lunge
    const aRect2 = attackerEl.getBoundingClientRect()
    const ax = aRect2.left - sceneRect.left + aRect2.width / 2
    const ay = aRect2.top - sceneRect.top + aRect2.height / 2
    for (let i = 0; i < 15; i++) {
      sparks.push(acquireSpark(ax - nx * i * 14, ay - ny * i * 14 + (Math.random() - 0.5) * 25, {
        vx: -nx * 3 - Math.random() * 3 * nx, vy: -ny * 3 + (Math.random() - 0.5) * 0.5,
        life: 0.15 + Math.random() * 0.15, decay: 0.035, size: 2 + Math.random() * 3,
        color: '180,170,210', type: 'ember', friction: 0.94,
      }))
    }
  }, undefined, '<')

  // ── SLASH IMPACT ──
  tl.call(() => {
    // Screen flash
    if (flashRef.value) {
      flashRef.value.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.5), rgba(255,200,150,0.3))'
      gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
    }

    // Slash within card bounds
    const pad = 8
    const sx1 = dcx - dw / 2 + pad
    const sy1 = dcy - dh / 2 + pad
    const sx2 = dcx + dw / 2 - pad
    const sy2 = dcy + dh / 2 - pad

    const s = slashPool[0]
    if (s) {
      s.mat.uniforms.uDistort!.value = 1.3
      positionSlash(s, W, H, sx1, sy1, sx2, sy2, dw * 0.7)
      s.mat.uniforms.uWidth!.value = 0.06
      // Slower reveal (0.2s) + longer linger (1.5s) so the slash is clearly visible
      gsap.to(s.mat.uniforms.uProgress!, { value: 1.1, duration: 0.2, ease: 'power3.in' })
      gsap.to(s.mat.uniforms.uLife!, { value: 0, duration: 1.5, delay: 0.2, ease: 'power2.in' })
    }

    // 2D sparks along slash line
    pendingTimeouts.push(setTimeout(() => {
      spawnSlashSparks(sx1, sy1, sx2, sy2, 50)
      // Extra embers from center
      for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 1 + Math.random() * 4
        sparks.push(acquireSpark(dcx, dcy, {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 0.5 + Math.random() * 0.5, decay: 0.01,
          size: 2, color: '180,30,40', type: 'ember',
          gravity: 0.1, friction: 0.98,
        }))
      }
    }, 40) as unknown as number)

    // Heavy shake on defender
    pendingTimeouts.push(setTimeout(() => {
      const shakeTl = gsap.timeline()
      for (let i = 0; i < 12; i++) {
        const int = 12 * (1 - i / 12)
        shakeTl.to(defenderEl, {
          x: (Math.random() - 0.5) * int * 2.5,
          y: (Math.random() - 0.5) * int * 1.5,
          duration: 0.035,
        })
      }
      shakeTl.to(defenderEl, { x: 0, y: 0, duration: 0.15 })
    }, 50) as unknown as number)

    // Damage glow on defender — intense red overlay so it's visible on colorful cards
    gsap.fromTo(defInner,
      { boxShadow: 'inset 0 0 80px rgba(255,30,10,0.85), 0 0 25px rgba(255,40,20,0.6)', borderColor: '#ff2020' },
      { boxShadow: 'inset 0 0 0 rgba(255,30,10,0), 0 0 0 rgba(255,40,20,0)', borderColor: '', duration: 0.7, delay: 0.15 }
    )

    // Damage number — show actual damage value
    if (dmgRef.value) {
      dmgRef.value.textContent = damage ? `-${damage}` : '-?'
      dmgRef.value.style.left = (dcx - 25) + 'px'
      dmgRef.value.style.top = (dcy - 50) + 'px'
      gsap.fromTo(dmgRef.value,
        { opacity: 1, y: 0, scale: 0.3, rotation: -5 },
        { opacity: 0, y: -100, scale: 1.8, rotation: 3, duration: 1.8, ease: 'power2.out' }
      )
    }
  })

  // ── ATTACKER RETURNS ──
  tl.to(attackerEl, { x: 0, y: 0, duration: 0.5, ease: 'power2.out' }, '+=0.4')

  // Lingering embers
  tl.call(() => {
    for (let i = 0; i < 12; i++) {
      pendingTimeouts.push(setTimeout(() => {
        sparks.push(acquireSpark(
          dcx + (Math.random() - 0.5) * dw,
          dcy + (Math.random() - 0.5) * dh * 0.4,
          {
            vx: (Math.random() - 0.5) * 0.4,
            vy: 0.5 + Math.random() * 0.8,
            life: 0.8, decay: 0.007, size: 1 + Math.random(),
            color: '255,180,100', type: 'ember',
            gravity: 0.04, friction: 0.998,
          }
        ))
      }, i * 80) as unknown as number)
    }
  }, undefined, '-=0.2')
}

// ===== LIFECYCLE =====

onMounted(() => {
  mounted = true
  const canvas = threeCanvasRef.value
  if (!canvas) { console.warn('[SlashVFX] No canvas on mount'); return }

  console.info('[SlashVFX] Initializing Three.js renderer')
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(window.devicePixelRatio)

  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  camera.position.z = 10

  // Pre-create slash pool (meshes hidden, render loop starts on-demand in play())
  for (let i = 0; i < 3; i++) {
    const s = createSlashMaterial({ r: 0.9, g: 0.7, b: 0.5 }, 2.5)
    scene.add(s.mesh)
    slashPool.push(s)
  }

  // Render one clear frame so the canvas buffer is transparent before first play()
  renderer.render(scene, camera)
})

onUnmounted(() => {
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0
  mounted = false
  if (currentTl) { currentTl.kill(); currentTl = null }
  stopLoop()
  slashPool.forEach(s => {
    s.mesh.geometry.dispose()
    s.mat.dispose()
  })
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
})

defineExpose({ play })
</script>

<template>
  <div ref="containerRef" class="slash-attack-overlay" style="display: none;">
    <canvas ref="threeCanvasRef" class="slash-three-canvas" />
    <canvas ref="sparkCanvasRef" class="slash-spark-canvas" />
    <div ref="flashRef" class="slash-screen-flash" />
    <div ref="dmgRef" class="slash-damage-number">-8</div>
  </div>
</template>

<style scoped>
.slash-attack-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  overflow: hidden;
}
.slash-three-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}
.slash-spark-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 12;
  pointer-events: none;
}
.slash-screen-flash {
  position: absolute;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  opacity: 0;
}
.slash-damage-number {
  position: absolute;
  font-family: 'Cinzel Decorative', Georgia, serif;
  font-size: 56px;
  font-weight: 900;
  z-index: 25;
  opacity: 0;
  pointer-events: none;
  color: #ff3030;
  text-shadow: 0 0 20px rgba(255,30,20,0.9), 0 0 50px rgba(255,20,10,0.5), 2px 2px 0 #400000;
}
</style>
