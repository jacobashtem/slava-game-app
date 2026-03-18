/**
 * ScenarioEngine — zarzadza kampania (scenario lifecycle).
 * Setup encounter, persistent deck, win check, rewards.
 * Pure TS, zero zaleznosci Vue.
 */

import type { ScenarioDefinition, EncounterDefinition, NarrativeLine, EncounterReward, SpecialRule } from './scenarios/types'
import type { GameState, CardInstance, CreatureCardData, AdventureCardData } from './types'
import { GamePhase, BattleLine, CardPosition, AttackType, Domain } from './constants'
import { createInitialGameState, getAllCreaturesOnField } from './GameStateUtils'
import {
  CardFactory,
  createCreatureInstance,
  createAdventureInstance,
} from './CardFactory'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

const _factory = new CardFactory()
_factory.loadCreatures(istotypData as any)
_factory.loadAdventures(przygodyData as any)

/** Synthetic creature data for scenario-only cards (not in JSON). */
function createSyntheticCreature(effectId: string, name: string, atk: number, def: number): CreatureCardData {
  return {
    id: 9000 + Math.floor(Math.random() * 1000),
    cardType: 'creature',
    domain: Domain.WELES,
    name,
    stats: {
      attack: atk,
      defense: def,
      maxDefense: def,
      maxAttack: atk,
      soulValue: atk + def,
    },
    attackType: AttackType.MELEE,
    isFlying: false,
    effectId,
    effectDescription: '',
    lore: '',
    abilities: [],
  }
}

export class ScenarioEngine {
  readonly scenario: ScenarioDefinition
  private _encounterIdx = 0
  /** Player's persistent deck state (cards not yet drawn). */
  private _playerDeck: CardInstance[] = []
  /** Player's persistent hand (carried between encounters). */
  private _playerHand: CardInstance[] = []
  /** Player's persistent graveyard. */
  private _playerGraveyard: CardInstance[] = []
  /** Persistent buffs: effectId -> stat/value. */
  private _persistentBuffs: Map<string, { stat: 'atk' | 'def'; value: number }> = new Map()
  /** Tracks whether initial deck was built. */
  private _deckBuilt = false

  constructor(scenario: ScenarioDefinition) {
    this.scenario = scenario
  }

  get encounterIdx(): number { return this._encounterIdx }
  get encounterCount(): number { return this.scenario.encounters.length }
  get currentEncounter(): EncounterDefinition { return this.scenario.encounters[this._encounterIdx]! }
  get playerGraveyard(): CardInstance[] { return this._playerGraveyard }

  // ===== LIFECYCLE =====

  startScenario(): { narrative: NarrativeLine[]; encounterIndex: number } {
    this._encounterIdx = 0
    this._playerDeck = []
    this._playerHand = []
    this._playerGraveyard = []
    this._persistentBuffs = new Map()
    this._deckBuilt = false
    this.buildInitialDeck()
    return {
      narrative: this.scenario.prologNarrative,
      encounterIndex: 0,
    }
  }

  setupCurrentEncounter(): GameState {
    const enc = this.currentEncounter
    const freshState = createInitialGameState('gold')

    freshState.currentPhase = GamePhase.PLAY
    freshState.roundNumber = 1
    freshState.turnNumber = 1
    freshState.currentTurn = 'player1'

    // Player: no glory win — scenario manages win conditions
    freshState.players.player1.glory = 99
    freshState.players.player2.glory = 99

    // Rebuild player hand + deck from persistent state
    freshState.players.player1.hand = [...this._playerHand]
    freshState.players.player1.deck = [...this._playerDeck]
    freshState.players.player1.graveyard = [...this._playerGraveyard]

    // Apply persistent buffs to hand + deck cards
    this.applyBuffsToCards(freshState.players.player1.hand)
    this.applyBuffsToCards(freshState.players.player1.deck)

    // AI: NO deck, NO hand — only field creatures
    freshState.players.player2.deck = []
    freshState.players.player2.hand = []

    // Place enemies on field
    for (const enemy of enc.enemies) {
      const line = enemy.line as BattleLine
      const inst = this.createEnemyInstance(enemy.effectId, enemy.customStats)
      if (!inst) continue
      inst.line = line
      inst.position = enemy.position === 'attack' ? CardPosition.ATTACK : CardPosition.DEFENSE
      inst.isRevealed = true
      inst.roundEnteredPlay = 1
      inst.turnsInPlay = 1
      freshState.players.player2.field.lines[line].push(inst)
    }

    return freshState
  }

