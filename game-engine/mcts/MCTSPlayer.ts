/**
 * MCTSPlayer V7 — Full-Turn Macros (PLAY + COMBAT in tree).
 *
 * V7 zmiany vs V4-V6:
 * - Combat jest CZĘŚCIĄ macro-move (nie heurystyczny planner)
 * - Każdy node w drzewie = pełna tura (PLAY + COMBAT)
 * - Rollout startuje z post-combat LightState
 * - planCombat() i checkOpponentResponse() — USUNIĘTE
 *
 * Architektura:
 * - Root level: MacroMoveGenerator → CombatPlanGenerator → full-turn macros
 * - Rollout: LightweightSimulator (post-combat start)
 * - Faza 2-4: TT + Tree Reuse + Experience — bez zmian
 */

import type { GameState, PlayerSide } from '../types'
import type { MCTSMove, MCTSConfig, MCTSStats } from './types'
import { DEFAULT_MCTS_CONFIG, moveKey } from './types'
import { MCTSNode } from './MCTSNode'
import { GameEngine } from '../GameEngine'
import { gameStateToLight, cloneLightState } from './LightweightState'
import { rolloutLight, applyCombatPlanToLight } from './LightweightSimulator'
import type { AIDecision } from '../AIPlayer'
import { getAllCreaturesOnField } from '../LineManager'
import { generateMacroMoves } from './MacroMoveGenerator'
import { computeHash } from './StateHash'
import { TranspositionTable } from './TranspositionTable'
import { ExperienceDB } from './ExperienceDB'
import { OpeningBook } from './OpeningBook'

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

    // V7: Full-turn macro (PLAY + COMBAT) from MCTS
    const macroSteps = this.mctsMacroPhase(state)

    for (const step of macroSteps) {
      if (step.type === 'end_turn') break
      decisions.push({
        type: step.type as AIDecision['type'],
        cardInstanceId: step.cardInstanceId,
        targetInstanceId: step.targetInstanceId,
        targetLine: step.targetLine,
        targetPosition: step.targetPosition,
        useEnhanced: step.useEnhanced,
      })
    }

    decisions.push({ type: 'end_turn' })
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
      const firstMove = macro.steps.find(s =>
        s.type !== 'advance_to_combat' && s.type !== 'end_turn' &&
        s.type !== 'change_position' && s.type !== 'attack' && s.type !== 'plunder',
      ) ?? { type: 'advance_to_combat' as const }
      const child = new MCTSNode(finalState, root, firstMove, [])
      child.macroSteps = macro.steps
      root.children.set(macro.key, child)

      // V7: Apply combat plan to LightState → rollout starts post-combat
      const lightState = gameStateToLight(finalState)
      const advIdx = macro.steps.findIndex(s => s.type === 'advance_to_combat')
      const combatSteps = advIdx >= 0
        ? macro.steps.slice(advIdx + 1).filter(s => s.type !== 'end_turn')
        : []
      applyCombatPlanToLight(lightState, ourSideNum, combatSteps)

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
      return [{ type: 'advance_to_combat' }, { type: 'end_turn' }]
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
