<script setup lang="ts">
definePageMeta({ ssr: false })
import { ref, onMounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { useSlavaApi } from '../../composables/useSlavaApi'
import type { AIDifficulty } from '../../game-engine/AIPlayer'

import { Domain, DOMAIN_COLORS } from '../../game-engine/constants'

/** Total XP required to reach a given level. */
function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
}

const game = useGameStore()
const api = useSlavaApi()
const { t, locale, locales } = useI18n()

// ===== PLAYER PROFILE =====
const PLAYER_ICONS = [
  'game-icons:viking-helmet',
  'game-icons:swords-emblem',
  'game-icons:wolf-head',
  'game-icons:bear-head',
  'game-icons:hawk-emblem',
  'game-icons:raven',
  'game-icons:crown',
  'game-icons:war-axe',
  'game-icons:fire-ring',
  'game-icons:triquetra',
  'game-icons:oak-leaf',
  'game-icons:eye-shield',
]

const showProfile = ref(false)
const profileName = ref(game.playerName || '')
const profileIcon = ref(game.playerIcon || 'game-icons:viking-helmet')
const loginLoading = ref(false)
const loginError = ref<string | null>(null)

const displayName = computed(() => api.currentPlayer.value?.displayName || game.playerName || t('difficulty.warrior'))
const displayIcon = computed(() => game.playerIcon || 'game-icons:viking-helmet')
const playerLevel = computed(() => api.currentPlayer.value?.level ?? 1)
const playerXp = computed(() => api.currentPlayer.value?.xp ?? 0)
const xpForCurrent = computed(() => xpForLevel(playerLevel.value))
const xpForNext = computed(() => xpForLevel(playerLevel.value + 1))
const xpProgress = computed(() => {
  const range = xpForNext.value - xpForCurrent.value
  if (range <= 0) return 0
  return Math.min(100, Math.round(((playerXp.value - xpForCurrent.value) / range) * 100))
})

function selectProfileIcon(icon: string) {
  profileIcon.value = icon
}

async function saveProfile() {
  const name = profileName.value.trim()
  if (!name || name.length < 2) {
    loginError.value = t('menu.loginError')
    return
  }
  loginLoading.value = true
  loginError.value = null
  try {
    await api.login(name, profileIcon.value)
    game.setPlayerProfile(name, profileIcon.value)
    showProfile.value = false
  } catch (e: any) {
    loginError.value = e.message || t('menu.loginFailed')
  } finally {
    loginLoading.value = false
  }
}

// ===== USTAWIENIA GRY =====
const difficulty = ref<AIDifficulty>(game.selectedDifficulty)
const selectedDomains = ref<number[]>([...(game.selectedDomains ?? [])])

function toggleDomain(domain: number) {
  const idx = selectedDomains.value.indexOf(domain)
  if (idx >= 0) selectedDomains.value.splice(idx, 1)
  else selectedDomains.value.push(domain)
}

function startGoldEdition() {
  game.setDifficulty(difficulty.value)
  game.setDomains(selectedDomains.value)
  game.startAlphaGame()
  navigateTo('/game')
}

function startSlavaMode() {
  game.setDifficulty(difficulty.value)
  game.setDomains(selectedDomains.value)
  game.startSlavaGame()
  navigateTo('/game')
}

const domains = computed(() => [
  { id: Domain.PERUN, name: t('domain.perun'), color: DOMAIN_COLORS[Domain.PERUN], icon: 'game-icons:lightning-storm', desc: t('domain.perunDesc') },
  { id: Domain.ZYVI, name: t('domain.zyvi'), color: DOMAIN_COLORS[Domain.ZYVI], icon: 'game-icons:oak-leaf', desc: t('domain.zyviDesc') },
  { id: Domain.UNDEAD, name: t('domain.undead'), color: DOMAIN_COLORS[Domain.UNDEAD], icon: 'game-icons:skull-crossed-bones', desc: t('domain.undeadDesc') },
  { id: Domain.WELES, name: t('domain.weles'), color: DOMAIN_COLORS[Domain.WELES], icon: 'game-icons:fire-dash', desc: t('domain.welesDesc') },
])

// ===== PREFETCH HEAVY MODULES =====
if (typeof window !== 'undefined') {
  import('three/webgpu').catch(() => {})
  import('three/tsl').catch(() => {})
}

