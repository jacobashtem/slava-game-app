/**
 * useDeathVFX — bridge between gameStore (pure TS) and DeathVFX (Vue component).
 *
 * GameBoard registers the component's play() function on mount.
 * emitCombatVFX calls trigger() to play death animation after combat.
 */

type PlayFn = (targetEl: HTMLElement) => void

let _playFn: PlayFn | null = null

export function useDeathVFX() {
  return {
    /** Called by GameBoard on mount to register the DeathVFX.play function */
    register(fn: PlayFn) {
      _playFn = fn
      console.info('[DeathBridge] Registered play function')
    },

    /** Called by emitCombatVFX to trigger death animation */
    trigger(instanceId: string) {
      const el = document.querySelector(`[data-instance-id="${instanceId}"]`) as HTMLElement | null
      if (el && _playFn) {
        console.info('[DeathBridge] Triggering death:', instanceId)
        _playFn(el)
      } else {
        console.warn('[DeathBridge] Cannot trigger:', { el: !!el, ready: !!_playFn })
      }
    },

    get ready() { return _playFn !== null },
  }
}
