<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import istotypData from '../../../data/Slava_Vol2_Istoty.json'

definePageMeta({ ssr: false })

const route = useRoute()
const creatures = istotypData as any[]
const creatureId = computed(() => parseInt(route.params.id as string))

// Glob import creature images
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

const creature = computed(() => creatures.find(c => c.id === creatureId.value))
const imgSrc = computed(() => creatureImgs[creatureId.value] ?? null)
const domainColor = computed(() => DOMAIN_INFO[creature.value?.idDomain]?.color ?? '#8b7355')

// Nav
const sortedCreatures = computed(() => [...creatures].sort((a, b) => a.name.localeCompare(b.name, 'pl')))
const currentSortIdx = computed(() => sortedCreatures.value.findIndex(c => c.id === creatureId.value))
const prevCreature = computed(() => {
  const idx = (currentSortIdx.value - 1 + sortedCreatures.value.length) % sortedCreatures.value.length
  return sortedCreatures.value[idx]
})
const nextCreature = computed(() => {
  const idx = (currentSortIdx.value + 1) % sortedCreatures.value.length
  return sortedCreatures.value[idx]
})

// Reveal
const revealed = ref(false)
onMounted(() => { requestAnimationFrame(() => { revealed.value = true }) })

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' && prevCreature.value) navigateTo(`/bestiary/${prevCreature.value.id}`)
  if (e.key === 'ArrowRight' && nextCreature.value) navigateTo(`/bestiary/${nextCreature.value.id}`)
  if (e.key === 'Escape') navigateTo('/bestiary')
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const DOMAIN_INFO: Record<number, { name: string; color: string; colorDark: string; icon: string; rune: string; desc: string }> = {
  1: { name: 'Perun', color: '#b8942e', colorDark: '#3d310f', icon: 'game-icons:lightning-storm', rune: 'ᛈ', desc: 'Bóg burzy, piorunów i wojny. Jego stworzenia biją mocno i szybko.' },
  2: { name: 'Żywi', color: '#3a7a3a', colorDark: '#1a3a1a', icon: 'game-icons:oak-leaf', rune: 'ᛉ', desc: 'Duchy natury, lasu i wody. Leczą, chronią i wspierają sojuszników.' },
  3: { name: 'Nieumarli', color: '#7a5a9a', colorDark: '#2a1a3a', icon: 'game-icons:skull-crossed-bones', rune: 'ᚾ', desc: 'Ci, co nie odeszli. Wracają z grobu, kradną życie, sieją strach.' },
  4: { name: 'Weles', color: '#9a3030', colorDark: '#3a1010', icon: 'game-icons:fire-dash', rune: 'ᚹ', desc: 'Pan zaświatów, bydła i magii. Podstęp, manipulacja, chaos.' },
}

const ATK_TYPE_INFO: Record<number, { label: string; icon: string; desc: string }> = {
  0: { label: 'Wręcz', icon: 'game-icons:broadsword', desc: 'Atakuje tylko pierwszą linię wroga' },
  1: { label: 'Żywioł', icon: 'game-icons:fire-ring', desc: 'Jak wręcz, ale trafia też latające' },
  2: { label: 'Magia', icon: 'game-icons:magic-swirl', desc: 'Atakuje dowolną linię' },
  3: { label: 'Dystans', icon: 'game-icons:bow-arrow', desc: 'Atakuje dowolną linię' },
}

