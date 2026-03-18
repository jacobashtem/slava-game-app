/**
 * TriggerProcessor — evaluates trigger rules against game events.
 * Pure TS, zero Vue dependencies.
 *
 * Receives game events (round change, kill, state change, etc.),
 * evaluates conditions, returns actions to execute.
 */

import type { TriggerRule, TriggerCondition, TriggerAction, TriggerEvent } from './types'
import type { GameState, CreatureCardData } from '../types'
import { getAllCreaturesOnField } from '../GameStateUtils'

export interface TriggerEventData {
  roundNumber?: number
  effectId?: string
  side?: 'player1' | 'player2'
}

export class TriggerProcessor {
  private encounterRules: TriggerRule[] = []
  private globalRules: TriggerRule[] = []
  private firedRuleIds = new Set<string>()
  private flags = new Map<string, unknown>()

  constructor(globalRules: TriggerRule[] = []) {
    this.globalRules = globalRules
  }

  /** Load rules for a new encounter (keeps global rules + flags). */
  loadEncounter(encounterRules: TriggerRule[]): void {
    this.encounterRules = encounterRules
    // Reset per-encounter fired rules (keep globals)
    for (const id of this.firedRuleIds) {
      if (!this.globalRules.some(r => r.id === id)) {
        this.firedRuleIds.delete(id)
      }
    }
  }

  /** Full reset (new scenario). */
  reset(): void {
    this.encounterRules = []
    this.globalRules = []
    this.firedRuleIds.clear()
    this.flags.clear()
  }

  /** Set global rules (scenario-level). */
  setGlobalRules(rules: TriggerRule[]): void {
    this.globalRules = rules
  }

  /** Process a game event. Returns actions to execute. */
  processEvent(
    event: TriggerEvent,
    state: GameState,
    data?: TriggerEventData,
  ): TriggerAction[] {
    const allRules = [...this.encounterRules, ...this.globalRules]
    const actions: TriggerAction[] = []

    for (const rule of allRules) {
      if (rule.once && this.firedRuleIds.has(rule.id)) continue
      if (!this.matchCondition(rule.condition, event, state, data)) continue

      actions.push(...rule.actions)
      if (rule.once) this.firedRuleIds.add(rule.id)
    }

    // Process set_flag actions immediately so later rules in the same batch can see them
    for (const action of actions) {
      if (action.type === 'set_flag' && action.flag !== undefined) {
        this.flags.set(action.flag, action.flagValue ?? true)
      }
    }

    return actions
  }

  // ===== FLAG ACCESS =====

  getFlag(key: string): unknown {
    return this.flags.get(key)
  }

  setFlag(key: string, value: unknown): void {
    this.flags.set(key, value)
  }

  // ===== SERIALIZATION =====

  getFiredRuleIds(): string[] {
    return [...this.firedRuleIds]
  }

  getFlags(): [string, unknown][] {
    return [...this.flags.entries()]
  }

  restoreState(firedIds: string[], flags: [string, unknown][]): void {
    this.firedRuleIds = new Set(firedIds)
    this.flags = new Map(flags)
  }

  // ===== PRIVATE =====

  private matchCondition(
    cond: TriggerCondition,
    event: TriggerEvent,
    state: GameState,
    data?: TriggerEventData,
  ): boolean {
    // Event type must match
    if (cond.event !== event) return false

    // Flag check
    if (cond.requireFlag && !this.flags.has(cond.requireFlag)) return false

    // Round check
    if (cond.round !== undefined && data?.roundNumber !== undefined) {
      if (typeof cond.round === 'number') {
        if (data.roundNumber !== cond.round) return false
      } else {
        if (cond.round.min !== undefined && data.roundNumber < cond.round.min) return false
        if (cond.round.max !== undefined && data.roundNumber > cond.round.max) return false
      }
    }

    // EffectId check (on_kill, on_card_play)
    if (cond.effectId && data?.effectId !== cond.effectId) return false

    // Threshold checks (on_hp_below, on_field_count)
    if (cond.threshold !== undefined) {
      const side = cond.side ?? 'player2'

      if (event === 'on_hp_below') {
        // Check if any creature with effectId has DEF below threshold
        const targetId = cond.effectId
        if (!targetId) return false
        const field = getAllCreaturesOnField(state, side)
        const target = field.find(c => (c.cardData as CreatureCardData).effectId === targetId)
        if (!target) return false
        if (!this.compareValue(target.currentStats.defense, cond.threshold, cond.compare ?? 'lte')) return false
      }

      if (event === 'on_field_count') {
        const field = getAllCreaturesOnField(state, side)
        if (!this.compareValue(field.length, cond.threshold, cond.compare ?? 'eq')) return false
      }
    }

    return true
  }

  private compareValue(actual: number, threshold: number, op: string): boolean {
    switch (op) {
      case 'lte': return actual <= threshold
      case 'gte': return actual >= threshold
      case 'lt':  return actual < threshold
      case 'gt':  return actual > threshold
      case 'eq':  return actual === threshold
      default:    return actual <= threshold
    }
  }
}
