<script setup lang="ts">
/**
 * VFXOverlay — single overlay for ALL game VFX.
 *
 * Architecture:
 *   - Canvas layer for particle effects (hits, death, status)
 *   - DOM layer for text (damage numbers via GSAP)
 *   - Position pre-captured at emit time (meta.rect / meta.pos)
 *
 * Effects:
 *   - damage-number: floating GSAP text
 *   - hit: impact particles + flash (melee/elemental/magic/ranged)
 *   - death: card shatters into fragments
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import { useVFXOrchestrator, type VFXEvent, type AttackVisualType } from '../../composables/useVFXOrchestrator'
import { rafLoop } from '../../composables/useRAFLoop'
import { useGameStore } from '../../stores/gameStore'

const vfx = useVFXOrchestrator()
const game = useGameStore()

let overlayEl: HTMLElement | null = null
const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let rafHandle = -1
const _vfxTimeouts: ReturnType<typeof setTimeout>[] = []

function vfxTimeout(fn: () => void, ms: number) {
  _vfxTimeouts.push(setTimeout(fn, ms))
}

function clearVfxTimeouts() {
  _vfxTimeouts.forEach(clearTimeout)
  _vfxTimeouts.length = 0
}

// ===== PARTICLE SYSTEM =====

interface Particle {
  x: number; y: number
  vx: number; vy: number
  size: number
  opacity: number
  color: string
  life: number       // 0→1 progress
  maxLife: number     // total frames
  gravity: number
  friction: number
  rotation: number
  rotSpeed: number
  shape: 'circle' | 'spark' | 'slash' | 'energyslash' | 'shard' | 'ring' | 'rune' | 'ember' | 'shield' | 'arrow' | 'snowflake' | 'bolt' | 'cross' | 'star' | 'droplet' | 'leaf'
  /** For ring shape: current scale */
  scale: number
  scaleSpeed: number
}

let particles: Particle[] = []

function rand(min: number, max: number) { return min + Math.random() * (max - min) }
function randSign() { return Math.random() > 0.5 ? 1 : -1 }

// ===== HIT EFFECT EMITTERS =====

function emitMeleeHit(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const slashLen = Math.max(w, h) * 1.1

  // === PRIMARY ENERGY SLASH — diagonal lightsaber burn ===
  // Main cut: bright white-hot core, appears instantly, fades slowly like a burn mark
  const mainAngle = rand(-0.9, -0.4) // top-right to bottom-left diagonal
  particles.push({
    x: cx, y: cy,
    vx: 0, vy: 0,
    size: slashLen,
    opacity: 1,
    color: '#ffffff',
    life: 0, maxLife: 35, // longer life = visible burn
    gravity: 0, friction: 1,
    rotation: mainAngle, rotSpeed: 0,
    shape: 'energyslash', scale: 1, scaleSpeed: 0,
  })

  // === SECOND SLASH — shorter, crossing, slightly delayed feel via offset start ===
  const crossAngle = mainAngle + rand(0.8, 1.2) // ~perpendicular cross
  particles.push({
    x: cx + rand(-4, 4), y: cy + rand(-4, 4),
    vx: 0, vy: 0,
    size: slashLen * 0.7,
    opacity: 0.9,
    color: '#fbbf24',
    life: -4, maxLife: 32, // negative life = delayed start
    gravity: 0, friction: 1,
    rotation: crossAngle, rotSpeed: 0,
    shape: 'energyslash', scale: 1, scaleSpeed: 0,
  })

  // === HOT EMBERS — few sparks flying off the cut ===
  for (let i = 0; i < 6; i++) {
    const angle = mainAngle + rand(-0.4, 0.4)
    const along = rand(-slashLen * 0.4, slashLen * 0.4)
    const speed = rand(1.5, 4)
    particles.push({
      x: cx + Math.cos(mainAngle + Math.PI / 2) * along * 0.3,
      y: cy + Math.sin(mainAngle + Math.PI / 2) * along * 0.3,
      vx: Math.cos(angle + Math.PI / 2) * speed * randSign(),
      vy: Math.sin(angle + Math.PI / 2) * speed * randSign(),
      size: rand(1.5, 3),
      opacity: 1,
      color: Math.random() > 0.5 ? '#fbbf24' : '#ffffff',
      life: 0, maxLife: rand(18, 30),
      gravity: 0.1, friction: 0.95,
      rotation: 0, rotSpeed: 0,
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== COUNTER-ATTACK EFFECT =====

function emitCounterattack(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const size = Math.max(w, h)

  // === SHIELD DOME — bright expanding arc ===
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: size * 0.9,
    opacity: 1,
    color: '#fbbf24',
    life: 0, maxLife: 20,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'shield', scale: 0.5, scaleSpeed: 0.08,
  })

  // === FULL-CARD FLASH — white-hot flash that covers the whole card ===
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: size * 1.2,
    opacity: 0.9,
    color: '#ffffff',
    life: 0, maxLife: 10,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'circle', scale: 1.5, scaleSpeed: -0.02,
  })

  // === RETALIATION SPARKS — amber/gold sparks burst outward ===
  for (let i = 0; i < 10; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(3, 7)
    particles.push({
      x: cx + rand(-4, 4), y: cy + rand(-4, 4),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(2, 4),
      opacity: 1,
      color: ['#fbbf24', '#f59e0b', '#ffffff'][Math.floor(Math.random() * 3)]!,
      life: 0, maxLife: rand(14, 24),
      gravity: 0.1, friction: 0.94,
      rotation: 0, rotSpeed: 0,
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }

  // === IMPACT RING — amber expanding ring ===
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: size * 0.6,
    opacity: 0.7,
    color: '#f59e0b',
    life: 0, maxLife: 18,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'ring', scale: 0.2, scaleSpeed: 0.12,
  })
}

