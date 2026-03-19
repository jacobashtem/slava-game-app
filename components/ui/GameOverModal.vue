<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from '#imports'
import gsap from 'gsap'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useScenarioStore } from '../../stores/scenarioStore'
import { useSlavaApi, type MatchReportResult } from '../../composables/useSlavaApi'

const { t } = useI18n()
const game = useGameStore()
const scenarioStore = useScenarioStore()
const ui = useUIStore()
const arena = useArenaStore()
const api = useSlavaApi()

// Post-game report result
const matchReport = ref<MatchReportResult | null>(null)
const reportError = ref(false)

const isWin = computed(() => game.winner === game.mySide)

const stats = computed(() => {
  if (!game.state) return null
  const p = game.state.players.player1
  const a = game.state.players.player2
  return {
    round: game.roundNumber,
    season: game.season,
    playerKills: a.graveyard.length,
    aiKills: p.graveyard.length,
    playerGlory: p.glory,
    aiGlory: a.glory,
    playerDeck: p.deck.length,
    isSlava: game.state.gameMode === 'slava',
  }
})

function seasonLabel(key: string): string {
  return t(`seasons.${key}`, key)
}

// Narrative battle summary
const narrative = computed(() => {
  if (!stats.value) return ''
  const s = stats.value
  const w = isWin.value

  if (w && s.playerKills >= 6) return 'Rzeź na polu bitwy! Twoi wojownicy nie znali litości.'
  if (w && s.round <= 3) return 'Błyskawiczne zwycięstwo — wróg nie zdążył nawet dobyć miecza.'
  if (w && s.playerGlory > s.aiGlory + 5) return 'Twoja sława niesie się echem po wszystkich krainach!'
  if (w) return 'Bogowie uśmiechnęli się do ciebie. Chwała bohaterowi Słowian!'

  if (!w && s.aiKills <= 1) return 'Walczyłeś dzielnie, lecz los był nieprzychylny.'
  if (!w && s.round >= 8) return 'Długa, wyczerpująca bitwa — lecz ostatnie słowo należało do wroga.'
  if (!w) return 'Nawiowie szepczą twoje imię. Ale to jeszcze nie koniec.'
  return ''
})

// GSAP refs
const modalBoxEl = ref<HTMLElement | null>(null)
const glowEl = ref<HTMLElement | null>(null)
const iconEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)
const particlesEl = ref<HTMLElement | null>(null)
const statsEl = ref<HTMLElement | null>(null)
const narrativeEl = ref<HTMLElement | null>(null)

watch(() => game.winner, (w) => {
  if (!w) return

  // Report match to backend (fire & forget, non-blocking)
  if (api.isAuthenticated.value && !game.isArenaMode) {
    const difficulty = game.selectedDifficulty
    const opponentType = game.isMultiplayerMode
      ? 'human' as const
      : `ai_${difficulty}` as 'ai_easy' | 'ai_medium' | 'ai_hard'

    api.reportMatch({
      opponentType,
      opponentName: game.isMultiplayerMode ? undefined : `AI (${difficulty})`,
      gameMode: game.gameMode ?? 'gold',
      result: isWin.value ? 'win' : 'loss',
      rounds: game.roundNumber,
      playerGlory: stats.value?.playerGlory,
      opponentGlory: stats.value?.aiGlory,
    }).then(result => {
      matchReport.value = result
    }).catch(() => {
      reportError.value = true
    })
  }

  nextTick(() => {
    const tl = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } })

    if (glowEl.value) {
      tl.fromTo(glowEl.value, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 0.35, duration: 1, ease: 'power2.out' }, 0)
    }
    if (modalBoxEl.value) {
      tl.fromTo(modalBoxEl.value, { scale: 0.85, y: 25, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5 }, 0.15)
    }
    if (iconEl.value) {
      tl.fromTo(iconEl.value, { scale: 0, rotation: -15, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.6 }, 0.35)
    }
    if (titleEl.value) {
      tl.fromTo(titleEl.value, { y: 12, opacity: 0, letterSpacing: '0.4em' }, { y: 0, opacity: 1, letterSpacing: '0.18em', duration: 0.5 }, 0.55)
    }
    if (narrativeEl.value) {
      tl.fromTo(narrativeEl.value, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.7)
    }
    if (statsEl.value) {
      tl.fromTo(statsEl.value, { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.8)
    }

    // Glow breathing
    if (glowEl.value) {
      gsap.to(glowEl.value, { scale: 1.08, opacity: 0.45, duration: 2.5, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.2 })
    }

    // Particles
    if (particlesEl.value) {
      spawnResultParticles(particlesEl.value, isWin.value)
    }
  })
})

