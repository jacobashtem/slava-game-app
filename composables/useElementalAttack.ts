/**
 * useElementalAttack — bridge between gameStore (pure TS) and ElementalVFX (Vue component).
 *
 * GameBoard registers the component's play() function on mount.
 * emitCombatVFX calls trigger() to fire elemental attack VFX.
 */

type PlayFn = (attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) => void

let _playFn: PlayFn | null = null

export function useElementalAttack() {
  return {
    /** Called by GameBoard on mount to register the ElementalVFX.play function */
    register(fn: PlayFn) {
      _playFn = fn
      console.info('[ElementalBridge] Registered play function')
    },

    /** Called by emitCombatVFX to trigger elemental attack */
    trigger(attackerInstanceId: string, defenderInstanceId: string, damage?: number) {
      const atk = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`) as HTMLElement | null
      const def = document.querySelector(`[data-instance-id="${defenderInstanceId}"]`) as HTMLElement | null
      if (atk && def && _playFn) {
        console.info('[ElementalBridge] Triggering:', attackerInstanceId, '→', defenderInstanceId, 'dmg:', damage)
        _playFn(atk, def, damage)
      } else {
        console.warn('[ElementalBridge] Cannot trigger:', { atk: !!atk, def: !!def, ready: !!_playFn })
      }
    },

    get ready() { return _playFn !== null },
  }
}
