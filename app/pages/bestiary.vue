<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import istotypData from '../../data/Slava_Vol2_Istoty.json'

definePageMeta({ ssr: false })

const creatures = istotypData as any[]
const selectedId = ref<number | null>(null)
const domainFilter = ref<number | null>(null)
const searchQuery = ref('')
const detailEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const showDetail = ref(false)
const detailReady = ref(false)

// Image existence map (known IDs with images)
const IMAGE_IDS = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,15,32,40,63,66,69,76,92,93,94,95,97,102,103,105,107,108,113,114,115,116,117,119])

const DOMAIN_INFO: Record<number, { name: string; color: string; icon: string; rune: string; desc: string }> = {
  1: { name: 'Perun', color: '#d4a843', icon: 'game-icons:lightning-storm', rune: 'ᛈ', desc: 'Bóg burzy i wojny' },
  2: { name: 'Żywi', color: '#4a9e4a', icon: 'game-icons:oak-leaf', rune: 'ᛉ', desc: 'Duchy natury i życia' },
  3: { name: 'Nieumarli', color: '#9c6fbf', icon: 'game-icons:skull-crossed-bones', rune: 'ᚾ', desc: 'Umarli, co nie odeszli' },
  4: { name: 'Weles', color: '#c44040', icon: 'game-icons:fire-dash', rune: 'ᚹ', desc: 'Pan zaświatów i bydła' },
}

const ATK_TYPE_INFO: Record<number, { label: string; icon: string }> = {
  0: { label: 'Wręcz', icon: 'game-icons:broadsword' },
  1: { label: 'Żywioł', icon: 'game-icons:fire-ring' },
  2: { label: 'Magia', icon: 'game-icons:magic-swirl' },
  3: { label: 'Dystans', icon: 'game-icons:bow-arrow' },
}

const TRIGGER_LABELS: Record<string, string> = {
  'ON_PLAY': 'Przy wystawieniu',
  'ON_ATTACK': 'Przy ataku',
  'ON_DEFEND': 'Przy obronie',
  'ON_DAMAGE_DEALT': 'Przy zadaniu obrażeń',
  'ON_DAMAGE_RECEIVED': 'Przy otrzymaniu obrażeń',
  'ON_DEATH': 'Przy śmierci',
  'ON_KILL': 'Przy zabiciu',
  'ON_ANY_DEATH': 'Przy każdej śmierci',
  'ON_TURN_START': 'Na początku tury',
  'ON_TURN_END': 'Na końcu tury',
  'ON_ROUND_START': 'Na początku rundy',
  'ON_ALLY_ATTACKED': 'Gdy sojusznik zaatakowany',
  'ON_ALLY_DEATH': 'Przy śmierci sojusznika',
  'ON_ALLY_DAMAGED': 'Gdy sojusznik obrażony',
  'ON_ALLY_SURVIVES': 'Gdy sojusznik przetrwa',
  'ON_ALLY_SPELLED': 'Przy czarze na sojusznika',
  'ON_ALLY_ATTACK': 'Gdy sojusznik atakuje',
  'ON_SPELL_CAST': 'Przy rzuceniu czaru',
  'ON_GOLD_SPENT': 'Przy wydaniu złota',
  'ON_DEFENSE_ZERO': 'Gdy obrona = 0',
  'ON_COMBAT': 'W fazie walki',
  'ON_ENEMY_PLAY': 'Gdy wróg wystawia',
  'ON_ACTIVATE': 'Aktywacja',
  'ACTION': 'Akcja',
  'PASSIVE': 'Pasywna',
  'AURA': 'Aura',
  'CZUJNOŚĆ': 'Czujność',
  'REACTION': 'Reakcja',
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

const selectedCreature = computed(() => {
  if (selectedId.value === null) return null
  return creatures.find(c => c.id === selectedId.value) ?? null
})

const domainCounts = computed(() => {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const c of creatures) counts[c.idDomain as number] = (counts[c.idDomain as number] ?? 0) + 1
  return counts
})

