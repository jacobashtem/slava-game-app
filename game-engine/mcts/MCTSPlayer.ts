/**
 * MCTSPlayer V4 — Macro-Move + Transposition Table + Tree Reuse + Experience.
 *
 * V4 zmiany vs V3:
 * - Faza 1: Macro-Move MCTS — pełne sekwencje PLAY-phase (istota+przygoda+aktywacja)
 * - Faza 2: Transposition Table — cache ewaluacji stanów (Zobrist hash)
 * - Faza 3: Tree Reuse — persistent root między turami
 * - Faza 4: Book of Experience — prior bias z historii gier
 *
 * Architektura:
 * - Root level: MacroMoveGenerator → pełny GameEngine (ON_PLAY efekty, adventures)
 * - Rollout: LightweightSimulator (45K+ iteracji/2s)
 * - Combat: heurystyczny planner (pozycjonowanie + targeting — deterministyczny)
 */

import type { GameState, CardInstance, PlayerSide } from '../types'
import type { MCTSMove, MCTSConfig, MCTSStats } from './types'
import { DEFAULT_MCTS_CONFIG, moveKey } from './types'
import { MCTSNode } from './MCTSNode'
import {
  getAvailableMoves,
  applyMove,
  scoreMove,
  isTerminal,
  evaluate,
} from './StateAdapter'
import { determinize } from './Determinizer'
import { GameEngine } from '../GameEngine'
import { gameStateToLight, cloneLightState } from './LightweightState'
import { rolloutLight } from './LightweightSimulator'
import { rollout as rolloutFull } from './RolloutPolicy'
import type { AIDecision } from '../AIPlayer'
import { GamePhase, CardPosition, GOLD_EDITION_RULES } from '../constants'
import { getAllCreaturesOnField, canAttack } from '../LineManager'
import { getOpponentSide } from '../GameStateUtils'
import { getEffect } from '../EffectRegistry'
import { generateMacroMoves } from './MacroMoveGenerator'
import { computeHash } from './StateHash'
import { TranspositionTable } from './TranspositionTable'
import { ExperienceDB } from './ExperienceDB'
import { OpeningBook } from './OpeningBook'
import {
  effectThreatTier, killValue, priorityKillBonus, prefersDefense,
  assessGameSituation,
} from './StrategicPatterns'

export class MCTSPlayer {
  private config: MCTSConfig
  private side: PlayerSide
  private engine: GameEngine

  // Faza 2: Transposition Table (persistent within game)
  private tt: TranspositionTable

  // Faza 3: Tree Reuse
  private previousRoot: MCTSNode | null = null
  private previousHash: bigint | null = null

  // Faza 4: Experience DB (shared across all instances)
  private static experienceDB: ExperienceDB | null = null
  private static openingBook: OpeningBook | null = null

  lastSearchStats: MCTSStats | null = null

  constructor(side: PlayerSide, config?: Partial<MCTSConfig>) {
    this.side = side
    this.config = { ...DEFAULT_MCTS_CONFIG, ...config }
    this.engine = new GameEngine()
    this.tt = new TranspositionTable(this.config.ttSize)
  }

  // ===== STATIC: Experience DB =====

  /** Load experience from JSON string (called once, shared by all instances). */
  static loadExperience(json: string): void {
    MCTSPlayer.experienceDB = new ExperienceDB()
    MCTSPlayer.experienceDB.deserialize(json)
    MCTSPlayer.openingBook = new OpeningBook(MCTSPlayer.experienceDB)
  }

  /** Get experience DB (for recording games in benchmark). */
  static getExperienceDB(): ExperienceDB | null {
    return MCTSPlayer.experienceDB
  }

  /** Initialize empty experience DB (for training). */
  static initExperience(): ExperienceDB {
    MCTSPlayer.experienceDB = new ExperienceDB()
    MCTSPlayer.openingBook = new OpeningBook(MCTSPlayer.experienceDB)
    return MCTSPlayer.experienceDB
  }

  /** Reset per-game state (TT, tree reuse). Called at start of new game. */
  resetGame(): void {
    this.tt.clear()
    this.previousRoot = null
    this.previousHash = null
  }

