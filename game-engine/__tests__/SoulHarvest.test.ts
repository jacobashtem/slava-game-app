/**
 * SoulHarvest.test.ts — tests for Żniwo Dusz (Soul Harvest) mechanic.
 *
 * Covers:
 *   - harvestSoul() threshold logic (20 points → +1 PS)
 *   - Overflow / remainder preservation
 *   - Both game modes (Gold Edition / Sława)
 *   - Integration with CombatResolver (death triggers harvest)
 *   - soulValue field on cards
 *   - Multiple kills in one turn
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createInitialGameState } from '../GameStateUtils'
import { createCreatureInstance } from '../CardFactory'
import { harvestSoul, type SoulHarvestResult } from '../GloryManager'
import { resolveAttack } from '../CombatResolver'
import { BattleLine, CardPosition, AttackType, Domain, GamePhase, GOLD_EDITION_RULES, SLAVA_RULES } from '../constants'
import type { GameState, CardInstance, CreatureCardData, PlayerSide } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 5000

function makeCreature(name: string, attack: number, defense: number, effectId = 'no_effect'): CreatureCardData {
  return {
    id: ++idCounter,
    cardType: 'creature',
    domain: Domain.PERUN,
    name,
    stats: { attack, defense, maxDefense: defense, maxAttack: attack, soulValue: attack + defense },
    attackType: AttackType.MELEE,
    isFlying: false,
    effectId,
    effectDescription: '',
    lore: '',
    abilities: [],
  }
}

function placeCard(state: GameState, owner: PlayerSide, data: CreatureCardData, line = BattleLine.FRONT, pos = CardPosition.ATTACK): CardInstance {
  const card = createCreatureInstance(data, owner)
  card.position = pos
  card.line = line
  card.isRevealed = true
  state.players[owner].field.lines[line].push(card)
  return card
}

function createTestState(mode: 'gold' | 'slava' = 'gold'): GameState {
  const state = createInitialGameState(mode)
  state.currentPhase = GamePhase.COMBAT
  state.currentTurn = 'player1'
  state.roundNumber = 1
  state.turnNumber = 1
  return state
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Soul Harvest — harvestSoul()', () => {
  let state: GameState

  beforeEach(() => {
    idCounter = 5000
    state = createTestState('gold')
  })

  it('accumulates soul points from killed creature (ATK + DEF)', () => {
    const killed = createCreatureInstance(makeCreature('Victim', 3, 5), 'player2')
    const result = harvestSoul(state, 'player1', killed)

    expect(result.soulValue).toBe(8) // 3 + 5
    expect(state.players.player1.soulPoints).toBe(8)
    expect(result.psGained).toBe(0)
    expect(result.log).toHaveLength(0) // no PS gained = no log
  })

  it('awards +1 PS when threshold (20) is reached', () => {
    state.players.player1.soulPoints = 15
    const killed = createCreatureInstance(makeCreature('BigBoy', 3, 5), 'player2') // +8 → 23 total

    const result = harvestSoul(state, 'player1', killed)

    expect(result.psGained).toBe(1)
    expect(state.players.player1.gold).toBe(6) // started with 5, +1
    expect(state.players.player1.soulPoints).toBe(3) // 23 % 20 = 3
    expect(result.log).toHaveLength(1)
    expect(result.log[0].message).toContain('ŻNIWO DUSZ')
  })

  it('preserves overflow when crossing threshold', () => {
    state.players.player1.soulPoints = 18
    const killed = createCreatureInstance(makeCreature('Medium', 2, 7), 'player2') // +9 → 27

    const result = harvestSoul(state, 'player1', killed)

    expect(result.psGained).toBe(1) // floor(27/20) = 1
    expect(state.players.player1.soulPoints).toBe(7) // 27 % 20 = 7
  })

  it('awards multiple PS from a single large kill', () => {
    state.players.player1.soulPoints = 19
    // Giant creature with 15 ATK + 10 DEF = 25 soul value → 19+25=44 → 2 PS
    const killed = createCreatureInstance(makeCreature('Giant', 15, 10), 'player2')

    const result = harvestSoul(state, 'player1', killed)

    expect(result.psGained).toBe(2) // floor(44/20) = 2
    expect(state.players.player1.gold).toBe(7) // 5 + 2
    expect(state.players.player1.soulPoints).toBe(4) // 44 % 20 = 4
  })

  it('works with zero soulPoints start', () => {
    const killed = createCreatureInstance(makeCreature('Weak', 1, 1), 'player2') // +2

    const result = harvestSoul(state, 'player1', killed)

    expect(result.soulValue).toBe(2)
    expect(state.players.player1.soulPoints).toBe(2)
    expect(result.psGained).toBe(0)
  })

  it('exactly 20 points awards 1 PS with 0 remainder', () => {
    state.players.player1.soulPoints = 12
    const killed = createCreatureInstance(makeCreature('Precise', 4, 4), 'player2') // +8 → 20

    const result = harvestSoul(state, 'player1', killed)

    expect(result.psGained).toBe(1)
    expect(state.players.player1.soulPoints).toBe(0) // 20 % 20 = 0
  })

  it('accumulates across multiple kills without reaching threshold', () => {
    const kill1 = createCreatureInstance(makeCreature('A', 2, 3), 'player2')
    const kill2 = createCreatureInstance(makeCreature('B', 1, 4), 'player2')
    const kill3 = createCreatureInstance(makeCreature('C', 3, 2), 'player2')

    harvestSoul(state, 'player1', kill1) // +5 → 5
    harvestSoul(state, 'player1', kill2) // +5 → 10
    harvestSoul(state, 'player1', kill3) // +5 → 15

    expect(state.players.player1.soulPoints).toBe(15)
    expect(state.players.player1.gold).toBe(5) // no PS gained
  })

  it('awards PS on the kill that crosses threshold', () => {
    const kill1 = createCreatureInstance(makeCreature('A', 5, 5), 'player2')
    const kill2 = createCreatureInstance(makeCreature('B', 5, 5), 'player2')

    const r1 = harvestSoul(state, 'player1', kill1) // +10 → 10
    expect(r1.psGained).toBe(0)

    const r2 = harvestSoul(state, 'player1', kill2) // +10 → 20
    expect(r2.psGained).toBe(1)
    expect(state.players.player1.gold).toBe(6)
    expect(state.players.player1.soulPoints).toBe(0)
  })
})

describe('Soul Harvest — Sława mode', () => {
  let state: GameState

  beforeEach(() => {
    idCounter = 6000
    state = createTestState('slava')
    // Sława mode needs slavaData
    state.slavaData = {
      currentSeason: 0,
      previousSeason: null,
      seasonRound: 1,
      gods: [],
      holiday: null,
      seasonalBuffsApplied: false,
      paralyzedDomain: null,
      paralysisRoundsLeft: 0,
      activeAuction: null,
      pendingFavor: null,
      damageDealtThisTurn: { player1: 0, player2: 0 },
      killedEnemyDefenseThisTurn: { player1: 0, player2: 0 },
    }
    state.players.player1.glory = 0
    state.players.player2.glory = 0
  })

  it('awards glory instead of gold in Sława mode', () => {
    state.players.player1.soulPoints = 16
    const killed = createCreatureInstance(makeCreature('Enemy', 3, 4), 'player2') // +7 → 23

    const result = harvestSoul(state, 'player1', killed)

    expect(result.psGained).toBe(1)
    expect(state.players.player1.glory).toBe(1) // glory, not gold
    expect(state.players.player1.soulPoints).toBe(3)
  })

  it('uses SLAVA threshold constant', () => {
    expect(SLAVA_RULES.SOUL_HARVEST_THRESHOLD).toBe(20)
    expect(GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD).toBe(20)
  })

  it('log type is glory in Sława mode', () => {
    state.players.player1.soulPoints = 19
    const killed = createCreatureInstance(makeCreature('X', 1, 1), 'player2')

    const result = harvestSoul(state, 'player1', killed)

    expect(result.psGained).toBe(1)
    expect(result.log[0].type).toBe('glory')
  })
})

describe('Soul Harvest — both sides', () => {
  let state: GameState

  beforeEach(() => {
    idCounter = 7000
    state = createTestState('gold')
  })

  it('AI accumulates soul points independently', () => {
    const playerKilled = createCreatureInstance(makeCreature('PlayerCard', 4, 6), 'player1')

    harvestSoul(state, 'player2', playerKilled) // AI harvests player's card

    expect(state.players.player2.soulPoints).toBe(10)
    expect(state.players.player1.soulPoints).toBe(0) // player unaffected
  })

  it('both sides can harvest in the same combat', () => {
    state.players.player1.soulPoints = 15
    state.players.player2.soulPoints = 18

    const defenderKilled = createCreatureInstance(makeCreature('Def', 3, 4), 'player2') // +7
    const attackerKilled = createCreatureInstance(makeCreature('Atk', 5, 3), 'player1') // +8

    const r1 = harvestSoul(state, 'player1', defenderKilled) // 15+7=22 → 1 PS
    const r2 = harvestSoul(state, 'player2', attackerKilled) // 18+8=26 → 1 PS

    expect(r1.psGained).toBe(1)
    expect(r2.psGained).toBe(1)
    expect(state.players.player1.soulPoints).toBe(2)
    expect(state.players.player2.soulPoints).toBe(6)
  })
})

describe('Soul Harvest — CombatResolver integration', () => {
  let state: GameState

  beforeEach(() => {
    idCounter = 8000
    state = createTestState('gold')
  })

  it('harvestSoul is called when defender dies in combat', () => {
    const attacker = placeCard(state, 'player1', makeCreature('Killer', 10, 10), BattleLine.FRONT, CardPosition.ATTACK)
    const defender = placeCard(state, 'player2', makeCreature('Weak', 2, 3), BattleLine.FRONT, CardPosition.DEFENSE)

    const goldBefore = state.players.player1.gold
    const { newState, result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    expect(result.defenderDied).toBe(true)
    // soulValue = 2 + 3 = 5, added to player1's soulPoints
    expect(newState.players.player1.soulPoints).toBe(5)
  })

  it('harvestSoul awards PS when threshold crossed during combat', () => {
    state.players.player1.soulPoints = 14
    const attacker = placeCard(state, 'player1', makeCreature('Killer', 20, 20), BattleLine.FRONT, CardPosition.ATTACK)
    // Defender with 4+4=8 soul value → 14+8=22 → 1 PS
    const defender = placeCard(state, 'player2', makeCreature('Target', 4, 4), BattleLine.FRONT, CardPosition.DEFENSE)

    const { newState } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    expect(newState.players.player1.gold).toBe(6) // 5 + 1 PS
    expect(newState.players.player1.soulPoints).toBe(2) // 22 % 20
  })

  it('attacker death gives soul points to defender side', () => {
    // Strong defender kills attacker via counterattack
    const attacker = placeCard(state, 'player1', makeCreature('Fragile', 5, 1), BattleLine.FRONT, CardPosition.ATTACK)
    const defender = placeCard(state, 'player2', makeCreature('Tank', 10, 20), BattleLine.FRONT, CardPosition.DEFENSE)

    const { newState, result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    expect(result.attackerDied).toBe(true)
    // Attacker soulValue = 5 + 1 = 6, goes to player2
    expect(newState.players.player2.soulPoints).toBe(6)
  })

  it('both die — both sides get soul points', () => {
    // Both kill each other
    const attacker = placeCard(state, 'player1', makeCreature('Glass', 8, 3), BattleLine.FRONT, CardPosition.ATTACK)
    const defender = placeCard(state, 'player2', makeCreature('Mirror', 5, 5), BattleLine.FRONT, CardPosition.DEFENSE)

    const { newState, result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    expect(result.defenderDied).toBe(true)
    expect(result.attackerDied).toBe(true)
    // player1 gets defender's soul (5+5=10)
    expect(newState.players.player1.soulPoints).toBe(10)
    // player2 gets attacker's soul (8+3=11)
    expect(newState.players.player2.soulPoints).toBe(11)
  })
})

describe('Soul Harvest — soulValue on cards', () => {
  it('CardFactory sets soulValue = ATK + DEF', () => {
    const data = makeCreature('Test', 7, 9)
    expect(data.stats.soulValue).toBe(16)

    const instance = createCreatureInstance(data, 'player1')
    expect(instance.currentStats.soulValue).toBe(16)
  })

  it('soulValue is independent of runtime stat changes', () => {
    const data = makeCreature('Buffed', 3, 5)
    const instance = createCreatureInstance(data, 'player1')

    // Simulate buff — runtime stats change but soulValue stays
    instance.currentStats.attack = 10
    instance.currentStats.defense = 15

    // harvestSoul uses cardData.stats.soulValue (base), not currentStats
    const state = createTestState()
    const result = harvestSoul(state, 'player1', instance)
    expect(result.soulValue).toBe(8) // original 3+5, not 10+15
  })
})
