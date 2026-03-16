/**
 * GET /api/ranking/leaderboard
 * Query params: ?mode=wins|glory|level&limit=20&offset=0
 */

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const mode = (query.mode as string) || 'wins'
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = Number(query.offset) || 0

  const db = hubDatabase()

  let sql: string
  switch (mode) {
    case 'glory':
      sql = `
        SELECT
          p.id, p.display_name, p.icon, p.level,
          COALESCE(SUM(m.player_glory), 0) as score,
          COUNT(m.id) as total_matches
        FROM players p
        LEFT JOIN matches m ON m.player_id = p.id
        GROUP BY p.id
        ORDER BY score DESC
        LIMIT ? OFFSET ?
      `
      break
    case 'level':
      sql = `
        SELECT
          p.id, p.display_name, p.icon, p.level,
          p.xp as score,
          (SELECT COUNT(*) FROM matches WHERE player_id = p.id) as total_matches
        FROM players p
        ORDER BY p.level DESC, p.xp DESC
        LIMIT ? OFFSET ?
      `
      break
    case 'wins':
    default:
      sql = `
        SELECT
          p.id, p.display_name, p.icon, p.level,
          COALESCE(SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END), 0) as score,
          COUNT(m.id) as total_matches
        FROM players p
        LEFT JOIN matches m ON m.player_id = p.id
        GROUP BY p.id
        ORDER BY score DESC
        LIMIT ? OFFSET ?
      `
      break
  }

  const result = await db.prepare(sql).bind(limit, offset).all<{
    id: string
    display_name: string
    icon: string
    level: number
    score: number
    total_matches: number
  }>()

  return {
    mode,
    entries: (result.results ?? []).map((row, i) => ({
      rank: offset + i + 1,
      playerId: row.id,
      displayName: row.display_name,
      icon: row.icon,
      level: row.level,
      score: row.score,
      totalMatches: row.total_matches,
    })),
  }
})
