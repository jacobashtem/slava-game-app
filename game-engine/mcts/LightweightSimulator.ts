/**
 * LightweightSimulator V3 — pełna symulacja gry na LightState.
 *
 * V3: Kompletne efekty (~200 creature + ~120 adventure effects).
 *
 * Poprawny combat flow (identyczny z CombatResolver):
 *   1. ON_ATTACK triggers
 *   2. Damage calculation (z modyfikatorami)
 *   3. ON_DAMAGE_DEALT / ON_DAMAGE_RECEIVED
 *   4. Counterattack (defender w DEFENSE → bije z pełną mocą PRZED śmiercią)
 *   5. Death check → ON_DEATH → ON_KILL → ON_ANY_DEATH
 *   6. Soul harvest (20 SP → +1 PS)
 *
 * Win conditions (identyczne z LineManager.checkWinCondition):
 *   - PS >= GLORY_WIN_TARGET
 *   - Opponent: deck empty + no creatures on field
 *   - Opponent: no creatures anywhere (field + hand + deck)
 *
 * Efekty zaimplementowane per trigger type.
 * Mutuje stan IN-PLACE (zero alokacji — caller musi klonować).
 */

import type { LightState, LightCard, LightAdventure } from './LightweightState'
import { lightFieldCards, lightFieldCount, evaluateLight, hasFieldEffect, forEachFieldCard } from './LightweightState'
import { GOLD_EDITION_RULES, CardPosition } from '../constants'
import type { MCTSMove } from './types'
import { effectThreatTier, phaseBonus, priorityKillBonus, prefersDefense, canAffordEnhancedSmart } from './StrategicPatterns'

const SOUL_THRESHOLD = GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD
const PS_TARGET = GOLD_EDITION_RULES.GLORY_WIN_TARGET
const MAX_FIELD = GOLD_EDITION_RULES.MAX_FIELD_CREATURES

// ===================================================================
// V2 SOFTMAX SAMPLING — probabilistic rollout decisions
// ===================================================================

/** Temperature for rollout softmax (after [0,1] normalization). Lower = more greedy. */
const ROLLOUT_TEMP = 0.4

/**
 * Sample index from softmax distribution over normalized scores.
 * Scores are normalized to [0,1] internally, so temperature is scale-independent.
 * Returns argmax when items <= 1. ~0.0002ms for 5 items.
 */
function softmaxSample(scores: number[]): number {
  const n = scores.length
  if (n <= 1) return 0

  // Normalize to [0, 1]
  let maxS = scores[0]!, minS = scores[0]!
  for (let i = 1; i < n; i++) {
    if (scores[i]! > maxS) maxS = scores[i]!
    if (scores[i]! < minS) minS = scores[i]!
  }
  const range = maxS - minS
  if (range < 0.001) return Math.floor(Math.random() * n) // all equal → random

  // Softmax with temperature
  let sum = 0
  const exps = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    exps[i] = Math.exp(((scores[i]! - minS) / range) / ROLLOUT_TEMP)
    sum += exps[i]!
  }

  let r = Math.random() * sum
  for (let i = 0; i < n; i++) {
    r -= exps[i]!
    if (r <= 0) return i
  }
  return n - 1
}

// ===================================================================
// CREATURE SCORING (dla rollout AI decisions)
// ===================================================================

/** Phase-aware quickScore — uses effectThreatTier + phaseBonus. */
function quickScore(c: LightCard, round?: number): number {
  const tier = effectThreatTier(c.effectId)
  let s = c.atk + c.def + tier * 1.5
  if (round !== undefined) {
    s += phaseBonus(c.effectId, round)
  }
  return s
}

// ===================================================================
// WIN CONDITION CHECK (matches LineManager.checkWinCondition exactly)
// ===================================================================

function checkWin(s: LightState): void {
  if (s.winner !== -1) return
  if (s.round <= 1) return

  for (let side = 0; side < 2; side++) {
    const opp = 1 - side

    // PS <= 0 → loss
    if (s.ps[side]! <= 0 && s.ps[opp]! > 0) {
      s.winner = opp
      return
    }

    // PS win (with 2-point lead rule when both >= target)
    if (s.ps[side]! >= PS_TARGET) {
      if (s.ps[opp]! >= PS_TARGET) {
        // Both at target — need 2-point lead
        if (s.ps[side]! >= s.ps[opp]! + 2) { s.winner = side; return }
      } else {
        s.winner = side
        return
      }
    }

    // No tiebreaker — game resolves naturally via PS or elimination

    // Elimination: opponent deck empty + no creatures on field
    const oppFieldCount = lightFieldCount(s, opp)
    const oppDeckEmpty = s.decks[opp]!.length === 0 && s.deckCount[opp]! <= 0
    const oppNoCreaturesInHand = !s.hands[opp]!.some(c => c.cardType === 0)

    if (oppDeckEmpty && oppFieldCount === 0) {
      s.winner = side
      return
    }
    // No creatures ANYWHERE
    if (oppFieldCount === 0 && oppNoCreaturesInHand && oppDeckEmpty) {
      s.winner = side
      return
    }
  }
}

// ===================================================================
// COMBAT: damage calculation with ALL effect modifiers
// ===================================================================

function calculateDamage(attacker: LightCard, defender: LightCard, allCards: LightCard[]): number {
  if (attacker.isSilenced && attacker.cannotAttack) return 0

  let dmg = attacker.atk
  const atkEid = attacker.effectId
  const defEid = defender.effectId
  const atkS = attacker.isSilenced
  const defS = defender.isSilenced

  // === ATTACKER MODIFIERS ===

  // Gryf: ×2 damage if attacked same round as played
  if (atkEid === 'gryf_double_dmg_on_play_turn' && !atkS && attacker.turnsInPlay === 0) dmg *= 2

  // Rusalka: uses TARGET's ATK
  if (atkEid === 'rusalka_mirror_attack' && !atkS) dmg = defender.atk

  // Guslarka: +3 vs Weles domain (demons)
  if (atkEid === 'guslarka_bonus_vs_demon' && !atkS && defender.domain === 4) dmg += 3

  // Łapiduch: bonus vs Weles domain
  if (atkEid === 'lapiduch_demon_hunter' && !atkS && defender.domain === 4) dmg += 3

  // Naczelnik: +1 per human ally on field when attacking
  if (atkEid === 'naczelnik_human_rally' && !atkS) {
    dmg += allCards.filter(c => c.owner === attacker.owner && c !== attacker && c.domain === 2).length
  }

  // Szalinc/Rybi Krol: negate/pierce immunity
  const ignoresImmunity = !atkS && (atkEid === 'szalinc_negate_immunity' || atkEid === 'rybi_krol_pierce_immunity')

  // === DEFENDER IMMUNITY/RESISTANCE ===
  if (!ignoresImmunity) {
    // Tur: immune to Ranged + Magic
    if (defEid === 'tur_ranged_magic_immune' && !defS) {
      if (attacker.attackType === 2 || attacker.attackType === 3) return 0
    }
    // Matoha: immune to Magic
    if (defEid === 'matoha_anti_magic' && !defS) {
      if (attacker.attackType === 2) return 0
    }
    // Wilkołak: immune to melee ATK < 7
    if (defEid === 'wilkolak_melee_immune' && !defS) {
      if (attacker.attackType === 0 && attacker.atk < 7) return 0
    }
    // Stukacz: immune to melee ATK > own
    if (defEid === 'stukacz_strong_immune' && !defS) {
      if (attacker.attackType === 0 && attacker.atk > defender.atk) return 0
    }
    // Dydko: immune to melee ATK >= own
    if (defEid === 'dydko_strong_immune' && !defS) {
      if (attacker.attackType === 0 && attacker.atk >= defender.atk) return 0
    }
    // Grad: only takes magic + elemental damage
    if (defEid === 'grad_magic_element_only' && !defS) {
      if (attacker.attackType !== 2 && attacker.attackType !== 1) return 0
    }
    // Kudłak: immune if attacker ATK < defender DEF
    if (defEid === 'kudlak_conditional_immunity' && !defS) {
      if (attacker.atk < defender.def) return 0
    }
    // isImmune flag
    if (defender.isImmune && !defS) return 0
  }

  // === DAMAGE REDUCTION ===

  // Utopiec: ÷2 damage
  if (defEid === 'utopiec_half_damage' && !defS) dmg = Math.floor(dmg / 2)

  // Szeptunka aura: all allies -1 damage
  const defSide = defender.owner
  if (allCards.some(c => c.owner === defSide && c.effectId === 'szeptunka_damage_reduction' && !c.isSilenced)) {
    dmg = Math.max(0, dmg - 1)
  }

  // Mavka: allies in line take -2 damage
  if (allCards.some(c => c.owner === defSide && c.effectId === 'mavka_line_shield' && !c.isSilenced && c !== defender)) {
    dmg = Math.max(0, dmg - 2)
  }

  // Znachor: absorb first damage (simplified: -3 on first hit)
  if (defEid === 'znachor_absorb' && !defS && defender.turnsInPlay <= 1) {
    dmg = Math.max(0, dmg - 3)
  }

  // Zerca Welesa: Weles domain buff (+1 DEF reduction = same as reducing damage)
  // Already handled via base stats from conversion

  return Math.max(0, dmg)
}

