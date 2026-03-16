<script setup lang="ts">
/**
 * WeatherEffects — premium canvas-based seasonal particles.
 * Uses central rafLoop — no independent requestAnimationFrame.
 * ALL shapes drawn via canvas paths (no emoji — avoids cross-platform rendering issues).
 *
 * Spring: cherry blossom petals + pollen dust motes + soft green glow
 * Summer: fireflies (glowing orbs) + sun rays (diagonal light beams) + heat shimmer motes
 * Autumn: falling leaves (hand-drawn) + amber dust
 * Winter: snowflakes (6-fold symmetry) + ice crystals + frost mist
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { rafLoop } from '../../composables/useRAFLoop'

const props = defineProps<{
  season: 'spring' | 'summer' | 'autumn' | 'winter'
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let rafHandle = -1
let particles: Particle[] = []
let ambientLayers: AmbientLayer[] = []

type ShapeType = 'circle' | 'petal' | 'leaf' | 'snowflake' | 'dot'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  size: number
  opacity: number
  rotation: number
  rotSpeed: number
  wobblePhase: number
  wobbleSpeed: number
  wobbleDist: number
  color: string
  shape: ShapeType
  layer: number
  pulsePhase: number
  pulseSpeed: number
  lifetime: number
  maxLife: number
  variant: number  // sub-variant for shape variation (0-2)
}

interface AmbientLayer {
  type: 'ray' | 'mist' | 'glow'
  x: number; y: number
  width: number; height: number
  opacity: number
  angle: number
  speed: number
  phase: number
  color: string
  /** Pre-built gradient — avoids creating new gradient objects every frame */
  cachedGrad?: CanvasGradient
}

interface ParticleConfig {
  count: number
  shape: ShapeType
  colors: string[]
  sizeRange: [number, number]
  speedRange: [number, number]
  opacityRange: [number, number]
  drift: number
  wobble: number
  layer: number
  pulseSpeed: number
  maxLife: number
  rotSpeedRange: [number, number]
}

interface AmbientConfig {
  type: 'ray' | 'mist' | 'glow'
  count: number
  color: string
  opacityRange: [number, number]
  speed: number
}

interface SeasonConfig {
  particles: ParticleConfig[]
  ambient: AmbientConfig[]
}

