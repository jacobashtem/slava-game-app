/**
 * ActionExecutor — executes TriggerActions against GameState.
 * Pure TS, zero Vue dependencies.
 *
 * Returns modified state + any narrative interruptions + encounter end signals.
 */

import type { TriggerAction, NarrativeLine, SyntheticCreatureData } from './types'
import type { GameState, CardInstance, CreatureCardData } from '../types'
import { BattleLine, CardPosition, AttackType, Domain } from '../constants'
import { getAllCreaturesOnField } from '../GameStateUtils'
import { createCreatureInstance } from '../CardFactory'

export interface ActionResult {
  /** Narrative lines to show (mid-combat interruptions). */
  narratives: NarrativeLine[][]
  /** Should combat pause for each narrative? */
  pauseCombat: boolean[]
  /** If set, encounter ends immediately. */
  encounterEnded?: 'player_win' | 'player_lose'
  /** Set of immunity targets (effectId → immune true/false). */
  immunityChanges: Map<string, boolean>
  /** Whether any state mutation occurred. */
  stateChanged: boolean
}

let _syntheticIdCounter = 9000

/** Reset synthetic ID counter (for tests). */
export function resetSyntheticIdCounter(): void {
  _syntheticIdCounter = 9000
}

export class ActionExecutor {

  /** Execute a batch of actions against game state. Mutates state in place. */
  execute(actions: TriggerAction[], state: GameState): ActionResult {
    const result: ActionResult = {
      narratives: [],
      pauseCombat: [],
      immunityChanges: new Map(),
      stateChanged: false,
    }

    for (const action of actions) {
      switch (action.type) {
        case 'spawn_creature':
          this.execSpawn(action, state, result)
          break
        case 'respawn_from_graveyard':
          this.execRespawn(action, state, result)
          break
        case 'set_immune':
          this.execSetImmune(action, state, result)
          break
        case 'remove_immune':
          result.immunityChanges.set(action.targetEffectId ?? '', false)
          result.stateChanged = true
          break
        case 'show_narrative':
          if (action.narrative?.length) {
            result.narratives.push(action.narrative)
            result.pauseCombat.push(action.pauseCombat !== false)
          }
          break
        case 'modify_stats':
          this.execModifyStats(action, state, result)
          break
        case 'heal_creature':
          this.execHeal(action, state, result)
          break
        case 'damage_creature':
          this.execDamage(action, state, result)
          break
        case 'remove_creature':
          this.execRemove(action, state, result)
          break
        case 'force_encounter_end':
          result.encounterEnded = action.result ?? 'player_win'
          break
        case 'draw_cards':
          this.execDraw(action, state, result)
          break
        case 'change_win_condition':
          // Handled by engine (mutates encounter definition at runtime)
          break
        case 'set_flag':
          // Already handled by TriggerProcessor during processEvent
          break
      }
    }

    return result
  }

  // ===== INDIVIDUAL ACTION HANDLERS =====

  private execSpawn(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player2'
    const line = (action.line ?? 1) as BattleLine
    const pos = action.position === 'defense' ? CardPosition.DEFENSE : CardPosition.ATTACK

    // Check maxOnField cap
    if (action.maxOnField !== undefined) {
      const effectId = action.spawnData?.effectId ?? action.targetEffectId
      if (effectId) {
        const existing = getAllCreaturesOnField(state, side).filter(
          c => (c.cardData as CreatureCardData).effectId === effectId,
        )
        if (existing.length >= action.maxOnField) return
      }
    }

    let inst: CardInstance | null = null

    if (action.spawnData) {
      const data = createSyntheticCreatureData(action.spawnData)
      inst = createCreatureInstance(data, side)
    }

    if (!inst) return

    inst.line = line
    inst.position = pos
    inst.isRevealed = true
    inst.roundEnteredPlay = state.roundNumber
    inst.turnsInPlay = 1

    state.players[side].field.lines[line].push(inst)
    result.stateChanged = true
  }

