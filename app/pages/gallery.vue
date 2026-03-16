<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import istotypData from '../../data/Slava_Vol2_Istoty.json'
import przygodyData from '../../data/Slava_Vol2_KartyPrzygody.json'

definePageMeta({ ssr: false })

const creatures = istotypData as any[]
const adventures = przygodyData as any[]

type Tab = 'creatures' | 'adventures'
const activeTab = ref<Tab>('creatures')
const searchQuery = ref('')
const domainFilter = ref<number | null>(null)
const typeFilter = ref<string | null>(null)

const DOMAIN_INFO: Record<number, { name: string; color: string; icon: string; rune: string }> = {
  1: { name: 'Perun', color: '#d4a843', icon: 'game-icons:lightning-storm', rune: 'ᛈ' },
  2: { name: 'Żywi', color: '#4a9e4a', icon: 'game-icons:oak-leaf', rune: 'ᛉ' },
  3: { name: 'Nieumarli', color: '#9c6fbf', icon: 'game-icons:skull-crossed-bones', rune: 'ᚾ' },
  4: { name: 'Weles', color: '#c44040', icon: 'game-icons:fire-dash', rune: 'ᚹ' },
}

const ATK_TYPE_LABELS: Record<number, { label: string; icon: string }> = {
  0: { label: 'Wręcz', icon: 'game-icons:broadsword' },
  1: { label: 'Żywioł', icon: 'game-icons:fire-ring' },
  2: { label: 'Magia', icon: 'game-icons:magic-swirl' },
  3: { label: 'Dystans', icon: 'game-icons:bow-arrow' },
}

const filteredCreatures = computed(() => {
  let list = creatures
  if (domainFilter.value !== null) list = list.filter(c => c.idDomain === domainFilter.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.effectDescription ?? '').toLowerCase().includes(q) ||
      (c.effectId ?? '').toLowerCase().includes(q)
    )
  }
  return list
})

const filteredAdventures = computed(() => {
  let list = adventures
  if (typeFilter.value !== null) list = list.filter(a => a.type === typeFilter.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.effectDescription ?? '').toLowerCase().includes(q) ||
      (a.effectId ?? '').toLowerCase().includes(q)
    )
  }
  return list
})

const displayList = computed(() =>
  activeTab.value === 'creatures' ? filteredCreatures.value : filteredAdventures.value
)

const expandedId = ref<number | null>(null)
function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

function getDomainColor(domainId: number): string {
  return DOMAIN_INFO[domainId]?.color ?? '#94a3b8'
}

// Embers
const embers = ref<{ x: number; delay: number; dur: number; size: number }[]>([])
onMounted(() => {
  embers.value = Array.from({ length: 12 }, () => ({
    x: Math.random() * 100,
    delay: Math.random() * 10,
    dur: 8 + Math.random() * 8,
    size: 1.5 + Math.random() * 2,
  }))
})
</script>

