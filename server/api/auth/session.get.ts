/**
 * GET /api/auth/session
 * Verify current session, return player data.
 */
import { verifySession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const session = await verifySession(event)

  const db = hubDatabase()
  const player = await db
    .prepare('SELECT id, display_name, icon, level, xp FROM players WHERE id = ?')
    .bind(session.playerId)
    .first<{ id: string; display_name: string; icon: string; level: number; xp: number }>()

  if (!player) {
    throw createError({ statusCode: 404, statusMessage: 'Gracz nie istnieje.' })
  }

  return {
    player: {
      id: player.id,
      displayName: player.display_name,
      icon: player.icon,
      level: player.level,
      xp: player.xp,
    },
  }
})
