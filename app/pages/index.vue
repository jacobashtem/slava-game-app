<script setup lang="ts">
definePageMeta({ ssr: false })
import { ref, onMounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import { useSlavaApi } from '../../composables/useSlavaApi'
import type { AIDifficulty } from '../../game-engine/AIPlayer'

import { Domain, DOMAIN_NAMES, DOMAIN_COLORS } from '../../game-engine/constants'

/** Total XP required to reach a given level. */
function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
}

const game = useGameStore()
const api = useSlavaApi()

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

const displayName = computed(() => api.currentPlayer.value?.displayName || game.playerName || 'Wojownik')
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
    loginError.value = 'Imię musi mieć min. 2 znaki.'
    return
  }
  loginLoading.value = true
  loginError.value = null
  try {
    await api.login(name, profileIcon.value)
    game.setPlayerProfile(name, profileIcon.value)
    showProfile.value = false
  } catch (e: any) {
    loginError.value = e.message || 'Nie udało się zalogować.'
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

const domains = [
  { id: Domain.PERUN, name: DOMAIN_NAMES[Domain.PERUN], color: DOMAIN_COLORS[Domain.PERUN], icon: 'game-icons:lightning-storm', desc: 'Wojownicy bogów' },
  { id: Domain.ZYVI, name: DOMAIN_NAMES[Domain.ZYVI], color: DOMAIN_COLORS[Domain.ZYVI], icon: 'game-icons:oak-leaf', desc: 'Ludzie i natura' },
  { id: Domain.UNDEAD, name: DOMAIN_NAMES[Domain.UNDEAD], color: DOMAIN_COLORS[Domain.UNDEAD], icon: 'game-icons:skull-crossed-bones', desc: 'Upiory i duchy' },
  { id: Domain.WELES, name: DOMAIN_NAMES[Domain.WELES], color: DOMAIN_COLORS[Domain.WELES], icon: 'game-icons:fire-dash', desc: 'Demony zaświatów' },
]

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
              <span class="pb-level">Poz. {{ playerLevel }}</span>
              <div class="pb-xp-bar">
                <div class="pb-xp-fill" :style="{ width: xpProgress + '%' }" />
              </div>
              <span class="pb-xp-text">{{ playerXp }} XP</span>
            </div>
            <span v-else class="pb-login-hint">Kliknij aby się zalogować</span>
          </div>
          <Icon :icon="showProfile ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="pb-chev" />
        </div>

        <!-- PROFILE EDITOR (collapsible) -->
        <Transition name="panel-slide">
          <div v-if="showProfile" class="profile-panel">
            <div class="pp-field">
              <label class="pp-label">Imię wojownika</label>
              <input
                v-model="profileName"
                class="pp-input"
                type="text"
                maxlength="20"
                placeholder="Twoje imię..."
                @keyup.enter="saveProfile"
              />
            </div>
            <div class="pp-field">
              <label class="pp-label">Herb</label>
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
              {{ api.isAuthenticated.value ? 'Zapisz profil' : 'Zaloguj się' }}
            </button>
            <button v-if="api.isAuthenticated.value" class="pp-logout" @click="api.logout(); showProfile = false">
              <Icon icon="mdi:logout" />
              Wyloguj
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
          <p class="subtitle">Vol. 2 — Złota Edycja</p>
          <p class="tagline">Słowiańska gra karciana</p>

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
              <span class="mode-name">Złota Edycja</span>
              <span class="mode-desc">Zbalansowane karty, dopracowane efekty</span>
            </div>
            <div class="mode-badge">REKOMENDOWANE</div>
          </button>

          <!-- SLAVA + TUTORIAL side by side -->
          <div class="modes-pair">
            <button class="mode-card mode-slava" @click="startSlavaMode">
              <div class="mode-glow mode-glow-red" />
              <Icon icon="game-icons:sword-clash" class="mode-icon" />
              <div class="mode-text">
                <span class="mode-name">Sława!</span>
                <span class="mode-desc">Panteon Bogów</span>
              </div>
            </button>

            <NuxtLink to="/tutorial" class="mode-card mode-tutorial">
              <Icon icon="game-icons:hooded-figure" class="mode-icon" />
              <div class="mode-text">
                <span class="mode-name">Samouczek</span>
                <span class="mode-desc">Naucz się grać</span>
              </div>
            </NuxtLink>
          </div>

          <!-- CAMPAIGN -->
          <NuxtLink to="/scenario" class="mode-card mode-campaign">
            <div class="mode-glow mode-glow-campaign" />
            <Icon icon="game-icons:campfire" class="mode-icon" />
            <div class="mode-text">
              <span class="mode-name">Kampania: Noc Kupały</span>
              <span class="mode-desc">7 encounterów, fabuła, prebuilt deck — tryb fabularny</span>
            </div>
            <div class="mode-badge">NOWOŚĆ</div>
          </NuxtLink>
        </div>

        <!-- SETTINGS (collapsible) -->
        <button class="settings-toggle" @click="showSettings = !showSettings">
          <Icon icon="game-icons:battle-gear" class="st-icon" />
          <span>Ustawienia bitwy</span>
          <Icon :icon="showSettings ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="st-chev" />
        </button>

        <Transition name="panel-slide">
          <div v-if="showSettings" class="settings-panel">
            <!-- Difficulty -->
            <div class="sg">
              <label class="sg-label">
                <Icon icon="game-icons:brain" />
                Trudność AI
              </label>
              <div class="sg-btns sg-btns--4">
                <button v-for="d in [
                  { val: 'novice', label: 'Nowicjusz', icon: 'game-icons:feather' },
                  { val: 'warrior', label: 'Wojownik', icon: 'game-icons:shield-echoes' },
                  { val: 'veteran', label: 'Weteran', icon: 'game-icons:skull-crack' },
                  { val: 'legend', label: 'Legenda', icon: 'game-icons:crown' },
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
                Twoja domena <span class="sg-hint">(brak = losowa)</span>
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
            <span class="nt-label">Multiplayer</span>
            <span class="nt-desc">Graj z ludźmi</span>
          </NuxtLink>
          <NuxtLink to="/arena" class="nav-tile">
            <Icon icon="game-icons:card-joker" class="nt-icon" />
            <span class="nt-label">Arena</span>
            <span class="nt-desc">Testuj karty</span>
          </NuxtLink>
          <NuxtLink to="/vfx-arena" class="nav-tile">
            <Icon icon="game-icons:battle-axe" class="nt-icon" />
            <span class="nt-label">VFX Arena</span>
            <span class="nt-desc">Testuj efekty</span>
          </NuxtLink>
          <NuxtLink to="/showcase" class="nav-tile">
            <Icon icon="game-icons:sparkles" class="nt-icon" />
            <span class="nt-label">Efekty</span>
            <span class="nt-desc">Pokaz VFX/SFX</span>
          </NuxtLink>
          <NuxtLink to="/ranking" class="nav-tile">
            <Icon icon="game-icons:laurel-crown" class="nt-icon" />
            <span class="nt-label">Ranking</span>
            <span class="nt-desc">Najlepsi wojownicy</span>
          </NuxtLink>
          <NuxtLink to="/gallery" class="nav-tile">
            <Icon icon="game-icons:card-pickup" class="nt-icon" />
            <span class="nt-label">Kolekcja</span>
            <span class="nt-desc">182 karty</span>
          </NuxtLink>
          <NuxtLink to="/bestiary" class="nav-tile">
            <Icon icon="game-icons:creature-mask" class="nt-icon" />
            <span class="nt-label">Bestiariusz</span>
            <span class="nt-desc">Kodeks bestii</span>
          </NuxtLink>
          <NuxtLink to="/rules" class="nav-tile">
            <Icon icon="game-icons:book-cover" class="nt-icon" />
            <span class="nt-label">Zasady</span>
            <span class="nt-desc">Jak grać?</span>
          </NuxtLink>
        </div>

        <!-- FOOTER -->
        <div class="footer">
          <div class="footer-badge">
            <Icon icon="game-icons:two-coins" />
            Złota Edycja — 182 kart — 4 domeny
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
  background: #04030a;
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
    radial-gradient(ellipse 100% 70% at 50% 100%, rgba(120, 40, 15, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(60, 20, 80, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse 60% 80% at 80% 40%, rgba(40, 15, 10, 0.1) 0%, transparent 50%);
}

.bg-fire-glow {
  position: absolute;
  bottom: -20%;
  left: 30%;
  width: 40%;
  height: 40%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 80, 20, 0.06) 0%, transparent 70%);
  animation: fire-breathe 6s ease-in-out infinite;
}