function emitElementalHit(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Embers rising upward
  for (let i = 0; i < 22; i++) {
    particles.push({
      x: cx + rand(-w * 0.4, w * 0.4),
      y: cy + rand(-h * 0.1, h * 0.4),
      vx: rand(-1.5, 1.5),
      vy: rand(-4, -1),
      size: rand(2, 5),
      opacity: 1,
      color: ['#fbbf24', '#f97316', '#ef4444', '#fef3c7'][Math.floor(Math.random() * 4)]!,
      life: 0, maxLife: rand(25, 50),
      gravity: -0.05, friction: 0.97,
      rotation: 0, rotSpeed: rand(-0.1, 0.1),
      shape: 'ember', scale: 1, scaleSpeed: 0,
    })
  }

  // Fire burst flash
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 1.2,
    opacity: 0.6,
    color: '#f97316',
    life: 0, maxLife: 20,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'ring', scale: 0.3, scaleSpeed: 0.12,
  })

  // Outward fire sparks
  for (let i = 0; i < 10; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(2, 6)
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(1.5, 3.5),
      opacity: 0.9,
      color: Math.random() > 0.5 ? '#fbbf24' : '#fb923c',
      life: 0, maxLife: rand(18, 30),
      gravity: -0.03, friction: 0.95,
      rotation: 0, rotSpeed: 0,
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

function emitMagicHit(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Rune circle (expanding ring)
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.6,
    opacity: 0.9,
    color: '#a855f7',
    life: 0, maxLife: 24,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0.08,
    shape: 'ring', scale: 0.1, scaleSpeed: 0.1,
  })
  // Second ring delayed via smaller start
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.5,
    opacity: 0.6,
    color: '#c084fc',
    life: 0, maxLife: 28,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: -0.06,
    shape: 'ring', scale: 0.05, scaleSpeed: 0.09,
  })

  // Orbiting rune symbols
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const orbitR = rand(20, 40)
    particles.push({
      x: cx + Math.cos(angle) * orbitR,
      y: cy + Math.sin(angle) * orbitR,
      vx: Math.cos(angle + Math.PI / 2) * 2,
      vy: Math.sin(angle + Math.PI / 2) * 2,
      size: rand(6, 10),
      opacity: 0.9,
      color: '#e9d5ff',
      life: 0, maxLife: rand(22, 32),
      gravity: 0, friction: 0.97,
      rotation: angle, rotSpeed: 0.1,
      shape: 'rune', scale: 1, scaleSpeed: 0,
    })
  }

  // Sparkle burst
  for (let i = 0; i < 16; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(2, 7)
    particles.push({
      x: cx + rand(-5, 5), y: cy + rand(-5, 5),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(1.5, 3),
      opacity: 1,
      color: ['#c084fc', '#e9d5ff', '#a855f7', '#818cf8'][Math.floor(Math.random() * 4)]!,
      life: 0, maxLife: rand(16, 28),
      gravity: 0, friction: 0.95,
      rotation: 0, rotSpeed: 0,
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

function emitRangedHit(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Impact crater ring
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.6,
    opacity: 0.7,
    color: '#60a5fa',
    life: 0, maxLife: 18,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'ring', scale: 0.15, scaleSpeed: 0.14,
  })

  // Splinter debris flying outward
  for (let i = 0; i < 8; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(3, 8)
    particles.push({
      x: cx + rand(-4, 4), y: cy + rand(-4, 4),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(4, 8),
      opacity: 0.8,
      color: Math.random() > 0.5 ? '#94a3b8' : '#cbd5e1',
      life: 0, maxLife: rand(15, 25),
      gravity: 0.2, friction: 0.94,
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.2, 0.2),
      shape: 'shard', scale: 1, scaleSpeed: 0,
    })
  }

  // Fine dust
  for (let i = 0; i < 10; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(1, 4)
    particles.push({
      x: cx + rand(-6, 6), y: cy + rand(-6, 6),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(1, 2.5),
      opacity: 0.6,
      color: '#e2e8f0',
      life: 0, maxLife: rand(20, 35),
      gravity: 0.05, friction: 0.96,
      rotation: 0, rotSpeed: 0,
      shape: 'circle', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== BLOCK / ODPORNY EFFECT =====

function emitBlock(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Shield dome — expanding translucent arc
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.7,
    opacity: 0.8,
    color: '#60a5fa',
    life: 0, maxLife: 30,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'ring', scale: 0.3, scaleSpeed: 0.08,
  })

  // Second inner ring (gold)
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.5,
    opacity: 0.6,
    color: '#fbbf24',
    life: 0, maxLife: 24,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0.05,
    shape: 'ring', scale: 0.2, scaleSpeed: 0.1,
  })

  // Shield glint sparks — deflection particles flying outward from center
  for (let i = 0; i < 10; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(2, 5)
    particles.push({
      x: cx + rand(-6, 6), y: cy + rand(-6, 6),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(2, 4),
      opacity: 0.9,
      color: ['#60a5fa', '#93c5fd', '#dbeafe', '#fbbf24'][Math.floor(Math.random() * 4)]!,
      life: 0, maxLife: rand(15, 25),
      gravity: 0, friction: 0.94,
      rotation: 0, rotSpeed: 0,
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }

  // Rune symbols orbiting (magical resistance feel)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const orbitR = rand(15, 30)
    particles.push({
      x: cx + Math.cos(angle) * orbitR,
      y: cy + Math.sin(angle) * orbitR,
      vx: Math.cos(angle + Math.PI / 2) * 1.5,
      vy: Math.sin(angle + Math.PI / 2) * 1.5,
      size: rand(5, 8),
      opacity: 0.8,
      color: '#93c5fd',
      life: 0, maxLife: rand(18, 26),
      gravity: 0, friction: 0.97,
      rotation: angle, rotSpeed: 0.08,
      shape: 'rune', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== DEATH EFFECT =====

function emitDeath(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Card shatters into fragments
  const cols = 4
  const rows = 5
  const fragW = w / cols
  const fragH = h / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fx = rect.cx - w / 2 + c * fragW + fragW / 2
      const fy = rect.cy - h / 2 + r * fragH + fragH / 2
      const dx = fx - cx
      const dy = fy - cy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const speed = rand(2, 6)
      particles.push({
        x: fx, y: fy,
        vx: (dx / dist) * speed + rand(-1, 1),
        vy: (dy / dist) * speed + rand(-0.5, 0.5),
        size: Math.max(fragW, fragH) * 0.6,
        opacity: 0.9,
        color: Math.random() > 0.3 ? '#1a1520' : '#c8a84e',
        life: 0, maxLife: rand(30, 50),
        gravity: 0.15, friction: 0.96,
        rotation: rand(0, Math.PI * 2),
        rotSpeed: rand(-0.15, 0.15),
        shape: 'shard', scale: 1, scaleSpeed: -0.01,
      })
    }
  }

  // Dark smoke rising from center
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: cx + rand(-w * 0.3, w * 0.3),
      y: cy + rand(-h * 0.1, h * 0.3),
      vx: rand(-0.5, 0.5),
      vy: rand(-2, -0.5),
      size: rand(8, 18),
      opacity: 0.5,
      color: 'rgba(15,23,42,0.8)',
      life: 0, maxLife: rand(35, 55),
      gravity: -0.02, friction: 0.98,
      rotation: 0, rotSpeed: 0,
      shape: 'circle', scale: 1, scaleSpeed: 0.02,
    })
  }

  // Soul spark — bright white flash at center
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.7,
    opacity: 1,
    color: '#ffffff',
    life: 0, maxLife: 12,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'ring', scale: 0.1, scaleSpeed: 0.2,
  })

  // Red ember sparks
  for (let i = 0; i < 8; i++) {
    const angle = rand(0, Math.PI * 2)
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * rand(1, 3),
      vy: Math.sin(angle) * rand(1, 3) - 1,
      size: rand(1.5, 3),
      opacity: 1,
      color: '#ef4444',
      life: 0, maxLife: rand(20, 40),
      gravity: -0.03, friction: 0.97,
      rotation: 0, rotSpeed: 0,
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== ARROW FLIGHT (directional: source → target) =====

function emitBowDraw(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const bowSize = Math.max(w, h) * 0.8

  // Bow arc (half-dome, rotated to face right)
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: bowSize * 0.5, opacity: 0.9, color: '#c8a84e',
    life: 0, maxLife: 20, gravity: 0, friction: 1,
    rotation: -Math.PI / 2, rotSpeed: 0,
    shape: 'shield', scale: 0.8, scaleSpeed: 0,
  })

  // String tension sparks
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: cx + rand(-3, 3), y: cy + rand(-bowSize * 0.3, bowSize * 0.3),
      vx: rand(-0.5, 0.5), vy: 0,
      size: rand(1.5, 3), opacity: 0.8, color: '#fbbf24',
      life: 0, maxLife: rand(12, 18), gravity: 0, friction: 0.95,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }

  // Energy gather ring at nocking point
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: bowSize * 0.2, opacity: 0.7, color: '#fbbf24',
    life: 0, maxLife: 16, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.1, scaleSpeed: 0.15,
  })
}

function emitArrowProjectile(
  source: { cx: number; cy: number },
  target: { cx: number; cy: number },
) {
  const dx = target.cx - source.cx
  const dy = target.cy - source.cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)
  const speed = dist / 15

  // Arrow projectile
  particles.push({
    x: source.cx, y: source.cy,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    size: 20, opacity: 1, color: '#e2e8f0',
    life: 0, maxLife: 20, gravity: 0, friction: 1,
    rotation: angle, rotSpeed: 0,
    shape: 'arrow', scale: 1, scaleSpeed: 0,
  })

  // Trail particles (staggered via negative life)
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: source.cx + rand(-3, 3), y: source.cy + rand(-3, 3),
      vx: Math.cos(angle) * speed * rand(0.6, 0.9),
      vy: Math.sin(angle) * speed * rand(0.6, 0.9),
      size: rand(1.5, 3), opacity: 0.7,
      color: ['#60a5fa', '#93c5fd', '#e2e8f0'][Math.floor(Math.random() * 3)]!,
      life: -i * 1.5, maxLife: 18, gravity: 0, friction: 0.97,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== HEAL EFFECT — Slavic nature theme =====

