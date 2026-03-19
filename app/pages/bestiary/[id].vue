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
const domainColor = computed(() => DOMAIN_INFO[creature.value?.idDomain]?.color ?? '#c8a84e')

// Prev/next creature navigation (sorted alphabetically)
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

// Reveal animation
const revealed = ref(false)
onMounted(() => {
  requestAnimationFrame(() => { revealed.value = true })
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' && prevCreature.value) navigateTo(`/bestiary/${prevCreature.value.id}`)
  if (e.key === 'ArrowRight' && nextCreature.value) navigateTo(`/bestiary/${nextCreature.value.id}`)
  if (e.key === 'Escape') navigateTo('/bestiary')
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const DOMAIN_INFO: Record<number, { name: string; color: string; icon: string; rune: string; desc: string }> = {
  1: { name: 'Perun', color: '#d4a843', icon: 'game-icons:lightning-storm', rune: 'ᛈ', desc: 'Bóg burzy, piorunów i wojny. Jego stworzenia biją mocno i szybko.' },
  2: { name: 'Żywi', color: '#4a9e4a', icon: 'game-icons:oak-leaf', rune: 'ᛉ', desc: 'Duchy natury, lasu i wody. Leczą, chronią i wspierają sojuszników.' },
  3: { name: 'Nieumarli', color: '#9c6fbf', icon: 'game-icons:skull-crossed-bones', rune: 'ᚾ', desc: 'Ci, co nie odeszli. Wracają z grobu, kradną życie, sieją strach.' },
  4: { name: 'Weles', color: '#c44040', icon: 'game-icons:fire-dash', rune: 'ᚹ', desc: 'Pan zaświatów, bydła i magii. Podstęp, manipulacja, chaos.' },
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
  <div v-if="creature" class="bp" :class="{ revealed }" :style="{ '--dc': domainColor }">
    <!-- Ambient layers -->
    <div class="bp-bg-noise" />
    <div class="bp-bg-domain-wash" />
    <div class="bp-bg-vignette" />

    <!-- TOP NAV -->
    <nav class="bp-nav">
      <NuxtLink to="/bestiary" class="bp-nav-back">
        <Icon icon="game-icons:return-arrow" />
        <span>Bestiariusz</span>
      </NuxtLink>

      <div class="bp-nav-arrows">
        <NuxtLink v-if="prevCreature" :to="`/bestiary/${prevCreature.id}`" class="bp-nav-arrow" :title="prevCreature.name">
          <Icon icon="mdi:chevron-left" />
        </NuxtLink>
        <span class="bp-nav-pos">{{ currentSortIdx + 1 }} / {{ creatures.length }}</span>
        <NuxtLink v-if="nextCreature" :to="`/bestiary/${nextCreature.id}`" class="bp-nav-arrow" :title="nextCreature.name">
          <Icon icon="mdi:chevron-right" />
        </NuxtLink>
      </div>
    </nav>

    <!-- ===== HERO ===== -->
    <section class="bp-hero">
      <div class="bp-hero-img-col">
        <div v-if="imgSrc" class="bp-img-frame">
          <img :src="imgSrc" :alt="creature.name" class="bp-img" />
          <div class="bp-img-border" />
          <div class="bp-img-glow" />
        </div>
        <div v-else class="bp-img-empty">
          <Icon icon="game-icons:creature-mask" class="bp-img-empty-icon" />
          <span class="bp-img-empty-text">Ilustracja wkrótce</span>
        </div>
      </div>

      <div class="bp-hero-text">
        <!-- Domain -->
        <div class="bp-domain">
          <Icon :icon="DOMAIN_INFO[creature.idDomain]?.icon ?? ''" class="bp-domain-icon" />
          <span class="bp-domain-name">{{ DOMAIN_INFO[creature.idDomain]?.name }}</span>
          <span class="bp-domain-rune">{{ DOMAIN_INFO[creature.idDomain]?.rune }}</span>
        </div>

        <!-- Name -->
        <h1 class="bp-name">{{ creature.name }}</h1>

        <!-- Tags -->
        <div v-if="creature.tags?.length" class="bp-tags">
          <span v-for="tag in creature.tags" :key="tag" class="bp-tag">{{ tag }}</span>
        </div>

        <!-- Stats grid -->
        <div class="bp-stats">
          <div class="bp-stat">
            <Icon icon="game-icons:crossed-swords" class="bp-stat-icon bp-stat-atk" />
            <span class="bp-stat-val bp-stat-atk">{{ creature.stats.attack }}</span>
            <span class="bp-stat-label">Atak</span>
          </div>
          <div class="bp-stat">
            <Icon icon="game-icons:shield" class="bp-stat-icon bp-stat-def" />
            <span class="bp-stat-val bp-stat-def">{{ creature.stats.defense }}</span>
            <span class="bp-stat-label">Obrona</span>
          </div>
          <div class="bp-stat">
            <Icon :icon="ATK_TYPE_INFO[creature.combat.attackType]?.icon ?? ''" class="bp-stat-icon" />
            <span class="bp-stat-val">{{ ATK_TYPE_INFO[creature.combat.attackType]?.label }}</span>
            <span class="bp-stat-label">{{ ATK_TYPE_INFO[creature.combat.attackType]?.desc }}</span>
          </div>
          <div v-if="creature.combat.isFlying" class="bp-stat">
            <Icon icon="game-icons:feathered-wing" class="bp-stat-icon" />
            <span class="bp-stat-val">Latająca</span>
            <span class="bp-stat-label">Omija naziemne blokery</span>
          </div>
        </div>

        <!-- Domain flavor -->
        <p class="bp-domain-desc">{{ DOMAIN_INFO[creature.idDomain]?.desc }}</p>
      </div>
    </section>

    <!-- ===== DIVIDER ===== -->
    <div class="bp-divider">
      <span class="bp-div-line" />
      <Icon icon="game-icons:ancient-sword" class="bp-div-icon" />
      <span class="bp-div-line" />
    </div>

    <!-- ===== LORE ===== -->
    <section v-if="creature.lore" class="bp-section">
      <h2 class="bp-section-title">
        <Icon icon="game-icons:scroll-unfurled" />
        Legenda
      </h2>
      <blockquote class="bp-lore">
        {{ cleanLore(creature.lore) }}
      </blockquote>
    </section>

    <!-- ===== ABILITIES ===== -->
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

    <!-- ===== GAME DESIGN ===== -->
    <section class="bp-section">
      <h2 class="bp-section-title">
        <Icon icon="game-icons:gears" />
        Rola w grze
      </h2>
      <div class="bp-game-box">
        <p class="bp-game-text">{{ creature.effectDescription }}</p>
        <div class="bp-game-soul">
          <Icon icon="game-icons:ghost" />
          <span>Wartość dusz: <strong>{{ creature.stats.soulValue }}</strong></span>
        </div>
      </div>
    </section>

    <!-- ===== PREV/NEXT ===== -->
    <div class="bp-divider">
      <span class="bp-div-line" />
      <span class="bp-creature-id">№ {{ creature.id }}</span>
      <span class="bp-div-line" />
    </div>

    <nav class="bp-prevnext">
      <NuxtLink v-if="prevCreature" :to="`/bestiary/${prevCreature.id}`" class="bp-pn-card bp-pn-prev">
        <Icon icon="mdi:chevron-left" class="bp-pn-arrow" />
        <div class="bp-pn-info">
          <span class="bp-pn-label">Poprzednia</span>
          <span class="bp-pn-name">{{ prevCreature.name }}</span>
        </div>
      </NuxtLink>
      <div v-else />
      <NuxtLink v-if="nextCreature" :to="`/bestiary/${nextCreature.id}`" class="bp-pn-card bp-pn-next">
        <div class="bp-pn-info" style="text-align: right;">
          <span class="bp-pn-label">Następna</span>
          <span class="bp-pn-name">{{ nextCreature.name }}</span>
        </div>
        <Icon icon="mdi:chevron-right" class="bp-pn-arrow" />
      </NuxtLink>
    </nav>

    <div style="height: 60px;" />
  </div>

  <!-- 404 -->
  <div v-else class="bp-404">
    <Icon icon="game-icons:dead-eye" style="font-size: 48px; color: rgba(148,130,100,0.15);" />
    <p style="color: rgba(148,130,100,0.4); font-family: Georgia, serif;">Istota nie znaleziona.</p>
    <NuxtLink to="/bestiary" style="color: #c8a84e; font-size: 13px;">← Wróć do Bestiariusza</NuxtLink>
  </div>
</template>

<style scoped>
/* ===== BASE ===== */
.bp {
  min-height: 100vh;
  background: #04030a;
  color: #e2e8f0;
  position: relative;
  overflow-x: hidden;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.bp.revealed { opacity: 1; }

.bp-404 {
  min-height: 100vh;
  background: #04030a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

/* ===== AMBIENT ===== */
.bp-bg-noise {
  position: fixed; inset: 0; opacity: 0.025; pointer-events: none; z-index: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 256px;
}

.bp-bg-domain-wash {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(ellipse 80% 50% at 20% 20%, color-mix(in srgb, var(--dc) 4%, transparent), transparent 60%);
}

.bp-bg-vignette {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.7) 100%);
}

/* ===== NAV ===== */
.bp-nav {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
}

.bp-nav-back {
  display: flex; align-items: center; gap: 6px;
  color: rgba(148, 130, 100, 0.4); font-size: 13px; text-decoration: none; transition: color 0.2s;
}
.bp-nav-back:hover { color: rgba(200, 168, 78, 0.8); }

.bp-nav-arrows {
  display: flex; align-items: center; gap: 8px;
}

.bp-nav-arrow {
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid rgba(200, 168, 78, 0.08); background: transparent;
  color: rgba(200, 168, 78, 0.35); font-size: 20px;
  display: flex; align-items: center; justify-content: center;
  text-decoration: none; transition: all 0.15s;
}
.bp-nav-arrow:hover { color: #c8a84e; border-color: rgba(200, 168, 78, 0.25); }

.bp-nav-pos {
  font-size: 11px; color: rgba(148, 130, 100, 0.25); letter-spacing: 0.06em;
}

/* ===== HERO ===== */
.bp-hero {
  position: relative; z-index: 1;
  display: flex; gap: 36px;
  max-width: 900px; margin: 0 auto;
  padding: 20px 32px 0;
}

.bp-hero-img-col { flex-shrink: 0; }

.bp-img-frame {
  position: relative; width: 260px; border-radius: 14px; overflow: hidden;
}

.bp-img {
  width: 100%; display: block; border-radius: 14px;
}

.bp-img-border {
  position: absolute; inset: 0; border-radius: 14px; pointer-events: none;
  border: 1px solid rgba(200, 168, 78, 0.1);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5);
}

.bp-img-glow {
  position: absolute; inset: -20px; border-radius: 30px; pointer-events: none;
  background: radial-gradient(ellipse at center, color-mix(in srgb, var(--dc) 6%, transparent), transparent 70%);
  filter: blur(20px);
  z-index: -1;
}

.bp-img-empty {
  width: 260px; height: 340px; border-radius: 14px;
  background: linear-gradient(145deg, #0c0a14, #08060c);
  border: 1px solid rgba(200, 168, 78, 0.05);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
}

.bp-img-empty-icon { font-size: 64px; color: rgba(148, 130, 100, 0.06); }
.bp-img-empty-text { font-size: 11px; color: rgba(148, 130, 100, 0.15); font-style: italic; }

/* HERO TEXT */
.bp-hero-text {
  flex: 1; display: flex; flex-direction: column; gap: 12px; padding-top: 8px;
}

.bp-domain {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; color: var(--dc); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
}

.bp-domain-icon { font-size: 16px; }
.bp-domain-rune { font-size: 20px; opacity: 0.25; margin-left: auto; }

.bp-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 48px; font-weight: 400; color: #ddd6c1; margin: 0;
  letter-spacing: 0.06em; line-height: 1.05;
  text-shadow: 0 0 30px color-mix(in srgb, var(--dc) 18%, transparent);
}

.bp-tags { display: flex; gap: 6px; }
.bp-tag {
  padding: 3px 12px; border-radius: 12px;
  background: rgba(200, 168, 78, 0.05); border: 1px solid rgba(200, 168, 78, 0.1);
  font-size: 11px; color: rgba(200, 168, 78, 0.55); text-transform: uppercase; letter-spacing: 0.1em;
}

/* STATS */
.bp-stats {
  display: flex; gap: 20px; flex-wrap: wrap; margin-top: 6px;
}

.bp-stat {
  display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 60px;
  padding: 10px 14px; border-radius: 10px;
  background: rgba(200, 168, 78, 0.02); border: 1px solid rgba(200, 168, 78, 0.04);
}

.bp-stat-icon { font-size: 18px; color: rgba(200, 168, 78, 0.45); }
.bp-stat-icon.bp-stat-atk { color: #fb923c; }
.bp-stat-icon.bp-stat-def { color: #60a5fa; }

.bp-stat-val { font-size: 20px; font-weight: 700; color: #ddd6c1; }
.bp-stat-val.bp-stat-atk { color: #fb923c; }
.bp-stat-val.bp-stat-def { color: #60a5fa; }

.bp-stat-label { font-size: 10px; color: rgba(148, 130, 100, 0.3); text-align: center; max-width: 100px; }

.bp-domain-desc {
  font-size: 13px; color: rgba(148, 130, 100, 0.35); font-style: italic;
  font-family: Georgia, serif; margin: 4px 0 0; line-height: 1.5;
}

/* ===== DIVIDER ===== */
.bp-divider {
  display: flex; align-items: center; gap: 14px;
  max-width: 900px; margin: 0 auto; padding: 28px 32px;
}

.bp-div-line {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.12), transparent);
}

.bp-div-icon { font-size: 14px; color: rgba(200, 168, 78, 0.12); }

.bp-creature-id {
  font-size: 12px; color: rgba(148, 130, 100, 0.15); letter-spacing: 0.12em; white-space: nowrap;
}

/* ===== SECTIONS ===== */
.bp-section {
  max-width: 900px; margin: 0 auto; padding: 0 32px 24px;
}

.bp-section-title {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 22px; font-weight: 400; color: rgba(200, 168, 78, 0.55);
  text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 16px;
}

.bp-section-title :deep(svg) { font-size: 20px; }

/* LORE */
.bp-lore {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px; line-height: 2; color: rgba(180, 165, 140, 0.55);
  font-style: italic; margin: 0; padding: 0 0 0 20px;
  border-left: 2px solid rgba(200, 168, 78, 0.1);
}

/* ABILITIES */
.bp-abilities { display: flex; flex-direction: column; gap: 12px; }

.bp-ability {
  padding: 16px 20px; border-radius: 10px;
  background: rgba(200, 168, 78, 0.02); border: 1px solid rgba(200, 168, 78, 0.05);
}

.bp-ability-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;
}

.bp-ability-trigger-icon { font-size: 16px; color: var(--dc); opacity: 0.6; }

.bp-ability-trigger {
  font-size: 12px; font-weight: 700; color: var(--dc);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 3px 10px; border-radius: 5px;
  background: color-mix(in srgb, var(--dc) 8%, transparent);
}

.bp-ability-cost {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #c8a84e; font-weight: 600;
}

.bp-ability-limit {
  font-size: 11px; color: rgba(148, 130, 100, 0.35); font-style: italic;
}

.bp-ability-text {
  font-size: 15px; line-height: 1.7; color: rgba(220, 210, 190, 0.7); margin: 0;
}

/* GAME DESIGN */
.bp-game-box {
  padding: 18px 22px; border-radius: 10px;
  background: rgba(200, 168, 78, 0.02); border: 1px solid rgba(200, 168, 78, 0.05);
}

.bp-game-text {
  font-size: 15px; line-height: 1.7; color: rgba(200, 190, 170, 0.6); margin: 0 0 12px;
}

.bp-game-soul {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: rgba(148, 130, 100, 0.35);
  padding-top: 10px; border-top: 1px solid rgba(200, 168, 78, 0.05);
}

.bp-game-soul strong { color: rgba(200, 168, 78, 0.6); }

/* ===== PREV/NEXT ===== */
.bp-prevnext {
  max-width: 900px; margin: 0 auto;
  display: flex; justify-content: space-between; gap: 16px;
  padding: 0 32px;
}

.bp-pn-card {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 20px; border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.06); background: rgba(200, 168, 78, 0.02);
  text-decoration: none; color: inherit; transition: all 0.2s;
}

.bp-pn-card:hover {
  border-color: rgba(200, 168, 78, 0.15);
  background: rgba(200, 168, 78, 0.04);
}

.bp-pn-arrow { font-size: 20px; color: rgba(200, 168, 78, 0.3); }
.bp-pn-info { display: flex; flex-direction: column; gap: 2px; }
.bp-pn-label { font-size: 10px; color: rgba(148, 130, 100, 0.3); text-transform: uppercase; letter-spacing: 0.08em; }
.bp-pn-name { font-family: var(--font-display, Georgia, serif); font-size: 16px; color: rgba(200, 190, 170, 0.6); }

/* ===== RESPONSIVE ===== */
@media (max-width: 700px) {
  .bp-hero { flex-direction: column; gap: 20px; padding: 12px 20px 0; }
  .bp-img-frame { width: 100%; }
  .bp-img-empty { width: 100%; height: 240px; }
  .bp-name { font-size: 34px; }
  .bp-section { padding: 0 20px 20px; }
  .bp-section-title { font-size: 18px; }
  .bp-divider { padding: 20px 20px; }
  .bp-lore { font-size: 16px; line-height: 1.8; }
  .bp-prevnext { padding: 0 20px; flex-direction: column; }
  .bp-stats { gap: 10px; }
}
</style>
