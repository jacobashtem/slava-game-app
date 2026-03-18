/**
 * CombatPlanGenerator — generates 2-3 combat plans for post-PLAY state.
 *
 * Each CombatPlan = positioning + attacks + plunder + end_turn.
 * Operates on LightState for speed (<0.5ms/call).
 *
 * Plans:
 * 1. DEFEND (always): All in DEFENSE, no attacks. Counterattack value.
 * 2. ATTACK (when enemies): Best attacker → best target. Attacker ATTACK, rest DEFENSE.
 * 3. TRADE (conditional): Kill high-threat target (effectThreatTier >= 5) even at cost.
 * 4. PLUNDER (when enemy field empty): 1 creature ATTACK + plunder.
 */

import type { LightState, LightCard } from './LightweightState'
import { lightFieldCards, lightFieldCount } from './LightweightState'
import type { MCTSMove } from './types'
import type { CombatPlan } from './types'
import { CardPosition, GOLD_EDITION_RULES } from '../constants'
import { effectThreatTier, killValue, priorityKillBonus, prefersDefense } from './StrategicPatterns'

const SOUL_THRESHOLD = GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD
const PS_TARGET = GOLD_EDITION_RULES.GLORY_WIN_TARGET

// ===== TARGET VALIDATION (simplified for plan generation) =====

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
  if (!s.field[attackerBase]!.includes(attacker)) return [] // not on FRONT → can't attack

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

