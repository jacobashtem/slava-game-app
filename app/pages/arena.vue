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
    <!-- SIDEBAR -->
    <div class="arena-sidebar">
      <!-- Header -->
      <div class="sidebar-header">
        <NuxtLink to="/" class="arena-back-btn">
          <Icon icon="game-icons:return-arrow" />
        </NuxtLink>
        <div class="sidebar-title">
          <Icon icon="game-icons:card-joker" class="title-icon" />
          <span>Arena testowa</span>
        </div>
      </div>

      <!-- Search + filters -->
      <div class="sidebar-filters">
        <div class="search-wrap">
          <Icon icon="mdi:magnify" class="search-icon" />
          <input
            v-model="searchQuery"
            class="sidebar-search"
            placeholder="Szukaj karty..."
          />
        </div>
        <div class="filter-tabs">
          <button :class="['ftab', { active: typeFilter === 'all' }]" @click="typeFilter = 'all'">
            Wszystkie <span class="ftab-count">{{ arena.catalog.length }}</span>
          </button>
          <button :class="['ftab', { active: typeFilter === 'creature' }]" @click="typeFilter = 'creature'">
            <Icon icon="game-icons:werewolf" /> Istoty
          </button>
          <button :class="['ftab', { active: typeFilter === 'adventure' }]" @click="typeFilter = 'adventure'">
            <Icon icon="game-icons:scroll-unfurled" /> Przygody
          </button>
        </div>
      </div>

      <!-- Prev/Next buttons -->
      <div class="nav-btns">
        <button class="nav-btn" @click="selectPrev" :disabled="!arena.focusedEntry">
          <Icon icon="mdi:chevron-up" /> Poprzednia
        </button>
        <button class="nav-btn" @click="selectNext">
          Następna <Icon icon="mdi:chevron-down" />
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
          <Icon icon="game-icons:card-random" class="no-icon" />
          <span>Brak wyników</span>
        </div>
      </div>
    </div>

    <!-- MAIN -->
    <div class="arena-main">
      <!-- Info bar -->
      <div v-if="arena.focusedEntry && arena.isReady" class="arena-info-bar">
        <div class="fi-left">
          <span class="fi-name">{{ arena.focusedEntry.name }}</span>
          <span class="fi-id">{{ arena.focusedEntry.effectId }}</span>
        </div>
        <span v-if="arena.currentHint" class="fi-hint">
          <Icon icon="game-icons:info" class="hint-icon" />
          {{ arena.currentHint }}
        </span>
        <button class="arena-reset-btn" @click="arena.reset()">
          <Icon icon="game-icons:cycle" /> Reset
        </button>
      </div>

      <!-- Board -->
      <div class="arena-board-container">
        <GameBoard v-if="arena.isReady" />
        <div v-else class="arena-placeholder">
          <div class="placeholder-content">
            <Icon icon="game-icons:card-random" class="placeholder-icon" />
            <h2>Arena testowa</h2>
            <p>Wybierz kartę z listy, aby rozpocząć test.</p>
            <p class="placeholder-hint">Kliknij dowolną kartę lub użyj przycisków nawigacji.</p>
            <div class="placeholder-keys">
              <span class="key-hint"><Icon icon="mdi:chevron-up" /> Poprzednia</span>
              <span class="key-hint"><Icon icon="mdi:chevron-down" /> Następna</span>
            </div>
          </div>
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
  background: #04030a;
}

/* ===== SIDEBAR ===== */
.arena-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(14, 10, 20, 0.97), rgba(8, 6, 14, 0.98));
  border-right: 1px solid rgba(200, 168, 78, 0.1);
  z-index: 10;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(200, 168, 78, 0.06);
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.03), transparent);
}

.arena-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: rgba(200, 168, 78, 0.4);
  text-decoration: none;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(200, 168, 78, 0.02);
  transition: all 0.15s;
  flex-shrink: 0;
}
.arena-back-btn:hover { color: rgba(200, 168, 78, 0.9); border-color: rgba(200, 168, 78, 0.25); }

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 600;
  color: rgba(200, 168, 78, 0.85);
  letter-spacing: 0.06em;
}