// ===== ATMOSPHERIC PARTICLES =====
const embers = ref<{ x: number; delay: number; dur: number; size: number }[]>([])
onMounted(async () => {
  embers.value = Array.from({ length: 24 }, () => ({
    x: Math.random() * 100,
    delay: Math.random() * 15,
    dur: 10 + Math.random() * 12,
    size: 2 + Math.random() * 3,
  }))

  // Restore session on mount
  const player = await api.restoreSession()
  if (player) {
    // Sync gameStore profile with backend data
    game.setPlayerProfile(player.displayName, game.playerIcon)
  }
})

// Settings
const showSettings = ref(false)
</script>

<template>
  <div class="main-menu">
    <!-- Background layers -->
    <div class="bg-layer">
      <div class="bg-dark-fog" />
      <div class="bg-fire-glow" />
      <div class="bg-vignette" />
      <!-- Rising embers -->
      <div
        v-for="(e, i) in embers" :key="i"
        class="ember"
        :style="{
          left: e.x + '%',
          width: e.size + 'px',
          height: e.size + 'px',
          animationDelay: e.delay + 's',
          animationDuration: e.dur + 's',
        }"
      />
    </div>

    <!-- Content -->
    <div class="menu-scroll">
      <div class="menu-content">
        <!-- PLAYER BAR -->
        <div class="player-bar" @click="showProfile = !showProfile">
          <div class="pb-avatar">
            <Icon :icon="displayIcon" class="pb-icon" />
          </div>
          <div class="pb-info">
            <span class="pb-name">{{ displayName }}</span>
            <div v-if="api.isAuthenticated.value" class="pb-level-row">
              <span class="pb-level">{{ $t('menu.level') }} {{ playerLevel }}</span>
              <div class="pb-xp-bar">
                <div class="pb-xp-fill" :style="{ width: xpProgress + '%' }" />
              </div>
              <span class="pb-xp-text">{{ playerXp }} XP</span>
            </div>
            <span v-else class="pb-login-hint">{{ $t('menu.clickToLogin') }}</span>
          </div>
          <Icon :icon="showProfile ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="pb-chev" />
        </div>

        <!-- PROFILE EDITOR (collapsible) -->
        <Transition name="panel-slide">
          <div v-if="showProfile" class="profile-panel">
            <div class="pp-field">
              <label class="pp-label">{{ $t('menu.warriorName') }}</label>
              <input
                v-model="profileName"
                class="pp-input"
                type="text"
                maxlength="20"
                :placeholder="$t('menu.namePlaceholder')"
                @keyup.enter="saveProfile"
              />
            </div>
            <div class="pp-field">
              <label class="pp-label">{{ $t('menu.coatOfArms') }}</label>
              <div class="pp-icons">
                <button
                  v-for="ic in PLAYER_ICONS" :key="ic"
                  :class="['pp-icon-btn', { active: profileIcon === ic }]"
                  @click="selectProfileIcon(ic)"
                >
                  <Icon :icon="ic" />
                </button>
              </div>
            </div>
            <div v-if="loginError" class="pp-error">{{ loginError }}</div>
            <button class="pp-save" :disabled="loginLoading" @click="saveProfile">
              <Icon v-if="loginLoading" icon="mdi:loading" class="spin" />
              <Icon v-else icon="game-icons:scroll-quill" />
              {{ api.isAuthenticated.value ? $t('menu.saveProfile') : $t('menu.login') }}
            </button>
            <button v-if="api.isAuthenticated.value" class="pp-logout" @click="api.logout(); showProfile = false">
              <Icon icon="mdi:logout" />
              {{ $t('menu.logout') }}
            </button>
          </div>
        </Transition>

        <!-- HEADER: emblem + title -->
        <div class="logo-block">
          <!-- Slavic ornament top -->
          <div class="orn-row">
            <svg viewBox="0 0 120 8" class="orn-svg"><path d="M0 4 Q15 0 30 4 Q45 8 60 4 Q75 0 90 4 Q105 8 120 4" fill="none" stroke="rgba(200,168,78,0.25)" stroke-width="1"/></svg>
          </div>

          <div class="emblem">
            <div class="emblem-outer" />
            <div class="emblem-inner" />
            <Icon icon="game-icons:triquetra" class="emblem-symbol" />
          </div>

          <h1 class="title">SŁAWA</h1>
          <p class="subtitle">Vol. 2 — {{ $t('menu.goldEdition') }}</p>
          <p class="tagline">{{ $t('menu.tagline') }}</p>

          <div class="orn-row">
            <svg viewBox="0 0 120 8" class="orn-svg"><path d="M0 4 Q15 8 30 4 Q45 0 60 4 Q75 8 90 4 Q105 0 120 4" fill="none" stroke="rgba(200,168,78,0.25)" stroke-width="1"/></svg>
          </div>
        </div>

        <!-- GAME MODES -->
        <div class="modes-col">
          <!-- GOLD EDITION — primary -->
          <button class="mode-card mode-gold" @click="startGoldEdition">
            <div class="mode-glow" />
            <Icon icon="game-icons:crown-coin" class="mode-icon" />
            <div class="mode-text">
              <span class="mode-name">{{ $t('menu.goldEdition') }}</span>
              <span class="mode-desc">{{ $t('menu.goldEditionShort') }}</span>
            </div>
            <div class="mode-badge">{{ $t('menu.recommended') }}</div>
          </button>

          <!-- SLAVA + TUTORIAL side by side -->
          <div class="modes-pair">
            <button class="mode-card mode-slava" @click="startSlavaMode">
              <div class="mode-glow mode-glow-red" />
              <Icon icon="game-icons:sword-clash" class="mode-icon" />
              <div class="mode-text">
                <span class="mode-name">{{ $t('menu.slava') }}</span>
                <span class="mode-desc">{{ $t('menu.slavaPantheon') }}</span>
              </div>
            </button>

            <NuxtLink to="/tutorial" class="mode-card mode-tutorial">
              <Icon icon="game-icons:hooded-figure" class="mode-icon" />
              <div class="mode-text">
                <span class="mode-name">{{ $t('menu.tutorial') }}</span>
                <span class="mode-desc">{{ $t('menu.learnToPlay') }}</span>
              </div>
            </NuxtLink>
          </div>

          <!-- CAMPAIGN -->
          <NuxtLink to="/scenario" class="mode-card mode-campaign">
            <div class="mode-glow mode-glow-campaign" />
            <Icon icon="game-icons:campfire" class="mode-icon" />
            <div class="mode-text">
              <span class="mode-name">{{ $t('menu.campaign') }}</span>
              <span class="mode-desc">{{ $t('menu.campaignDesc') }}</span>
            </div>
            <div class="mode-badge">{{ $t('menu.new') }}</div>
          </NuxtLink>
        </div>

        <!-- SETTINGS (collapsible) -->
        <button class="settings-toggle" @click="showSettings = !showSettings">
          <Icon icon="game-icons:battle-gear" class="st-icon" />
          <span>{{ $t('menu.battleSettings') }}</span>
          <Icon :icon="showSettings ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="st-chev" />
        </button>

        <Transition name="panel-slide">
          <div v-if="showSettings" class="settings-panel">
            <!-- Difficulty -->
            <div class="sg">
              <label class="sg-label">
                <Icon icon="game-icons:brain" />
                {{ $t('menu.aiDifficulty') }}
              </label>
              <div class="sg-btns sg-btns--4">
                <button v-for="d in [
                  { val: 'novice', label: $t('difficulty.novice'), icon: 'game-icons:feather' },
                  { val: 'warrior', label: $t('difficulty.warrior'), icon: 'game-icons:shield-echoes' },
                  { val: 'veteran', label: $t('difficulty.veteran'), icon: 'game-icons:skull-crack' },
                  { val: 'legend', label: $t('difficulty.legend'), icon: 'game-icons:crown' },
                ]" :key="d.val"
                  :class="['sg-btn', { active: difficulty === d.val }]"
                  @click="difficulty = d.val as AIDifficulty"
                >
                  <Icon :icon="d.icon" />
                  {{ d.label }}
                </button>
              </div>
            </div>

            <!-- Domains -->
            <div class="sg">
              <label class="sg-label">
                <Icon icon="game-icons:triquetra" />
                {{ $t('menu.yourDomains') }} <span class="sg-hint">{{ $t('menu.domainHint') }}</span>
              </label>
              <div class="domain-grid">
                <button
                  v-for="d in domains" :key="d.id"
                  :class="['dom-btn', { active: selectedDomains.includes(d.id) }]"
                  :style="{ '--dc': d.color }"
                  @click="toggleDomain(d.id)"
                >
                  <Icon :icon="d.icon" class="dom-icon" />
                  <span class="dom-name">{{ d.name }}</span>
                  <span class="dom-desc">{{ d.desc }}</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- NAVIGATION -->
        <div class="nav-row">
          <NuxtLink to="/lobby" class="nav-tile nav-mp">
            <Icon icon="game-icons:swords-emblem" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.multiplayer') }}</span>
            <span class="nt-desc">{{ $t('menu.multiplayerDesc') }}</span>
          </NuxtLink>
          <NuxtLink to="/arena" class="nav-tile">
            <Icon icon="game-icons:card-joker" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.arena') }}</span>
            <span class="nt-desc">{{ $t('menu.arenaDesc') }}</span>
          </NuxtLink>
          <NuxtLink to="/vfx-arena" class="nav-tile">
            <Icon icon="game-icons:battle-axe" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.vfxArena') }}</span>
            <span class="nt-desc">{{ $t('menu.vfxArenaDesc') }}</span>
          </NuxtLink>
          <NuxtLink to="/showcase" class="nav-tile">
            <Icon icon="game-icons:sparkles" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.effects') }}</span>
            <span class="nt-desc">{{ $t('menu.effectsDesc') }}</span>
          </NuxtLink>
          <NuxtLink to="/ranking" class="nav-tile">
            <Icon icon="game-icons:laurel-crown" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.ranking') }}</span>
            <span class="nt-desc">{{ $t('menu.rankingDesc') }}</span>
          </NuxtLink>
          <NuxtLink to="/gallery" class="nav-tile">
            <Icon icon="game-icons:card-pickup" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.collection') }}</span>
            <span class="nt-desc">{{ $t('menu.collectionDesc', { count: 182 }) }}</span>
          </NuxtLink>
          <NuxtLink to="/bestiary" class="nav-tile">
            <Icon icon="game-icons:creature-mask" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.bestiary') }}</span>
            <span class="nt-desc">{{ $t('menu.bestiaryDesc') }}</span>
          </NuxtLink>
          <NuxtLink to="/rules" class="nav-tile">
            <Icon icon="game-icons:book-cover" class="nt-icon" />
            <span class="nt-label">{{ $t('menu.rules') }}</span>
            <span class="nt-desc">{{ $t('menu.rulesDesc') }}</span>
          </NuxtLink>
        </div>

        <!-- FOOTER -->
        <div class="footer">
          <div class="footer-badge">
            <Icon icon="game-icons:two-coins" />
            {{ $t('menu.subtitle', { count: 182 }) }}
          </div>
          <div class="lang-switcher">
            <button
              v-for="loc in locales"
              :key="loc.code"
              :class="['lang-btn', { active: locale === loc.code }]"
              @click="locale = loc.code"
            >
              {{ loc.name }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== FULL SCREEN ===== */
.main-menu {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f0ebe2;
}

/* ===== BACKGROUND ===== */
.bg-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.bg-dark-fog {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, #1a1510 0%, #2a2018 40%, #f0ebe2 65%, #f0ebe2 100%);
}

.bg-fire-glow {
  position: absolute;
  top: 0;
  left: 20%;
  width: 60%;
  height: 35%;
  border-radius: 0 0 50% 50%;
  background: radial-gradient(ellipse at 50% 30%, rgba(200, 80, 20, 0.08) 0%, transparent 70%);
  animation: fire-breathe 6s ease-in-out infinite;
}

@keyframes fire-breathe {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

.bg-vignette {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 45%;
  background: radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(20, 15, 10, 0.4) 100%);
}

/* Rising embers — subtle on dark header area */
.ember {
  position: absolute;
  bottom: 60%;
  border-radius: 50%;
  background: rgba(200, 130, 50, 0.5);
  animation: ember-rise linear infinite;
  will-change: transform;
}

@keyframes ember-rise {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  5%   { opacity: 0.6; }
  50%  { transform: translateY(calc(-30vh)) translateX(8px); opacity: 0.3; }
  80%  { opacity: 0.1; }
  100% { transform: translateY(calc(-50vh)) translateX(-5px); opacity: 0; }
}

/* ===== SCROLLABLE CONTENT ===== */
.menu-scroll {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  z-index: 1;
  display: flex;
  justify-content: center;
  scrollbar-width: none;
}
.menu-scroll::-webkit-scrollbar { display: none; }

.menu-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  padding: 40px 20px 50px;
  max-width: 440px;
  width: 100%;
}