@keyframes fire-breathe {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

.bg-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.7) 100%);
}

/* Rising embers */
.ember {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  background: rgba(200, 100, 30, 0.6);
  animation: ember-rise linear infinite;
  will-change: transform;
}

@keyframes ember-rise {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  5%   { opacity: 0.8; }
  50%  { transform: translateY(calc(-50vh)) translateX(10px); opacity: 0.5; }
  80%  { opacity: 0.2; }
  100% { transform: translateY(calc(-100vh - 20px)) translateX(-5px); opacity: 0; }
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
  color: #ddd6c1;
  margin: 0;
  text-shadow:
    0 0 40px rgba(200, 100, 30, 0.25),
    0 0 80px rgba(200, 80, 20, 0.1),
    0 2px 12px rgba(0, 0, 0, 0.8);
}

.subtitle {
  font-size: 12px;
  color: rgba(200, 168, 78, 0.6);
  letter-spacing: 0.18em;
  margin: 2px 0 0;
  text-transform: uppercase;
  font-weight: 700;
}

.tagline {
  font-size: 11px;
  color: rgba(148, 130, 100, 0.4);
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
  background: linear-gradient(135deg, rgba(200, 168, 78, 0.08) 0%, rgba(120, 60, 20, 0.1) 100%);
  border-color: rgba(200, 168, 78, 0.25);
  color: #e2e8f0;
}
.mode-gold:hover {
  border-color: rgba(200, 168, 78, 0.5);
}
.mode-gold .mode-glow {
  background: radial-gradient(ellipse at 20% 50%, rgba(200, 168, 78, 0.06), transparent 60%);
  animation: btn-glow-pulse 3s ease-in-out infinite;
}
.mode-gold .mode-icon {
  font-size: 32px;
  color: #c8a84e;
  z-index: 1;
  flex-shrink: 0;
}

