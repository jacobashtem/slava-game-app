<script setup lang="ts">
/**
 * SlashAttackWebGPU — slash attack using WebGPU renderer + TSL nodes.
 * Faithful port of slash-attack-webgpu.html prototype.
 * Uses mx_noise_float for organic, procedural noise on slash edges.
 *
 * API identical to SlashAttackVFX:
 *   <SlashAttackWebGPU ref="slashRef" />
 *   slashRef.value?.play(attackerEl, defenderEl, damage?)
 */
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { Spark, tickSparks, acquireSpark } from '../../composables/useParticleSystem'
import { rafLoop } from '../../composables/useRAFLoop'

// Dynamic imports — WebGPU + TSL are heavy, load on demand
let THREE_GPU: typeof import('three/webgpu') | null = null
let TSL: {
  Fn: any; float: any; vec2: any; vec3: any; vec4: any
  uv: any; time: any; uniform: any; smoothstep: any
  mix: any; exp: any; mx_noise_float: any
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

// ===== WEBGPU + TSL SLASH MATERIAL =====

interface SlashObj {
  mesh: any
  uProgress: any
  uLife: any
  uWidth: any
  uDistort: any
}
const slashPool: SlashObj[] = []

function createSlashMaterial(slashColor: { r: number; g: number; b: number }, intensity: number): SlashObj {
  if (!THREE_GPU || !TSL) throw new Error('WebGPU/TSL not loaded')

  const { Fn, float, vec3, vec4, uv, time, uniform, smoothstep, mix, exp, mx_noise_float } = TSL

  const uProgress = uniform(0.0)
  const uLife = uniform(1.0)
  const uWidth = uniform(0.08)
  const uDistort = uniform(1.0)

  const material = new THREE_GPU.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE_GPU.DoubleSide,
    blending: THREE_GPU.AdditiveBlending,
  })

  material.outputNode = Fn(() => {
    const p = uv()
    const t = time

    const px = p.x
    const py = p.y.sub(0.5)

    // Hard edge mask
    const edgeFadeX = smoothstep(float(0.0), float(0.05), px).mul(smoothstep(float(1.0), float(0.95), px))
    const edgeFadeY = smoothstep(float(0.5), float(0.35), py.abs())

    // Organic distortion — MaterialX noise (much smoother than hash-based)
    const noiseCoord = vec3(px.mul(8.0), py.mul(5.0), t.mul(3.0))
    const noise = mx_noise_float(noiseCoord).mul(uDistort).mul(0.04)
    const distortedY = py.add(noise)

    // Progressive reveal
    const revealMask = smoothstep(uProgress, uProgress.sub(0.04), px)

    // Slash shape — Gaussian across Y
    const width = uWidth
    const shape = exp(distortedY.mul(distortedY).negate().div(width.mul(width)))

    // Hot core
    const coreWidth = width.mul(0.2)
    const core = exp(distortedY.mul(distortedY).negate().div(coreWidth.mul(coreWidth)))

    // Edge flicker from noise
    const edgeNoise = mx_noise_float(vec3(px.mul(18.0), py.mul(12.0), t.mul(8.0)))
    const edgeMask = shape.mul(float(0.7).add(edgeNoise.mul(0.3)))

    // Color gradient: white core -> hot color -> darker edge
    const coreColor = vec3(1.0, 1.0, 0.95)
    const midColor = vec3(slashColor.r, slashColor.g, slashColor.b)
    const edgeColor = vec3(slashColor.r * 0.4, slashColor.g * 0.2, slashColor.b * 0.3)

    const col = mix(edgeColor, midColor, shape)
    const finalCol = mix(col, coreColor, core.mul(0.8))

    const alpha = edgeMask.mul(revealMask).mul(uLife).mul(edgeFadeX).mul(edgeFadeY).mul(intensity)

    return vec4(finalCol, alpha)
  })()

  const geo = new THREE_GPU.PlaneGeometry(1, 1, 64, 16)
  const mesh = new THREE_GPU.Mesh(geo, material)
  mesh.visible = false

  return { mesh, uProgress, uLife, uWidth, uDistort }
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

  s.uProgress.value = 0
  s.uLife.value = 1.0
  s.uWidth.value = 0.08
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

  // WebGPU renderer handles time via TSL `time` node automatically
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

