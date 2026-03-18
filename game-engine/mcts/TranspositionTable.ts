/**
 * TranspositionTable — cache ewaluacji stanów gry.
 *
 * Przechowuje wyniki rolloutów indeksowane Zobrist hashem.
 * Hit → skip kosztownego rolloutu, użyj cached średniej wartości.
 *
 * Eviction: FIFO — po przekroczeniu maxSize, najstarszy wpis usuwany.
 * Persistent w ramach gry (MCTSPlayer field) — cross-turn knowledge transfer.
 */

// ===== TYPES =====

export interface TTEntry {
  visits: number
  totalValue: number
  depth: number
}

// ===== TRANSPOSITION TABLE =====

export class TranspositionTable {
  private table = new Map<bigint, TTEntry>()
  private maxSize: number

  constructor(maxSize: number = 100000) {
    this.maxSize = maxSize
  }

  /**
   * Lookup cached evaluation.
   * Returns entry if found, undefined otherwise.
   */
  lookup(hash: bigint): TTEntry | undefined {
    return this.table.get(hash)
  }

  /**
   * Store/accumulate evaluation result.
   * If entry exists: increment visits, accumulate value.
   * If new: create entry (with FIFO eviction if full).
   */
  store(hash: bigint, value: number, depth: number): void {
    const entry = this.table.get(hash)
    if (entry) {
      entry.visits++
      entry.totalValue += value
      if (depth > entry.depth) entry.depth = depth
    } else {
      // FIFO eviction
      if (this.table.size >= this.maxSize) {
        const firstKey = this.table.keys().next().value
        if (firstKey !== undefined) this.table.delete(firstKey)
      }
      this.table.set(hash, { visits: 1, totalValue: value, depth })
    }
  }

  /** Clear all entries (e.g., new game) */
  clear(): void {
    this.table.clear()
  }

  get size(): number {
    return this.table.size
  }

  /** Hit rate statistic (for benchmarking) */
  get stats(): { size: number } {
    return { size: this.table.size }
  }
}
