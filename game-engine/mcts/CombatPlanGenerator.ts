/**
 * CombatPlanGenerator V2 — adaptive combat plans for MCTS full-turn macros.
 *
 * V2 improvements over V1:
 * - Kill-order optimization: healers/growers die FIRST (weakest-sufficient attacker)
 * - Focus-fire plan: combine 2 attackers on 1 tough target nobody can solo-kill
 * - Anti-stall: force attacks when consecutivePasses >= 2
 * - ALL-IN plan: every attacker attacks when losing or stalemate
 * - Better DEFEND scoring: korgorusze PS gain, situational awareness
 *
 * Plans generated (2-4, capped by maxPlans):
 * 1. DEFEND (always): All DEFENSE, no attacks.
 * 2. ATTACK (when enemies): Kill-order optimized multi-attack.
 * 3. FOCUS (conditional): 2 attackers on 1 tough unkillable target.
 * 4. ALL-IN (conditional): Every attacker attacks — losing/stalemate.
 * 5. TRADE (conditional): Kill high-threat target (tier >= 5) even at cost.
 * 6. PLUNDER (when enemy field empty): 1 creature ATTACK + plunder.
 */

import type { LightState, LightCard } from './LightweightState'
import { lightFieldCards, lightFieldCount, hasFieldEffect } from './LightweightState'
import type { MCTSMove } from './types'
import type { CombatPlan } from './types'
import { CardPosition, GOLD_EDITION_RULES } from '../constants'
import {
  effectThreatTier, killValue, priorityKillBonus, prefersDefense,
  isHealerEffect, isGrowerEffect, isPSGenEffect,
  assessGameSituation,
} from './StrategicPatterns'
import { ExperienceDB } from './ExperienceDB'

const SOUL_THRESHOLD = GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD
const PS_TARGET = GOLD_EDITION_RULES.GLORY_WIN_TARGET

// ===== TARGET VALIDATION =====

function getTargetsForAttacker(s: LightState, attacker: LightCard, side: number): LightCard[] {
  const opp = 1 - side
  const oppBase = opp * 3
  const enemies = lightFieldCards(s, opp).filter(c => c.def > 0)
  if (enemies.length === 0) return []

  // Taunt: must attack blotnik first
  const taunts = enemies.filter(c => c.effectId === 'blotnik_taunt' && !c.isSilenced)
  if (taunts.length > 0) {
    const reachable = taunts.filter(t => canReachTarget(s, attacker, t, side, oppBase))
    if (reachable.length > 0) return reachable
  }

  // Intercept: redirect to chowaniec
  const interceptors = enemies.filter(c => c.effectId === 'chowaniec_intercept' && !c.isSilenced)
  if (interceptors.length > 0) {
    const reachable = interceptors.filter(t => canReachTarget(s, attacker, t, side, oppBase))
    if (reachable.length > 0) return reachable
  }

  // RANGED/MAGIC → any
  if (attacker.attackType === 2 || attacker.attackType === 3) return enemies
  // Flying → any
  if (attacker.isFlying && !attacker.isGrounded) return enemies

  // MELEE/ELEMENTAL: must be on FRONT line, target first non-empty enemy line
  const attackerBase = side * 3
  if (!s.field[attackerBase]!.includes(attacker)) return []

  for (let lineOffset = 0; lineOffset < 3; lineOffset++) {
    const line = s.field[oppBase + lineOffset]!.filter(c => c.def > 0)
    if (line.length > 0) return line
  }
  return []
}

function canReachTarget(s: LightState, attacker: LightCard, target: LightCard, side: number, oppBase: number): boolean {
  if (attacker.attackType === 2 || attacker.attackType === 3) return true
  if (attacker.isFlying && !attacker.isGrounded) return true
  const attackerBase = side * 3
  if (!s.field[attackerBase]!.includes(attacker)) return false
  for (let lineOffset = 0; lineOffset < 3; lineOffset++) {
    const line = s.field[oppBase + lineOffset]!
    if (line.length > 0) return line.includes(target)
  }
  return false
}

