<script setup lang="ts">
import { ref } from 'vue'
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
  if (idx >= 0) {
    selectedDomains.value.splice(idx, 1)
  } else {
    selectedDomains.value.push(domain)
  }
}

// ===== MUZYKA =====
const songModules = import.meta.glob('../../assets/songs/*.mp3', { eager: true, query: '?url', import: 'default' })
const songUrls = Object.values(songModules) as string[]

let _bgAudio: HTMLAudioElement | null = null
let _currentSongIdx = -1

function playNextSong() {
  if (songUrls.length === 0) return
  _currentSongIdx = (_currentSongIdx + 1) % songUrls.length
  const url = songUrls[_currentSongIdx]
  if (_bgAudio) { _bgAudio.pause(); _bgAudio = null }
  _bgAudio = new Audio(url)
  _bgAudio.volume = 0.4
  _bgAudio.addEventListener('ended', playNextSong)
  _bgAudio.play().catch(() => {})
}

function playRandomSong() {
  if (songUrls.length === 0) return
  _currentSongIdx = Math.floor(Math.random() * songUrls.length) - 1
  playNextSong()
}

function startNewGame() {
  game.setDifficulty(difficulty.value)
  game.setDomains(selectedDomains.value)
  playRandomSong()
  game.startGame()
  navigateTo('/game')
}

function startAlphaGame() {
  game.setDifficulty(difficulty.value)
  game.setDomains(selectedDomains.value)
  playRandomSong()
  game.startAlphaGame()
  navigateTo('/game')
}

const domains = [
  { id: Domain.PERUN, name: DOMAIN_NAMES[Domain.PERUN], color: DOMAIN_COLORS[Domain.PERUN], icon: 'game-icons:lightning-storm' },
  { id: Domain.ZYVI, name: DOMAIN_NAMES[Domain.ZYVI], color: DOMAIN_COLORS[Domain.ZYVI], icon: 'game-icons:oak-leaf' },
  { id: Domain.UNDEAD, name: DOMAIN_NAMES[Domain.UNDEAD], color: DOMAIN_COLORS[Domain.UNDEAD], icon: 'game-icons:skull-crossed-bones' },
  { id: Domain.WELES, name: DOMAIN_NAMES[Domain.WELES], color: DOMAIN_COLORS[Domain.WELES], icon: 'game-icons:fire-dash' },
]
</script>

<template>
  <div class="main-menu">
    <div class="menu-bg" />

    <div class="menu-content">
      <div class="logo-section">
        <div class="logo-emblem">
          <Icon icon="game-icons:triquetra" class="emblem-icon" />
        </div>
        <h1 class="game-title">SLAWA</h1>
        <p class="game-subtitle">Vol. 2 — Zlota Edycja</p>
        <p class="game-tagline">Slowianska gra karciana</p>
      </div>

      <!-- USTAWIENIA -->
      <div class="settings-section">
        <!-- Trudnosc AI -->
        <div class="setting-group">
          <label class="setting-label">Trudnosc AI</label>
          <div class="toggle-group">
            <button
              :class="['toggle-btn', { active: difficulty === 'easy' }]"
              @click="difficulty = 'easy'"
            >Latwa</button>
            <button
              :class="['toggle-btn', { active: difficulty === 'medium' }]"
              @click="difficulty = 'medium'"
            >Srednia</button>
          </div>
        </div>

        <!-- Domena gracza -->
        <div class="setting-group">
          <label class="setting-label">Twoja domena <span class="hint">(brak = losowa)</span></label>
          <div class="domain-picks">
            <button
              v-for="d in domains" :key="d.id"
              :class="['domain-btn', { active: selectedDomains.includes(d.id) }]"
              :style="selectedDomains.includes(d.id) ? `border-color: ${d.color}; color: ${d.color}; background: ${d.color}18` : ''"
              @click="toggleDomain(d.id)"
            >
              <Icon :icon="d.icon" class="domain-icon" />
              {{ d.name }}
            </button>
          </div>
        </div>
      </div>

      <div class="menu-buttons">
        <button class="menu-btn primary" @click="startNewGame">
          <Icon icon="game-icons:sword-clash" class="btn-icon" />
          Nowa Gra
          <span class="game-mode-badge">wszystkie karty</span>
        </button>

        <button class="menu-btn alpha" @click="startAlphaGame">
          <Icon icon="game-icons:shield-echoes" class="btn-icon" />
          Alpha Gra
          <span class="game-mode-badge">tylko sprawdzone karty</span>
        </button>

        <NuxtLink to="/arena" class="menu-btn arena">
          <Icon icon="game-icons:card-joker" class="btn-icon" />
          Arena — Testuj karty
        </NuxtLink>

        <NuxtLink to="/gallery" class="menu-btn gallery">
          <Icon icon="game-icons:card-pickup" class="btn-icon" />
          Kolekcja kart
          <span class="game-mode-badge">182 karty</span>
        </NuxtLink>

        <NuxtLink to="/rules" class="menu-btn secondary">
          <Icon icon="game-icons:book-cover" class="btn-icon" />
          Jak grac?
        </NuxtLink>
      </div>

      <div class="edition-info">
        <div class="edition-badge">Zlota Edycja</div>
        <div class="edition-rules">
          <span>5 startowych kart</span>
          <span>&middot;</span>
          <span>5 ZL na start</span>
          <span>&middot;</span>
          <span>Talia 30 kart</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-menu {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bg-board);
}

