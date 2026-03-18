/**
 * MCTS Types — typy dla Monte Carlo Tree Search.
 *
 * ISMCTS "na sterydach":
 * - UCB1 + RAVE (All Moves As First) — szybsza zbieżność
 * - Progressive widening — zarządzanie wysokim branching factor
 * - Determinizacja — Information Set MCTS dla ukrytej informacji
 * - Heurystyczny rollout — medium AI zamiast random
 * - Time-budgeted — konfigurowalne limity czasowe
 */

import type { BattleLine, CardPosition } from '../constants'

// ===== MOVE REPRESENTATION =====

/** Pojedyncza akcja w drzewie MCTS */
export interface MCTSMove {
  type:
    | 'play_creature'
    | 'play_adventure'
    | 'attack'
    | 'change_position'
    | 'activate_effect'
    | 'invoke_god'
    | 'advance_to_combat'
    | 'end_turn'
    | 'plunder'
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
  useEnhanced?: boolean
  godId?: number
  bidAmount?: number
}

/** Unikalny klucz ruchu — do identyfikacji w drzewie */
export function moveKey(move: MCTSMove): string {
  const parts: string[] = [move.type]
  if (move.cardInstanceId) parts.push(move.cardInstanceId)
  if (move.targetInstanceId) parts.push(move.targetInstanceId)
  if (move.targetLine !== undefined) parts.push(`L${move.targetLine}`)
  if (move.targetPosition !== undefined) parts.push(String(move.targetPosition))
  if (move.useEnhanced) parts.push('enh')
  if (move.godId !== undefined) parts.push(`g${move.godId}`)
  return parts.join(':')
}

// ===== MACRO-MOVE (Faza 1) =====

/** Pełna sekwencja PLAY-phase: istota + przygoda + aktywacja + advance_to_combat */
export interface MacroMove {
  /** Unikalny identyfikator sekwencji */
  key: string
  /** Sekwencja atomowych ruchów */
  steps: MCTSMove[]
  /** Heurystyczny scoring (suma skorów kroków) */
  heuristicScore: number
}

// ===== CONFIGURATION =====

/** Konfiguracja MCTS */
export interface MCTSConfig {
  /** Max czas wyszukiwania w ms (default: 2000) */
  timeBudgetMs: number
  /** Max iteracji — hard cap (default: 50000) */
  maxIterations: number
  /** UCB1 stała eksploracji C (default: √2) */
  explorationConstant: number
  /** Max tur do symulacji w rollout (default: 30) */
  rolloutDepthLimit: number
  /** Progressive widening: max dzieci ≈ K × visits^α */
  progressiveWideningK: number
  progressiveWideningAlpha: number
  /** Użyj RAVE/AMAF dla szybszej zbieżności */
  useRAVE: boolean
  /** RAVE equivalence parameter — kontroluje szybkość zaniku RAVE (default: 300) */
  raveK: number
  /** Determinizacja ukrytej informacji przed rollout */
  useDeterminization: boolean
  /** Waga heurystyki dla nie-terminalnych rolloutów (default: 0.7) */
  heuristicWeight: number

  // === Faza 1: Macro-Move ===
  /** Max macro-moves do rozpatrzenia (default: 30) */
  maxMacroMoves: number

  // === Faza 2: Transposition Table ===
  /** Użyj Transposition Table (default: true) */
  useTT: boolean
  /** Rozmiar TT — max entries (default: 100000) */
  ttSize: number
  /** Min visits w TT żeby użyć cached value (default: 3) */
  ttMinVisits: number

  // === Faza 3: Tree Reuse ===
  /** Reuse drzewa między turami (default: true) */
  useTreeReuse: boolean

  // === Faza 4: Experience ===
  /** Waga prioru z experience DB (virtual visits) (default: 10) */
  experiencePriorWeight: number
}

/** Domyślna konfiguracja MCTS */
export const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  timeBudgetMs: 2000,
  maxIterations: 50000,
  explorationConstant: 1.0,        // niższe C — z 200+ iter exploitujemy więcej
  rolloutDepthLimit: 10,           // głębszy rollout (LightState jest szybki)
  progressiveWideningK: 1.5,      // tight: tree expansion kosztuje ~2ms/node (JSON clone)
  progressiveWideningAlpha: 0.35,  // wolne rozszerzanie — koncentruj visits
  useRAVE: true,
  raveK: 150,                      // szybsze zanikanie RAVE z dużą liczbą iteracji
  useDeterminization: true,
  heuristicWeight: 0.7,            // mniej heurystyki, więcej rollout signal
  maxMacroMoves: 30,
  useTT: false,               // disabled for 1-level tree — TT replaces ISMCTS determinization
  ttSize: 100000,
  ttMinVisits: 50,
  useTreeReuse: true,
  experiencePriorWeight: 10,
}

// ===== STATISTICS =====

/** Statystyki z wyszukiwania MCTS */
export interface MCTSStats {
  iterations: number
  treeNodes: number
  avgRolloutDepth: number
  timeElapsedMs: number
  bestMoveVisits: number
  bestMoveWinRate: number
  movesConsidered: number
}