// ===== SCORING =====

// Shared ExperienceDB reference (set by MCTSPlayer)
let _experienceDB: ExperienceDB | null = null
export function setCombatExperienceDB(db: ExperienceDB | null): void { _experienceDB = db }

function scoreTarget(attacker: LightCard, target: LightCard, myPS: number, soulPts: number): number {
  let sc = 0
  const canKill = target.def <= attacker.atk
  const willSurvive = attacker.def > target.atk
  const targetKV = killValue(target)

  if (canKill) {
    sc += 100
    sc += targetKV * 2
    sc += priorityKillBonus(target.effectId)
    sc += effectThreatTier(target.effectId) * 10
    const afterSoul = soulPts + target.soulValue
    if (afterSoul >= SOUL_THRESHOLD) sc += 40
    if (myPS + Math.floor(afterSoul / SOUL_THRESHOLD) >= PS_TARGET) sc += 200
  }
  if (canKill && willSurvive) sc += 50
  if (!willSurvive && !canKill) sc -= 80
  if (!willSurvive && canKill) {
    const attackerKV = killValue(attacker)
    if (targetKV > attackerKV * 1.3) sc += 30
  }

  // V7.3: Experience-based bonus — "historycznie atakowanie tego targetu tym attackerem → WR"
  if (_experienceDB && attacker.effectId && target.effectId) {
    const wr = _experienceDB.getCombatTargetWR(attacker.effectId, target.effectId)
    if (wr !== 0.5) {
      sc += (wr - 0.5) * 40  // ±20 score bonus based on historical WR
    }
  }

  return sc
}

/** V2: Kill priority — healers > growers > PS generators > threat tier */
function targetPriority(c: LightCard): number {
  const eid = c.effectId
  if (isHealerEffect(eid)) return 100  // negates our damage
  if (isGrowerEffect(eid)) return 90   // snowballs if left alive
  if (isPSGenEffect(eid)) return 80    // wins resource race
  return effectThreatTier(eid) * 5
}

// ===== HELPERS =====

function makePositionSteps(myCards: LightCard[], attackerIds: Set<string>): MCTSMove[] {
  const steps: MCTSMove[] = []
  for (const c of myCards) {
    const wantAttack = attackerIds.has(c.instanceId)
    const isAttack = c.position === 1
    if (wantAttack && !isAttack) {
      steps.push({ type: 'change_position', cardInstanceId: c.instanceId, targetPosition: CardPosition.ATTACK })
    } else if (!wantAttack && isAttack) {
      steps.push({ type: 'change_position', cardInstanceId: c.instanceId, targetPosition: CardPosition.DEFENSE })
    }
  }
  return steps
}

function getAvailableAttackers(myCards: LightCard[]): LightCard[] {
  return myCards.filter(c =>
    c.atk > 0 && !c.hasAttacked && !c.cannotAttack && c.paralyzeRounds < 0,
  )
}

function buildPlan(
  myCards: LightCard[],
  attackerIds: Set<string>,
  attackSteps: MCTSMove[],
  totalScore: number,
  key: string,
): CombatPlan {
  const posSteps = makePositionSteps(myCards, attackerIds)
  return {
    key,
    steps: [...posSteps, ...attackSteps, { type: 'end_turn' }],
    heuristicScore: totalScore,
  }
}

// ===== GENERATOR =====