<template>
  <div class="gal-page">
    <!-- Background -->
    <div class="gal-bg">
      <div class="gal-fog gal-fog-1" />
      <div class="gal-fog gal-fog-2" />
      <div class="gal-vignette" />
      <div
        v-for="(e, i) in embers" :key="i"
        class="gal-ember"
        :style="{ left: e.x + '%', animationDelay: e.delay + 's', animationDuration: e.dur + 's', '--sz': e.size + 'px' }"
      />
    </div>

    <!-- Content -->
    <div class="gal-scroll">
      <div class="gal-content">
        <!-- Header -->
        <div class="gal-header">
          <NuxtLink to="/" class="gal-back">
            <Icon icon="mdi:arrow-left" /> Powrót
          </NuxtLink>

          <div class="gal-title-block">
            <svg viewBox="0 0 120 8" class="gal-orn"><path d="M0 4 Q15 0 30 4 Q45 8 60 4 Q75 0 90 4 Q105 8 120 4" fill="none" stroke="rgba(200,168,78,0.2)" stroke-width="1"/></svg>
            <div class="gal-emblem">
              <Icon icon="game-icons:card-pickup" class="gal-emblem-icon" />
            </div>
            <h1 class="gal-title">Kronika Kart</h1>
            <p class="gal-subtitle">
              {{ activeTab === 'creatures'
                ? `${filteredCreatures.length} z ${creatures.length} istot`
                : `${filteredAdventures.length} z ${adventures.length} przygód` }}
            </p>
            <svg viewBox="0 0 120 8" class="gal-orn"><path d="M0 4 Q15 8 30 4 Q45 0 60 4 Q75 8 90 4 Q105 0 120 4" fill="none" stroke="rgba(200,168,78,0.2)" stroke-width="1"/></svg>
          </div>
        </div>

        <!-- Tabs -->
        <div class="gal-tabs">
          <button :class="['gal-tab', { active: activeTab === 'creatures' }]" @click="activeTab = 'creatures'; typeFilter = null">
            <Icon icon="game-icons:dragon-head" />
            <span>Istoty</span>
            <span class="gal-tab-count">{{ creatures.length }}</span>
          </button>
          <button :class="['gal-tab', { active: activeTab === 'adventures' }]" @click="activeTab = 'adventures'; domainFilter = null">
            <Icon icon="game-icons:spell-book" />
            <span>Przygody</span>
            <span class="gal-tab-count">{{ adventures.length }}</span>
          </button>
        </div>

        <!-- Search + Filters -->
        <div class="gal-filters">
          <div class="gal-search-wrap">
            <Icon icon="game-icons:magnifying-glass" class="gal-search-icon" />
            <input
              v-model="searchQuery"
              type="text"
              class="gal-search"
              placeholder="Szukaj po nazwie, efekcie…"
            />
          </div>

          <!-- Domain pills -->
          <div v-if="activeTab === 'creatures'" class="gal-pills">
            <button :class="['gal-pill', { active: domainFilter === null }]" @click="domainFilter = null">
              <span class="gal-pill-rune">✦</span> Wszystkie
            </button>
            <button
              v-for="(info, id) in DOMAIN_INFO" :key="id"
              :class="['gal-pill', { active: domainFilter === Number(id) }]"
              :style="{ '--pill-color': info.color }"
              @click="domainFilter = Number(id)"
            >
              <span class="gal-pill-rune">{{ info.rune }}</span>
              <Icon :icon="info.icon" class="gal-pill-icon" />
              {{ info.name }}
            </button>
          </div>

          <!-- Adventure type pills -->
          <div v-if="activeTab === 'adventures'" class="gal-pills">
            <button :class="['gal-pill', { active: typeFilter === null }]" @click="typeFilter = null">Wszystkie</button>
            <button :class="['gal-pill', { active: typeFilter === 'Zdarzenie' }]" style="--pill-color:#60a5fa" @click="typeFilter = 'Zdarzenie'">
              <Icon icon="game-icons:lightning-helix" class="gal-pill-icon" /> Zdarzenia
            </button>
            <button :class="['gal-pill', { active: typeFilter === 'Artefakt' }]" style="--pill-color:#fbbf24" @click="typeFilter = 'Artefakt'">
              <Icon icon="game-icons:gem-pendant" class="gal-pill-icon" /> Artefakty
            </button>
            <button :class="['gal-pill', { active: typeFilter === 'Lokacja' }]" style="--pill-color:#34d399" @click="typeFilter = 'Lokacja'">
              <Icon icon="game-icons:forest" class="gal-pill-icon" /> Lokacje
            </button>
          </div>
        </div>

        <!-- Card List -->
        <div class="gal-list">
          <template v-if="activeTab === 'creatures'">
            <div
              v-for="card in filteredCreatures" :key="card.id"
              :class="['gal-card', { expanded: expandedId === card.id }]"
              :style="{ '--dc': getDomainColor(card.idDomain) }"
              @click="toggleExpand(card.id)"
            >
              <div class="gc-row">
                <span class="gc-domain-mark" :style="{ background: getDomainColor(card.idDomain) }" />
                <span class="gc-name">{{ card.name }}</span>
                <span class="gc-stats">
                  <span class="gc-atk">{{ card.stats.attack }}</span>
                  <span class="gc-sep">⁄</span>
                  <span class="gc-def">{{ card.stats.defense }}</span>
                </span>
                <span class="gc-type-badge">
                  <Icon :icon="ATK_TYPE_LABELS[card.combat?.attackType ?? 0]?.icon ?? ''" />
                  {{ ATK_TYPE_LABELS[card.combat?.attackType ?? 0]?.label }}
                </span>
                <Icon v-if="card.combat?.isFlying" icon="game-icons:liberty-wing" class="gc-fly" title="Latający" />
              </div>

              <Transition name="details-slide">
                <div v-if="expandedId === card.id" class="gc-details">
                  <div class="gc-detail">
                    <span class="gc-dl">Domena</span>
                    <span :style="{ color: getDomainColor(card.idDomain) }">{{ card.domain }}</span>
                  </div>
                  <div v-if="card.abilities?.length" class="gc-detail">
                    <span class="gc-dl">Zdolności</span>
                    <div v-for="(ab, i) in card.abilities" :key="i" class="gc-ability">
                      <span class="gc-trigger">{{ ab.trigger }}</span>
                      <span v-if="ab.cost" class="gc-cost">{{ ab.cost }} PS</span>
                      <span class="gc-ab-text">{{ ab.text }}</span>
                    </div>
                  </div>
                  <div v-if="card.effectDescription" class="gc-detail">
                    <span class="gc-dl">Efekt</span>
                    <span class="gc-effect">{{ card.effectDescription }}</span>
                  </div>
                  <div v-if="card.lore" class="gc-detail gc-lore-section">
                    <span class="gc-dl">Legenda</span>
                    <span class="gc-lore">{{ card.lore }}</span>
                  </div>
                </div>
              </Transition>
            </div>
          </template>

          <template v-else>
            <div
              v-for="card in filteredAdventures" :key="card.id"
              :class="['gal-card gal-card-adv', { expanded: expandedId === card.id + 1000 }]"
              @click="toggleExpand(card.id + 1000)"
            >
              <div class="gc-row">
                <span :class="['gc-adv-badge', card.type?.toLowerCase()]">{{ card.type }}</span>
                <span class="gc-name">{{ card.name }}</span>
                <span v-if="card.persistence" class="gc-persist">{{ card.persistence }}</span>
              </div>

              <Transition name="details-slide">
                <div v-if="expandedId === card.id + 1000" class="gc-details">
                  <div v-if="card.effect" class="gc-detail">
                    <span class="gc-dl">Efekt</span>
                    <span class="gc-effect">{{ card.effect }}</span>
                  </div>
                  <div v-if="card.enhancedEffect" class="gc-detail">
                    <span class="gc-dl gc-dl-enh">Wzmocniony (1 PS)</span>
                    <span class="gc-effect gc-enh">{{ card.enhancedEffect }}</span>
                  </div>
                  <div v-if="card.abilities?.length" class="gc-detail">
                    <span class="gc-dl">Zdolności</span>
                    <div v-for="(ab, i) in card.abilities" :key="i" class="gc-ability">
                      <span :class="['gc-trigger', { 'gc-trigger-enh': ab.enhanced }]">{{ ab.enhanced ? 'WZMOCNIONY' : ab.trigger }}</span>
                      <span class="gc-ab-text">{{ ab.text }}</span>
                    </div>
                  </div>
                  <div v-if="card.lore" class="gc-detail gc-lore-section">
                    <span class="gc-dl">Legenda</span>
                    <span class="gc-lore">{{ card.lore }}</span>
                  </div>
                </div>
              </Transition>
            </div>
          </template>

          <div v-if="displayList.length === 0" class="gal-empty">
            <Icon icon="game-icons:scroll-unfurled" class="gal-empty-icon" />
            <span>Brak wyników dla „{{ searchQuery }}"</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gal-page {
  position: relative;
  min-height: 100vh;
  background: #04030a;
  color: #e2e8f0;
  overflow: hidden;
}

