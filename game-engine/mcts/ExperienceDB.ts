/**
 * ExperienceDB — persistent pattern database z win rates kart, otwarć i synergii.
 *
 * Zbiera statystyki z rozegranych gier:
 * - Per-card win rate (overall + per phase: early/mid/late)
 * - Opening win rate (specific first moves)
 * - Synergy win rate (pairs of cards played together)
 *
 * Używane jako prior w UCB1 (Faza 4) — virtual visits bootstrap.
 * Dane in-memory, save/load via JSON string (fs obsługiwane przez caller).
 */

// ===== TYPES =====

export interface CardStats {
  played: number
  wins: number
  earlyPlayed: number   // rounds 1-3
  earlyWins: number
  midPlayed: number     // rounds 4-7
  midWins: number
  latePlayed: number    // rounds 8+
  lateWins: number
}

export interface OpeningStats {
  played: number
  wins: number
}

export interface SynergyStats {
  coPlayed: number
  coWins: number
}

export interface ExperienceData {
  version: number
  gamesPlayed: number
  cardStats: Record<string, CardStats>
  openingStats: Record<string, OpeningStats>
  synergyStats: Record<string, SynergyStats>
}

/** Trace jednej gry — zbierany przez benchmark, zapisywany do ExperienceDB */
export interface GameTrace {
  winner: number  // 0=player1, 1=player2
  rounds: number
  moves: GameTraceMove[]
}

export interface GameTraceMove {
  round: number
  side: number  // 0 or 1
  effectIds: string[]  // effectId kart zagranych w tej turze
}

// ===== EXPERIENCE DB =====

export class ExperienceDB {
  private data: ExperienceData

  constructor() {
    this.data = {
      version: 1,
      gamesPlayed: 0,
      cardStats: {},
      openingStats: {},
      synergyStats: {},
    }
  }

  // ===== QUERY API =====

  /** Win rate karty (overall lub per phase). Zwraca 0.5 jeśli brak danych. */
  getCardWinRate(effectId: string, phase?: 'early' | 'mid' | 'late'): number {
    const stats = this.data.cardStats[effectId]
    if (!stats) return 0.5
    if (phase === 'early') return stats.earlyPlayed >= 5 ? stats.earlyWins / stats.earlyPlayed : 0.5
    if (phase === 'mid') return stats.midPlayed >= 5 ? stats.midWins / stats.midPlayed : 0.5
    if (phase === 'late') return stats.latePlayed >= 5 ? stats.lateWins / stats.latePlayed : 0.5
    return stats.played >= 5 ? stats.wins / stats.played : 0.5
  }

  /** Win rate otwarcia. Zwraca 0.5 jeśli brak danych. */
  getOpeningWinRate(key: string): number {
    const stats = this.data.openingStats[key]
    if (!stats || stats.played < 5) return 0.5
    return stats.wins / stats.played
  }

  /** Synergy bonus (0 jeśli za mało danych, 0–0.1 przy positive synergy). */
  getSynergyBonus(effectId1: string, effectId2: string): number {
    const key = [effectId1, effectId2].sort().join('+')
    const stats = this.data.synergyStats[key]
    if (!stats || stats.coPlayed < 10) return 0
    const wr = stats.coWins / stats.coPlayed
    return Math.max(0, wr - 0.5) * 0.2
  }

  /** Opening stats lookup (for OpeningBook). */
  getOpeningStats(key: string): OpeningStats | undefined {
    return this.data.openingStats[key]
  }

  // ===== RECORDING =====

  /** Zapisz wynik gry. */
  recordGame(trace: GameTrace): void {
    this.data.gamesPlayed++
    const won = trace.winner

    for (const move of trace.moves) {
      const isWinner = move.side === won
      const phase: 'early' | 'mid' | 'late' =
        move.round <= 3 ? 'early' : move.round <= 7 ? 'mid' : 'late'

      // Card stats
      for (const eid of move.effectIds) {
        if (!eid) continue
        if (!this.data.cardStats[eid]) {
          this.data.cardStats[eid] = {
            played: 0, wins: 0,
            earlyPlayed: 0, earlyWins: 0,
            midPlayed: 0, midWins: 0,
            latePlayed: 0, lateWins: 0,
          }
        }
        const s = this.data.cardStats[eid]!
        s.played++
        if (isWinner) s.wins++
        if (phase === 'early') { s.earlyPlayed++; if (isWinner) s.earlyWins++ }
        else if (phase === 'mid') { s.midPlayed++; if (isWinner) s.midWins++ }
        else { s.latePlayed++; if (isWinner) s.lateWins++ }
      }

      // Synergy stats (pairs)
      for (let i = 0; i < move.effectIds.length; i++) {
        for (let j = i + 1; j < move.effectIds.length; j++) {
          const eid1 = move.effectIds[i]!
          const eid2 = move.effectIds[j]!
          if (!eid1 || !eid2) continue
          const key = [eid1, eid2].sort().join('+')
          if (!this.data.synergyStats[key]) {
            this.data.synergyStats[key] = { coPlayed: 0, coWins: 0 }
          }
          const s = this.data.synergyStats[key]!
          s.coPlayed++
          if (isWinner) s.coWins++
        }
      }
    }

    // Opening stats (rounds 1–2)
    const earlyMoves = trace.moves.filter(m => m.round <= 2)
    for (const move of earlyMoves) {
      if (move.effectIds.length === 0) continue
      const key = `T${move.round}:${move.effectIds.join('+')}`
      if (!this.data.openingStats[key]) {
        this.data.openingStats[key] = { played: 0, wins: 0 }
      }
      const s = this.data.openingStats[key]!
      s.played++
      if (move.side === won) s.wins++
    }
  }

  // ===== PERSISTENCE (caller handles fs) =====

  /** Serialize to JSON string. */
  serialize(): string {
    return JSON.stringify(this.data, null, 2)
  }

  /** Deserialize from JSON string. */
  deserialize(json: string): void {
    try {
      const parsed = JSON.parse(json) as ExperienceData
      if (parsed.version && parsed.cardStats) {
        this.data = parsed
      }
    } catch {
      // Invalid JSON — keep current data
    }
  }

  get gamesPlayed(): number {
    return this.data.gamesPlayed
  }
}