const TRIGGER_LABELS: Record<string, { label: string; icon: string }> = {
  'ON_PLAY': { label: 'Przy wystawieniu', icon: 'game-icons:card-play' },
  'ON_ATTACK': { label: 'Przy ataku', icon: 'game-icons:sword-clash' },
  'ON_DEFEND': { label: 'Przy obronie', icon: 'game-icons:shield-reflect' },
  'ON_DAMAGE_DEALT': { label: 'Przy zadaniu obrażeń', icon: 'game-icons:drop' },
  'ON_DAMAGE_RECEIVED': { label: 'Przy otrzymaniu obrażeń', icon: 'game-icons:bleeding-wound' },
  'ON_DEATH': { label: 'Przy śmierci', icon: 'game-icons:death-skull' },
  'ON_KILL': { label: 'Przy zabiciu', icon: 'game-icons:decapitation' },
  'ON_ANY_DEATH': { label: 'Przy każdej śmierci', icon: 'game-icons:tombstone' },
  'ON_TURN_START': { label: 'Początek tury', icon: 'game-icons:sunrise' },
  'ON_TURN_END': { label: 'Koniec tury', icon: 'game-icons:sunset' },
  'ON_ROUND_START': { label: 'Początek rundy', icon: 'game-icons:cycle' },
  'ON_ALLY_ATTACKED': { label: 'Sojusznik zaatakowany', icon: 'game-icons:shield-bash' },
  'ON_ALLY_DEATH': { label: 'Śmierć sojusznika', icon: 'game-icons:broken-heart' },
  'ON_ALLY_DAMAGED': { label: 'Sojusznik obrażony', icon: 'game-icons:bleeding-eye' },
  'ON_ALLY_SURVIVES': { label: 'Sojusznik przetrwał', icon: 'game-icons:heart-plus' },
  'ON_SPELL_CAST': { label: 'Czar rzucony', icon: 'game-icons:magic-portal' },
  'ON_GOLD_SPENT': { label: 'Wydanie złota', icon: 'game-icons:two-coins' },
  'ON_DEFENSE_ZERO': { label: 'Obrona = 0', icon: 'game-icons:cracked-shield' },
  'ON_COMBAT': { label: 'Faza walki', icon: 'game-icons:battle-gear' },
  'ON_ENEMY_PLAY': { label: 'Wróg wystawia', icon: 'game-icons:awareness' },
  'ACTION': { label: 'Akcja', icon: 'game-icons:hand' },
  'PASSIVE': { label: 'Pasywna', icon: 'game-icons:aura' },
  'AURA': { label: 'Aura', icon: 'game-icons:magic-shield' },
  'CZUJNOŚĆ': { label: 'Czujność', icon: 'game-icons:eye-shield' },
  'REACTION': { label: 'Reakcja', icon: 'game-icons:lightning-frequency' },
}

function cleanLore(text: string): string {
  return text.replace(/<\/?i>/g, '').replace(/^"|"$/g, '').trim()
}
</script>

