<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

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
  playRandomSong()
  game.startGame()
  navigateTo('/game')
}

function startAlphaGame() {
  playRandomSong()
  game.startAlphaGame()
  navigateTo('/game')
}
</script>

<template>
  <div class="main-menu">
    <div class="menu-bg" />

    <div class="menu-content">
      <div class="logo-section">
        <div class="logo-emblem">
          <Icon icon="game-icons:triquetra" class="emblem-icon" />
        </div>
        <h1 class="game-title">SŁAWA</h1>
        <p class="game-subtitle">Vol. 2 — Złota Edycja</p>
        <p class="game-tagline">Słowiańska gra karciana</p>
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

        <button class="menu-btn secondary" disabled>
          <Icon icon="game-icons:book-cover" class="btn-icon" />
          Jak grać? <span class="soon-badge">wkrótce</span>
        </button>
      </div>

      <div class="edition-info">
        <div class="edition-badge">Złota Edycja</div>
        <div class="edition-rules">
          <span>5 startowych kart</span>
          <span>·</span>
          <span>5 ZŁ na start</span>
          <span>·</span>
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
  gap: 36px;
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

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
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
  text-decoration: none;
}
.menu-btn.arena:hover {
  transform: translateY(-2px);
  background: rgba(52, 211, 153, 0.18);
  box-shadow: 0 6px 20px rgba(52, 211, 153, 0.2);
}

.menu-btn.secondary {
  background: rgba(255,255,255,0.05);
  color: #64748b;
  border: 1px solid #334155;
  cursor: not-allowed;
}

.btn-icon { font-size: 18px; }

.soon-badge {
  font-size: 9px;
  background: #334155;
  color: #64748b;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

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
