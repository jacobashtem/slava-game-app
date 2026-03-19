<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import istotypData from '../../../data/Slava_Vol2_Istoty.json'

definePageMeta({ ssr: false })

const creatures = istotypData as any[]
const domainFilter = ref<number | null>(null)
const searchQuery = ref('')

// Glob import creature images (Vite build-time)
const _imgModules = import.meta.glob(
  '../../../assets/cards/creature/*.webp',
  { eager: true, import: 'default' },
) as Record<string, string>

const creatureImgs = Object.fromEntries(
  Object.entries(_imgModules)
    .map(([key, val]) => {
      const m = key.match(/(\d+)\.webp$/)
      return m ? [parseInt(m[1]!), val] : null
    })
    .filter(Boolean) as [number, string][],
) as Record<number, string>

const DOMAIN_INFO: Record<number, { name: string; color: string; icon: string; rune: string }> = {
  1: { name: 'Perun', color: '#d4a843', icon: 'game-icons:lightning-storm', rune: 'ᛈ' },
  2: { name: 'Żywi', color: '#4a9e4a', icon: 'game-icons:oak-leaf', rune: 'ᛉ' },
  3: { name: 'Nieumarli', color: '#9c6fbf', icon: 'game-icons:skull-crossed-bones', rune: 'ᚾ' },
  4: { name: 'Weles', color: '#c44040', icon: 'game-icons:fire-dash', rune: 'ᚹ' },
}

const filteredCreatures = computed(() => {
  let list = [...creatures]
  if (domainFilter.value !== null) list = list.filter(c => c.idDomain === domainFilter.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.lore ?? '').toLowerCase().includes(q) ||
      (c.effectDescription ?? '').toLowerCase().includes(q),
    )
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
})

const domainCounts = computed(() => {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const c of creatures) counts[c.idDomain as number] = (counts[c.idDomain as number] ?? 0) + 1
  return counts
})
</script>

<template>
  <div class="bst-page">
    <div class="bst-bg-noise" />
    <div class="bst-bg-vignette" />

    <!-- HEADER -->
    <header class="bst-header">
      <NuxtLink to="/" class="bst-back">
        <Icon icon="game-icons:return-arrow" /> Powrót
      </NuxtLink>

      <div class="bst-title-group">
        <div class="bst-rune-row">ᛒ ᛖ ᛊ ᛏ ᛁ ᚨ ᚱ ᛁ ᚢ ᛊ ᛉ</div>
        <h1 class="bst-title">Bestiariusz</h1>
        <p class="bst-subtitle">Kodeks istot świata Sławy — {{ creatures.length }} bestii</p>
      </div>

      <div class="bst-ornament">
        <span class="bst-orn-line" />
        <Icon icon="game-icons:wolf-head" class="bst-orn-icon" />
        <span class="bst-orn-line" />
      </div>
    </header>

    <!-- FILTERS -->
    <nav class="bst-filters">
      <div class="bst-search-wrap">
        <Icon icon="game-icons:magnifying-glass" class="bst-search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="bst-search"
          placeholder="Szukaj istoty..."
        />
      </div>

      <div class="bst-domain-pills">
        <button
          :class="['bst-pill', { active: domainFilter === null }]"
          @click="domainFilter = null"
        >
          Wszystkie
          <span class="bst-pill-count">{{ creatures.length }}</span>
        </button>
        <button
          v-for="(info, id) in DOMAIN_INFO"
          :key="id"
          :class="['bst-pill', { active: domainFilter === Number(id) }]"
          :style="{ '--pill-color': info.color }"
          @click="domainFilter = domainFilter === Number(id) ? null : Number(id)"
        >
          <span class="bst-pill-rune">{{ info.rune }}</span>
          {{ info.name }}
          <span class="bst-pill-count">{{ domainCounts[Number(id)] }}</span>
        </button>
      </div>
    </nav>

    <!-- GRID -->
    <main class="bst-grid-wrap">
      <TransitionGroup name="bst-card" tag="div" class="bst-grid">
        <NuxtLink
          v-for="creature in filteredCreatures"
          :key="creature.id"
          :to="`/bestiary/${creature.id}`"
          class="bst-entry"
          :style="{ '--domain-color': DOMAIN_INFO[creature.idDomain]?.color }"
        >
          <div class="bst-entry-img-wrap">
            <img
              v-if="creatureImgs[creature.id]"
              :src="creatureImgs[creature.id]"
              :alt="creature.name"
              class="bst-entry-img"
              loading="lazy"
            />
            <div v-else class="bst-entry-placeholder">
              <Icon icon="game-icons:creature-mask" />
            </div>
            <div class="bst-entry-img-fade" />
          </div>

          <div class="bst-entry-info">
            <span class="bst-entry-domain-mark" />
            <h3 class="bst-entry-name">{{ creature.name }}</h3>
            <div class="bst-entry-stats">
              <span class="bst-stat-atk">{{ creature.stats.attack }}</span>
              <span class="bst-stat-sep">/</span>
              <span class="bst-stat-def">{{ creature.stats.defense }}</span>
            </div>
          </div>

          <div v-if="creature.combat.isFlying" class="bst-entry-flying">
            <Icon icon="game-icons:feathered-wing" />
          </div>
        </NuxtLink>
      </TransitionGroup>

      <div v-if="filteredCreatures.length === 0" class="bst-empty">
        <Icon icon="game-icons:dead-eye" class="bst-empty-icon" />
        <p>Nie znaleziono istot.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.bst-page {
  min-height: 100vh;
  background: #04030a;
  color: #e2e8f0;
  position: relative;
  overflow-x: hidden;
}

