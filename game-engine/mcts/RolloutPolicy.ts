/**
 * RolloutPolicy — symulacja gry od danego stanu do końca (lub limitu głębokości).
 *
 * Strategia: SZYBKOŚĆ > JAKOŚĆ.
 * Przy 15-25 iteracjach/2s budżet, szybki prosty rollout daje więcej iteracji
 * i lepsze wyniki niż wolny zaawansowany rollout z mniej iteracjami.
 *
 * Kluczowe cechy:
 * - Creature scoring uwzględnia ON_PLAY/DANGEROUS/SUPPORT efekty
 * - Nigdy nie enhanced (oszczędza PS → asymetria vs real Hard AI → lepszy spread WR)
 * - Prosty targeting: zabij najsłabszego → potem najsłabszy DEF
 * - Proste pozycjonowanie: DEF≤2 → obrona, reszta → atak
 * - Self-contained, ZERO zależności od AIPlayer
 */

import type { GameState, CardInstance } from '../types'
import type { PlayerSide } from '../types'
import { GamePhase, BattleLine, CardPosition, GOLD_EDITION_RULES } from '../constants'
import type { GameEngine } from '../GameEngine'
import {
  getAllCreaturesOnField,
  canPlayCreature,
  canPlaceInLine,
  canAttack,
} from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'
import { canActivateEffect, getEffect } from '../EffectRegistry'
import { evaluate, isTerminal } from './StateAdapter'
import type { MCTSMove } from './types'
import { moveKey } from './types'

// ===================================================================
// EFFECT SETS (do creature scoring)
// ===================================================================

const DANGEROUS_EFFECTS = new Set([
  'chlop_extra_attack', 'lesnica_double_attack', 'kikimora_free_attack',
  'swiatogor_line_cleave', 'morowa_dziewica_aoe_all', 'konny_cleave', 'waz_tugaryn_cleave',
  'baba_jaga_death_growth', 'smierc_death_growth_save',
  'aitwar_steal_hand', 'czarnoksieznik_steal_abilities', 'inkluz_steal_buff', 'mara_sacrifice_takeover',
  'wapierz_invincible_hunger', 'brzegina_shield_for_gold', 'mavka_line_shield',
  'bazyliszek_paralyze', 'polnocnica_mass_paralyze', 'biali_ludzie_wound_disarm',
  'cicha_kill_weak', 'poludnica_kill_weakest', 'bogunka_instant_kill_human', 'kania_chain_kill',
  'strzyga_lifesteal', 'bezkost_atk_drain',
  'rusalka_mirror_attack', 'licho_block_draw', 'buka_force_defense',
  'zmora_grow_sacrifice', 'gryf_double_dmg_on_play_turn',
])

const SUPPORT_EFFECTS = new Set([
  'barstuk_ally_regen', 'wolch_heal', 'bagiennik_cleanse_buff', 'siemiargl_cleanse',
  'zmije_glory_on_empty_field', 'chasnik_gold_on_kill', 'korgorusze_recover_glory',
  'cmentarna_baba_resurrect', 'wij_revive_once', 'homen_convert_on_death',
  'chowaniec_intercept', 'naczelnik_human_rally',
  'polewik_buff_neighbors', 'kresnik_choose_buff', 'rodzanice_swap_buff',
])

/** Wynik rolloutu */
export interface RolloutResult {
  value: number
  depth: number
  playedMoveKeys: string[]
}

// ===================================================================
// HELPERS
// ===================================================================

function getPS(state: GameState, side: PlayerSide): number {
  return state.gameMode === 'slava'
    ? state.players[side].glory
    : state.players[side].gold
}

/** Szybki scoring istoty (ATK+DEF + bonus za efekty) */
function quickCreatureScore(card: CardInstance): number {
  let score = card.currentStats.attack + card.currentStats.defense
  const effectId = (card.cardData as any).effectId as string
  const effect = getEffect(effectId)
  if (effect) {
    const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
    if (triggers.some(t => String(t) === 'on_play')) score += 6
    if (effect.activatable) score += 4
  }
  if (DANGEROUS_EFFECTS.has(effectId)) score += 5
  if (SUPPORT_EFFECTS.has(effectId)) score += 4
  return score
}

// ===================================================================
// ROLLOUT TURN PLANNER — szybki, z creature scoring
// ===================================================================

interface RolloutDecision {
  type: string
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
  useEnhanced?: boolean
}

