/**
 * GET /api/player/achievements
 * List all achievements for the current player.
 */
import { verifySession } from '../../utils/auth'

// Full achievement catalog with descriptions
const ACHIEVEMENT_CATALOG: Record<string, { name: string; description: string; icon: string }> = {
  first_win: {
    name: 'Pierwsze Zwycięstwo',
    description: 'Wygraj swoją pierwszą grę.',
    icon: 'mdi:trophy',
  },
  win_streak_3: {
    name: 'Trzy z rzędu',
    description: 'Wygraj 3 gry pod rząd.',
    icon: 'mdi:fire',
  },
  hard_ai_victory: {
    name: 'Pogromca Bogów',
    description: 'Pokonaj AI na najwyższym poziomie trudności.',
    icon: 'mdi:skull-crossbones',
  },
  multiplayer_debut: {
    name: 'Debiut Online',
    description: 'Zagraj pierwszy mecz multiplayer.',
    icon: 'mdi:account-group',
  },
  glory_hunter: {
    name: 'Łowca Sławy',
    description: 'Zdobądź 10 Punktów Sławy w jednym meczu.',
    icon: 'mdi:star-shooting',
  },
}

export default defineEventHandler(async (event) => {
  const session = await verifySession(event)
  const db = hubDatabase()

  const unlocked = await db
    .prepare('SELECT id, unlocked_at FROM achievements WHERE player_id = ?')
    .bind(session.playerId)
    .all<{ id: string; unlocked_at: string }>()

  const unlockedSet = new Set((unlocked.results ?? []).map(a => a.id))
  const unlockedMap = new Map((unlocked.results ?? []).map(a => [a.id, a.unlocked_at]))

  const achievements = Object.entries(ACHIEVEMENT_CATALOG).map(([id, meta]) => ({
    id,
    ...meta,
    unlocked: unlockedSet.has(id),
    unlockedAt: unlockedMap.get(id) ?? null,
  }))

  return { achievements }
})
