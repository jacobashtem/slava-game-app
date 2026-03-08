/**
 * Testy logiki walki — CombatResolver + LineManager
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createInitialGameState } from '../../game-engine/GameStateUtils'
import { CardFactory } from '../../game-engine/CardFactory'
import { buildRandomDeck, drawCards } from '../../game-engine/DeckBuilder'
import { createCreatureInstance } from '../../game-engine/CardFactory'
import { placeCreatureOnField, canAttack, getEnemyFrontLine, checkWinCondition } from '../../game-engine/LineManager'
import { resolveAttack } from '../../game-engine/CombatResolver'
import { BattleLine, CardPosition, AttackType, Domain, GOLD_EDITION_RULES } from '../../game-engine/constants'
import type { GameState, CreatureCardData } from '../../game-engine/types'

import istotypData from '../../data/Slava_Vol2_Istoty.json'
import przygodyData from '../../data/Slava_Vol2_KartyPrzygody.json'

// ===== HELPERS =====

function makeTestState(): GameState {
  return createInitialGameState('gold')
}

function makeCreature(name: string, attack: number, defense: number, attackType = AttackType.MELEE, isFlying = false): CreatureCardData {
  return {
    id: Math.floor(Math.random() * 10000),
    cardType: 'creature',
    domain: Domain.PERUN,
    name,
    stats: { attack, defense, maxDefense: defense, maxAttack: attack },
    attackType,
    isFlying,
    effectId: 'no_effect',
    effectDescription: '',
    lore: '',
  }
}

// ===== TESTY =====

describe('CombatResolver — podstawy', () => {
  it('atakujący zadaje obrażenia obrońcy', () => {
    const state = makeTestState()

    const warrior = createCreatureInstance(makeCreature('Wojownik', 3, 4), 'player1')
    const goblin = createCreatureInstance(makeCreature('Goblin', 2, 2), 'player2')

    warrior.position = CardPosition.ATTACK
    placeCreatureOnField(state, warrior, BattleLine.FRONT, 1)
    placeCreatureOnField(state, goblin, BattleLine.FRONT, 1)

    const { newState, result } = resolveAttack(state, warrior.instanceId, goblin.instanceId)

    expect(result.damageToDefender).toBe(3)
    expect(result.defenderDied).toBe(true)  // goblin ma 2 DEF, dostał 3
  })

  it('kontratak tylko gdy obrońca w pozycji DEFENSE', () => {
    const state = makeTestState()

    const attacker = createCreatureInstance(makeCreature('Atakujący', 3, 5), 'player1')
    const defender = createCreatureInstance(makeCreature('Obrońca', 2, 6), 'player2')

    attacker.position = CardPosition.ATTACK
    defender.position = CardPosition.DEFENSE

    placeCreatureOnField(state, attacker, BattleLine.FRONT, 1)
    placeCreatureOnField(state, defender, BattleLine.FRONT, 1)

    const { result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    // Kontratak jednoczesny — obrońca bije pełną mocą (DEF=6 SPRZED ciosu)
    expect(result.counterattackOccurred).toBe(true)
    expect(result.damageToAttacker).toBe(6)
  })

  it('brak kontrataku gdy obrońca w pozycji ATTACK', () => {
    const state = makeTestState()

    const attacker = createCreatureInstance(makeCreature('Atakujący', 3, 5), 'player1')
    const defender = createCreatureInstance(makeCreature('Obrońca', 4, 6), 'player2')

    attacker.position = CardPosition.ATTACK
    defender.position = CardPosition.ATTACK  // ← atakuje, nie kontratakuje

    placeCreatureOnField(state, attacker, BattleLine.FRONT, 1)
    placeCreatureOnField(state, defender, BattleLine.FRONT, 1)

    const { result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    expect(result.counterattackOccurred).toBe(false)
    expect(result.damageToAttacker).toBe(0)
  })

  it('obrońca ginie gdy DEF <= 0', () => {
    const state = makeTestState()

    const attacker = createCreatureInstance(makeCreature('Ogr', 10, 8), 'player1')
    const defender = createCreatureInstance(makeCreature('Imp', 1, 2), 'player2')

    attacker.position = CardPosition.ATTACK
    defender.position = CardPosition.DEFENSE

    placeCreatureOnField(state, attacker, BattleLine.FRONT, 1)
    placeCreatureOnField(state, defender, BattleLine.FRONT, 1)

    const { newState, result } = resolveAttack(state, attacker.instanceId, defender.instanceId)

    expect(result.defenderDied).toBe(true)
    // Karta powinna być w graveyardzie
    expect(newState.players.player2.graveyard.length).toBe(1)
    expect(newState.players.player2.field.lines[BattleLine.FRONT].length).toBe(0)
  })
})

describe('LineManager — zasięg ataku', () => {
  it('Wręcz atakuje tylko front', () => {
    const state = makeTestState()

    const attacker = createCreatureInstance(makeCreature('Wręcz', 3, 3, AttackType.MELEE), 'player1')
    const frontUnit = createCreatureInstance(makeCreature('Front', 2, 3), 'player2')
    const backUnit = createCreatureInstance(makeCreature('Tyły', 2, 3), 'player2')

    attacker.position = CardPosition.ATTACK
    placeCreatureOnField(state, attacker, BattleLine.FRONT, 1)
    placeCreatureOnField(state, frontUnit, BattleLine.FRONT, 1)
    placeCreatureOnField(state, backUnit, BattleLine.RANGED, 1)

    const canHitFront = canAttack(state, attacker, frontUnit)
    const canHitBack = canAttack(state, attacker, backUnit)

    expect(canHitFront.valid).toBe(true)
    expect(canHitBack.valid).toBe(false)
  })

  it('Magia atakuje dowolną linię', () => {
    const state = makeTestState()

    const mage = createCreatureInstance(makeCreature('Mag', 4, 3, AttackType.MAGIC), 'player1')
    const frontUnit = createCreatureInstance(makeCreature('Front', 2, 3), 'player2')
    const backUnit = createCreatureInstance(makeCreature('Tyły', 2, 3), 'player2')

    mage.position = CardPosition.ATTACK
    placeCreatureOnField(state, mage, BattleLine.SUPPORT, 1)
    placeCreatureOnField(state, frontUnit, BattleLine.FRONT, 1)
    placeCreatureOnField(state, backUnit, BattleLine.SUPPORT, 1)

    expect(canAttack(state, mage, frontUnit).valid).toBe(true)
    expect(canAttack(state, mage, backUnit).valid).toBe(true)
  })

  it('Wręcz nie bije latających', () => {
    const state = makeTestState()

    const melee = createCreatureInstance(makeCreature('Pieszo', 3, 3, AttackType.MELEE, false), 'player1')
    const flying = createCreatureInstance(makeCreature('Latający', 2, 2, AttackType.MELEE, true), 'player2')

    melee.position = CardPosition.ATTACK
    placeCreatureOnField(state, melee, BattleLine.FRONT, 1)
    placeCreatureOnField(state, flying, BattleLine.FRONT, 1)

    expect(canAttack(state, melee, flying).valid).toBe(false)
  })

  it('dynamiczny front — L1 puste, L2 staje się frontem', () => {
    const state = makeTestState()

    const rangedUnit = createCreatureInstance(makeCreature('Dystans', 2, 3), 'player2')
    placeCreatureOnField(state, rangedUnit, BattleLine.RANGED, 1)  // tylko L2

    const frontLine = getEnemyFrontLine(state, 'player1')
    expect(frontLine).toBe(BattleLine.RANGED)
  })
})

describe('Warunki wygranej', () => {
  it('brak wygranej gdy obaj gracze mają istoty na polu i talie', () => {
    const factory = new CardFactory()
    factory.loadCreatures(istotypData as any)
    factory.loadAdventures(przygodyData as any)
    const state = makeTestState()
    state.turnNumber = 3
    // Daj obom graczom talie (wymagane przez win condition)
    state.players.player1.deck = buildRandomDeck(factory, 'player1')
    state.players.player2.deck = buildRandomDeck(factory, 'player2')

    const c1 = factory.createCreatureInstance(1, 'player1')!
    const c2 = factory.createCreatureInstance(2, 'player2')!
    placeCreatureOnField(state, c1, BattleLine.FRONT, 1)
    placeCreatureOnField(state, c2, BattleLine.FRONT, 1)

    expect(checkWinCondition(state)).toBe(null)
  })

  it('wygrana gdy wróg ma pustą talię (po turze 1)', () => {
    const state = makeTestState()
    state.turnNumber = 3
    state.players.player2.deck = []

    expect(checkWinCondition(state)).toBe('player1')
  })
})

describe('Gryf — podwójne obrażenia w rundzie wystawienia', () => {
  it('gryf zadaje 2x obrażeń gdy atakuje w tej samej rundzie', () => {
    const state = makeTestState()
    state.roundNumber = 3

    const gryfData = makeCreature('Gryf', 4, 4, AttackType.MELEE, true)
    gryfData.effectId = 'gryf_double_dmg_on_play_turn'

    const gryf = createCreatureInstance(gryfData, 'player1')
    gryf.roundEnteredPlay = 3  // wystawiony w tej samej rundzie
    gryf.position = CardPosition.ATTACK

    const target = createCreatureInstance(makeCreature('Cel', 2, 10), 'player2')
    target.isFlying = true  // żeby Wręcz mógł trafić

    placeCreatureOnField(state, gryf, BattleLine.FRONT, 3)
    placeCreatureOnField(state, target, BattleLine.FRONT, 3)

    const { result } = resolveAttack(state, gryf.instanceId, target.instanceId)
    expect(result.damageToDefender).toBe(8)  // 4 * 2 = 8
  })
})

describe('CardFactory — ładowanie danych', () => {
  it('factory poprawnie ładuje karty z JSON', () => {
    const factory = new CardFactory()
    factory.loadCreatures(istotypData as any)
    factory.loadAdventures(przygodyData as any)

    const creatures = factory.getAllCreatures()
    const adventures = factory.getAllAdventures()

    expect(creatures.length).toBe(120)
    expect(adventures.length).toBe(62)
    expect(creatures[0].cardType).toBe('creature')
    expect(adventures[0].cardType).toBe('adventure')
  })

  it('każda karta ma effectId', () => {
    const factory = new CardFactory()
    factory.loadCreatures(istotypData as any)
    factory.loadAdventures(przygodyData as any)

    const creatures = factory.getAllCreatures()
    const adventures = factory.getAllAdventures()

    for (const card of creatures) {
      expect(card.effectId).toBeTruthy()
    }
    for (const card of adventures) {
      expect(card.effectId).toBeTruthy()
    }
  })
})

describe('DeckBuilder', () => {
  it('buduje talię o poprawnym rozmiarze', () => {
    const factory = new CardFactory()
    factory.loadCreatures(istotypData as any)
    factory.loadAdventures(przygodyData as any)

    const deck = buildRandomDeck(factory, 'player1')
    expect(deck.length).toBe(GOLD_EDITION_RULES.DECK_SIZE)
  })

  it('każda karta w talii ma unikalne instanceId', () => {
    const factory = new CardFactory()
    factory.loadCreatures(istotypData as any)
    factory.loadAdventures(przygodyData as any)

    const deck = buildRandomDeck(factory, 'player1')
    const ids = deck.map(c => c.instanceId)
    const unique = new Set(ids)
    expect(unique.size).toBe(deck.length)
  })
})