  // ===== PUBLIC API =====

  planTurn(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []

    // 1. MCTS macro-move: pełna PLAY phase (istota + przygoda + aktywacja)
    const macroSteps = this.mctsMacroPhase(state)
    let currentState = state

    for (const step of macroSteps) {
      if (step.type === 'end_turn' || step.type === 'advance_to_combat') break
      decisions.push({
        type: step.type as AIDecision['type'],
        cardInstanceId: step.cardInstanceId,
        targetInstanceId: step.targetInstanceId,
        targetLine: step.targetLine,
        targetPosition: step.targetPosition,
        useEnhanced: step.useEnhanced,
      })
      const newState = applyMove(this.engine, currentState, step, this.side)
      if (newState) currentState = newState
    }

    // 2. Advance to combat phase (required — sideAttack asserts COMBAT phase)
    decisions.push({ type: 'advance_to_combat' })

    // 3. Combat: heurystyczny planner (deterministyczny, szybki)
    const combat = this.planCombat(currentState)
    decisions.push(...combat)

    if (decisions.length === 0 || decisions[decisions.length - 1]!.type !== 'end_turn') {
      decisions.push({ type: 'end_turn' })
    }
    return decisions
  }

  // ===== MCTS MACRO-MOVE PHASE =====

  private mctsMacroPhase(rootState: GameState): MCTSMove[] {
    const startTime = Date.now()
    let iterations = 0
    let totalRolloutDepth = 0
    let ttHits = 0
    const ourSideNum = this.side === 'player1' ? 0 : 1

    // Compute macro-move cap based on time budget
    const maxMacros = Math.min(
      this.config.maxMacroMoves,
      this.config.timeBudgetMs <= 200 ? 8 :
      this.config.timeBudgetMs <= 800 ? 16 :
      this.config.timeBudgetMs <= 2000 ? 30 : 40,
    )

    // Generate macro-moves (with pre-computed final states)
    const { macros, states: macroStates } = generateMacroMoves(
      this.engine, rootState, this.side, maxMacros,
    )

    if (macros.length === 0) {
      this.lastSearchStats = this.buildStats(0, 1, 0, startTime, 0)
      return [{ type: 'advance_to_combat' }]
    }

    // Faza 4: Opening Book — check if we should skip MCTS
    if (MCTSPlayer.openingBook && rootState.roundNumber <= 3) {
      for (const macro of macros) {
        const result = MCTSPlayer.openingBook.evaluate(rootState.roundNumber, macro.steps)
        if (result.skipMCTS) {
          this.lastSearchStats = this.buildStats(0, 1, 0, startTime, macros.length)
          return macro.steps
        }
      }
    }

    // Create root and pre-expand children from macro-moves
    const root = new MCTSNode(rootState, null, null, [])
    const childLightStates = new Map<string, ReturnType<typeof gameStateToLight>>()

    for (const macro of macros) {
      const finalState = macroStates.get(macro.key) ?? rootState
      const firstMove = macro.steps.find(s => s.type !== 'advance_to_combat') ?? { type: 'advance_to_combat' as const }
      const child = new MCTSNode(finalState, root, firstMove, [])
      child.macroSteps = macro.steps
      root.children.set(macro.key, child)

      const lightState = gameStateToLight(finalState)
      childLightStates.set(macro.key, lightState)
      ;(child as any)._lightState = lightState
    }

    // Faza 3: Try to reuse visits from previous tree
    if (this.config.useTreeReuse && this.previousRoot) {
      try { this.tryReuseTree(root, childLightStates) } catch {}
    }

    // Faza 4: Compute experience priors
    let experiencePriors: Map<string, number> | undefined
    if (MCTSPlayer.experienceDB) {
      experiencePriors = new Map()
      for (const [key, child] of root.children) {
        if (child.macroSteps) {
          const prior = this.computeExperiencePrior(child.macroSteps, rootState)
          if (prior !== 0.5) experiencePriors.set(key, prior)
        }
      }
      if (experiencePriors.size === 0) experiencePriors = undefined
    }

    // === MCTS LOOP ===
    while (iterations < this.config.maxIterations) {
      if (Date.now() - startTime >= this.config.timeBudgetMs) break
      if (iterations > 200 && this.shouldTerminateEarly(root)) break

      // 1. Selection (1 level: root → child)
      const node = root.selectChild(this.config, experiencePriors)

      // 2. LightState for rollout
      const cachedLight = (node as any)._lightState as ReturnType<typeof gameStateToLight> | undefined
      const lightBase = cachedLight ?? gameStateToLight(node.state)

      // Faza 2: TT lookup (before determinization — hashes observable state)
      let value = 0.5
      let usedTT = false

      if (this.config.useTT) {
        const hash = computeHash(lightBase)
        const ttEntry = this.tt.lookup(hash)
        if (ttEntry && ttEntry.visits >= this.config.ttMinVisits) {
          value = ttEntry.totalValue / ttEntry.visits
          usedTT = true
          ttHits++
        }
      }

      if (!usedTT) {
        const simLight = cloneLightState(lightBase)

        // Determinization: shuffle opponent's hidden info
        if (this.config.useDeterminization) {
          for (const arr of [simLight.hands[1 - ourSideNum]!, simLight.decks[1 - ourSideNum]!]) {
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
            }
          }
        }

        if (simLight.winner !== -1) {
          value = simLight.winner === ourSideNum ? 1.0 : 0.0
        } else {
          const result = rolloutLight(simLight, ourSideNum, this.config.rolloutDepthLimit, this.config.heuristicWeight)
          value = result.value
          totalRolloutDepth += result.depth
        }

        // TT store
        if (this.config.useTT) {
          const hash = computeHash(lightBase)
          this.tt.store(hash, value, 0)
        }
      }

      // 3. Backpropagation
      const moveKeys = node.macroSteps
        ? node.macroSteps.filter(s => s.type !== 'advance_to_combat').map(s => moveKey(s))
        : (node.move ? [moveKey(node.move)] : [])
      node.backpropagate(value, moveKeys, this.config)
      iterations++
    }