/* ===== BACKGROUND ===== */
.gal-bg { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.gal-fog { position: absolute; border-radius: 50%; animation: gal-fog 12s ease-in-out infinite; }
.gal-fog-1 { width: 100%; height: 40%; bottom: -10%; left: 0; background: radial-gradient(ellipse, rgba(140, 50, 10, 0.07) 0%, transparent 55%); }
.gal-fog-2 { width: 60%; height: 60%; top: -15%; right: -5%; background: radial-gradient(ellipse, rgba(60, 20, 80, 0.05) 0%, transparent 50%); animation-delay: -6s; }
@keyframes gal-fog { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }
.gal-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.6) 100%); }
.gal-ember {
  position: absolute; bottom: -6px;
  width: var(--sz, 2px); height: var(--sz, 2px);
  border-radius: 50%; background: rgba(200, 100, 30, 0.5);
  animation: gal-rise linear infinite; will-change: transform, opacity;
}
@keyframes gal-rise {
  0% { transform: translateY(0); opacity: 0; }
  8% { opacity: 0.7; }
  50% { transform: translateY(-50vh) translateX(6px); opacity: 0.3; }
  100% { transform: translateY(-105vh) translateX(-4px); opacity: 0; }
}

/* ===== SCROLL ===== */
.gal-scroll {
  position: relative; z-index: 1;
  width: 100%; min-height: 100vh;
  overflow-y: auto;
  display: flex; justify-content: center;
  scrollbar-width: thin; scrollbar-color: rgba(200,168,78,0.1) transparent;
}