<template>
  <div v-if="creature" :class="['bp', { revealed }]" :style="{ '--dc': domainColor, '--dc-dark': DOMAIN_INFO[creature.idDomain]?.colorDark }">

    <!-- ===== HERO IMAGE (full viewport) ===== -->
    <section class="bp-hero">
      <div v-if="imgSrc" class="bp-hero-img-wrap">
        <img :src="imgSrc" :alt="creature.name" class="bp-hero-img" />
      </div>
      <div v-else class="bp-hero-empty">
        <Icon icon="game-icons:creature-mask" class="bp-hero-empty-icon" />
      </div>

      <!-- Gradient fade to content -->
      <div class="bp-hero-fade" />

      <!-- Nav overlaid on image -->
      <nav class="bp-nav">
        <NuxtLink to="/bestiary" class="bp-nav-back">
          <Icon icon="mdi:arrow-left" /> Bestiariusz
        </NuxtLink>
        <div class="bp-nav-arrows">
          <NuxtLink v-if="prevCreature" :to="`/bestiary/${prevCreature.id}`" class="bp-nav-arrow" :title="prevCreature.name">
            <Icon icon="mdi:chevron-left" />
          </NuxtLink>
          <span class="bp-nav-pos">{{ currentSortIdx + 1 }}/{{ creatures.length }}</span>
          <NuxtLink v-if="nextCreature" :to="`/bestiary/${nextCreature.id}`" class="bp-nav-arrow" :title="nextCreature.name">
            <Icon icon="mdi:chevron-right" />
          </NuxtLink>
        </div>
      </nav>

      <!-- Name + domain overlaid at bottom of hero -->
      <div class="bp-hero-title">
        <div class="bp-domain-badge">
          <Icon :icon="DOMAIN_INFO[creature.idDomain]?.icon ?? ''" />
          <span>{{ DOMAIN_INFO[creature.idDomain]?.name }}</span>
          <span class="bp-domain-rune">{{ DOMAIN_INFO[creature.idDomain]?.rune }}</span>
        </div>
        <h1 class="bp-name">{{ creature.name }}</h1>
        <div v-if="creature.tags?.length" class="bp-tags">
          <span v-for="tag in creature.tags" :key="tag" class="bp-tag">{{ tag }}</span>
        </div>
      </div>
    </section>

    <!-- ===== CONTENT (warm parchment bg) ===== -->
    <main class="bp-content">

      <!-- Stats bar -->
      <div class="bp-stats-bar">
        <div class="bp-stat">
          <Icon icon="game-icons:crossed-swords" class="bp-stat-icon bp-stat-atk" />
          <div class="bp-stat-right">
            <span class="bp-stat-val bp-stat-atk">{{ creature.stats.attack }}</span>
            <span class="bp-stat-label">Atak</span>
          </div>
        </div>
        <div class="bp-stat">
          <Icon icon="game-icons:shield" class="bp-stat-icon bp-stat-def" />
          <div class="bp-stat-right">
            <span class="bp-stat-val bp-stat-def">{{ creature.stats.defense }}</span>
            <span class="bp-stat-label">Obrona</span>
          </div>
        </div>
        <div class="bp-stat">
          <Icon :icon="ATK_TYPE_INFO[creature.combat.attackType]?.icon ?? ''" class="bp-stat-icon" />
          <div class="bp-stat-right">
            <span class="bp-stat-val">{{ ATK_TYPE_INFO[creature.combat.attackType]?.label }}</span>
            <span class="bp-stat-label">{{ ATK_TYPE_INFO[creature.combat.attackType]?.desc }}</span>
          </div>
        </div>
        <div v-if="creature.combat.isFlying" class="bp-stat">
          <Icon icon="game-icons:feathered-wing" class="bp-stat-icon" />
          <div class="bp-stat-right">
            <span class="bp-stat-val">Latająca</span>
            <span class="bp-stat-label">Omija naziemne blokery</span>
          </div>
        </div>
      </div>

      <!-- Domain flavor -->
      <p class="bp-domain-flavor">{{ DOMAIN_INFO[creature.idDomain]?.desc }}</p>

      <!-- Lore -->
      <section v-if="creature.lore" class="bp-section">
        <h2 class="bp-section-title">
          <Icon icon="game-icons:scroll-unfurled" />
          Legenda
        </h2>
        <blockquote class="bp-lore">{{ cleanLore(creature.lore) }}</blockquote>
      </section>

      <!-- Abilities -->
      <section v-if="creature.abilities?.length" class="bp-section">
        <h2 class="bp-section-title">
          <Icon icon="game-icons:spell-book" />
          Zdolności
        </h2>
        <div class="bp-abilities">
          <div v-for="(ab, i) in creature.abilities" :key="i" class="bp-ability">
            <div class="bp-ability-head">
              <Icon :icon="TRIGGER_LABELS[ab.trigger]?.icon ?? 'game-icons:perspective-dice-six'" class="bp-ability-trigger-icon" />
              <span class="bp-ability-trigger">{{ TRIGGER_LABELS[ab.trigger]?.label ?? ab.trigger }}</span>
              <span v-if="ab.cost" class="bp-ability-cost">
                <Icon icon="game-icons:two-coins" /> {{ ab.cost }} PS
              </span>
              <span v-if="ab.limit === 'ONCE_PER_GAME'" class="bp-ability-limit">Raz w grze</span>
              <span v-else-if="ab.limit === 'ONCE_PER_TURN'" class="bp-ability-limit">Raz na turę</span>
            </div>
            <p class="bp-ability-text">{{ ab.text }}</p>
          </div>
        </div>
      </section>

      <!-- Game role -->
      <section class="bp-section">
        <h2 class="bp-section-title">
          <Icon icon="game-icons:gears" />
          Rola w grze
        </h2>
        <div class="bp-game-box">
          <p class="bp-game-text">{{ creature.effectDescription }}</p>
          <div class="bp-game-soul">
            <Icon icon="game-icons:ghost" />
            Wartość dusz: <strong>{{ creature.stats.soulValue }}</strong>
          </div>
        </div>
      </section>

      <!-- Prev / Next -->
      <nav class="bp-prevnext">
        <NuxtLink v-if="prevCreature" :to="`/bestiary/${prevCreature.id}`" class="bp-pn bp-pn-prev">
          <Icon icon="mdi:chevron-left" class="bp-pn-arrow" />
          <div>
            <span class="bp-pn-label">Poprzednia</span>
            <span class="bp-pn-name">{{ prevCreature.name }}</span>
          </div>
        </NuxtLink>
        <div v-else />
        <NuxtLink v-if="nextCreature" :to="`/bestiary/${nextCreature.id}`" class="bp-pn bp-pn-next">
          <div style="text-align: right;">
            <span class="bp-pn-label">Następna</span>
            <span class="bp-pn-name">{{ nextCreature.name }}</span>
          </div>
          <Icon icon="mdi:chevron-right" class="bp-pn-arrow" />
        </NuxtLink>
      </nav>

      <footer class="bp-footer">
        <span>№ {{ creature.id }}</span>
      </footer>
    </main>
  </div>

  <!-- 404 -->
  <div v-else class="bp-404">
    <Icon icon="game-icons:dead-eye" style="font-size: 48px; color: #aaa;" />
    <p>Istota nie znaleziona.</p>
    <NuxtLink to="/bestiary">← Wróć do Bestiariusza</NuxtLink>
  </div>
