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

/** V6: Matchup stats — creature A vs creature B */
export interface MatchupStats {
  encounters: number
  wins: number  // wins for the side that had effectId1
}

/** V6: Positional win rate — bucketed by field advantage + round */
export interface PositionalStats {
  samples: number
  wins: number
}

/** V7.3: Enhanced adventure stats */
export interface EnhancedStats {
  played: number
  wins: number
  psAtPlay: number[]
  roundAtPlay: number[]
}

/** V7.3: Combat target stats — "atakowanie X daje WR Y" */
export interface CombatTargetStats {
  attacks: number    // ile razy attacker atakował target
  wins: number       // ile z tych gier wygrał attacker-side
}

/** V7.3: Effect power stats — jak mocny jest efekt w praktyce */
export interface EffectPowerStats {
  triggered: number  // ile razy efekt się odpalił
  wins: number       // ile z tych gier wygrało
  totalGrowth: number // sumaryczny stat growth (ATK+DEF gained)
}

/** V7.3: Death stats — kiedy istota umiera i kto ją zabija */
export interface DeathStats {
  deaths: number       // ile razy umarła
  avgDeathRound: number // avg runda śmierci (suma / deaths)
  deathRoundSum: number // suma rund śmierci
  killedBy: Record<string, number> // effectId killera → count
  winsWhenSurvived: number  // wygrane gdy przeżyła do końca
  gamesWhenSurvived: number // gry w których przeżyła
}

export interface ExperienceData {
  version: number
  gamesPlayed: number
  cardStats: Record<string, CardStats>
  openingStats: Record<string, OpeningStats>
  synergyStats: Record<string, SynergyStats>
  matchupStats: Record<string, MatchupStats>
  positionalStats: Record<string, PositionalStats>
  enhancedStats: Record<string, EnhancedStats>
  // V7.3 NEW:
  combatTargetStats: Record<string, CombatTargetStats>  // "attacker+target" → WR
  effectPowerStats: Record<string, EffectPowerStats>     // effectId → triggered count + power
  deathStats: Record<string, DeathStats>                 // effectId → when/how dies
}

/** Trace jednej gry — zbierany przez benchmark, zapisywany do ExperienceDB */
export interface GameTrace {
  winner: number  // 0=player1, 1=player2
  rounds: number
  moves: GameTraceMove[]
  winMethod?: 'ps' | 'elimination' | 'gold_loss'
  finalPS?: [number, number]
  // V7.3 NEW:
  deaths?: GameTraceDeath[]           // wszystkie śmierci w grze
  survivors?: GameTraceSurvivor[]     // istoty które przeżyły do końca
}

export interface GameTraceMove {
  round: number
  side: number  // 0 or 1
  effectIds: string[]
  opponentFieldEffectIds?: string[]
  myPS?: number
  oppPS?: number
  myFieldCount?: number
  oppFieldCount?: number
  enhancedIds?: string[]
  // V7.3 NEW:
  attacks?: GameTraceAttack[]    // kto kogo atakował w tej turze
}

export interface GameTraceAttack {
  attacker: string  // effectId
  target: string    // effectId
  damage: number
  killed: boolean
}

export interface GameTraceDeath {
  effectId: string
  round: number
  side: number       // czyja istota
  killerEffectId?: string
}

export interface GameTraceSurvivor {
  effectId: string
  side: number
  finalAtk: number
  finalDef: number
  baseAtk: number
  baseDef: number
}

// ===== EXPERIENCE DB =====

export class ExperienceDB {
  private data: ExperienceData

