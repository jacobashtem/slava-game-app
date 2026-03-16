/**
 * POST /api/player/stats
 * Report match result after game over. Calculates XP, records match, checks level up.
 */
import { verifySession } from '../../utils/auth'
import { calculateMatchXP, levelFromXp, type XPResult } from '../../utils/xp'

interface MatchReport {
  opponentType: 'ai_easy' | 'ai_medium' | 'ai_hard' | 'human'
  opponentName?: string
  gameMode: 'gold' | 'slava'
  result: 'win' | 'loss' | 'draw' | 'surrender'
  rounds: number
  playerGlory?: number
  opponentGlory?: number
  duration?: number // seconds
}

export default defineEventHandler(async (event) => {
  const session = await verifySession(event)
  const body = await readBody<MatchReport>(event)

  // Validate
  if (!body.result || !body.gameMode || !body.opponentType || !body.rounds) {
    throw createError({ statusCode: 400, statusMessage: 'Brakujące dane meczu.' })
  }

  const db = hubDatabase()

  // Calculate XP
  const xpEarned = calculateMatchXP(body.result, body.rounds, body.opponentType)
  const matchId = crypto.randomUUID()

  // Insert match record
  await db
    .prepare(`
      INSERT INTO matches (id, player_id, opponent_type, opponent_name, game_mode, result, rounds, player_glory, opponent_glory, xp_earned, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      matchId,
      session.playerId,
      body.opponentType,
      body.opponentName || null,
      body.gameMode,
      body.result,
      body.rounds,
      body.playerGlory ?? 0,
      body.opponentGlory ?? 0,
      xpEarned,
      body.duration ?? null,
    )
    .run()

  // Update player XP
  const player = await db
    .prepare('SELECT xp, level FROM players WHERE id = ?')
    .bind(session.playerId)
    .first<{ xp: number; level: number }>()

  if (!player) {
    throw createError({ statusCode: 404, statusMessage: 'Gracz nie istnieje.' })
  }

  const newXp = player.xp + xpEarned
  const newLevel = levelFromXp(newXp)
  const leveledUp = newLevel > player.level

  await db
    .prepare("UPDATE players SET xp = ?, level = ?, last_seen_at = datetime('now') WHERE id = ?")
    .bind(newXp, newLevel, session.playerId)
    .run()

  // Check for level rewards if leveled up
  const rewards: { level: number; type: string; id: string; name: string }[] = []
  if (leveledUp) {
    for (let l = player.level + 1; l <= newLevel; l++) {
      const reward = await db
        .prepare('SELECT * FROM level_rewards WHERE level = ?')
        .bind(l)
        .first<{ level: number; reward_type: string; reward_id: string; reward_name: string }>()
      if (reward) {
        rewards.push({
          level: reward.level,
          type: reward.reward_type,
          id: reward.reward_id,
          name: reward.reward_name,
        })
      }
    }
  }

  // Check achievements
  const newAchievements = await checkAchievements(db, session.playerId, body)

  const result: XPResult = {
    xpEarned,
    newXp,
    newLevel,
    leveledUp,
    rewards,
  }

  return {
    matchId,
    xp: result,
    achievements: newAchievements,
  }
})

// ===== Achievement checks =====

interface AchievementDef {
  id: string
  name: string
  check: (db: any, playerId: string, report: MatchReport) => Promise<boolean>
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_win',
    name: 'Pierwsze Zwycięstwo',
    check: async (_db, _pid, report) => report.result === 'win',
  },
  {
    id: 'win_streak_3',
    name: 'Trzy z rzędu',
    check: async (db, playerId) => {
      const recent = await db
        .prepare("SELECT result FROM matches WHERE player_id = ? ORDER BY played_at DESC LIMIT 3")
        .bind(playerId)
        .all<{ result: string }>()
      return (recent.results?.length === 3 && recent.results.every((r: { result: string }) => r.result === 'win')) ?? false
    },
  },
  {
    id: 'hard_ai_victory',
    name: 'Pogromca Bogów',
    check: async (_db, _pid, report) => report.result === 'win' && report.opponentType === 'ai_hard',
  },
  {
    id: 'multiplayer_debut',
    name: 'Debiut Online',
    check: async (_db, _pid, report) => report.opponentType === 'human',
  },
  {
    id: 'glory_hunter',
    name: 'Łowca Sławy',
    check: async (_db, _pid, report) => (report.playerGlory ?? 0) >= 10,
  },
]

async function checkAchievements(
  db: any,
  playerId: string,
  report: MatchReport,
): Promise<{ id: string; name: string }[]> {
  const unlocked: { id: string; name: string }[] = []

  for (const ach of ACHIEVEMENTS) {
    // Check if already unlocked
    const existing = await db
      .prepare('SELECT id FROM achievements WHERE id = ? AND player_id = ?')
      .bind(ach.id, playerId)
      .first()

    if (existing) continue

    const earned = await ach.check(db, playerId, report)
    if (earned) {
      await db
        .prepare('INSERT INTO achievements (id, player_id) VALUES (?, ?)')
        .bind(ach.id, playerId)
        .run()
      unlocked.push({ id: ach.id, name: ach.name })
    }
  }

  return unlocked
}