function shouldCounterattack(attacker: LightCard, defender: LightCard, allCards: LightCard[]): boolean {
  if (defender.position !== 0) return false // only DEFENSE counters
  // Krol Wezow: always counters (even in ATTACK)
  if (defender.effectId === 'krol_wezow_always_counter' && !defender.isSilenced) return true
  // Dobroochoczy: no counterattacks while active
  const defSide = defender.owner
  if (allCards.some(c => c.owner !== defSide && c.effectId === 'dobroochoczy_no_counter' && !c.isSilenced)) return false
  // Cmuch: attacker doesn't receive counterattacks
  if (attacker.effectId === 'cmuch_no_counter_received' && !attacker.isSilenced) return false
  return defender.position === 0
}

// ===================================================================
// DEATH PROCESSING — expanded with all ON_DEATH / ON_KILL / ON_ANY_DEATH
// ===================================================================

function processDeath(
  s: LightState,
  dead: LightCard,
  killer: LightCard | null,
  killerSide: number,
): void {
  const deadSide = dead.owner

  // Remove from field
  removeFromField(s, dead)

  // === ON_DEATH triggers ===

  // Żar-Ptak: -4 DEF to ALL creatures
  if (dead.effectId === 'zar_ptak_death_explosion' && !dead.isSilenced) {
    for (const c of [...lightFieldCards(s, 0), ...lightFieldCards(s, 1)]) {
      c.def -= 4
    }
    for (let side = 0; side < 2; side++) {
      for (const c of lightFieldCards(s, side)) {
        if (c.def <= 0) removeFromField(s, c)
      }
    }
  }

  // Latawiec: killer dies too
  if (dead.effectId === 'latawiec_mutual_death' && !dead.isSilenced && killer) {
    if (lightFieldCards(s, killerSide).includes(killer)) {
      removeFromField(s, killer)
    }
  }

  // Kościej: resurrect with 1 DEF if killed by melee
  if (dead.effectId === 'kosciej_melee_resurrection' && !dead.isSilenced && killer) {
    if (killer.attackType === 0) {
      dead.def = 1; dead.maxDef = Math.max(dead.maxDef, 1)
      dead.hasAttacked = true
      // Place back on field
      const base = deadSide * 3
      if (s.field[base]!.length < MAX_FIELD) {
        s.field[base]!.push(dead)
      }
    }
  }

  // Lamia: +1 PS to owner on death
  if (dead.effectId === 'lamia_death_reward' && !dead.isSilenced) {
    s.ps[deadSide]!++
  }

  // === ON_KILL triggers (killer side) ===
  if (killer && killerSide !== deadSide) {
    const kEid = killer.effectId
    const kS = killer.isSilenced

    // Chasnik: +1 PS per kill
    if (kEid === 'chasnik_gold_on_kill' && !kS) s.ps[killerSide]!++

    // Konny/Wąż Tugaryn: overkill cleave
    if ((kEid === 'konny_cleave' || kEid === 'waz_tugaryn_cleave') && !kS) {
      const overkill = killer.atk - dead.def
      if (overkill > 0) {
        const nextTargets = lightFieldCards(s, deadSide)
        if (nextTargets.length > 0) {
          const next = nextTargets[0]!
          next.def -= overkill
          if (next.def <= 0) {
            processDeath(s, next, killer, killerSide)
            s.soulPoints[killerSide]! += next.soulValue
            checkSoulHarvest(s, killerSide)
          }
        }
      }
    }

    // Kania: chain kill (if target was weaker, can attack again)
    if (kEid === 'kania_chain_kill' && !kS) {
      if (dead.atk + dead.def < killer.atk + killer.def) {
        killer.hasAttacked = false
      }
    }

    // Dziki Myśliwy: return to hand after kill
    if (kEid === 'dziki_mysliwy_return_on_kill' && !kS) {
      removeFromField(s, killer)
      s.hands[killerSide]!.push(killer)
    }

    // Czarnoksiężnik: steal ability (simplified — gain +3 ATK)
    if (kEid === 'czarnoksieznik_steal_abilities' && !kS) {
      killer.atk += 3
    }

    // Dzicy Ludzie: add killed creature to hand (simplified: draw from deck)
    if (kEid === 'dzicy_ludzie_steal_killed' && !kS) {
      if (s.decks[killerSide]!.length > 0) {
        s.hands[killerSide]!.push(s.decks[killerSide]!.pop()!)
        s.deckCount[killerSide] = s.decks[killerSide]!.length
      }
    }

    // Przylożnik: heal all allies +2 DEF when killing Żywi domain creature
    if (kEid === 'przyloznik_heal_on_zyvi_kill' && !kS && dead.domain === 2) {
      for (const ally of lightFieldCards(s, killerSide)) {
        ally.def = Math.min(ally.maxDef, ally.def + 2)
      }
    }

    // Dziwożona: swap a card (simplified: no-op — too complex for rollout)
  }

  // === ON_ANY_DEATH triggers (both sides) ===
  for (let side = 0; side < 2; side++) {
    for (const c of lightFieldCards(s, side)) {
      if (c.isSilenced) continue

      // Baba Jaga: +1/+1 per ANY death
      if (c.effectId === 'baba_jaga_death_growth') {
        c.atk++; c.def++; c.maxDef++
      }
      // Śmierć: +2/+2 per ANY death
      if (c.effectId === 'smierc_death_growth_save') {
        c.atk += 2; c.def += 2; c.maxDef += 2
      }
      // Zmora: +1/+1 on ally death (sacrifice growth)
      if (c.effectId === 'zmora_grow_sacrifice' && side === deadSide) {
        c.atk++; c.def++; c.maxDef++
      }
    }
  }

  // Soul harvest for killer
  if (killerSide !== deadSide) {
    s.soulPoints[killerSide]! += dead.soulValue
    checkSoulHarvest(s, killerSide)
  }
}

function checkSoulHarvest(s: LightState, side: number): void {
  if (s.soulPoints[side]! >= SOUL_THRESHOLD) {
    const gained = Math.floor(s.soulPoints[side]! / SOUL_THRESHOLD)
    s.ps[side]! += gained
    s.soulPoints[side]! %= SOUL_THRESHOLD
  }
}

function removeFromField(s: LightState, card: LightCard): void {
  for (let i = 0; i < 6; i++) {
    const idx = s.field[i]!.indexOf(card)
    if (idx !== -1) { s.field[i]!.splice(idx, 1); return }
  }
}

// ===================================================================
// ATTACK RANGE VALIDATION — with taunt/intercept
// ===================================================================

function getValidTargets(s: LightState, attacker: LightCard, side: number): LightCard[] {
  const opp = 1 - side
  const oppBase = opp * 3
  const enemies = lightFieldCards(s, opp).filter(c => c.cardType === 0 && c.def > 0)

  if (enemies.length === 0) return []

  // Blotnik taunt: must attack Blotnik first if present on front line
  const tauntCreatures = enemies.filter(c =>
    c.effectId === 'blotnik_taunt' && !c.isSilenced && c.def > 0
  )
  if (tauntCreatures.length > 0) {
    // Check if attacker can reach taunt creatures
    const reachable = tauntCreatures.filter(c => canReach(attacker, c, s, oppBase))
    if (reachable.length > 0) return reachable
  }

  // Chowaniec intercept: redirect attacks to self
  const interceptors = enemies.filter(c =>
    c.effectId === 'chowaniec_intercept' && !c.isSilenced && c.def > 0
  )
  if (interceptors.length > 0) {
    const reachable = interceptors.filter(c => canReach(attacker, c, s, oppBase))
    if (reachable.length > 0) return reachable
  }

  // Ranged/Magic → any line
  if (attacker.attackType === 2 || attacker.attackType === 3) return enemies
  // Flying → any line (if not grounded)
  if (attacker.isFlying && !attacker.isGrounded && attacker.attackType <= 1) return enemies

  // Melee/Elemental → must be on FRONT line (L1) to attack, target enemy front line
  // V5 FIX: Check attacker is on FRONT line (matches GameEngine.canAttack)
  const attackerBase = attacker.owner * 3
  const attackerOnFront = s.field[attackerBase]!.includes(attacker)
  if (!attackerOnFront) return []  // MELEE on L2/L3 can't attack

  for (let lineOffset = 0; lineOffset < 3; lineOffset++) {
    const line = s.field[oppBase + lineOffset]!.filter(c => c.cardType === 0 && c.def > 0)
    if (line.length > 0) return line
  }
  return []
}

/** Check if attacker can reach a specific target based on attack type */
function canReach(attacker: LightCard, target: LightCard, s: LightState, oppBase: number): boolean {
  if (attacker.attackType === 2 || attacker.attackType === 3) return true
  if (attacker.isFlying && !attacker.isGrounded) return true
  // V5 FIX: Melee/Elemental must be on FRONT line to attack
  const attackerBase = attacker.owner * 3
  if (!s.field[attackerBase]!.includes(attacker)) return false
  // Melee: can only reach enemy front line
  for (let lineOffset = 0; lineOffset < 3; lineOffset++) {
    const line = s.field[oppBase + lineOffset]!
    if (line.length > 0) return line.includes(target)
  }
  return false
}

// ===================================================================
// ON_PLAY EFFECTS — triggered when creature enters field
// ===================================================================

