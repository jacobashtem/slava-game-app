/**
 * Drizzle ORM schema for Sława Vol.2 — D1 (SQLite).
 */
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ===== PLAYERS =====
export const players = sqliteTable('players', {
  id: text('id').primaryKey(), // UUID
  displayName: text('display_name').notNull(),
  icon: text('icon').default('sword'), // slavic icon id
  level: integer('level').default(1).notNull(),
  xp: integer('xp').default(0).notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  lastSeenAt: text('last_seen_at').default(sql`(datetime('now'))`).notNull(),
  // Steam integration (future)
  steamId: text('steam_id'),
})

// ===== MATCHES =====
export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(), // UUID
  playerId: text('player_id').notNull().references(() => players.id),
  opponentType: text('opponent_type').notNull(), // 'ai_easy' | 'ai_medium' | 'ai_hard' | 'human'
  opponentName: text('opponent_name'),
  gameMode: text('game_mode').notNull(), // 'gold' | 'slava'
  result: text('result').notNull(), // 'win' | 'loss' | 'draw' | 'surrender'
  rounds: integer('rounds').notNull(),
  playerGlory: integer('player_glory').default(0),
  opponentGlory: integer('opponent_glory').default(0),
  xpEarned: integer('xp_earned').default(0).notNull(),
  duration: integer('duration'), // seconds
  playedAt: text('played_at').default(sql`(datetime('now'))`).notNull(),
})

// ===== ACHIEVEMENTS =====
export const achievements = sqliteTable('achievements', {
  id: text('id').primaryKey(), // achievement key e.g. 'first_win'
  playerId: text('player_id').notNull().references(() => players.id),
  unlockedAt: text('unlocked_at').default(sql`(datetime('now'))`).notNull(),
})

// ===== SEASONS =====
export const seasons = sqliteTable('seasons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
})

// ===== SEASON RANKINGS =====
export const seasonRankings = sqliteTable('season_rankings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  seasonId: integer('season_id').notNull().references(() => seasons.id),
  playerId: text('player_id').notNull().references(() => players.id),
  wins: integer('wins').default(0).notNull(),
  losses: integer('losses').default(0).notNull(),
  gloryTotal: integer('glory_total').default(0).notNull(),
  rating: real('rating').default(1000).notNull(), // ELO-like
})

// ===== LEVEL REWARDS =====
export const levelRewards = sqliteTable('level_rewards', {
  level: integer('level').primaryKey(),
  rewardType: text('reward_type').notNull(), // 'title' | 'icon' | 'card_back'
  rewardId: text('reward_id').notNull(),
  rewardName: text('reward_name').notNull(),
})