function emitHeal(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const radius = Math.max(w, h) * 0.45

  // 1) Spiraling leaves wrapping around the card (12 leaves)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const spiralR = radius * rand(0.3, 0.7)
    const delay = i * 1.8 // staggered spawn
    particles.push({
      x: cx + Math.cos(angle) * spiralR,
      y: cy + Math.sin(angle) * spiralR + rand(-5, 5),
      vx: Math.cos(angle + Math.PI * 0.5) * rand(1.5, 3), // tangential velocity → spiral
      vy: rand(-2.5, -1), // float upward
      size: rand(6, 11), opacity: 0.85,
      color: ['#4ade80', '#22c55e', '#86efac', '#a3e635', '#65a30d'][Math.floor(Math.random() * 5)]!,
      life: -delay, maxLife: rand(45, 65), gravity: -0.04, friction: 0.965,
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.08, 0.08),
      shape: 'leaf', scale: 1, scaleSpeed: -0.008,
    })
  }

  // 2) Gold-green glow motes — tiny sparkles like sunlight through canopy (20 motes)
  for (let i = 0; i < 20; i++) {
    const a = rand(0, Math.PI * 2)
    const r = rand(0, radius * 0.6)
    particles.push({
      x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
      vx: rand(-0.6, 0.6), vy: rand(-1.8, -0.4),
      size: rand(1.5, 3.5), opacity: rand(0.5, 1),
      color: ['#fbbf24', '#fde68a', '#d9f99d', '#bef264'][Math.floor(Math.random() * 4)]!,
      life: rand(-5, 0), maxLife: rand(30, 50), gravity: -0.02, friction: 0.98,
      rotation: 0, rotSpeed: 0, shape: 'circle', scale: 1, scaleSpeed: 0,
    })
  }

  // 3) Central bloom — large soft green circle that expands and fades
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: radius * 0.8, opacity: 0.35, color: '#4ade80',
    life: 0, maxLife: 30, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'circle', scale: 0.3, scaleSpeed: 0.04,
  })

  // 4) Double expanding rings — inner gold, outer green (staggered)
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: radius * 0.7, opacity: 0.7, color: '#fbbf24',
    life: 0, maxLife: 28, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.15, scaleSpeed: 0.1,
  })
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: radius * 0.9, opacity: 0.55, color: '#4ade80',
    life: -6, maxLife: 32, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.1, scaleSpeed: 0.09,
  })

  // 5) Rising rune marks — Slavic accent (3 small runes floating up)
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: cx + rand(-w * 0.2, w * 0.2), y: cy + rand(-h * 0.05, h * 0.15),
      vx: rand(-0.2, 0.2), vy: rand(-1.8, -0.8),
      size: rand(8, 12), opacity: 0.6, color: '#fde68a',
      life: -i * 6, maxLife: rand(40, 55), gravity: -0.02, friction: 0.985,
      rotation: rand(0, Math.PI), rotSpeed: rand(-0.03, 0.03),
      shape: 'rune', scale: 1, scaleSpeed: -0.008,
    })
  }
}

// ===== FREEZE EFFECT =====

function emitFreeze(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Ice crystals / snowflakes
  for (let i = 0; i < 10; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(1, 4)
    particles.push({
      x: cx + rand(-w * 0.3, w * 0.3), y: cy + rand(-h * 0.3, h * 0.3),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(6, 12), opacity: 0.9,
      color: ['#93c5fd', '#bfdbfe', '#dbeafe', '#e0f2fe'][Math.floor(Math.random() * 4)]!,
      life: rand(-2, 0), maxLife: rand(25, 40), gravity: 0.03, friction: 0.96,
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.08, 0.08),
      shape: 'snowflake', scale: 1, scaleSpeed: -0.01,
    })
  }

  // Cold mist (soft circles)
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: cx + rand(-w * 0.4, w * 0.4), y: cy + rand(0, h * 0.3),
      vx: rand(-0.3, 0.3), vy: rand(-1.5, -0.3),
      size: rand(10, 20), opacity: 0.25, color: '#bfdbfe',
      life: rand(-2, 0), maxLife: rand(30, 50), gravity: -0.02, friction: 0.98,
      rotation: 0, rotSpeed: 0, shape: 'circle', scale: 1, scaleSpeed: 0.01,
    })
  }

  // Ice flash ring
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.7, opacity: 0.7, color: '#60a5fa',
    life: 0, maxLife: 18, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.1, scaleSpeed: 0.14,
  })
}

// ===== POISON EFFECT =====

function emitPoison(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Toxic drips falling
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: cx + rand(-w * 0.4, w * 0.4), y: cy + rand(-h * 0.4, -h * 0.1),
      vx: rand(-0.3, 0.3), vy: rand(0.5, 2.5),
      size: rand(4, 8), opacity: 0.85,
      color: ['#4ade80', '#22c55e', '#a3e635', '#84cc16'][Math.floor(Math.random() * 4)]!,
      life: rand(-4, 0), maxLife: rand(25, 45), gravity: 0.15, friction: 0.98,
      rotation: 0, rotSpeed: 0, shape: 'droplet', scale: 1, scaleSpeed: 0,
    })
  }

  // Green smoke rising
  for (let i = 0; i < 10; i++) {
    particles.push({
      x: cx + rand(-w * 0.3, w * 0.3), y: cy + rand(-h * 0.1, h * 0.3),
      vx: rand(-0.8, 0.8), vy: rand(-2, -0.5),
      size: rand(6, 14), opacity: 0.3, color: '#22c55e',
      life: rand(-2, 0), maxLife: rand(30, 55), gravity: -0.03, friction: 0.97,
      rotation: 0, rotSpeed: 0, shape: 'circle', scale: 1, scaleSpeed: 0.015,
    })
  }

  // Toxic ring
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.5, opacity: 0.5, color: '#22c55e',
    life: 0, maxLife: 20, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.15, scaleSpeed: 0.1,
  })
}

// ===== LIGHTNING EFFECT =====

