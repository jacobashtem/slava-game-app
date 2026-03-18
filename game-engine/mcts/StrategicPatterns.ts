/**
 * StrategicPatterns — domain knowledge for MCTS V5 human-like AI.
 *
 * Provides:
 * - effectThreatTier() — ranks creature effects 0-10 (shared by eval, combat, rollout)
 * - KNOWN_SYNERGIES — static synergy pairs for eval bonus
 * - assessGameSituation() — high-level game posture analysis
 * - killValue() — trade-value scoring for combat decisions
 */

import type { LightState, LightCard } from './LightweightState'
import { lightFieldCards, lightFieldCount } from './LightweightState'
import { GOLD_EDITION_RULES } from '../constants'

const PS_TARGET = GOLD_EDITION_RULES.GLORY_WIN_TARGET
const SOUL_THRESHOLD = GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD

// ===================================================================
// EFFECT THREAT TIER — 0-10 scale
// ===================================================================

const THREAT_TIERS: Record<string, number> = {
  // Tier S (8-10): game-winning effects
  baba_jaga_death_growth: 10,
  smierc_death_growth_save: 10,
  strzyga_lifesteal: 9,
  chlop_extra_attack: 9,
  cicha_kill_weak: 8,
  poludnica_kill_weakest: 8,

  // Tier A (5-7): high-impact effects
  bazyliszek_paralyze: 7,
  kikimora_free_attack: 7,
  lesnica_double_attack: 7,
  swiatogor_line_cleave: 7,
  morowa_dziewica_aoe_all: 7,
  wapierz_invincible_hunger: 6,
  rusalka_mirror_attack: 6,
  kania_chain_kill: 6,
  konny_cleave: 6,
  wila_convert_weak_enemies: 6,
  zmora_grow_sacrifice: 5,
  utopiec_half_damage: 5,

  // Tier B (3-4): solid effects
  barstuk_ally_regen: 4,
  wolch_heal: 4,
  korgorusze_recover_glory: 4,
  chowaniec_intercept: 4,
  mavka_line_shield: 4,
  blotnik_taunt: 3,
  chasnik_gold_on_kill: 3,
  rodzanice_swap_buff: 3,
  polewik_buff_neighbors: 3,
  brzegina_shield_for_gold: 3,
  domowik_hand_size: 3,
  zmije_glory_on_empty_field: 3,
  gryf_double_dmg_on_play_turn: 3,
  bogunka_instant_kill_human: 3,

  // Tier C (1-2): minor effects
  bledny_ognik_bounce: 2,
  jaroszek_paralyze: 2,
  woj_mass_deploy: 2,
  tur_ranged_magic_immune: 2,
  szeptunka_damage_reduction: 2,
  guslarka_bonus_vs_demon: 2,
  bies_reverse_damage: 2,
  krol_wezow_always_counter: 2,
  siemiargl_cleanse: 2,
  aitwar_steal_hand: 2,
  smocze_jajo_hatch: 2,
  kosciej_melee_resurrection: 2,
  latawiec_mutual_death: 1,
  lamia_death_reward: 1,
  rumak_mount: 1,
  dziki_mysliwy_return_on_kill: 1,
  bezkost_atk_drain: 1,
  lucznik_pin: 1,
  zerca_spell_shield: 1,
  najemnik_mercenary: 1,
  biali_ludzie_wound_disarm: 1,
  bugaj_def_to_atk: 1,
}

/** Returns threat tier 0-10 for a creature's effectId. 0 = vanilla / unknown. */
export function effectThreatTier(effectId: string): number {
  return THREAT_TIERS[effectId] ?? 0
}

// ===================================================================
// KNOWN SYNERGIES — static pairs that amplify each other
// ===================================================================