/* ===== LOGO BLOCK ===== */
.logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.orn-row {
  width: 200px;
  display: flex;
  justify-content: center;
}
.orn-svg { width: 100%; height: 8px; }

.emblem {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 10px 0 6px;
}

.emblem-outer {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(200, 168, 78, 0.25);
  animation: spin 25s linear infinite;
}
.emblem-outer::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 1px solid rgba(120, 40, 15, 0.2);
}

.emblem-inner {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  border: 1px dashed rgba(200, 168, 78, 0.12);
  animation: spin 18s linear infinite reverse;
}

@keyframes spin { to { transform: rotate(360deg); } }

.emblem-symbol {
  font-size: 38px;
  color: #c8a84e;
  filter: drop-shadow(0 0 10px rgba(200, 100, 30, 0.4));
  z-index: 1;
}

.title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 62px;
  font-weight: 500;
  letter-spacing: 0.28em;
  color: #f0ebe2;
  margin: 0;
  text-shadow:
    0 0 40px rgba(200, 100, 30, 0.3),
    0 0 80px rgba(200, 80, 20, 0.15),
    0 2px 12px rgba(0, 0, 0, 0.8);
}

.subtitle {
  font-size: 12px;
  color: rgba(200, 168, 78, 0.7);
  letter-spacing: 0.18em;
  margin: 2px 0 0;
  text-transform: uppercase;
  font-weight: 700;
}

