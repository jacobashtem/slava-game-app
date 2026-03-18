/**
 * ScenarioEngine — zarzadza kampania (scenario lifecycle).
 * Setup encounter, persistent deck, win check, rewards, trigger processing.
 * Pure TS, zero zaleznosci Vue.
 *
 * V2 — trigger/action system, save/load, themes, named characters.
 */

import type {
  ScenarioDefinition, EncounterDefinition, NarrativeLine,
  EncounterReward, TriggerRule, TriggerAction, TriggerEvent,
  BattlefieldTheme, NamedCharacter, CampaignSaveState, SerializedCard,
  SyntheticCreatureData,
} from './scenarios/types'
import type { GameState, CardInstance, CreatureCardData, AdventureCardData } from './types'
import { GamePhase, BattleLine, CardPosition, AttackType, Domain } from './constants'
import { createInitialGameState, getAllCreaturesOnField } from './GameStateUtils'
import {
  CardFactory,
  createCreatureInstance,
  createAdventureInstance,
} from './CardFactory'

import { TriggerProcessor, type TriggerEventData } from './scenarios/TriggerProcessor'
import { ActionExecutor, type ActionResult } from './scenarios/ActionExecutor'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

const _factory = new CardFactory()
_factory.loadCreatures(istotypData as any)
_factory.loadAdventures(przygodyData as any)

// ===== SYNTHETIC CREATURE HELPER =====

let _syntheticIdCounter = 9000