const SYNERGY_PAIRS: [string, string][] = [
  ['baba_jaga_death_growth', 'zmora_grow_sacrifice'],
  ['baba_jaga_death_growth', 'smierc_death_growth_save'],
  ['baba_jaga_death_growth', 'darmopych_friendly_fire'],
  ['chlop_extra_attack', 'lesnica_double_attack'],
  ['chlop_extra_attack', 'kikimora_free_attack'],
  ['barstuk_ally_regen', 'wapierz_invincible_hunger'],
  ['barstuk_ally_regen', 'strzyga_lifesteal'],
  ['chowaniec_intercept', 'rusalka_mirror_attack'],
  ['chowaniec_intercept', 'krol_wezow_always_counter'],
  ['mavka_line_shield', 'szeptunka_damage_reduction'],
  ['korgorusze_recover_glory', 'zmije_glory_on_empty_field'],
  ['blotnik_taunt', 'polewik_buff_neighbors'],
  ['chasnik_gold_on_kill', 'kania_chain_kill'],
  ['cicha_kill_weak', 'morowa_dziewica_aoe_all'],
  ['rodzanice_swap_buff', 'polewik_buff_neighbors'],
]

const SYNERGY_SET = new Set<string>()
for (const [a, b] of SYNERGY_PAIRS) {
  SYNERGY_SET.add(`${a}+${b}`)
  SYNERGY_SET.add(`${b}+${a}`)
}

/** Check if two effectIds form a known synergy pair. */
export function hasSynergy(eid1: string, eid2: string): boolean {
  return SYNERGY_SET.has(`${eid1}+${eid2}`)
}

/** Count synergy pairs among creatures on field for given side. */
export function countFieldSynergies(s: LightState, side: number): number {
  const cards = lightFieldCards(s, side)
  let count = 0
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i]!.effectId && cards[j]!.effectId && hasSynergy(cards[i]!.effectId, cards[j]!.effectId)) {
        count++
      }
    }
  }
  return count
}

// ===================================================================
// KILL VALUE — trade-value scoring for combat
// ===================================================================

/** Compute kill value of a creature (how much it's worth to kill/lose). */
export function killValue(c: LightCard): number {
  return c.atk * 1.5 + c.def * 0.5 + effectThreatTier(c.effectId) * 3
}

// ===================================================================
// PRIORITY KILL SETS — effects that must be killed ASAP
// ===================================================================

/** Healers/regen that negate our damage if left alive. */
const HEALER_EFFECTS = new Set([
  'barstuk_ally_regen', 'wolch_heal', 'rodzanice_swap_buff',
])

/** Snowball growers that become unstoppable if left alive. */
const GROWER_EFFECTS = new Set([
  'baba_jaga_death_growth', 'smierc_death_growth_save', 'zmora_grow_sacrifice',
  'polewik_buff_neighbors',
])

/** PS-generating effects that win the resource race. */
const PS_GEN_EFFECTS = new Set([
  'korgorusze_recover_glory', 'chasnik_gold_on_kill', 'zmije_glory_on_empty_field',
  'lamia_death_reward',
])

export function isHealerEffect(effectId: string): boolean {
  return HEALER_EFFECTS.has(effectId)
}

export function isGrowerEffect(effectId: string): boolean {
  return GROWER_EFFECTS.has(effectId)
}

export function isPSGenEffect(effectId: string): boolean {
  return PS_GEN_EFFECTS.has(effectId)
}

/** Priority bonus for killing this creature (0 or 30). */
export function priorityKillBonus(effectId: string): number {
  if (HEALER_EFFECTS.has(effectId) || GROWER_EFFECTS.has(effectId)) return 30
  return 0
}

// ===================================================================
// GAME SITUATION ASSESSMENT
// ===================================================================

export interface GameSituation {
  phase: 'opening' | 'midgame' | 'endgame' | 'closing'
  posture: 'aggressive' | 'defensive' | 'neutral'
  winPath: 'ps_race' | 'elimination' | 'attrition'
  urgency: number  // 0-1, how urgent it is to close the game
}

/**
 * Assess the strategic situation from `side`'s perspective.
 * O(n) where n = field creatures — safe for hot path.
 */