function spawnResultParticles(container: HTMLElement, victory: boolean) {
  const count = victory ? 35 : 14
  const colors = victory
    ? ['#c8a84e', '#fbbf24', '#f59e0b', '#d4a843', '#e8c96a']
    : ['#1e1a14', '#2a231a', '#3d342a', '#4a3f33', '#5c4f40']

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const size = victory ? (2 + Math.random() * 4) : (3 + Math.random() * 6)
    el.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;width:${size}px;height:${size}px;left:50%;top:50%;`
    el.style.background = colors[Math.floor(Math.random() * colors.length)]!
    if (victory) el.style.boxShadow = `0 0 ${3 + Math.random() * 4}px ${el.style.background}`
    container.appendChild(el)

    if (victory) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
      const dist = 100 + Math.random() * 160
      gsap.fromTo(el,
        { x: 0, y: 0, opacity: 1, scale: 0.5 },
        {
          x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 30,
          opacity: 0, scale: 0.3,
          duration: 1.5 + Math.random() * 1,
          ease: 'power2.out',
          delay: 0.3 + Math.random() * 0.4,
          onComplete: () => el.remove(),
        }
      )
    } else {
      gsap.fromTo(el,
        { x: (Math.random() - 0.5) * 80, y: 15, opacity: 0.35, scale: 1 },
        {
          y: -60 - Math.random() * 50,
          x: `+=${(Math.random() - 0.5) * 30}`,
          opacity: 0, scale: 1.5 + Math.random(),
          duration: 2.5 + Math.random() * 2,
          ease: 'power1.out',
          delay: 0.5 + Math.random() * 1,
          onComplete: () => el.remove(),
        }
      )
    }
  }
}

onUnmounted(() => {
  if (glowEl.value) gsap.killTweensOf(glowEl.value)
  if (modalBoxEl.value) gsap.killTweensOf(modalBoxEl.value)
})

function restart() {
  ui.clearSelection()
  ui.showGameOver = false
  if (game.isArenaMode) {
    arena.reset()
  } else if (game.gameMode === 'slava') {
    game.startSlavaGame()
  } else {
    game.startAlphaGame()
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="game.winner && !scenarioStore.isScenarioMode" class="go-overlay">
      <!-- Radial glow -->
      <div ref="glowEl" :class="['go-glow', isWin ? 'go-glow-win' : 'go-glow-lose']" />

      <!-- Particles -->
      <div ref="particlesEl" class="go-particles" />

      <!-- Vignette -->
      <div class="go-vignette" />

      <div ref="modalBoxEl" :class="['go-box', isWin ? 'go-box-win' : 'go-box-lose']">
        <!-- Runic border SVG -->
        <svg class="go-border-svg" viewBox="0 0 340 460" preserveAspectRatio="none">
          <rect x="1" y="1" width="338" height="458" rx="12" fill="none"
            :stroke="isWin ? 'rgba(200,168,78,0.25)' : 'rgba(100,80,60,0.15)'" stroke-width="1.5"
            stroke-dasharray="8 4" class="go-border-dash" />
          <rect x="6" y="6" width="328" height="448" rx="10" fill="none"
            :stroke="isWin ? 'rgba(200,168,78,0.12)' : 'rgba(100,80,60,0.08)'" stroke-width="0.5" />
        </svg>

        <!-- Corner runes -->
        <span class="go-corner go-corner-tl">ᚱ</span>
        <span class="go-corner go-corner-tr">ᛊ</span>
        <span class="go-corner go-corner-bl">ᛝ</span>
        <span class="go-corner go-corner-br">ᚦ</span>

        <!-- Top ornament -->
        <svg viewBox="0 0 160 8" class="go-orn">
          <path d="M0 4 Q20 0 40 4 Q60 8 80 4 Q100 0 120 4 Q140 8 160 4" fill="none"
            :stroke="isWin ? 'rgba(200,168,78,0.3)' : 'rgba(100,80,60,0.15)'" stroke-width="1" />
        </svg>

        <!-- Icon -->
        <div ref="iconEl" :class="['go-icon', isWin ? 'go-icon-win' : 'go-icon-lose']">
          <Icon :icon="isWin ? 'game-icons:laurel-crown' : 'game-icons:skull-crossed-bones'" />
        </div>

        <!-- Title -->
        <h2 ref="titleEl" :class="['go-title', isWin ? 'go-title-win' : 'go-title-lose']">
          {{ isWin ? $t('gameOver.victory') : $t('gameOver.defeat') }}
        </h2>

        <!-- Narrative summary -->
        <p ref="narrativeEl" class="go-narrative">{{ narrative }}</p>

        <!-- Bottom ornament -->
        <svg viewBox="0 0 160 8" class="go-orn">
          <path d="M0 4 Q20 8 40 4 Q60 0 80 4 Q100 8 120 4 Q140 0 160 4" fill="none"
            :stroke="isWin ? 'rgba(200,168,78,0.2)' : 'rgba(100,80,60,0.1)'" stroke-width="1" />
        </svg>

        <!-- Stats as runic inscriptions -->
        <div v-if="stats" ref="statsEl" class="go-stats">
          <div class="go-stat">
            <span class="go-stat-rune">ᚱ</span>
            <span class="go-stat-label">Runda</span>
            <span class="go-stat-val">{{ stats.round }} · {{ seasonLabel[stats.season] ?? stats.season }}</span>
          </div>
          <div class="go-stat">
            <span class="go-stat-rune go-rune-kill">ᛏ</span>
            <span class="go-stat-label">Powaleni wrogowie</span>
            <span class="go-stat-val go-val-kill">{{ stats.playerKills }}</span>
          </div>
          <div class="go-stat">
            <span class="go-stat-rune go-rune-loss">ᛒ</span>
            <span class="go-stat-label">Straceni</span>
            <span class="go-stat-val go-val-loss">{{ stats.aiKills }}</span>
          </div>
          <div v-if="stats.isSlava" class="go-stat">
            <span class="go-stat-rune go-rune-glory">ᛊ</span>
            <span class="go-stat-label">Punkty Sławy</span>
            <span class="go-stat-val go-val-glory">{{ stats.playerGlory }} — {{ stats.aiGlory }}</span>
          </div>
          <div class="go-stat">
            <span class="go-stat-rune">ᚲ</span>
            <span class="go-stat-label">Karty w talii</span>
            <span class="go-stat-val">{{ stats.playerDeck }}</span>
          </div>
        </div>

        <!-- XP earned -->
        <div v-if="matchReport" class="go-xp">
          <div class="go-xp-row">
            <Icon icon="game-icons:upgrade" class="go-xp-icon" />
            <span>+{{ matchReport.xp.xpEarned }} XP</span>
          </div>
          <div v-if="matchReport.xp.leveledUp" class="go-level-up">
            <Icon icon="game-icons:laurels" />
            Poziom {{ matchReport.xp.newLevel }}!
          </div>
          <div v-for="ach in matchReport.achievements" :key="ach.id" class="go-achievement">
            <Icon icon="game-icons:achievement" />
            {{ ach.name }}
          </div>
        </div>

        <!-- Buttons -->
        <button :class="['go-btn-main', isWin ? 'go-btn-gold' : 'go-btn-ash']" @click="restart">
          <Icon icon="game-icons:crossed-swords" />
          {{ game.isArenaMode ? 'Resetuj Arenę' : 'Zagraj ponownie' }}
        </button>
        <NuxtLink to="/" class="go-btn-menu">
          <Icon icon="game-icons:exit-door" />
          Menu główne
        </NuxtLink>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.go-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 3, 10, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

/* Radial glow */
.go-glow {
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
}
.go-glow-win {
  background: radial-gradient(circle,
    rgba(200, 168, 78, 0.4) 0%,
    rgba(200, 100, 30, 0.15) 30%,
    transparent 60%
  );
}
.go-glow-lose {
  background: radial-gradient(circle,
    rgba(120, 40, 15, 0.3) 0%,
    rgba(60, 20, 10, 0.1) 30%,
    transparent 60%
  );
}

.go-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.5) 100%);
  pointer-events: none;
}

.go-particles {
  position: absolute;
  top: 50%; left: 50%;
  width: 0; height: 0;
  pointer-events: none;
  z-index: 201;
}

/* ===== MODAL BOX ===== */
.go-box {
  position: relative;
  padding: 32px 40px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 300px;
  max-width: 360px;
  z-index: 202;
}

.go-box-win {
  background:
    radial-gradient(ellipse at 50% 20%, rgba(200, 168, 78, 0.04) 0%, transparent 50%),
    linear-gradient(175deg, rgba(14, 12, 8, 0.97), rgba(8, 6, 4, 0.98));
}

.go-box-lose {
  background:
    radial-gradient(ellipse at 50% 80%, rgba(60, 20, 10, 0.04) 0%, transparent 50%),
    linear-gradient(175deg, rgba(10, 8, 6, 0.97), rgba(6, 4, 3, 0.98));
}

/* Runic border SVG */
.go-border-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.go-border-dash {
  stroke-dashoffset: 1600;
  animation: dash-draw 2.5s ease-out 0.3s forwards;
}

@keyframes dash-draw {
  to { stroke-dashoffset: 0; }
}

/* Corner runes */
.go-corner {
  position: absolute;
  font-size: 14px;
  color: rgba(200, 168, 78, 0.15);
  pointer-events: none;
  line-height: 1;
}
.go-corner-tl { top: 12px; left: 14px; }
.go-corner-tr { top: 12px; right: 14px; }
.go-corner-bl { bottom: 12px; left: 14px; }
.go-corner-br { bottom: 12px; right: 14px; }

.go-box-lose .go-corner { color: rgba(100, 60, 40, 0.12); }

/* Ornament */
.go-orn { width: 140px; height: 8px; flex-shrink: 0; }

/* Icon */
.go-icon { font-size: 58px; line-height: 1; }

.go-icon-win {
  color: #c8a84e;
  filter: drop-shadow(0 0 20px rgba(200, 168, 78, 0.5));
}
.go-icon-lose {
  color: rgba(120, 80, 60, 0.6);
  filter: drop-shadow(0 0 8px rgba(120, 40, 15, 0.3));
}

/* Title */
.go-title {
  margin: 0;
  font-size: 30px;
  font-family: var(--font-display, Georgia, serif);
  font-weight: 500;
}
.go-title-win {
  color: #ddd6c1;
  text-shadow:
    0 0 30px rgba(200, 168, 78, 0.35),
    0 0 60px rgba(200, 100, 30, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.8);
}
.go-title-lose {
  color: rgba(160, 140, 120, 0.7);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
}

/* Narrative */
.go-narrative {
  color: rgba(148, 130, 100, 0.6);
  font-size: 12px;
  font-style: italic;
  margin: 0;
  max-width: 280px;
  line-height: 1.5;
  font-family: Georgia, serif;
}

/* ===== STATS ===== */
.go-stats {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 270px;
  padding: 10px 0;
  margin: 2px 0;
}

.go-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  font-size: 12px;
  border-bottom: 1px solid rgba(200, 168, 78, 0.05);
}
.go-stat:last-child { border-bottom: none; }

.go-stat-rune {
  font-size: 14px;
  color: rgba(200, 168, 78, 0.25);
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.go-rune-kill { color: rgba(74, 222, 128, 0.35); }
.go-rune-loss { color: rgba(248, 113, 113, 0.35); }
.go-rune-glory { color: rgba(200, 168, 78, 0.4); }

.go-stat-label {
  flex: 1;
  color: rgba(148, 130, 100, 0.5);
  font-size: 11px;
  letter-spacing: 0.03em;
}

.go-stat-val {
  color: rgba(200, 190, 170, 0.7);
  font-weight: 600;
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
}
.go-val-kill { color: rgba(74, 222, 128, 0.8); }
.go-val-loss { color: rgba(248, 113, 113, 0.7); }
.go-val-glory { color: rgba(200, 168, 78, 0.85); }

/* ===== XP DISPLAY ===== */
.go-xp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 0;
}
.go-xp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #c8a84e;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.go-xp-icon { font-size: 16px; }
.go-level-up {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #ffd700;
  font-size: 13px;
  font-weight: 600;
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.4);
}
.go-achievement {
  display: flex;
  align-items: center;
  gap: 5px;
  color: rgba(74, 222, 128, 0.8);
  font-size: 11px;
}

/* ===== BUTTONS ===== */
.go-btn-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 12px 28px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.06em;
  font-family: var(--font-display, Georgia, serif);
  border: 1px solid;
}
.go-btn-main:active { transform: scale(0.98); }

.go-btn-gold {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.2), rgba(200, 168, 78, 0.1));
  border-color: rgba(200, 168, 78, 0.3);
  color: rgba(200, 168, 78, 0.95);
}
.go-btn-gold:hover {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.3), rgba(200, 168, 78, 0.15));
  box-shadow: 0 0 20px rgba(200, 100, 30, 0.12);
  border-color: rgba(200, 168, 78, 0.5);
}

.go-btn-ash {
  background: rgba(100, 80, 60, 0.08);
  border-color: rgba(100, 80, 60, 0.2);
  color: rgba(180, 160, 140, 0.8);
}
.go-btn-ash:hover {
  background: rgba(100, 80, 60, 0.15);
  border-color: rgba(100, 80, 60, 0.35);
}

.go-btn-menu {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(148, 130, 100, 0.35);
  text-decoration: none;
  font-size: 11px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.06);
  transition: all 0.15s;
  letter-spacing: 0.04em;
}
.go-btn-menu:hover {
  color: rgba(200, 168, 78, 0.7);
  border-color: rgba(200, 168, 78, 0.15);
}

/* Transitions */
.modal-fade-enter-active { transition: opacity 0.5s; }
.modal-fade-leave-active { transition: opacity 0.3s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

/* ===== MOBILE ===== */
@media (max-width: 767px) {
  .go-box { max-width: 92vw; padding: 24px 20px; min-width: 0; }
  .go-title { font-size: 24px; }
  .go-icon { font-size: 44px; }
  .go-narrative { font-size: 11px; }
  .go-stat { padding: 4px 8px; }
  .go-btn-main { padding: 10px 22px; font-size: 13px; }
}
</style>
