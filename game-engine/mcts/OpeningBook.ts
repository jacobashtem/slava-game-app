/**
 * OpeningBook — wrapper na ExperienceDB dla rund 1–3.
 *
 * Jeśli mamy ≥50 sampli i win rate >55% → zagraj bezpośrednio (skip MCTS).
 * Jeśli mniej sampli → użyj jako prior bias w UCB1.
 */

import type { ExperienceDB } from './ExperienceDB'
import type { MCTSMove } from './types'
import { moveKey } from './types'

export interface OpeningResult {
  /** true = skip MCTS, graj bezpośrednio */
  skipMCTS: boolean
  /** Prior value (0–1) do UCB1 bias (undefined = brak danych) */
  prior?: number
}

export class OpeningBook {
  constructor(private experience: ExperienceDB) {}

  /**
   * Sprawdź czy mamy opening dla danego stanu.
   * @param round — numer rundy (1-indexed)
   * @param steps — kroki macro-move (bez advance_to_combat)
   */
  evaluate(round: number, steps: MCTSMove[]): OpeningResult {
    if (round > 3) return { skipMCTS: false }

    const key = this.openingKey(round, steps)
    const stats = this.experience.getOpeningStats(key)

    if (!stats) return { skipMCTS: false }

    const winRate = stats.played > 0 ? stats.wins / stats.played : 0.5

    // V5: Lower thresholds — skip MCTS with less data
    if (stats.played >= 30 && winRate > 0.53) {
      return { skipMCTS: true, prior: winRate }
    }

    // Some data → use as prior
    if (stats.played >= 5) {
      return { skipMCTS: false, prior: winRate }
    }

    return { skipMCTS: false }
  }

  /**
   * Generuj klucz otwarcia z kroków macro-move.
   */
  private openingKey(round: number, steps: MCTSMove[]): string {
    const actionSteps = steps.filter(s =>
      s.type !== 'advance_to_combat' && s.type !== 'end_turn',
    )
    if (actionSteps.length === 0) return `T${round}:none`
    return `T${round}:${actionSteps.map(s => moveKey(s)).join('+')}`
  }
}
