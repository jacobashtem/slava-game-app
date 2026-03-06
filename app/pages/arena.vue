<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useArenaStore, type ArenaCardEntry } from '../../stores/arenaStore'
import { useGameStore } from '../../stores/gameStore'

definePageMeta({ ssr: false })

const arena = useArenaStore()
const game = useGameStore()

// ===== WYSZUKIWARKA =====
const searchQuery = ref('')
const searchOpen = ref(false)

const filteredCards = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return arena.catalog.slice(0, 10)
  return arena.catalog
    .filter(c => c.name.toLowerCase().includes(q))
    .slice(0, 10)
})

function selectCard(entry: ArenaCardEntry) {
  arena.setupScenario(entry)
  searchQuery.value = entry.name
  searchOpen.value = false
}

function clearCard() {
  game.isArenaMode = false
  arena.isReady = false
  arena.focusedEntry = null
  searchQuery.value = ''
}
</script>

<template>
  <div class="arena-wrapper">
    <!-- Kompaktowy pasek areny nad planszą -->
    <div class="arena-bar">
      <NuxtLink to="/" class="arena-back-btn">
        <Icon icon="game-icons:exit-door" />
        Menu
      </NuxtLink>

      <div class="arena-bar-title">
        <Icon icon="game-icons:card-joker" />
        Arena
      </div>

      <!-- Wyszukiwarka karty -->
      <div class="arena-search" @focusout.capture="() => window.setTimeout(() => searchOpen = false, 150)">
        <Icon icon="game-icons:magnifying-glass" class="search-icon" />
        <input
          v-model="searchQuery"
          class="arena-search-input"
          placeholder="Wybierz kartę do testowania…"
          @focus="searchOpen = true"
          @input="searchOpen = true"
        />
        <button v-if="arena.focusedEntry" class="arena-clear-btn" @click="clearCard">✕</button>

        <Transition name="adropdown">
          <div v-if="searchOpen && filteredCards.length" class="arena-dropdown">
            <div
              v-for="entry in filteredCards"
              :key="`${entry.cardType}-${entry.id}`"
              class="adropdown-item"
              @mousedown.prevent="selectCard(entry)"
            >
              <span :class="['entry-badge', entry.cardType]">
                {{ entry.cardType === 'creature' ? 'Istota' : 'Przygoda' }}
              </span>
              <span class="entry-name">{{ entry.name }}</span>
              <span class="entry-effect">{{ entry.effectDescription.slice(0, 50) }}…</span>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Info o testowanej karcie -->
      <div v-if="arena.focusedEntry" class="focused-info">
        <span class="fi-name">{{ arena.focusedEntry.name }}</span>
        <span class="fi-id">{{ arena.focusedEntry.effectId }}</span>
      </div>

      <div class="arena-bar-right">
        <button v-if="arena.isReady" class="arena-reset-btn" @click="arena.reset()">
          <Icon icon="game-icons:cycle" />
          Reset
        </button>
      </div>
    </div>

    <!-- Plansza gry (pełna, identyczna jak w /game) -->
    <div class="arena-board-container">
      <GameBoard v-if="arena.isReady" />
      <div v-else class="arena-placeholder">
        <Icon icon="game-icons:card-random" class="placeholder-icon" />
        <p>Wybierz kartę z wyszukiwarki, aby rozpocząć test.</p>
        <p class="placeholder-sub">Dostaniesz preset scenariusz — testuj karty jak w prawdziwej grze.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arena-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-board, #0f172a);
}

/* ===== PASEK ARENY ===== */
.arena-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.6);
  border-bottom: 1px solid rgba(139, 92, 246, 0.35);
  flex-shrink: 0;
  min-height: 40px;
  z-index: 10;
  position: relative;
}

.arena-back-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.arena-back-btn:hover { color: #e2e8f0; border-color: rgba(255, 255, 255, 0.25); }

.arena-bar-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  color: #a78bfa;
  flex-shrink: 0;
}

/* Wyszukiwarka */
.arena-search {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 0 8px;
  gap: 6px;
  width: 280px;
  flex-shrink: 0;
}
.search-icon { color: #475569; font-size: 13px; flex-shrink: 0; }
.arena-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-size: 12px;
  padding: 5px 0;
}
.arena-search-input::placeholder { color: #475569; }
.arena-clear-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  padding: 2px;
}
.arena-clear-btn:hover { color: #e2e8f0; }

.arena-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 420px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  z-index: 200;
}
.adropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.1s;
}
.adropdown-item:hover { background: rgba(99, 102, 241, 0.12); }
.adropdown-item:last-child { border-bottom: none; }
.entry-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.entry-badge.creature { background: rgba(99, 102, 241, 0.2); color: #a78bfa; }
.entry-badge.adventure { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.entry-name { font-size: 12px; font-weight: 600; color: #e2e8f0; min-width: 110px; }
.entry-effect { font-size: 10px; color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.adropdown-enter-active, .adropdown-leave-active { transition: opacity 0.1s, transform 0.1s; }
.adropdown-enter-from, .adropdown-leave-to { opacity: 0; transform: translateY(-4px); }

/* Info o wybranej karcie */
.focused-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.fi-name {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  white-space: nowrap;
}
.fi-id {
  font-size: 10px;
  font-family: monospace;
  color: #34d399;
  background: rgba(52, 211, 153, 0.08);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arena-bar-right { flex-shrink: 0; margin-left: auto; }

.arena-reset-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #fbbf24;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.arena-reset-btn:hover { background: rgba(251, 191, 36, 0.22); }

/* ===== PLANSZA ===== */
.arena-board-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  /* Override GameBoard's 100vh to fill remaining space */
}
.arena-board-container :deep(.game-board) {
  height: 100%;
}

/* ===== PLACEHOLDER ===== */
.arena-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: #475569;
}
.placeholder-icon { font-size: 64px; opacity: 0.4; }
.arena-placeholder p { font-size: 15px; }
.placeholder-sub { font-size: 12px !important; color: #334155; }
</style>