const SEASONS: Record<string, SeasonConfig> = {
  spring: {
    particles: [
      // Cherry blossom petals — large, slow, gentle drift
      {
        count: 25, shape: 'petal', colors: ['#f9a8d4', '#f472b6', '#fda4af', '#fecdd3'],
        sizeRange: [8, 14], speedRange: [0.3, 1.0], opacityRange: [0.25, 0.65],
        drift: 1.8, wobble: 20, layer: 2, pulseSpeed: 0, maxLife: 0,
        rotSpeedRange: [-0.05, 0.05],
      },
      // Small petals — background layer
      {
        count: 18, shape: 'petal', colors: ['#fda4af', '#fecdd3', '#ffe4e6'],
        sizeRange: [4, 7], speedRange: [0.15, 0.6], opacityRange: [0.1, 0.3],
        drift: 1.0, wobble: 12, layer: 0, pulseSpeed: 0, maxLife: 0,
        rotSpeedRange: [-0.03, 0.03],
      },
      // Pollen dust motes — tiny glowing circles
      {
        count: 30, shape: 'circle', colors: ['#a7f3d0', '#d9f99d', '#fef3c7'],
        sizeRange: [1.5, 4], speedRange: [0.05, 0.3], opacityRange: [0.1, 0.45],
        drift: 0.5, wobble: 8, layer: 1, pulseSpeed: 0.025, maxLife: 0,
        rotSpeedRange: [0, 0],
      },
    ],
    ambient: [
      { type: 'glow', count: 3, color: 'rgba(74, 222, 128, 0.06)', opacityRange: [0.03, 0.08], speed: 0.003 },
      { type: 'glow', count: 2, color: 'rgba(249, 168, 212, 0.04)', opacityRange: [0.02, 0.06], speed: 0.004 },
    ],
  },
  summer: {
    particles: [
      // Fireflies — glowing orbs that float lazily, pulse
      {
        count: 24, shape: 'circle', colors: ['#fbbf24', '#f59e0b', '#fcd34d', '#fef3c7'],
        sizeRange: [3, 7], speedRange: [0.06, 0.25], opacityRange: [0.12, 0.65],
        drift: 0.6, wobble: 16, layer: 2, pulseSpeed: 0.035, maxLife: 0,
        rotSpeedRange: [0, 0],
      },
      // Heat shimmer dust — tiny, slow rising
      {
        count: 20, shape: 'dot', colors: ['#fde68a', '#fef9c3', '#fff7ed'],
        sizeRange: [1.5, 3], speedRange: [-0.2, -0.04], opacityRange: [0.06, 0.2],
        drift: 0.3, wobble: 5, layer: 0, pulseSpeed: 0.015, maxLife: 250,
        rotSpeedRange: [0, 0],
      },
    ],
    ambient: [
      { type: 'ray', count: 4, color: 'rgba(251, 191, 36, 0.08)', opacityRange: [0.03, 0.12], speed: 0.002 },
      { type: 'glow', count: 2, color: 'rgba(251, 191, 36, 0.05)', opacityRange: [0.03, 0.08], speed: 0.004 },
    ],
  },
  autumn: {
    particles: [
      // Large falling leaves — hand-drawn, heavy, strong wind drift
      {
        count: 22, shape: 'leaf', colors: ['#f97316', '#ea580c', '#dc2626', '#d97706', '#b45309'],
        sizeRange: [9, 16], speedRange: [0.5, 1.6], opacityRange: [0.25, 0.6],
        drift: 3.0, wobble: 24, layer: 2, pulseSpeed: 0, maxLife: 0,
        rotSpeedRange: [-0.07, 0.07],
      },
      // Small leaves — mid layer
      {
        count: 16, shape: 'leaf', colors: ['#c2410c', '#9a3412', '#854d0e', '#a16207'],
        sizeRange: [5, 9], speedRange: [0.3, 0.9], opacityRange: [0.12, 0.35],
        drift: 2.0, wobble: 16, layer: 0, pulseSpeed: 0, maxLife: 0,
        rotSpeedRange: [-0.04, 0.04],
      },
      // Amber dust particles
      {
        count: 25, shape: 'dot', colors: ['#f97316', '#fb923c', '#c2410c', '#fbbf24'],
        sizeRange: [1.5, 4], speedRange: [0.1, 0.5], opacityRange: [0.08, 0.3],
        drift: 1.5, wobble: 8, layer: 1, pulseSpeed: 0, maxLife: 0,
        rotSpeedRange: [0, 0],
      },
    ],
    ambient: [
      { type: 'glow', count: 3, color: 'rgba(249, 115, 22, 0.05)', opacityRange: [0.02, 0.06], speed: 0.003 },
      { type: 'glow', count: 2, color: 'rgba(220, 38, 38, 0.03)', opacityRange: [0.01, 0.04], speed: 0.005 },
    ],
  },
  winter: {
    particles: [
      // Snowflakes — foreground (6-fold symmetry drawn on canvas)
      {
        count: 35, shape: 'snowflake', colors: ['#e2e8f0', '#f1f5f9', '#ffffff'],
        sizeRange: [5, 11], speedRange: [0.3, 1.2], opacityRange: [0.15, 0.5],
        drift: 1.2, wobble: 12, layer: 2, pulseSpeed: 0.01, maxLife: 0,
        rotSpeedRange: [-0.025, 0.025],
      },
      // Small snowflakes — background layer
      {
        count: 25, shape: 'dot', colors: ['#cbd5e1', '#94a3b8', '#e2e8f0'],
        sizeRange: [2, 4], speedRange: [0.1, 0.5], opacityRange: [0.08, 0.25],
        drift: 0.6, wobble: 6, layer: 0, pulseSpeed: 0, maxLife: 0,
        rotSpeedRange: [0, 0],
      },
      // Ice crystals — sparkling
      {
        count: 18, shape: 'circle', colors: ['#bfdbfe', '#93c5fd', '#dbeafe', '#e0f2fe'],
        sizeRange: [1.5, 3.5], speedRange: [0.05, 0.25], opacityRange: [0.1, 0.4],
        drift: 0.4, wobble: 5, layer: 1, pulseSpeed: 0.045, maxLife: 180,
        rotSpeedRange: [0, 0],
      },
    ],
    ambient: [
      { type: 'mist', count: 3, color: 'rgba(147, 197, 253, 0.06)', opacityRange: [0.03, 0.08], speed: 0.001 },
      { type: 'glow', count: 2, color: 'rgba(96, 165, 250, 0.04)', opacityRange: [0.02, 0.05], speed: 0.003 },
    ],
  },
}

// ===== SHAPE DRAWING =====