/* Slava! */
.mode-slava {
  background: linear-gradient(135deg, rgba(180, 40, 20, 0.08) 0%, rgba(80, 20, 10, 0.1) 100%);
  border-color: rgba(180, 60, 30, 0.2);
  color: #e2e8f0;
}
.mode-slava:hover {
  border-color: rgba(200, 80, 40, 0.45);
}
.mode-slava .mode-glow-red {
  background: radial-gradient(ellipse at 20% 50%, rgba(180, 50, 20, 0.05), transparent 60%);
}
.mode-slava .mode-icon {
  font-size: 28px;
  color: #c45030;
  z-index: 1;
  flex-shrink: 0;
}

.mode-tutorial {
  background: linear-gradient(135deg, rgba(100, 160, 120, 0.06) 0%, rgba(40, 80, 60, 0.08) 100%);
  border: 1px solid rgba(100, 160, 120, 0.15);
  text-decoration: none;
  color: #e2e8f0;
}
.mode-tutorial:hover {
  border-color: rgba(120, 180, 140, 0.35);
  background: linear-gradient(135deg, rgba(100, 160, 120, 0.1) 0%, rgba(40, 80, 60, 0.12) 100%);
}
.mode-tutorial .mode-icon {
  font-size: 26px;
  color: rgba(140, 200, 160, 0.7);
  filter: drop-shadow(0 0 6px rgba(100, 160, 120, 0.3));
}

/* Campaign */
.mode-campaign {
  background: linear-gradient(135deg, rgba(200, 120, 40, 0.08) 0%, rgba(160, 80, 20, 0.1) 100%);
  border: 1px solid rgba(200, 120, 40, 0.2);
  text-decoration: none;
  color: #e2e8f0;
}
.mode-campaign:hover {
  border-color: rgba(200, 120, 40, 0.45);
}
.mode-campaign .mode-glow-campaign {
  background: radial-gradient(ellipse at 20% 50%, rgba(200, 120, 40, 0.06), transparent 60%);
  animation: btn-glow-pulse 3s ease-in-out infinite;
}
.mode-campaign .mode-icon {
  font-size: 30px;
  color: #d4843a;
  z-index: 1;
  flex-shrink: 0;
  filter: drop-shadow(0 0 8px rgba(200, 100, 30, 0.3));
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
  color: rgba(148, 163, 184, 0.6);
  line-height: 1.3;
}

.mode-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: rgba(200, 168, 78, 0.6);
  background: rgba(200, 168, 78, 0.08);
  border: 1px solid rgba(200, 168, 78, 0.15);
  padding: 1px 6px;
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
  border: 1px solid rgba(200, 168, 78, 0.08);
  background: rgba(200, 168, 78, 0.02);
  color: rgba(148, 130, 100, 0.5);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.settings-toggle:hover { background: rgba(200, 168, 78, 0.05); color: rgba(200, 168, 78, 0.8); border-color: rgba(200, 168, 78, 0.15); }
.st-icon { font-size: 14px; }
.st-chev { margin-left: auto; font-size: 16px; opacity: 0.4; }

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
  background: rgba(14, 10, 20, 0.6);
  border: 1px solid rgba(200, 168, 78, 0.08);
  border-radius: 10px;
}

.sg { display: flex; flex-direction: column; gap: 7px; }
.sg-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
  text-transform: uppercase; color: rgba(148, 130, 100, 0.5);
}
.sg-hint { font-weight: 400; font-style: italic; text-transform: none; letter-spacing: 0; opacity: 0.6; }