function processOnPlay(s: LightState, card: LightCard, side: number): void {
  if (card.isSilenced) return
  const opp = 1 - side

  switch (card.effectId) {
    case 'bledny_ognik_bounce': {
      const enemies = lightFieldCards(s, opp)
      if (enemies.length > 0) {
        const target = enemies[Math.floor(Math.random() * enemies.length)]!
        removeFromField(s, target)
        s.hands[opp]!.push(target)
      }
    } break
    case 'cmentarna_baba_resurrect':
      if (s.decks[side]!.length > 0) {
        const drawn = s.decks[side]!.pop()!
        const base = side * 3
        if (s.field[base]!.length < MAX_FIELD) {
          drawn.owner = side; drawn.position = 0; drawn.hasAttacked = true; drawn.turnsInPlay = 0
          s.field[base]!.push(drawn)
        } else { s.hands[side]!.push(drawn) }
        s.deckCount[side] = s.decks[side]!.length
      }
      break
    case 'darmopych_friendly_fire':
      forEachFieldCard(s, side, ally => {
        if (ally !== card) {
          ally.def -= 2
          if (ally.def <= 0) processDeath(s, ally, card, side)
        }
      })
      break
    case 'jaroszek_paralyze': {
      const enemies = lightFieldCards(s, opp).filter(c => c.paralyzeRounds < 0)
      if (enemies.length > 0) enemies[Math.floor(Math.random() * enemies.length)]!.paralyzeRounds = 2
    } break
    case 'kresnik_choose_buff': {
      let weakest: LightCard | null = null
      forEachFieldCard(s, side, c => {
        if (c !== card && (!weakest || c.def < weakest.def)) weakest = c
      })
      if (weakest) { (weakest as LightCard).atk += 2; (weakest as LightCard).def += 2; (weakest as LightCard).maxDef += 2 }
    } break
    case 'siemiargl_cleanse':
      forEachFieldCard(s, side, ally => {
        if (ally !== card) { ally.isSilenced = false; ally.paralyzeRounds = -1; ally.cannotAttack = false }
      })
      break
    case 'woj_mass_deploy':
      if (s.hands[side]!.length > 0 && lightFieldCount(s, side) < MAX_FIELD) {
        const extra = s.hands[side]!.shift()!
        extra.owner = side; extra.position = 0; extra.hasAttacked = true; extra.turnsInPlay = 0
        s.field[side * 3]!.push(extra)
      }
      break
    case 'aitwar_steal_hand':
      if (s.hands[opp]!.length > 0) {
        const stolen = s.hands[opp]!.pop()!
        stolen.owner = side; s.hands[side]!.push(stolen)
      }
      break
    case 'gorynych_merge_dragons': {
      const dragons = lightFieldCards(s, side).filter(c => c !== card && c.effectId.includes('gorynych'))
      for (const d of dragons) {
        card.atk += d.atk; card.def += d.def; card.maxDef += d.def
        removeFromField(s, d)
      }
    } break
    case 'strela_flash_counter': {
      const enemies = lightFieldCards(s, opp)
      if (enemies.length > 0) {
        const target = enemies.reduce((a, b) => a.atk > b.atk ? a : b)
        target.def -= 3
        if (target.def <= 0) processDeath(s, target, card, side)
      }
    } break
    case 'zerca_spell_shield': card.isImmune = true; break
    case 'wieszczy_spy_burn':
      removeFromField(s, card)
      card.owner = opp; s.field[opp * 3]!.push(card)
      break
    case 'wila_convert_weak_enemies':
      for (const enemy of lightFieldCards(s, opp)) {
        if (enemy.def <= 2 && !enemy.isSilenced && lightFieldCount(s, side) < MAX_FIELD) {
          removeFromField(s, enemy)
          enemy.owner = side; s.field[side * 3]!.push(enemy)
        }
      }
      break
    case 'rumak_mount':
      card.atk += 3; card.def += 3; card.maxDef += 3; card.isFlying = true
      break
    // default: no ON_PLAY effect
  }
}

// ===================================================================
// ON_DAMAGE_DEALT — full effects after attack lands
// ===================================================================

function processOnDamageDealt(
  s: LightState,
  attacker: LightCard,
  target: LightCard,
  dmg: number,
  side: number,
): void {
  if (dmg <= 0) return
  const opp = 1 - side
  const eid = attacker.effectId

  if (attacker.isSilenced) return

  // Strzyga: lifesteal
  if (eid === 'strzyga_lifesteal') {
    attacker.def = Math.min(attacker.maxDef, attacker.def + dmg)
  }

  // Bezkost: drain ATK instead of DEF
  if (eid === 'bezkost_atk_drain') {
    target.atk = Math.max(0, target.atk - dmg)
    target.def += dmg // undo DEF damage, apply to ATK instead
  }

  // Biali Ludzie: disarm on damage
  if (eid === 'biali_ludzie_wound_disarm') {
    target.cannotAttack = true
  }

  // Bazyliszek: paralyze on damage
  if (eid === 'bazyliszek_paralyze') {
    target.paralyzeRounds = 2
  }

  // Bogunka: instant kill human domain (Perun=1, Zyvi=2)
  if (eid === 'bogunka_instant_kill_human' && (target.domain === 1 || target.domain === 2)) {
    target.def = 0
  }

  // Junak: double hit (if didn't kill, attack again for same damage)
  if (eid === 'junak_double_hit_kill' && target.def > 0) {
    target.def -= dmg
  }

  // Łucznik: pin target (can't change position → simplified as cannotAttack)
  if (eid === 'lucznik_pin') {
    target.cannotAttack = true
  }

  // Morowa Dziewica: AOE — damage ALL enemies
  if (eid === 'morowa_dziewica_aoe_all') {
    for (const enemy of lightFieldCards(s, opp)) {
      if (enemy !== target) {
        enemy.def -= dmg
        if (enemy.def <= 0) processDeath(s, enemy, attacker, side)
      }
    }
  }

  // Światogor: line cleave — excess damage to next enemy in line
  if (eid === 'swiatogor_line_cleave') {
    const excess = dmg - (target.def + dmg) // before damage: target.def was (target.def + dmg) - dmg
    // Actually simpler: if target dies, deal remaining to next
    // This is already handled in overkill logic for konny, but Światogor
    // cleaves the WHOLE line, not overkill
    const others = lightFieldCards(s, opp).filter(c => c !== target && c.def > 0)
    for (const other of others) {
      other.def -= Math.floor(dmg / 2)
      if (other.def <= 0) processDeath(s, other, attacker, side)
    }
  }

  // Zagorkinia: steal 1 ATK from target
  if (eid === 'zagorkinia_curse_drain') {
    target.atk = Math.max(0, target.atk - 1)
    attacker.atk++
  }

  // Homen: convert killed creature (simplified: if target will die, draw card)
  if (eid === 'homen_convert_on_death' && target.def <= 0) {
    if (s.decks[side]!.length > 0) {
      s.hands[side]!.push(s.decks[side]!.pop()!)
      s.deckCount[side] = s.decks[side]!.length
    }
  }

  // Wisielec: bounce both attacker and target to hands
  if (eid === 'wisielec_bounce_both') {
    removeFromField(s, attacker)
    s.hands[side]!.push(attacker)
    if (target.def > 0) {
      removeFromField(s, target)
      s.hands[opp]!.push(target)
    }
  }
}

// ===================================================================
// ON_DAMAGE_RECEIVED — triggered on defender after taking damage
// ===================================================================

function processOnDamageReceived(
  s: LightState,
  defender: LightCard,
  attacker: LightCard,
  dmg: number,
): void {
  if (dmg <= 0 || defender.isSilenced) return
  const eid = defender.effectId

  // Bies: reflect damage back to attacker
  if (eid === 'bies_reverse_damage') {
    attacker.def -= Math.floor(dmg / 2)
  }

  // Brzegina: spend 1 PS to negate damage
  if (eid === 'brzegina_shield_for_gold') {
    const side = defender.owner
    if (s.ps[side]! > 0) {
      s.ps[side]!--
      defender.def += dmg // undo damage
    }
  }

  // Bugaj: convert lost DEF to ATK
  if (eid === 'bugaj_def_to_atk') {
    defender.atk += Math.min(dmg, 3) // cap at +3 to prevent runaway
  }
}

// ===================================================================
// TURN SIMULATION — full logic with ON_PLAY, adventures, combat
// ===================================================================