function hasImage(id: number): boolean {
  return IMAGE_IDS.has(id)
}

function getImageUrl(id: number): string {
  return `/assets/cards/creature/${id}.webp`
}

function selectCreature(id: number) {
  selectedId.value = id
  showDetail.value = true
  detailReady.value = false
  nextTick(() => {
    setTimeout(() => { detailReady.value = true }, 50)
  })
}

function closeDetail() {
  detailReady.value = false
  setTimeout(() => {
    showDetail.value = false
    selectedId.value = null
  }, 350)
}

function navigateCreature(dir: -1 | 1) {
  if (!selectedId.value) return
  const list = filteredCreatures.value
  const idx = list.findIndex(c => c.id === selectedId.value)
  if (idx === -1) return
  const newIdx = (idx + dir + list.length) % list.length
  selectCreature(list[newIdx].id)
}

function cleanLore(text: string): string {
  return text.replace(/<\/?i>/g, '').replace(/"/g, '').trim()
}

function handleKeydown(e: KeyboardEvent) {
  if (!showDetail.value) return
  if (e.key === 'Escape') closeDetail()
  if (e.key === 'ArrowLeft') navigateCreature(-1)
  if (e.key === 'ArrowRight') navigateCreature(1)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="bst-page">
    <!-- Background effects -->
    <div class="bst-bg-noise" />
    <div class="bst-bg-vignette" />

    <!-- ===== HEADER ===== -->
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

    <!-- ===== FILTERS ===== -->
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

    <!-- ===== CREATURE GRID ===== -->
    <main ref="listEl" class="bst-grid-wrap">
      <TransitionGroup name="bst-card" tag="div" class="bst-grid">
        <article
          v-for="creature in filteredCreatures"
          :key="creature.id"
          class="bst-entry"
          :style="{ '--domain-color': DOMAIN_INFO[creature.idDomain]?.color }"
          @click="selectCreature(creature.id)"
        >
          <!-- Image or placeholder -->
          <div class="bst-entry-img-wrap">
            <img
              v-if="hasImage(creature.id)"
              :src="getImageUrl(creature.id)"
              :alt="creature.name"
              class="bst-entry-img"
              loading="lazy"
            />
            <div v-else class="bst-entry-placeholder">
              <Icon icon="game-icons:creature-mask" />
            </div>
            <div class="bst-entry-img-fade" />
          </div>

          <!-- Info overlay -->
          <div class="bst-entry-info">
            <span class="bst-entry-domain-mark" />
            <h3 class="bst-entry-name">{{ creature.name }}</h3>
            <div class="bst-entry-stats">
              <span class="bst-stat-atk">{{ creature.stats.attack }}</span>
              <span class="bst-stat-sep">/</span>
              <span class="bst-stat-def">{{ creature.stats.defense }}</span>
            </div>
          </div>

          <!-- Flying indicator -->
          <div v-if="creature.combat.isFlying" class="bst-entry-flying">
            <Icon icon="game-icons:feathered-wing" />
          </div>
        </article>
      </TransitionGroup>

      <!-- Empty state -->
      <div v-if="filteredCreatures.length === 0" class="bst-empty">
        <Icon icon="game-icons:dead-eye" class="bst-empty-icon" />
        <p>Nie znaleziono istot.</p>
      </div>
    </main>

    <!-- ===== DETAIL OVERLAY ===== -->
    <Teleport to="body">
      <div
        v-if="showDetail && selectedCreature"
        :class="['bst-detail-overlay', { ready: detailReady }]"
        @click.self="closeDetail"
      >
        <div
          ref="detailEl"
          :class="['bst-detail', { ready: detailReady }]"
          :style="{ '--domain-color': DOMAIN_INFO[selectedCreature.idDomain]?.color }"
        >
          <!-- Close -->
          <button class="bst-detail-close" @click="closeDetail">
            <Icon icon="mdi:close" />
          </button>

          <!-- Navigation arrows -->
          <button class="bst-detail-nav bst-nav-prev" @click.stop="navigateCreature(-1)">
            <Icon icon="mdi:chevron-left" />
          </button>
          <button class="bst-detail-nav bst-nav-next" @click.stop="navigateCreature(1)">
            <Icon icon="mdi:chevron-right" />
          </button>

          <div class="bst-detail-scroll">
            <!-- Hero section -->
            <div class="bst-detail-hero">
              <div v-if="hasImage(selectedCreature.id)" class="bst-detail-img-wrap">
                <img
                  :src="getImageUrl(selectedCreature.id)"
                  :alt="selectedCreature.name"
                  class="bst-detail-img"
                />
                <div class="bst-detail-img-glow" />
              </div>
              <div v-else class="bst-detail-no-img">
                <Icon icon="game-icons:creature-mask" class="bst-detail-no-img-icon" />
              </div>

              <div class="bst-detail-hero-text">
                <!-- Domain -->
                <div class="bst-detail-domain">
                  <Icon :icon="DOMAIN_INFO[selectedCreature.idDomain]?.icon ?? ''" class="bst-detail-domain-icon" />
                  <span>{{ DOMAIN_INFO[selectedCreature.idDomain]?.name }}</span>
                  <span class="bst-detail-domain-rune">{{ DOMAIN_INFO[selectedCreature.idDomain]?.rune }}</span>
                </div>

                <!-- Name -->
                <h2 class="bst-detail-name">{{ selectedCreature.name }}</h2>

                <!-- Stats row -->
                <div class="bst-detail-stats">
                  <div class="bst-dstat">
                    <Icon icon="game-icons:crossed-swords" class="bst-dstat-icon bst-dstat-atk" />
                    <span class="bst-dstat-val bst-dstat-atk">{{ selectedCreature.stats.attack }}</span>
                    <span class="bst-dstat-label">Atak</span>
                  </div>
                  <div class="bst-dstat">
                    <Icon icon="game-icons:shield" class="bst-dstat-icon bst-dstat-def" />
                    <span class="bst-dstat-val bst-dstat-def">{{ selectedCreature.stats.defense }}</span>
                    <span class="bst-dstat-label">Obrona</span>
                  </div>
                  <div class="bst-dstat">
                    <Icon :icon="ATK_TYPE_INFO[selectedCreature.combat.attackType]?.icon ?? ''" class="bst-dstat-icon" />
                    <span class="bst-dstat-val">{{ ATK_TYPE_INFO[selectedCreature.combat.attackType]?.label }}</span>
                    <span class="bst-dstat-label">Typ ataku</span>
                  </div>
                  <div v-if="selectedCreature.combat.isFlying" class="bst-dstat">
                    <Icon icon="game-icons:feathered-wing" class="bst-dstat-icon" />
                    <span class="bst-dstat-val">Tak</span>
                    <span class="bst-dstat-label">Latanie</span>
                  </div>
                </div>

                <!-- Tags -->
                <div v-if="selectedCreature.tags?.length" class="bst-detail-tags">
                  <span v-for="tag in selectedCreature.tags" :key="tag" class="bst-tag">{{ tag }}</span>
                </div>
              </div>
            </div>

            <!-- Divider -->
            <div class="bst-divider">
              <span class="bst-div-line" />
              <Icon icon="game-icons:ancient-sword" class="bst-div-icon" />
              <span class="bst-div-line" />
            </div>

            <!-- Lore section -->
            <section v-if="selectedCreature.lore" class="bst-section bst-section-lore">
              <h4 class="bst-section-title">
                <Icon icon="game-icons:scroll-unfurled" />
                Legenda
              </h4>
              <blockquote class="bst-lore">
                {{ cleanLore(selectedCreature.lore) }}
              </blockquote>
            </section>

            <!-- Abilities section -->
            <section v-if="selectedCreature.abilities?.length" class="bst-section">
              <h4 class="bst-section-title">
                <Icon icon="game-icons:spell-book" />
                Zdolności
              </h4>
              <div class="bst-abilities">
                <div v-for="(ab, i) in selectedCreature.abilities" :key="i" class="bst-ability">
                  <div class="bst-ability-header">
                    <span class="bst-ability-trigger">{{ TRIGGER_LABELS[ab.trigger] ?? ab.trigger }}</span>
                    <span v-if="ab.cost" class="bst-ability-cost">
                      <Icon icon="game-icons:two-coins" /> {{ ab.cost }} PS
                    </span>
                    <span v-if="ab.limit === 'ONCE_PER_GAME'" class="bst-ability-limit">Raz w grze</span>
                    <span v-else-if="ab.limit === 'ONCE_PER_TURN'" class="bst-ability-limit">Raz na turę</span>
                  </div>
                  <p class="bst-ability-text">{{ ab.text }}</p>
                </div>
              </div>
            </section>

            <!-- Effect summary -->
            <section class="bst-section">
              <h4 class="bst-section-title">
                <Icon icon="game-icons:gears" />
                Efekt w grze
              </h4>
              <p class="bst-effect-text">{{ selectedCreature.effectDescription }}</p>
            </section>

            <!-- Footer ornament -->
            <div class="bst-detail-footer">
              <span class="bst-div-line" />
              <span class="bst-detail-id">№ {{ selectedCreature.id }}</span>
              <span class="bst-div-line" />
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ===== PAGE ===== */
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

/* ===== HEADER ===== */
.bst-header {
  position: relative;
  z-index: 1;
  padding: 32px 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.bst-back {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(148, 130, 100, 0.4);
  font-size: 12px;
  text-decoration: none;
  transition: color 0.2s;
}
.bst-back:hover { color: rgba(200, 168, 78, 0.8); }

.bst-title-group {
  text-align: center;
}

.bst-rune-row {
  font-size: 11px;
  letter-spacing: 0.4em;
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
  font-size: 42px;
  font-weight: 400;
  letter-spacing: 0.15em;
  color: #c8a84e;
  text-shadow: 0 0 40px rgba(200, 168, 78, 0.2), 0 2px 8px rgba(0, 0, 0, 0.8);
  margin: 0;
  text-transform: uppercase;
}

.bst-subtitle {
  font-size: 13px;
  color: rgba(148, 130, 100, 0.4);
  font-style: italic;
  font-family: Georgia, serif;
  margin: 4px 0 0;
}

/* Ornament */
.bst-ornament {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  width: min(400px, 80vw);
}

.bst-orn-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.2), transparent);
}

