/**
 * useParticleSystem — shared 2D canvas particle system for all VFX components.
 *
 * Provides:
 *   - Spark class (unified across all VFX types)
 *   - Type-specific draw functions registry
 *   - tickSparks() — in-place swap-and-pop update + draw loop (zero GC)
 *   - spawnEmbers() / spawnSlashSparks() — shared spawn helpers
 */

// ===== SPARK CLASS =====

export type SparkType =
  // Slash
  | 'spark' | 'ember' | 'shard'
  // Magic
  | 'rune' | 'energy' | 'mote'
  // Elemental
  | 'flame' | 'smoke'
  // Death
  | 'soul' | 'ash'

export interface SparkInit {
  vx?: number; vy?: number
  life?: number; decay?: number
  size?: number; color?: string
  type?: SparkType
  gravity?: number; friction?: number
  angle?: number; spin?: number
  alpha?: number
}

export class Spark {
  x: number; y: number
  vx: number; vy: number
  life: number; decay: number
  size: number; color: string
  type: SparkType
  gravity: number; friction: number
  angle: number; spin: number
  alpha: number

  constructor(x: number, y: number, o: SparkInit = {}) {
    this.x = x; this.y = y
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0
    this.life = o.life ?? 1; this.decay = o.decay ?? 0.02
    this.size = o.size ?? 2; this.color = o.color ?? '255,220,180'
    this.type = o.type ?? 'ember'
    this.gravity = o.gravity ?? 0; this.friction = o.friction ?? 0.98
    this.angle = o.angle ?? 0; this.spin = o.spin ?? 0
    this.alpha = o.alpha ?? 1.0
  }

  /** Reset spark for pool reuse (avoids new allocation) */
  reset(x: number, y: number, o: SparkInit = {}) {
    this.x = x; this.y = y
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0
    this.life = o.life ?? 1; this.decay = o.decay ?? 0.02
    this.size = o.size ?? 2; this.color = o.color ?? '255,220,180'
    this.type = o.type ?? 'ember'
    this.gravity = o.gravity ?? 0; this.friction = o.friction ?? 0.98
    this.angle = o.angle ?? 0; this.spin = o.spin ?? 0
    this.alpha = o.alpha ?? 1.0
  }

  update(): boolean {
    this.vx *= this.friction; this.vy *= this.friction
    this.vy += this.gravity
    this.x += this.vx; this.y += this.vy
    this.life -= this.decay
    this.angle += this.spin
    return this.life > 0
  }

  draw(c: CanvasRenderingContext2D) {
    const a = Math.max(0, this.life) * this.alpha
    if (a <= 0.01) return
    c.save()
    const drawFn = sparkDrawRegistry[this.type]
    if (drawFn) drawFn(c, this, a)
    c.restore()
  }
}

// ===== DRAW FUNCTIONS (per type) =====

type DrawFn = (c: CanvasRenderingContext2D, s: Spark, a: number) => void

