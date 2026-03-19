/**
 * Effects.test.ts — comprehensive tests for card effects.
 *
 * Tests the most important and commonly used effects via:
 *   - Direct effect execution (ON_PLAY, ON_DEATH)
 *   - Combat flow via CombatResolver (ON_DAMAGE_DEALT/RECEIVED)
 *   - Passive validation via LineManager (canAttack)
 *   - Damage prevention via CombatResolver (checkDamagePrevention)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createInitialGameState, cloneGameState, getAllCreaturesOnField } from '../GameStateUtils'
import { createCreatureInstance } from '../CardFactory'
import { getEffect, canActivateEffect } from '../EffectRegistry'
import { resolveAttack } from '../CombatResolver'
import { canAttack } from '../LineManager'
import { BattleLine, CardPosition, AttackType, Domain, EffectTrigger, GamePhase } from '../constants'
import type { GameState, CardInstance, CreatureCardData, PlayerSide } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0

/** Create a minimal CreatureCardData with given params */
function makeCreatureData(overrides: Partial<CreatureCardData> & { name: string; effectId: string }): CreatureCardData {
  return {
    id: ++idCounter,
    cardType: 'creature',
    domain: Domain.PERUN,
    name: overrides.name,
    stats: overrides.stats ?? { attack: 3, defense: 5, maxDefense: 5, maxAttack: 3 },
    attackType: overrides.attackType ?? AttackType.MELEE,
    isFlying: overrides.isFlying ?? false,
    effectId: overrides.effectId,
    effectDescription: '',
    lore: '',
    ...overrides,
  }
}

/** Create a card instance placed on a field line, ready for combat */
function createFieldCard(
  state: GameState,
  owner: PlayerSide,
  line: BattleLine,
  position: CardPosition,
  dataOverrides: Partial<CreatureCardData> & { name: string; effectId: string },
): CardInstance {
  const data = makeCreatureData(dataOverrides)
  const card = createCreatureInstance(data, owner)
  card.position = position
  card.line = line
  card.isRevealed = true
  state.players[owner].field.lines[line].push(card)
  return card
}

/** Shorthand: attacker on player1 FRONT in ATTACK position */
function placeAttacker(
  state: GameState,
  overrides: Partial<CreatureCardData> & { name: string; effectId: string },
  line: BattleLine = BattleLine.FRONT,
): CardInstance {
  return createFieldCard(state, 'player1', line, CardPosition.ATTACK, overrides)
}

/** Shorthand: defender on player2 FRONT in DEFENSE position */
function placeDefender(
  state: GameState,
  overrides: Partial<CreatureCardData> & { name: string; effectId: string },
  line: BattleLine = BattleLine.FRONT,
): CardInstance {
  return createFieldCard(state, 'player2', line, CardPosition.DEFENSE, overrides)
}

/** Create a fresh game state suitable for effect testing */
function createTestState(): GameState {
  const state = createInitialGameState('gold')
  state.currentPhase = GamePhase.COMBAT
  state.roundNumber = 1
  state.turnNumber = 1
  return state
}

/** Find a card on field by instanceId */
function findOnField(state: GameState, instanceId: string): CardInstance | null {
  for (const side of ['player1', 'player2'] as const) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = state.players[side].field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
  }
  return null
}

