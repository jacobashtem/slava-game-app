/**
 * useAnimationDirector — centralny orchestrator animacji (P3).
 *
 * Zastępuje rozproszony system setTimeout + hardcoded ms w gameStore/uiStore.
 * Jedno API: play() zwraca Promise rozwiązywaną po onComplete animacji.
 *
 * Cechy:
 * - Per-card FIFO queue — animacje na tej samej karcie sekwencyjne, na różnych równoległe
 * - sequence() / parallel() — orchestracja złożonych choreografii (np. atak → kontra → śmierć)
 * - Timeout safety — max czas oczekiwania na animację (fallback jeśli onComplete się nie odpali)
 * - CSS class management — .vfx-animating na karcie podczas animacji (wyłącza infinite CSS)
 */

import { ref, readonly } from 'vue'

// ===== TYPES =====

export type AnimationType =
  // Attack VFX (WebGPU)
  | 'slash' | 'bow' | 'elemental' | 'magic'
  // Canvas particle VFX
  | 'hit' | 'death' | 'block' | 'arrow-flight'
  | 'heal' | 'freeze' | 'poison' | 'lightning'
  | 'resurrect' | 'stun' | 'shield-break' | 'summon' | 'buff'
  | 'slash-attack' | 'screen-flash' | 'damage-number'
  // UI overlay
  | 'counter-flash' | 'block-flash' | 'shake'
  | 'poison-flash' | 'paralyze-flash' | 'event-flash'

export interface PlayOptions {
  /** Target card instanceId */
  targetId?: string
  /** Source card instanceId (for directional VFX) */
  sourceId?: string
  /** Numeric value (damage, heal amount, etc.) */
  value?: number
  /** Color override */
  color?: string
  /** Text label */
  label?: string
  /** Max time (ms) to wait before auto-resolving. Default: 5000 */
  timeout?: number
  /** Additional metadata */
  meta?: Record<string, unknown>
}

interface QueuedTask {
  type: AnimationType
  options: PlayOptions
  resolve: () => void
  reject: (err: Error) => void
  timeoutId?: ReturnType<typeof setTimeout>
}

// ===== MODULE STATE =====

/** Per-card animation queues — FIFO, sequential per card */
const cardQueues = new Map<string, QueuedTask[]>()

/** Cards currently processing an animation */
const processingCards = new Set<string>()

/** Global animation counter for isAnimating check */
const activeCount = ref(0)

/** Registered animation handlers — type → async function */
type AnimHandler = (type: AnimationType, opts: PlayOptions) => Promise<void>
let _handler: AnimHandler | null = null

// ===== INTERNAL =====

const DEFAULT_TIMEOUT = 5000

function getQueueKey(opts: PlayOptions): string {
  return opts.targetId ?? '__global__'
}

/** Add .vfx-animating class to target card element */
function setAnimatingClass(targetId: string | undefined, active: boolean) {
  if (!targetId) return
  const el = document.querySelector(`[data-instance-id="${targetId}"]`)
  if (el) {
    if (active) el.classList.add('vfx-animating')
    else el.classList.remove('vfx-animating')
  }
}

async function processQueue(key: string) {
  if (processingCards.has(key)) return // already processing
  const queue = cardQueues.get(key)
  if (!queue || queue.length === 0) {
    cardQueues.delete(key)
    return
  }

  processingCards.add(key)

  while (queue.length > 0) {
    const task = queue[0]!
    activeCount.value++
    setAnimatingClass(task.options.targetId, true)

    try {
      await new Promise<void>((resolve, reject) => {
        // Safety timeout — if handler never resolves, auto-resolve to prevent deadlock
        const timeoutMs = task.options.timeout ?? DEFAULT_TIMEOUT
        const timeoutId = setTimeout(() => {
          console.warn(`[AnimDirector] Timeout (${timeoutMs}ms) for ${task.type} on ${getQueueKey(task.options)}`)
          resolve()
        }, timeoutMs)

        // Run the actual animation
        const handlerPromise = _handler
          ? _handler(task.type, task.options)
          : Promise.resolve()

        handlerPromise
          .then(() => { clearTimeout(timeoutId); resolve() })
          .catch((err) => { clearTimeout(timeoutId); reject(err) })
      })

      task.resolve()
    } catch (err) {
      console.error(`[AnimDirector] Error in ${task.type}:`, err)
      task.resolve() // resolve anyway to not block the queue
    } finally {
      activeCount.value--
      setAnimatingClass(task.options.targetId, false)
      queue.shift()
    }
  }

  processingCards.delete(key)
  cardQueues.delete(key)
}

// ===== PUBLIC API =====

/**
 * Play a single animation. Returns Promise resolved when animation completes.
 * Enqueues into per-card queue (sequential per card, parallel across cards).
 */
function play(type: AnimationType, opts: PlayOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const key = getQueueKey(opts)
    let queue = cardQueues.get(key)
    if (!queue) {
      queue = []
      cardQueues.set(key, queue)
    }

    queue.push({ type, options: opts, resolve, reject })

    // Kick off processing if not already running for this key
    processQueue(key)
  })
}

/**
 * Run animation steps sequentially. Each step is a function returning Promise<void>.
 */
async function sequence(steps: Array<() => Promise<void>>): Promise<void> {
  for (const step of steps) {
    await step()
  }
}

/**
 * Run animation steps in parallel. Resolves when ALL complete.
 */
async function parallel(steps: Array<() => Promise<void>>): Promise<void> {
  await Promise.all(steps.map(fn => fn()))
}

/**
 * Cancel all pending animations for a specific card.
 */
function cancelCard(instanceId: string) {
  const queue = cardQueues.get(instanceId)
  if (queue) {
    // Resolve all pending tasks (don't reject — callers shouldn't crash)
    for (const task of queue) {
      task.resolve()
    }
    queue.length = 0
    cardQueues.delete(instanceId)
  }
  setAnimatingClass(instanceId, false)
}

/**
 * Cancel ALL pending animations (e.g., on game reset).
 */
function cancelAll() {
  for (const [key, queue] of cardQueues) {
    for (const task of queue) {
      task.resolve()
    }
    queue.length = 0
  }
  cardQueues.clear()
  processingCards.clear()
  activeCount.value = 0

  // Remove all .vfx-animating classes
  document.querySelectorAll('.vfx-animating').forEach(el => {
    el.classList.remove('vfx-animating')
  })
}

/**
 * Check if any animation is currently playing.
 */
function isAnimating(instanceId?: string): boolean {
  if (instanceId) return processingCards.has(instanceId)
  return activeCount.value > 0
}

/**
 * Register the animation handler — called by GameBoard to wire up VFX dispatch.
 * The handler receives (type, opts) and must return a Promise that resolves on completion.
 */
function registerHandler(handler: AnimHandler) {
  _handler = handler
  console.info('[AnimDirector] Handler registered')
}

// ===== COMPOSABLE =====

export function useAnimationDirector() {
  return {
    /** Play a single animation (Promise-based, per-card queued) */
    play,
    /** Run steps sequentially */
    sequence,
    /** Run steps in parallel */
    parallel,
    /** Cancel all pending animations for a card */
    cancelCard,
    /** Cancel all animations globally */
    cancelAll,
    /** Check if animating */
    isAnimating,
    /** Register the VFX dispatch handler */
    registerHandler,
    /** Reactive count of active animations */
    activeCount: readonly(activeCount),
  }
}
