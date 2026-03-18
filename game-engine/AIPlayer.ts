/**
 * AIPlayer — thin wrapper nad MCTSPlayer z difficulty scaling.
 *
 * Budżet MCTS skaluje siłę AI:
 * - novice: 200ms (~4K iter) — szybkie, losowość
 * - warrior: 800ms (~16K iter) — solidna gra
 * - veteran: 2000ms (~40K iter) — zaawansowane strategie
 * - legend: 5000ms (~100K iter) — pełna moc MCTS
 */

import type { GameState } from './types'
import type { PlayerSide } from './types'
import { MCTSPlayer } from './mcts'
import { BattleLine, CardPosition } from './constants'
import { ExperienceDB } from './mcts/ExperienceDB'

export type AIDifficulty = 'novice' | 'warrior' | 'veteran' | 'legend'

export const DIFFICULTY_BUDGETS: Record<AIDifficulty, number> = {
  novice: 200,
  warrior: 800,
  veteran: 2000,
  legend: 5000,
}

export const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  novice: 'Nowicjusz',
  warrior: 'Wojownik',
  veteran: 'Weteran',
  legend: 'Legenda',
}

export interface AIDecision {
  type: 'play_creature' | 'play_adventure' | 'attack' | 'change_position' | 'activate_effect' | 'invoke_god' | 'plunder' | 'advance_to_combat' | 'end_turn'
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
  useEnhanced?: boolean
  godId?: number
  bidAmount?: number
}

export class AIPlayer {
  private mcts: MCTSPlayer

  constructor(
    private side: PlayerSide,
    private difficulty: AIDifficulty = 'warrior',
    budgetOverrideMs?: number,
    disableL2?: boolean,
  ) {
    const budget = budgetOverrideMs ?? DIFFICULTY_BUDGETS[difficulty]
    // L2 opponent response: enabled for warrior+ (budget > 200ms) unless explicitly disabled
    const useL2 = !disableL2 && budget > 200
    const maxL2Children = budget <= 800 ? 2 : budget <= 2000 ? 3 : 4
    this.mcts = new MCTSPlayer(side, { timeBudgetMs: budget, useL2, maxL2Children })
  }

  planTurn(state: GameState): AIDecision[] {
    return this.mcts.planTurn(state)
  }

  /** Reset per-game state (TT, tree reuse). Call at start of new game. */
  resetGame(): void {
    this.mcts.resetGame()
  }

  get lastSearchStats() {
    return this.mcts.lastSearchStats
  }

  // ===== Experience DB (static, shared) =====

  /** Load experience from JSON. */
  static loadExperience(json: string): void {
    MCTSPlayer.loadExperience(json)
  }

  /** Init empty experience (for training). */
  static initExperience(): ExperienceDB {
    return MCTSPlayer.initExperience()
  }

  /** Get experience DB. */
  static getExperienceDB(): ExperienceDB | null {
    return MCTSPlayer.getExperienceDB()
  }
}
