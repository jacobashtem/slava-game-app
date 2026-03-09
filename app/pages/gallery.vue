<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import istotypData from '../../data/Slava_Vol2_Istoty.json'
import przygodyData from '../../data/Slava_Vol2_KartyPrzygody.json'

definePageMeta({ ssr: false })

// ===== DATA =====
const creatures = istotypData as any[]
const adventures = przygodyData as any[]

type Tab = 'creatures' | 'adventures'
const activeTab = ref<Tab>('creatures')
const searchQuery = ref('')
const domainFilter = ref<number | null>(null)
const typeFilter = ref<string | null>(null) // adventure type filter

const DOMAIN_INFO: Record<number, { name: string; color: string; icon: string }> = {
  1: { name: 'Perun', color: '#f5c542', icon: 'game-icons:lightning-storm' },
  2: { name: 'Żywi', color: '#4caf50', icon: 'game-icons:oak-leaf' },
  3: { name: 'Nieumarli', color: '#9c27b0', icon: 'game-icons:skull-crossed-bones' },
  4: { name: 'Weles', color: '#c62828', icon: 'game-icons:fire-dash' },
}

const ATK_TYPE_LABELS: Record<number, string> = {
  0: 'Wręcz', 1: 'Żywioł', 2: 'Magia', 3: 'Dystans',
}

const ATK_TYPE_COLORS: Record<number, string> = {
  0: '#f87171', 1: '#fbbf24', 2: '#c084fc', 3: '#60a5fa',
}