  /** Check encounter win/lose after each state change. */
  checkEncounterWin(state: GameState, roundNumber: number): 'player_win' | 'player_lose' | null {
    const enc = this.currentEncounter

    // Player lose: 0 creatures on field + 0 in hand + 0 in deck
    const playerField = getAllCreaturesOnField(state, 'player1')
    const playerHand = state.players.player1.hand.filter(c => c.cardData.cardType === 'creature')
    const playerDeck = state.players.player1.deck.filter(c => c.cardData.cardType === 'creature')
    if (playerField.length === 0 && playerHand.length === 0 && playerDeck.length === 0) {
      return 'player_lose'
    }

    switch (enc.winCondition) {
      case 'kill_all': {
        const enemyField = getAllCreaturesOnField(state, 'player2')
        if (enemyField.length === 0) return 'player_win'
        break
      }
      case 'kill_target': {
        if (!enc.winTarget) break
        const enemyField = getAllCreaturesOnField(state, 'player2')
        const targetAlive = enemyField.some(c =>
          (c.cardData as CreatureCardData).effectId === enc.winTarget
        )
        if (!targetAlive) return 'player_win'
        break
      }
      case 'survive': {
        const survivalRule = enc.specialRules?.find(r => r.type === 'survival')
        if (survivalRule && roundNumber > (survivalRule.survivalRounds ?? 4)) {
          return 'player_win'
        }
        break
      }
    }

    return null
  }

  /** Apply rewards after encounter win. Returns modified state. */
  applyRewards(state: GameState, graveyardChoice?: string): GameState {
    const enc = this.currentEncounter
    for (const reward of enc.rewards) {
      switch (reward.type) {
        case 'draw': {
          const count = reward.value ?? 1
          for (let i = 0; i < count; i++) {
            if (state.players.player1.deck.length > 0) {
              const card = state.players.player1.deck.shift()!
              card.isRevealed = true
              state.players.player1.hand.push(card)
            }
          }
          break
        }
        case 'heal_all': {
          const amount = reward.value ?? 2
          const fieldCreatures = getAllCreaturesOnField(state, 'player1')
          for (const c of fieldCreatures) {
            c.currentStats.defense = Math.min(
              c.currentStats.maxDefense,
              c.currentStats.defense + amount,
            )
          }
          break
        }
        case 'buff_creature': {
          // This will be applied via UI choice — store the buff persistently
          // For now, mark it in persistentBuffs if target specified
          if (reward.target) {
            this._persistentBuffs.set(reward.target, {
              stat: reward.stat ?? 'def',
              value: reward.value ?? 2,
            })
          }
          // If no target, scenarioStore will handle player choice
          break
        }
        case 'recover_graveyard': {
          if (graveyardChoice) {
            const idx = state.players.player1.graveyard.findIndex(
              c => c.instanceId === graveyardChoice,
            )
            if (idx !== -1) {
              const recovered = state.players.player1.graveyard.splice(idx, 1)[0]!
              recovered.currentStats.defense = recovered.currentStats.maxDefense
              recovered.currentStats.attack = recovered.currentStats.maxAttack
              recovered.line = null
              recovered.activeEffects = []
              state.players.player1.deck.push(recovered)
            }
          }
          break
        }
        case 'add_adventure': {
          if (reward.adventureEffectId) {
            const advData = _factory.getAllAdventures().find(
              a => a.effectId === reward.adventureEffectId,
            )
            if (advData) {
              const inst = createAdventureInstance(advData, 'player1')
              inst.isRevealed = true
              state.players.player1.hand.push(inst)
            }
          }
          break
        }
        case 'narrative_only':
          // No mechanical effect
          break
      }
    }
    return state
  }

