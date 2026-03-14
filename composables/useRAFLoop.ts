/**
 * useRAFLoop — central requestAnimationFrame orchestrator.
 *
 * Instead of each VFX component running its own RAF loop, all register
 * their animate callbacks here. A single RAF loop dispatches to all active
 * callbacks, reducing overhead and enabling global pause-on-tab-blur.
 *
 * Usage:
 *   const handle = rafLoop.register(myAnimate)  // starts loop if first
 *   rafLoop.unregister(handle)                   // stops loop if last
 */

export type RAFCallback = (time: number) => void

interface RAFHandle {
  id: number
  callback: RAFCallback
}

let nextId = 0
const callbacks = new Map<number, RAFCallback>()
let rafId = 0
let running = false
let paused = false

function tick(time: number) {
  if (!running) return
  rafId = requestAnimationFrame(tick)
  if (paused) return
  // Iterate a snapshot of values — callbacks may unregister during iteration
  for (const cb of Array.from(callbacks.values())) {
    cb(time)
  }
}

function startIfNeeded() {
  if (running || callbacks.size === 0) return
  running = true
  rafId = requestAnimationFrame(tick)
}

function stopIfEmpty() {
  if (callbacks.size > 0) return
  running = false
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

// Tab visibility handler — pause all loops when tab is hidden (#4)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden
    // When returning from hidden, restart the RAF chain
    if (!paused && running && !rafId) {
      rafId = requestAnimationFrame(tick)
    }
  })
}

export const rafLoop = {
  /**
   * Register an animate callback. Returns a numeric handle for unregistration.
   * The loop auto-starts when the first callback is registered.
   */
  register(callback: RAFCallback): number {
    const id = nextId++
    callbacks.set(id, callback)
    startIfNeeded()
    return id
  },

  /**
   * Unregister a callback by handle. The loop auto-stops when the last
   * callback is removed.
   */
  unregister(handle: number): void {
    callbacks.delete(handle)
    stopIfEmpty()
  },

  /** Number of active callbacks (for debugging). */
  get activeCount(): number {
    return callbacks.size
  },

  /** Whether the loop is currently paused due to tab blur. */
  get isPaused(): boolean {
    return paused
  },
}