  constructor() {
    this.data = {
      version: 2,
      gamesPlayed: 0,
      cardStats: {},
      openingStats: {},
      synergyStats: {},
      matchupStats: {},
      positionalStats: {},
      enhancedStats: {},
      combatTargetStats: {},
      effectPowerStats: {},
      deathStats: {},
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

  // ===== V6 QUERY API =====

  /** Matchup WR: my creature effect vs opponent's creature effect. */
  getMatchupWR(myEffectId: string, oppEffectId: string): number {
    const key = [myEffectId, oppEffectId].sort().join('+')
    const stats = this.data.matchupStats?.[key]
    if (!stats || stats.encounters < 10) return 0.5
    // If key is sorted, check if myEffectId comes first
    const isFirst = myEffectId <= oppEffectId
    return isFirst ? stats.wins / stats.encounters : 1 - stats.wins / stats.encounters
  }

  /** Positional WR: given field advantage and round bucket. */
  getPositionalWR(myFieldCount: number, oppFieldCount: number, round: number): number {
    const diff = Math.max(-3, Math.min(3, myFieldCount - oppFieldCount))
    const roundBucket = round <= 5 ? '1-5' : round <= 10 ? '6-10' : round <= 15 ? '11-15' : '16+'
    const key = `diff:${diff > 0 ? '+' : ''}${diff},round:${roundBucket}`
    const stats = this.data.positionalStats?.[key]
    if (!stats || stats.samples < 10) return 0.5
    return stats.wins / stats.samples
  }

  /** V7.3: Enhanced adventure WR. Returns 0.5 if insufficient data. */
  getEnhancedWR(effectId: string): number {
    const stats = this.data.enhancedStats?.[effectId]
    if (!stats || stats.played < 5) return 0.5
    return stats.wins / stats.played
  }

  /** V7.3: Should this specific adventure be enhanced? Data-driven. */
  shouldEnhance(effectId: string, myPS: number, round: number): boolean | null {
    const stats = this.data.enhancedStats?.[effectId]
    if (!stats || stats.played < 10) return null
    const wr = stats.wins / stats.played
    return wr >= 0.55
  }

  /** V7.3: Combat target WR — "atakowanie targetu tym attackerem → WR". */
  getCombatTargetWR(attackerEffectId: string, targetEffectId: string): number {
    const key = `${attackerEffectId}>${targetEffectId}`
    const stats = this.data.combatTargetStats?.[key]
    if (!stats || stats.attacks < 5) return 0.5
    return stats.wins / stats.attacks
  }

  /** V7.3: Effect power — jak skuteczny jest efekt (triggered WR). */
  getEffectPowerWR(effectId: string): number {
    const stats = this.data.effectPowerStats?.[effectId]
    if (!stats || stats.triggered < 10) return 0.5
    return stats.wins / stats.triggered
  }

  /** V7.3: Czy istota przeżywa → WR? "Key creature to protect." */
  getSurvivalWR(effectId: string): number {
    const stats = this.data.deathStats?.[effectId]
    if (!stats || stats.gamesWhenSurvived < 5) return 0.5
    return stats.winsWhenSurvived / stats.gamesWhenSurvived
  }

  /** V7.3: Kto najczęściej zabija tę istotę? Top killer effectId. */
  getTopKiller(effectId: string): string | null {
    const stats = this.data.deathStats?.[effectId]
    if (!stats || !stats.killedBy) return null
    let topKiller = '', topCount = 0
    for (const [kid, count] of Object.entries(stats.killedBy)) {
      if (count > topCount) { topKiller = kid; topCount = count }
    }
    return topCount >= 3 ? topKiller : null
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

      // V6: Matchup stats (my creatures vs opponent's field)
      if (move.opponentFieldEffectIds) {
        if (!this.data.matchupStats) this.data.matchupStats = {}
        for (const myEid of move.effectIds) {
          if (!myEid) continue
          for (const oppEid of move.opponentFieldEffectIds) {
            if (!oppEid) continue
            const key = [myEid, oppEid].sort().join('+')
            if (!this.data.matchupStats[key]) {
              this.data.matchupStats[key] = { encounters: 0, wins: 0 }
            }
            const s = this.data.matchupStats[key]!
            s.encounters++
            // wins = wins for the side whose effectId comes first alphabetically
            const isFirstAlpha = myEid <= oppEid
            if ((isFirstAlpha && isWinner) || (!isFirstAlpha && !isWinner)) s.wins++
          }
        }
      }

      // V6: Positional stats (field advantage + round bucket)
      if (move.myFieldCount !== undefined && move.oppFieldCount !== undefined) {
        if (!this.data.positionalStats) this.data.positionalStats = {}
        const diff = Math.max(-3, Math.min(3, move.myFieldCount - move.oppFieldCount))
        const roundBucket = move.round <= 5 ? '1-5' : move.round <= 10 ? '6-10' : move.round <= 15 ? '11-15' : '16+'
        const key = `diff:${diff > 0 ? '+' : ''}${diff},round:${roundBucket}`
        if (!this.data.positionalStats[key]) {
          this.data.positionalStats[key] = { samples: 0, wins: 0 }
        }
        const s = this.data.positionalStats[key]!
        s.samples++
        if (isWinner) s.wins++
      }

      // V7.3: Enhanced adventure stats
      if (move.enhancedIds && move.enhancedIds.length > 0) {
        if (!this.data.enhancedStats) this.data.enhancedStats = {}
        for (const eid of move.enhancedIds) {
          if (!eid) continue
          if (!this.data.enhancedStats[eid]) {
            this.data.enhancedStats[eid] = { played: 0, wins: 0, psAtPlay: [], roundAtPlay: [] }
          }
          const s = this.data.enhancedStats[eid]!
          s.played++
          if (isWinner) s.wins++
          if (move.myPS !== undefined) s.psAtPlay.push(move.myPS)
          s.roundAtPlay.push(move.round)
        }
      }

      // V7.3: Combat target stats
      if (move.attacks) {
        if (!this.data.combatTargetStats) this.data.combatTargetStats = {}
        for (const atk of move.attacks) {
          if (!atk.attacker || !atk.target) continue
          const key = `${atk.attacker}>${atk.target}`
          if (!this.data.combatTargetStats[key]) {
            this.data.combatTargetStats[key] = { attacks: 0, wins: 0 }
          }
          const s = this.data.combatTargetStats[key]!
          s.attacks++
          if (isWinner) s.wins++
        }
      }
    }

    // V7.3: Death stats
    if (trace.deaths) {
      if (!this.data.deathStats) this.data.deathStats = {}
      for (const d of trace.deaths) {
        if (!this.data.deathStats[d.effectId]) {
          this.data.deathStats[d.effectId] = {
            deaths: 0, avgDeathRound: 0, deathRoundSum: 0,
            killedBy: {}, winsWhenSurvived: 0, gamesWhenSurvived: 0,
          }
        }
        const s = this.data.deathStats[d.effectId]!
        s.deaths++
        s.deathRoundSum += d.round
        s.avgDeathRound = s.deathRoundSum / s.deaths
        if (d.killerEffectId) {
          s.killedBy[d.killerEffectId] = (s.killedBy[d.killerEffectId] ?? 0) + 1
        }
      }
    }

    // V7.3: Survivor stats (creatures alive at game end → survival WR)
    if (trace.survivors) {
      if (!this.data.deathStats) this.data.deathStats = {}
      if (!this.data.effectPowerStats) this.data.effectPowerStats = {}
      for (const surv of trace.survivors) {
        // Survival tracking
        if (!this.data.deathStats[surv.effectId]) {
          this.data.deathStats[surv.effectId] = {
            deaths: 0, avgDeathRound: 0, deathRoundSum: 0,
            killedBy: {}, winsWhenSurvived: 0, gamesWhenSurvived: 0,
          }
        }
        const ds = this.data.deathStats[surv.effectId]!
        ds.gamesWhenSurvived++
        if (surv.side === won) ds.winsWhenSurvived++

        // Effect power: stat growth = how much the effect contributed
        const growth = (surv.finalAtk - surv.baseAtk) + (surv.finalDef - surv.baseDef)
        if (growth > 0) {
          if (!this.data.effectPowerStats[surv.effectId]) {
            this.data.effectPowerStats[surv.effectId] = { triggered: 0, wins: 0, totalGrowth: 0 }
          }
          const ep = this.data.effectPowerStats[surv.effectId]!
          ep.triggered++
          ep.totalGrowth += growth
          if (surv.side === won) ep.wins++
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

  /** Deserialize from JSON string. Handles v1→v2 migration. */
  deserialize(json: string): void {
    try {
      const parsed = JSON.parse(json) as ExperienceData
      if (parsed.version && parsed.cardStats) {
        this.data = parsed
        // V1→V2 migration: add missing fields
        if (!this.data.matchupStats) this.data.matchupStats = {}
        if (!this.data.positionalStats) this.data.positionalStats = {}
        this.data.version = 2
      }
    } catch {
      // Invalid JSON — keep current data
    }
  }

  get gamesPlayed(): number {
    return this.data.gamesPlayed
  }
}