/** Draw a cherry blossom petal */
function drawPetal(c: CanvasRenderingContext2D, size: number, color: string, variant: number) {
  c.fillStyle = color
  c.beginPath()
  if (variant === 0) {
    // Round petal
    c.ellipse(0, 0, size, size * 0.6, 0, 0, Math.PI * 2)
  } else if (variant === 1) {
    // Pointed petal
    c.moveTo(0, -size)
    c.quadraticCurveTo(size * 0.8, -size * 0.3, size * 0.4, size * 0.6)
    c.quadraticCurveTo(0, size * 0.8, -size * 0.4, size * 0.6)
    c.quadraticCurveTo(-size * 0.8, -size * 0.3, 0, -size)
  } else {
    // 5 small rounded petals (flower shape)
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2
      const px = Math.cos(angle) * size * 0.45
      const py = Math.sin(angle) * size * 0.45
      c.moveTo(px + size * 0.3, py)
      c.arc(px, py, size * 0.3, 0, Math.PI * 2)
    }
  }
  c.fill()
  // Center dot for flower variant
  if (variant === 2) {
    c.fillStyle = '#fef3c7'
    c.beginPath()
    c.arc(0, 0, size * 0.15, 0, Math.PI * 2)
    c.fill()
  }
}

/** Draw a leaf shape */
function drawLeaf(c: CanvasRenderingContext2D, size: number, color: string, variant: number) {
  c.fillStyle = color
  c.beginPath()
  if (variant === 0) {
    // Classic leaf — pointed oval with stem
    c.moveTo(0, -size)
    c.bezierCurveTo(size * 0.8, -size * 0.5, size * 0.7, size * 0.5, 0, size)
    c.bezierCurveTo(-size * 0.7, size * 0.5, -size * 0.8, -size * 0.5, 0, -size)
  } else if (variant === 1) {
    // Maple-like leaf (3 points)
    c.moveTo(0, -size)
    c.lineTo(size * 0.3, -size * 0.3)
    c.lineTo(size * 0.9, -size * 0.4)
    c.lineTo(size * 0.4, size * 0.1)
    c.lineTo(size * 0.6, size * 0.8)
    c.lineTo(0, size * 0.4)
    c.lineTo(-size * 0.6, size * 0.8)
    c.lineTo(-size * 0.4, size * 0.1)
    c.lineTo(-size * 0.9, -size * 0.4)
    c.lineTo(-size * 0.3, -size * 0.3)
    c.closePath()
  } else {
    // Rounded oak-like leaf
    c.moveTo(0, -size)
    c.quadraticCurveTo(size * 0.6, -size * 0.7, size * 0.5, -size * 0.2)
    c.quadraticCurveTo(size * 0.8, 0, size * 0.4, size * 0.3)
    c.quadraticCurveTo(size * 0.6, size * 0.7, 0, size)
    c.quadraticCurveTo(-size * 0.6, size * 0.7, -size * 0.4, size * 0.3)
    c.quadraticCurveTo(-size * 0.8, 0, -size * 0.5, -size * 0.2)
    c.quadraticCurveTo(-size * 0.6, -size * 0.7, 0, -size)
  }
  c.fill()
  // Vein line
  c.strokeStyle = color
  c.globalAlpha = (c.globalAlpha || 1) * 0.3
  c.lineWidth = 0.5
  c.beginPath()
  c.moveTo(0, -size * 0.8)
  c.lineTo(0, size * 0.7)
  c.stroke()
}

/** Draw a 6-fold snowflake */
function drawSnowflake(c: CanvasRenderingContext2D, size: number, color: string, variant: number) {
  c.strokeStyle = color
  c.lineWidth = size * 0.12
  c.lineCap = 'round'
  const arms = 6
  for (let i = 0; i < arms; i++) {
    const angle = (i / arms) * Math.PI * 2
    c.save()
    c.rotate(angle)
    // Main arm
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(0, -size)
    c.stroke()
    // Side branches
    if (variant !== 2) {
      const branchLen = size * 0.35
      const branchY = -size * 0.55
      c.beginPath()
      c.moveTo(0, branchY)
      c.lineTo(branchLen * 0.6, branchY - branchLen * 0.6)
      c.moveTo(0, branchY)
      c.lineTo(-branchLen * 0.6, branchY - branchLen * 0.6)
      c.stroke()
    }
    // Extra detail for variant 1
    if (variant === 1) {
      const b2y = -size * 0.3
      const b2len = size * 0.2
      c.beginPath()
      c.moveTo(0, b2y)
      c.lineTo(b2len, b2y - b2len * 0.5)
      c.moveTo(0, b2y)
      c.lineTo(-b2len, b2y - b2len * 0.5)
      c.stroke()
    }
    c.restore()
  }
  // Center dot
  c.fillStyle = color
  c.beginPath()
  c.arc(0, 0, size * 0.1, 0, Math.PI * 2)
  c.fill()
}