// ===== FILTERED LISTS =====
const filteredCreatures = computed(() => {
  let list = creatures
  if (domainFilter.value !== null) {
    list = list.filter(c => c.idDomain === domainFilter.value)
  }
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
  if (typeFilter.value !== null) {
    list = list.filter(a => a.type === typeFilter.value)
  }
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

// ===== EXPANDED CARD =====
const expandedId = ref<number | null>(null)
function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

function getDomainColor(domainId: number): string {
  return DOMAIN_INFO[domainId]?.color ?? '#94a3b8'
}
</script>

<template>
  <div class="gallery-page">
    <!-- HEADER -->
    <div class="gallery-header">
      <NuxtLink to="/" class="back-link">
        <Icon icon="game-icons:return-arrow" /> Menu
      </NuxtLink>
      <h1>Kolekcja kart</h1>
      <span class="card-count">
        {{ activeTab === 'creatures' ? `${filteredCreatures.length}/${creatures.length} istot` : `${filteredAdventures.length}/${adventures.length} przygod` }}
      </span>
    </div>

    <!-- TABS -->
    <div class="tabs-bar">
      <button :class="['tab', { active: activeTab === 'creatures' }]" @click="activeTab = 'creatures'; typeFilter = null">
        <Icon icon="game-icons:dragon-head" /> Istoty ({{ creatures.length }})
      </button>
      <button :class="['tab', { active: activeTab === 'adventures' }]" @click="activeTab = 'adventures'; domainFilter = null">
        <Icon icon="game-icons:spell-book" /> Przygody ({{ adventures.length }})
      </button>
    </div>

    <!-- FILTERS -->
    <div class="filters-bar">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Szukaj po nazwie, efekcie..."
      />

      <!-- Domain filter (creatures only) -->
      <div v-if="activeTab === 'creatures'" class="filter-pills">
        <button
          :class="['pill', { active: domainFilter === null }]"
          @click="domainFilter = null"
        >Wszystkie</button>
        <button
          v-for="(info, id) in DOMAIN_INFO" :key="id"
          :class="['pill', { active: domainFilter === Number(id) }]"
          :style="domainFilter === Number(id) ? `border-color: ${info.color}; color: ${info.color}` : ''"
          @click="domainFilter = Number(id)"
        >
          <Icon :icon="info.icon" /> {{ info.name }}
        </button>
      </div>

      <!-- Type filter (adventures only) -->
      <div v-if="activeTab === 'adventures'" class="filter-pills">
        <button :class="['pill', { active: typeFilter === null }]" @click="typeFilter = null">Wszystkie</button>
        <button :class="['pill', { active: typeFilter === 'Zdarzenie' }]" @click="typeFilter = 'Zdarzenie'">Zdarzenia</button>
        <button :class="['pill', { active: typeFilter === 'Artefakt' }]" @click="typeFilter = 'Artefakt'">Artefakty</button>
        <button :class="['pill', { active: typeFilter === 'Lokacja' }]" @click="typeFilter = 'Lokacja'">Lokacje</button>
      </div>
    </div>

    <!-- CARD LIST -->
    <div class="card-list">
      <!-- CREATURE CARDS -->
      <template v-if="activeTab === 'creatures'">
        <div
          v-for="card in filteredCreatures" :key="card.id"
          :class="['card-entry', { expanded: expandedId === card.id }]"
          :style="`--dc: ${getDomainColor(card.idDomain)}`"
          @click="toggleExpand(card.id)"
        >
          <div class="card-row">
            <span class="card-id">#{{ card.id }}</span>
            <span class="card-domain-dot" :style="`background: ${getDomainColor(card.idDomain)}`" />
            <span class="card-name">{{ card.name }}</span>
            <span class="card-stats">
              <span class="stat atk">{{ card.stats.attack }}</span>
              /
              <span class="stat def">{{ card.stats.defense }}</span>
            </span>
            <span
              class="atk-type-badge"
              :style="`color: ${ATK_TYPE_COLORS[card.combat?.attackType ?? 0]}; background: ${ATK_TYPE_COLORS[card.combat?.attackType ?? 0]}18`"
            >{{ ATK_TYPE_LABELS[card.combat?.attackType ?? 0] }}</span>
            <Icon v-if="card.combat?.isFlying" icon="game-icons:feathered-wing" class="flying-icon" title="Latajacy" />
          </div>

          <div v-if="expandedId === card.id" class="card-details">
            <div class="detail-section">
              <div class="detail-label">Domena</div>
              <div :style="`color: ${getDomainColor(card.idDomain)}`">{{ card.domain }}</div>
            </div>
            <div v-if="card.abilities?.length" class="detail-section">
              <div class="detail-label">Zdolności</div>
              <div v-for="(ab, i) in card.abilities" :key="i" class="ability-line">
                <span class="trigger-badge">{{ ab.trigger }}</span>
                <span v-if="ab.cost" class="cost-badge">{{ ab.cost }} ZL</span>
                {{ ab.text }}
              </div>
            </div>
            <div v-if="card.effectDescription" class="detail-section">
              <div class="detail-label">Efekt</div>
              <div class="effect-text">{{ card.effectDescription }}</div>
            </div>
            <div v-if="card.lore" class="detail-section lore">
              <div class="detail-label">Lore</div>
              <div class="lore-text">{{ card.lore }}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">Effect ID</div>
              <code class="effect-id">{{ card.effectId }}</code>
            </div>
          </div>
        </div>
      </template>

      <!-- ADVENTURE CARDS -->
      <template v-else>
        <div
          v-for="card in filteredAdventures" :key="card.id"
          :class="['card-entry adventure-entry', { expanded: expandedId === card.id + 1000 }]"
          @click="toggleExpand(card.id + 1000)"
        >
          <div class="card-row">
            <span class="card-id">#{{ card.id }}</span>
            <span class="adv-type-badge" :class="card.type?.toLowerCase()">{{ card.type }}</span>
            <span class="card-name">{{ card.name }}</span>
            <span v-if="card.persistence" class="persistence-badge">{{ card.persistence }}</span>
          </div>

          <div v-if="expandedId === card.id + 1000" class="card-details">
            <div v-if="card.effect" class="detail-section">
              <div class="detail-label">Efekt podstawowy</div>
              <div class="effect-text">{{ card.effect }}</div>
            </div>
            <div v-if="card.enhancedEffect" class="detail-section">
              <div class="detail-label">Efekt wzmocniony (1 ZL)</div>
              <div class="effect-text enhanced">{{ card.enhancedEffect }}</div>
            </div>
            <div v-if="card.abilities?.length" class="detail-section">
              <div class="detail-label">Zdolności</div>
              <div v-for="(ab, i) in card.abilities" :key="i" class="ability-line">
                <span class="trigger-badge" :class="{ enhanced: ab.enhanced }">{{ ab.enhanced ? 'WZMOCNIONY' : ab.trigger }}</span>
                {{ ab.text }}
              </div>
            </div>
            <div v-if="card.lore" class="detail-section lore">
              <div class="detail-label">Lore</div>
              <div class="lore-text">{{ card.lore }}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">Effect IDs</div>
              <code class="effect-id">{{ card.effectId }}</code>
              <code v-if="card.enhancedEffectId" class="effect-id enh">{{ card.enhancedEffectId }}</code>
            </div>
          </div>
        </div>
      </template>

      <div v-if="displayList.length === 0" class="no-results">
        Brak wynikow dla "{{ searchQuery }}"
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-page {
  min-height: 100vh;
  background: var(--bg-board);
  color: #e2e8f0;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gallery-header {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 800px;
  margin-inline: auto;
  width: 100%;
}

.gallery-header h1 {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  letter-spacing: 0.04em;
}

.card-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}

.back-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a78bfa;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.25);
  transition: background 0.15s;
  flex-shrink: 0;
}
.back-link:hover { background: rgba(139, 92, 246, 0.2); }