.bst-orn-icon {
  font-size: 18px;
  color: rgba(200, 168, 78, 0.25);
}

/* ===== FILTERS ===== */
.bst-filters {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
}

.bst-search-wrap {
  position: relative;
  width: min(400px, 90vw);
}

.bst-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: rgba(148, 130, 100, 0.3);
}

.bst-search {
  width: 100%;
  padding: 10px 14px 10px 36px;
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(200, 168, 78, 0.03);
  color: #e2e8f0;
  font-size: 13px;
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
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(148, 130, 100, 0.1);
  background: rgba(148, 130, 100, 0.04);
  color: rgba(148, 130, 100, 0.5);
  font-size: 12px;
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

.bst-pill-rune {
  font-size: 14px;
  opacity: 0.6;
}

.bst-pill-count {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 2px;
}

/* ===== GRID ===== */
.bst-grid-wrap {
  position: relative;
  z-index: 1;
  padding: 0 24px 60px;
  max-width: 1200px;
  margin: 0 auto;
}

.bst-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

/* ===== ENTRY CARD ===== */
.bst-entry {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 3 / 4;
  background: #08060c;
  border: 1px solid rgba(200, 168, 78, 0.06);
  transition: transform 0.3s ease, border-color 0.3s, box-shadow 0.3s;
}

.bst-entry:hover {
  transform: translateY(-4px) scale(1.02);
  border-color: var(--domain-color, rgba(200, 168, 78, 0.2));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px color-mix(in srgb, var(--domain-color, #c8a84e) 15%, transparent);
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
  transform: scale(1.05);
}

.bst-entry-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: rgba(148, 130, 100, 0.08);
  background: linear-gradient(145deg, #08060c 0%, #0c0a10 100%);
}

.bst-entry-img-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60%;
  background: linear-gradient(to top, #08060c 0%, rgba(8, 6, 12, 0.8) 40%, transparent 100%);
  pointer-events: none;
}

.bst-entry-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  z-index: 1;
}

.bst-entry-domain-mark {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--domain-color);
  border-radius: 1px;
  margin-bottom: 6px;
  box-shadow: 0 0 8px var(--domain-color);
  opacity: 0.7;
}

.bst-entry-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 15px;
  font-weight: 500;
  color: #ddd6c1;
  margin: 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.03em;
}