function emitLightning(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Main bolt segments from above
  const boltTop = cy - h * 0.8
  for (let i = 0; i < 5; i++) {
    const segY = boltTop + (cy - boltTop) * (i / 5)
    particles.push({
      x: cx + rand(-8, 8), y: segY, vx: 0, vy: 0,
      size: rand(14, 22), opacity: 1, color: '#fbbf24',
      life: 0, maxLife: rand(8, 14), gravity: 0, friction: 1,
      rotation: rand(-0.3, 0.3), rotSpeed: 0,
      shape: 'bolt', scale: 1, scaleSpeed: 0,
    })
  }

  // Branch bolts (smaller, offset)
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: cx + rand(-w * 0.3, w * 0.3), y: cy + rand(-h * 0.5, -h * 0.1),
      vx: rand(-1, 1), vy: rand(-0.5, 0.5),
      size: rand(8, 14), opacity: 0.7, color: '#fde68a',
      life: rand(-2, 0), maxLife: rand(10, 16), gravity: 0, friction: 0.98,
      rotation: rand(-0.5, 0.5), rotSpeed: 0,
      shape: 'bolt', scale: 0.8, scaleSpeed: 0,
    })
  }

  // Impact flash at center
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.8, opacity: 1, color: '#ffffff',
    life: 0, maxLife: 8, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'circle', scale: 1.5, scaleSpeed: -0.1,
  })

  // Electric sparks
  for (let i = 0; i < 12; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(3, 8)
    particles.push({
      x: cx + rand(-4, 4), y: cy + rand(-4, 4),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(1.5, 3), opacity: 1,
      color: ['#fbbf24', '#fde68a', '#ffffff'][Math.floor(Math.random() * 3)]!,
      life: 0, maxLife: rand(12, 22), gravity: 0.1, friction: 0.93,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== RESURRECT EFFECT =====

function emitResurrect(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Golden particles rising from below
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: cx + rand(-w * 0.4, w * 0.4), y: cy + h * 0.3 + rand(0, h * 0.2),
      vx: rand(-0.5, 0.5), vy: rand(-4, -1.5),
      size: rand(2, 5), opacity: 0.9,
      color: ['#fbbf24', '#fde68a', '#f59e0b', '#ffffff'][Math.floor(Math.random() * 4)]!,
      life: rand(-5, 0), maxLife: rand(30, 50), gravity: -0.08, friction: 0.97,
      rotation: 0, rotSpeed: rand(-0.1, 0.1), shape: 'ember', scale: 1, scaleSpeed: -0.008,
    })
  }

  // Light beam ring from below
  particles.push({
    x: cx, y: cy + h * 0.2, vx: 0, vy: -1,
    size: w * 0.8, opacity: 0.5, color: '#fbbf24',
    life: 0, maxLife: 30, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.3, scaleSpeed: 0.06,
  })

  // Star symbols rising
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: cx + rand(-w * 0.2, w * 0.2), y: cy + rand(h * 0.1, h * 0.3),
      vx: rand(-0.3, 0.3), vy: rand(-2.5, -1),
      size: rand(8, 14), opacity: 0.8, color: '#fde68a',
      life: -i * 3, maxLife: rand(25, 40), gravity: -0.05, friction: 0.97,
      rotation: rand(0, Math.PI), rotSpeed: rand(0.04, 0.1),
      shape: 'star', scale: 1, scaleSpeed: -0.01,
    })
  }
}

// ===== STUN EFFECT =====

function emitStun(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const orbitR = Math.max(w, h) * 0.35

  // Circling stars above the creature
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    particles.push({
      x: cx + Math.cos(angle) * orbitR,
      y: cy - h * 0.3 + Math.sin(angle) * orbitR * 0.4,
      vx: Math.cos(angle + Math.PI / 2) * 2.5,
      vy: Math.sin(angle + Math.PI / 2) * 1,
      size: rand(8, 14), opacity: 0.9, color: '#fbbf24',
      life: 0, maxLife: rand(35, 50), gravity: 0, friction: 0.98,
      rotation: 0, rotSpeed: rand(0.08, 0.15),
      shape: 'star', scale: 1, scaleSpeed: 0,
    })
  }

  // Electric sparks around head
  for (let i = 0; i < 6; i++) {
    const angle = rand(0, Math.PI * 2)
    particles.push({
      x: cx + rand(-w * 0.2, w * 0.2), y: cy - h * 0.3 + rand(-8, 8),
      vx: Math.cos(angle) * rand(1, 2.5), vy: Math.sin(angle) * rand(1, 2.5),
      size: rand(1.5, 3), opacity: 0.8, color: '#fde68a',
      life: rand(-3, 0), maxLife: rand(12, 22), gravity: 0, friction: 0.94,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== SHIELD BREAK EFFECT =====

function emitShieldBreak(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const size = Math.max(w, h)

  // Shield appears briefly then shatters
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: size * 0.7, opacity: 0.9, color: '#60a5fa',
    life: 0, maxLife: 10, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'shield', scale: 0.8, scaleSpeed: 0.02,
  })

  // Shield shards flying outward (delayed after shield appears)
  for (let i = 0; i < 12; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(4, 9)
    particles.push({
      x: cx + rand(-8, 8), y: cy + rand(-8, 8),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(5, 10), opacity: 0.8,
      color: ['#60a5fa', '#93c5fd', '#bfdbfe'][Math.floor(Math.random() * 3)]!,
      life: -5, maxLife: rand(18, 30), gravity: 0.15, friction: 0.95,
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.2, 0.2),
      shape: 'shard', scale: 1, scaleSpeed: -0.015,
    })
  }

  // Blue flash on break
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: size * 1, opacity: 0.8, color: '#93c5fd',
    life: -5, maxLife: 10, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'circle', scale: 1.2, scaleSpeed: -0.05,
  })

  // Bright sparks
  for (let i = 0; i < 8; i++) {
    const angle = rand(0, Math.PI * 2)
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * rand(3, 6), vy: Math.sin(angle) * rand(3, 6),
      size: rand(2, 3.5), opacity: 1, color: '#ffffff',
      life: -5, maxLife: rand(14, 22), gravity: 0.08, friction: 0.94,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }
}

// ===== SUMMON / PORTAL EFFECT =====

function emitSummon(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const size = Math.max(w, h)

  // Staggered portal rings
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: cx, y: cy, vx: 0, vy: 0,
      size: size * (0.3 + i * 0.15), opacity: 0.7 - i * 0.15,
      color: ['#a855f7', '#c084fc', '#e9d5ff'][i]!,
      life: -i * 4, maxLife: 30, gravity: 0, friction: 1,
      rotation: 0, rotSpeed: 0.06 * (i % 2 === 0 ? 1 : -1),
      shape: 'ring', scale: 0.1, scaleSpeed: 0.08,
    })
  }

  // Converging particles (move TOWARD center)
  for (let i = 0; i < 14; i++) {
    const angle = rand(0, Math.PI * 2)
    const dist = rand(size * 0.5, size * 0.8)
    const speed = rand(2, 5)
    particles.push({
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      vx: -Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
      size: rand(2, 4), opacity: 0.8,
      color: ['#c084fc', '#e9d5ff', '#a855f7', '#ddd6fe'][Math.floor(Math.random() * 4)]!,
      life: rand(-3, 0), maxLife: rand(18, 28), gravity: 0, friction: 0.95,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }

  // Rune symbols around portal
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const r = size * 0.3
    particles.push({
      x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
      size: rand(8, 12), opacity: 0.9, color: '#e9d5ff',
      life: -i * 2, maxLife: rand(22, 32), gravity: 0, friction: 1,
      rotation: angle, rotSpeed: 0.06, shape: 'rune', scale: 1, scaleSpeed: 0,
    })
  }

  // Center flash (delayed until particles converge)
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: size * 0.3, opacity: 0.8, color: '#ffffff',
    life: -10, maxLife: 12, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'circle', scale: 0.1, scaleSpeed: 0.3,
  })
}

// ===== BUFF / AURA GLOW =====

function emitBuff(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect

  // Golden shimmer rising
  for (let i = 0; i < 14; i++) {
    particles.push({
      x: cx + rand(-w * 0.4, w * 0.4), y: cy + rand(-h * 0.1, h * 0.4),
      vx: rand(-0.3, 0.3), vy: rand(-2.5, -0.8),
      size: rand(1.5, 3.5), opacity: 0.8,
      color: ['#fbbf24', '#fde68a', '#f59e0b'][Math.floor(Math.random() * 3)]!,
      life: rand(-4, 0), maxLife: rand(25, 45), gravity: -0.04, friction: 0.97,
      rotation: 0, rotSpeed: 0, shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }

  // Golden ring
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.5, opacity: 0.5, color: '#fbbf24',
    life: 0, maxLife: 24, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0.03, shape: 'ring', scale: 0.2, scaleSpeed: 0.08,
  })

  // Star symbols floating up
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: cx + rand(-w * 0.2, w * 0.2), y: cy + rand(0, h * 0.2),
      vx: rand(-0.2, 0.2), vy: rand(-2, -0.8),
      size: rand(6, 10), opacity: 0.7, color: '#fde68a',
      life: -i * 5, maxLife: rand(20, 35), gravity: -0.03, friction: 0.98,
      rotation: 0, rotSpeed: rand(0.05, 0.1), shape: 'star', scale: 1, scaleSpeed: -0.01,
    })
  }
}