.sg-btns { display: flex; gap: 5px; }
.sg-btns--4 { flex-wrap: wrap; }
.sg-btns--4 .sg-btn { flex: 1 1 calc(50% - 3px); min-width: 0; }
.sg-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 7px 8px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
  color: #475569; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
.sg-btn.active {
  border-color: rgba(200, 168, 78, 0.3);
  color: #c8a84e;
  background: rgba(200, 168, 78, 0.06);
}
.sg-btn:hover:not(.active) { background: rgba(255, 255, 255, 0.03); }

.domain-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.dom-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 6px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
  color: #475569; cursor: pointer; transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  text-align: center;
}
.dom-btn.active {
  border-color: color-mix(in srgb, var(--dc) 40%, transparent);
  background: color-mix(in srgb, var(--dc) 6%, transparent);
}
.dom-btn.active .dom-icon { color: var(--dc); }
.dom-btn.active .dom-name { color: var(--dc); }
.dom-btn:hover:not(.active) { background: rgba(255, 255, 255, 0.03); }
.dom-icon { font-size: 18px; transition: color 0.15s; }
.dom-name { font-size: 11px; font-weight: 700; color: #64748b; }
.dom-desc { font-size: 8px; color: #334155; }

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
  border: 1px solid rgba(200, 168, 78, 0.06);
  background: rgba(200, 168, 78, 0.02);
  color: rgba(148, 130, 100, 0.5);
  text-decoration: none;
  transition: all 0.2s;
}
.nav-tile:hover {
  background: rgba(200, 168, 78, 0.06);
  border-color: rgba(200, 168, 78, 0.2);
  color: rgba(200, 168, 78, 0.9);
  transform: translateY(-1px);
}

.nt-icon { font-size: 22px; }
.nt-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
.nt-desc { font-size: 9px; opacity: 0.5; }

/* ===== FOOTER ===== */
.footer {
  margin-top: 4px;
  display: flex;
  justify-content: center;
}

.footer-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  color: rgba(148, 130, 100, 0.3);
  letter-spacing: 0.06em;
}

/* ===== PLAYER BAR ===== */
.player-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(200, 168, 78, 0.12);
  background: rgba(200, 168, 78, 0.03);
  cursor: pointer;
  transition: all 0.2s;
}
.player-bar:hover {
  background: rgba(200, 168, 78, 0.06);
  border-color: rgba(200, 168, 78, 0.25);
}

.pb-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid rgba(200, 168, 78, 0.3);
  background: rgba(200, 168, 78, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pb-icon { font-size: 20px; color: #c8a84e; }

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
  color: #ddd6c1;
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
  color: rgba(200, 168, 78, 0.7);
  flex-shrink: 0;
}
.pb-xp-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(200, 168, 78, 0.08);
  overflow: hidden;
}
.pb-xp-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.5), rgba(200, 100, 30, 0.6));
  border-radius: 2px;
  transition: width 0.5s ease;
}
.pb-xp-text {
  font-size: 9px;
  color: rgba(148, 130, 100, 0.4);
  flex-shrink: 0;
}

.pb-login-hint {
  font-size: 10px;
  color: rgba(148, 130, 100, 0.4);
  font-style: italic;
}
.pb-chev {
  font-size: 16px;
  color: rgba(148, 130, 100, 0.3);
  flex-shrink: 0;
}

/* ===== PROFILE PANEL ===== */
.profile-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 16px;
  background: rgba(14, 10, 20, 0.7);
  border: 1px solid rgba(200, 168, 78, 0.1);
  border-radius: 10px;
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
  color: rgba(148, 130, 100, 0.5);
}

.pp-input {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.15);
  background: rgba(200, 168, 78, 0.04);
  color: #ddd6c1;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.pp-input::placeholder { color: rgba(148, 130, 100, 0.3); }
.pp-input:focus { border-color: rgba(200, 168, 78, 0.4); }

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
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
  color: #475569;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s;
}
.pp-icon-btn:hover { background: rgba(200, 168, 78, 0.06); color: rgba(200, 168, 78, 0.7); }
.pp-icon-btn.active {
  border-color: rgba(200, 168, 78, 0.4);
  background: rgba(200, 168, 78, 0.08);
  color: #c8a84e;
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
  border: 1px solid rgba(200, 168, 78, 0.3);
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.15), rgba(200, 168, 78, 0.08));
  color: rgba(200, 168, 78, 0.9);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.pp-save:hover {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.25), rgba(200, 168, 78, 0.12));
  border-color: rgba(200, 168, 78, 0.5);
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
  border: 1px solid rgba(100, 80, 60, 0.1);
  background: transparent;
  color: rgba(148, 130, 100, 0.3);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.pp-logout:hover {
  color: rgba(200, 100, 80, 0.7);
  border-color: rgba(200, 100, 80, 0.2);
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