// ===== PUBLIC: play(attackerEl, defenderEl, damage?) =====

let isPlaying = false
let currentTl: gsap.core.Timeline | null = null

function play(attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) {
  if (isPlaying || !gpuReady.value) return
  if (!containerRef.value || !renderer || !scene || !camera) return
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

  const defRect = defenderEl.getBoundingClientRect()
  const dcx = defRect.left - sceneRect.left + defRect.width / 2
  const dcy = defRect.top - sceneRect.top + defRect.height / 2
  const dw = defRect.width
  const dh = defRect.height

  container.style.display = 'block'
  startLoop()

  const defInner = defenderEl.querySelector('.card-inner') || defenderEl

  // Direction
  const atkRect = attackerEl.getBoundingClientRect()
  const acx = atkRect.left - sceneRect.left + atkRect.width / 2
  const acy = atkRect.top - sceneRect.top + atkRect.height / 2
  const dirX = dcx - acx, dirY = dcy - acy
  const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1
  const nx = dirX / dist, ny = dirY / dist

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

  // WINDUP
  tl.to(attackerEl, { x: -nx * 14, y: -ny * 14, duration: 0.3, ease: 'power2.in' })
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

  // LUNGE
  const lungeX = nx * Math.min(120, dist * 0.4)
  const lungeY = ny * Math.min(120, dist * 0.4)
  tl.to(attackerEl, { x: lungeX, y: lungeY, duration: 0.1, ease: 'power4.in' })
  tl.call(() => {
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

  // SLASH IMPACT
  tl.call(() => {
    if (flashRef.value) {
      flashRef.value.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.5), rgba(255,200,150,0.3))'
      gsap.fromTo(flashRef.value, { opacity: 1 }, { opacity: 0, duration: 0.15 })
    }

    const pad = 8
    const sx1 = dcx - dw / 2 + pad
    const sy1 = dcy - dh / 2 + pad
    const sx2 = dcx + dw / 2 - pad
    const sy2 = dcy + dh / 2 - pad

    const s = slashPool[0]
    if (s) {
      s.uDistort.value = 1.3
      positionSlash(s, W, H, sx1, sy1, sx2, sy2, dw * 0.7)
      s.uWidth.value = 0.05
      gsap.to(s.uProgress, { value: 1.1, duration: 0.08, ease: 'power3.in' })
      gsap.to(s.uLife, { value: 0, duration: 0.9, delay: 0.08, ease: 'power2.in' })
    }

    pendingTimeouts.push(setTimeout(() => {
      spawnSlashSparks(sx1, sy1, sx2, sy2, 50)
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

    gsap.fromTo(defInner,
      { boxShadow: 'inset 0 0 80px rgba(255,30,10,0.85), 0 0 25px rgba(255,40,20,0.6)', borderColor: '#ff2020' },
      { boxShadow: 'inset 0 0 0 rgba(255,30,10,0), 0 0 0 rgba(255,40,20,0)', borderColor: '', duration: 0.7, delay: 0.15 }
    )

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

  // RETURN
  tl.to(attackerEl, { x: 0, y: 0, duration: 0.35, ease: 'power2.out' }, '+=0.15')

  // LINGERING EMBERS
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

async function initWebGPU() {
  try {
    // Check WebGPU support
    if (!navigator.gpu) {
      gpuError.value = 'WebGPU nie jest wspierany w tej przeglądarce'
      return
    }

    // Dynamic import — keeps main bundle smaller
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
      mix: tslModule.mix,
      exp: tslModule.exp,
      mx_noise_float: tslModule.mx_noise_float,
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

    // Pre-create slash pool
    for (let i = 0; i < 3; i++) {
      const s = createSlashMaterial({ r: 0.9, g: 0.7, b: 0.5 }, 2.5)
      scene.add(s.mesh)
      slashPool.push(s)
    }

    // Render one clear frame so the canvas buffer is transparent before first play()
    renderer.render(scene, camera)

    gpuReady.value = true
    console.info('[SlashWebGPU] Initialized successfully')
  } catch (e: any) {
    console.warn('[SlashWebGPU] Init failed:', e)
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
  slashPool.forEach(s => {
    s.mesh.geometry?.dispose()
    s.mesh.material?.dispose()
  })
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
})

defineExpose({ play, gpuReady, gpuError })
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