function simulateTurn(s: LightState): boolean {
  if (s.winner !== -1) return false

  const side = s.currentTurn
  const opp = 1 - side
  const base = side * 3
  let didAttack = false

  // === ON_TURN_START effects ===
  processTurnStart(s, side)
  checkWin(s)
  if (s.winner !== -1) return true

  // === PLAY: najlepsza istota z ręki ===
  if (s.creaturesPlayed[side]! < 1 && s.hands[side]!.length > 0) {
    const fieldCount = lightFieldCount(s, side)
    const hasNoLimit = hasFieldEffect(s, side, 'zupan_no_field_limit') || hasFieldEffect(s, side, 'adventure_arkona')
    if (fieldCount < MAX_FIELD || hasNoLimit) {
      const hand = s.hands[side]!
      // V2: Softmax selection — probabilistic creature play for diverse rollouts
      const creatureIdxs: number[] = []
      const creatureScores: number[] = []
      for (let i = 0; i < hand.length; i++) {
        if (hand[i]!.cardType !== 0) continue
        creatureIdxs.push(i)
        creatureScores.push(quickScore(hand[i]!, s.round))
      }
      const bestIdx = creatureIdxs.length > 0
        ? creatureIdxs[softmaxSample(creatureScores)]!
        : -1
      if (bestIdx >= 0) {
        const card = hand[bestIdx]!
        const lineOffset = card.attackType === 2 ? 2 : card.attackType === 3 ? 1 : 0
        // V5 FIX: MELEE/ELEMENTAL should only go to FRONT (L1) when enemies exist
        // Placing on L2/L3 makes them unable to attack
        const enemyPresent = lightFieldCount(s, opp) > 0
        const maxAttempts = (card.attackType <= 1 && enemyPresent) ? 1 : 3
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const li = base + ((lineOffset + attempt) % 3)
          if (s.field[li]!.length < MAX_FIELD || hasNoLimit) {
            card.position = 0; card.hasAttacked = false; card.owner = side; card.turnsInPlay = 0
            s.field[li]!.push(card)
            hand.splice(bestIdx, 1)
            s.creaturesPlayed[side]!++

            // Process ON_PLAY effects
            processOnPlay(s, card, side)
            checkWin(s)
            if (s.winner !== -1) return true
            break
          }
        }
      }
    }
  }

  // === PLAY: adventure card (1 per turn) ===
  playAdventure(s, side)
  checkWin(s)
  if (s.winner !== -1) return true

  // === COMBAT: pozycjonowanie (use cached field once) ===
  const myField = lightFieldCards(s, side)
  const enemyField = lightFieldCards(s, opp)
  let enemyPower = 0; let myPower = 0; let enemyMaxAtk = 0
  for (const c of enemyField) { enemyPower += c.atk + c.def; if (c.atk > enemyMaxAtk) enemyMaxAtk = c.atk }
  for (const c of myField) { myPower += c.atk + c.def }
  const isLosing = enemyPower > myPower * 1.3
  const isWinning = myPower > enemyPower * 1.5

  // Buka: force weaker enemies to DEFENSE
  const hasBuka = hasFieldEffect(s, side, 'buka_force_defense')

  for (const c of myField) {
    if (c.cardType !== 0) continue
    if (c.paralyzeRounds >= 0) { c.position = 0; continue }
    let pos: number
    // ATK = 0 → always DEFENSE
    if (c.atk === 0) pos = 0
    // Counter-benefit creatures → DEFENSE
    else if (prefersDefense(c.effectId)) pos = 0
    else if (isLosing && c.def <= enemyMaxAtk) pos = 0
    else if (c.def <= 1) pos = 0
    else if (isWinning || c.atk >= 3) pos = 1
    else if (enemyField.length === 0) pos = 0
    else pos = 1
    c.position = pos
  }

  if (hasBuka) {
    let myMaxAtk = 0
    for (const c of myField) { if (c.atk > myMaxAtk) myMaxAtk = c.atk }
    for (const c of enemyField) {
      if (c.atk < myMaxAtk) c.position = 0
    }
  }

  // === COMBAT: ataki ===
  const hasChlop = hasFieldEffect(s, side, 'chlop_extra_attack')
  let maxAttacks = hasChlop ? 2 : 1
  let attacksUsed = 0
  // Build allCards once for combat (used by calculateDamage/shouldCounterattack)
  const allCards = [...myField, ...enemyField]

  // Sort attackers by ATK desc (reuse myField)
  const attackers = myField
    .filter(c => c.position === 1 && !c.hasAttacked && !c.cannotAttack && c.cardType === 0 && c.paralyzeRounds < 0)
    .sort((a, b) => b.atk - a.atk)

  for (const attacker of attackers) {
    if (attacksUsed >= maxAttacks) break
    if (s.winner !== -1) break

    const isFreeAttack = attacker.effectId === 'kikimora_free_attack' && !attacker.isSilenced
    const isDouble = attacker.effectId === 'lesnica_double_attack' && !attacker.isSilenced

    const targets = getValidTargets(s, attacker, side)
    if (targets.length === 0) continue

    // Target scoring with effectThreatTier + priority-kill
    const targetScores: number[] = []
    for (const t of targets) {
      let sc = 0
      const dmg = calculateDamage(attacker, t, allCards)
      const canKill = t.def <= dmg
      const counterDmg = shouldCounterattack(attacker, t, allCards) ? t.atk : 0
      const willSurvive = attacker.def > counterDmg
      if (canKill) sc += 100
      if (canKill && willSurvive) sc += 50
      if (!willSurvive && !canKill) sc -= 80
      sc += t.atk * 2
      sc += effectThreatTier(t.effectId) * 10
      sc += priorityKillBonus(t.effectId)
      if (canKill) {
        const after = s.soulPoints[side]! + t.soulValue
        if (after >= SOUL_THRESHOLD) sc += 40
        if (s.ps[side]! + Math.floor(after / SOUL_THRESHOLD) >= PS_TARGET) sc += 200
      }
      if (!willSurvive && canKill) {
        const targetKV = t.atk * 1.5 + t.def * 0.5 + effectThreatTier(t.effectId) * 3
        const attackerKV = attacker.atk * 1.5 + attacker.def * 0.5 + effectThreatTier(attacker.effectId) * 3
        if (targetKV > attackerKV * 1.3) sc += 30
      }
      targetScores.push(sc)
    }

    // V2: Check if ANY target is worth attacking (threshold on best available)
    const bestScore = Math.max(...targetScores)
    const forceAttack = s.consecutivePasses[side]! >= 2 || (s.ps[side]! <= 1 && s.consecutivePasses[side]! >= 1)
    if (bestScore < -30 && !isLosing && !forceAttack) continue

    // V2: Softmax target selection — WHICH target is probabilistic
    const targetIdx = softmaxSample(targetScores)

    // === EXECUTE ATTACK ===
    attacker.hasAttacked = true
    didAttack = true
    if (!isFreeAttack) attacksUsed++

    const target = targets[targetIdx]!
    const dmg = calculateDamage(attacker, target, allCards)
    target.def -= dmg

    // ON_DAMAGE_DEALT
    processOnDamageDealt(s, attacker, target, dmg, side)

    // ON_DAMAGE_RECEIVED
    processOnDamageReceived(s, target, attacker, dmg)

    // Counterattack
    if (shouldCounterattack(attacker, target, allCards)) {
      const counterDmg = target.atk
      attacker.def -= counterDmg

      // ON_DAMAGE_DEALT from defender (counter)
      if (target.effectId === 'strzyga_lifesteal' && !target.isSilenced && counterDmg > 0) {
        target.def = Math.min(target.maxDef, target.def + counterDmg)
      }
      // ON_DAMAGE_RECEIVED on attacker from counter
      processOnDamageReceived(s, attacker, target, counterDmg)
    }

    // Rusalka mirror: attacker takes reflected damage
    if (target.effectId === 'rusalka_mirror_attack' && !target.isSilenced && target.position === 1 && dmg > 0) {
      attacker.def -= Math.floor(dmg / 2)
    }

    // Leszy: post attack defend (ally → defense after attacking)
    const hasLeszy = hasFieldEffect(s, side, 'leszy_post_attack_defend')
    if (hasLeszy) {
      attacker.position = 0
    }

    // Death checks
    if (target.def <= 0) {
      processDeath(s, target, attacker, side)
    }
    if (attacker.def <= 0) {
      processDeath(s, attacker, target, opp)
    }

    checkWin(s)
    if (s.winner !== -1) return true
  }

  // === PLUNDER ===
  if (s.round >= 3 && lightFieldCount(s, opp) === 0 && s.ps[opp]! > 0) {
    s.ps[side]!++; s.ps[opp]!--
    didAttack = true
  }

  checkWin(s)
  if (s.winner !== -1) return true

  // === ON_TURN_END effects ===
  processTurnEnd(s, side)

  // === ANTI-STALL ===
  if (lightFieldCount(s, side) > 0 && !didAttack) {
    s.consecutivePasses[side]!++
    if (s.consecutivePasses[side]! >= 3 && s.ps[side]! > 0) s.ps[side]!--
  } else {
    s.consecutivePasses[side] = 0
  }

  // === END TURN ===
  s.currentTurn = opp
  s.creaturesPlayed[opp] = 0
  s.adventuresPlayed[opp] = 0
  forEachFieldCard(s, opp, c => {
    c.hasAttacked = false
    c.turnsInPlay++
  })

  // Draw
  if (s.decks[opp]!.length > 0) {
    const hasLicho = hasFieldEffect(s, side, 'licho_block_draw')
    const hasBieda = hasFieldEffect(s, side, 'bieda_spy_block_draw')
    if (!hasLicho && !hasBieda) {
      const drawn = s.decks[opp]!.pop()!
      s.hands[opp]!.push(drawn)
    }
  }
  s.deckCount[opp] = s.decks[opp]!.length

  // Round increment after player2's turn
  if (opp === 0) s.round++

  // Poison/Paralyze tick for next player's creatures (use alloc — may modify field)
  for (const c of lightFieldCards(s, opp)) {
    if (c.poisonRounds >= 0) {
      c.poisonRounds--
      if (c.poisonRounds < 0) {
        c.def = 0
        processDeath(s, c, null, side)
      }
    }
    if (c.paralyzeRounds >= 0) {
      c.paralyzeRounds--
    }
  }

  checkWin(s)
  return true
}

// ===================================================================
// TURN START / END EFFECTS — expanded
// ===================================================================

