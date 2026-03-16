/**
 * useBowAttack — bridge between gameStore (pure TS) and BowAttackVFX (Vue component).
 *
 * GameBoard registers the component's play() function on mount.
 * emitCombatVFX calls trigger() to fire the bow attack on ranged attacks.
 *
 * P3: play() returns Promise<void> resolved on GSAP onComplete.
 */

type PlayFn = (attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) => Promise<void>

let _playFn: PlayFn | null = null

export function useBowAttack() {
  return {
    /** Called by GameBoard on mount to register the BowAttackVFX.play function */
    register(fn: PlayFn) {
      _playFn = fn
      console.info('[BowBridge] Registered play function')
    },

    /** Called by emitCombatVFX to trigger bow attack on ranged attacks. Returns Promise. */
    trigger(attackerInstanceId: string, defenderInstanceId: string, damage?: number): Promise<void> {
      const atk = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`) as HTMLElement | null
      const def = document.querySelector(`[data-instance-id="${defenderInstanceId}"]`) as HTMLElement | null
      if (atk && def && _playFn) {
        console.info('[BowBridge] Triggering bow:', attackerInstanceId, '→', defenderInstanceId, 'dmg:', damage)
        return _playFn(atk, def, damage)
      } else {
        console.warn('[BowBridge] Cannot trigger:', { atk: !!atk, def: !!def, ready: !!_playFn })
        return Promise.resolve()
      }
    },

    /** Check if bow VFX is available (component registered) */
    get ready() { return _playFn !== null },
  }
}