.gal-content {
  display: flex; flex-direction: column; align-items: center;
  gap: 16px; padding: 24px 16px 50px; max-width: 680px; width: 100%;
}

/* ===== HEADER ===== */
.gal-header {
  width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}

.gal-back {
  align-self: flex-start;
  display: flex; align-items: center; gap: 4px;
  color: rgba(200, 168, 78, 0.5); text-decoration: none;
  font-size: 12px; padding: 5px 12px; border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(4, 3, 10, 0.6); transition: all 0.15s;
}
.gal-back:hover { color: rgba(200, 168, 78, 0.9); border-color: rgba(200, 168, 78, 0.25); }

.gal-title-block {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.gal-orn { width: 140px; height: 8px; }

.gal-emblem {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  margin: 6px 0 2px; position: relative;
}
.gal-emblem::before {
  content: ''; position: absolute; inset: -3px;
  border-radius: 50%; border: 1px solid rgba(200, 168, 78, 0.15);
  animation: gal-spin 20s linear infinite;
}
@keyframes gal-spin { to { transform: rotate(360deg); } }
.gal-emblem-icon { font-size: 24px; color: rgba(200, 168, 78, 0.6); }

.gal-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 26px; font-weight: 500; letter-spacing: 0.12em;
  color: #ddd6c1; margin: 0;
  text-shadow: 0 0 25px rgba(200, 100, 30, 0.15), 0 2px 6px rgba(0, 0, 0, 0.8);
}

.gal-subtitle {
  font-size: 11px; color: rgba(200, 168, 78, 0.4);
  letter-spacing: 0.12em; text-transform: uppercase; margin: 0;
}

/* ===== TABS ===== */
.gal-tabs {
  display: flex; gap: 6px; width: 100%;
}
.gal-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background: rgba(200, 168, 78, 0.02);
  color: rgba(148, 130, 100, 0.5);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; font-family: inherit;
}
.gal-tab.active {
  border-color: rgba(200, 168, 78, 0.3);
  background: rgba(200, 168, 78, 0.06);
  color: rgba(200, 168, 78, 0.9);
}
.gal-tab:hover:not(.active) { background: rgba(200, 168, 78, 0.04); color: rgba(200, 168, 78, 0.6); }
.gal-tab-count {
  font-size: 10px; opacity: 0.5;
  background: rgba(200, 168, 78, 0.08); padding: 1px 6px; border-radius: 8px;
}

/* ===== FILTERS ===== */
.gal-filters {
  display: flex; flex-direction: column; gap: 8px; width: 100%;
}
.gal-search-wrap {
  position: relative; width: 100%;
}
.gal-search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  font-size: 14px; color: rgba(200, 168, 78, 0.25); pointer-events: none;
}
.gal-search {
  width: 100%; padding: 9px 12px 9px 34px;
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(255, 255, 255, 0.02);
  color: #e2e8f0; font-size: 13px; outline: none;
  transition: border-color 0.2s; font-family: inherit; box-sizing: border-box;
}
.gal-search::placeholder { color: rgba(148, 130, 100, 0.3); }
.gal-search:focus { border-color: rgba(200, 168, 78, 0.3); }

.gal-pills { display: flex; gap: 4px; flex-wrap: wrap; }

.gal-pill {
  padding: 5px 10px; border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background: rgba(200, 168, 78, 0.02);
  color: rgba(148, 130, 100, 0.5);
  font-size: 11px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 4px;
  transition: all 0.15s; font-family: inherit;
}
.gal-pill.active {
  border-color: color-mix(in srgb, var(--pill-color, rgba(200,168,78,1)) 50%, transparent);
  color: var(--pill-color, rgba(200, 168, 78, 0.9));
  background: color-mix(in srgb, var(--pill-color, rgba(200,168,78,1)) 8%, transparent);
}
.gal-pill:hover:not(.active) { background: rgba(200, 168, 78, 0.04); color: rgba(200, 168, 78, 0.6); }
.gal-pill-rune { font-size: 13px; opacity: 0.5; }
.gal-pill-icon { font-size: 12px; }

/* ===== CARD LIST ===== */
.gal-list {
  width: 100%; display: flex; flex-direction: column; gap: 3px;
}

.gal-card {
  padding: 10px 14px; border-radius: 8px;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid transparent;
  cursor: pointer; transition: all 0.15s;
  border-left: 2px solid transparent;
}
.gal-card:hover {
  background: rgba(200, 168, 78, 0.03);
  border-color: rgba(200, 168, 78, 0.06);
  border-left-color: var(--dc, rgba(200, 168, 78, 0.15));
}
.gal-card.expanded {
  background: rgba(200, 168, 78, 0.03);
  border-color: rgba(200, 168, 78, 0.08);
  border-left-color: var(--dc, rgba(200, 168, 78, 0.3));
}