export function assessGameSituation(s: LightState, side: number): GameSituation {
  const opp = 1 - side
  const myPS = s.ps[side]!
  const oppPS = s.ps[opp]!
  const myFieldCount = lightFieldCount(s, side)
  const oppFieldCount = lightFieldCount(s, opp)
  const myTotal = s.deckCount[side]! + s.hands[side]!.length + myFieldCount
  const oppTotal = s.deckCount[opp]! + s.hands[opp]!.length + oppFieldCount

  // Phase
  let phase: GameSituation['phase']
  if (s.round <= 3) phase = 'opening'
  else if (myPS >= PS_TARGET - 2 || oppPS >= PS_TARGET - 2) phase = 'closing'
  else if (s.round <= 7) phase = 'midgame'
  else phase = 'endgame'

  // Posture
  let myPower = 0, oppPower = 0
  for (const c of lightFieldCards(s, side)) myPower += c.atk + c.def
  for (const c of lightFieldCards(s, opp)) oppPower += c.atk + c.def

  let posture: GameSituation['posture']
  if (myPower > oppPower * 1.5 || myPS > oppPS + 3) posture = 'aggressive'
  else if (oppPower > myPower * 1.3 || oppPS > myPS + 3) posture = 'defensive'
  else posture = 'neutral'

  // Win path
  let winPath: GameSituation['winPath']
  if (oppTotal <= 5 && oppFieldCount <= 2) winPath = 'elimination'
  else if (myPS >= PS_TARGET - 3 && myPS > oppPS) winPath = 'ps_race'
  else winPath = 'attrition'

  // Urgency (0-1): how critical it is to close the game NOW
  let urgency = 0
  if (myPS >= PS_TARGET - 1) urgency = 1.0
  else if (myPS >= PS_TARGET - 2) urgency = 0.7
  else if (oppPS >= PS_TARGET - 1) urgency = 0.9 // opponent about to win — urgent!
  else if (oppPS >= PS_TARGET - 2) urgency = 0.5
  else if (s.round >= 12) urgency = 0.3 + Math.min(0.4, (s.round - 12) * 0.05)
  else urgency = Math.min(0.2, s.round * 0.02)

  return { phase, posture, winPath, urgency }
}

// ===================================================================
// PS MANAGEMENT
// ===================================================================

/**
 * Should we spend PS on enhanced adventure?
 * Returns true only if we have slack — not racing to PS target.
 */
export function canAffordEnhancedSmart(
  myPS: number,
  oppPS: number,
  round: number,
): boolean {
  if (myPS <= 1) return false
  // Never spend if close to winning
  if (myPS >= PS_TARGET - 2) return false
  // Don't spend if opponent is ahead and we're trailing
  if (oppPS > myPS + 1 && myPS <= 3) return false
  // Early game: spend freely if PS >= 3
  if (round <= 4) return myPS >= 3
  // Late game: conservative
  return myPS >= 4
}

// ===================================================================
// CREATURE PLAY PHASE BONUS (for rollout quickScore)
// ===================================================================

/** Phase-aware bonus for creature play in rollout. O(1). */
export function phaseBonus(effectId: string, round: number): number {
  if (round <= 3) {
    // Early: prioritize ON_PLAY creatures and growers
    if (effectId === 'woj_mass_deploy' || effectId === 'bledny_ognik_bounce' ||
        effectId === 'kresnik_choose_buff' || effectId === 'siemiargl_cleanse') return 5
    if (GROWER_EFFECTS.has(effectId)) return 3
    return 0
  }
  if (round <= 7) {
    // Mid: prioritize high-ATK killers
    if (effectId === 'chlop_extra_attack' || effectId === 'lesnica_double_attack' ||
        effectId === 'kikimora_free_attack' || effectId === 'swiatogor_line_cleave') return 5
    if (effectId === 'kania_chain_kill' || effectId === 'cicha_kill_weak') return 4
    return 0
  }
  // Late: prioritize PS-generating creatures
  if (PS_GEN_EFFECTS.has(effectId)) return 5
  if (effectId === 'chlop_extra_attack' || effectId === 'lesnica_double_attack') return 3
  return 0
}

// ===================================================================
// COUNTER-BENEFIT CREATURES (should be in DEFENSE)
// ===================================================================

const PREFER_DEFENSE_EFFECTS = new Set([
  'rusalka_mirror_attack',   // mirror damage only in specific position
  'krol_wezow_always_counter', // always counters — benefits from DEFENSE
  'chowaniec_intercept',     // intercepts in DEFENSE
  'bies_reverse_damage',     // reflects damage — wants to be hit
])

/** Returns true if creature benefits more from DEFENSE position. */
export function prefersDefense(effectId: string): boolean {
  return PREFER_DEFENSE_EFFECTS.has(effectId)
}