// ===== PARTICLE SYSTEM =====

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function createParticle(w: number, h: number, cfg: ParticleConfig, scatter: boolean): Particle {
  const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)]!
  const vy = rand(cfg.speedRange[0], cfg.speedRange[1])
  return {
    x: Math.random() * w,
    y: scatter ? Math.random() * h : (vy >= 0 ? -rand(10, 50) : h + rand(10, 50)),
    vx: (Math.random() - 0.5) * cfg.drift,
    vy,
    size: rand(cfg.sizeRange[0], cfg.sizeRange[1]),
    opacity: rand(cfg.opacityRange[0], cfg.opacityRange[1]),
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: rand(cfg.rotSpeedRange[0], cfg.rotSpeedRange[1]),
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.008 + Math.random() * 0.02,
    wobbleDist: cfg.wobble,
    color,
    shape: cfg.shape,
    layer: cfg.layer,
    pulsePhase: Math.random() * Math.PI * 2,
    pulseSpeed: cfg.pulseSpeed,
    lifetime: 0,
    maxLife: cfg.maxLife,
    variant: Math.floor(Math.random() * 3),
  }
}

function createAmbient(w: number, h: number, cfg: AmbientConfig): AmbientLayer {
  if (cfg.type === 'ray') {
    return {
      type: 'ray', x: rand(w * 0.3, w * 0.9), y: -20,
      width: rand(40, 100), height: h + 40,
      opacity: rand(cfg.opacityRange[0], cfg.opacityRange[1]),
      angle: rand(-25, -15) * Math.PI / 180,
      speed: cfg.speed, phase: Math.random() * Math.PI * 2, color: cfg.color,
    }
  }
  if (cfg.type === 'mist') {
    return {
      type: 'mist', x: 0, y: h * 0.75,
      width: w, height: h * 0.25,
      opacity: rand(cfg.opacityRange[0], cfg.opacityRange[1]),
      angle: 0, speed: cfg.speed, phase: Math.random() * Math.PI * 2, color: cfg.color,
    }
  }
  return {
    type: 'glow', x: rand(w * 0.1, w * 0.9), y: rand(h * 0.1, h * 0.9),
    width: rand(w * 0.3, w * 0.6), height: rand(h * 0.3, h * 0.6),
    opacity: rand(cfg.opacityRange[0], cfg.opacityRange[1]),
    angle: 0, speed: cfg.speed, phase: Math.random() * Math.PI * 2, color: cfg.color,
  }
}

function initParticles() {
  const canvas = canvasRef.value
  if (!canvas) return
  const season = SEASONS[props.season]
  if (!season) return
  const w = canvas.width
  const h = canvas.height
  particles = []
  ambientLayers = []

  for (const cfg of season.particles) {
    for (let i = 0; i < cfg.count; i++) {
      particles.push(createParticle(w, h, cfg, true))
    }
  }
  for (const cfg of season.ambient) {
    for (let i = 0; i < cfg.count; i++) {
      ambientLayers.push(createAmbient(w, h, cfg))
    }
  }
  // Sort once at init — layer never changes, so no per-frame sort needed
  particles.sort((a, b) => a.layer - b.layer)
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const parent = canvas.parentElement
  if (!parent) return
  canvas.width = parent.clientWidth
  canvas.height = parent.clientHeight
}

let lastTime = 0