.title-icon { font-size: 18px; color: #c8a84e; }

/* ===== FILTERS ===== */
.sidebar-filters {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.search-wrap {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #475569;
  pointer-events: none;
}

.sidebar-search {
  width: 100%;
  padding: 7px 8px 7px 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
.sidebar-search:focus { border-color: rgba(200, 168, 78, 0.4); }
.sidebar-search::placeholder { color: #334155; }

.filter-tabs {
  display: flex;
  gap: 4px;
}

.ftab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.02);
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s;
  text-align: center;
}
.ftab.active { border-color: rgba(200, 168, 78, 0.3); color: #c8a84e; background: rgba(200, 168, 78, 0.06); }
.ftab:hover:not(.active) { background: rgba(255, 255, 255, 0.04); color: #64748b; }
.ftab-count { opacity: 0.5; font-weight: 400; }

/* ===== NAV BUTTONS ===== */
.nav-btns {
  display: flex;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.nav-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid rgba(200, 168, 78, 0.15);
  background: rgba(200, 168, 78, 0.04);
  color: #c8a84e;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.12s, opacity 0.12s;
}
.nav-btn:hover:not(:disabled) { background: rgba(200, 168, 78, 0.12); }
.nav-btn:disabled { opacity: 0.25; cursor: default; }

/* ===== CARD LIST ===== */
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
  padding: 6px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s, border-color 0.1s;
  min-height: 32px;
}
.card-item:hover { background: rgba(255, 255, 255, 0.03); }
.card-item.active {
  background: rgba(200, 168, 78, 0.08);
  border-left-color: #c8a84e;
}
.card-item.active .card-item-name { color: #e2e8f0; }

.card-num {
  font-size: 10px;
  font-family: monospace;
  color: #334155;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
}

.domain-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.adv-type-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}
.adv-type-dot.zdarzenie { background: #60a5fa; }
.adv-type-dot.artefakt { background: #fbbf24; }
.adv-type-dot.lokacja { background: #34d399; }

.card-item-name {
  font-size: 12px;
  color: #64748b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.1s;
}

.card-item-stats {
  font-size: 11px;
  font-family: monospace;
  color: #475569;
  flex-shrink: 0;
}

.card-item-type {
  font-size: 9px;
  color: #334155;
  flex-shrink: 0;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px 20px;
  color: #334155;
}
.no-icon { font-size: 28px; opacity: 0.3; }

/* ===== MAIN AREA ===== */
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
  padding: 6px 14px;
  background: rgba(10, 15, 30, 0.8);
  border-bottom: 1px solid rgba(200, 168, 78, 0.1);
  min-height: 36px;
  flex-shrink: 0;
}

.fi-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.fi-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
}
.fi-id {
  font-size: 10px;
  font-family: monospace;
  color: #34d399;
  background: rgba(52, 211, 153, 0.06);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.fi-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint-icon { font-size: 12px; color: #475569; flex-shrink: 0; }

.arena-reset-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(200, 168, 78, 0.06);
  border: 1px solid rgba(200, 168, 78, 0.2);
  color: #c8a84e;
  padding: 5px 12px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}
.arena-reset-btn:hover { background: rgba(200, 168, 78, 0.15); }

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
  align-items: center;
  justify-content: center;
  height: 100%;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #334155;
}

.placeholder-icon { font-size: 56px; opacity: 0.2; color: #c8a84e; }

.placeholder-content h2 {
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 500;
  color: #475569;
  margin: 0;
}

.placeholder-content p { font-size: 14px; margin: 0; color: #334155; }
.placeholder-hint { font-size: 12px !important; color: #1e293b !important; }

.placeholder-keys {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.key-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #1e293b;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.02);
}

/* Scrollbar styling */
.card-list::-webkit-scrollbar { width: 5px; }
.card-list::-webkit-scrollbar-track { background: transparent; }
.card-list::-webkit-scrollbar-thumb { background: rgba(200, 168, 78, 0.1); border-radius: 3px; }
.card-list::-webkit-scrollbar-thumb:hover { background: rgba(200, 168, 78, 0.25); }
</style>