// ===== SLASH ATTACK — dramatic diagonal energy slash across card =====
// Recreated from WebGPU reference: progressive reveal + sparks along cut + shards + embers

function emitSlashAttack(rect: { cx: number; cy: number; w: number; h: number }) {
  const { cx, cy, w, h } = rect
  const pad = 6

  // Slash line: top-left → bottom-right diagonal across card
  const x1 = cx - w / 2 + pad
  const y1 = cy - h / 2 + pad
  const x2 = cx + w / 2 - pad
  const y2 = cy + h / 2 - pad
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)
  const nx = -dy / len
  const ny = dx / len

  // === PROGRESSIVE SLASH — staggered energy segments that reveal along the line ===
  const SEGMENTS = 8
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / SEGMENTS
    const segX = x1 + dx * (t + 0.5 / SEGMENTS)
    const segY = y1 + dy * (t + 0.5 / SEGMENTS)
    // Each segment appears with slight delay → progressive reveal sweep
    particles.push({
      x: segX, y: segY, vx: 0, vy: 0,
      size: len / SEGMENTS * 1.4,
      opacity: 1,
      color: i < 2 ? '#ffffff' : '#fde68a',
      life: -i * 0.8, maxLife: 35,
      gravity: 0, friction: 1,
      rotation: angle, rotSpeed: 0,
      shape: 'energyslash', scale: 1, scaleSpeed: 0,
    })
  }

  // === HOT CORE — thin bright white line through the whole slash (appears after sweep) ===
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: len * 1.05,
    opacity: 1,
    color: '#ffffff',
    life: -SEGMENTS * 0.6, maxLife: 30,
    gravity: 0, friction: 1,
    rotation: angle, rotSpeed: 0,
    shape: 'energyslash', scale: 1, scaleSpeed: 0,
  })

  // === CROSS SLASH — shorter perpendicular cut, delayed ===
  const crossAngle = angle - rand(1.3, 1.6)
  particles.push({
    x: cx + rand(-4, 4), y: cy + rand(-4, 4),
    vx: 0, vy: 0,
    size: len * 0.55,
    opacity: 0.85,
    color: '#fbbf24',
    life: -6, maxLife: 30,
    gravity: 0, friction: 1,
    rotation: crossAngle, rotSpeed: 0,
    shape: 'energyslash', scale: 1, scaleSpeed: 0,
  })

  // === SLASH SPARKS — fly perpendicular from cut, staggered along line ===
  for (let i = 0; i < 35; i++) {
    const t = Math.random()
    const px = x1 + dx * t
    const py = y1 + dy * t
    const side = (Math.random() - 0.5) * 2
    const speed = 2 + Math.random() * 7
    particles.push({
      x: px, y: py,
      vx: nx * side * speed + rand(-1, 1),
      vy: ny * side * speed + rand(-1, 1),
      size: 1 + Math.random() * 2.5,
      opacity: 1,
      color: Math.random() > 0.3 ? '#ffe0b2' : '#ff9040',
      life: -(t * SEGMENTS * 0.8 + Math.random() * 2), // spawn as slash passes
      maxLife: rand(15, 28),
      gravity: 0.08, friction: 0.96,
      rotation: Math.atan2(ny * side, nx * side),
      rotSpeed: rand(-0.15, 0.15),
      shape: 'spark', scale: 1, scaleSpeed: 0,
    })
  }

  // === METAL SHARDS — debris flying from impact center ===
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2
    const speed = 1.5 + Math.random() * 5
    particles.push({
      x: cx + rand(-8, 8), y: cy + rand(-8, 8),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size: 3 + Math.random() * 5,
      opacity: 0.85,
      color: Math.random() > 0.5 ? '#c8d0e0' : '#9ca3af',
      life: -3, maxLife: rand(18, 30),
      gravity: 0.12, friction: 0.96,
      rotation: Math.random() * Math.PI,
      rotSpeed: rand(-0.3, 0.3),
      shape: 'shard', scale: 1, scaleSpeed: -0.015,
    })
  }

  // === IMPACT FLASH — white-hot burst at center ===
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 1.3,
    opacity: 0.85,
    color: '#ffffff',
    life: 0, maxLife: 8,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'circle', scale: 1.4, scaleSpeed: -0.08,
  })

  // === EMBER AFTERMATH — lingering hot embers drifting down ===
  for (let i = 0; i < 16; i++) {
    particles.push({
      x: cx + rand(-w * 0.4, w * 0.4),
      y: cy + rand(-h * 0.3, h * 0.3),
      vx: rand(-0.3, 0.3),
      vy: rand(0.4, 1.0),
      size: 1 + Math.random() * 2,
      opacity: 0.7,
      color: ['#ff9040', '#fbbf24', '#ef4444'][Math.floor(Math.random() * 3)]!,
      life: -12 - i * 2, maxLife: rand(35, 60),
      gravity: 0.03, friction: 0.995,
      rotation: 0, rotSpeed: 0,
      shape: 'ember', scale: 1, scaleSpeed: 0,
    })
  }

  // === RED IMPACT RING ===
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    size: Math.max(w, h) * 0.5,
    opacity: 0.6,
    color: '#ef4444',
    life: -2, maxLife: 20,
    gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0,
    shape: 'ring', scale: 0.15, scaleSpeed: 0.12,
  })
}

// ===== SEASON TRANSITION BURST =====

const seasonColors: Record<string, string[]> = {
  spring: ['#4ade80', '#86efac', '#f9a8d4', '#fbcfe8', '#a7f3d0'],
  summer: ['#fbbf24', '#fde68a', '#fb923c', '#fdba74', '#f59e0b'],
  autumn: ['#f97316', '#ea580c', '#dc2626', '#b45309', '#92400e'],
  winter: ['#93c5fd', '#bfdbfe', '#dbeafe', '#e0f2fe', '#60a5fa'],
}
const seasonShapes: Record<string, Particle['shape'][]> = {
  spring: ['leaf', 'circle', 'circle'],
  summer: ['ember', 'circle', 'spark'],
  autumn: ['leaf', 'leaf', 'ember'],
  winter: ['snowflake', 'circle', 'circle'],
}

function emitSeasonTransition(oldSeason: string, newSeason: string) {
  const canvas = canvasRef.value
  if (!canvas) return
  const cw = canvas.width
  const ch = canvas.height

  // OLD season particles burst outward from center
  const oldColors = seasonColors[oldSeason] ?? seasonColors.spring!
  const oldShapes = seasonShapes[oldSeason] ?? seasonShapes.spring!
  for (let i = 0; i < 30; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(3, 8)
    particles.push({
      x: cw * 0.5 + rand(-cw * 0.3, cw * 0.3),
      y: ch * 0.5 + rand(-ch * 0.2, ch * 0.2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(4, 10), opacity: 0.7,
      color: oldColors[Math.floor(Math.random() * oldColors.length)]!,
      life: rand(-3, 0), maxLife: rand(40, 70),
      gravity: rand(-0.02, 0.02), friction: 0.975,
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.06, 0.06),
      shape: oldShapes[Math.floor(Math.random() * oldShapes.length)]!,
      scale: 1, scaleSpeed: -0.012,
    })
  }

  // NEW season particles converge inward from edges
  const newColors = seasonColors[newSeason] ?? seasonColors.spring!
  const newShapes = seasonShapes[newSeason] ?? seasonShapes.spring!
  for (let i = 0; i < 35; i++) {
    // Spawn on screen edges
    const edge = Math.floor(Math.random() * 4) // 0=top, 1=right, 2=bottom, 3=left
    let sx: number, sy: number
    switch (edge) {
      case 0: sx = rand(0, cw); sy = -20; break
      case 1: sx = cw + 20; sy = rand(0, ch); break
      case 2: sx = rand(0, cw); sy = ch + 20; break
      default: sx = -20; sy = rand(0, ch); break
    }
    // Velocity toward center area
    const tx = cw * 0.5 + rand(-cw * 0.25, cw * 0.25)
    const ty = ch * 0.5 + rand(-ch * 0.2, ch * 0.2)
    const dx = tx - sx, dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const spd = rand(2, 5)
    particles.push({
      x: sx, y: sy,
      vx: (dx / dist) * spd, vy: (dy / dist) * spd,
      size: rand(3, 8), opacity: 0,
      color: newColors[Math.floor(Math.random() * newColors.length)]!,
      life: -i * 0.8, maxLife: rand(50, 80),
      gravity: 0, friction: 0.985,
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.05, 0.05),
      shape: newShapes[Math.floor(Math.random() * newShapes.length)]!,
      scale: 0.5, scaleSpeed: 0.01,
    })
  }

  // Expanding ring in new season color
  const ringColor = newColors[0]!
  particles.push({
    x: cw * 0.5, y: ch * 0.5, vx: 0, vy: 0,
    size: Math.max(cw, ch) * 0.4, opacity: 0.4, color: ringColor,
    life: -5, maxLife: 40, gravity: 0, friction: 1,
    rotation: 0, rotSpeed: 0, shape: 'ring', scale: 0.05, scaleSpeed: 0.06,
  })
}

