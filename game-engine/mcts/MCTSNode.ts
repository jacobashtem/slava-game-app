/**
 * MCTSNode — węzeł drzewa Monte Carlo Tree Search.
 *
 * Implementuje:
 * - UCB1 selekcję z konfigurowalnm C
 * - RAVE (Rapid Action Value Estimation) — szybsza zbieżność
 * - Progressive widening — ogranicza branching factor
 * - Backpropagacja z opcjonalnym RAVE update
 */

import type { GameState } from '../types'
import type { MCTSMove, MCTSConfig } from './types'
import { moveKey } from './types'

export class MCTSNode {
  // ----- Struktura drzewa -----
  parent: MCTSNode | null
  children: Map<string, MCTSNode> = new Map() // moveKey → child
  move: MCTSMove | null // akcja prowadząca do tego węzła (null dla root)

  // ----- Stan gry -----
  state: GameState
  /** Dostępne ruchy posortowane wg heurystyki (najlepsze na początku) */
  untriedMoves: MCTSMove[]
  /** Indeks następnego ruchu do ekspansji */
  private untriedIndex = 0

  // ----- Macro-Move (Faza 1) -----
  /** Pełna sekwencja kroków macro-move (null = single move) */
  macroSteps: MCTSMove[] | null = null

  // ----- UCB1 statystyki -----
  visits = 0
  wins = 0

  // ----- RAVE statystyki (action → {wins, visits}) -----
  raveWins: Map<string, number> = new Map()
  raveVisits: Map<string, number> = new Map()

  constructor(
    state: GameState,
    parent: MCTSNode | null,
    move: MCTSMove | null,
    availableMoves: MCTSMove[],
  ) {
    this.state = state
    this.parent = parent
    this.move = move
    this.untriedMoves = availableMoves
  }

  // ===== PROPERTIES =====

  /** Czy gra zakończona lub tura skończona? */
  get isTerminal(): boolean {
    return this.state.winner !== null || this.move?.type === 'end_turn'
  }

  /** Czy wszystkie dostępne ruchy zostały rozwinięte? */
  get hasUntriedMoves(): boolean {
    return this.untriedIndex < this.untriedMoves.length
  }

  // ===== UCB1 + RAVE SELEKCJA =====

  /**
   * Wybierz najlepsze dziecko wg UCB1 + RAVE + Experience Prior.
   *
   * Formuła UCB1-RAVE:
   *   value = (1 - β) × Q_UCB1 + β × Q_RAVE + C × √(ln(parent.visits) / child.visits)
   *
   * Gdzie β = √(K / (3 × visits + K)) — zanika od 1 do 0 z rosnącymi wizytami.
   *
   * Experience Prior (Faza 4):
   *   exploitation = (wins + prior * priorWeight) / (visits + priorWeight)
   *   Gives virtual visits bootstrap from experience DB.
   *
   * @param experiencePriors — optional map: childKey → prior value (0–1)
   */
  selectChild(config: MCTSConfig, experiencePriors?: Map<string, number>): MCTSNode {
    let bestChild: MCTSNode | null = null
    let bestValue = -Infinity
    const lnParent = Math.log(this.visits + 1)
    const priorWeight = config.experiencePriorWeight

    for (const [childKey, child] of this.children) {
      if (child.visits === 0) {
        // Nieodwiedzony węzeł → nieskończony UCB1 → natychmiast eksploruj
        return child
      }

      // Base exploitation with optional experience prior
      let exploitation: number
      const prior = experiencePriors?.get(childKey)
      if (prior !== undefined && priorWeight > 0) {
        // Virtual visits: blend prior with observed wins
        exploitation = (child.wins + prior * priorWeight) / (child.visits + priorWeight)
      } else {
        exploitation = child.wins / child.visits
      }

      const exploration =
        config.explorationConstant * Math.sqrt(lnParent / child.visits)

      let value: number

      if (config.useRAVE && child.move) {
        const key = moveKey(child.move)
        const raveW = this.raveWins.get(key) ?? 0
        const raveV = this.raveVisits.get(key) ?? 0

        if (raveV > 0) {
          const raveExploitation = raveW / raveV
          const beta = Math.sqrt(
            config.raveK / (3 * child.visits + config.raveK),
          )
          value =
            (1 - beta) * exploitation +
            beta * raveExploitation +
            exploration
        } else {
          value = exploitation + exploration
        }
      } else {
        value = exploitation + exploration
      }

      if (value > bestValue) {
        bestValue = value
        bestChild = child
      }
    }

    return bestChild!
  }

