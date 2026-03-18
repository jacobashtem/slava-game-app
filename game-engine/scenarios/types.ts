/**
 * Typy dla systemu scenariuszy / kampanii.
 * ScenarioDefinition opisuje caly scenariusz, EncounterDefinition — pojedyncza walke.
 */

import type { BattleLine } from '../constants'

export interface NarrativeLine {
  speaker?: string        // null/undefined = narrator
  text: string
  style?: 'italic' | 'bold'
}

export interface EncounterReward {
  type: 'draw' | 'heal_all' | 'buff_creature' | 'recover_graveyard' | 'add_adventure' | 'narrative_only'
  value?: number          // heal: DEF amount, buff: stat amount, draw: count
  stat?: 'atk' | 'def'
  target?: string         // effectId of creature to buff (null = player choice)
  adventureEffectId?: string  // for add_adventure
  description: string     // display text for the reward
}

export interface SpecialRule {
  type: 'respawn' | 'spawn_per_turn' | 'immune_while_guard' | 'survival'
  targetEffectId?: string        // who respawns/is immune
  guardEffectIds?: string[]      // who protects the target
  spawnData?: { effectId: string; name: string; atk: number; def: number; maxOnField: number }
  survivalRounds?: number
  respawnDelay?: number          // turns until respawn (0 = next turn)
}

export interface EncounterEnemy {
  line: 1 | 2 | 3         // BattleLine values
  effectId: string
  position: 'attack' | 'defense'
  customStats?: { atk?: number; def?: number }
}

export interface EncounterDefinition {
  id: string
  title: string
  teachMechanic: string
  narrativeIntro: NarrativeLine[]
  narrativeOutro: NarrativeLine[]
  enemies: EncounterEnemy[]
  winCondition: 'kill_all' | 'kill_target' | 'survive'
  winTarget?: string              // effectId for kill_target
  specialRules?: SpecialRule[]
  rewards: EncounterReward[]
}

export interface TransitionScene {
  afterEncounter: number
  narrative: NarrativeLine[]
}

export interface ScenarioDefinition {
  id: string
  title: string
  prologNarrative: NarrativeLine[]
  epilogNarrative: NarrativeLine[]
  transitionScenes?: TransitionScene[]
  playerDeck: {
    creatures: { effectId: string; name?: string }[]  // named heroes
    adventures: string[]    // effectIds
  }
  startingBuffs?: { effectId: string; stat: 'atk' | 'def'; value: number }[]
  encounters: EncounterDefinition[]
}