.gc-row {
  display: flex; align-items: center; gap: 8px;
}

.gc-domain-mark {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  box-shadow: 0 0 4px currentColor;
}

.gc-name {
  font-size: 13px; font-weight: 600; flex: 1;
  color: rgba(226, 232, 240, 0.85);
}

.gc-stats {
  font-size: 13px; font-weight: 700;
  font-family: var(--font-display, Georgia, serif);
  display: flex; align-items: center; gap: 2px;
}
.gc-atk { color: #f87171; }
.gc-sep { color: rgba(148, 130, 100, 0.25); font-size: 11px; }
.gc-def { color: #60a5fa; }

.gc-type-badge {
  font-size: 10px; font-weight: 600;
  color: rgba(200, 168, 78, 0.5);
  display: flex; align-items: center; gap: 3px;
}

.gc-fly { font-size: 13px; color: rgba(148, 163, 184, 0.4); }

/* Adventure badges */
.gc-adv-badge {
  font-size: 9px; font-weight: 700; padding: 2px 7px;
  border-radius: 4px; letter-spacing: 0.04em; flex-shrink: 0;
}
.gc-adv-badge.zdarzenie { color: #60a5fa; background: rgba(59, 130, 246, 0.12); }
.gc-adv-badge.artefakt { color: #fbbf24; background: rgba(251, 191, 36, 0.12); }
.gc-adv-badge.lokacja { color: #34d399; background: rgba(52, 211, 153, 0.12); }

.gc-persist {
  font-size: 9px; color: rgba(148, 130, 100, 0.4);
  background: rgba(200, 168, 78, 0.04); padding: 2px 6px; border-radius: 3px;
}

/* ===== DETAILS ===== */
.gc-details {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(200, 168, 78, 0.06);
  display: flex; flex-direction: column; gap: 8px;
}

.gc-detail { display: flex; flex-direction: column; gap: 2px; }
.gc-dl {
  font-size: 9px; color: rgba(200, 168, 78, 0.4);
  text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;
}
.gc-dl-enh { color: rgba(251, 191, 36, 0.5); }

.gc-ability {
  font-size: 12px; color: rgba(200, 190, 170, 0.75);
  line-height: 1.5; display: flex; align-items: flex-start; gap: 5px;
}

.gc-trigger {
  font-size: 8px; font-weight: 700; padding: 1px 5px;
  border-radius: 3px;
  background: rgba(200, 168, 78, 0.08); color: rgba(200, 168, 78, 0.6);
  flex-shrink: 0; margin-top: 3px; letter-spacing: 0.04em;
}
.gc-trigger-enh { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }

.gc-cost {
  font-size: 8px; font-weight: 700; padding: 1px 5px;
  border-radius: 3px;
  background: rgba(251, 191, 36, 0.1); color: rgba(251, 191, 36, 0.7);
  flex-shrink: 0; margin-top: 3px;
}

.gc-ab-text { flex: 1; }
.gc-effect { font-size: 12px; color: rgba(200, 190, 170, 0.7); line-height: 1.5; }
.gc-enh { color: rgba(251, 191, 36, 0.7); }

.gc-lore-section { opacity: 0.7; }
.gc-lore {
  font-size: 11px; color: rgba(148, 130, 100, 0.4);
  line-height: 1.5; font-style: italic;
  font-family: Georgia, serif;
}

/* Detail transition */
.details-slide-enter-active { transition: all 0.2s ease-out; }
.details-slide-leave-active { transition: all 0.15s ease-in; }
.details-slide-enter-from { opacity: 0; max-height: 0; margin-top: 0; padding-top: 0; }
.details-slide-leave-to { opacity: 0; }

/* Empty state */
.gal-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 50px 20px;
  color: rgba(148, 130, 100, 0.3);
  font-size: 13px; font-style: italic;
}
.gal-empty-icon { font-size: 28px; opacity: 0.3; }

/* ===== MOBILE ===== */
@media (max-width: 600px) {
  .gal-content { padding: 16px 10px 40px; }
  .gal-title { font-size: 20px; }
  .gc-name { font-size: 12px; }
  .gc-stats { font-size: 12px; }
  .gc-type-badge { display: none; }
  .gal-tab { font-size: 12px; padding: 8px; }
  .gal-pill { font-size: 10px; padding: 4px 8px; }
}
</style>