  /** Apply a buff chosen by player (e.g. enc2 +2 DEF to chosen creature). */
  applyBuffChoice(state: GameState, targetInstanceId: string, stat: 'atk' | 'def', value: number): void {
    // Find creature anywhere (field, hand, deck)
    const allCards = [
      ...getAllCreaturesOnField(state, 'player1'),
      ...state.players.player1.hand,
      ...state.players.player1.deck,
    ]
    const card = allCards.find(c => c.instanceId === targetInstanceId)
    if (!card) return

    if (stat === 'atk') {
      card.currentStats.attack += value
      card.currentStats.maxAttack += value
    } else {
      card.currentStats.defense += value
      card.currentStats.maxDefense += value
    }

    // Also persist for future encounters
    const effectId = (card.cardData as CreatureCardData).effectId
    const existing = this._persistentBuffs.get(effectId)
    if (existing && existing.stat === stat) {
      existing.value += value
    } else {
      this._persistentBuffs.set(`${effectId}_${stat}_${Date.now()}`, { stat, value })
    }
  }

  /** Snapshot player state from GameState after encounter (hand/deck/graveyard). */
  snapshotPlayerState(state: GameState): void {
    // Field creatures go back to hand (alive ones)
    const fieldCreatures = getAllCreaturesOnField(state, 'player1')

    // Reset combat state for all surviving creatures
    const survivors = [...fieldCreatures, ...state.players.player1.hand]
    for (const c of survivors) {
      c.hasAttackedThisTurn = false
      c.hasMovedThisTurn = false
      c.line = null
      c.turnsInPlay = 0
      c.roundEnteredPlay = 0
      c.activeEffects = []
      c.isRevealed = true
      // Keep current stats (damage persists between encounters)
    }

    this._playerHand = [...state.players.player1.hand, ...fieldCreatures]
    this._playerDeck = [...state.players.player1.deck]
    this._playerGraveyard = [...state.players.player1.graveyard]
  }

  /** Advance to next encounter. Returns narrative or null if campaign complete. */
  nextEncounter(): { narrative: NarrativeLine[]; encounterIndex: number } | null {
    this._encounterIdx++
    if (this._encounterIdx >= this.scenario.encounters.length) {
      return null // Campaign complete — show epilog
    }
    return {
      narrative: this.scenario.encounters[this._encounterIdx]!.narrativeIntro,
      encounterIndex: this._encounterIdx,
    }
  }

  getOutroNarrative(): NarrativeLine[] {
    return this.currentEncounter.narrativeOutro
  }

  getTransitionScene(): NarrativeLine[] | null {
    const scene = this.scenario.transitionScenes?.find(
      s => s.afterEncounter === this._encounterIdx + 1,
    )
    return scene?.narrative ?? null
  }

  getEpilogNarrative(): NarrativeLine[] {
    return this.scenario.epilogNarrative
  }

  /** Check if Leszy should be immune (enc7 special rule). */
  shouldLeszyBeImmune(state: GameState): boolean {
    const enc = this.currentEncounter
    const immuneRule = enc.specialRules?.find(r => r.type === 'immune_while_guard')
    if (!immuneRule) return false

    const enemyField = getAllCreaturesOnField(state, 'player2')
    const guardsAlive = immuneRule.guardEffectIds?.some(gId =>
      enemyField.some(c => (c.cardData as CreatureCardData).effectId === gId),
    )
    return !!guardsAlive
  }

  /** Get special rules for current encounter. */
  getSpecialRules(): SpecialRule[] {
    return this.currentEncounter.specialRules ?? []
  }

  /** Check if current encounter has specific rule type. */
  hasRule(type: SpecialRule['type']): boolean {
    return this.getSpecialRules().some(r => r.type === type)
  }

  /** Create a synthetic Pies-upior instance for enc6 spawning. */
  createPiesUpior(): CardInstance {
    const spawnRule = this.getSpecialRules().find(r => r.type === 'spawn_per_turn')
    const data = spawnRule?.spawnData
    const creatureData = createSyntheticCreature(
      data?.effectId ?? 'pies_upior_scenario',
      data?.name ?? 'Pies-upior',
      data?.atk ?? 2,
      data?.def ?? 1,
    )
    const inst = createCreatureInstance(creatureData, 'player2')
    inst.line = BattleLine.FRONT
    inst.position = CardPosition.ATTACK
    inst.isRevealed = true
    inst.roundEnteredPlay = 0
    inst.turnsInPlay = 1
    return inst
  }

