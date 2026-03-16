/**
 * useElementalAttack — bridge between gameStore (pure TS) and ElementalVFX (Vue component).
 *
 * GameBoard registers the component's play() function on mount.
 * emitCombatVFX calls trigger() to fire elemental attack VFX.
 *
 * P3: play() returns Promise<void> resolved on GSAP onComplete.
 */

type PlayFn = (attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) => Promise<void>

let _playFn: PlayFn | null = null

export function useElementalAttack() {
  return {
    /** Called by GameBoard on mount to register the ElementalVFX.play function */
    register(fn: PlayFn) {
      _playFn = fn
      console.info('[ElementalBridge] Registered play function')
    },

    /** Called by emitCombatVFX to trigger elemental attack. Returns Promise. */
    trigger(attackerInstanceId: string, defenderInstanceId: string, damage?: number): Promise<void> {
      const atk = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`) as HTMLElement | null
      const def = document.querySelector(`[data-instance-id="${defenderInstanceId}"]`) as HTMLElement | null
      if (atk && def && _playFn) {
        console.info('[ElementalBridge] Triggering:', attackerInstanceId, '→', defenderInstanceId, 'dmg:', damage)
        return _playFn(atk, def, damage)
      } else {
        console.warn('[ElementalBridge] Cannot trigger:', { atk: !!atk, def: !!def, ready: !!_playFn })
        return Promise.resolve()
      }
    },

    get ready() { return _playFn !== null },
  }
}
