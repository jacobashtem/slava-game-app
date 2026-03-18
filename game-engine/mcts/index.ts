/**
 * MCTS Module — Monte Carlo Tree Search "na sterydach"
 *
 * Eksportuje główną klasę MCTSPlayer + typy konfiguracyjne.
 *
 * Usage:
 *   import { MCTSPlayer } from './mcts'
 *   const mcts = new MCTSPlayer('player2', { timeBudgetMs: 3000 })
 *   const decisions = mcts.planTurn(gameState)
 */

export { MCTSPlayer } from './MCTSPlayer'
export { MCTSNode } from './MCTSNode'
export { determinize } from './Determinizer'
export { rollout } from './RolloutPolicy'
export { rolloutLight } from './LightweightSimulator'
export { gameStateToLight, cloneLightState, evaluateLight } from './LightweightState'
export {
  getAvailableMoves,
  applyMove,
  evaluate,
  isTerminal,
  scoreMove,
} from './StateAdapter'
export {
  DEFAULT_MCTS_CONFIG,
  moveKey,
} from './types'
export type {
  MCTSMove,
  MCTSConfig,
  MCTSStats,
  MacroMove,
} from './types'
export { generateMacroMoves } from './MacroMoveGenerator'
export type { MacroMoveResult } from './MacroMoveGenerator'
export { computeHash } from './StateHash'
export { TranspositionTable } from './TranspositionTable'
export type { TTEntry } from './TranspositionTable'
export { ExperienceDB } from './ExperienceDB'
export type { GameTrace, GameTraceMove } from './ExperienceDB'
export { OpeningBook } from './OpeningBook'
export {
  effectThreatTier,
  killValue,
  priorityKillBonus,
  assessGameSituation,
  hasSynergy,
  countFieldSynergies,
  phaseBonus,
  prefersDefense,
  canAffordEnhancedSmart,
} from './StrategicPatterns'
export type { GameSituation } from './StrategicPatterns'