  /** Check if Pies-upior count is below max. */
  canSpawnPiesUpior(state: GameState): boolean {
    const spawnRule = this.getSpecialRules().find(r => r.type === 'spawn_per_turn')
    if (!spawnRule?.spawnData) return false
    const max = spawnRule.spawnData.maxOnField
    const currentCount = getAllCreaturesOnField(state, 'player2').filter(
      c => (c.cardData as CreatureCardData).effectId === spawnRule.spawnData!.effectId,
    ).length
    return currentCount < max
  }

  // ===== PRIVATE HELPERS =====

  private buildInitialDeck(): void {
    if (this._deckBuilt) return
    this._deckBuilt = true

    const allCreatures = _factory.getAllCreatures()
    const allAdventures = _factory.getAllAdventures()

    // Build creature instances
    for (const entry of this.scenario.playerDeck.creatures) {
      const data = allCreatures.find(c => c.effectId === entry.effectId)
      if (!data) continue
      const inst = createCreatureInstance(data, 'player1')
      inst.isRevealed = true
      // Named hero? Store name in metadata
      if (entry.name) {
        inst.metadata.heroName = entry.name
      }
      this._playerHand.push(inst)
    }

    // Build adventure instances
    for (const advEffectId of this.scenario.playerDeck.adventures) {
      const data = allAdventures.find(a => a.effectId === advEffectId)
      if (!data) continue
      const inst = createAdventureInstance(data, 'player1')
      inst.isRevealed = true
      this._playerHand.push(inst)
    }

    // Apply starting buffs
    if (this.scenario.startingBuffs) {
      for (const buff of this.scenario.startingBuffs) {
        this._persistentBuffs.set(buff.effectId, { stat: buff.stat, value: buff.value })
        // Also apply to existing cards in hand
        for (const card of this._playerHand) {
          if ((card.cardData as CreatureCardData).effectId === buff.effectId) {
            if (buff.stat === 'atk') {
              card.currentStats.attack += buff.value
              card.currentStats.maxAttack += buff.value
            } else {
              card.currentStats.defense += buff.value
              card.currentStats.maxDefense += buff.value
            }
          }
        }
      }
    }

    // Shuffle hand into: 5 in hand, rest in deck
    this.shuffleArray(this._playerHand)
    const startingHandSize = 5
    if (this._playerHand.length > startingHandSize) {
      this._playerDeck = this._playerHand.splice(startingHandSize)
    }
  }

  private createEnemyInstance(effectId: string, customStats?: { atk?: number; def?: number }): CardInstance | null {
    // Check for synthetic cards first
    if (effectId === 'pies_upior_scenario') {
      return this.createPiesUpior()
    }

    const data = _factory.getAllCreatures().find(c => c.effectId === effectId)
    if (!data) return null
    const inst = createCreatureInstance(data, 'player2')

    // Apply custom stats if provided
    if (customStats) {
      if (customStats.atk !== undefined) {
        inst.currentStats.attack = customStats.atk
        inst.currentStats.maxAttack = customStats.atk
      }
      if (customStats.def !== undefined) {
        inst.currentStats.defense = customStats.def
        inst.currentStats.maxDefense = customStats.def
      }
    }

    return inst
  }

  private applyBuffsToCards(cards: CardInstance[]): void {
    for (const card of cards) {
      const effectId = (card.cardData as CreatureCardData).effectId
      if (!effectId) continue
      for (const [key, buff] of this._persistentBuffs.entries()) {
        // Match by effectId (key might be effectId or effectId_stat_timestamp)
        if (key === effectId || key.startsWith(effectId + '_')) {
          if (buff.stat === 'atk') {
            card.currentStats.attack += buff.value
            card.currentStats.maxAttack += buff.value
          } else {
            card.currentStats.defense += buff.value
            card.currentStats.maxDefense += buff.value
          }
        }
      }
    }
  }

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
  }
}