.bst-entry-stats {
  display: flex;
  gap: 2px;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
}

.bst-stat-atk { color: #fb923c; }
.bst-stat-def { color: #60a5fa; }
.bst-stat-sep { color: rgba(148, 130, 100, 0.3); }

.bst-entry-flying {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 14px;
  color: rgba(200, 200, 220, 0.3);
  z-index: 1;
}

/* ===== GRID TRANSITIONS ===== */
.bst-card-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.bst-card-leave-active { transition: opacity 0.2s ease; }
.bst-card-enter-from { opacity: 0; transform: translateY(12px); }
.bst-card-leave-to { opacity: 0; }
.bst-card-move { transition: transform 0.3s ease; }

/* ===== EMPTY ===== */
.bst-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: rgba(148, 130, 100, 0.3);
  font-family: Georgia, serif;
  font-style: italic;
}

.bst-empty-icon { font-size: 36px; opacity: 0.3; }

/* ===== DETAIL OVERLAY ===== */
.bst-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 1, 5, 0);
  transition: background 0.35s ease;
  overflow-y: auto;
  padding: 20px;
}
.bst-detail-overlay.ready {
  background: rgba(2, 1, 5, 0.92);
}

.bst-detail {
  position: relative;
  max-width: 680px;
  width: 100%;
  background: #0a0810;
  border: 1px solid rgba(200, 168, 78, 0.08);
  border-radius: 16px;
  overflow: hidden;
  opacity: 0;
  transform: translateY(20px) scale(0.97);
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.bst-detail.ready {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.bst-detail-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(10, 8, 16, 0.8);
  color: rgba(200, 168, 78, 0.5);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  backdrop-filter: blur(8px);
}
.bst-detail-close:hover {
  background: rgba(200, 168, 78, 0.1);
  color: #c8a84e;
}

/* ===== NAV ARROWS ===== */
.bst-detail-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background: rgba(10, 8, 16, 0.7);
  color: rgba(200, 168, 78, 0.4);
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  backdrop-filter: blur(6px);
}
.bst-detail-nav:hover {
  background: rgba(200, 168, 78, 0.08);
  color: #c8a84e;
  border-color: rgba(200, 168, 78, 0.2);
}
.bst-nav-prev { left: 10px; }
.bst-nav-next { right: 10px; }