</template>

<style scoped>
/* ===== BASE ===== */
.bp {
  min-height: 100vh;
  background: #f4efe6;
  color: #2c2418;
  opacity: 0;
  transition: opacity 0.4s ease;
}
.bp.revealed { opacity: 1; }

.bp-404 {
  min-height: 100vh;
  background: #f4efe6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #6b5c4a;
}
.bp-404 a { color: #8b7355; }

/* ===== HERO ===== */
.bp-hero {
  position: relative;
  width: 100%;
  height: 75vh;
  min-height: 420px;
  max-height: 800px;
  overflow: hidden;
  background: #1a1510;
}

.bp-hero-img-wrap {
  position: absolute;
  inset: 0;
}

.bp-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  display: block;
}

.bp-hero-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #1a1510 0%, #2a2018 50%, #1a1510 100%);
}

.bp-hero-empty-icon {
  font-size: 120px;
  color: rgba(200, 168, 78, 0.06);
}

/* Gradient fade from image to content */
.bp-hero-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to top, #f4efe6 0%, rgba(244, 239, 230, 0.85) 30%, rgba(244, 239, 230, 0) 100%);
  pointer-events: none;
}

/* ===== NAV (on image) ===== */
.bp-nav {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, transparent 100%);
}

.bp-nav-back {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}
.bp-nav-back:hover { color: #fff; }

.bp-nav-arrows {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bp-nav-arrow {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.7);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: all 0.15s;
  backdrop-filter: blur(8px);
}
.bp-nav-arrow:hover {
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.4);
}

.bp-nav-pos {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}

/* ===== HERO TITLE (bottom of image) ===== */
.bp-hero-title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 4;
  padding: 0 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bp-domain-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dc);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.bp-domain-rune {
  font-size: 18px;
  opacity: 0.3;
  margin-left: 4px;
}

.bp-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 56px;
  font-weight: 400;
  color: #2c2418;
  margin: 0;
  letter-spacing: 0.04em;
  line-height: 1.05;
}

.bp-tags { display: flex; gap: 6px; }
.bp-tag {
  padding: 3px 12px;
  border-radius: 12px;
  background: rgba(44, 36, 24, 0.06);
  border: 1px solid rgba(44, 36, 24, 0.12);
  font-size: 11px;
  color: #6b5c4a;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* ===== CONTENT ===== */
.bp-content {
  position: relative;
  max-width: 780px;
  margin: 0 auto;
  padding: 0 40px 60px;
}

/* ===== STATS BAR ===== */
.bp-stats-bar {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding: 24px 0;
  border-bottom: 1px solid rgba(44, 36, 24, 0.1);
  margin-bottom: 28px;
}

.bp-stat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-radius: 10px;
  background: rgba(44, 36, 24, 0.03);
  border: 1px solid rgba(44, 36, 24, 0.06);
}