function processTurnStart(s: LightState, side: number): void {
  const opp = 1 - side

  for (const c of lightFieldCards(s, side)) {
    if (c.isSilenced) continue

    // Cicha: kill ALL creatures with DEF < Cicha's ATK
    if (c.effectId === 'cicha_kill_weak') {
      for (let checkSide = 0; checkSide < 2; checkSide++) {
        const victims = lightFieldCards(s, checkSide).filter(v => v !== c && v.def < c.atk && v.def > 0)
        for (const v of victims) {
          processDeath(s, v, c, side)
        }
      }
    }

    // Południca: kill weakest creature overall
    if (c.effectId === 'poludnica_kill_weakest') {
      const all = [...lightFieldCards(s, 0), ...lightFieldCards(s, 1)].filter(v => v !== c && v.def > 0)
      if (all.length > 0) {
        const weakest = all.reduce((a, b) => a.def < b.def ? a : b)
        processDeath(s, weakest, c, side)
      }
    }

    // Domowik: ATK = base + hand size
    if (c.effectId === 'domowik_hand_size') {
      c.atk = c.maxAtk + s.hands[side]!.length
    }

    // Rodzanice: +1/+1 to weakest ally
    if (c.effectId === 'rodzanice_swap_buff') {
      const allies = lightFieldCards(s, side).filter(a => a !== c && a.def > 0)
      if (allies.length > 0) {
        const weakest = allies.reduce((a, b) => a.def < b.def ? a : b)
        weakest.atk++; weakest.def++; weakest.maxDef++
      }
    }

    // Smocze Jajo: hatch after 3 turns → become 8/8 dragon
    if (c.effectId === 'smocze_jajo_hatch' && c.turnsInPlay >= 3) {
      c.atk = 8; c.def = 8; c.maxDef = 8; c.maxAtk = 8
      c.effectId = '' // hatched, no longer an egg
      c.isFlying = true
    }

    // Wila: convert weak enemies each turn (DEF <= 2 switch sides)
    if (c.effectId === 'wila_convert_weak_enemies') {
      for (const enemy of lightFieldCards(s, opp)) {
        if (enemy.def <= 2 && !enemy.isSilenced && lightFieldCount(s, side) < MAX_FIELD) {
          removeFromField(s, enemy)
          enemy.owner = side
          const base = side * 3
          s.field[base]!.push(enemy)
        }
      }
    }

    // Najemnik: may switch sides (simplified: switch if opponent has more PS)
    if (c.effectId === 'najemnik_mercenary') {
      if (s.ps[opp]! > s.ps[side]! + 2) {
        removeFromField(s, c)
        c.owner = opp
        const oppBase = opp * 3
        if (s.field[oppBase]!.length < MAX_FIELD) {
          s.field[oppBase]!.push(c)
        }
      }
    }
  }
}

function processTurnEnd(s: LightState, side: number): void {
  const opp = 1 - side

  for (const c of lightFieldCards(s, side)) {
    if (c.isSilenced) continue

    // Barstuk: heal all wounded allies +1 DEF
    if (c.effectId === 'barstuk_ally_regen') {
      for (const ally of lightFieldCards(s, side)) {
        if (ally.def < ally.maxDef) ally.def = Math.min(ally.maxDef, ally.def + 1)
      }
    }

    // Korgorusze: +1 PS if didn't attack this turn
    if (c.effectId === 'korgorusze_recover_glory' && !c.hasAttacked) {
      s.ps[side]!++
    }

    // Polewik: buff neighbors (simplified: +1/+1 to all allies)
    if (c.effectId === 'polewik_buff_neighbors') {
      for (const ally of lightFieldCards(s, side)) {
        if (ally !== c) { ally.atk++; ally.def++ }
      }
    }

    // Wieszczy: burn 1 card from enemy deck (spy card on enemy field)
    if (c.effectId === 'wieszczy_spy_burn' && c.owner !== side) {
      if (s.decks[side]!.length > 0) s.decks[side]!.pop()
      s.deckCount[side] = s.decks[side]!.length
    }

    // Zmije: +1 PS if enemy field empty
    if (c.effectId === 'zmije_glory_on_empty_field') {
      if (lightFieldCount(s, opp) === 0) s.ps[side]!++
    }

    // Wąpierz: invincible but -1 DEF per turn
    if (c.effectId === 'wapierz_invincible_hunger') {
      c.def--
      if (c.def <= 0) processDeath(s, c, null, side)
    }
  }
}

// ===================================================================
// ADVENTURE PLAY — simplified effects for rollout
// ===================================================================

function playAdventure(s: LightState, side: number): void {
  const advs = s.adventureHands[side]!
  if (advs.length === 0 || s.adventuresPlayed[side]! >= 1) return

  const opp = 1 - side
  const myCards = lightFieldCards(s, side)
  const oppCards = lightFieldCards(s, opp)

  // V2: Softmax adventure selection
  const advScores = advs.map(a => scoreAdventure(a, s, side))
  const bestActualScore = Math.max(...advScores)
  if (bestActualScore < 0) return // no adventure worth playing

  const bestIdx = softmaxSample(advScores)
  const adv = advs[bestIdx]!

  // V5: Smart enhanced — use canAffordEnhancedSmart
  const useEnhanced = !!adv.enhancedEffectId &&
    canAffordEnhancedSmart(s.ps[side]!, s.ps[opp]!, s.round)

  const eid = useEnhanced ? adv.enhancedEffectId : adv.effectId

  // Apply effect
  applyAdventureEffect(s, side, eid, adv.adventureType)

  // Remove from hand
  advs.splice(bestIdx, 1)
  s.adventuresPlayed[side]!++

  // Pay PS for enhanced
  if (useEnhanced) s.ps[side]!--
}

function scoreAdventure(adv: LightAdventure, s: LightState, side: number): number {
  const opp = 1 - side
  const myCount = lightFieldCount(s, side)
  const oppCount = lightFieldCount(s, opp)

  // Artifacts need a creature on field
  if (adv.adventureType === 1 && myCount === 0) return -1

  // Base score by type
  let score = 5
  if (adv.adventureType === 1) {
    // V5: artifact value depends on best creature's threat tier
    let bestTier = 0
    forEachFieldCard(s, side, c => {
      const t = effectThreatTier(c.effectId)
      if (t > bestTier) bestTier = t
    })
    score += myCount > 0 ? 6 + bestTier : -10
  }
  if (adv.adventureType === 2) score += 6 // location (persistent)
  // V5: debuff/damage more valuable vs more enemies
  if (oppCount >= 3) score += 3
  else if (oppCount === 0) score -= 3

  return score
}

// ===================================================================
// ADVENTURE EFFECTS — simplified for rollout performance
// ===================================================================

