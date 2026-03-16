/**
 * useVFXOrchestrator — centralny system VFX (P3).
 *
 * Jedno źródło prawdy dla WSZYSTKICH efektów wizualnych w grze.
 * Animacje sterowane typowanymi zdarzeniami, renderowane na jednym canvasie TresJS.
 *
 * Filozofia:
 * - Typed events zamiast text.includes() na polskich stringach
 * - Jedna kolejka VFX, jeden render loop, zero konfliktów z Vue DOM
 * - GSAP timeline per efekt, pooling obiektów 3D, on-demand rendering
 * - Composable zwraca emit() + aktywna kolejka (reactive)
 *
 * Użycie:
 *   const vfx = useVFXOrchestrator()
 *   vfx.emit({ type: 'hit', attackType: 'melee', targetId: 'card-123' })
 *   vfx.emit({ type: 'death', cardId: 'card-456' })
 */

import { ref, readonly, shallowRef } from 'vue'

// ===== TYPED VFX EVENTS =====

export type VFXEventType =
  | 'hit'
  | 'death'
  | 'block'
  | 'sword-slash'
  | 'tornado'
  | 'attack'
  | 'counterattack'
  | 'damage-number'
  | 'immune'
  | 'drain'
  | 'aoe-wave'
  | 'status-flash'
  | 'egg-hatch'
  | 'zombify'
  | 'conversion'
  | 'gorynych-merge'
  | 'screen-shake'
  | 'screen-flash'
  | 'arrow-flight'
  | 'heal'
  | 'freeze'
  | 'poison'
  | 'lightning'
  | 'resurrect'
  | 'stun'
  | 'shield-break'
  | 'summon'
  | 'buff'
  | 'slash-attack'

export type AttackVisualType = 'melee' | 'elemental' | 'magic' | 'ranged'

export interface VFXEvent {
  /** Unique event ID (auto-generated) */
  id: string
  /** Event type — determines which VFX to render */
  type: VFXEventType
  /** Target card instanceId (for card-level effects) */
  targetId?: string
  /** Source card instanceId (for directional effects like drain) */
  sourceId?: string
  /** Attack visual type (melee/elemental/magic/ranged) */
  attackType?: AttackVisualType
  /** Numeric value (damage amount, heal amount, etc.) */
  value?: number
  /** Color override */
  color?: string
  /** Label text (e.g., 'Taniec Wiły', '+2 HP') */
  label?: string
  /** Additional metadata for specific VFX types */
  meta?: Record<string, unknown>
}

// ===== ORCHESTRATOR STATE =====

let _nextId = 0
function genId(): string {
  return `vfx-${++_nextId}-${Date.now()}`
}

/** Active VFX queue — effects currently being rendered */
const queue = shallowRef<VFXEvent[]>([])

/** Whether the VFX overlay canvas is mounted and ready */
const ready = ref(false)

/** Completion callbacks for waitFor() — resolved when event completes */
const _completionCallbacks = new Map<string, () => void>()

// ===== PUBLIC API =====

/**
 * Emit a VFX event into the queue.
 * The VFXOverlay component picks it up and renders the corresponding animation.
 * Once the animation completes, it removes the event from the queue.
 */
function emit(event: Omit<VFXEvent, 'id'>): string {
  const id = genId()
  const full: VFXEvent = { ...event, id }
  queue.value = [...queue.value, full]
  return id
}

/**
 * Mark a VFX event as complete — removes it from the queue.
 * Called by VFXOverlay when the animation finishes.
 * Also resolves any waitFor() promise listening for this event.
 */
function complete(eventId: string) {
  queue.value = queue.value.filter(e => e.id !== eventId)
  const cb = _completionCallbacks.get(eventId)
  if (cb) { cb(); _completionCallbacks.delete(eventId) }
}

/**
 * Wait for a specific VFX event to complete. Returns a Promise that resolves
 * when VFXOverlay calls complete(eventId).
 * If the event is already gone from the queue, resolves immediately.
 */
function waitFor(eventId: string): Promise<void> {
  return new Promise(resolve => {
    // Already completed (not in queue) — resolve immediately
    if (!queue.value.find(e => e.id === eventId)) { resolve(); return }
    _completionCallbacks.set(eventId, resolve)
  })
}

/**
 * Clear all pending VFX (e.g., on game reset or navigation away).
 * Also resolves all pending waitFor() promises.
 */
function clear() {
  queue.value = []
  for (const cb of _completionCallbacks.values()) cb()
  _completionCallbacks.clear()
}

/**
 * Mark the overlay canvas as mounted and ready to render.
 */
function setReady(value: boolean) {
  ready.value = value
}

export function useVFXOrchestrator() {
  return {
    /** Reactive queue of active VFX events (read-only) */
    queue: readonly(queue),
    /** Whether the VFX canvas overlay is ready */
    ready: readonly(ready),
    /** Emit a new VFX event */
    emit,
    /** Emit a VFX event and wait for completion */
    emitAndWait: async (event: Omit<VFXEvent, 'id'>): Promise<void> => {
      const id = emit(event)
      await waitFor(id)
    },
    /** Mark a VFX event as completed */
    complete,
    /** Wait for a specific VFX event to complete */
    waitFor,
    /** Clear all VFX */
    clear,
    /** Set overlay readiness */
    setReady,
  }
}