// ===== AMBIENT BOARD PARTICLES =====
// Subtle always-on atmospheric particles — dust motes, faint runes, tiny sparkles.
// Spawns ~1 particle per second, max ~15 alive at a time.

let ambientFrameCounter = 0
const AMBIENT_INTERVAL = 50 // frames between spawns (~0.8s at 60fps)
const AMBIENT_MAX = 18

function tickAmbient() {
  ambientFrameCounter++
  if (ambientFrameCounter < AMBIENT_INTERVAL) return
  ambientFrameCounter = 0

  // Don't spawn if game isn't active or too many ambient particles
  if (!game.state) return
  const ambientCount = particles.filter(p => (p as any)._ambient).length
  if (ambientCount >= AMBIENT_MAX) return

  const canvas = canvasRef.value
  if (!canvas) return
  const cw = canvas.width
  const ch = canvas.height

  const season = game.season
  const colors = seasonColors[season] ?? seasonColors.spring!
  const shapes = seasonShapes[season] ?? seasonShapes.spring!

  // Spawn 1-2 particles
  const count = Math.random() > 0.6 ? 2 : 1
  for (let i = 0; i < count; i++) {
    const isRune = Math.random() < 0.15
    const p: Particle & { _ambient?: boolean } = {
      x: rand(cw * 0.1, cw * 0.9),
      y: rand(ch * 0.15, ch * 0.85),
      vx: rand(-0.3, 0.3),
      vy: rand(-0.6, -0.15),
      size: isRune ? rand(6, 10) : rand(1.5, 3.5),
      opacity: rand(0.15, 0.35),
      color: colors[Math.floor(Math.random() * colors.length)]!,
      life: 0, maxLife: rand(80, 140),
      gravity: isRune ? -0.01 : -0.005,
      friction: 0.998,
      rotation: rand(0, Math.PI * 2),
      rotSpeed: rand(-0.02, 0.02),
      shape: isRune ? 'rune' : (Math.random() < 0.3
        ? shapes[Math.floor(Math.random() * shapes.length)]!
        : 'circle'),
      scale: 1,
      scaleSpeed: -0.003,
      _ambient: true,
    } as any
    particles.push(p)
  }
}

// ===== PARTICLE DRAW FUNCTIONS =====