function applyAdventureEffect(s: LightState, side: number, effectId: string, _adventureType: number): void {
  const opp = 1 - side
  const my = lightFieldCards(s, side)
  const enemy = lightFieldCards(s, opp)

  switch (effectId) {
    // =================================================================
    // BUFF ALLY
    // =================================================================
    case 'adventure_boskie_wsparcie':
      buffBest(my, 2, 2); break
    case 'adventure_boskie_wsparcie_enhanced':
      buffBest(my, 4, 4, true); break // +flight
    case 'adventure_moc_swiatogora': {
      const t = bestAlly(my)
      if (t) { t.atk *= 2; t.def *= 2; t.maxDef = t.def }
    } break
    case 'adventure_moc_swiatogora_enhanced': {
      const t = bestAlly(my)
      if (t) { t.atk *= 2; t.def *= 2; t.maxDef = t.def }
    } break
    case 'adventure_kresnik_choose_buff':
      buffBest(my, 2, 2); break
    case 'adventure_przyjazn':
    case 'adventure_przyjazn_enhanced':
      buffBest(my, 1, 3); break // bodyguard ≈ tank buff
    case 'adventure_kwiat_paproci':
    case 'adventure_kwiat_paproci_enhanced': {
      const t = bestAlly(my)
      if (t) t.attackType = 2 // change to magic
    } break
    case 'adventure_likantropia':
    case 'adventure_likantropia_enhanced':
      buffBest(my, 3, 3); break // simplified gain on kill
    case 'adventure_sobowtór': {
      // Copy best creature (simplified: +atk/+def as if duplicated power)
      const t = bestAlly(my)
      if (t && lightFieldCount(s, side) < MAX_FIELD) {
        const copy: LightCard = { ...t, instanceId: t.instanceId + '_copy', hasAttacked: true, turnsInPlay: 0 }
        const base = side * 3
        s.field[base]!.push(copy)
      }
    } break
    case 'adventure_sobowtór_enhanced': {
      const t = bestAlly(my)
      if (t && lightFieldCount(s, side) < MAX_FIELD) {
        const copy: LightCard = { ...t, instanceId: t.instanceId + '_copy', hasAttacked: true, turnsInPlay: 0, isImmune: true }
        const base = side * 3
        s.field[base]!.push(copy)
      }
    } break
    case 'adventure_sza_bitewny':
    case 'adventure_sza_bitewny_enhanced':
      // Force enemy to attack another enemy (simplified: 2 enemies hurt each other)
      if (enemy.length >= 2) {
        enemy[0]!.def -= enemy[1]!.atk
        enemy[1]!.def -= enemy[0]!.atk
        for (const e of enemy) {
          if (e.def <= 0) processDeath(s, e, null, side)
        }
      }
      break

    // =================================================================
    // DEBUFF ENEMY
    // =================================================================
    case 'adventure_okaleczenie': {
      const t = strongestEnemy(enemy)
      if (t) { t.atk = Math.floor(t.atk / 2); t.def = Math.floor(t.def / 2) }
    } break
    case 'adventure_okaleczenie_enhanced': {
      const t = strongestEnemy(enemy)
      if (t) { t.atk = Math.floor(t.atk / 2); t.def = Math.floor(t.def / 2); t.isSilenced = true }
    } break
    case 'adventure_bezsilnosc':
      for (const e of enemy) e.isSilenced = true
      break
    case 'adventure_bezsilnosc_enhanced':
      for (const e of enemy) { e.isSilenced = true; e.attackType = 0 }
      break
    case 'adventure_pakt_z_inkluzem': {
      let totalStolen = 0
      for (const e of enemy) {
        e.atk = Math.max(0, e.atk - 1); e.def -= 2; totalStolen += 3
      }
      const t = bestAlly(my)
      if (t) { t.atk += Math.floor(totalStolen / 2); t.def += Math.floor(totalStolen / 2); t.maxDef += Math.floor(totalStolen / 2) }
      for (const e of enemy) { if (e.def <= 0) processDeath(s, e, null, side) }
    } break
    case 'adventure_pakt_z_inkluzem_enhanced': {
      // Swap 2 creatures (simplified: same as base but stronger debuff)
      for (const e of enemy) {
        e.atk = Math.max(0, e.atk - 2); e.def -= 3
      }
      const t = bestAlly(my)
      if (t) { t.atk += enemy.length * 2; t.def += enemy.length * 3; t.maxDef += enemy.length * 3 }
      for (const e of enemy) { if (e.def <= 0) processDeath(s, e, null, side) }
    } break
    case 'adventure_gwizd_soowieja':
      for (const e of enemy) { if (e.atk > e.def) e.atk = e.def }
      break
    case 'adventure_gwizd_soowieja_enhanced':
      for (const e of enemy) e.cannotAttack = true
      break
    case 'adventure_obled': {
      const t = strongestEnemy(enemy)
      if (t) { const tmp = t.atk; t.atk = t.def; t.def = tmp }
    } break
    case 'adventure_obled_enhanced': {
      // Swap ATK/DEF on 2 own creatures (buff-like)
      if (my.length >= 2) {
        for (let i = 0; i < Math.min(2, my.length); i++) {
          const c = my[i]!; const tmp = c.atk; c.atk = c.def; c.def = tmp
        }
      }
    } break
    case 'adventure_rusalczy_taniec': {
      // -2/-2 enemy, +2/+2 ally
      const t = strongestEnemy(enemy)
      const a = bestAlly(my)
      if (t) { t.atk = Math.max(0, t.atk - 2); t.def -= 2 }
      if (a) { a.atk += 2; a.def += 2; a.maxDef += 2 }
      if (t && t.def <= 0) processDeath(s, t, null, side)
    } break
    case 'adventure_rusalczy_taniec_enhanced': {
      // -1/-1 all enemies, sum to ally
      let total = 0
      for (const e of enemy) { e.atk = Math.max(0, e.atk - 1); e.def--; total += 2 }
      const a = bestAlly(my)
      if (a) { a.atk += Math.floor(total / 2); a.def += Math.floor(total / 2); a.maxDef += Math.floor(total / 2) }
      for (const e of enemy) { if (e.def <= 0) processDeath(s, e, null, side) }
    } break
    case 'adventure_zdrada_popiela':
    case 'adventure_zdrada_popiela_enhanced':
      // Force all enemies to ATTACK position (no defense bonus)
      for (const e of enemy) e.position = 1
      break
    case 'adventure_swacba':
      // Enemy can't attack for 3 rounds (simplified: paralyze all)
      for (const e of enemy) e.paralyzeRounds = Math.max(e.paralyzeRounds, 3)
      break
    case 'adventure_swacba_enhanced':
      for (const e of enemy) { e.paralyzeRounds = Math.max(e.paralyzeRounds, 3); e.cannotAttack = true }
      break
    case 'adventure_zacmienie_sonca':
    case 'adventure_zacmienie_sonca_enhanced':
      for (const e of enemy) e.isSilenced = true
      break

    // =================================================================
    // DAMAGE
    // =================================================================
    case 'adventure_aska_swarozyca':
      dealSplitDamage(s, side, 6); break
    case 'adventure_aska_swarozyca_enhanced':
      dealSplitDamage(s, side, 10); break
    case 'adventure_kataklizm':
      for (const c of [...my, ...enemy]) {
        c.atk = Math.floor(c.atk / 2); c.def = Math.ceil(c.def / 2)
      }
      break
    case 'adventure_kataklizm_enhanced':
      for (const c of [...my, ...enemy]) {
        c.atk = Math.floor(c.atk / 2); c.def = Math.ceil(c.def / 2)
      }
      // Destroy enemy locations (no-op in rollout — no location tracking)
      break
    case 'adventure_aska_morany':
      // Kill next 3 deployed (simplified: damage 3 enemies)
      for (let i = 0; i < Math.min(3, enemy.length); i++) {
        enemy[i]!.def -= 99
        if (enemy[i]!.def <= 0) processDeath(s, enemy[i]!, null, side)
      }
      break
    case 'adventure_aska_morany_enhanced':
      for (let i = 0; i < Math.min(3, enemy.length); i++) {
        enemy[i]!.def -= 99
        if (enemy[i]!.def <= 0) processDeath(s, enemy[i]!, null, side)
      }
      if (s.decks[side]!.length > 0) {
        s.hands[side]!.push(s.decks[side]!.pop()!)
        s.deckCount[side] = s.decks[side]!.length
      }
      break
    case 'adventure_gusa': {
      // Transfer stats from one creature to another (simplified: merge two allies)
      if (my.length >= 2) {
        const src = my.reduce((a, b) => a.atk + a.def < b.atk + b.def ? a : b)
        const dst = my.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
        if (src !== dst) {
          dst.atk += src.atk; dst.def += src.def; dst.maxDef += src.def
          src.def = 0; processDeath(s, src, null, side)
        }
      }
    } break
    case 'adventure_gusa_enhanced': {
      // Swap ATK/DEF between 2 own creatures
      if (my.length >= 2) {
        const a = my[0]!; const b = my[1]!
        const ta = a.atk; const td = a.def
        a.atk = b.atk; a.def = b.def
        b.atk = ta; b.def = td
      }
    } break

    // =================================================================
    // REMOVAL / BOUNCE
    // =================================================================
    case 'adventure_wygnanie': {
      const t = strongestEnemy(enemy)
      if (t) {
        removeFromField(s, t)
        s.decks[opp]!.unshift(t) // to bottom of deck
        s.deckCount[opp] = s.decks[opp]!.length
      }
    } break
    case 'adventure_wygnanie_enhanced': {
      // Target changes sides
      const t = strongestEnemy(enemy)
      if (t && lightFieldCount(s, side) < MAX_FIELD) {
        removeFromField(s, t)
        t.owner = side
        const base = side * 3
        s.field[base]!.push(t)
      }
    } break
    case 'adventure_trucizna': {
      const t = strongestEnemy(enemy)
      if (t) t.poisonRounds = 3
    } break
    case 'adventure_trucizna_enhanced':
      for (const e of enemy) e.paralyzeRounds = Math.max(e.paralyzeRounds, 2)
      break

    // =================================================================
    // RESURRECTION / DRAW
    // =================================================================
    case 'adventure_laska_welesa':
    case 'adventure_nekromancja':
      // Resurrect from deck (simplified: draw 1 + deploy)
      if (s.decks[side]!.length > 0 && lightFieldCount(s, side) < MAX_FIELD) {
        const drawn = s.decks[side]!.pop()!
        drawn.owner = side; drawn.position = 0; drawn.hasAttacked = true; drawn.turnsInPlay = 0
        s.field[side * 3]!.push(drawn)
        s.deckCount[side] = s.decks[side]!.length
      }
      break
    case 'adventure_laska_welesa_enhanced':
      // Resurrect opponent's creature on your side
      if (s.decks[opp]!.length > 0 && lightFieldCount(s, side) < MAX_FIELD) {
        const drawn = s.decks[opp]!.pop()!
        drawn.owner = side; drawn.position = 0; drawn.hasAttacked = true; drawn.turnsInPlay = 0
        s.field[side * 3]!.push(drawn)
        s.deckCount[opp] = s.decks[opp]!.length
        s.ps[side]!--
      }
      break
    case 'adventure_nekromancja_enhanced': {
      // Create 4/4 undead (simplified: spawn token)
      if (lightFieldCount(s, side) < MAX_FIELD) {
        const token: LightCard = {
          instanceId: 'undead_token_' + s.round,
          effectId: '', atk: 4, def: 4, maxDef: 4, maxAtk: 4, soulValue: 8,
          position: 0, attackType: 0, cardType: 0, owner: side, domain: 3,
          hasAttacked: true, cannotAttack: false, isSilenced: false, isFlying: false,
          isImmune: false, isGrounded: false, poisonRounds: -1, paralyzeRounds: -1,
          turnsInPlay: 0, artifactCount: 0,
        }
        s.field[side * 3]!.push(token)
      }
    } break
    case 'adventure_alatyr':
      // Draw 5 and deploy creatures (simplified: draw 2 and deploy 1)
      for (let i = 0; i < 2 && s.decks[side]!.length > 0; i++) {
        s.hands[side]!.push(s.decks[side]!.pop()!)
      }
      s.deckCount[side] = s.decks[side]!.length
      break
    case 'adventure_alatyr_enhanced':
      // Same + taunt (simplified: draw + deploy + taunt)
      for (let i = 0; i < 2 && s.decks[side]!.length > 0; i++) {
        const drawn = s.decks[side]!.pop()!
        if (lightFieldCount(s, side) < MAX_FIELD) {
          drawn.owner = side; drawn.position = 0; drawn.hasAttacked = true; drawn.turnsInPlay = 0
          s.field[side * 3]!.push(drawn)
        } else {
          s.hands[side]!.push(drawn)
        }
      }
      s.deckCount[side] = s.decks[side]!.length
      break
    case 'adventure_handel':
    case 'adventure_handel_enhanced':
      // Reshuffle hand/deck (simplified: draw 2 extra)
      for (let i = 0; i < 2 && s.decks[side]!.length > 0; i++) {
        s.hands[side]!.push(s.decks[side]!.pop()!)
      }
      s.deckCount[side] = s.decks[side]!.length
      break
    case 'adventure_tryzna':
    case 'adventure_tryzna_enhanced':
      // Reduce hand (simplified: discard 1 from opponent hand)
      if (s.hands[opp]!.length > 0) s.hands[opp]!.pop()
      break

    // =================================================================
    // RESOURCE (PS) EFFECTS
    // =================================================================
    case 'adventure_zertwa': {
      // Sacrifice creature, double buff another
      if (my.length >= 2) {
        const weakest = my.reduce((a, b) => a.atk + a.def < b.atk + b.def ? a : b)
        const strongest = my.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
        if (weakest !== strongest) {
          strongest.atk += weakest.atk * 2; strongest.def += weakest.def * 2; strongest.maxDef += weakest.def * 2
          weakest.def = 0; processDeath(s, weakest, null, side)
        }
      }
    } break
    case 'adventure_zertwa_enhanced': {
      // Sacrifice creature, deal double as damage
      if (my.length >= 1) {
        const sacrifice = my.reduce((a, b) => a.atk + a.def < b.atk + b.def ? a : b)
        const totalDmg = (sacrifice.atk + sacrifice.def) * 2
        sacrifice.def = 0; processDeath(s, sacrifice, null, side)
        dealSplitDamage(s, side, totalDmg)
      }
    } break
    case 'adventure_poswiecenie_wandy':
    case 'adventure_poswiecenie_wandy_enhanced':
      // Skip opponent's turn (simplified: paralyze all enemies)
      for (const e of enemy) e.paralyzeRounds = Math.max(e.paralyzeRounds, 1)
      break

    // =================================================================
    // ARTIFACT EFFECTS (played on ally creature)
    // =================================================================
    case 'adventure_topor_peruna':
      // ×4 damage on one attack (simplified: +ATK*3 temporarily)
      if (my.length > 0) {
        const t = bestAlly(my)
        if (t) t.atk *= 4
      }
      break
    case 'adventure_topor_peruna_enhanced':
      if (my.length > 0) {
        const t = bestAlly(my)
        if (t) { t.atk *= 4; t.isImmune = true } // no counter + ignore resistance
      }
      break
    case 'adventure_topor_peruna_amulet':
    case 'adventure_topor_peruna_amulet_enhanced':
      // Reflect 2 attacks (simplified: +3 DEF)
      buffBest(my, 0, 3); break
    case 'adventure_sztandar':
      // Allies +2 ATK (aura — applied as buff to all allies)
      for (const a of my) a.atk += 2
      break
    case 'adventure_sztandar_enhanced':
      for (const a of my) a.atk += 2
      break
    case 'adventure_miecz_kladenet':
    case 'adventure_miecz_kladenet_enhanced':
      // Attack 2 enemies, no counter (simplified: +3/+0)
      buffBest(my, 3, 0); break
    case 'adventure_amulet_z_rozeta':
    case 'adventure_amulet_z_rozeta_enhanced':
      // Magic resistance (simplified: +0/+3)
      buffBest(my, 0, 3); break
    case 'adventure_pioro_zarptaka':
      // Restore stats, remove debuffs
      if (my.length > 0) {
        const t = my.reduce((a, b) => (a.maxDef - a.def) > (b.maxDef - b.def) ? a : b)
        t.def = t.maxDef; t.atk = t.maxAtk; t.isSilenced = false; t.paralyzeRounds = -1; t.cannotAttack = false
      }
      break
    case 'adventure_pioro_zarptaka_enhanced':
      // Remove ALL bonuses (simplified: restore + silence)
      if (my.length > 0) {
        const t = my.reduce((a, b) => (a.maxDef - a.def) > (b.maxDef - b.def) ? a : b)
        t.def = t.maxDef; t.atk = t.maxAtk; t.isSilenced = false; t.paralyzeRounds = -1
      }
      break
    case 'adventure_tarcza_dobryni_nikiticza':
    case 'adventure_tarcza_dobryni_nikiticza_enhanced':
      // Absorb 8 damage (simplified: +8 DEF)
      buffBest(my, 0, 8); break
    case 'adventure_srebrna_gaaz':
    case 'adventure_srebrna_gaaz_enhanced':
      // Change domain (simplified: no-op — minor impact)
      break
    case 'adventure_ruslan_helmet':
    case 'adventure_ruslan_helmet_enhanced':
      buffBest(my, 0, 3); break // resistance ≈ DEF buff
    case 'adventure_paszcz_strzyboga':
      // Gain flight
      if (my.length > 0) bestAlly(my)!.isFlying = true
      break
    case 'adventure_paszcz_strzyboga_enhanced':
      // All enemies lose flight
      for (const e of enemy) e.isGrounded = true
      if (my.length > 0) bestAlly(my)!.isFlying = true
      break

    // =================================================================
    // LOCATION EFFECTS (persistent)
    // =================================================================
    case 'adventure_arkona':
      // No field limit (already handled passively)
      break
    case 'adventure_arkona_enhanced':
      // +2 DEF regen per turn to chosen creature (simplified: +4 DEF now)
      buffBest(my, 0, 4); break
    case 'adventure_twierdza':
      // All allies +3 DEF
      for (const a of my) { a.def += 3; a.maxDef += 3 }
      break
    case 'adventure_twierdza_enhanced':
      for (const a of my) { a.def += 3; a.maxDef += 3 }
      break
    case 'adventure_matecznik':
      // Hide creature (simplified: make immune temporarily)
      if (my.length > 0) {
        const weakest = my.reduce((a, b) => a.def < b.def ? a : b)
        weakest.isImmune = true; weakest.cannotAttack = true
      }
      break
    case 'adventure_matecznik_enhanced':
      if (my.length > 0) {
        const weakest = my.reduce((a, b) => a.def < b.def ? a : b)
        weakest.isImmune = true; weakest.cannotAttack = true
        weakest.def = weakest.maxDef // heal to full
      }
      break
    case 'adventure_wyspa_bujan':
    case 'adventure_wyspa_bujan_enhanced':
      // +3 hand size limit (simplified: draw 2)
      for (let i = 0; i < 2 && s.decks[side]!.length > 0; i++) {
        s.hands[side]!.push(s.decks[side]!.pop()!)
      }
      s.deckCount[side] = s.decks[side]!.length
      break
    case 'adventure_rehtra':
    case 'adventure_rehtra_enhanced':
      // Peek at opponent (no-op in rollout)
      break

    // =================================================================
    // ŁASKI BOGÓW (God favors) & OTHER EVENTS
    // =================================================================
    case 'adventure_aska_perena':
      // Weles lose ½ ATK/DEF
      for (const e of enemy) {
        if (e.domain === 4) { e.atk = Math.floor(e.atk / 2); e.def = Math.ceil(e.def / 2) }
      }
      break
    case 'adventure_aska_perena_enhanced':
      // Destroy any creature
      if (enemy.length > 0) {
        const t = strongestEnemy(enemy)!
        t.def = 0; processDeath(s, t, null, side)
      }
      break
    case 'adventure_aska_roda':
      // Give creature any bonus (simplified: +3/+3)
      buffBest(my, 3, 3); break
    case 'adventure_aska_roda_enhanced':
      // 2 creatures swap bonuses (simplified: +2/+2 to all)
      for (const a of my) { a.atk += 2; a.def += 2; a.maxDef += 2 }
      break
    case 'adventure_aska_zorzy':
    case 'adventure_aska_zorzy_enhanced':
      // Restore event (no-op — no event tracking in rollout)
      break
    case 'adventure_aska_ady':
      // Enemies lose flight
      for (const e of enemy) e.isGrounded = true
      break
    case 'adventure_aska_ady_enhanced':
      // Line 3 creatures take ×3 damage (simplified: -3 DEF to all enemies)
      for (const e of enemy) e.def -= 3
      for (const e of enemy) { if (e.def <= 0) processDeath(s, e, null, side) }
      break
    case 'adventure_aska_swaroga':
    case 'adventure_aska_swaroga_enhanced':
      // Restore artifact/location (no-op in rollout)
      break
    case 'adventure_aska_swietowida': {
      // Creature gains victim's ATK per kill (simplified: +3 ATK)
      const t = bestAlly(my)
      if (t) t.atk += 3
    } break
    case 'adventure_aska_swietowida_enhanced':
      // Creatures don't end turn after kills (simplified: extra attack)
      for (const a of my) a.hasAttacked = false
      break
    case 'adventure_misjonarze':
    case 'adventure_misjonarze_enhanced':
      // Block magic (simplified: silence all magic attackers)
      for (const e of enemy) { if (e.attackType === 2) e.isSilenced = true }
      break
    case 'adventure_zlot_czarownic':
    case 'adventure_zlot_czarownic_enhanced':
      // Block 3 opponent adventures (simplified: discard 1 from opp adventure hand)
      if (s.adventureHands[opp]!.length > 0) s.adventureHands[opp]!.pop()
      break
    case 'adventure_kradzież':
    case 'adventure_kradzież_enhanced':
      // Steal adventure (simplified: move 1 from opp to own)
      if (s.adventureHands[opp]!.length > 0) {
        s.adventureHands[side]!.push(s.adventureHands[opp]!.pop()!)
      }
      break
    case 'adventure_kuka_marzanny':
    case 'adventure_kuka_marzanny_enhanced':
      // Debuff all enemies -2 DEF
      for (const e of enemy) e.def -= 2
      for (const e of enemy) { if (e.def <= 0) processDeath(s, e, null, side) }
      break
    case 'adventure_sledovik':
      // Deploy extra creature + attack (simplified: play extra creature)
      if (s.hands[side]!.length > 0 && lightFieldCount(s, side) < MAX_FIELD) {
        const card = s.hands[side]!.shift()!
        card.owner = side; card.position = 1; card.hasAttacked = false; card.turnsInPlay = 0
        s.field[side * 3]!.push(card)
      }
      break
    case 'adventure_sledovik_enhanced':
      // Extra attack per turn (simplified: unmark all as attacked)
      for (const a of my) a.hasAttacked = false
      break
    case 'adventure_braterstwo_bogatyrow': {
      // Merge 2 creatures (simplified: combine weakest into strongest)
      if (my.length >= 2) {
        const weakest = my.reduce((a, b) => a.atk + a.def < b.atk + b.def ? a : b)
        const strongest = my.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
        if (weakest !== strongest) {
          strongest.atk += weakest.atk; strongest.def += weakest.def; strongest.maxDef += weakest.def
          removeFromField(s, weakest)
        }
      }
    } break
    case 'adventure_braterstwo_bogatyrow_enhanced': {
      // Merge up to 4 (simplified: same as base)
      if (my.length >= 2) {
        const strongest = my.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
        for (const c of my) {
          if (c !== strongest) {
            strongest.atk += c.atk; strongest.def += c.def; strongest.maxDef += c.def
            removeFromField(s, c)
          }
        }
      }
    } break
    case 'adventure_przebudzenie_stolemow':
    case 'adventure_przebudzenie_stolemow_enhanced':
      // Destroy location (no-op in rollout)
      break
    case 'adventure_bitwa_nad_tollense':
      // All ignore lines (simplified: all can attack any)
      for (const a of my) a.isFlying = true
      break
    case 'adventure_bitwa_nad_tollense_enhanced':
      // +2 extra attacks (simplified: reset attacked flags)
      for (const a of my) { a.isFlying = true; a.hasAttacked = false }
      break
    case 'adventure_mlot_swaroga':
    case 'adventure_mlot_swaroga_enhanced':
      // Creature attacks ×2/×3/×4 (simplified: ×2 ATK)
      if (my.length > 0) bestAlly(my)!.atk *= 2
      break

    // Fallthrough for unhandled effects — no-op
    default: break
  }
}