  // ===== EKSPANSJA =====

  /**
   * Rozwiń następny nieodwiedzony ruch.
   * Zwraca nowy węzeł-dziecko.
   */
  expand(
    childState: GameState,
    childMoves: MCTSMove[],
  ): MCTSNode {
    if (!this.hasUntriedMoves)
      throw new Error('[MCTSNode] Brak ruchów do ekspansji')

    const move = this.untriedMoves[this.untriedIndex++]!
    const key = moveKey(move)
    const child = new MCTSNode(childState, this, move, childMoves)
    this.children.set(key, child)
    return child
  }

  /** Pobierz następny ruch do ekspansji (nie konsumuje) */
  peekNextUntriedMove(): MCTSMove {
    return this.untriedMoves[this.untriedIndex]!
  }

  /** Pomiń bieżący ruch (gdy applyMove zwróci null) */
  skipCurrentUntried(): void {
    this.untriedIndex++
  }

  // ===== PROGRESSIVE WIDENING =====

  /**
   * Czy powinniśmy rozwinąć kolejne dziecko?
   * Progressive widening: max dzieci = K × visits^α
   */
  shouldExpand(config: MCTSConfig): boolean {
    if (!this.hasUntriedMoves) return false
    const maxChildren = Math.ceil(
      config.progressiveWideningK *
        Math.pow(this.visits + 1, config.progressiveWideningAlpha),
    )
    return this.children.size < maxChildren
  }

  // ===== BACKPROPAGACJA =====

  /**
   * Propaguj wynik symulacji w górę drzewa.
   * @param result — wartość w [0, 1] z perspektywy naszej strony
   * @param playedMoveKeys — klucze ruchów zagranych w symulacji (dla RAVE)
   */
  backpropagate(
    result: number,
    playedMoveKeys: string[],
    config: MCTSConfig,
  ): void {
    let node: MCTSNode | null = this as MCTSNode
    while (node) {
      node.visits++
      node.wins += result

      // Update RAVE: jeśli ruch z playedMoveKeys pojawia się w tym poddrzewie
      if (config.useRAVE) {
        for (const key of playedMoveKeys) {
          node.raveWins.set(key, (node.raveWins.get(key) ?? 0) + result)
          node.raveVisits.set(key, (node.raveVisits.get(key) ?? 0) + 1)
        }
      }

      node = node.parent
    }
  }

  // ===== WYNIK =====

  /** Najlepsza akcja = dziecko z największą liczbą wizyt (robust child) */
  getBestMove(): MCTSMove | null {
    let bestVisits = -1
    let bestMove: MCTSMove | null = null

    for (const child of this.children.values()) {
      if (child.visits > bestVisits) {
        bestVisits = child.visits
        bestMove = child.move
      }
    }
    return bestMove
  }

  /**
   * Wyciągnij pełną najlepszą ścieżkę (plan tury).
   * Na każdym poziomie wybiera dziecko z największą liczbą wizyt.
   */
  getBestPath(): MCTSMove[] {
    const path: MCTSMove[] = []
    let current: MCTSNode = this

    while (current.children.size > 0) {
      let bestChild: MCTSNode | null = null
      let bestVisits = -1

      for (const child of current.children.values()) {
        if (child.visits > bestVisits) {
          bestVisits = child.visits
          bestChild = child
        }
      }

      if (!bestChild?.move) break
      path.push(bestChild.move)
      if (bestChild.move.type === 'end_turn') break
      current = bestChild
    }

    // Zawsze kończ turę
    if (path.length === 0 || path[path.length - 1]!.type !== 'end_turn') {
      path.push({ type: 'end_turn' })
    }

    return path
  }

  // ===== DEBUG =====

  /** Policz wszystkie węzły w poddrzewie */
  get nodeCount(): number {
    let count = 1
    for (const child of this.children.values()) {
      count += child.nodeCount
    }
    return count
  }

  /** Debug: pokaż top-N dzieci */
  debugChildren(topN = 5): string[] {
    const sorted = [...this.children.values()].sort(
      (a, b) => b.visits - a.visits,
    )
    return sorted.slice(0, topN).map((c) => {
      const wr = c.visits > 0 ? ((c.wins / c.visits) * 100).toFixed(1) : '?'
      return `${c.move?.type ?? '?'}${c.move?.cardInstanceId ? ':' + c.move.cardInstanceId.slice(-6) : ''} → ${wr}% WR (${c.visits} visits)`
    })
  }
}
