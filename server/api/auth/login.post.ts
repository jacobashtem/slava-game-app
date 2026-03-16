/**
 * POST /api/auth/login
 * Phase 1: Simple login — display name → auto-create player, return session token.
 * Phase 2 (Steam): Replace with Steam ticket verification.
 */
import { eq } from 'drizzle-orm'
import { players } from '../../database/schema'
import { createSession, generatePlayerId } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ displayName: string; icon?: string }>(event)

  if (!body.displayName || body.displayName.trim().length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Nazwa musi mieć min. 2 znaki.' })
  }

  const displayName = body.displayName.trim().slice(0, 24)
  const icon = body.icon || 'sword'

  const db = hubDatabase()

  // Check if player with this display name exists (simple matching for Phase 1)
  const existing = await db
    .prepare('SELECT id, display_name, icon, level, xp FROM players WHERE display_name = ?')
    .bind(displayName)
    .first<{ id: string; display_name: string; icon: string; level: number; xp: number }>()

  let playerId: string

  if (existing) {
    playerId = existing.id
    // Update last seen
    await db
      .prepare("UPDATE players SET last_seen_at = datetime('now'), icon = ? WHERE id = ?")
      .bind(icon, playerId)
      .run()
  } else {
    // Create new player
    playerId = generatePlayerId()
    await db
      .prepare('INSERT INTO players (id, display_name, icon) VALUES (?, ?, ?)')
      .bind(playerId, displayName, icon)
      .run()
  }

  const token = await createSession(event, playerId, displayName)

  return {
    token,
    player: {
      id: playerId,
      displayName,
      icon,
      level: existing?.level ?? 1,
      xp: existing?.xp ?? 0,
    },
  }
})