.bst-bg-noise {
  position: fixed;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 256px;
  pointer-events: none;
  z-index: 0;
}

.bst-bg-vignette {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.7) 100%);
  pointer-events: none;
  z-index: 0;
}

/* HEADER */
.bst-header {
  position: relative;
  z-index: 1;
  padding: 40px 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.bst-back {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(148, 130, 100, 0.4);
  font-size: 13px;
  text-decoration: none;
  transition: color 0.2s;
}
.bst-back:hover { color: rgba(200, 168, 78, 0.8); }

.bst-rune-row {
  font-size: 12px;
  letter-spacing: 0.5em;
  color: rgba(200, 168, 78, 0.2);
  margin-bottom: 6px;
  animation: bst-rune-glow 4s ease-in-out infinite;
}

@keyframes bst-rune-glow {
  0%, 100% { color: rgba(200, 168, 78, 0.15); }
  50% { color: rgba(200, 168, 78, 0.35); }
}

.bst-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 56px;
  font-weight: 400;
  letter-spacing: 0.18em;
  color: #c8a84e;
  text-shadow: 0 0 50px rgba(200, 168, 78, 0.2), 0 2px 8px rgba(0, 0, 0, 0.8);
  margin: 0;
  text-transform: uppercase;
}

.bst-subtitle {
  font-size: 15px;
  color: rgba(148, 130, 100, 0.4);
  font-style: italic;
  font-family: Georgia, serif;
  margin: 4px 0 0;
}

.bst-ornament {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  width: min(440px, 80vw);
}

.bst-orn-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.2), transparent);
}

.bst-orn-icon {
  font-size: 20px;
  color: rgba(200, 168, 78, 0.25);
}

/* FILTERS */
.bst-filters {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 24px;
}

.bst-search-wrap {
  position: relative;
  width: min(420px, 90vw);
}

.bst-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 15px;
  color: rgba(148, 130, 100, 0.3);
}

.bst-search {
  width: 100%;
  padding: 12px 16px 12px 40px;
  border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(200, 168, 78, 0.03);
  color: #e2e8f0;
  font-size: 14px;
  font-family: Georgia, serif;
  outline: none;
  transition: border-color 0.2s;
}
.bst-search::placeholder { color: rgba(148, 130, 100, 0.3); }
.bst-search:focus { border-color: rgba(200, 168, 78, 0.3); }