// ===================================================================
// ADVENTURE HELPERS
// ===================================================================

function bestAlly(cards: LightCard[]): LightCard | null {
  if (cards.length === 0) return null
  return cards.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
}

function strongestEnemy(cards: LightCard[]): LightCard | null {
  if (cards.length === 0) return null
  return cards.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
}

function buffBest(cards: LightCard[], atkBuff: number, defBuff: number, addFlight = false): void {
  if (cards.length === 0) return
  const t = cards.reduce((a, b) => a.atk + a.def > b.atk + b.def ? a : b)
  t.atk += atkBuff; t.def += defBuff; t.maxDef += defBuff
  if (addFlight) t.isFlying = true
}

function dealSplitDamage(s: LightState, side: number, totalDmg: number): void {
  const opp = 1 - side
  const enemies = lightFieldCards(s, opp).filter(c => c.def > 0)
  if (enemies.length === 0) return
  const perTarget = Math.ceil(totalDmg / enemies.length)
  for (const e of enemies) {
    e.def -= perTarget
    if (e.def <= 0) processDeath(s, e, null, side)
  }
}

// ===================================================================
// PUBLIC API
// ===================================================================

export interface LightRolloutResult {
  value: number
  depth: number
}

/** V6: Simulate exactly 1 turn (current player). Used by Depth 1.5 opponent response check. */
export function simulateOneTurn(s: LightState): boolean {
  return simulateTurn(s)
}