  private execRespawn(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player2'
    const targetId = action.targetEffectId
    if (!targetId) return

    // Check if already on field
    const field = getAllCreaturesOnField(state, side)
    if (field.some(c => (c.cardData as CreatureCardData).effectId === targetId)) return

    // Find in graveyard
    const gIdx = state.players[side].graveyard.findIndex(
      c => (c.cardData as CreatureCardData).effectId === targetId,
    )
    if (gIdx === -1) return

    const card = state.players[side].graveyard.splice(gIdx, 1)[0]!
    card.currentStats.defense = card.currentStats.maxDefense
    card.currentStats.attack = card.currentStats.maxAttack
    card.line = (action.line ?? 1) as BattleLine
    card.position = action.position === 'defense' ? CardPosition.DEFENSE : CardPosition.ATTACK
    card.isRevealed = true
    card.hasAttackedThisTurn = false
    card.activeEffects = []
    card.roundEnteredPlay = state.roundNumber

    state.players[side].field.lines[card.line].push(card)
    result.stateChanged = true
  }

  private execSetImmune(action: TriggerAction, state: GameState, result: ActionResult): void {
    const targetId = action.targetEffectId
    if (!targetId || !action.guardEffectIds?.length) return

    const side = action.side ?? 'player2'
    const field = getAllCreaturesOnField(state, side)

    // Check if any guard is alive
    const guardsAlive = action.guardEffectIds.some(gId =>
      field.some(c => (c.cardData as CreatureCardData).effectId === gId),
    )

    result.immunityChanges.set(targetId, guardsAlive)

    // If immune, restore DEF to max
    if (guardsAlive) {
      const target = field.find(c => (c.cardData as CreatureCardData).effectId === targetId)
      if (target && target.currentStats.defense < target.currentStats.maxDefense) {
        target.currentStats.defense = target.currentStats.maxDefense
        result.stateChanged = true
      }
    }
  }

  private execModifyStats(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player2'
    const targetId = action.targetEffectId
    if (!targetId) return

    const field = getAllCreaturesOnField(state, side)
    const target = field.find(c => (c.cardData as CreatureCardData).effectId === targetId)
    if (!target) return

    const val = action.value ?? 0
    if (action.stat === 'atk') {
      target.currentStats.attack += val
      target.currentStats.maxAttack += val
    } else {
      target.currentStats.defense += val
      target.currentStats.maxDefense += val
    }
    result.stateChanged = true
  }

  private execHeal(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player1'
    const targetId = action.targetEffectId
    const amount = action.value ?? 2

    const field = getAllCreaturesOnField(state, side)
    const targets = targetId
      ? field.filter(c => (c.cardData as CreatureCardData).effectId === targetId)
      : field

    for (const c of targets) {
      c.currentStats.defense = Math.min(c.currentStats.maxDefense, c.currentStats.defense + amount)
    }
    if (targets.length > 0) result.stateChanged = true
  }

  private execDamage(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player1'
    const targetId = action.targetEffectId
    const amount = action.value ?? 1
    if (!targetId) return

    const field = getAllCreaturesOnField(state, side)
    const target = field.find(c => (c.cardData as CreatureCardData).effectId === targetId)
    if (!target) return

    target.currentStats.defense -= amount
    result.stateChanged = true
  }

  private execRemove(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player2'
    const targetId = action.targetEffectId
    if (!targetId) return

    for (const lineKey of [1, 2, 3] as BattleLine[]) {
      const line = state.players[side].field.lines[lineKey]
      const idx = line.findIndex(c => (c.cardData as CreatureCardData).effectId === targetId)
      if (idx !== -1) {
        const removed = line.splice(idx, 1)[0]!
        state.players[side].graveyard.push(removed)
        result.stateChanged = true
        return
      }
    }
  }

  private execDraw(action: TriggerAction, state: GameState, result: ActionResult): void {
    const side = action.side ?? 'player1'
    const count = action.count ?? action.value ?? 1

    for (let i = 0; i < count; i++) {
      if (state.players[side].deck.length === 0) break
      const card = state.players[side].deck.shift()!
      card.isRevealed = true
      state.players[side].hand.push(card)
    }
    result.stateChanged = true
  }
}

// ===== HELPERS =====

function createSyntheticCreatureData(data: SyntheticCreatureData): CreatureCardData {
  _syntheticIdCounter++
  return {
    id: _syntheticIdCounter,
    cardType: 'creature',
    domain: Domain.WELES,
    name: data.name,
    stats: {
      attack: data.atk,
      defense: data.def,
      maxDefense: data.def,
      maxAttack: data.atk,
      soulValue: data.atk + data.def,
    },
    attackType: AttackType.MELEE,
    isFlying: false,
    effectId: data.effectId,
    effectDescription: '',
    lore: '',
    abilities: [],
  }
}