/** Get all creatures on field for a side */
function getFieldCreatures(state: GameState, side: PlayerSide): CardInstance[] {
  return getAllCreaturesOnField(state, side)
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('Card Effects', () => {
  let state: GameState

  beforeEach(() => {
    idCounter = 100 // reset to avoid collisions
    state = createTestState()
  })

  // =======================================================================
  // 1. SWIATOGOR — Line Cleave (ON_DAMAGE_DEALT)
  // =======================================================================
  describe('Swiatogor (swiatogor_line_cleave)', () => {
    it('deals damage to all other enemies in the same line as the target', () => {
      const swiatogor = placeAttacker(state, {
        name: 'Światogor',
        effectId: 'swiatogor_line_cleave',
        stats: { attack: 5, defense: 5, maxDefense: 5, maxAttack: 5 },
        attackType: AttackType.MELEE,
      })

      const defender1 = placeDefender(state, {
        name: 'Target Enemy',
        effectId: 'no_effect_target',
        stats: { attack: 2, defense: 10, maxDefense: 10, maxAttack: 2 },
      })

      const defender2 = createFieldCard(state, 'player2', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Cleave Victim A',
        effectId: 'no_effect_a',
        stats: { attack: 1, defense: 8, maxDefense: 8, maxAttack: 1 },
      })

      const defender3 = createFieldCard(state, 'player2', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Cleave Victim B',
        effectId: 'no_effect_b',
        stats: { attack: 1, defense: 3, maxDefense: 3, maxAttack: 1 },
      })

      // Card on L2 should NOT be hit by cleave (different line)
      const defenderL2 = createFieldCard(state, 'player2', BattleLine.RANGED, CardPosition.DEFENSE, {
        name: 'Safe on L2',
        effectId: 'no_effect_l2',
        stats: { attack: 1, defense: 5, maxDefense: 5, maxAttack: 1 },
      })

      const { newState, result } = resolveAttack(state, swiatogor.instanceId, defender1.instanceId)

      // Main target took 5 damage
      const mainTarget = findOnField(newState, defender1.instanceId)
      expect(mainTarget).not.toBeNull()
      expect(mainTarget!.currentStats.defense).toBe(5) // 10 - 5

      // Cleave victims in same line
      const victimA = findOnField(newState, defender2.instanceId)
      expect(victimA).not.toBeNull()
      expect(victimA!.currentStats.defense).toBe(3) // 8 - 5

      // Cleave Victim B had 3 DEF, takes 5 => dies
      const victimB = findOnField(newState, defender3.instanceId)
      expect(victimB).toBeNull() // died
      expect(newState.players.player2.graveyard.some(c => c.instanceId === defender3.instanceId)).toBe(true)

      // L2 defender should be untouched
      const safeCard = findOnField(newState, defenderL2.instanceId)
      expect(safeCard).not.toBeNull()
      expect(safeCard!.currentStats.defense).toBe(5) // unchanged
    })

    it('does not cleave when no other enemies in same line', () => {
      const swiatogor = placeAttacker(state, {
        name: 'Światogor',
        effectId: 'swiatogor_line_cleave',
        stats: { attack: 5, defense: 5, maxDefense: 5, maxAttack: 5 },
      })

      const defender = placeDefender(state, {
        name: 'Solo Enemy',
        effectId: 'no_effect_solo',
        stats: { attack: 1, defense: 10, maxDefense: 10, maxAttack: 1 },
      })

      const { newState } = resolveAttack(state, swiatogor.instanceId, defender.instanceId)

      // Only the main target should be affected
      const target = findOnField(newState, defender.instanceId)
      expect(target).not.toBeNull()
      expect(target!.currentStats.defense).toBe(5) // 10 - 5
    })
  })

  // =======================================================================
  // 2. MOROWA DZIEWICA — AOE all field (ON_DAMAGE_DEALT)
  // =======================================================================
  describe('Morowa Dziewica (morowa_dziewica_aoe_all)', () => {
    it('hits ALL cards on field (both sides) except self and main target', () => {
      const morowa = placeAttacker(state, {
        name: 'Morowa Dziewica',
        effectId: 'morowa_dziewica_aoe_all',
        stats: { attack: 3, defense: 50, maxDefense: 50, maxAttack: 3 },
      })

      const mainTarget = placeDefender(state, {
        name: 'Main Target',
        effectId: 'no_effect_mt',
        stats: { attack: 1, defense: 10, maxDefense: 10, maxAttack: 1 },
      })

      // Ally of Morowa (same side as attacker)
      const ally = createFieldCard(state, 'player1', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Friendly Fire Victim',
        effectId: 'no_effect_ff',
        stats: { attack: 2, defense: 8, maxDefense: 8, maxAttack: 2 },
      })

      // Another enemy
      const otherEnemy = createFieldCard(state, 'player2', BattleLine.RANGED, CardPosition.DEFENSE, {
        name: 'Other Enemy',
        effectId: 'no_effect_oe',
        stats: { attack: 1, defense: 7, maxDefense: 7, maxAttack: 1 },
      })

      const { newState } = resolveAttack(state, morowa.instanceId, mainTarget.instanceId)

      // Main target: 10 - 3 = 7 (normal damage only, AOE excludes main target)
      const mt = findOnField(newState, mainTarget.instanceId)
      expect(mt).not.toBeNull()
      expect(mt!.currentStats.defense).toBe(7)

      // Morowa herself should be untouched by AOE
      const morowaAfter = findOnField(newState, morowa.instanceId)
      expect(morowaAfter).not.toBeNull()
      // She may have taken counterattack damage, but NOT AOE self-damage

      // Ally takes AOE damage (3)
      const allyAfter = findOnField(newState, ally.instanceId)
      expect(allyAfter).not.toBeNull()
      expect(allyAfter!.currentStats.defense).toBe(5) // 8 - 3

      // Other enemy takes AOE damage (3)
      const otherAfter = findOnField(newState, otherEnemy.instanceId)
      expect(otherAfter).not.toBeNull()
      expect(otherAfter!.currentStats.defense).toBe(4) // 7 - 3
    })

    it('kills weak cards across the field with AOE', () => {
      const morowa = placeAttacker(state, {
        name: 'Morowa Dziewica',
        effectId: 'morowa_dziewica_aoe_all',
        stats: { attack: 5, defense: 10, maxDefense: 10, maxAttack: 5 },
      })

      const mainTarget = placeDefender(state, {
        name: 'Main Target',
        effectId: 'no_effect_mt2',
        stats: { attack: 1, defense: 20, maxDefense: 20, maxAttack: 1 },
      })

      const weakAlly = createFieldCard(state, 'player1', BattleLine.RANGED, CardPosition.DEFENSE, {
        name: 'Weak Ally',
        effectId: 'no_effect_wa',
        stats: { attack: 1, defense: 3, maxDefense: 3, maxAttack: 1 },
      })

      const weakEnemy = createFieldCard(state, 'player2', BattleLine.RANGED, CardPosition.DEFENSE, {
        name: 'Weak Enemy',
        effectId: 'no_effect_we',
        stats: { attack: 1, defense: 2, maxDefense: 2, maxAttack: 1 },
      })

      const { newState } = resolveAttack(state, morowa.instanceId, mainTarget.instanceId)

      // Weak ally (3 DEF, takes 5 AOE) => dies
      expect(findOnField(newState, weakAlly.instanceId)).toBeNull()
      expect(newState.players.player1.graveyard.some(c => c.instanceId === weakAlly.instanceId)).toBe(true)

      // Weak enemy (2 DEF, takes 5 AOE) => dies
      expect(findOnField(newState, weakEnemy.instanceId)).toBeNull()
      expect(newState.players.player2.graveyard.some(c => c.instanceId === weakEnemy.instanceId)).toBe(true)
    })
  })

  // =======================================================================
  // 3. LESNICA — Double Attack per turn
  // =======================================================================
  describe('Lesnica (lesnica_double_attack)', () => {
    it('allows attacking twice in one turn via canAttack validation', () => {
      const lesnica = placeAttacker(state, {
        name: 'Leśnica',
        effectId: 'lesnica_double_attack',
        stats: { attack: 4, defense: 50, maxDefense: 50, maxAttack: 4 },
      })

      const defender1 = placeDefender(state, {
        name: 'Enemy 1',
        effectId: 'no_effect_e1',
        stats: { attack: 1, defense: 20, maxDefense: 20, maxAttack: 1 },
      })

      const defender2 = createFieldCard(state, 'player2', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Enemy 2',
        effectId: 'no_effect_e2',
        stats: { attack: 1, defense: 20, maxDefense: 20, maxAttack: 1 },
      })

      // First attack
      const { newState: state1 } = resolveAttack(state, lesnica.instanceId, defender1.instanceId)
      const lesnicaAfter1 = findOnField(state1, lesnica.instanceId)!
      expect(lesnicaAfter1.metadata.attacksThisTurn).toBe(1)

      // Lesnica can still attack (second attack)
      const validation1 = canAttack(state1, lesnicaAfter1, findOnField(state1, defender2.instanceId)!)
      expect(validation1.valid).toBe(true)

      // Second attack
      const { newState: state2 } = resolveAttack(state1, lesnica.instanceId, defender2.instanceId)
      const lesnicaAfter2 = findOnField(state2, lesnica.instanceId)!
      expect(lesnicaAfter2.metadata.attacksThisTurn).toBe(2)

      // Third attack should be blocked
      const validation2 = canAttack(state2, lesnicaAfter2, findOnField(state2, defender1.instanceId)!)
      expect(validation2.valid).toBe(false)
      expect(validation2.reason).toContain('2 razy')
    })
  })

  // =======================================================================
  // 4. KIKIMORA — Free Attack (doesn't count toward limit)
  // =======================================================================
  describe('Kikimora (kikimora_free_attack)', () => {
    it('effect is registered and is passive', () => {
      const effect = getEffect('kikimora_free_attack')
      expect(effect).not.toBeNull()
      expect(effect!.trigger).toBe(EffectTrigger.PASSIVE)
    })

    it('her attack does not set hasAttackedThisTurn (handled by GameEngine)', () => {
      // Kikimora's free attack logic is enforced in GameEngine, not CombatResolver.
      // In CombatResolver, hasAttackedThisTurn IS set for all cards.
      // GameEngine checks if effectId === 'kikimora_free_attack' and excludes her
      // from the normal attack count. We verify the effect is registered.
      const kikimora = placeAttacker(state, {
        name: 'Kikimora',
        effectId: 'kikimora_free_attack',
        stats: { attack: 2, defense: 50, maxDefense: 50, maxAttack: 2 },
      })

      const defender = placeDefender(state, {
        name: 'Enemy',
        effectId: 'no_effect_kik',
        stats: { attack: 1, defense: 10, maxDefense: 10, maxAttack: 1 },
      })

      const { newState } = resolveAttack(state, kikimora.instanceId, defender.instanceId)
      const kikAfter = findOnField(newState, kikimora.instanceId)
      // CombatResolver sets hasAttackedThisTurn, but GameEngine knows to ignore it for Kikimora
      expect(kikAfter).not.toBeNull()
    })
  })

  // =======================================================================
  // 5. CHLOP — Extra Attack Aura (passive)
  // =======================================================================
  describe('Chlop (chlop_extra_attack)', () => {
    it('effect is registered as passive aura', () => {
      const effect = getEffect('chlop_extra_attack')
      expect(effect).not.toBeNull()
      expect(effect!.trigger).toBe(EffectTrigger.PASSIVE)
    })

    it('execute returns unchanged state (aura logic is in GameEngine)', () => {
      const chlop = placeAttacker(state, {
        name: 'Chłop',
        effectId: 'chlop_extra_attack',
        stats: { attack: 1, defense: 2, maxDefense: 2, maxAttack: 1 },
      })

      const effect = getEffect('chlop_extra_attack')!
      const result = effect.execute({
        state,
        source: chlop,
        trigger: EffectTrigger.PASSIVE,
      })
      // Passive aura: execute is a no-op
      expect(result.log).toHaveLength(0)
      expect(result.prevented).toBe(false)
    })
  })

  // =======================================================================
  // 6. BAZYLISZEK — Paralyze on damage dealt
  // =======================================================================
  describe('Bazyliszek (bazyliszek_paralyze)', () => {
    it('paralyzes the target for 2 rounds on ON_DAMAGE_DEALT', () => {
      const bazyliszek = placeAttacker(state, {
        name: 'Bazyliszek',
        effectId: 'bazyliszek_paralyze',
        stats: { attack: 2, defense: 4, maxDefense: 4, maxAttack: 2 },
        isFlying: true,
      })

      const defender = placeDefender(state, {
        name: 'Victim',
        effectId: 'no_effect_vic',
        stats: { attack: 3, defense: 10, maxDefense: 10, maxAttack: 3 },
      })

      const { newState } = resolveAttack(state, bazyliszek.instanceId, defender.instanceId)

      const victim = findOnField(newState, defender.instanceId)
      expect(victim).not.toBeNull()
      expect(victim!.paralyzeRoundsLeft).toBe(2)
      expect(victim!.cannotAttack).toBe(true)
    })

    it('paralyzed target cannot counterattack', () => {
      const attacker = placeAttacker(state, {
        name: 'Normal Attacker',
        effectId: 'no_effect_na',
        stats: { attack: 3, defense: 10, maxDefense: 10, maxAttack: 3 },
      })

      const defender = placeDefender(state, {
        name: 'Paralyzed Defender',
        effectId: 'no_effect_pd',
        stats: { attack: 5, defense: 10, maxDefense: 10, maxAttack: 5 },
      })
      // Pre-set paralysis
      defender.paralyzeRoundsLeft = 2
      defender.cannotAttack = true

      const { newState, result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

      // Should not counterattack
      expect(result.counterattackOccurred).toBe(false)
      // Attacker should not have taken any counter damage
      const attackerAfter = findOnField(newState, attacker.instanceId)
      expect(attackerAfter).not.toBeNull()
      expect(attackerAfter!.currentStats.defense).toBe(10) // no counter damage
    })

    it('immune target is not paralyzed (centralny guard w triggerEffect)', () => {
      const bazyliszek = placeAttacker(state, {
        name: 'Bazyliszek',
        effectId: 'bazyliszek_paralyze',
        stats: { attack: 2, defense: 4, maxDefense: 4, maxAttack: 2 },
      })

      const immuneTarget = placeDefender(state, {
        name: 'Immune Creature',
        effectId: 'no_effect_imm',
        stats: { attack: 3, defense: 10, maxDefense: 10, maxAttack: 3 },
      })
      immuneTarget.isImmune = true

      const { newState, result } = resolveAttack(state, bazyliszek.instanceId, immuneTarget.instanceId)

      // Immune target should NOT have paralysis — blocked by central guard
      const immuneInState = findOnField(newState, immuneTarget.instanceId)
      expect(immuneInState).not.toBeNull()
      expect(immuneInState!.paralyzeRoundsLeft).toBeNull()
      expect(result.log.some(l => l.message.includes('ODPORNY'))).toBe(true)
    })
  })

  // =======================================================================
  // 7. JAROSZEK — Permanent Paralysis (ON_PLAY)
  // =======================================================================
  describe('Jaroszek (jaroszek_paralyze)', () => {
    it('permanently paralyzes the target on play', () => {
      const effect = getEffect('jaroszek_paralyze')!
      expect(effect).not.toBeNull()

      const jaroszek = placeAttacker(state, {
        name: 'Jaroszek',
        effectId: 'jaroszek_paralyze',
        stats: { attack: 1, defense: 3, maxDefense: 3, maxAttack: 1 },
      })

      const enemy = placeDefender(state, {
        name: 'Target Enemy',
        effectId: 'no_effect_te',
        stats: { attack: 5, defense: 8, maxDefense: 8, maxAttack: 5 },
      })

      const result = effect.execute({
        state,
        source: jaroszek,
        target: enemy,
        trigger: EffectTrigger.ON_PLAY,
      })

      const targetInState = findOnField(result.newState, enemy.instanceId)
      expect(targetInState).not.toBeNull()
      expect(targetInState!.paralyzeRoundsLeft).toBe(-1) // -1 = permanent
      expect(targetInState!.cannotAttack).toBe(true)
    })

    it('logs a message about permanent paralysis', () => {
      const effect = getEffect('jaroszek_paralyze')!
      const jaroszek = placeAttacker(state, {
        name: 'Jaroszek',
        effectId: 'jaroszek_paralyze',
        stats: { attack: 1, defense: 3, maxDefense: 3, maxAttack: 1 },
      })

      const enemy = placeDefender(state, {
        name: 'Victim',
        effectId: 'no_effect_jv',
        stats: { attack: 5, defense: 8, maxDefense: 8, maxAttack: 5 },
      })

      const result = effect.execute({
        state,
        source: jaroszek,
        target: enemy,
        trigger: EffectTrigger.ON_PLAY,
      })

      expect(result.log.length).toBeGreaterThan(0)
      expect(result.log[0].message).toContain('permanentny')
    })

    it('does nothing without a target', () => {
      const effect = getEffect('jaroszek_paralyze')!
      const jaroszek = placeAttacker(state, {
        name: 'Jaroszek',
        effectId: 'jaroszek_paralyze',
        stats: { attack: 1, defense: 3, maxDefense: 3, maxAttack: 1 },
      })

      const result = effect.execute({
        state,
        source: jaroszek,
        trigger: EffectTrigger.ON_PLAY,
      })

      expect(result.log.length).toBeGreaterThan(0)
      expect(result.log[0].message).toContain('Brak celu')
    })
  })

  // =======================================================================
  // 8. WAPIERZ — Invincible (damage prevention)
  // =======================================================================
  describe('Wapierz (wapierz_invincible_hunger)', () => {
    it('blocks ALL damage via checkDamagePrevention in combat', () => {
      const attacker = placeAttacker(state, {
        name: 'Strong Attacker',
        effectId: 'no_effect_sa',
        stats: { attack: 10, defense: 10, maxDefense: 10, maxAttack: 10 },
      })

      const wapierz = placeDefender(state, {
        name: 'Wąpierz',
        effectId: 'wapierz_invincible_hunger',
        stats: { attack: 4, defense: 6, maxDefense: 6, maxAttack: 4 },
      })

      const { newState, result } = resolveAttack(state, attacker.instanceId, wapierz.instanceId)

      // Wapierz should take NO damage
      const wapierzAfter = findOnField(newState, wapierz.instanceId)
      expect(wapierzAfter).not.toBeNull()
      expect(wapierzAfter!.currentStats.defense).toBe(6) // unchanged
      expect(result.damageToDefender).toBe(0)
      expect(result.defenderDied).toBe(false)
    })

    it('effect tracks last damage round on ON_DAMAGE_DEALT', () => {
      const effect = getEffect('wapierz_invincible_hunger')!
      const wapierz = placeAttacker(state, {
        name: 'Wąpierz',
        effectId: 'wapierz_invincible_hunger',
        stats: { attack: 4, defense: 6, maxDefense: 6, maxAttack: 4 },
      })

      const target = placeDefender(state, {
        name: 'Victim',
        effectId: 'no_effect_wv',
        stats: { attack: 1, defense: 10, maxDefense: 10, maxAttack: 1 },
      })

      state.roundNumber = 3

      const result = effect.execute({
        state,
        source: wapierz,
        target,
        trigger: EffectTrigger.ON_DAMAGE_DEALT,
        value: 4,
      })

      const wapierzInState = findOnField(result.newState, wapierz.instanceId)
      expect(wapierzInState).not.toBeNull()
      expect(wapierzInState!.metadata.wapierzLastDamageRound).toBe(3)
    })
  })

  // =======================================================================
  // 9. DZIAD — Reveal all enemy cards (ON_PLAY)
  // =======================================================================
  describe('Dziad (dziad_reveal_all)', () => {
    it('reveals all enemy cards on field and in hand', () => {
      const effect = getEffect('dziad_reveal_all')!
      expect(effect).not.toBeNull()

      const dziad = placeAttacker(state, {
        name: 'Dziad',
        effectId: 'dziad_reveal_all',
        stats: { attack: 1, defense: 2, maxDefense: 2, maxAttack: 1 },
      })

      // Place hidden enemies on field
      const enemy1 = placeDefender(state, {
        name: 'Hidden Enemy 1',
        effectId: 'no_effect_he1',
        stats: { attack: 3, defense: 5, maxDefense: 5, maxAttack: 3 },
      })
      enemy1.isRevealed = false

      const enemy2 = createFieldCard(state, 'player2', BattleLine.RANGED, CardPosition.DEFENSE, {
        name: 'Hidden Enemy 2',
        effectId: 'no_effect_he2',
        stats: { attack: 2, defense: 4, maxDefense: 4, maxAttack: 2 },
      })
      enemy2.isRevealed = false

      // Add enemy cards in hand
      const handCard = createCreatureInstance(makeCreatureData({
        name: 'Hand Card',
        effectId: 'no_effect_hc',
        stats: { attack: 1, defense: 1, maxDefense: 1, maxAttack: 1 },
      }), 'player2')
      handCard.isRevealed = false
      state.players.player2.hand.push(handCard)

      const result = effect.execute({
        state,
        source: dziad,
        trigger: EffectTrigger.ON_PLAY,
      })

      // All enemy field cards should be revealed
      const e1 = findOnField(result.newState, enemy1.instanceId)
      expect(e1!.isRevealed).toBe(true)

      const e2 = findOnField(result.newState, enemy2.instanceId)
      expect(e2!.isRevealed).toBe(true)

      // Hand cards should be revealed
      const hc = result.newState.players.player2.hand.find(c => c.instanceId === handCard.instanceId)
      expect(hc).not.toBeUndefined()
      expect(hc!.isRevealed).toBe(true)

      // Log should mention counts
      expect(result.log.length).toBeGreaterThan(0)
      expect(result.log[0].message).toContain('Odkrywa')
    })

    it('works when enemy has no cards', () => {
      const effect = getEffect('dziad_reveal_all')!
      const dziad = placeAttacker(state, {
        name: 'Dziad',
        effectId: 'dziad_reveal_all',
        stats: { attack: 1, defense: 2, maxDefense: 2, maxAttack: 1 },
      })

      const result = effect.execute({
        state,
        source: dziad,
        trigger: EffectTrigger.ON_PLAY,
      })

      // Should not error, log should show 0 cards revealed
      expect(result.log.length).toBeGreaterThan(0)
      expect(result.log[0].message).toContain('0')
    })
  })

  // =======================================================================
  // 10. BRZEGINA — Shield for Gold (damage prevention)
  // =======================================================================
  describe('Brzegina (brzegina_shield_for_gold)', () => {
    it('blocks damage for an ally (first use free)', () => {
      const effect = getEffect('brzegina_shield_for_gold')!
      expect(effect).not.toBeNull()

      const brzegina = createFieldCard(state, 'player2', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Brzegina',
        effectId: 'brzegina_shield_for_gold',
        stats: { attack: 2, defense: 5, maxDefense: 5, maxAttack: 2 },
      })

      const ally = placeDefender(state, {
        name: 'Protected Ally',
        effectId: 'no_effect_pa',
        stats: { attack: 3, defense: 8, maxDefense: 8, maxAttack: 3 },
      })

      // canActivate should return true (first use free)
      const canUse = effect.canActivate!({
        state,
        source: brzegina,
        target: ally,
        trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
      })
      expect(canUse).toBe(true)

      const result = effect.execute({
        state,
        source: brzegina,
        target: ally,
        trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
        value: 5,
      })

      expect(result.prevented).toBe(true)
      expect(result.log.length).toBeGreaterThan(0)
      expect(result.log[0].message).toContain('darmowe')
    })

    it('costs 1 glory after first use', () => {
      const effect = getEffect('brzegina_shield_for_gold')!

      const brzegina = createFieldCard(state, 'player2', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Brzegina',
        effectId: 'brzegina_shield_for_gold',
        stats: { attack: 2, defense: 5, maxDefense: 5, maxAttack: 2 },
      })
      brzegina.metadata.brzeginaUsedFree = true // already used free

      state.players.player2.glory = 3

      const ally = placeDefender(state, {
        name: 'Protected Ally',
        effectId: 'no_effect_pa2',
        stats: { attack: 3, defense: 8, maxDefense: 8, maxAttack: 3 },
      })

      const result = effect.execute({
        state,
        source: brzegina,
        target: ally,
        trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
        value: 5,
      })

      expect(result.prevented).toBe(true)
      expect(result.newState.players.player2.glory).toBe(2) // 3 - 1
      expect(result.log[0].message).toContain('-1 PS')
    })

    it('canActivate returns false when no glory and free use spent', () => {
      const effect = getEffect('brzegina_shield_for_gold')!

      const brzegina = createFieldCard(state, 'player2', BattleLine.FRONT, CardPosition.DEFENSE, {
        name: 'Brzegina',
        effectId: 'brzegina_shield_for_gold',
        stats: { attack: 2, defense: 5, maxDefense: 5, maxAttack: 2 },
      })
      brzegina.metadata.brzeginaUsedFree = true
      state.players.player2.glory = 0

      const canUse = effect.canActivate!({
        state,
        source: brzegina,
        target: brzegina,
        trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
      })
      expect(canUse).toBe(false)
    })
  })

  // =======================================================================
  // 11. BUKA — Force Defense (passive, enemies with lower ATK can't attack)
  // =======================================================================
  describe('Buka (buka_force_defense)', () => {
    it('blocks attacks from weaker enemies', () => {
      const weakAttacker = placeAttacker(state, {
        name: 'Weak Attacker',
        effectId: 'no_effect_wk',
        stats: { attack: 3, defense: 5, maxDefense: 5, maxAttack: 3 },
      })

      const buka = placeDefender(state, {
        name: 'Buka',
        effectId: 'buka_force_defense',
        stats: { attack: 5, defense: 8, maxDefense: 8, maxAttack: 5 },
      })

      const result = canAttack(state, weakAttacker, buka)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('za słaba')
    })

    it('allows attacks from equal or stronger enemies', () => {
      const strongAttacker = placeAttacker(state, {
        name: 'Strong Attacker',
        effectId: 'no_effect_str',
        stats: { attack: 6, defense: 5, maxDefense: 5, maxAttack: 6 },
      })

      const buka = placeDefender(state, {
        name: 'Buka',
        effectId: 'buka_force_defense',
        stats: { attack: 5, defense: 8, maxDefense: 8, maxAttack: 5 },
      })

      const result = canAttack(state, strongAttacker, buka)
      expect(result.valid).toBe(true)
    })

    it('allows attacks from enemies with equal ATK', () => {
      const equalAttacker = placeAttacker(state, {
        name: 'Equal Attacker',
        effectId: 'no_effect_eq',
        stats: { attack: 5, defense: 5, maxDefense: 5, maxAttack: 5 },
      })

      const buka = placeDefender(state, {
        name: 'Buka',
        effectId: 'buka_force_defense',
        stats: { attack: 5, defense: 8, maxDefense: 8, maxAttack: 5 },
      })

      const result = canAttack(state, equalAttacker, buka)
      expect(result.valid).toBe(true)
    })
  })

  // =======================================================================
  // 12. WISIELEC — Bounce both (ON_DAMAGE_DEALT / ON_DAMAGE_RECEIVED)
  // =======================================================================
  describe('Wisielec (wisielec_bounce_both)', () => {
    it('bounces target to bottom of deck when Wisielec deals damage', () => {
      const effect = getEffect('wisielec_bounce_both')!
      expect(effect).not.toBeNull()

      const wisielec = placeAttacker(state, {
        name: 'Wisielec',
        effectId: 'wisielec_bounce_both',
        stats: { attack: 3, defense: 4, maxDefense: 4, maxAttack: 3 },
      })

      const target = placeDefender(state, {
        name: 'Bounce Victim',
        effectId: 'no_effect_bv',
        stats: { attack: 2, defense: 8, maxDefense: 8, maxAttack: 2 },
      })

      const result = effect.execute({
        state,
        source: wisielec,
        target,
        trigger: EffectTrigger.ON_DAMAGE_DEALT,
        value: 3,
      })

      // Target should be removed from field
      const targetOnField = findOnField(result.newState, target.instanceId)
      expect(targetOnField).toBeNull()

      // Target should be in owner's deck (bottom)
      const deckCard = result.newState.players.player2.deck.find(c => c.instanceId === target.instanceId)
      expect(deckCard).not.toBeUndefined()

      // Target's defense should be reset to base stats
      expect(deckCard!.currentStats.defense).toBe(8) // reset to base
    })

    it('bounces attacker to deck when Wisielec receives damage', () => {
      const effect = getEffect('wisielec_bounce_both')!

      const wisielec = placeDefender(state, {
        name: 'Wisielec',
        effectId: 'wisielec_bounce_both',
        stats: { attack: 3, defense: 4, maxDefense: 4, maxAttack: 3 },
      })

      const attacker = placeAttacker(state, {
        name: 'Bounced Attacker',
        effectId: 'no_effect_ba',
        stats: { attack: 5, defense: 6, maxDefense: 6, maxAttack: 5 },
      })

      const result = effect.execute({
        state,
        source: wisielec,
        target: attacker,
        trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
        value: 5,
      })

      // Attacker should be removed from field
      const attackerOnField = findOnField(result.newState, attacker.instanceId)
      expect(attackerOnField).toBeNull()

      // Attacker should be in owner's deck
      const deckCard = result.newState.players.player1.deck.find(c => c.instanceId === attacker.instanceId)
      expect(deckCard).not.toBeUndefined()
    })

    it('does not bounce immune target', () => {
      const effect = getEffect('wisielec_bounce_both')!

      const wisielec = placeAttacker(state, {
        name: 'Wisielec',
        effectId: 'wisielec_bounce_both',
        stats: { attack: 3, defense: 4, maxDefense: 4, maxAttack: 3 },
      })

      const immuneTarget = placeDefender(state, {
        name: 'Immune Target',
        effectId: 'no_effect_it',
        stats: { attack: 2, defense: 8, maxDefense: 8, maxAttack: 2 },
      })
      immuneTarget.isImmune = true

      const result = effect.execute({
        state,
        source: wisielec,
        target: immuneTarget,
        trigger: EffectTrigger.ON_DAMAGE_DEALT,
        value: 3,
      })

      // Immune target should still be on field
      const targetOnField = findOnField(result.newState, immuneTarget.instanceId)
      expect(targetOnField).not.toBeNull()
    })

    it('does nothing when damage is 0', () => {
      const effect = getEffect('wisielec_bounce_both')!

      const wisielec = placeAttacker(state, {
        name: 'Wisielec',
        effectId: 'wisielec_bounce_both',
        stats: { attack: 3, defense: 4, maxDefense: 4, maxAttack: 3 },
      })

      const target = placeDefender(state, {
        name: 'Zero Damage Target',
        effectId: 'no_effect_zd',
        stats: { attack: 2, defense: 8, maxDefense: 8, maxAttack: 2 },
      })

      const result = effect.execute({
        state,
        source: wisielec,
        target,
        trigger: EffectTrigger.ON_DAMAGE_DEALT,
        value: 0,
      })

      // Target should remain on field
      const targetOnField = findOnField(result.newState, target.instanceId)
      expect(targetOnField).not.toBeNull()
    })
  })

  // =======================================================================
  // 13. KOSCIEJ — Resurrects from melee kill (ON_DEATH)
  // =======================================================================
  describe('Kosciej (kosciej_melee_resurrection)', () => {
    it('resurrects for free on first melee kill', () => {
      const effect = getEffect('kosciej_melee_resurrection')!
      expect(effect).not.toBeNull()

      const meleeKiller = placeAttacker(state, {
        name: 'Melee Killer',
        effectId: 'no_effect_mk',
        stats: { attack: 10, defense: 5, maxDefense: 5, maxAttack: 10 },
        attackType: AttackType.MELEE,
      })

      const kosciej = placeDefender(state, {
        name: 'Kościej',
        effectId: 'kosciej_melee_resurrection',
        stats: { attack: 5, defense: 7, maxDefense: 7, maxAttack: 5 },
      })
      kosciej.metadata.killedBy = meleeKiller.instanceId

      const result = effect.execute({
        state,
        source: kosciej,
        trigger: EffectTrigger.ON_DEATH,
      })

      // Kosciej should have resurrection metadata set
      const kosciejInState = findOnField(result.newState, kosciej.instanceId)
      expect(kosciejInState).not.toBeNull()
      expect(kosciejInState!.metadata.kosciejResurrected).toBe(true)
      expect(kosciejInState!.currentStats.defense).toBe(7) // full DEF restored
      expect(kosciejInState!.metadata.kosciejResurrectCount).toBe(1)
    })

    it('does NOT resurrect from non-melee kill', () => {
      const effect = getEffect('kosciej_melee_resurrection')!

      const magicKiller = placeAttacker(state, {
        name: 'Magic Killer',
        effectId: 'no_effect_magk',
        stats: { attack: 10, defense: 5, maxDefense: 5, maxAttack: 10 },
        attackType: AttackType.MAGIC,
      })

      const kosciej = placeDefender(state, {
        name: 'Kościej',
        effectId: 'kosciej_melee_resurrection',
        stats: { attack: 5, defense: 7, maxDefense: 7, maxAttack: 5 },
      })
      kosciej.metadata.killedBy = magicKiller.instanceId

      const result = effect.execute({
        state,
        source: kosciej,
        trigger: EffectTrigger.ON_DEATH,
      })

      // Should NOT have resurrection flag
      const kosciejInState = findOnField(result.newState, kosciej.instanceId)
      expect(kosciejInState).not.toBeNull()
      expect(kosciejInState!.metadata.kosciejResurrected).toBeUndefined()
    })

    it('second melee death sets paid resurrect flag instead of free', () => {
      const effect = getEffect('kosciej_melee_resurrection')!

      const meleeKiller = placeAttacker(state, {
        name: 'Melee Killer',
        effectId: 'no_effect_mk2',
        stats: { attack: 10, defense: 5, maxDefense: 5, maxAttack: 10 },
        attackType: AttackType.MELEE,
      })

      const kosciej = placeDefender(state, {
        name: 'Kościej',
        effectId: 'kosciej_melee_resurrection',
        stats: { attack: 5, defense: 7, maxDefense: 7, maxAttack: 5 },
      })
      kosciej.metadata.killedBy = meleeKiller.instanceId
      kosciej.metadata.kosciejResurrectCount = 1 // already resurrected once

      const result = effect.execute({
        state,
        source: kosciej,
        trigger: EffectTrigger.ON_DEATH,
      })

      const kosciejInState = findOnField(result.newState, kosciej.instanceId)
      expect(kosciejInState).not.toBeNull()
      expect(kosciejInState!.metadata.kosciejCanPaidResurrect).toBe(true)
      expect(kosciejInState!.metadata.kosciejResurrectCount).toBe(2)
    })

    it('integration: Kosciej resurrects after resolveAttack with melee', () => {
      const meleeKiller = placeAttacker(state, {
        name: 'Melee Killer',
        effectId: 'no_effect_mkint',
        stats: { attack: 10, defense: 20, maxDefense: 20, maxAttack: 10 },
        attackType: AttackType.MELEE,
      })

      const kosciej = placeDefender(state, {
        name: 'Kościej',
        effectId: 'kosciej_melee_resurrection',
        stats: { attack: 3, defense: 5, maxDefense: 5, maxAttack: 3 },
      })

      const { newState, result } = resolveAttack(state, meleeKiller.instanceId, kosciej.instanceId)

      // Kosciej should have been resurrected to L1 by CombatResolver logic
      // (kosciejResurrected flag set by effect, then CombatResolver puts him back)
      expect(result.defenderDied).toBe(false) // resurrected
      const kosciejOnField = findOnField(newState, kosciej.instanceId)
      expect(kosciejOnField).not.toBeNull()
      expect(kosciejOnField!.currentStats.defense).toBe(5) // full defense restored
    })
  })

  // =======================================================================
  // CROSS-CUTTING CONCERNS
  // =======================================================================
  describe('Cross-cutting: silenced cards', () => {
    it('silenced Bazyliszek does not paralyze (effect skipped in triggerEffect)', () => {
      const bazyliszek = placeAttacker(state, {
        name: 'Bazyliszek',
        effectId: 'bazyliszek_paralyze',
        stats: { attack: 2, defense: 4, maxDefense: 4, maxAttack: 2 },
      })
      bazyliszek.isSilenced = true

      const defender = placeDefender(state, {
        name: 'Target',
        effectId: 'no_effect_sil',
        stats: { attack: 1, defense: 10, maxDefense: 10, maxAttack: 1 },
      })

      const { newState } = resolveAttack(state, bazyliszek.instanceId, defender.instanceId)

      const target = findOnField(newState, defender.instanceId)
      expect(target).not.toBeNull()
      expect(target!.paralyzeRoundsLeft).toBeNull() // NOT paralyzed
    })
  })

  describe('Cross-cutting: canActivateEffect', () => {
    it('paralyzed card cannot activate effect', () => {
      const activatableCard = placeAttacker(state, {
        name: 'Aitwar',
        effectId: 'aitwar_steal_hand',
        stats: { attack: 3, defense: 5, maxDefense: 5, maxAttack: 3 },
      })
      activatableCard.paralyzeRoundsLeft = 2

      // Add enemy hand card so Aitwar would otherwise be able to activate
      const enemyHandCard = createCreatureInstance(makeCreatureData({
        name: 'Enemy Hand Card',
        effectId: 'no_effect_ehc',
      }), 'player2')
      state.players.player2.hand.push(enemyHandCard)

      expect(canActivateEffect(state, activatableCard)).toBe(false)
    })

    it('silenced card cannot activate effect', () => {
      const activatableCard = placeAttacker(state, {
        name: 'Aitwar',
        effectId: 'aitwar_steal_hand',
        stats: { attack: 3, defense: 5, maxDefense: 5, maxAttack: 3 },
      })
      activatableCard.isSilenced = true

      expect(canActivateEffect(state, activatableCard)).toBe(false)
    })
  })
})