    // Find best child (most visits — robust child selection)
    let bestKey: string | null = null
    let bestVisits = -1
    for (const [key, child] of root.children) {
      if (child.visits > bestVisits) {
        bestVisits = child.visits
        bestKey = key
      }
    }

    const bestChild = bestKey ? root.children.get(bestKey) : null

    this.lastSearchStats = {
      iterations,
      treeNodes: root.nodeCount,
      avgRolloutDepth: iterations > 0 ? totalRolloutDepth / Math.max(iterations - ttHits, 1) : 0,
      timeElapsedMs: Date.now() - startTime,
      bestMoveVisits: bestChild?.visits ?? 0,
      bestMoveWinRate: bestChild ? bestChild.wins / Math.max(bestChild.visits, 1) : 0,
      movesConsidered: macros.length,
    }

    // Faza 3: Save root for reuse
    if (this.config.useTreeReuse) {
      this.previousRoot = root
      try { this.previousHash = computeHash(gameStateToLight(rootState)) } catch { this.previousHash = null }
    }

    if (!bestChild?.macroSteps || bestChild.macroSteps.length === 0) {
      return [{ type: 'advance_to_combat' }]
    }

    return bestChild.macroSteps
  }

  // ===== FAZA 3: TREE REUSE =====

  /**
   * Try to reuse visits/wins from previous MCTS tree.
   * Matches children by state hash — if previous child had same observable state,
   * transfer its statistics as a warm start.
   */
  private tryReuseTree(
    root: MCTSNode,
    childLightStates: Map<string, ReturnType<typeof gameStateToLight>>,
  ): void {
    if (!this.previousRoot) return

    // Build hash → stats map from previous tree's children
    const prevStats = new Map<bigint, { visits: number, wins: number }>()
    for (const prevChild of this.previousRoot.children.values()) {
      const prevLight = (prevChild as any)._lightState as ReturnType<typeof gameStateToLight> | undefined
      if (prevLight && prevChild.visits > 0) {
        const hash = computeHash(prevLight)
        const existing = prevStats.get(hash)
        if (!existing || prevChild.visits > existing.visits) {
          prevStats.set(hash, { visits: prevChild.visits, wins: prevChild.wins })
        }
      }
      // Also check grandchildren (depth 2)
      for (const grandchild of prevChild.children.values()) {
        const gcLight = gameStateToLight(grandchild.state)
        if (grandchild.visits > 0) {
          const hash = computeHash(gcLight)
          const existing = prevStats.get(hash)
          if (!existing || grandchild.visits > existing.visits) {
            prevStats.set(hash, { visits: grandchild.visits, wins: grandchild.wins })
          }
        }
      }
    }

    // Match current children to previous stats
    for (const [key, child] of root.children) {
      const lightState = childLightStates.get(key)
      if (!lightState) continue
      const hash = computeHash(lightState)
      const prev = prevStats.get(hash)
      if (prev && prev.visits >= 10) {
        // Transfer as warm start (scaled down to avoid overconfidence)
        const scale = 0.3
        child.visits = Math.floor(prev.visits * scale)
        child.wins = prev.wins * scale
      }
    }
  }

  // ===== FAZA 4: EXPERIENCE PRIOR =====

  /**
   * Compute experience prior for a macro-move.
   * Uses card win rates + synergy bonuses from ExperienceDB.
   */
  private computeExperiencePrior(steps: MCTSMove[], state: GameState): number {
    if (!MCTSPlayer.experienceDB) return 0.5

    const effectIds: string[] = []
    for (const step of steps) {
      if (step.type === 'advance_to_combat' || step.type === 'end_turn') continue
      if (step.cardInstanceId) {
        const card = state.players[this.side].hand.find(c => c.instanceId === step.cardInstanceId)
          ?? getAllCreaturesOnField(state, this.side).find(c => c.instanceId === step.cardInstanceId)
        if (card) {
          effectIds.push((card.cardData as any).effectId ?? '')
        }
      }
    }

    if (effectIds.length === 0) return 0.5

    const phase: 'early' | 'mid' | 'late' =
      state.roundNumber <= 3 ? 'early' : state.roundNumber <= 7 ? 'mid' : 'late'

    let totalWR = 0
    let count = 0

    for (const eid of effectIds) {
      if (!eid) continue
      const wr = MCTSPlayer.experienceDB.getCardWinRate(eid, phase)
      if (wr !== 0.5) { totalWR += wr; count++ }
    }

    // Synergy bonuses
    for (let i = 0; i < effectIds.length; i++) {
      for (let j = i + 1; j < effectIds.length; j++) {
        if (!effectIds[i] || !effectIds[j]) continue
        const bonus = MCTSPlayer.experienceDB.getSynergyBonus(effectIds[i]!, effectIds[j]!)
        if (bonus > 0) {
          totalWR += 0.5 + bonus
          count += 0.5
        }
      }
    }

    return count > 0 ? totalWR / count : 0.5
  }

  // ===== HEURISTIC COMBAT =====

  private planCombat(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []
    const oppSide = getOpponentSide(this.side)
    const myField = getAllCreaturesOnField(state, this.side)
    const enemyField = getAllCreaturesOnField(state, oppSide)
    const myPS = state.gameMode === 'slava' ? state.players[this.side].glory : state.players[this.side].gold
    const oppPS = state.gameMode === 'slava' ? state.players[oppSide].glory : state.players[oppSide].gold
    const myPower = myField.reduce((s, c) => s + c.currentStats.attack + c.currentStats.defense, 0)
    const oppPower = enemyField.reduce((s, c) => s + c.currentStats.attack + c.currentStats.defense, 0)
    const enemyMaxAtk = enemyField.reduce((m, c) => Math.max(m, c.currentStats.attack), 0)

    // Use strategic assessment for posture-aware decisions
    const lightState = gameStateToLight(state)
    const situation = assessGameSituation(lightState, this.side === 'player1' ? 0 : 1)

    const isLosing = situation.posture === 'defensive'
    const isWinning = situation.posture === 'aggressive'

    // === STALEMATE DETECTION: if we've been passing many turns, play more aggressively ===
    const myPasses = state.players[this.side].consecutivePasses
    const isStalemate = myPasses >= 5

    // === LETHAL CHECK: can we win THIS turn? ===
    const psTarget = GOLD_EDITION_RULES.GLORY_WIN_TARGET
    const soulPts = state.players[this.side].soulPoints
    const soulThreshold = GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD

    // Calculate potential soul harvest from killing all enemies
    let potentialSouls = soulPts
    let potentialPSGain = 0
    for (const e of enemyField) {
      const sv = (e.cardData as any).stats?.soulValue ?? (e.currentStats.attack + e.currentStats.defense)
      potentialSouls += sv
    }
    potentialPSGain = Math.floor(potentialSouls / soulThreshold)
    const canLethal = myPS + potentialPSGain >= psTarget
    const canEliminate = enemyField.length > 0 &&
      state.players[oppSide].deck.length === 0 &&
      state.players[oppSide].hand.filter(c => c.cardData.cardType === 'creature').length === 0

    // === V6: DEFENSE-FIRST POSITIONING ===
    // DEFENSE = kontratak (pełna moc). Strategicznie lepsze. ATTACK tylko dla istoty która atakuje.
    // Step 1: Put everything in DEFENSE
    // Step 2: Pick attackers & targets
    // Step 3: Switch only chosen attackers to ATTACK (before their attack)

    const sideCreatures = getAllCreaturesOnField(state, this.side)
    const enemies = getAllCreaturesOnField(state, oppSide).filter(c => c.owner !== this.side)
    const antiStall = myPasses >= 2 || (myPS <= 1 && myPasses >= 1)

    // Empty enemy field + round >= 3 → plunder mode: need 1 creature in ATTACK
    const plunderMode = enemyField.length === 0 && state.roundNumber >= 3

    // Step 1: Ensure all creatures start in DEFENSE (counterattack benefit)
    for (const c of sideCreatures) {
      if (plunderMode && c.currentStats.attack > 0) {
        // Plunder: need at least 1 in ATTACK position — pick strongest
        // (handled below in plunder section)
        continue
      }
      if (c.position !== CardPosition.DEFENSE) {
        decisions.push({ type: 'change_position', cardInstanceId: c.instanceId, targetPosition: CardPosition.DEFENSE })
      }
    }

    // Step 2: Temporarily set ALL to ATTACK for canAttack() evaluation (then restore)
    const savedPositions = new Map<string, CardPosition>()
    for (const c of sideCreatures) {
      if (c.position !== CardPosition.ATTACK) {
        savedPositions.set(c.instanceId, c.position)
        c.position = CardPosition.ATTACK
      }
    }

    const hasChlop = sideCreatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
    const maxNormalAttacks = hasChlop ? 2 : 1
    let normalAttacksUsed = 0

    // All potential attackers (sorted by ATK desc)
    const candidateAttackers = sideCreatures
      .filter(c => c.currentStats.attack > 0 && !c.hasAttackedThisTurn && !c.cannotAttack)
      .sort((a, b) => b.currentStats.attack - a.currentStats.attack)

    const attackedTargets = new Set<string>()
    const chosenAttackers = new Set<string>()  // creatures that will actually attack

    // Score an attack: trade-value based
    const scoreAttack = (attacker: CardInstance, t: CardInstance): number => {
      let sc = 0
      const canKill = t.currentStats.defense <= attacker.currentStats.attack
      const survive = attacker.currentStats.defense > t.currentStats.attack
      const tEid = (t.cardData as any).effectId ?? ''
      const aEid = (attacker.cardData as any).effectId ?? ''

      const targetKV = killValue({ atk: t.currentStats.attack, def: t.currentStats.defense, effectId: tEid } as any)
      const attackerKV = killValue({ atk: attacker.currentStats.attack, def: attacker.currentStats.defense, effectId: aEid } as any)

      if (canKill) {
        sc += 100
        sc += targetKV * 2
        sc += priorityKillBonus(tEid)
        sc += effectThreatTier(tEid) * 10
        const sv = (t.cardData as any).stats?.soulValue ?? (t.currentStats.attack + t.currentStats.defense)
        if (soulPts + sv >= soulThreshold) sc += 40
        if (myPS + Math.floor((soulPts + sv) / soulThreshold) >= psTarget) sc += 200
      }
      if (canKill && survive) sc += 50
      if (!survive && !canKill) sc -= 80
      if (!survive && canKill && targetKV > attackerKV * 1.3) sc += 30
      sc += t.equippedArtifacts.length * 5
      return sc
    }

    // Step 3: Pick best attacker→target assignments
    if (enemies.length > 0) {
      for (const attacker of candidateAttackers) {
        const isFreeAttacker = (attacker.cardData as any).effectId === 'kikimora_free_attack'
        if (!isFreeAttacker && normalAttacksUsed >= maxNormalAttacks) continue

        const targets = enemies.filter(e =>
          canAttack(state, attacker, e).valid && !attackedTargets.has(e.instanceId),
        )
        if (targets.length === 0) continue

        const scored = targets.map(t => ({ t, sc: scoreAttack(attacker, t) }))
        scored.sort((a, b) => b.sc - a.sc)

        const forceAttack = antiStall || isStalemate
        const threshold = forceAttack ? -999 : (canLethal || canEliminate) ? -200 : isLosing ? -100 : -70
        if (scored[0]!.sc < threshold) continue

        // This creature will attack → needs ATTACK position
        chosenAttackers.add(attacker.instanceId)
        decisions.push({ type: 'change_position', cardInstanceId: attacker.instanceId, targetPosition: CardPosition.ATTACK })
        decisions.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: scored[0]!.t.instanceId })
        attackedTargets.add(scored[0]!.t.instanceId)
        if (!isFreeAttacker) normalAttacksUsed++

        // Lesnica double attack
        if ((attacker.cardData as any).effectId === 'lesnica_double_attack') {
          const secondTargets = enemies.filter(e =>
            canAttack(state, attacker, e).valid && !attackedTargets.has(e.instanceId),
          )
          if (secondTargets.length > 0) {
            const secondScored = secondTargets.map(t => ({ t, sc: scoreAttack(attacker, t) }))
            secondScored.sort((a, b) => b.sc - a.sc)
            if (secondScored[0]!.sc >= -30 || isLosing || canLethal) {
              decisions.push({ type: 'attack', cardInstanceId: attacker.instanceId, targetInstanceId: secondScored[0]!.t.instanceId })
              attackedTargets.add(secondScored[0]!.t.instanceId)
            }
          }
        }
      }
    }

    // Restore original positions
    for (const [id, origPos] of savedPositions) {
      const creature = sideCreatures.find(c => c.instanceId === id)
      if (creature) creature.position = origPos
    }

    // Plunder (empty enemy field, round >= 3)
    if (plunderMode) {
      // Need at least 1 creature in ATTACK for plunder to work
      const strongest = sideCreatures
        .filter(c => c.currentStats.attack > 0)
        .sort((a, b) => b.currentStats.attack - a.currentStats.attack)[0]
      if (strongest) {
        decisions.push({ type: 'change_position', cardInstanceId: strongest.instanceId, targetPosition: CardPosition.ATTACK })
      }
      decisions.push({ type: 'plunder' })
    }

    return decisions
  }

  // ===== HELPERS =====

  private shouldTerminateEarly(root: MCTSNode): boolean {
    if (root.children.size < 2) return true
    const sorted = [...root.children.values()].sort((a, b) => b.visits - a.visits)
    const best = sorted[0]!
    const second = sorted[1]!
    if (best.visits < 200) return false
    if (best.visits <= second.visits * 3) return false
    return (best.wins / best.visits) > (second.visits > 0 ? second.wins / second.visits : 0)
  }

  private buildStats(iter: number, nodes: number, depth: number, start: number, moves: number): MCTSStats {
    return { iterations: iter, treeNodes: nodes, avgRolloutDepth: iter > 0 ? depth / iter : 0,
      timeElapsedMs: Date.now() - start, bestMoveVisits: 0, bestMoveWinRate: 0, movesConsidered: moves }
  }
}