.tagline {
  font-size: 11px;
  color: rgba(200, 180, 150, 0.5);
  margin: 0;
  font-style: italic;
  letter-spacing: 0.08em;
}

/* ===== GAME MODES ===== */
.modes-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.modes-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.modes-pair .mode-card {
  flex-direction: column;
  text-align: center;
  padding: 16px 10px;
  gap: 8px;
}
.modes-pair .mode-text { align-items: center; }
.modes-pair .mode-name { font-size: 16px; }
.modes-pair .mode-desc { font-size: 10px; }

.mode-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.2s, border-color 0.2s;
  overflow: hidden;
  text-align: left;
  width: 100%;
}

.mode-card:hover {
  transform: translateY(-2px);
}

.mode-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Gold Edition */
.mode-gold {
  background: #fff;
  border-color: rgba(180, 150, 60, 0.25);
  color: #2c2418;
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.06);
}
.mode-gold:hover {
  border-color: rgba(180, 150, 60, 0.5);
  box-shadow: 0 4px 16px rgba(180, 150, 60, 0.12);
}
.mode-gold .mode-glow {
  background: radial-gradient(ellipse at 10% 50%, rgba(200, 168, 78, 0.06), transparent 50%);
}
.mode-gold .mode-icon {
  font-size: 32px;
  color: #b8942e;
  z-index: 1;
  flex-shrink: 0;
}