/* ===== DETAIL SCROLL ===== */
.bst-detail-scroll {
  max-height: 85vh;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.1) transparent;
}

/* ===== HERO ===== */
.bst-detail-hero {
  display: flex;
  gap: 24px;
  padding: 28px 28px 0;
}

.bst-detail-img-wrap {
  position: relative;
  width: 200px;
  min-height: 260px;
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
}

.bst-detail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.bst-detail-img-glow {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(200, 168, 78, 0.08);
  pointer-events: none;
}

.bst-detail-no-img {
  width: 200px;
  min-height: 260px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(145deg, #0c0a14, #08060c);
  border: 1px solid rgba(200, 168, 78, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bst-detail-no-img-icon {
  font-size: 60px;
  color: rgba(148, 130, 100, 0.08);
}

.bst-detail-hero-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

/* Domain */
.bst-detail-domain {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--domain-color);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bst-detail-domain-icon { font-size: 14px; }

.bst-detail-domain-rune {
  font-size: 16px;
  opacity: 0.3;
  margin-left: auto;
}

/* Name */
.bst-detail-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 32px;
  font-weight: 400;
  color: #ddd6c1;
  margin: 0;
  letter-spacing: 0.05em;
  text-shadow: 0 0 24px color-mix(in srgb, var(--domain-color, #c8a84e) 20%, transparent);
  line-height: 1.1;
}

/* Stats */
.bst-detail-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.bst-dstat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 52px;
}

.bst-dstat-icon {
  font-size: 16px;
  color: rgba(200, 168, 78, 0.5);
}
.bst-dstat-icon.bst-dstat-atk { color: #fb923c; }
.bst-dstat-icon.bst-dstat-def { color: #60a5fa; }

.bst-dstat-val {
  font-size: 18px;
  font-weight: 700;
  color: #ddd6c1;
}
.bst-dstat-val.bst-dstat-atk { color: #fb923c; }
.bst-dstat-val.bst-dstat-def { color: #60a5fa; }

.bst-dstat-label {
  font-size: 10px;
  color: rgba(148, 130, 100, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Tags */
.bst-detail-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.bst-tag {
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(200, 168, 78, 0.06);
  border: 1px solid rgba(200, 168, 78, 0.1);
  font-size: 11px;
  color: rgba(200, 168, 78, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ===== DIVIDER ===== */
.bst-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 28px;
}

.bst-div-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.12), transparent);
}

.bst-div-icon {
  font-size: 14px;
  color: rgba(200, 168, 78, 0.15);
}

/* ===== SECTIONS ===== */
.bst-section {
  padding: 0 28px 20px;
}

.bst-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 500;
  color: rgba(200, 168, 78, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px;
}

.bst-section-title :deep(svg) { font-size: 16px; }

/* Lore */
.bst-section-lore { padding-bottom: 10px; }

.bst-lore {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 15px;
  line-height: 1.8;
  color: rgba(180, 165, 140, 0.6);
  font-style: italic;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 2px solid rgba(200, 168, 78, 0.1);
}

/* Abilities */
.bst-abilities {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bst-ability {
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(200, 168, 78, 0.02);
  border: 1px solid rgba(200, 168, 78, 0.06);
}

.bst-ability-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.bst-ability-trigger {
  font-size: 11px;
  font-weight: 700;
  color: var(--domain-color, #c8a84e);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--domain-color, #c8a84e) 8%, transparent);
}

.bst-ability-cost {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #c8a84e;
  font-weight: 600;
}

.bst-ability-limit {
  font-size: 10px;
  color: rgba(148, 130, 100, 0.4);
  font-style: italic;
}

.bst-ability-text {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(220, 210, 190, 0.75);
  margin: 0;
}

/* Effect summary */
.bst-effect-text {
  font-size: 13px;
  line-height: 1.7;
  color: rgba(200, 190, 170, 0.65);
  margin: 0;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(200, 168, 78, 0.02);
  border: 1px solid rgba(200, 168, 78, 0.05);
}

/* Footer */
.bst-detail-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 28px 24px;
}

.bst-detail-id {
  font-size: 11px;
  color: rgba(148, 130, 100, 0.2);
  letter-spacing: 0.1em;
  white-space: nowrap;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 600px) {
  .bst-title { font-size: 28px; letter-spacing: 0.1em; }
  .bst-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .bst-detail-hero { flex-direction: column; padding: 20px 20px 0; }
  .bst-detail-img-wrap { width: 100%; min-height: 220px; }
  .bst-detail-no-img { width: 100%; min-height: 180px; }
  .bst-detail-name { font-size: 24px; }
  .bst-section { padding: 0 20px 16px; }
  .bst-divider { padding: 16px 20px; }
  .bst-detail-footer { padding: 12px 20px 20px; }
  .bst-nav-prev { left: 4px; }
  .bst-nav-next { right: 4px; }
  .bst-rune-row { display: none; }
}

@media (max-width: 380px) {
  .bst-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
