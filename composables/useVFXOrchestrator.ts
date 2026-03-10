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
 */
function complete(eventId: string) {
  queue.value = queue.value.filter(e => e.id !== eventId)
}

/**
 * Clear all pending VFX (e.g., on game reset or navigation away).
 */
function clear() {
  queue.value = []
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
    /** Mark a VFX event as completed */
    complete,
    /** Clear all VFX */
    clear,
    /** Set overlay readiness */
    setReady,
  }
}