/* Slava! */
.mode-slava {
  background: #fff;
  border-color: rgba(180, 60, 30, 0.15);
  color: #2c2418;
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.06);
}
.mode-slava:hover {
  border-color: rgba(180, 60, 30, 0.35);
  box-shadow: 0 4px 16px rgba(180, 60, 30, 0.1);
}
.mode-slava .mode-glow-red {
  background: radial-gradient(ellipse at 10% 50%, rgba(180, 50, 20, 0.04), transparent 50%);
}
.mode-slava .mode-icon {
  font-size: 28px;
  color: #b04030;
  z-index: 1;
  flex-shrink: 0;
}

.mode-tutorial {
  background: #fff;
  border: 1px solid rgba(70, 130, 90, 0.15);
  text-decoration: none;
  color: #2c2418;
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.06);
}
.mode-tutorial:hover {
  border-color: rgba(70, 130, 90, 0.35);
  box-shadow: 0 4px 16px rgba(70, 130, 90, 0.1);
}
.mode-tutorial .mode-icon {
  font-size: 26px;
  color: #3a7a4a;
}

/* Campaign */
.mode-campaign {
  background: #fff;
  border: 1px solid rgba(200, 120, 40, 0.2);
  text-decoration: none;
  color: #2c2418;
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.06);
}
.mode-campaign:hover {
  border-color: rgba(200, 120, 40, 0.45);
  box-shadow: 0 4px 16px rgba(200, 120, 40, 0.1);
}
.mode-campaign .mode-glow-campaign {
  background: radial-gradient(ellipse at 10% 50%, rgba(200, 120, 40, 0.04), transparent 50%);
}
.mode-campaign .mode-icon {
  font-size: 30px;
  color: #c47030;
  z-index: 1;
  flex-shrink: 0;
}