.bp-stat-icon {
  font-size: 22px;
  color: #8b7355;
}
.bp-stat-icon.bp-stat-atk { color: #c46520; }
.bp-stat-icon.bp-stat-def { color: #3570a8; }

.bp-stat-right {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.bp-stat-val {
  font-size: 22px;
  font-weight: 700;
  color: #2c2418;
  line-height: 1;
}
.bp-stat-val.bp-stat-atk { color: #c46520; }
.bp-stat-val.bp-stat-def { color: #3570a8; }

.bp-stat-label {
  font-size: 11px;
  color: #8b7a65;
  max-width: 120px;
  line-height: 1.3;
}

/* Domain flavor */
.bp-domain-flavor {
  font-size: 14px;
  color: #8b7a65;
  font-style: italic;
  font-family: Georgia, serif;
  margin: 0 0 32px;
  line-height: 1.6;
  padding-left: 16px;
  border-left: 3px solid var(--dc, #8b7355);
  opacity: 0.7;
}

/* ===== SECTIONS ===== */
.bp-section {
  margin-bottom: 36px;
}

.bp-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 24px;
  font-weight: 400;
  color: #3d3225;
  margin: 0 0 18px;
  letter-spacing: 0.06em;
}

.bp-section-title :deep(svg) {
  font-size: 22px;
  color: var(--dc, #8b7355);
}

/* ===== LORE ===== */
.bp-lore {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 19px;
  line-height: 1.9;
  color: #4a3d2e;
  font-style: italic;
  margin: 0;
  padding: 20px 24px;
  background: rgba(44, 36, 24, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(44, 36, 24, 0.06);
  position: relative;
}

.bp-lore::before {
  content: '"';
  position: absolute;
  top: 8px;
  left: 14px;
  font-size: 48px;
  color: var(--dc, #8b7355);
  opacity: 0.15;
  font-family: Georgia, serif;
  line-height: 1;
}

/* ===== ABILITIES ===== */
.bp-abilities {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bp-ability {
  padding: 18px 22px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(44, 36, 24, 0.08);
  box-shadow: 0 1px 3px rgba(44, 36, 24, 0.04);
}

.bp-ability-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.bp-ability-trigger-icon {
  font-size: 16px;
  color: var(--dc, #8b7355);
}

.bp-ability-trigger {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 12px;
  border-radius: 6px;
  background: var(--dc, #8b7355);
}

.bp-ability-cost {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #b8942e;
  font-weight: 700;
}

.bp-ability-limit {
  font-size: 11px;
  color: #8b7a65;
  font-style: italic;
}

.bp-ability-text {
  font-size: 16px;
  line-height: 1.7;
  color: #3d3225;
  margin: 0;
}

/* ===== GAME ROLE ===== */
.bp-game-box {
  padding: 20px 24px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(44, 36, 24, 0.08);
  box-shadow: 0 1px 3px rgba(44, 36, 24, 0.04);
}

.bp-game-text {
  font-size: 16px;
  line-height: 1.7;
  color: #3d3225;
  margin: 0 0 14px;
}

.bp-game-soul {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #8b7a65;
  padding-top: 12px;
  border-top: 1px solid rgba(44, 36, 24, 0.06);
}

.bp-game-soul strong { color: var(--dc, #8b7355); font-size: 16px; }
.bp-game-soul :deep(svg) { font-size: 16px; color: var(--dc, #8b7355); opacity: 0.5; }

/* ===== PREV/NEXT ===== */
.bp-prevnext {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 32px;
  border-top: 1px solid rgba(44, 36, 24, 0.08);
  margin-top: 36px;
}

.bp-pn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-radius: 10px;
  border: 1px solid rgba(44, 36, 24, 0.08);
  background: #fff;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(44, 36, 24, 0.04);
}

.bp-pn:hover {
  border-color: var(--dc, rgba(44, 36, 24, 0.15));
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.08);
}

.bp-pn-arrow { font-size: 20px; color: #8b7a65; }
.bp-pn-label { font-size: 10px; color: #8b7a65; text-transform: uppercase; letter-spacing: 0.08em; display: block; }
.bp-pn-name { font-family: var(--font-display, Georgia, serif); font-size: 17px; color: #3d3225; display: block; margin-top: 2px; }

/* ===== FOOTER ===== */
.bp-footer {
  text-align: center;
  padding: 28px 0 0;
  font-size: 12px;
  color: #bfb49a;
  letter-spacing: 0.12em;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 700px) {
  .bp-hero { height: 55vh; min-height: 320px; }
  .bp-hero-title { padding: 0 20px 24px; }
  .bp-name { font-size: 36px; }
  .bp-content { padding: 0 20px 48px; }
  .bp-section-title { font-size: 20px; }
  .bp-lore { font-size: 16px; padding: 16px 18px; }
  .bp-stats-bar { gap: 10px; }
  .bp-stat { padding: 6px 12px; }
  .bp-stat-val { font-size: 18px; }
  .bp-stat-icon { font-size: 18px; }
  .bp-prevnext { flex-direction: column; }
  .bp-nav { padding: 12px 16px; }
}

@media (max-width: 420px) {
  .bp-hero { height: 45vh; min-height: 280px; }
  .bp-name { font-size: 28px; }
  .bp-stats-bar { flex-direction: column; gap: 8px; }
}
</style>
