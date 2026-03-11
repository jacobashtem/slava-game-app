/**
 * useSlashAttack — bridge between gameStore (pure TS) and SlashAttackVFX (Vue component).
 *
 * GameBoard registers the component's play() function on mount.
 * emitCombatVFX calls trigger() to fire the slash on melee attacks.
 */

type PlayFn = (attackerEl: HTMLElement, defenderEl: HTMLElement, damage?: number) => void

let _playFn: PlayFn | null = null

export function useSlashAttack() {
  return {
    /** Called by GameBoard on mount to register the SlashAttackVFX.play function */
    register(fn: PlayFn) {
      _playFn = fn
      console.info('[SlashBridge] Registered play function')
    },

    /** Called by emitCombatVFX to trigger slash on melee attacks */
    trigger(attackerInstanceId: string, defenderInstanceId: string, damage?: number) {
      const atk = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`) as HTMLElement | null
      const def = document.querySelector(`[data-instance-id="${defenderInstanceId}"]`) as HTMLElement | null
      if (atk && def && _playFn) {
        console.info('[SlashBridge] Triggering slash:', attackerInstanceId, '→', defenderInstanceId, 'dmg:', damage)
        _playFn(atk, def, damage)
      } else {
        console.warn('[SlashBridge] Cannot trigger:', { atk: !!atk, def: !!def, ready: !!_playFn })
      }
    },

    /** Check if slash VFX is available (component registered) */
    get ready() { return _playFn !== null },
  }
}