function drawParticle(c: CanvasRenderingContext2D, p: Particle) {
  const progress = p.life / p.maxLife
  // Fade out in last 30%
  const fadeAlpha = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1
  const alpha = p.opacity * fadeAlpha
  if (alpha <= 0.01) return

  c.save()
  try {
  c.globalAlpha = alpha
  // Disable shadowBlur globally — it's the most expensive canvas op.
  // Glow is achieved via radial gradients or layered strokes instead.
  c.shadowBlur = 0
  c.translate(p.x, p.y)
  c.rotate(p.rotation)

  switch (p.shape) {
    case 'circle': {
      const r = p.size * p.scale
      c.beginPath()
      c.arc(0, 0, r, 0, Math.PI * 2)
      c.fillStyle = p.color
      c.fill()
      break
    }
    case 'spark': {
      // Elongated bright dot with motion-blur tail
      const len = p.size * 2.5
      const vel = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      const angle = Math.atan2(p.vy, p.vx)
      c.rotate(angle)
      const grad = c.createLinearGradient(-len, 0, p.size, 0)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(0.6, p.color)
      grad.addColorStop(1, p.color)
      c.fillStyle = grad
      c.beginPath()
      c.ellipse(0, 0, len * Math.min(vel * 0.2 + 0.5, 1.5), p.size * 0.5, 0, 0, Math.PI * 2)
      c.fill()
      // Glow
      c.beginPath()
      c.arc(0, 0, p.size * 0.4, 0, Math.PI * 2)
      c.fillStyle = p.color
      c.fill()
      break
    }
    case 'slash': {
      // Diagonal slash trail (thin)
      const len = p.size
      c.strokeStyle = p.color
      c.lineWidth = 2.5
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(-len * 0.5, len * 0.5)
      c.lineTo(len * 0.5, -len * 0.5)
      c.stroke()
      break
    }
    case 'energyslash': {
      // LIGHTSABER BURN — thick tapered energy cut with white-hot core + colored glow
      const len = p.size
      const thickness = len * 0.06
      const taper = len * 0.015

      // Outer glow layer (wide, soft, colored)
      c.strokeStyle = p.color === '#ffffff' ? 'rgba(251,191,36,0.6)' : p.color
      c.lineWidth = thickness * 2.5
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(-len * 0.5, len * 0.5)
      c.lineTo(len * 0.5, -len * 0.5)
      c.stroke()

      // Mid layer (narrower, brighter)
      c.strokeStyle = 'rgba(255,255,255,0.8)'
      c.lineWidth = thickness * 1.2
      c.beginPath()
      c.moveTo(-len * 0.5, len * 0.5)
      c.lineTo(len * 0.5, -len * 0.5)
      c.stroke()

      // Core line (thin, pure white, hottest)
      c.strokeStyle = '#ffffff'
      c.lineWidth = thickness * 0.5
      c.beginPath()
      c.moveTo(-len * 0.5, len * 0.5)
      c.lineTo(len * 0.5, -len * 0.5)
      c.stroke()
      break
    }
    case 'shield': {
      // SHIELD DOME — semi-circular arc with glow
      const r = p.size * p.scale
      c.strokeStyle = p.color
      c.lineWidth = Math.max(2, 4 - progress * 4)
      c.lineCap = 'round'

      // Draw upper half dome
      c.beginPath()
      c.arc(0, 0, r, Math.PI * 0.85, Math.PI * 0.15, true)
      c.stroke()

      // Inner glow fill (subtle)
      const grad = c.createRadialGradient(0, 0, 0, 0, 0, r)
      grad.addColorStop(0, `rgba(255,255,255,${0.15 * (1 - progress)})`)
      grad.addColorStop(0.6, `rgba(251,191,36,${0.08 * (1 - progress)})`)
      grad.addColorStop(1, 'transparent')
      c.fillStyle = grad
      c.beginPath()
      c.arc(0, 0, r, 0, Math.PI * 2)
      c.fill()
      break
    }
    case 'shard': {
      // Irregular polygon fragment
      const s = p.size * p.scale
      c.fillStyle = p.color
      c.beginPath()
      c.moveTo(-s * 0.5, -s * 0.3)
      c.lineTo(s * 0.3, -s * 0.5)
      c.lineTo(s * 0.5, s * 0.2)
      c.lineTo(s * 0.1, s * 0.5)
      c.lineTo(-s * 0.4, s * 0.3)
      c.closePath()
      c.fill()
      // Subtle border
      c.strokeStyle = 'rgba(200,168,78,0.3)'
      c.lineWidth = 0.5
      c.stroke()
      break
    }
    case 'ring': {
      const r = p.size * p.scale
      c.strokeStyle = p.color
      c.lineWidth = Math.max(1, 3 - progress * 3)
      c.beginPath()
      c.arc(0, 0, r, 0, Math.PI * 2)
      c.stroke()
      break
    }
    case 'rune': {
      // Small rune symbol (cross with dots)
      const s = p.size
      c.strokeStyle = p.color
      c.lineWidth = 1.5
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(0, -s * 0.4); c.lineTo(0, s * 0.4)
      c.moveTo(-s * 0.3, 0); c.lineTo(s * 0.3, 0)
      c.moveTo(-s * 0.2, -s * 0.3); c.lineTo(s * 0.2, s * 0.3)
      c.stroke()
      // Center dot
      c.fillStyle = p.color
      c.beginPath()
      c.arc(0, 0, 1.5, 0, Math.PI * 2)
      c.fill()
      break
    }
    case 'ember': {
      // Teardrop shape rising upward
      const s = p.size * p.scale
      c.fillStyle = p.color
      c.beginPath()
      c.moveTo(0, -s)
      c.quadraticCurveTo(s * 0.6, -s * 0.3, s * 0.3, s * 0.3)
      c.quadraticCurveTo(0, s * 0.7, -s * 0.3, s * 0.3)
      c.quadraticCurveTo(-s * 0.6, -s * 0.3, 0, -s)
      c.fill()
      break
    }
    case 'arrow': {
      // Arrowhead + shaft
      const s = p.size * p.scale
      c.fillStyle = p.color
      // Shaft
      c.fillRect(-s * 0.5, -s * 0.04, s * 0.7, s * 0.08)
      // Arrowhead
      c.beginPath()
      c.moveTo(s * 0.5, 0)
      c.lineTo(s * 0.15, -s * 0.15)
      c.lineTo(s * 0.15, s * 0.15)
      c.closePath()
      c.fill()
      // Fletching
      c.strokeStyle = p.color
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(-s * 0.5, 0); c.lineTo(-s * 0.35, -s * 0.1)
      c.moveTo(-s * 0.5, 0); c.lineTo(-s * 0.35, s * 0.1)
      c.stroke()
      break
    }
    case 'snowflake': {
      // 6-pointed ice crystal with branches
      const s = p.size * p.scale
      c.strokeStyle = p.color
      c.lineWidth = 1.5
      c.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        c.beginPath()
        c.moveTo(0, 0)
        c.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5)
        c.stroke()
        // Small branches
        const bx = Math.cos(a) * s * 0.3
        const by = Math.sin(a) * s * 0.3
        c.beginPath()
        c.moveTo(bx, by)
        c.lineTo(bx + Math.cos(a + 0.5) * s * 0.15, by + Math.sin(a + 0.5) * s * 0.15)
        c.moveTo(bx, by)
        c.lineTo(bx + Math.cos(a - 0.5) * s * 0.15, by + Math.sin(a - 0.5) * s * 0.15)
        c.stroke()
      }
      break
    }
    case 'bolt': {
      // Zigzag lightning segment
      const s = p.size * p.scale
      c.strokeStyle = p.color
      c.lineWidth = 2.5
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      c.moveTo(-s * 0.1, -s * 0.5)
      c.lineTo(s * 0.15, -s * 0.15)
      c.lineTo(-s * 0.1, 0)
      c.lineTo(s * 0.2, s * 0.5)
      c.stroke()
      // Bright white core
      c.lineWidth = 1
      c.strokeStyle = '#ffffff'
      c.beginPath()
      c.moveTo(-s * 0.1, -s * 0.5)
      c.lineTo(s * 0.15, -s * 0.15)
      c.lineTo(-s * 0.1, 0)
      c.lineTo(s * 0.2, s * 0.5)
      c.stroke()
      break
    }
    case 'cross': {
      // Healing plus symbol
      const s = p.size * p.scale
      c.fillStyle = p.color
      c.fillRect(-s * 0.1, -s * 0.4, s * 0.2, s * 0.8)
      c.fillRect(-s * 0.3, -s * 0.1, s * 0.6, s * 0.2)
      break
    }
    case 'leaf': {
      // Slavic leaf — asymmetric curved shape with vein
      const s = p.size * p.scale
      c.fillStyle = p.color
      c.beginPath()
      c.moveTo(0, -s * 0.5)
      c.bezierCurveTo(s * 0.45, -s * 0.35, s * 0.5, s * 0.1, 0, s * 0.5)
      c.bezierCurveTo(-s * 0.5, s * 0.1, -s * 0.45, -s * 0.35, 0, -s * 0.5)
      c.fill()
      // Central vein
      c.strokeStyle = 'rgba(255,255,255,0.3)'
      c.lineWidth = 0.7
      c.beginPath()
      c.moveTo(0, -s * 0.4)
      c.lineTo(0, s * 0.4)
      c.stroke()
      break
    }
    case 'star': {
      // 5-pointed star
      const s = p.size * p.scale
      c.fillStyle = p.color
      c.beginPath()
      for (let i = 0; i < 5; i++) {
        const outerA = (i / 5) * Math.PI * 2 - Math.PI / 2
        const innerA = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2
        if (i === 0) c.moveTo(Math.cos(outerA) * s * 0.4, Math.sin(outerA) * s * 0.4)
        else c.lineTo(Math.cos(outerA) * s * 0.4, Math.sin(outerA) * s * 0.4)
        c.lineTo(Math.cos(innerA) * s * 0.18, Math.sin(innerA) * s * 0.18)
      }
      c.closePath()
      c.fill()
      break
    }
    case 'droplet': {
      // Toxic teardrop falling
      const s = p.size * p.scale
      c.fillStyle = p.color
      c.beginPath()
      c.moveTo(0, -s * 0.5)
      c.quadraticCurveTo(s * 0.35, s * 0.1, 0, s * 0.4)
      c.quadraticCurveTo(-s * 0.35, s * 0.1, 0, -s * 0.5)
      c.fill()
      break
    }
  }

  } finally {
    c.restore()
  }
}

// ===== ANIMATION LOOP =====

let lastTime = 0

function animate(time: number) {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return

  // Always tick ambient — spawns subtle particles even when queue is empty
  tickAmbient()

  if (particles.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }

  const dt = lastTime ? Math.min((time - lastTime) / 16.67, 3) : 1
  lastTime = time

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  // In-place swap-and-pop removal — zero array allocation per frame
  let len = particles.length
  for (let i = len - 1; i >= 0; i--) {
    const p = particles[i]!
    p.life += dt

    // Delayed start — particle waits if life < 0
    if (p.life < 0) continue

    // Physics update
    p.vx *= p.friction
    p.vy *= p.friction
    p.vy += p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rotation += p.rotSpeed * dt
    p.scale += p.scaleSpeed * dt

    if (p.life >= p.maxLife || p.opacity <= 0 || p.scale <= 0) {
      particles[i] = particles[len - 1]!
      len--
      continue
    }

    drawParticle(ctx, p)
  }
  particles.length = len
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}

// ===== VFX EVENT DISPATCH =====

function handleHit(event: VFXEvent) {
  const rect = event.meta?.rect as { cx: number; cy: number; w: number; h: number } | undefined
  if (!rect) { vfx.complete(event.id); return }

  // Counter-attack uses dedicated effect
  if (event.label === 'kontra') {
    emitCounterattack(rect)
    vfxTimeout(() => vfx.complete(event.id), 600)
    return
  }

  switch (event.attackType) {
    case 'melee': emitMeleeHit(rect); break
    case 'elemental': emitElementalHit(rect); break
    case 'magic': emitMagicHit(rect); break
    case 'ranged': emitRangedHit(rect); break
    default: emitMeleeHit(rect)
  }

  // Auto-complete after effect duration
  vfxTimeout(() => vfx.complete(event.id), 800)
}