function createSyntheticCreatureData(effectId: string, name: string, atk: number, def: number): CreatureCardData {
  _syntheticIdCounter++
  return {
    id: _syntheticIdCounter,
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

// ===== MAIN CLASS =====

export interface GameEventResult {
  /** Narrative interruptions to show. */
  narratives: NarrativeLine[][]
  /** Whether combat should pause for each narrative. */
  pauseCombat: boolean[]
  /** If set, encounter ends immediately. */
  encounterEnded?: 'player_win' | 'player_lose'
  /** Whether game state was mutated. */
  stateChanged: boolean
  /** Immunity changes (effectId → immune). */
  immunityChanges: Map<string, boolean>
}

export class ScenarioEngine {
  readonly scenario: ScenarioDefinition
  private _encounterIdx = 0
  private _playerDeck: CardInstance[] = []
  private _playerHand: CardInstance[] = []
  private _playerGraveyard: CardInstance[] = []
  private _persistentBuffs: Map<string, { stat: 'atk' | 'def'; value: number }> = new Map()
  private _deckBuilt = false

  private _triggerProcessor: TriggerProcessor
  private _actionExecutor: ActionExecutor

  /** Runtime-mutable win condition (trigger rules can change it). */
  private _runtimeWinCondition?: 'kill_all' | 'kill_target' | 'survive'
  private _runtimeWinTarget?: string
  private _runtimeSurvivalRounds?: number

  constructor(scenario: ScenarioDefinition) {
    this.scenario = scenario
    this._triggerProcessor = new TriggerProcessor(scenario.globalTriggerRules ?? [])
    this._actionExecutor = new ActionExecutor()
  }

  // ===== ACCESSORS =====

  get encounterIdx(): number { return this._encounterIdx }
  get encounterCount(): number { return this.scenario.encounters.length }
  get currentEncounter(): EncounterDefinition { return this.scenario.encounters[this._encounterIdx]! }
  get playerGraveyard(): CardInstance[] { return this._playerGraveyard }

  /** Get battlefield theme for current encounter (encounter overrides scenario default). */
  getTheme(): BattlefieldTheme | null {
    return this.currentEncounter.theme ?? this.scenario.defaultTheme ?? null
  }

  /** Get named characters for current encounter. */
  getCharacters(): NamedCharacter[] {
    return this.currentEncounter.characters ?? []
  }

  /** Get AI difficulty for current encounter. */
  getAIDifficulty(): string | undefined {
    return this.currentEncounter.aiDifficulty
  }

  /** Get effective win condition (may be overridden by trigger rules at runtime). */
  getEffectiveWinCondition(): { type: string; target?: string; survivalRounds?: number } {
    return {
      type: this._runtimeWinCondition ?? this.currentEncounter.winCondition,
      target: this._runtimeWinTarget ?? this.currentEncounter.winTarget,
      survivalRounds: this._runtimeSurvivalRounds ?? this.currentEncounter.survivalRounds,
    }
  }

  // ===== LIFECYCLE =====

  startScenario(): { narrative: NarrativeLine[]; encounterIndex: number } {
    this._encounterIdx = 0
    this._playerDeck = []
    this._playerHand = []
    this._playerGraveyard = []
    this._persistentBuffs = new Map()
    this._deckBuilt = false
    this._runtimeWinCondition = undefined
    this._runtimeWinTarget = undefined
    this._runtimeSurvivalRounds = undefined

    this._triggerProcessor.reset()
    this._triggerProcessor.setGlobalRules(this.scenario.globalTriggerRules ?? [])

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

    // No glory win — scenario manages win conditions
    freshState.players.player1.glory = 99
    freshState.players.player2.glory = 99

    // Rebuild player hand + deck from persistent state
    freshState.players.player1.hand = [...this._playerHand]
    freshState.players.player1.deck = [...this._playerDeck]
    freshState.players.player1.graveyard = [...this._playerGraveyard]

    // Apply persistent buffs
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
      if (enemy.displayName) {
        inst.metadata.heroName = enemy.displayName
      }
      freshState.players.player2.field.lines[line].push(inst)
    }

    // Reset runtime win overrides
    this._runtimeWinCondition = undefined
    this._runtimeWinTarget = undefined
    this._runtimeSurvivalRounds = undefined

    // Load encounter trigger rules
    this._triggerProcessor.loadEncounter(enc.triggerRules ?? [])

    return freshState
  }

  // ===== TRIGGER EVENT PROCESSING =====

  /**
   * Process a game event through the trigger system.
   * Called by the store after each game action.
   */
  processGameEvent(
    event: TriggerEvent,
    state: GameState,
    data?: TriggerEventData,
  ): GameEventResult {
    // Get actions from trigger processor
    const actions = this._triggerProcessor.processEvent(event, state, data)

    // Handle change_win_condition actions before executing
    for (const action of actions) {
      if (action.type === 'change_win_condition') {
        if (action.winCondition) this._runtimeWinCondition = action.winCondition
        if (action.winTarget) this._runtimeWinTarget = action.winTarget
        if (action.survivalRounds) this._runtimeSurvivalRounds = action.survivalRounds
      }
    }

    // Execute actions against state
    const actionResult = this._actionExecutor.execute(actions, state)

    return {
      narratives: actionResult.narratives,
      pauseCombat: actionResult.pauseCombat,
      encounterEnded: actionResult.encounterEnded,
      stateChanged: actionResult.stateChanged,
      immunityChanges: actionResult.immunityChanges,
    }
  }

  // ===== WIN CONDITION CHECK =====

  /** Check encounter win/lose after each state change. */
  checkEncounterWin(state: GameState, roundNumber: number): 'player_win' | 'player_lose' | null {
    const enc = this.currentEncounter
    const winCondition = this._runtimeWinCondition ?? enc.winCondition

    // Player lose: 0 creatures on field + 0 in hand + 0 in deck
    const playerField = getAllCreaturesOnField(state, 'player1')
    const playerHand = state.players.player1.hand.filter(c => c.cardData.cardType === 'creature')
    const playerDeck = state.players.player1.deck.filter(c => c.cardData.cardType === 'creature')
    if (playerField.length === 0 && playerHand.length === 0 && playerDeck.length === 0) {
      return 'player_lose'
    }

    switch (winCondition) {
      case 'kill_all': {
        const enemyField = getAllCreaturesOnField(state, 'player2')
        if (enemyField.length === 0) return 'player_win'
        break
      }
      case 'kill_target': {
        const target = this._runtimeWinTarget ?? enc.winTarget
        if (!target) break
        const enemyField = getAllCreaturesOnField(state, 'player2')
        const targetAlive = enemyField.some(c =>
          (c.cardData as CreatureCardData).effectId === target,
        )
        if (!targetAlive) return 'player_win'
        break
      }
      case 'survive': {
        const survRounds = this._runtimeSurvivalRounds ?? enc.survivalRounds
        if (survRounds && roundNumber > survRounds) {
          return 'player_win'
        }
        break
      }
    }

    return null
  }

  // ===== REWARDS =====

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
          if (reward.target) {
            this._persistentBuffs.set(reward.target, {
              stat: reward.stat ?? 'def',
              value: reward.value ?? 2,
            })
          }
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
          break
      }
    }
    return state
  }

  /** Apply a buff chosen by player. */
  applyBuffChoice(state: GameState, targetInstanceId: string, stat: 'atk' | 'def', value: number): void {
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

    const effectId = (card.cardData as CreatureCardData).effectId
    const existing = this._persistentBuffs.get(effectId)
    if (existing && existing.stat === stat) {
      existing.value += value
    } else {
      this._persistentBuffs.set(`${effectId}_${stat}_${Date.now()}`, { stat, value })
    }
  }

  // ===== ENCOUNTER LIFECYCLE =====

  /** Snapshot player state from GameState after encounter. */
  snapshotPlayerState(state: GameState): void {
    const fieldCreatures = getAllCreaturesOnField(state, 'player1')

    const survivors = [...fieldCreatures, ...state.players.player1.hand]
    for (const c of survivors) {
      c.hasAttackedThisTurn = false
      c.hasMovedThisTurn = false
      c.line = null
      c.turnsInPlay = 0
      c.roundEnteredPlay = 0
      c.activeEffects = []
      c.isRevealed = true
    }

    this._playerHand = [...state.players.player1.hand, ...fieldCreatures]
    this._playerDeck = [...state.players.player1.deck]
    this._playerGraveyard = [...state.players.player1.graveyard]
  }

  /** Advance to next encounter. Returns narrative or null if campaign complete. */
  nextEncounter(): { narrative: NarrativeLine[]; encounterIndex: number } | null {
    this._encounterIdx++
    if (this._encounterIdx >= this.scenario.encounters.length) {
      return null
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

  // ===== SAVE / LOAD =====

  /** Serialize campaign state for save. */
  serializeState(): CampaignSaveState {
    return {
      version: 1,
      scenarioId: this.scenario.id,
      encounterIndex: this._encounterIdx,
      playerHand: this._playerHand.map(serializeCard),
      playerDeck: this._playerDeck.map(serializeCard),
      playerGraveyard: this._playerGraveyard.map(serializeCard),
      persistentBuffs: [...this._persistentBuffs.entries()],
      firedRuleIds: this._triggerProcessor.getFiredRuleIds(),
      flags: this._triggerProcessor.getFlags(),
      timestamp: Date.now(),
    }
  }

  /** Restore engine from a save. Requires the matching ScenarioDefinition. */
  static fromSave(save: CampaignSaveState, scenario: ScenarioDefinition): ScenarioEngine {
    const engine = new ScenarioEngine(scenario)
    engine._encounterIdx = save.encounterIndex
    engine._deckBuilt = true
    engine._persistentBuffs = new Map(save.persistentBuffs)

    engine._playerHand = save.playerHand.map(deserializeCard)
    engine._playerDeck = save.playerDeck.map(deserializeCard)
    engine._playerGraveyard = save.playerGraveyard.map(deserializeCard)

    engine._triggerProcessor.setGlobalRules(scenario.globalTriggerRules ?? [])
    engine._triggerProcessor.restoreState(save.firedRuleIds, save.flags)

    return engine
  }

  // ===== PRIVATE HELPERS =====

  private buildInitialDeck(): void {
    if (this._deckBuilt) return
    this._deckBuilt = true

    const allCreatures = _factory.getAllCreatures()
    const allAdventures = _factory.getAllAdventures()

    for (const entry of this.scenario.playerDeck.creatures) {
      const data = allCreatures.find(c => c.effectId === entry.effectId)
      if (!data) continue
      const inst = createCreatureInstance(data, 'player1')
      inst.isRevealed = true
      if (entry.name) {
        inst.metadata.heroName = entry.name
      }
      this._playerHand.push(inst)
    }

    for (const advEffectId of this.scenario.playerDeck.adventures) {
      const data = allAdventures.find(a => a.effectId === advEffectId)
      if (!data) continue
      const inst = createAdventureInstance(data, 'player1')
      inst.isRevealed = true
      this._playerHand.push(inst)
    }

    if (this.scenario.startingBuffs) {
      for (const buff of this.scenario.startingBuffs) {
        this._persistentBuffs.set(buff.effectId, { stat: buff.stat, value: buff.value })
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

    this.shuffleArray(this._playerHand)
    const startingHandSize = 5
    if (this._playerHand.length > startingHandSize) {
      this._playerDeck = this._playerHand.splice(startingHandSize)
    }
  }

  private createEnemyInstance(effectId: string, customStats?: { atk?: number; def?: number }): CardInstance | null {
    // Check if this is a synthetic creature (not in JSON data)
    const dataFromJson = _factory.getAllCreatures().find(c => c.effectId === effectId)

    if (!dataFromJson) {
      // Create synthetic creature
      const synData = createSyntheticCreatureData(effectId, effectId, customStats?.atk ?? 2, customStats?.def ?? 1)
      return createCreatureInstance(synData, 'player2')
    }

    const inst = createCreatureInstance(dataFromJson, 'player2')

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

// ===== SERIALIZATION HELPERS =====

function serializeCard(card: CardInstance): SerializedCard {
  return {
    effectId: (card.cardData as CreatureCardData).effectId ?? (card.cardData as AdventureCardData).effectId,
    heroName: card.metadata.heroName as string | undefined,
    currentAtk: card.currentStats.attack,
    currentDef: card.currentStats.defense,
    maxAtk: card.currentStats.maxAttack,
    maxDef: card.currentStats.maxDefense,
    isCreature: card.cardData.cardType === 'creature',
  }
}

function deserializeCard(data: SerializedCard): CardInstance {
  const allCreatures = _factory.getAllCreatures()
  const allAdventures = _factory.getAllAdventures()

  if (data.isCreature) {
    const cardData = allCreatures.find(c => c.effectId === data.effectId)
    if (!cardData) {
      // Synthetic creature — recreate
      const synData = createSyntheticCreatureData(data.effectId, data.effectId, data.currentAtk, data.currentDef)
      const inst = createCreatureInstance(synData, 'player1')
      inst.isRevealed = true
      if (data.heroName) inst.metadata.heroName = data.heroName
      return inst
    }
    const inst = createCreatureInstance(cardData, 'player1')
    inst.currentStats.attack = data.currentAtk
    inst.currentStats.defense = data.currentDef
    inst.currentStats.maxAttack = data.maxAtk
    inst.currentStats.maxDefense = data.maxDef
    inst.isRevealed = true
    if (data.heroName) inst.metadata.heroName = data.heroName
    return inst
  } else {
    const cardData = allAdventures.find(a => a.effectId === data.effectId)
    if (!cardData) throw new Error(`Adventure not found: ${data.effectId}`)
    const inst = createAdventureInstance(cardData, 'player1')
    inst.isRevealed = true
    return inst
  }
}