function planRolloutTurn(
  state: GameState,
  side: PlayerSide,
): RolloutDecision[] {
  const decisions: RolloutDecision[] = []
  const player = state.players[side]
  const oppSide = getOpponentSide(side)

  // === PLAY: najlepsza istota wg szybkiego scoringu ===
  if (canPlayCreature(state, side)) {
    const creatures = player.hand
      .filter((c) => c.cardData.cardType === 'creature')
      .sort((a, b) => quickCreatureScore(b) - quickCreatureScore(a))

    if (creatures.length > 0) {
      const card = creatures[0]!
      const atkType = (card.cardData as any).attackType as number
      const preferred = atkType === 2 ? BattleLine.SUPPORT
        : atkType === 3 ? BattleLine.RANGED : BattleLine.FRONT

      const effect = getEffect((card.cardData as any).effectId)
      const targetSide = effect?.playOnEnemyField ? oppSide : side
      let line: BattleLine | null = null
      if (canPlaceInLine(state, targetSide, preferred)) line = preferred
      else {
        for (const l of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
          if (canPlaceInLine(state, targetSide, l)) { line = l; break }
        }
      }
      if (line !== null) {
        decisions.push({ type: 'play_creature', cardInstanceId: card.instanceId, targetLine: line })
      }
    }
  }

  // === PLAY: przygoda (nigdy enhanced — oszczędza PS) ===
  const adventures = player.hand.filter((c) => c.cardData.cardType === 'adventure')
  if (adventures.length > 0) {
    const adv = adventures[0]!
    const advData = adv.cardData as any
    const myField = getAllCreaturesOnField(state, side)
    const enemies = getAllCreaturesOnField(state, oppSide)

    let targetId: string | undefined
    if (advData.adventureType === 1 && myField.length > 0) {
      targetId = myField.reduce((a, b) =>
        a.currentStats.attack + a.currentStats.defense >
        b.currentStats.attack + b.currentStats.defense ? a : b,
      ).instanceId
    } else if (enemies.length > 0) {
      targetId = enemies.reduce((a, b) =>
        a.currentStats.attack + a.currentStats.defense >
        b.currentStats.attack + b.currentStats.defense ? a : b,
      ).instanceId
    } else if (myField.length > 0) {
      targetId = myField[0]!.instanceId
    }

    decisions.push({
      type: 'play_adventure', cardInstanceId: adv.instanceId,
      targetInstanceId: targetId, useEnhanced: false,
    })
  }

  // === PLAY: aktywacja zdolności (max 1) ===
  const activatable = getAllCreaturesOnField(state, side).filter((c) => canActivateEffect(state, c))
  for (const creature of activatable) {
    const effect = getEffect((creature.cardData as any).effectId)
    if (!effect) continue
    const cost = effect.activationCost ?? 0
    if (cost > getPS(state, side)) continue
    let targetId: string | undefined
    if (effect.activationRequiresTarget) {
      const all = [
        ...getAllCreaturesOnField(state, side),
        ...getAllCreaturesOnField(state, oppSide),
      ].filter(c =>
        c.currentStats.defense > 0 &&
        (!effect.activationTargetFilter || effect.activationTargetFilter(c, creature, state)),
      )
      if (all.length === 0) continue
      targetId = all[0]!.instanceId
    }
    decisions.push({ type: 'activate_effect', cardInstanceId: creature.instanceId, targetInstanceId: targetId })
    break
  }

  // === COMBAT: pozycje (proste: DEF≤2 → obrona) ===
  for (const c of getAllCreaturesOnField(state, side)) {
    const target = c.currentStats.defense <= 2 ? CardPosition.DEFENSE : CardPosition.ATTACK
    if (c.position !== target) {
      decisions.push({ type: 'change_position', cardInstanceId: c.instanceId, targetPosition: target })
    }
  }

  // === COMBAT: atak (zabij najsłabszego → potem najsłabszy DEF) ===
  const attackers = getAllCreaturesOnField(state, side)
    .filter(c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack)
  const enemies = getAllCreaturesOnField(state, oppSide).filter(c => c.owner !== side)

  for (const attacker of attackers) {
    const validTargets = enemies.filter(e => canAttack(state, attacker, e).valid)
    if (validTargets.length === 0) continue
    const target = validTargets.find(t => t.currentStats.defense <= attacker.currentStats.attack)
      ?? validTargets.reduce((a, b) => a.currentStats.defense < b.currentStats.defense ? a : b)
    decisions.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: target.instanceId })
    break
  }

  // === PLUNDER ===
  if (state.roundNumber >= 3 && getAllCreaturesOnField(state, oppSide).length === 0) {
    decisions.push({ type: 'plunder' })
  }

  decisions.push({ type: 'end_turn' })
  return decisions
}

