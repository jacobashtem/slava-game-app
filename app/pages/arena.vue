<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useArenaStore, type ArenaCardEntry } from '../../stores/arenaStore'
import { useGameStore } from '../../stores/gameStore'

definePageMeta({ ssr: false })

const arena = useArenaStore()
const game = useGameStore()

// ===== FILTR / SZUKAJ =====
const searchQuery = ref('')
const typeFilter = ref<'all' | 'creature' | 'adventure'>('all')

const filteredCards = computed(() => {
  let list = arena.catalog
  if (typeFilter.value !== 'all') {
    list = list.filter(c => c.cardType === typeFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.effectDescription.toLowerCase().includes(q) ||
      c.effectId.toLowerCase().includes(q)
    )
  }
  return list
})

// ===== NAWIGACJA =====
const listRef = ref<HTMLElement | null>(null)

function selectCard(entry: ArenaCardEntry) {
  arena.setupScenario(entry)
}

function selectNext() {
  if (!arena.focusedEntry) {
    if (filteredCards.value.length > 0) selectCard(filteredCards.value[0]!)
    return
  }
  const idx = filteredCards.value.findIndex(c => c.id === arena.focusedEntry!.id && c.cardType === arena.focusedEntry!.cardType)
  if (idx < filteredCards.value.length - 1) {
    selectCard(filteredCards.value[idx + 1]!)
    scrollToActive(idx + 1)
  }
}

function selectPrev() {
  if (!arena.focusedEntry) return
  const idx = filteredCards.value.findIndex(c => c.id === arena.focusedEntry!.id && c.cardType === arena.focusedEntry!.cardType)
  if (idx > 0) {
    selectCard(filteredCards.value[idx - 1]!)
    scrollToActive(idx - 1)
  }
}

function scrollToActive(idx: number) {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-idx="${idx}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// domain color helper
function getDomainColor(data: any): string {
  const colors: Record<number, string> = { 1: '#f5c542', 2: '#4caf50', 3: '#9c27b0', 4: '#c62828' }
  return colors[data.idDomain] ?? '#94a3b8'
}
</script>

<template>
  <div class="arena-wrapper">
    <!-- SIDEBAR: lista kart -->
    <div class="arena-sidebar">
      <div class="sidebar-header">
        <NuxtLink to="/" class="arena-back-btn">
          <Icon icon="game-icons:exit-door" /> Menu
        </NuxtLink>
        <div class="sidebar-title">
          <Icon icon="game-icons:card-joker" />
          Arena
        </div>
      </div>

      <!-- Search + filters -->
      <div class="sidebar-filters">
        <input
          v-model="searchQuery"
          class="sidebar-search"
          placeholder="Szukaj karty..."
        />
        <div class="filter-tabs">
          <button :class="['ftab', { active: typeFilter === 'all' }]" @click="typeFilter = 'all'">
            Wszystkie ({{ arena.catalog.length }})
          </button>
          <button :class="['ftab', { active: typeFilter === 'creature' }]" @click="typeFilter = 'creature'">
            Istoty
          </button>
          <button :class="['ftab', { active: typeFilter === 'adventure' }]" @click="typeFilter = 'adventure'">
            Przygody
          </button>
        </div>
      </div>

      <!-- Prev/Next buttons -->
      <div class="nav-btns">
        <button class="nav-btn" @click="selectPrev" :disabled="!arena.focusedEntry">
          <Icon icon="game-icons:arrow-dunk" style="transform: rotate(180deg)" /> Poprzednia
        </button>
        <button class="nav-btn" @click="selectNext">
          Nastepna <Icon icon="game-icons:arrow-dunk" />
        </button>
      </div>

      <!-- Scrollable card list -->
      <div class="card-list" ref="listRef">
        <div
          v-for="(entry, idx) in filteredCards"
          :key="`${entry.cardType}-${entry.id}`"
          :data-idx="idx"
          :class="['card-item', {
            active: arena.focusedEntry?.id === entry.id && arena.focusedEntry?.cardType === entry.cardType,
            creature: entry.cardType === 'creature',
            adventure: entry.cardType === 'adventure',
          }]"
          @click="selectCard(entry)"
        >
          <span class="card-num">{{ entry.cardType === 'creature' ? entry.id : `P${entry.id}` }}</span>
          <span
            v-if="entry.cardType === 'creature'"
            class="domain-dot"
            :style="`background: ${getDomainColor(entry.data)}`"
          />
          <span
            v-else
            class="adv-type-dot"
            :class="(entry.data as any).type?.toLowerCase()"
          />
          <span class="card-item-name">{{ entry.name }}</span>
          <span v-if="entry.cardType === 'creature'" class="card-item-stats">
            {{ (entry.data as any).stats?.attack }}/{{ (entry.data as any).stats?.defense }}
          </span>
          <span v-else class="card-item-type">{{ (entry.data as any).type }}</span>
        </div>

        <div v-if="filteredCards.length === 0" class="no-results">
          Brak wynikow
        </div>
      </div>
    </div>

    <!-- MAIN: plansza gry -->
    <div class="arena-main">
      <!-- Info bar gdy karta wybrana -->
      <div v-if="arena.focusedEntry && arena.isReady" class="arena-info-bar">
        <span class="fi-name">{{ arena.focusedEntry.name }}</span>
        <span class="fi-id">{{ arena.focusedEntry.effectId }}</span>
        <span v-if="arena.currentHint" class="fi-hint">
          <Icon icon="game-icons:info" class="hint-icon" />
          {{ arena.currentHint }}
        </span>
        <button class="arena-reset-btn" @click="arena.reset()">
          <Icon icon="game-icons:cycle" /> Reset
        </button>
      </div>

      <!-- Plansza gry -->
      <div class="arena-board-container">
        <GameBoard v-if="arena.isReady" />
        <div v-else class="arena-placeholder">
          <Icon icon="game-icons:card-random" class="placeholder-icon" />
          <p>Wybierz karte z listy po lewej, aby rozpoczac test.</p>
          <p class="placeholder-sub">Kliknij dowolna karte lub uzyj przyciskow Poprzednia/Nastepna.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arena-wrapper {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-board, #0f172a);
}