function scoreTarget(attacker: LightCard, target: LightCard, myPS: number, soulPts: number): number {
  let sc = 0
  const canKill = target.def <= attacker.atk
  const willSurvive = attacker.def > target.atk // simplified (ignores modifiers)
  const targetThreat = effectThreatTier(target.effectId)
  const targetKV = killValue(target)

  if (canKill) {
    sc += 100
    sc += targetKV * 2
    sc += priorityKillBonus(target.effectId)
    sc += targetThreat * 10
    // Soul harvest bonus
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
  return sc
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

  // No creatures → empty plan
  if (myCards.length === 0) {
    plans.push({ key: 'empty', steps: [{ type: 'end_turn' }], heuristicScore: 0 })
    return plans
  }

  // ==============================
  // 1. DEFEND (always) — all DEFENSE, no attacks
  // ==============================
  {
    const steps = makePositionSteps(myCards, new Set())
    let score = 0
    for (const c of myCards) {
      if (c.atk > 0 && c.def > 0) score += c.atk * 0.5 // counterattack value
      if (prefersDefense(c.effectId)) score += 3
    }
    steps.push({ type: 'end_turn' })
    plans.push({ key: 'defend', steps, heuristicScore: score })
  }

  // ==============================
  // 2. ATTACK (when enemies exist)
  // ==============================
  if (enemyCards.length > 0) {
    const hasChlop = myCards.some(c => c.effectId === 'chlop_extra_attack' && !c.isSilenced)
    const maxNormalAttacks = hasChlop ? 2 : 1
    let normalAttacksUsed = 0
    const attackSteps: MCTSMove[] = []
    const attackerIds = new Set<string>()
    const usedTargets = new Set<string>()
    let totalScore = 0

    const attackers = myCards
      .filter(c => c.atk > 0 && !c.hasAttacked && !c.cannotAttack && c.paralyzeRounds < 0)
      .sort((a, b) => b.atk - a.atk)

    for (const attacker of attackers) {
      const isFree = attacker.effectId === 'kikimora_free_attack' && !attacker.isSilenced
      if (!isFree && normalAttacksUsed >= maxNormalAttacks) continue

      const targets = getTargetsForAttacker(s, attacker, side)
        .filter(t => !usedTargets.has(t.instanceId))
      if (targets.length === 0) continue

      let bestTarget = targets[0]!
      let bestScore = -999
      for (const t of targets) {
        const sc = scoreTarget(attacker, t, myPS, soulPts)
        if (sc > bestScore) { bestScore = sc; bestTarget = t }
      }

      if (bestScore < -70) continue

      attackerIds.add(attacker.instanceId)
      attackSteps.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: bestTarget.instanceId })
      usedTargets.add(bestTarget.instanceId)
      totalScore += bestScore
      if (!isFree) normalAttacksUsed++

      // Lesnica: double attack
      if (attacker.effectId === 'lesnica_double_attack' && !attacker.isSilenced) {
        const secondTargets = getTargetsForAttacker(s, attacker, side)
          .filter(t => !usedTargets.has(t.instanceId))
        if (secondTargets.length > 0) {
          let secondBest = secondTargets[0]!
          let secondBestScore = -999
          for (const t of secondTargets) {
            const sc = scoreTarget(attacker, t, myPS, soulPts)
            if (sc > secondBestScore) { secondBestScore = sc; secondBest = t }
          }
          if (secondBestScore > -30) {
            attackSteps.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: secondBest.instanceId })
            usedTargets.add(secondBest.instanceId)
            totalScore += secondBestScore
          }
        }
      }
    }

    if (attackSteps.length > 0) {
      const posSteps = makePositionSteps(myCards, attackerIds)
      const fullSteps: MCTSMove[] = [...posSteps, ...attackSteps, { type: 'end_turn' }]
      const attackKeys = attackSteps.map(a => `${a.cardInstanceId}>${a.targetInstanceId}`).join('+')
      plans.push({ key: `atk:${attackKeys}`, steps: fullSteps, heuristicScore: totalScore })
    }
  }

  // ==============================
  // 3. TRADE (conditional: high-threat enemy, tier >= 5)
  // ==============================
  if (enemyCards.length > 0 && plans.length < maxPlans) {
    const highThreats = enemyCards.filter(c => effectThreatTier(c.effectId) >= 5)
    if (highThreats.length > 0) {
      const target = highThreats.reduce((a, b) =>
        effectThreatTier(a.effectId) > effectThreatTier(b.effectId) ? a : b,
      )

      // Find attacker that can kill this target
      const attackers = myCards
        .filter(c => c.atk > 0 && !c.hasAttacked && !c.cannotAttack && c.paralyzeRounds < 0)
        .filter(c => getTargetsForAttacker(s, c, side).some(t => t.instanceId === target.instanceId))
        .sort((a, b) => b.atk - a.atk)

      const attacker = attackers.find(a => a.atk >= target.def)
      if (attacker) {
        // Check not duplicate of ATTACK plan
        const existingAtk = plans.find(p => p.key.startsWith('atk:'))
        const alreadyCovered = existingAtk?.key.includes(target.instanceId)

        if (!alreadyCovered) {
          const tradeScore = scoreTarget(attacker, target, myPS, soulPts) + effectThreatTier(target.effectId) * 5
          const attackerIds = new Set([attacker.instanceId])
          const posSteps = makePositionSteps(myCards, attackerIds)
          const fullSteps: MCTSMove[] = [
            ...posSteps,
            { type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: target.instanceId },
            { type: 'end_turn' },
          ]
          plans.push({ key: `trade:${attacker.instanceId}>${target.instanceId}`, steps: fullSteps, heuristicScore: tradeScore })
        }
      }
    }
  }

  // ==============================
  // 4. PLUNDER (when enemy field empty, round >= 3)
  // ==============================
  if (enemyCards.length === 0 && s.round >= 3 && s.ps[opp]! > 0) {
    const strongest = myCards
      .filter(c => c.atk > 0)
      .sort((a, b) => b.atk - a.atk)[0]

    if (strongest) {
      const attackerIds = new Set([strongest.instanceId])
      const posSteps = makePositionSteps(myCards, attackerIds)
      let score = 5 + Math.max(0, PS_TARGET - myPS) * 2
      if (myPS + 1 >= PS_TARGET) score += 50 // lethal plunder!
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