const sparkDrawRegistry: Record<SparkType, DrawFn> = {
  // --- Slash types ---
  spark(c, s, a) {
    c.translate(s.x, s.y)
    c.rotate(s.angle)
    const len = s.size * 4
    const grad = c.createLinearGradient(-len, 0, len, 0)
    grad.addColorStop(0, `rgba(${s.color},0)`)
    grad.addColorStop(0.5, `rgba(${s.color},${a})`)
    grad.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = grad
    c.fillRect(-len, -0.7, len * 2, 1.4)
  },

  ember(c, s, a) {
    const gr = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 1.8)
    gr.addColorStop(0, `rgba(${s.color},${a * 0.7})`)
    gr.addColorStop(0.4, `rgba(${s.color},${a * 0.3})`)
    gr.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = gr
    c.beginPath()
    c.arc(s.x, s.y, s.size * 1.8, 0, Math.PI * 2)
    c.fill()
  },

  shard(c, s, a) {
    c.translate(s.x, s.y)
    c.rotate(s.angle)
    c.fillStyle = `rgba(${s.color},${a})`
    c.fillRect(-s.size, -s.size * 0.3, s.size * 2, s.size * 0.6)
  },

  // --- Magic types ---
  rune(c, s, a) {
    const gr = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2)
    gr.addColorStop(0, `rgba(${s.color},${a * 0.8})`)
    gr.addColorStop(0.3, `rgba(${s.color},${a * 0.3})`)
    gr.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = gr
    c.beginPath()
    c.arc(s.x, s.y, s.size * 2, 0, Math.PI * 2)
    c.fill()
  },

  energy(c, s, a) {
    c.translate(s.x, s.y)
    c.rotate(Math.atan2(s.vy, s.vx))
    const len = s.size * 3
    const grad = c.createLinearGradient(-len, 0, len, 0)
    grad.addColorStop(0, `rgba(${s.color},0)`)
    grad.addColorStop(0.5, `rgba(${s.color},${a})`)
    grad.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = grad
    c.fillRect(-len, -0.8, len * 2, 1.6)
  },

  mote(c, s, a) {
    const grad = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size)
    grad.addColorStop(0, `rgba(${s.color},${a * 0.6})`)
    grad.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = grad
    c.beginPath()
    c.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    c.fill()
  },

  // --- Elemental types ---
  flame(c, s, a) {
    const grad = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size)
    grad.addColorStop(0, `rgba(255,240,200,${a * 0.6})`)
    grad.addColorStop(0.5, `rgba(${s.color},${a * 0.4})`)
    grad.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = grad
    c.beginPath()
    c.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    c.fill()
  },

  smoke(c, s, a) {
    const grad = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size)
    grad.addColorStop(0, `rgba(${s.color},${a * 0.25})`)
    grad.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = grad
    c.beginPath()
    c.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    c.fill()
  },

  // --- Death types ---
  soul(c, s, a) {
    const gr = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2)
    gr.addColorStop(0, `rgba(${s.color},${a})`)
    gr.addColorStop(0.3, `rgba(${s.color},${a * 0.4})`)
    gr.addColorStop(1, `rgba(${s.color},0)`)
    c.fillStyle = gr
    c.beginPath()
    c.arc(s.x, s.y, s.size * 2, 0, Math.PI * 2)
    c.fill()
  },

  ash(c, s, a) {
    c.fillStyle = `rgba(${s.color},${a * 0.4})`
    c.beginPath()
    c.arc(s.x, s.y, s.size * 0.3, 0, Math.PI * 2)
    c.fill()
  },
}

// ===== OBJECT POOL (zero-GC particle lifecycle) =====

const pool: Spark[] = []
const MAX_POOL = 512

/**
 * Acquire a Spark from the pool (or create one if empty).
 * Use this instead of `new Spark(...)` to avoid GC pressure.
 */
export function acquireSpark(x: number, y: number, o: SparkInit = {}): Spark {
  const s = pool.pop()
  if (s) { s.reset(x, y, o); return s }
  return new Spark(x, y, o)
}

function releaseSpark(s: Spark): void {
  if (pool.length < MAX_POOL) pool.push(s)
}

// ===== TICK LOOP (in-place, zero allocation) =====

/**
 * Update and draw all sparks. Dead sparks are removed via swap-and-pop
 * and returned to the pool.
 * Call this inside your animate() loop after clearing the canvas.
 */
export function tickSparks(sparks: Spark[], ctx: CanvasRenderingContext2D): void {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]!
    if (!s.update()) {
      releaseSpark(s)
      sparks[i] = sparks[sparks.length - 1]!
      sparks.pop()
    } else {
      s.draw(ctx)
    }
  }
}

// ===== SPAWN HELPERS =====

/**
 * Spawn ember particles in a radial burst around (x, y).
 */
export function spawnEmbers(
  sparks: Spark[],
  x: number, y: number,
  count: number,
  spread = 30,
  color = '255,220,180',
  opts: Partial<SparkInit> = {},
): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * spread
    sparks.push(acquireSpark(x + Math.cos(a) * r, y + Math.sin(a) * r, {
      vx: Math.cos(a) * (1 + Math.random() * 2),
      vy: Math.sin(a) * (1 + Math.random() * 2),
      life: 0.4 + Math.random() * 0.4,
      decay: 0.015 + Math.random() * 0.01,
      size: 1.5 + Math.random() * 2,
      color,
      type: 'ember',
      gravity: 0.03,
      friction: 0.97,
      ...opts,
    }))
  }
}

/**
 * Spawn directional spark particles along a slash line.
 */
export function spawnSlashSparks(
  sparks: Spark[],
  x1: number, y1: number,
  x2: number, y2: number,
  count: number,
): void {
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
}