function animate(time: number) {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return

  // Clamp dt to 2 frames max — prevents visible "speed burst" after frame drops
  const dt = lastTime ? Math.min((time - lastTime) / 16.67, 2) : 1
  lastTime = time

  const w = canvas.width
  const h = canvas.height
  if (w === 0 || h === 0) return

  ctx.clearRect(0, 0, w, h)

  const season = SEASONS[props.season]
  if (!season) return

  // --- Ambient layers (behind particles) — gradients cached at init ---
  for (const a of ambientLayers) {
    a.phase += a.speed * dt
    const pulseFactor = 0.5 + 0.5 * Math.sin(a.phase)
    ctx.save()
    ctx.globalAlpha = a.opacity * pulseFactor

    if (a.type === 'ray') {
      ctx.translate(a.x, a.y)
      ctx.rotate(a.angle)
      if (!a.cachedGrad) {
        a.cachedGrad = ctx.createLinearGradient(-a.width / 2, 0, a.width / 2, 0)
        a.cachedGrad.addColorStop(0, 'transparent')
        a.cachedGrad.addColorStop(0.3, a.color)
        a.cachedGrad.addColorStop(0.7, a.color)
        a.cachedGrad.addColorStop(1, 'transparent')
      }
      ctx.fillStyle = a.cachedGrad
      ctx.fillRect(-a.width / 2, 0, a.width, a.height)
    } else if (a.type === 'mist') {
      if (!a.cachedGrad) {
        a.cachedGrad = ctx.createLinearGradient(0, a.y, 0, a.y + a.height)
        a.cachedGrad.addColorStop(0, 'transparent')
        a.cachedGrad.addColorStop(0.4, a.color)
        a.cachedGrad.addColorStop(1, a.color)
      }
      ctx.fillStyle = a.cachedGrad
      ctx.fillRect(0, a.y, w, a.height)
    } else {
      if (!a.cachedGrad) {
        a.cachedGrad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.width / 2)
        a.cachedGrad.addColorStop(0, a.color)
        a.cachedGrad.addColorStop(1, 'transparent')
      }
      ctx.fillStyle = a.cachedGrad
      ctx.fillRect(a.x - a.width / 2, a.y - a.height / 2, a.width, a.height)
    }
    ctx.restore()
  }

  // --- Particles already sorted by layer on init (no per-frame sort) ---

  const cfgPools = season.particles

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!

    p.wobblePhase += p.wobbleSpeed * dt
    p.rotation += p.rotSpeed * dt
    p.lifetime += dt
    if (p.pulseSpeed > 0) p.pulsePhase += p.pulseSpeed * dt

    p.x += (p.vx + Math.sin(p.wobblePhase) * p.wobbleDist * 0.02) * dt
    p.y += p.vy * dt

    // Lifetime fade
    let lifeFade = 1
    if (p.maxLife > 0) {
      const progress = p.lifetime / p.maxLife
      if (progress > 0.7) lifeFade = 1 - ((progress - 0.7) / 0.3)
      if (progress >= 1) lifeFade = 0
    }

    // Recycle offscreen / expired
    const goingDown = p.vy >= 0
    const offscreen = goingDown
      ? (p.y > h + 30 || p.x < -40 || p.x > w + 40)
      : (p.y < -30 || p.x < -40 || p.x > w + 40)

    if (offscreen || lifeFade <= 0) {
      let poolIdx = 0
      let count = 0
      for (let c = 0; c < cfgPools.length; c++) {
        count += cfgPools[c]!.count
        if (i < count) { poolIdx = c; break }
      }
      Object.assign(p, createParticle(w, h, cfgPools[poolIdx]!, false))
      continue
    }

    // Final opacity
    let drawOpacity = p.opacity * lifeFade
    if (p.pulseSpeed > 0) {
      drawOpacity *= 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p.pulsePhase))
    }

    const depthScale = 0.6 + p.layer * 0.2

    ctx.save()
    ctx.globalAlpha = drawOpacity
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)

    const s = p.size * depthScale

    switch (p.shape) {
      case 'circle': {
        ctx.beginPath()
        ctx.arc(0, 0, s, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = s * 3
        ctx.fill()
        // Double-glow for fireflies
        if (p.pulseSpeed > 0.02) {
          ctx.globalAlpha = drawOpacity * 0.3
          ctx.beginPath()
          ctx.arc(0, 0, s * 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
      case 'dot': {
        ctx.beginPath()
        ctx.arc(0, 0, s, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        break
      }
      case 'petal': {
        drawPetal(ctx, s, p.color, p.variant)
        break
      }
      case 'leaf': {
        drawLeaf(ctx, s, p.color, p.variant)
        break
      }
      case 'snowflake': {
        drawSnowflake(ctx, s, p.color, p.variant)
        break
      }
    }

    ctx.restore()
  }
}

function start() {
  const canvas = canvasRef.value
  if (!canvas) return
  ctx = canvas.getContext('2d')
  if (!ctx) return
  resizeCanvas()
  initParticles()
  lastTime = 0
  if (rafHandle < 0) rafHandle = rafLoop.register(animate)
}

function stop() {
  if (rafHandle >= 0) { rafLoop.unregister(rafHandle); rafHandle = -1 }
  particles = []
  ambientLayers = []
  lastTime = 0
}

watch(() => props.season, () => {
  stop()
  start()
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  start()
  const canvas = canvasRef.value
  if (canvas?.parentElement) {
    resizeObserver = new ResizeObserver(() => resizeCanvas())
    resizeObserver.observe(canvas.parentElement)
  }
})

onUnmounted(() => {
  stop()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <div class="weather-layer" aria-hidden="true">
    <canvas ref="canvasRef" class="weather-canvas" />
  </div>
</template>

<style scoped>
.weather-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}
.weather-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
@media (max-width: 767px) {
  .weather-layer {
    opacity: 0.6;
  }
}
</style>