@keyframes btn-glow-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.mode-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1;
  flex: 1;
}

.mode-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 21px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.mode-desc {
  font-size: 11px;
  color: #8b7a65;
  line-height: 1.3;
}

.mode-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: #9a7a2e;
  background: rgba(180, 150, 60, 0.1);
  border: 1px solid rgba(180, 150, 60, 0.2);
  padding: 2px 7px;
  border-radius: 3px;
  z-index: 1;
}

/* ===== SETTINGS TOGGLE ===== */
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 11px 16px;
  border-radius: 8px;
  border: 1px solid rgba(44, 36, 24, 0.08);
  background: rgba(44, 36, 24, 0.02);
  color: #8b7a65;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.settings-toggle:hover { background: rgba(44, 36, 24, 0.04); color: #5a4a35; border-color: rgba(44, 36, 24, 0.15); }
.st-icon { font-size: 14px; }
.st-chev { margin-left: auto; font-size: 16px; color: #a0937e; }

/* Settings panel transition */
.panel-slide-enter-active, .panel-slide-leave-active { transition: max-height 0.25s ease, opacity 0.25s ease; overflow: hidden; }
.panel-slide-enter-from, .panel-slide-leave-to { max-height: 0; opacity: 0; }
.panel-slide-enter-to, .panel-slide-leave-from { max-height: 380px; opacity: 1; }

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  padding: 16px;
  background: #fff;
  border: 1px solid rgba(44, 36, 24, 0.08);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.05);
}

.sg { display: flex; flex-direction: column; gap: 7px; }
.sg-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
  text-transform: uppercase; color: #8b7a65;
}
.sg-hint { font-weight: 400; font-style: italic; text-transform: none; letter-spacing: 0; opacity: 0.6; }

.sg-btns { display: flex; gap: 5px; }
.sg-btns--4 { flex-wrap: wrap; }
.sg-btns--4 .sg-btn { flex: 1 1 calc(50% - 3px); min-width: 0; }
.sg-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 7px 8px; border-radius: 6px;
  border: 1px solid rgba(44, 36, 24, 0.08);
  background: rgba(44, 36, 24, 0.02);
  color: #6b5c4a; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
.sg-btn.active {
  border-color: rgba(160, 130, 40, 0.35);
  color: #8b6f1e;
  background: rgba(200, 168, 78, 0.1);
}
.sg-btn:hover:not(.active) { background: rgba(44, 36, 24, 0.04); }