/**
 * V7: Apply a combat plan to LightState (mutates in-place).
 * Handles: positioning → Buka → attacks → plunder → turnEnd → anti-stall → turn switch → draw → round++ → poison/paralyze.
 * After this call, s.currentTurn is the opponent (ready for rollout).
 */
export function applyCombatPlanToLight(s: LightState, side: number, steps: MCTSMove[]): void {
  const opp = 1 - side
  let didAttack = false

  // 1. Apply position changes
  for (const step of steps) {
    if (step.type === 'change_position' && step.cardInstanceId) {
      const base = side * 3
      for (let i = 0; i < 3; i++) {
        const card = s.field[base + i]!.find(c => c.instanceId === step.cardInstanceId)
        if (card) {
          card.position = step.targetPosition === CardPosition.ATTACK ? 1 : 0
          break
        }
      }
    }
  }

  // 2. Buka: force weak enemies to DEFENSE (matches simulateTurn behavior)
  if (hasFieldEffect(s, side, 'buka_force_defense')) {
    let myMaxAtk = 0
    forEachFieldCard(s, side, c => { if (c.atk > myMaxAtk) myMaxAtk = c.atk })
    forEachFieldCard(s, opp, c => { if (c.atk < myMaxAtk) c.position = 0 })
  }

  // 3. Execute attacks
  const allCards = [...lightFieldCards(s, 0), ...lightFieldCards(s, 1)]
  for (const step of steps) {
    if (s.winner !== -1) break
    if (step.type === 'attack' && step.cardInstanceId && step.targetInstanceId) {
      let attacker: LightCard | null = null
      const base = side * 3
      for (let i = 0; i < 3 && !attacker; i++) {
        attacker = s.field[base + i]!.find(c => c.instanceId === step.cardInstanceId) ?? null
      }
      let target: LightCard | null = null
      const oppBase = opp * 3
      for (let i = 0; i < 3 && !target; i++) {
        target = s.field[oppBase + i]!.find(c => c.instanceId === step.targetInstanceId) ?? null
      }

      if (attacker && target && target.def > 0 && attacker.def > 0) {
        attacker.hasAttacked = true
        didAttack = true

        const dmg = calculateDamage(attacker, target, allCards)
        target.def -= dmg
        processOnDamageDealt(s, attacker, target, dmg, side)
        processOnDamageReceived(s, target, attacker, dmg)

        // Counterattack
        if (shouldCounterattack(attacker, target, allCards)) {
          const counterDmg = target.atk
          attacker.def -= counterDmg
          if (target.effectId === 'strzyga_lifesteal' && !target.isSilenced && counterDmg > 0) {
            target.def = Math.min(target.maxDef, target.def + counterDmg)
          }
          processOnDamageReceived(s, attacker, target, counterDmg)
        }

        // Rusalka mirror
        if (target.effectId === 'rusalka_mirror_attack' && !target.isSilenced && target.position === 1 && dmg > 0) {
          attacker.def -= Math.floor(dmg / 2)
        }

        // Leszy: post-attack defend
        if (hasFieldEffect(s, side, 'leszy_post_attack_defend')) {
          attacker.position = 0
        }

        // Death checks
        if (target.def <= 0) processDeath(s, target, attacker, side)
        if (attacker.def <= 0) processDeath(s, attacker, target, opp)
        checkWin(s)
      }
    }
  }

  // 4. Plunder
  for (const step of steps) {
    if (step.type === 'plunder') {
      if (s.round >= 3 && lightFieldCount(s, opp) === 0 && s.ps[opp]! > 0) {
        s.ps[side]!++; s.ps[opp]!--
        didAttack = true
        checkWin(s)
      }
      break
    }
  }

  if (s.winner !== -1) return

  // 5. Turn-end effects
  processTurnEnd(s, side)

  // 6. Anti-stall
  if (lightFieldCount(s, side) > 0 && !didAttack) {
    s.consecutivePasses[side]!++
    if (s.consecutivePasses[side]! >= 3 && s.ps[side]! > 0) s.ps[side]!--
  } else {
    s.consecutivePasses[side] = 0
  }

  // 7. Switch turn
  s.currentTurn = opp
  s.creaturesPlayed[opp] = 0
  s.adventuresPlayed[opp] = 0
  forEachFieldCard(s, opp, c => {
    c.hasAttacked = false
    c.turnsInPlay++
  })

  // 8. Draw
  if (s.decks[opp]!.length > 0) {
    const hasLicho = hasFieldEffect(s, side, 'licho_block_draw')
    const hasBieda = hasFieldEffect(s, side, 'bieda_spy_block_draw')
    if (!hasLicho && !hasBieda) {
      const drawn = s.decks[opp]!.pop()!
      s.hands[opp]!.push(drawn)
    }
  }
  s.deckCount[opp] = s.decks[opp]!.length

  // 9. Round increment after player2's turn
  if (opp === 0) s.round++

  // 10. Poison/Paralyze tick for next player's creatures
  for (const c of lightFieldCards(s, opp)) {
    if (c.poisonRounds >= 0) {
      c.poisonRounds--
      if (c.poisonRounds < 0) {
        c.def = 0
        processDeath(s, c, null, side)
      }
    }
    if (c.paralyzeRounds >= 0) {
      c.paralyzeRounds--
    }
  }

  checkWin(s)
}

export function rolloutLight(
  startState: LightState,
  ourSide: number,
  depthLimit: number,
  heuristicWeight: number,
): LightRolloutResult {
  let depth = 0

  while (startState.winner === -1 && depth < depthLimit) {
    const ok = simulateTurn(startState)
    if (!ok) break
    depth++
  }

  if (startState.winner !== -1) {
    return { value: startState.winner === ourSide ? 1.0 : 0.0, depth }
  }

  const heuristic = evaluateLight(startState, ourSide)
  return {
    value: heuristicWeight * heuristic + (1 - heuristicWeight) * 0.5,
    depth,
  }
}
