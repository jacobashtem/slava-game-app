<script setup lang="ts">
definePageMeta({ ssr: false })
import { ref, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useSlavaApi, type LeaderboardEntry } from '../../composables/useSlavaApi'

const api = useSlavaApi()

const mode = ref<'wins' | 'glory' | 'level'>('wins')
const entries = ref<LeaderboardEntry[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const modes = [
  { value: 'wins' as const, label: 'Zwycięstwa', icon: 'game-icons:trophy' },
  { value: 'glory' as const, label: 'Sława', icon: 'game-icons:laurels' },
  { value: 'level' as const, label: 'Poziom', icon: 'game-icons:upgrade' },
]

async function loadLeaderboard() {
  loading.value = true
  error.value = null
  try {
    const data = await api.getLeaderboard(mode.value, 50)
    entries.value = data.entries
  } catch (e: any) {
    error.value = e.message || 'Nie udało się pobrać rankingu.'
  } finally {
    loading.value = false
  }
}

watch(mode, () => loadLeaderboard())
onMounted(() => loadLeaderboard())

function getRankIcon(rank: number) {
  if (rank === 1) return 'game-icons:crown'
  if (rank === 2) return 'game-icons:medal'
  if (rank === 3) return 'game-icons:medal'
  return ''
}

function getRankColor(rank: number) {
  if (rank === 1) return '#ffd700'
  if (rank === 2) return '#c0c0c0'
  if (rank === 3) return '#cd7f32'
  return 'var(--gold)'
}
</script>

<template>
  <div class="ranking-page">
    <!-- Back -->
    <NuxtLink to="/" class="back-link">
      <Icon icon="mdi:arrow-left" />
      <span>Powrót</span>
    </NuxtLink>

    <h1 class="page-title">
      <Icon icon="game-icons:laurel-crown" class="title-icon" />
      Ranking Wojowników
    </h1>

    <!-- Mode tabs -->
    <div class="mode-tabs">
      <button
        v-for="m in modes"
        :key="m.value"
        :class="['mode-tab', { active: mode === m.value }]"
        @click="mode = m.value"
      >
        <Icon :icon="m.icon" />
        {{ m.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading">
      <Icon icon="mdi:loading" class="spin" />
      Ładowanie rankingu...
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-msg">
      <Icon icon="mdi:alert" />
      {{ error }}
    </div>

    <!-- Empty -->
    <div v-else-if="entries.length === 0" class="empty-msg">
      Brak graczy w rankingu. Zagraj mecz, by się pojawić!
    </div>

    <!-- Leaderboard table -->
    <div v-else class="leaderboard">
      <div
        v-for="entry in entries"
        :key="entry.playerId"
        :class="['leaderboard-row', { 'is-me': entry.playerId === api.currentPlayer.value?.id }]"
      >
        <div class="rank-cell">
          <Icon v-if="getRankIcon(entry.rank)" :icon="getRankIcon(entry.rank)" :style="{ color: getRankColor(entry.rank), fontSize: '1.4em' }" />
          <span v-else class="rank-number">{{ entry.rank }}</span>
        </div>
        <div class="player-cell">
          <span class="player-name">{{ entry.displayName }}</span>
          <span class="player-level">Poz. {{ entry.level }}</span>
        </div>
        <div class="score-cell">
          <span class="score-value">{{ entry.score }}</span>
          <span class="score-label">{{ mode === 'wins' ? 'wygranych' : mode === 'glory' ? 'sławy' : 'XP' }}</span>
        </div>
        <div class="matches-cell">
          {{ entry.totalMatches }} meczy
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0a0a0f 0%, #1a1020 50%, #0d0d15 100%);
  color: #e8dcc8;
  padding: 2rem;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #c8a84e;
  text-decoration: none;
  font-size: 1rem;
  margin-bottom: 1.5rem;
  transition: color 0.2s;
}
.back-link:hover { color: #ffd700; }

.page-title {
  text-align: center;
  font-size: 2.2rem;
  color: #ffd700;
  margin-bottom: 2rem;
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
}
.title-icon { font-size: 1.8rem; }

.mode-tabs {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 2rem;
}
.mode-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.4rem;
  border: 1px solid #3a2a1a;
  border-radius: 8px;
  background: rgba(30, 20, 10, 0.6);
  color: #c8a84e;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}
.mode-tab:hover { background: rgba(50, 35, 15, 0.8); }
.mode-tab.active {
  background: rgba(200, 168, 78, 0.15);
  border-color: #c8a84e;
  color: #ffd700;
}

.loading, .error-msg, .empty-msg {
  text-align: center;
  padding: 3rem;
  font-size: 1.1rem;
  color: #8a7a5a;
}
.error-msg { color: #cc4444; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.leaderboard {
  max-width: 700px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.leaderboard-row {
  display: grid;
  grid-template-columns: 60px 1fr 120px 100px;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(20, 15, 10, 0.7);
  border: 1px solid #2a1f14;
  border-radius: 6px;
  transition: background 0.2s;
}
.leaderboard-row:hover { background: rgba(40, 30, 15, 0.7); }
.leaderboard-row.is-me {
  border-color: #c8a84e;
  background: rgba(200, 168, 78, 0.08);
}

.rank-cell {
  text-align: center;
  font-size: 1.1rem;
  font-weight: bold;
}
.rank-number { color: #8a7a5a; }

.player-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.player-name {
  font-weight: 600;
  color: #e8dcc8;
  font-size: 1rem;
}
.player-level {
  font-size: 0.8rem;
  color: #8a7a5a;
}

.score-cell {
  text-align: right;
  display: flex;
  flex-direction: column;
}
.score-value {
  font-size: 1.15rem;
  font-weight: bold;
  color: #ffd700;
}
.score-label {
  font-size: 0.7rem;
  color: #6a5a3a;
}

.matches-cell {
  text-align: right;
  font-size: 0.85rem;
  color: #6a5a3a;
}
</style>