/* ===== SIDEBAR ===== */
.arena-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.4);
  border-right: 1px solid rgba(139, 92, 246, 0.25);
  z-index: 10;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.arena-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
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

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #a78bfa;
}

/* Filters */
.sidebar-filters {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.sidebar-search {
  width: 100%;
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
}
.sidebar-search:focus { border-color: #6366f1; }
.sidebar-search::placeholder { color: #475569; }

.filter-tabs {
  display: flex;
  gap: 3px;
}

.ftab {
  flex: 1;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.03);
  color: #64748b;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  text-align: center;
}
.ftab.active { border-color: #4f46e5; color: #a5b4fc; background: rgba(99, 102, 241, 0.1); }
.ftab:hover:not(.active) { background: rgba(255,255,255,0.05); }

/* Nav buttons */
.nav-btns {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.nav-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  background: rgba(139, 92, 246, 0.06);
  color: #a78bfa;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.nav-btn:hover:not(:disabled) { background: rgba(139, 92, 246, 0.15); }
.nav-btn:disabled { opacity: 0.3; cursor: default; }

/* Card list */
.card-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.card-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s, border-color 0.1s;
  min-height: 30px;
}
.card-item:hover { background: rgba(255,255,255,0.04); }
.card-item.active {
  background: rgba(99, 102, 241, 0.12);
  border-left-color: #6366f1;
}
.card-item.active .card-item-name { color: #e2e8f0; }

.card-num {
  font-size: 10px;
  font-family: monospace;
  color: #475569;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
}

.domain-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.adv-type-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  flex-shrink: 0;
}
.adv-type-dot.zdarzenie { background: #60a5fa; }
.adv-type-dot.artefakt { background: #fbbf24; }
.adv-type-dot.lokacja { background: #34d399; }

.card-item-name {
  font-size: 12px;
  color: #94a3b8;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-item-stats {
  font-size: 11px;
  font-family: monospace;
  color: #64748b;
  flex-shrink: 0;
}

.card-item-type {
  font-size: 9px;
  color: #475569;
  flex-shrink: 0;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #475569;
  font-size: 12px;
}

/* ===== MAIN ===== */
.arena-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Info bar */
.arena-info-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  background: rgba(0, 0, 0, 0.5);
  border-bottom: 1px solid rgba(139, 92, 246, 0.2);
  min-height: 34px;
  flex-shrink: 0;
}

.fi-name {
  font-size: 13px;
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
}
.fi-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
  font-style: italic;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint-icon { font-size: 12px; color: #60a5fa; flex-shrink: 0; }

.arena-reset-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #fbbf24;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}
.arena-reset-btn:hover { background: rgba(251, 191, 36, 0.22); }

/* Board container */
.arena-board-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.arena-board-container :deep(.game-board) {
  height: 100%;
}

/* Placeholder */
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
.arena-placeholder p { font-size: 15px; margin: 0; }
.placeholder-sub { font-size: 12px !important; color: #334155; }

/* Scrollbar styling */
.card-list::-webkit-scrollbar { width: 6px; }
.card-list::-webkit-scrollbar-track { background: transparent; }
.card-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
.card-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
</style>
