<script setup lang="ts">
/**
 * WeatherEffects — lightweight canvas-based seasonal particles.
 * Replaces tsParticles (vue-particles) which caused lifecycle errors:
 *   "Cannot read properties of null (reading 'emitsOptions')"
 *   "Cannot set properties of null (setting '__vnode')"
 * Zero dependencies — just requestAnimationFrame + canvas 2D.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  season: 'spring' | 'summer' | 'autumn' | 'winter'
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let particles: Particle[] = []

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
  char: string    // emoji or shape indicator
  color: string   // for circle shapes
  isCircle: boolean
}

interface SeasonConfig {
  count: number
  chars: string[]
  isCircle: boolean
  colors: string[]
  sizeRange: [number, number]
  speedRange: [number, number]
  opacityRange: [number, number]
  drift: number
  wobble: number
}

const SEASON_CONFIG: Record<string, SeasonConfig> = {
  spring: {
    count: 16,
    chars: ['🌸', '🌺', '✿'],
    isCircle: false,
    colors: [],
    sizeRange: [10, 16],
    speedRange: [0.4, 1.2],
    opacityRange: [0.15, 0.5],
    drift: 1.2,
    wobble: 12,
  },
  summer: {
    count: 10,
    chars: [],
    isCircle: true,
    colors: ['#fbbf24', '#f59e0b', '#fcd34d'],
    sizeRange: [2, 5],
    speedRange: [0.15, 0.5],
    opacityRange: [0.1, 0.55],
    drift: 0.3,
    wobble: 8,
  },
  autumn: {
    count: 18,
    chars: ['🍂', '🍁', '🍃'],
    isCircle: false,
    colors: [],
    sizeRange: [12, 18],
    speedRange: [0.6, 1.6],
    opacityRange: [0.15, 0.45],
    drift: 2.0,
    wobble: 16,
  },
  winter: {
    count: 28,
    chars: ['❄', '❅', '•'],
    isCircle: false,
    colors: ['#e2e8f0', '#cbd5e1', '#ffffff'],
    sizeRange: [5, 13],
    speedRange: [0.2, 0.9],
    opacityRange: [0.1, 0.4],
    drift: 0.8,
    wobble: 8,
  },
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function createParticle(w: number, h: number, cfg: SeasonConfig, scatter = false): Particle {
  const char = cfg.chars.length ? cfg.chars[Math.floor(Math.random() * cfg.chars.length)]! : ''
  const color = cfg.colors.length ? cfg.colors[Math.floor(Math.random() * cfg.colors.length)]! : '#fff'
  return {
    x: Math.random() * w,
    y: scatter ? Math.random() * h : -rand(10, 40),
    vx: (Math.random() - 0.5) * cfg.drift,
    vy: rand(cfg.speedRange[0], cfg.speedRange[1]),
    size: rand(cfg.sizeRange[0], cfg.sizeRange[1]),
    opacity: rand(cfg.opacityRange[0], cfg.opacityRange[1]),
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.01 + Math.random() * 0.02,
    wobbleDist: cfg.wobble,
    char,
    color,
    isCircle: cfg.isCircle,
  }
}

function initParticles() {
  const canvas = canvasRef.value
  if (!canvas) return
  const cfg = SEASON_CONFIG[props.season]
  if (!cfg) return
  const w = canvas.width
  const h = canvas.height
  particles = []
  for (let i = 0; i < cfg.count; i++) {
    particles.push(createParticle(w, h, cfg, true))
  }
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
  rafId = requestAnimationFrame(animate)
  const canvas = canvasRef.value
  if (!canvas || !ctx) return

  const dt = lastTime ? Math.min((time - lastTime) / 16.67, 3) : 1 // normalize to ~60fps, cap at 3x
  lastTime = time

  const w = canvas.width
  const h = canvas.height
  if (w === 0 || h === 0) return

  ctx.clearRect(0, 0, w, h)

  const cfg = SEASON_CONFIG[props.season]
  if (!cfg) return

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    // Update
    p.wobblePhase += p.wobbleSpeed * dt
    p.rotation += p.rotSpeed * dt
    p.x += (p.vx + Math.sin(p.wobblePhase) * p.wobbleDist * 0.02) * dt
    p.y += p.vy * dt

    // Recycle offscreen particles
    if (p.y > h + 20 || p.x < -30 || p.x > w + 30) {
      const fresh = createParticle(w, h, cfg, false)
      particles[i] = fresh
      continue
    }

    // Draw
    ctx.save()
    ctx.globalAlpha = p.opacity
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)

    if (p.isCircle) {
      // Summer fireflies — glowing circles
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.shadowColor = p.color
      ctx.shadowBlur = p.size * 2
      ctx.fill()
    } else {
      // Emoji/text particles
      ctx.font = `${p.size}px serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.char, 0, 0)
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
  rafId = requestAnimationFrame(animate)
}

function stop() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  particles = []
  lastTime = 0
}

// Season change — reinitialize particles
watch(() => props.season, () => {
  stop()
  start()
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  start()
  // Auto-resize canvas when parent resizes
  const canvas = canvasRef.value
  if (canvas?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })
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
  z-index: 0;
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
