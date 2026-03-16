/**
 * useSlavaApi — client-side wrapper for Sława backend API.
 * Manages auth token, provides typed methods for all endpoints.
 */
import { ref, computed } from 'vue'

// Module-level singleton (shared across components)
const authToken = ref<string | null>(null)
const currentPlayer = ref<PlayerInfo | null>(null)
const isAuthenticated = computed(() => !!authToken.value && !!currentPlayer.value)

export interface PlayerInfo {
  id: string
  displayName: string
  icon: string
  level: number
  xp: number
}

export interface PlayerProfile {
  profile: {
    id: string
    displayName: string
    icon: string
    level: number
    xp: number
    xpForNextLevel: number
    xpProgress: number
    xpNeeded: number
    createdAt: string
  }
  stats: {
    totalMatches: number
    wins: number
    losses: number
    draws: number
    winRate: number
    totalGlory: number
    longestMatch: number
  }
  achievements: number
}

export interface MatchReportResult {
  matchId: string
  xp: {
    xpEarned: number
    newXp: number
    newLevel: number
    leveledUp: boolean
    rewards: { level: number; type: string; id: string; name: string }[]
  }
  achievements: { id: string; name: string }[]
}

export interface LeaderboardEntry {
  rank: number
  playerId: string
  displayName: string
  icon: string
  level: number
  score: number
  totalMatches: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt: string | null
}

const STORAGE_KEY = 'slava_auth_token'

// Restore token from localStorage on module load
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) authToken.value = stored
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  if (authToken.value) {
    headers['Authorization'] = `Bearer ${authToken.value}`
  }

  const res = await fetch(path, { ...options, headers })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ statusMessage: res.statusText }))
    throw new Error(errorBody.statusMessage || `API error ${res.status}`)
  }

  return res.json()
}

export function useSlavaApi() {
  // ===== AUTH =====

  async function login(displayName: string, icon?: string): Promise<PlayerInfo> {
    const data = await apiFetch<{ token: string; player: PlayerInfo }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ displayName, icon }),
    })

    authToken.value = data.token
    currentPlayer.value = data.player
    localStorage.setItem(STORAGE_KEY, data.token)
    return data.player
  }

  async function restoreSession(): Promise<PlayerInfo | null> {
    if (!authToken.value) return null

    try {
      const data = await apiFetch<{ player: PlayerInfo }>('/api/auth/session')
      currentPlayer.value = data.player
      return data.player
    } catch {
      // Session expired — clear token
      logout()
      return null
    }
  }

  function logout() {
    authToken.value = null
    currentPlayer.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  // ===== PROFILE =====

  async function getProfile(): Promise<PlayerProfile> {
    return apiFetch<PlayerProfile>('/api/player/profile')
  }

  // ===== MATCH REPORTING =====

  async function reportMatch(report: {
    opponentType: 'ai_easy' | 'ai_medium' | 'ai_hard' | 'human'
    opponentName?: string
    gameMode: 'gold' | 'slava'
    result: 'win' | 'loss' | 'draw' | 'surrender'
    rounds: number
    playerGlory?: number
    opponentGlory?: number
    duration?: number
  }): Promise<MatchReportResult> {
    const data = await apiFetch<MatchReportResult>('/api/player/stats', {
      method: 'POST',
      body: JSON.stringify(report),
    })

    // Update local player state after XP change
    if (currentPlayer.value) {
      currentPlayer.value = {
        ...currentPlayer.value,
        xp: data.xp.newXp,
        level: data.xp.newLevel,
      }
    }

    return data
  }

  // ===== RANKING =====

  async function getLeaderboard(
    mode: 'wins' | 'glory' | 'level' = 'wins',
    limit = 20,
    offset = 0,
  ): Promise<{ mode: string; entries: LeaderboardEntry[] }> {
    return apiFetch(`/api/ranking/leaderboard?mode=${mode}&limit=${limit}&offset=${offset}`)
  }

  // ===== ACHIEVEMENTS =====

  async function getAchievements(): Promise<{ achievements: Achievement[] }> {
    return apiFetch('/api/player/achievements')
  }

  return {
    // State
    authToken,
    currentPlayer,
    isAuthenticated,

    // Auth
    login,
    restoreSession,
    logout,

    // Profile
    getProfile,

    // Match
    reportMatch,

    // Ranking
    getLeaderboard,

    // Achievements
    getAchievements,
  }
}
