/**
 * useMagicAttack — bridge between gameStore (pure TS) and MagicVFX (Vue component).
 *
 * GameBoard registers the component's play() function on mount.
 * emitCombatVFX calls trigger() to fire magic attack VFX.
 */

type PlayFn = (attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) => void

let _playFn: PlayFn | null = null

export function useMagicAttack() {
  return {
    /** Called by GameBoard on mount to register the MagicVFX.play function */
    register(fn: PlayFn) {
      _playFn = fn
      console.info('[MagicBridge] Registered play function')
    },

    /** Called by emitCombatVFX to trigger magic attack */
    trigger(attackerInstanceId: string, defenderInstanceId: string, damage?: number) {
      const atk = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`) as HTMLElement | null
      const def = document.querySelector(`[data-instance-id="${defenderInstanceId}"]`) as HTMLElement | null
      if (atk && def && _playFn) {
        console.info('[MagicBridge] Triggering:', attackerInstanceId, '→', defenderInstanceId, 'dmg:', damage)
        _playFn(atk, def, damage)
      } else {
        console.warn('[MagicBridge] Cannot trigger:', { atk: !!atk, def: !!def, ready: !!_playFn })
      }
    },

    get ready() { return _playFn !== null },
  }
}