.bst-domain-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.bst-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 20px;
  border: 1px solid rgba(148, 130, 100, 0.1);
  background: rgba(148, 130, 100, 0.04);
  color: rgba(148, 130, 100, 0.5);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.bst-pill:hover {
  border-color: rgba(200, 168, 78, 0.2);
  color: rgba(200, 168, 78, 0.7);
}
.bst-pill.active {
  border-color: var(--pill-color, rgba(200, 168, 78, 0.4));
  background: color-mix(in srgb, var(--pill-color, #c8a84e) 8%, transparent);
  color: var(--pill-color, #c8a84e);
}

.bst-pill-rune { font-size: 15px; opacity: 0.6; }
.bst-pill-count { font-size: 10px; opacity: 0.5; margin-left: 2px; }

/* GRID */
.bst-grid-wrap {
  position: relative;
  z-index: 1;
  padding: 0 24px 80px;
  max-width: 1280px;
  margin: 0 auto;
}

.bst-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 18px;
}

/* ENTRY CARD */
.bst-entry {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 3 / 4;
  background: #08060c;
  border: 1px solid rgba(200, 168, 78, 0.06);
  transition: transform 0.3s ease, border-color 0.3s, box-shadow 0.3s;
  text-decoration: none;
  color: inherit;
}

.bst-entry:hover {
  transform: translateY(-6px) scale(1.02);
  border-color: var(--domain-color, rgba(200, 168, 78, 0.2));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 24px color-mix(in srgb, var(--domain-color, #c8a84e) 12%, transparent);
}

.bst-entry-img-wrap {
  position: absolute;
  inset: 0;
}

.bst-entry-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.7;
  transition: opacity 0.3s, transform 0.6s ease;
}

.bst-entry:hover .bst-entry-img {
  opacity: 0.85;
  transform: scale(1.06);
}

.bst-entry-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52px;
  color: rgba(148, 130, 100, 0.06);
  background: linear-gradient(145deg, #08060c 0%, #0c0a10 100%);
}

.bst-entry-img-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 65%;
  background: linear-gradient(to top, #08060c 0%, rgba(8, 6, 12, 0.85) 35%, transparent 100%);
  pointer-events: none;
}

.bst-entry-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px;
  z-index: 1;
}

.bst-entry-domain-mark {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--domain-color);
  border-radius: 1px;
  margin-bottom: 8px;
  box-shadow: 0 0 10px var(--domain-color);
  opacity: 0.7;
}

.bst-entry-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 500;
  color: #ddd6c1;
  margin: 0;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  letter-spacing: 0.04em;
}

.bst-entry-stats {
  display: flex;
  gap: 2px;
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
}

.bst-stat-atk { color: #fb923c; }
.bst-stat-def { color: #60a5fa; }
.bst-stat-sep { color: rgba(148, 130, 100, 0.3); }

.bst-entry-flying {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 16px;
  color: rgba(200, 200, 220, 0.25);
  z-index: 1;
}

/* TRANSITIONS */
.bst-card-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.bst-card-leave-active { transition: opacity 0.2s ease; }
.bst-card-enter-from { opacity: 0; transform: translateY(12px); }
.bst-card-leave-to { opacity: 0; }
.bst-card-move { transition: transform 0.3s ease; }

/* EMPTY */
.bst-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 20px;
  color: rgba(148, 130, 100, 0.3);
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 15px;
}

.bst-empty-icon { font-size: 40px; opacity: 0.3; }

/* RESPONSIVE */
@media (max-width: 600px) {
  .bst-title { font-size: 36px; letter-spacing: 0.1em; }
  .bst-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .bst-entry-name { font-size: 15px; }
  .bst-rune-row { display: none; }
}
</style>