type Rect = { cx: number; cy: number; w: number; h: number }

function handleArrowFlight(event: VFXEvent) {
  const src = event.meta?.sourceRect as Rect | undefined
  const tgt = event.meta?.targetRect as Rect | undefined
  if (!src || !tgt) { vfx.complete(event.id); return }

  emitBowDraw(src)
  vfxTimeout(() => emitArrowProjectile(src, tgt), 200)
  vfxTimeout(() => emitRangedHit(tgt), 500)
  vfxTimeout(() => vfx.complete(event.id), 1200)
}

function handleSimpleEffect(event: VFXEvent, emitter: (rect: Rect) => void, duration: number) {
  const rect = event.meta?.rect as Rect | undefined
  if (!rect) { vfx.complete(event.id); return }
  emitter(rect)
  vfxTimeout(() => vfx.complete(event.id), duration)
}

function handleBlock(event: VFXEvent) {
  const rect = event.meta?.rect as { cx: number; cy: number; w: number; h: number } | undefined
  if (!rect) { vfx.complete(event.id); return }

  emitBlock(rect)
  vfxTimeout(() => vfx.complete(event.id), 800)
}

function handleDeath(event: VFXEvent) {
  const rect = event.meta?.rect as { cx: number; cy: number; w: number; h: number } | undefined
  if (!rect) { vfx.complete(event.id); return }

  emitDeath(rect)
  vfxTimeout(() => vfx.complete(event.id), 1200)
}

function handleScreenFlash(event: VFXEvent) {
  if (!overlayEl) { vfx.complete(event.id); return }
  const color = (event.meta?.color as string) ?? '#ffffff'
  const opacity = (event.meta?.opacity as number) ?? 0.5
  const flash = document.createElement('div')
  // Start at opacity 0 to avoid first-frame flash, then transition in and out
  flash.style.cssText = `position:fixed;inset:0;z-index:10000;pointer-events:none;background:${color};opacity:0;transition:opacity 0.08s ease-out;`
  document.body.appendChild(flash)
  // Force reflow so the browser registers opacity:0 before transitioning
  flash.offsetHeight
  flash.style.opacity = String(opacity)
  // After flash peaks, fade out
  vfxTimeout(() => { flash.style.transition = 'opacity 0.15s ease-out'; flash.style.opacity = '0' }, 80)
  vfxTimeout(() => { flash.remove(); vfx.complete(event.id) }, 280)
}

function renderDamageNumber(event: VFXEvent) {
  if (!overlayEl) { vfx.complete(event.id); return }

  const pos = event.meta?.pos as { x: number; y: number } | undefined
  if (!pos) { vfx.complete(event.id); return }

  const el = document.createElement('div')
  el.className = 'vfx-damage-number'
  el.style.left = `${pos.x}px`
  el.style.top = `${pos.y + 20}px`
  el.style.color = event.color ?? '#ef4444'

  // Block/resist: show label text instead of damage number
  if (event.value === 0 && event.label) {
    el.textContent = event.label
    el.classList.add('vfx-damage-block')
  } else {
    el.textContent = `-${event.value}`
    if (event.label) {
      el.classList.add('vfx-damage-counter')
    }
  }

  overlayEl.appendChild(el)

  gsap.fromTo(el,
    { y: 0, opacity: 0, scale: 0.3 },
    {
      keyframes: [
        { opacity: 1, scale: 1, duration: 0.15, ease: 'back.out(2)' },
        { opacity: 1, scale: 1, y: 20, duration: 0.8, ease: 'none' },
        { opacity: 0, y: 40, duration: 0.5, ease: 'power2.in' },
      ],
      onComplete: () => {
        el.remove()
        vfx.complete(event.id)
      },
    }
  )
}

// ===== EVENT WATCHER =====

/** Track processed event IDs to avoid re-processing readonly queue items */
const processedIds = new Set<string>()

watch(
  () => vfx.queue.value,
  (events) => {
    for (const event of events) {
      if (processedIds.has(event.id)) continue
      processedIds.add(event.id)

      switch (event.type) {
        case 'damage-number': renderDamageNumber(event); break
        case 'hit': handleHit(event); break
        case 'block': handleBlock(event); break
        case 'death': handleDeath(event); break
        case 'arrow-flight': handleArrowFlight(event); break
        case 'heal': handleSimpleEffect(event, emitHeal, 1000); break
        case 'freeze': handleSimpleEffect(event, emitFreeze, 900); break
        case 'poison': handleSimpleEffect(event, emitPoison, 1000); break
        case 'lightning': handleSimpleEffect(event, emitLightning, 700); break
        case 'resurrect': handleSimpleEffect(event, emitResurrect, 1200); break
        case 'stun': handleSimpleEffect(event, emitStun, 1000); break
        case 'shield-break': handleSimpleEffect(event, emitShieldBreak, 800); break
        case 'summon': handleSimpleEffect(event, emitSummon, 1000); break
        case 'buff': handleSimpleEffect(event, emitBuff, 900); break
        case 'slash-attack': handleSimpleEffect(event, emitSlashAttack, 1200); break
        case 'screen-flash': handleScreenFlash(event); break
        case 'season-transition': {
          const old = (event.meta?.oldSeason as string) ?? 'spring'
          const nw = (event.meta?.newSeason as string) ?? 'summer'
          emitSeasonTransition(old, nw)
          vfxTimeout(() => vfx.complete(event.id), 2000)
          break
        }
        default: vfx.complete(event.id)
      }
    }
    // Cleanup old IDs
    const activeIds = new Set(events.map(e => e.id))
    for (const id of processedIds) {
      if (!activeIds.has(id)) processedIds.delete(id)
    }
  },
  { deep: true }
)

// ===== LIFECYCLE =====

onMounted(() => {
  overlayEl = document.querySelector('.vfx-overlay')
  const canvas = canvasRef.value
  console.info('[VFXOverlay] Mounted, canvas:', !!canvas, 'overlayEl:', !!overlayEl)
  if (canvas) {
    ctx = canvas.getContext('2d')
    resizeCanvas()
    // Explicitly clear canvas to transparent on first init to prevent flash
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    console.info('[VFXOverlay] Canvas size:', canvas.width, 'x', canvas.height)
    window.addEventListener('resize', resizeCanvas)
    rafHandle = rafLoop.register(animate)
  }
  vfx.setReady(true)
})

onUnmounted(() => {
  clearVfxTimeouts()
  vfx.setReady(false)
  vfx.clear()
  overlayEl = null
  if (rafHandle >= 0) { rafLoop.unregister(rafHandle); rafHandle = -1 }
  window.removeEventListener('resize', resizeCanvas)
  particles = []
})
</script>

<template>
  <div class="vfx-overlay" aria-hidden="true">
    <canvas ref="canvasRef" class="vfx-canvas" />
  </div>
</template>

<style scoped>
.vfx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}
.vfx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>

<style>
/* Damage number — unscoped so dynamically created elements get the styles */
.vfx-damage-number {
  position: absolute;
  font-family: var(--font-display, Georgia, serif);
  font-size: 42px;
  font-weight: 500;
  text-shadow:
    0 2px 6px rgba(0, 0, 0, 0.9),
    0 0 12px currentColor,
    0 0 24px currentColor;
  pointer-events: none;
  transform: translateX(-50%);
  z-index: 10000;
  white-space: nowrap;
  will-change: transform, opacity;
  letter-spacing: -0.02em;
}

.vfx-damage-counter {
  font-size: 34px;
}

.vfx-damage-block {
  font-size: 22px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
