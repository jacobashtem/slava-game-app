/**
 * GET /api/player/profile
 * Return full player profile with stats summary.
 */
import { verifySession } from '../../utils/auth'
import { xpForLevel } from '../../utils/xp'

export default defineEventHandler(async (event) => {
  const session = await verifySession(event)
  const db = hubDatabase()

  const player = await db
    .prepare('SELECT * FROM players WHERE id = ?')
    .bind(session.playerId)
    .first<{
      id: string
      display_name: string
      icon: string
      level: number
      xp: number
      created_at: string
      last_seen_at: string
    }>()

  if (!player) {
    throw createError({ statusCode: 404, statusMessage: 'Gracz nie istnieje.' })
  }

  // Match stats
  const stats = await db
    .prepare(`
      SELECT
        COUNT(*) as total_matches,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as draws,
        SUM(player_glory) as total_glory,
        MAX(rounds) as longest_match
      FROM matches WHERE player_id = ?
    `)
    .bind(session.playerId)
    .first<{
      total_matches: number
      wins: number
      losses: number
      draws: number
      total_glory: number
      longest_match: number
    }>()

  // Achievement count
  const achievementCount = await db
    .prepare('SELECT COUNT(*) as count FROM achievements WHERE player_id = ?')
    .bind(session.playerId)
    .first<{ count: number }>()

  const xpForNextLevel = xpForLevel(player.level + 1)
  const xpForCurrentLevel = xpForLevel(player.level)

  return {
    profile: {
      id: player.id,
      displayName: player.display_name,
      icon: player.icon,
      level: player.level,
      xp: player.xp,
      xpForNextLevel,
      xpProgress: player.xp - xpForCurrentLevel,
      xpNeeded: xpForNextLevel - xpForCurrentLevel,
      createdAt: player.created_at,
    },
    stats: {
      totalMatches: stats?.total_matches ?? 0,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      draws: stats?.draws ?? 0,
      winRate: stats?.total_matches ? Math.round(((stats.wins ?? 0) / stats.total_matches) * 100) : 0,
      totalGlory: stats?.total_glory ?? 0,
      longestMatch: stats?.longest_match ?? 0,
    },
    achievements: achievementCount?.count ?? 0,
  }
})