// ===================================================================
// ROLLOUT
// ===================================================================

export function rollout(
  engine: GameEngine,
  startState: GameState,
  ourSide: PlayerSide,
  depthLimit: number,
  heuristicWeight: number,
): RolloutResult {
  engine.loadState(startState)
  let state = engine.getState()
  let depth = 0
  const playedMoveKeys: string[] = []

  while (!state.winner && depth < depthLimit) {
    depth++
    const currentSide = state.currentTurn
    const isOurTurn = currentSide === ourSide

    try {
      if (state.currentPhase === GamePhase.START) state = engine.sideAdvancePhase(currentSide)
    } catch { break }

    const decisions = planRolloutTurn(engine.getState(), currentSide)

    const playActions = decisions.filter(d =>
      d.type === 'play_creature' || d.type === 'play_adventure' ||
      d.type === 'change_position' || d.type === 'activate_effect')
    const combatActions = decisions.filter(d => d.type === 'attack')
    const wantsPlunder = decisions.some(d => d.type === 'plunder')

    for (const d of playActions) {
      if (state.winner) break
      try {
        switch (d.type) {
          case 'play_creature':
            if (d.cardInstanceId && d.targetLine !== undefined) {
              state = engine.sidePlayCreature(currentSide, d.cardInstanceId, d.targetLine, undefined, true)
              if (isOurTurn) playedMoveKeys.push(moveKey({ type: 'play_creature', cardInstanceId: d.cardInstanceId, targetLine: d.targetLine }))
            }
            break
          case 'play_adventure':
            if (d.cardInstanceId) {
              state = engine.sidePlayAdventure(currentSide, d.cardInstanceId, d.targetInstanceId, d.useEnhanced ?? false, true)
              if (isOurTurn) playedMoveKeys.push(moveKey({ type: 'play_adventure', cardInstanceId: d.cardInstanceId, targetInstanceId: d.targetInstanceId, useEnhanced: d.useEnhanced }))
            }
            break
          case 'change_position':
            if (d.cardInstanceId && d.targetPosition !== undefined)
              state = engine.sideChangePosition(currentSide, d.cardInstanceId, d.targetPosition)
            break
          case 'activate_effect':
            if (d.cardInstanceId) {
              state = engine.sideActivateEffect(currentSide, d.cardInstanceId, d.targetInstanceId)
              if (isOurTurn) playedMoveKeys.push(moveKey({ type: 'activate_effect', cardInstanceId: d.cardInstanceId, targetInstanceId: d.targetInstanceId }))
            }
            break
        }
      } catch {}
      autoResolve(engine)
      state = engine.getState()
    }

    if (combatActions.length > 0 && !state.winner) {
      try { if (state.currentPhase === GamePhase.PLAY) state = engine.sideAdvancePhase(currentSide) } catch {}
      for (const d of combatActions) {
        if (state.winner) break
        try {
          if (d.cardInstanceId && d.targetInstanceId) {
            state = engine.sideAttack(currentSide, d.cardInstanceId, d.targetInstanceId)
            engine.lastCombatResult = null
            if (isOurTurn) playedMoveKeys.push(moveKey({ type: 'attack', cardInstanceId: d.cardInstanceId, targetInstanceId: d.targetInstanceId }))
          }
        } catch {}
        autoResolve(engine)
        state = engine.getState()
      }
    }

    if (wantsPlunder && !state.winner) {
      try { state = engine.sidePlunder(currentSide); if (isOurTurn) playedMoveKeys.push(moveKey({ type: 'plunder' })) } catch {}
    }

    if (!state.winner) {
      try { state = engine.sideEndTurn(currentSide) }
      catch { try { state = engine.forcePlayerTurn(getOpponentSide(currentSide)) } catch { break } }
    }
    state = engine.getState()
  }

  if (state.winner) return { value: state.winner === ourSide ? 1.0 : 0.0, depth, playedMoveKeys }
  const heuristic = evaluate(state, ourSide)
  return { value: heuristicWeight * heuristic + (1 - heuristicWeight) * 0.5, depth, playedMoveKeys }
}

function autoResolve(engine: GameEngine): void {
  let guard = 0
  let state = engine.getState()
  while (state.pendingInteraction && guard++ < 10) {
    try {
      const choices = state.pendingInteraction.availableChoices
      const targets = state.pendingInteraction.availableTargetIds
      engine.resolvePendingInteraction(choices?.[0] ?? targets?.[0] ?? 'yes')
      engine.lastCombatResult = null
      state = engine.getState()
    } catch { break }
  }
}