/* TABS */
.tabs-bar {
  display: flex;
  gap: 4px;
  max-width: 800px;
  margin-inline: auto;
  width: 100%;
}

.tab {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #1e293b;
  border-radius: 6px;
  background: rgba(255,255,255,0.02);
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s;
}
.tab.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: #4f46e5;
  color: #a5b4fc;
}
.tab:hover:not(.active) { background: rgba(255,255,255,0.04); }

/* FILTERS */
.filters-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 800px;
  margin-inline: auto;
  width: 100%;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: rgba(255,255,255,0.04);
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
}
.search-input:focus { border-color: #6366f1; }
.search-input::placeholder { color: #475569; }

.filter-pills {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.pill {
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid #334155;
  background: rgba(255,255,255,0.03);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.pill.active { border-color: #6366f1; color: #a5b4fc; background: rgba(99, 102, 241, 0.1); }
.pill:hover:not(.active) { background: rgba(255,255,255,0.06); }

/* CARD LIST */
.card-list {
  max-width: 800px;
  margin-inline: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-entry {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255,255,255,0.02);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s;
}
.card-entry:hover { background: rgba(255,255,255,0.05); border-color: #1e293b; }
.card-entry.expanded { background: rgba(255,255,255,0.04); border-color: var(--dc, #334155); }

.card-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-id { font-size: 10px; color: #475569; min-width: 28px; font-family: monospace; }

.card-domain-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.card-name { font-size: 13px; font-weight: 600; flex: 1; }

.card-stats { font-size: 13px; font-weight: 700; font-family: monospace; }
.stat.atk { color: #f87171; }
.stat.def { color: #60a5fa; }

.atk-type-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.03em;
}

.flying-icon { font-size: 14px; color: #94a3b8; }

/* Adventure type badges */
.adv-type-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.03em;
}
.adv-type-badge.zdarzenie { color: #60a5fa; background: rgba(59, 130, 246, 0.15); }
.adv-type-badge.artefakt { color: #fbbf24; background: rgba(251, 191, 36, 0.15); }
.adv-type-badge.lokacja { color: #34d399; background: rgba(52, 211, 153, 0.15); }

.persistence-badge {
  font-size: 9px;
  color: #94a3b8;
  background: rgba(255,255,255,0.05);
  padding: 2px 6px;
  border-radius: 3px;
}

/* DETAILS */
.card-details {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-section { }
.detail-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 3px; }

.ability-line {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 2px;
}

.trigger-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  flex-shrink: 0;
  margin-top: 2px;
}
.trigger-badge.enhanced {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.cost-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
  flex-shrink: 0;
  margin-top: 2px;
}

.effect-text { font-size: 12px; color: #cbd5e1; line-height: 1.5; }
.effect-text.enhanced { color: #fbbf24; }

.lore-text { font-size: 11px; color: #64748b; line-height: 1.5; font-style: italic; }

.effect-id {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(255,255,255,0.04);
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
  margin-right: 4px;
}
.effect-id.enh { color: #fbbf24; }

.no-results {
  text-align: center;
  padding: 40px;
  color: #475569;
  font-size: 14px;
}
</style>