.domain-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.dom-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 6px; border-radius: 6px;
  border: 1px solid rgba(44, 36, 24, 0.06);
  background: rgba(44, 36, 24, 0.02);
  color: #6b5c4a; cursor: pointer; transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  text-align: center;
}
.dom-btn.active {
  border-color: color-mix(in srgb, var(--dc) 40%, transparent);
  background: color-mix(in srgb, var(--dc) 8%, transparent);
}
.dom-btn.active .dom-icon { color: var(--dc); }
.dom-btn.active .dom-name { color: var(--dc); }
.dom-btn:hover:not(.active) { background: rgba(44, 36, 24, 0.04); }
.dom-icon { font-size: 18px; transition: color 0.15s; color: #8b7a65; }
.dom-name { font-size: 11px; font-weight: 700; color: #5a4a35; }
.dom-desc { font-size: 8px; color: #8b7a65; }

/* ===== NAVIGATION ===== */
.nav-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
}

.nav-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(44, 36, 24, 0.06);
  background: #fff;
  color: #6b5c4a;
  text-decoration: none;
  transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(44, 36, 24, 0.04);
}
.nav-tile:hover {
  border-color: rgba(160, 130, 40, 0.25);
  color: #3d3225;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(44, 36, 24, 0.08);
}

.nt-icon { font-size: 22px; color: #8b7355; }
.nt-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: #3d3225; }
.nt-desc { font-size: 9px; color: #a0937e; }

/* ===== FOOTER ===== */
.footer {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.footer-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  color: #a0937e;
  letter-spacing: 0.06em;
}

.lang-switcher {
  display: flex;
  gap: 4px;
}
.lang-btn {
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid rgba(44, 36, 24, 0.08);
  background: transparent;
  color: #a0937e;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.lang-btn:hover {
  color: #5a4a35;
  border-color: rgba(44, 36, 24, 0.2);
}
.lang-btn.active {
  color: #8b6f1e;
  border-color: rgba(160, 130, 40, 0.35);
  background: rgba(200, 168, 78, 0.1);
}

/* ===== PLAYER BAR ===== */
.player-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(44, 36, 24, 0.08);
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(44, 36, 24, 0.04);
}
.player-bar:hover {
  border-color: rgba(160, 130, 40, 0.2);
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.08);
}

.pb-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid rgba(160, 130, 40, 0.3);
  background: rgba(200, 168, 78, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pb-icon { font-size: 20px; color: #9a7a2e; }

.pb-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pb-name {
  font-size: 14px;
  font-weight: 600;
  color: #2c2418;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb-level-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pb-level {
  font-size: 10px;
  font-weight: 700;
  color: #9a7a2e;
  flex-shrink: 0;
}
.pb-xp-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(44, 36, 24, 0.06);
  overflow: hidden;
}
.pb-xp-fill {
  height: 100%;
  background: linear-gradient(90deg, #c8a84e, #c47030);
  border-radius: 2px;
  transition: width 0.5s ease;
}
.pb-xp-text {
  font-size: 9px;
  color: #a0937e;
  flex-shrink: 0;
}

.pb-login-hint {
  font-size: 10px;
  color: #a0937e;
  font-style: italic;
}
.pb-chev {
  font-size: 16px;
  color: #a0937e;
  flex-shrink: 0;
}

/* ===== PROFILE PANEL ===== */
.profile-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 16px;
  background: #fff;
  border: 1px solid rgba(44, 36, 24, 0.08);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(44, 36, 24, 0.05);
}

.pp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pp-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8b7a65;
}

.pp-input {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(44, 36, 24, 0.12);
  background: #faf7f2;
  color: #2c2418;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.pp-input::placeholder { color: #bfb49a; }
.pp-input:focus { border-color: rgba(160, 130, 40, 0.4); }

.pp-icons {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}
.pp-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid rgba(44, 36, 24, 0.06);
  background: #faf7f2;
  color: #8b7a65;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s;
}
.pp-icon-btn:hover { background: rgba(200, 168, 78, 0.1); color: #9a7a2e; }
.pp-icon-btn.active {
  border-color: rgba(160, 130, 40, 0.4);
  background: rgba(200, 168, 78, 0.12);
  color: #9a7a2e;
}

.pp-error {
  font-size: 11px;
  color: #cc4444;
  text-align: center;
}

.pp-save {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid rgba(160, 130, 40, 0.3);
  background: linear-gradient(135deg, rgba(200, 168, 78, 0.15), rgba(200, 168, 78, 0.08));
  color: #8b6f1e;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.pp-save:hover {
  background: linear-gradient(135deg, rgba(200, 168, 78, 0.25), rgba(200, 168, 78, 0.15));
  border-color: rgba(160, 130, 40, 0.5);
}
.pp-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pp-logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(44, 36, 24, 0.08);
  background: transparent;
  color: #a0937e;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.pp-logout:hover {
  color: #b04030;
  border-color: rgba(180, 60, 40, 0.2);
}

.spin { animation: spin 1s linear infinite; }

/* ===== MOBILE ===== */
@media (max-width: 480px) {
  .menu-content { gap: 16px; padding: 24px 16px 40px; }
  .title { font-size: 38px; letter-spacing: 0.2em; }
  .emblem { width: 64px; height: 64px; }
  .emblem-symbol { font-size: 30px; }
  .orn-row { width: 160px; }
  .mode-card { padding: 12px 14px; }
  .mode-name { font-size: 15px; }
  .mode-gold .mode-icon { font-size: 26px; }
  .mode-slava .mode-icon { font-size: 24px; }
  .modes-pair { gap: 8px; }
  .modes-pair .mode-card { padding: 12px 8px; }
  .modes-pair .mode-name { font-size: 14px; }
  .nav-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
