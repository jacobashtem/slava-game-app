/**
 * useGSAP — composable wrapping GSAP with auto-cleanup on Vue unmount.
 *
 * Usage:
 *   const { gsap, timeline, ctx } = useGSAP()
 *   onMounted(() => {
 *     gsap.to(el, { x: 100, duration: 0.5 })
 *   })
 *   // All tweens killed automatically on unmount.
 */
import { onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'

export function useGSAP(scope?: () => Element | null) {
  let context: gsap.Context | null = null

  onMounted(() => {
    context = gsap.context(() => {}, scope?.() ?? undefined)
  })

  onUnmounted(() => {
    context?.revert()
    context = null
  })

  /** Run animations inside the managed context (auto-cleanup). */
  function add(fn: () => void) {
    if (context) {
      context.add(fn)
    } else {
      // Before mount — just run directly, onMounted will pick up
      fn()
    }
  }

  return {
    gsap,
    /** Create a managed timeline */
    timeline: (vars?: gsap.TimelineVars) => gsap.timeline(vars),
    /** Run inside context for auto-cleanup */
    add,
    /** Direct access to context */
    ctx: () => context,
  }
}
