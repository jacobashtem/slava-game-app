<script setup lang="ts">
definePageMeta({ ssr: false })
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'
import type { AIDifficulty } from '../../game-engine/AIPlayer'
import { Domain, DOMAIN_NAMES, DOMAIN_COLORS } from '../../game-engine/constants'

const game = useGameStore()

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

// ===== ATMOSPHERIC PARTICLES =====
const embers = ref<{ x: number; delay: number; dur: number; size: number }[]>([])
onMounted(() => {
  embers.value = Array.from({ length: 24 }, () => ({
    x: Math.random() * 100,
    delay: Math.random() * 15,
    dur: 10 + Math.random() * 12,
    size: 2 + Math.random() * 3,
  }))
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

        <!-- TWO GAME MODES -->
        <div class="modes-row">
          <!-- GOLD EDITION -->
          <button class="mode-card mode-gold" @click="startGoldEdition">
            <div class="mode-glow" />
            <Icon icon="game-icons:crown-coin" class="mode-icon" />
            <div class="mode-text">
              <span class="mode-name">Złota Edycja</span>
              <span class="mode-desc">Zbalansowane karty, dopracowane efekty</span>
            </div>
            <div class="mode-badge">REKOMENDOWANE</div>
          </button>

          <!-- SLAVA! -->
          <button class="mode-card mode-slava" @click="startSlavaMode">
            <div class="mode-glow mode-glow-red" />
            <Icon icon="game-icons:sword-clash" class="mode-icon" />
            <div class="mode-text">
              <span class="mode-name">Sława!</span>
              <span class="mode-desc">Punkty Sławy, Panteon Bogów, Święta</span>
            </div>
          </button>
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
              <div class="sg-btns">
                <button v-for="d in [
                  { val: 'easy', label: 'Łatwa', icon: 'game-icons:feather' },
                  { val: 'medium', label: 'Średnia', icon: 'game-icons:shield-echoes' },
                  { val: 'hard', label: 'Trudna', icon: 'game-icons:skull-crack' },
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
            <Icon icon="game-icons:crossed-swords" class="nt-icon" />
            <span class="nt-label">VFX Arena</span>
            <span class="nt-desc">Testuj efekty</span>
          </NuxtLink>
          <NuxtLink to="/showcase" class="nav-tile">
            <Icon icon="game-icons:sparkles" class="nt-icon" />
            <span class="nt-label">Efekty</span>
            <span class="nt-desc">Pokaz VFX/SFX</span>
          </NuxtLink>
          <NuxtLink to="/gallery" class="nav-tile">
            <Icon icon="game-icons:card-pickup" class="nt-icon" />
            <span class="nt-label">Kolekcja</span>
            <span class="nt-desc">182 karty</span>
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
.modes-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

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
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.settings-toggle:hover { background: rgba(255, 255, 255, 0.03); color: #94a3b8; }
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
  padding: 14px;
  background: rgba(10, 8, 16, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}

.sg { display: flex; flex-direction: column; gap: 7px; }
.sg-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
  text-transform: uppercase; color: rgba(148, 130, 100, 0.5);
}
.sg-hint { font-weight: 400; font-style: italic; text-transform: none; letter-spacing: 0; opacity: 0.6; }

.sg-btns { display: flex; gap: 5px; }
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
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  width: 100%;
}

.nav-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  background: rgba(255, 255, 255, 0.01);
  color: #475569;
  text-decoration: none;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
.nav-tile:hover {
  background: rgba(200, 168, 78, 0.04);
  border-color: rgba(200, 168, 78, 0.12);
  color: #c8a84e;
}

.nt-icon { font-size: 20px; }
.nt-label { font-size: 10px; font-weight: 700; letter-spacing: 0.03em; }
.nt-desc { font-size: 8px; opacity: 0.5; }

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
  .nav-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
