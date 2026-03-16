/**
 * XP & Level system for Sława Vol.2.
 *
 * XP per match:
 *   - Win: 100 base + 10 per round
 *   - Loss: 30 base + 5 per round
 *   - Draw: 50
 *   - Surrender: 10
 *   - Multiplier: x1.5 for hard AI, x2 for human opponent
 *
 * Level thresholds: level N requires N*100 XP from previous level.
 *   Level 1→2: 100 XP, Level 2→3: 200 XP, etc.
 */

export interface XPResult {
  xpEarned: number
  newXp: number
  newLevel: number
  leveledUp: boolean
  rewards: LevelReward[]
}

export interface LevelReward {
  level: number
  type: string
  id: string
  name: string
}

/** Total XP required to reach a given level (from level 1). */
export function xpForLevel(level: number): number {
  // Sum of 100 + 200 + ... + (level-1)*100 = 50 * level * (level - 1)
  return 50 * level * (level - 1)
}

/** Determine level from total XP. */
export function levelFromXp(totalXp: number): number {
  // Solve: 50 * L * (L-1) <= totalXp
  // L^2 - L - totalXp/50 <= 0
  // L <= (1 + sqrt(1 + 4*totalXp/50)) / 2
  let level = Math.floor((1 + Math.sqrt(1 + (4 * totalXp) / 50)) / 2)
  // Clamp to at least 1
  if (level < 1) level = 1
  return level
}

/** Calculate XP earned for a match. */
export function calculateMatchXP(
  result: 'win' | 'loss' | 'draw' | 'surrender',
  rounds: number,
  opponentType: string,
): number {
  let base = 0
  switch (result) {
    case 'win':
      base = 100 + rounds * 10
      break
    case 'loss':
      base = 30 + rounds * 5
      break
    case 'draw':
      base = 50
      break
    case 'surrender':
      base = 10
      break
  }

  // Multiplier for opponent difficulty
  let multiplier = 1
  if (opponentType === 'ai_hard') multiplier = 1.5
  else if (opponentType === 'human') multiplier = 2

  return Math.round(base * multiplier)
}