.menu-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 50%, rgba(79, 70, 229, 0.12) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 50%, rgba(124, 58, 237, 0.10) 0%, transparent 60%);
  pointer-events: none;
}

.menu-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  z-index: 1;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.logo-emblem {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e1b4b, #312e81);
  border: 2px solid rgba(139, 92, 246, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  box-shadow: 0 0 32px rgba(139, 92, 246, 0.25);
}

.emblem-icon {
  font-size: 40px;
  color: #a78bfa;
}

.game-title {
  font-size: 52px;
  font-weight: 900;
  letter-spacing: 0.25em;
  color: #e2e8f0;
  margin: 0;
  text-shadow: 0 0 24px rgba(139, 92, 246, 0.4);
}

.game-subtitle {
  font-size: 16px;
  color: #a78bfa;
  letter-spacing: 0.15em;
  margin: 0;
  text-transform: uppercase;
}

.game-tagline {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  font-style: italic;
  letter-spacing: 0.05em;
}

/* ===== SETTINGS ===== */

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 340px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.hint {
  font-weight: 400;
  font-style: italic;
  text-transform: none;
  letter-spacing: 0;
}

.toggle-group {
  display: flex;
  gap: 6px;
}

.toggle-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: rgba(255,255,255,0.03);
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn.active {
  border-color: #6366f1;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.12);
}

.toggle-btn:hover:not(.active) {
  border-color: #475569;
  background: rgba(255,255,255,0.05);
}

.domain-picks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.domain-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: rgba(255,255,255,0.03);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.domain-btn:hover:not(.active) {
  border-color: #475569;
  background: rgba(255,255,255,0.05);
}

.domain-icon { font-size: 16px; }

/* ===== BUTTONS ===== */

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
  width: 340px;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 32px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s;
  border: none;
  letter-spacing: 0.05em;
  text-decoration: none;
}

.menu-btn.primary {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
}

.menu-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.5);
}

.game-mode-badge {
  font-size: 9px;
  font-weight: 400;
  opacity: 0.7;
  margin-left: 4px;
  font-style: italic;
}

.menu-btn.alpha {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.3);
}
.menu-btn.alpha:hover {
  transform: translateY(-2px);
  background: rgba(251, 191, 36, 0.18);
  box-shadow: 0 6px 20px rgba(251, 191, 36, 0.2);
}

.menu-btn.arena {
  background: rgba(52, 211, 153, 0.1);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
}
.menu-btn.arena:hover {
  transform: translateY(-2px);
  background: rgba(52, 211, 153, 0.18);
  box-shadow: 0 6px 20px rgba(52, 211, 153, 0.2);
}

.menu-btn.gallery {
  background: rgba(168, 85, 247, 0.1);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}
.menu-btn.gallery:hover {
  transform: translateY(-2px);
  background: rgba(168, 85, 247, 0.18);
  box-shadow: 0 6px 20px rgba(168, 85, 247, 0.2);
}

.menu-btn.secondary {
  background: rgba(255,255,255,0.05);
  color: #94a3b8;
  border: 1px solid #334155;
}
.menu-btn.secondary:hover {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.08);
  border-color: #475569;
}

.btn-icon { font-size: 18px; }

.edition-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.edition-badge {
  font-size: 11px;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.25);
  padding: 3px 12px;
  border-radius: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
}

.edition-rules {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
  align-items: center;
}
</style>
