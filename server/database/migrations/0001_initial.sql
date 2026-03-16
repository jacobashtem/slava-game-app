-- Sława Vol.2 — initial D1 schema

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  icon TEXT DEFAULT 'sword',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  steam_id TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  opponent_type TEXT NOT NULL,
  opponent_name TEXT,
  game_mode TEXT NOT NULL,
  result TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  player_glory INTEGER DEFAULT 0,
  opponent_glory INTEGER DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  duration INTEGER,
  played_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS season_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  glory_total INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS level_rewards (
  level INTEGER PRIMARY KEY,
  reward_type TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  reward_name TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_player ON matches(player_id);
CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(played_at);
CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_season_rankings_season ON season_rankings(season_id);
CREATE INDEX IF NOT EXISTS idx_season_rankings_rating ON season_rankings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_steam ON players(steam_id);
