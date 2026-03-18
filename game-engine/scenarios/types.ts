/**
 * Typy dla systemu scenariuszy / kampanii.
 * ScenarioDefinition opisuje caly scenariusz, EncounterDefinition — pojedyncza walke.
 *
 * V2 — trigger/action system zamiast hardcoded specialRules.
 */

import type { BattleLine } from '../constants'

// ===== NARRATIVE =====

export interface NarrativeLine {
  speaker?: string        // null/undefined = narrator
  text: string
  style?: 'italic' | 'bold'
  /** Optional portrait icon for the speaker (iconify ID or image path). */
  portrait?: string
}

// ===== REWARDS =====

export interface EncounterReward {
  type: 'draw' | 'heal_all' | 'buff_creature' | 'recover_graveyard' | 'add_adventure' | 'narrative_only'
  value?: number          // heal: DEF amount, buff: stat amount, draw: count
  stat?: 'atk' | 'def'
  target?: string         // effectId of creature to buff (null = player choice)
  adventureEffectId?: string  // for add_adventure
  description: string     // display text for the reward
}

// ===== TRIGGER/ACTION SYSTEM =====

/** When a trigger fires. */
export type TriggerEvent =
  | 'on_encounter_start'       // encounter combat begins
  | 'on_round_start'           // round N starts (AI turn)
  | 'on_round_end'             // round N ends
  | 'on_player_turn_start'     // player's turn starts
  | 'on_kill'                  // specific creature killed (by effectId)
  | 'on_any_kill'              // any creature dies
  | 'on_card_play'             // specific card played from hand
  | 'on_hp_below'              // creature HP drops below threshold
  | 'on_field_count'           // side's field creature count hits threshold
  | 'on_state_change'          // every state mutation (for passives like immunity)

export interface TriggerCondition {
  event: TriggerEvent
  /** Round number or range. For on_round_start / on_round_end. */
  round?: number | { min?: number; max?: number }
  /** Target effectId — for on_kill, on_card_play, on_hp_below. */
  effectId?: string
  /** Numeric threshold — for on_hp_below (DEF), on_field_count (count). */
  threshold?: number
  /** Comparison for threshold. Default 'lte' for hp, 'eq' for count. */
  compare?: 'lte' | 'gte' | 'eq' | 'lt' | 'gt'
  /** Which side to check. Default 'player2' (enemy). */
  side?: 'player1' | 'player2'
  /** Require a scenario flag to be set (for chained triggers). */
  requireFlag?: string
}

export type ActionType =
  | 'spawn_creature'           // place creature on field
  | 'respawn_from_graveyard'   // bring back dead creature
  | 'set_immune'               // make target immune while guards alive
  | 'remove_immune'            // remove immunity
  | 'show_narrative'           // mid-combat dialogue interruption
  | 'modify_stats'             // buff/debuff a creature
  | 'heal_creature'            // restore DEF
  | 'damage_creature'          // deal damage
  | 'remove_creature'          // remove from field (story event)
  | 'force_encounter_end'      // force win/lose
  | 'set_flag'                 // set a scenario flag
  | 'draw_cards'               // player draws N cards
  | 'change_win_condition'     // dynamically change win condition

export interface TriggerAction {
  type: ActionType

  // --- target ---
  targetEffectId?: string
  side?: 'player1' | 'player2'

  // --- spawn ---
  spawnData?: SyntheticCreatureData
  line?: 1 | 2 | 3
  position?: 'attack' | 'defense'
  maxOnField?: number

  // --- immune ---
  guardEffectIds?: string[]

  // --- narrative ---
  narrative?: NarrativeLine[]
  /** If true, combat pauses until narrative is dismissed. Default true. */
  pauseCombat?: boolean

  // --- stats ---
  stat?: 'atk' | 'def'
  value?: number

  // --- force end ---
  result?: 'player_win' | 'player_lose'

  // --- flag ---
  flag?: string
  flagValue?: unknown

  // --- draw ---
  count?: number

  // --- change win ---
  winCondition?: 'kill_all' | 'kill_target' | 'survive'
  winTarget?: string
  survivalRounds?: number
}

/** A complete trigger rule — condition + action(s). */
export interface TriggerRule {
  id: string
  condition: TriggerCondition
  actions: TriggerAction[]
  /** Fire only once per encounter? Default false. */
  once?: boolean
}

// ===== SYNTHETIC CREATURE =====

export interface SyntheticCreatureData {
  effectId: string
  name: string
  atk: number
  def: number
  domain?: string
  attackType?: string
}

// ===== ENEMIES =====

export interface EncounterEnemy {
  line: 1 | 2 | 3
  effectId: string
  position: 'attack' | 'defense'
  customStats?: { atk?: number; def?: number }
  /** Display name override (for named bosses). */
  displayName?: string
}

// ===== NAMED CHARACTERS =====

export interface NamedCharacter {
  effectId: string
  heroName: string
  portrait?: string
  side: 'player' | 'enemy'
}

// ===== BATTLEFIELD THEME =====

export interface BattlefieldTheme {
  /** CSS gradient for the board background. */
  backgroundGradient?: string
  /** Tint overlay color (rgba). */
  ambientColor?: string
  /** Fog overlay intensity 0–1. */
  fogDensity?: number
  /** Iconify icon for the encounter HUD. */
  icon?: string
  /** CSS class name to apply to the board. */
  boardClass?: string
}

// ===== ENCOUNTER =====

export interface EncounterDefinition {
  id: string
  title: string
  teachMechanic?: string
  narrativeIntro: NarrativeLine[]
  narrativeOutro: NarrativeLine[]
  enemies: EncounterEnemy[]
  winCondition: 'kill_all' | 'kill_target' | 'survive'
  winTarget?: string
  survivalRounds?: number
  /** Data-driven trigger rules (replaces specialRules). */
  triggerRules?: TriggerRule[]
  rewards: EncounterReward[]
  /** Battlefield visual theme for this encounter. */
  theme?: BattlefieldTheme
  /** Named characters visible in this encounter (for HUD/portraits). */
  characters?: NamedCharacter[]
  /** AI difficulty override for this encounter. */
  aiDifficulty?: 'novice' | 'warrior' | 'veteran' | 'legend'
}

// ===== TRANSITION SCENES =====

export interface TransitionScene {
  afterEncounter: number
  narrative: NarrativeLine[]
}

// ===== SCENARIO =====

export interface ScenarioDefinition {
  id: string
  title: string
  description?: string
  prologNarrative: NarrativeLine[]
  epilogNarrative: NarrativeLine[]
  transitionScenes?: TransitionScene[]
  playerDeck: {
    creatures: { effectId: string; name?: string }[]
    adventures: string[]
  }
  startingBuffs?: { effectId: string; stat: 'atk' | 'def'; value: number }[]
  encounters: EncounterDefinition[]
  /** Default theme for all encounters (encounter.theme overrides). */
  defaultTheme?: BattlefieldTheme
  /** Global trigger rules active across all encounters. */
  globalTriggerRules?: TriggerRule[]
}

// ===== CAMPAIGN SAVE =====

export interface CampaignSaveState {
  version: 1
  scenarioId: string
  encounterIndex: number
  playerHand: SerializedCard[]
  playerDeck: SerializedCard[]
  playerGraveyard: SerializedCard[]
  persistentBuffs: [string, { stat: 'atk' | 'def'; value: number }][]
  firedRuleIds: string[]
  flags: [string, unknown][]
  timestamp: number
}

export interface SerializedCard {
  effectId: string
  heroName?: string
  currentAtk: number
  currentDef: number
  maxAtk: number
  maxDef: number
  isCreature: boolean
}