export function generateCombatPlans(
  s: LightState,
  side: number,
  maxPlans: number,
): CombatPlan[] {
  const plans: CombatPlan[] = []
  const opp = 1 - side
  const myCards = lightFieldCards(s, side)
  const enemyCards = lightFieldCards(s, opp).filter(c => c.def > 0)
  const myPS = s.ps[side]!
  const soulPts = s.soulPoints[side]!
  const passes = s.consecutivePasses[side]!
  const antiStall = passes >= 2 || (myPS <= 1 && passes >= 1)

  // No creatures → empty plan
  if (myCards.length === 0) {
    plans.push({ key: 'empty', steps: [{ type: 'end_turn' }], heuristicScore: 0 })
    return plans
  }

  // Situation assessment for adaptive plan selection
  const situation = assessGameSituation(s, side)
  const isLosing = situation.posture === 'defensive'
  const isStalemate = passes >= 5

  // ==============================
  // 1. DEFEND — all DEFENSE, no attacks
  // ==============================
  {
    const steps = makePositionSteps(myCards, new Set())
    let score = 0
    for (const c of myCards) {
      if (c.atk > 0 && c.def > 0) score += c.atk * 0.5
      if (prefersDefense(c.effectId)) score += 3
    }
    // Korgorusze: +1 PS per turn when not attacking
    if (hasFieldEffect(s, side, 'korgorusze_recover_glory')) score += 8
    // Penalize defend when anti-stall active
    if (antiStall) score -= 20
    if (isStalemate) score -= 50
    steps.push({ type: 'end_turn' })
    plans.push({ key: 'defend', steps, heuristicScore: score })
  }

  if (enemyCards.length > 0) {
    const allAttackers = getAvailableAttackers(myCards)
    const hasChlop = myCards.some(c => c.effectId === 'chlop_extra_attack' && !c.isSilenced)
    const maxNormalAttacks = hasChlop ? 2 : 1
    // Attack threshold: lower when anti-stall or losing
    const threshold = antiStall ? -999 : isStalemate ? -999 : isLosing ? -200 : -70

    // ==============================
    // 2. ATTACK — kill-order optimized
    // ==============================
    {
      // V2: Sort targets by kill priority (healers/growers first)
      const priorityTargets = [...enemyCards].sort((a, b) => targetPriority(b) - targetPriority(a))

      let normalAttacksUsed = 0
      const attackSteps: MCTSMove[] = []
      const attackerIds = new Set<string>()
      const usedAttackerIds = new Set<string>()
      let totalScore = 0

      // Pass 1: For each priority target, assign weakest attacker that can kill it
      for (const target of priorityTargets) {
        if (normalAttacksUsed >= maxNormalAttacks) break

        const eligible = allAttackers
          .filter(a => !usedAttackerIds.has(a.instanceId))
          .filter(a => getTargetsForAttacker(s, a, side).some(t => t.instanceId === target.instanceId))

        // Weakest attacker that can kill (save strong ones for tougher targets)
        const canKillers = eligible.filter(a => a.atk >= target.def).sort((a, b) => a.atk - b.atk)
        const attacker = canKillers[0]

        if (!attacker) continue

        const score = scoreTarget(attacker, target, myPS, soulPts)
        if (score < threshold) continue

        const isFree = attacker.effectId === 'kikimora_free_attack' && !attacker.isSilenced
        if (!isFree && normalAttacksUsed >= maxNormalAttacks) continue

        attackerIds.add(attacker.instanceId)
        usedAttackerIds.add(attacker.instanceId)
        attackSteps.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: target.instanceId })
        totalScore += score
        if (!isFree) normalAttacksUsed++

        // Lesnica: double attack on different target
        if (attacker.effectId === 'lesnica_double_attack' && !attacker.isSilenced) {
          const secondTargets = getTargetsForAttacker(s, attacker, side)
            .filter(t => t.instanceId !== target.instanceId && t.def > 0)
          if (secondTargets.length > 0) {
            const secondBest = secondTargets.reduce((a, b) =>
              scoreTarget(attacker, a, myPS, soulPts) > scoreTarget(attacker, b, myPS, soulPts) ? a : b,
            )
            const secondScore = scoreTarget(attacker, secondBest, myPS, soulPts)
            if (secondScore > -30 || antiStall) {
              attackSteps.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: secondBest.instanceId })
              totalScore += secondScore
            }
          }
        }
      }

      // Pass 2: If attacks left, assign remaining attackers (strongest target first)
      if (normalAttacksUsed < maxNormalAttacks) {
        const remainingTargets = enemyCards
          .filter(t => t.def > 0)
          .sort((a, b) => killValue(b) - killValue(a))

        for (const target of remainingTargets) {
          if (normalAttacksUsed >= maxNormalAttacks) break
          const eligible = allAttackers
            .filter(a => !usedAttackerIds.has(a.instanceId))
            .filter(a => getTargetsForAttacker(s, a, side).some(t => t.instanceId === target.instanceId))
            .sort((a, b) => b.atk - a.atk)

          const attacker = eligible[0]
          if (!attacker) continue

          const score = scoreTarget(attacker, target, myPS, soulPts)
          if (score < threshold) continue

          const isFree = attacker.effectId === 'kikimora_free_attack' && !attacker.isSilenced
          if (!isFree && normalAttacksUsed >= maxNormalAttacks) continue

          attackerIds.add(attacker.instanceId)
          usedAttackerIds.add(attacker.instanceId)
          attackSteps.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: target.instanceId })
          totalScore += score
          if (!isFree) normalAttacksUsed++
        }
      }

      if (attackSteps.length > 0) {
        const attackKeys = attackSteps.map(a => `${a.cardInstanceId}>${a.targetInstanceId}`).join('+')
        plans.push(buildPlan(myCards, attackerIds, attackSteps, totalScore, `atk:${attackKeys}`))
      }
    }

    // ==============================
    // 3. FOCUS-FIRE — 2 attackers on 1 tough target nobody can solo-kill
    // ==============================
    if (plans.length < maxPlans) {
      // Find toughest enemy that no single attacker can kill
      const unkillable = enemyCards
        .filter(t => !allAttackers.some(a =>
          a.atk >= t.def && getTargetsForAttacker(s, a, side).some(e => e.instanceId === t.instanceId),
        ))
        .sort((a, b) => targetPriority(b) - targetPriority(a))

      const focusTarget = unkillable[0]
      if (focusTarget && allAttackers.length >= 2) {
        // Find 2 attackers whose combined ATK can kill
        const canReach = allAttackers
          .filter(a => getTargetsForAttacker(s, a, side).some(t => t.instanceId === focusTarget.instanceId))
          .sort((a, b) => b.atk - a.atk)

        if (canReach.length >= 2) {
          const a1 = canReach[0]!
          const a2 = canReach[1]!
          const combinedDmg = a1.atk + a2.atk

          if (combinedDmg >= focusTarget.def) {
            const focusScore = killValue(focusTarget) * 2 + effectThreatTier(focusTarget.effectId) * 10 + 50
            const attackerIds = new Set([a1.instanceId, a2.instanceId])
            const attackSteps: MCTSMove[] = [
              { type: 'attack', cardInstanceId: a1.instanceId, targetInstanceId: focusTarget.instanceId },
              { type: 'attack', cardInstanceId: a2.instanceId, targetInstanceId: focusTarget.instanceId },
            ]
            // Check not duplicate of ATTACK plan
            const focusKey = `focus:${a1.instanceId}+${a2.instanceId}>${focusTarget.instanceId}`
            const existingAtk = plans.find(p => p.key.startsWith('atk:'))
            if (!existingAtk?.key.includes(focusTarget.instanceId)) {
              plans.push(buildPlan(myCards, attackerIds, attackSteps, focusScore, focusKey))
            }
          }
        }
      }
    }

    // ==============================
    // 4. ALL-IN — every attacker attacks (losing/stalemate/anti-stall)
    // ==============================
    if ((isLosing || isStalemate || antiStall) && plans.length < maxPlans) {
      let normalAttacksUsed = 0
      const attackSteps: MCTSMove[] = []
      const attackerIds = new Set<string>()
      let totalScore = 0
      const sortedAttackers = [...allAttackers].sort((a, b) => b.atk - a.atk)

      for (const attacker of sortedAttackers) {
        const isFree = attacker.effectId === 'kikimora_free_attack' && !attacker.isSilenced
        if (!isFree && normalAttacksUsed >= maxNormalAttacks) continue

        const targets = getTargetsForAttacker(s, attacker, side).filter(t => t.def > 0)
        if (targets.length === 0) continue

        // Best target (no threshold — all-in means always attack)
        const best = targets.reduce((a, b) =>
          scoreTarget(attacker, a, myPS, soulPts) > scoreTarget(attacker, b, myPS, soulPts) ? a : b,
        )

        attackerIds.add(attacker.instanceId)
        attackSteps.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: best.instanceId })
        totalScore += scoreTarget(attacker, best, myPS, soulPts)
        if (!isFree) normalAttacksUsed++
      }

      if (attackSteps.length > 0) {
        // Bonus for breaking stalemate
        if (antiStall) totalScore += 30
        if (isStalemate) totalScore += 50
        const allInKey = `allin:${attackSteps.map(a => `${a.cardInstanceId}>${a.targetInstanceId}`).join('+')}`
        // Check not exact duplicate of ATTACK plan
        const atkPlan = plans.find(p => p.key.startsWith('atk:'))
        if (!atkPlan || atkPlan.key !== allInKey.replace('allin:', 'atk:')) {
          plans.push(buildPlan(myCards, attackerIds, attackSteps, totalScore, allInKey))
        }
      }
    }

    // ==============================
    // 5. TRADE — kill high-threat (tier >= 5) even at cost
    // ==============================
    if (plans.length < maxPlans) {
      const highThreats = enemyCards.filter(c => effectThreatTier(c.effectId) >= 5)
      if (highThreats.length > 0) {
        const target = highThreats.reduce((a, b) =>
          effectThreatTier(a.effectId) > effectThreatTier(b.effectId) ? a : b,
        )

        const attackers = allAttackers
          .filter(c => getTargetsForAttacker(s, c, side).some(t => t.instanceId === target.instanceId))
          .sort((a, b) => b.atk - a.atk)

        const attacker = attackers.find(a => a.atk >= target.def)
        if (attacker) {
          const existingAtk = plans.find(p => p.key.startsWith('atk:'))
          if (!existingAtk?.key.includes(target.instanceId)) {
            const tradeScore = scoreTarget(attacker, target, myPS, soulPts) + effectThreatTier(target.effectId) * 5
            const attackerIds = new Set([attacker.instanceId])
            const attackSteps: MCTSMove[] = [
              { type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: target.instanceId },
            ]
            plans.push(buildPlan(myCards, attackerIds, attackSteps, tradeScore,
              `trade:${attacker.instanceId}>${target.instanceId}`))
          }
        }
      }
    }
  }

  // ==============================
  // 6. PLUNDER — when enemy field empty, round >= 3
  //    Requires: creature with unused attack action (will be set to ATTACK pos)
  // ==============================
  if (enemyCards.length === 0 && s.round >= 3 && s.ps[opp]! > 0) {
    const plunderer = myCards
      .filter(c => c.atk > 0 && !c.hasAttacked && !c.cannotAttack)
      .sort((a, b) => b.atk - a.atk)[0]

    if (plunderer) {
      const attackerIds = new Set([plunderer.instanceId])
      const posSteps = makePositionSteps(myCards, attackerIds)
      let score = 5 + Math.max(0, PS_TARGET - myPS) * 2
      if (myPS + 1 >= PS_TARGET) score += 50
      const fullSteps: MCTSMove[] = [...posSteps, { type: 'plunder' }, { type: 'end_turn' }]
      plans.push({ key: 'plunder', steps: fullSteps, heuristicScore: score })
    }
  }

  // Safety: always at least 1 plan
  if (plans.length === 0) {
    plans.push({ key: 'pass', steps: [{ type: 'end_turn' }], heuristicScore: 0 })
  }

  // Sort by score, cap to maxPlans
  plans.sort((a, b) => b.heuristicScore - a.heuristicScore)
  return plans.slice(0, maxPlans)
}
