<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import PlayerField from './PlayerField.vue'
import PlayerHand from '../ui/PlayerHand.vue'
import TurnIndicator from '../ui/TurnIndicator.vue'
import PhaseControls from '../ui/PhaseControls.vue'
import GameChat from '../ui/GameChat.vue'
import DeckPile from '../ui/DeckPile.vue'
import CardTooltip from '../ui/CardTooltip.vue'
import GameOverModal from '../ui/GameOverModal.vue'
import GraveyardModal from '../ui/GraveyardModal.vue'
import PendingInteractionModal from '../ui/PendingInteractionModal.vue'
import GameHint from '../ui/GameHint.vue'
import WeatherEffects from '../ui/WeatherEffects.vue'
import MusicPlayer from '../ui/MusicPlayer.vue'
import TurnBanner from '../ui/TurnBanner.vue'
import GloryBar from '../ui/GloryBar.vue'
import PanteonPanel from '../ui/PanteonPanel.vue'
import InfoBox from '../ui/InfoBox.vue'
import CardBack from '../cards/CardBack.vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { BattleLine, GamePhase } from '../../game-engine/constants'
import { useAudio } from '../../composables/useAudio'
import { useSlashAttack } from '../../composables/useSlashAttack'
import { useBowAttack } from '../../composables/useBowAttack'
import { useElementalAttack } from '../../composables/useElementalAttack'
import { useMagicAttack } from '../../composables/useMagicAttack'
import { useDeathVFX } from '../../composables/useDeathVFX'
import SlashAttackVFX from '../vfx/SlashAttackWebGPU.vue'
import BowAttackVFX from '../vfx/BowAttackVFX.vue'
import ElementalVFX from '../vfx/ElementalVFX.vue'
import MagicVFX from '../vfx/MagicVFX.vue'
import DeathVFX from '../vfx/DeathVFX.vue'

const game = useGameStore()
const ui = useUIStore()

// Fullscreen toggle
const isFullscreen = ref(false)
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
  } else {
    document.exitFullscreen().catch(() => {})
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
}

// Slash Attack VFX (Three.js WebGPU + TSL shader)
// Registration via watch — <ClientOnly> delays rendering, so ref isn't available in onMounted
const slashVfxRef = ref<InstanceType<typeof SlashAttackVFX> | null>(null)
const slash = useSlashAttack()
watch(slashVfxRef, (comp) => {
  if (comp) {
    slash.register((atk, def, dmg) => comp.play(atk, def, dmg))
  }
})

// Bow Attack VFX (WebGPU shader — energy bow + arrow projectile)
const bowVfxRef = ref<InstanceType<typeof BowAttackVFX> | null>(null)
const bowBridge = useBowAttack()
watch(bowVfxRef, (comp) => {
  if (comp) {
    bowBridge.register((atk, def, dmg) => comp.play(atk, def, dmg))
  }
})

// Elemental Attack VFX (WebGPU fire orb projectile)
const elementalVfxRef = ref<InstanceType<typeof ElementalVFX> | null>(null)
const elementalBridge = useElementalAttack()
watch(elementalVfxRef, (comp) => {
  if (comp) {
    elementalBridge.register((atk, def, dmg) => comp.play(atk, def, dmg))
  }
})

// Magic Attack VFX (WebGPU rune circles + implosion)
const magicVfxRef = ref<InstanceType<typeof MagicVFX> | null>(null)
const magicBridge = useMagicAttack()
watch(magicVfxRef, (comp) => {
  if (comp) {
    magicBridge.register((atk, def, dmg) => comp.play(atk, def, dmg))
  }
})

// Death VFX (WebGPU smoke + soul wisp)
const deathVfxRef = ref<InstanceType<typeof DeathVFX> | null>(null)
const deathBridge = useDeathVFX()
watch(deathVfxRef, (comp) => {
  if (comp) {
    deathBridge.register((el) => comp.play(el))
  }
})

// No error suppression — let errors surface so we can fix root causes.
// The insertBefore/emitsOptions crashes were fixed by:
// 1. Removing el.remove() from GSAP onComplete (BattleLine damage float)
// 2. Stable positional keys in renderItems (slot-0, slot-1, slot-2)
// 3. nextTick guards on setTimeout reactive mutations (uiStore)

const player = computed(() => game.state?.players[game.mySide])
const ai = computed(() => {
  const oppSide = game.mySide === 'player1' ? 'player2' : 'player1'
  return game.state?.players[oppSide]
})

// Turn timer display (MM:SS)
const timerDisplay = computed(() => {
  const t = ui.turnTimeLeft
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

// ===== SEASON-BASED BATTLEFIELD BACKGROUND =====
// Dynamic imports for season backgrounds (WebP, with PNG fallback)
const bgModules = import.meta.glob('../../assets/backgrounds/battlefields/1/*.webp', { eager: true, query: '?url', import: 'default' })
const seasonBgMap: Record<string, string> = {}
for (const [path, url] of Object.entries(bgModules)) {
  if (path.includes('wiosna')) seasonBgMap.spring = url as string
  else if (path.includes('lato')) seasonBgMap.summer = url as string
  else if (path.includes('jesien')) seasonBgMap.autumn = url as string
  else if (path.includes('zima')) seasonBgMap.winter = url as string
}

// Fallback gradients in case images aren't loaded
const seasonGradients: Record<string, string> = {
  spring: 'radial-gradient(ellipse 120% 100% at 50% 60%, #0d2818 0%, #0a1628 40%, #080c1a 100%)',
  summer: 'radial-gradient(ellipse 120% 100% at 50% 55%, #1a1a0a 0%, #0f1520 40%, #080c1a 100%)',
  autumn: 'radial-gradient(ellipse 120% 100% at 50% 55%, #1a0f08 0%, #12101c 40%, #080c1a 100%)',
  winter: 'radial-gradient(ellipse 120% 100% at 50% 55%, #0c1420 0%, #0a0e1e 40%, #060a14 100%)',
}

// Season crossfade: two layers, old bg fades out while new bg fades in
const currentBg = ref(seasonBgMap[game.season] ?? '')
const prevBg = ref('')
const isCrossfading = ref(false)

watch(() => game.season, (newSeason, oldSeason) => {
  if (newSeason === oldSeason) return
  // SFX
  if (oldSeason) sfx.sfxSeasonChange()
  // Crossfade background
  const newUrl = seasonBgMap[newSeason]
  if (!newUrl) return
  prevBg.value = currentBg.value
  currentBg.value = newUrl
  isCrossfading.value = true
  setTimeout(() => {
    isCrossfading.value = false
    prevBg.value = ''
  }, 2000)
})

const bgStyle = computed(() => {
  const url = seasonBgMap[game.season]
  const bg = url ? `url(${url})` : (seasonGradients[game.season] ?? seasonGradients.summer)
  return { '--bf-bg': bg }
})




// ===== SFX WATCHERS =====
const sfx = useAudio()
// Attack/hit/death SFX will be triggered by VFXOrchestrator (P3)
watch(() => game.winner, (v) => {
  if (!v) return
  if (v === game.mySide) sfx.sfxVictory()
  else sfx.sfxDefeat()
})
watch(() => game.currentPhase, () => sfx.sfxPhase())

// === UI SFX — card play, draw, gold, adventure, activate, season ===
// Card play + draw: watch hand size changes
let prevHandSize = 0
watch(() => game.state?.players[game.mySide].hand.length ?? 0, (newSize) => {
  if (prevHandSize > 0 && newSize < prevHandSize) sfx.sfxCardPlay()
  if (prevHandSize > 0 && newSize > prevHandSize) sfx.sfxDraw()
  prevHandSize = newSize
})
// PS: watch for glory spent
let prevGlory = 0
watch(() => game.state?.players[game.mySide].glory ?? 0, (newGlory) => {
  if (prevGlory > 0 && newGlory !== prevGlory) sfx.sfxGold()
  prevGlory = newGlory
})
// Adventure: watch for active events count change
let prevEventCount = 0
watch(() => game.state?.activeEvents?.length ?? 0, (newCount) => {
  if (newCount > prevEventCount) sfx.sfxAdventure()
  prevEventCount = newCount
})
// Activate: watch for activation in action log
watch(() => game.actionLog.length, () => {
  const log = game.actionLog
  if (log.length === 0) return
  const last = log[log.length - 1]
  if (last?.type === 'effect' && last.message?.includes('aktywuje')) {
    sfx.sfxActivate()
  }
}, { deep: false })
// Season change: merged into crossfade watcher above

// P1/P2 VFX watchers removed — will be replaced by VFXOrchestrator typed events (P3)

// ===== KEYBOARD SHORTCUTS =====
function onKeyDown(e: KeyboardEvent) {
  // Don't handle if modal is open or typing in input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (game.state?.pendingInteraction || ui.pendingActivation || ui.confirmingSurrender) return
  if (game.state?.awaitingOnPlayConfirmation) return
  if (ui.isEnhancedMode || ui.isPlacingCard || ui.isMovingCard || ui.pendingArtifactId) return
  if (ui.graveyardViewerSide) return

  switch (e.key) {
    case ' ':  // Space = advance phase / end turn
    case 'Enter':
      e.preventDefault()
      if (!game.isPlayerTurn || game.winner) return
      if (game.currentPhase === GamePhase.COMBAT || game.currentPhase === GamePhase.END) {
        game.endTurn()
      } else {
        game.advancePhase()
      }
      break
    case 'Escape':
      e.preventDefault()
      ui.clearSelection()
      break
  }
}

onMounted(() => { window.addEventListener('keydown', onKeyDown) })
onUnmounted(() => { window.removeEventListener('keydown', onKeyDown) })

const onPlayDescription = computed(() => {
  const cardId = game.state?.awaitingOnPlayConfirmation
  if (!cardId || !game.state) return ''
  const allCards = [
    ...game.state.players[game.mySide].field.lines[BattleLine.FRONT],
    ...game.state.players[game.mySide].field.lines[BattleLine.RANGED],
    ...game.state.players[game.mySide].field.lines[BattleLine.SUPPORT],
  ]
  const card = allCards.find(c => c.instanceId === cardId)
  if (!card) return ''
  const data = card.cardData as any
  const onPlayAbility = data.abilities?.find((a: any) => a.trigger === 'ON_PLAY')
  const desc = onPlayAbility?.text ?? data.effectDescription ?? ''
  return `${data.name}: ${desc}`
})
</script>

<template>
  <div class="game-board" v-if="game.state && player && ai" :style="bgStyle">

    <!-- ===== SEASON CROSSFADE BACKGROUNDS ===== -->
    <div v-if="prevBg" class="season-bg season-bg-old" :class="{ 'season-bg-out': isCrossfading }" :style="{ backgroundImage: `url(${prevBg})` }" />
    <div class="season-bg season-bg-current" :class="{ 'season-bg-in': isCrossfading }" :style="{ backgroundImage: currentBg ? `url(${currentBg})` : 'none' }" />

    <!-- ===== EFEKTY POGODOWE ===== -->
    <WeatherEffects :season="game.season" />

    <!-- ===== SEASON LIGHT TINT — color temperature per season ===== -->
    <div :class="['season-tint', `tint-${game.season}`]" />


    <!-- ===== PASEK GÓRNY (minimalny) ===== -->
    <div class="top-bar">
      <div class="round-counter" v-tip="'Numer rundy'">
        <span class="round-label">Runda</span>
        <span class="round-number">{{ game.roundNumber }}</span>
      </div>
      <div :class="['turn-badge', game.isPlayerTurn ? 'tb-player' : 'tb-ai']">
        {{ game.isPlayerTurn ? 'TWOJA TURA' : 'TURA WROGA' }}
      </div>
      <div v-if="game.isPlayerTurn" :class="['turn-timer', { 'timer-critical': ui.turnTimeLeft <= 20 }]" v-tip="'Czas na turę'">
        <Icon icon="game-icons:sands-of-time" class="timer-icon" />
        <span class="timer-value">{{ timerDisplay }}</span>
      </div>
      <div class="top-bar-spacer" />
      <div :class="['season-badge', `season-${game.season}`]" v-tip="'Aktualna pora roku'">
        {{ { spring: '🌸 Wiosna', summer: '☀ Lato', autumn: '🍂 Jesień', winter: '❄ Zima' }[game.season] }}
      </div>
      <div class="top-bar-spacer" />
      <!-- Slava: Glory Bar -->
      <GloryBar />
      <!-- Slava: Panteon -->
      <PanteonPanel />
      <MusicPlayer />
      <PhaseControls />
      <button
        class="fullscreen-btn"
        @click="toggleFullscreen"
        v-tip="isFullscreen ? 'Wyłącz pełny ekran' : 'Pełny ekran'"
      ><Icon :icon="isFullscreen ? 'mdi:fullscreen-exit' : 'mdi:fullscreen'" /></button>
      <button
        v-if="!game.winner"
        class="surrender-top-btn"
        @click="ui.confirmingSurrender = true"
        v-tip="'Poddaj grę i wróć do menu'"
      >🏳</button>
    </div>

    <!-- ===== GŁÓWNA PLANSZA (lewa-prawa) ===== -->
    <div class="board-main">

      <!-- LEWA KOLUMNA: info AI -->
      <div class="sidebar sidebar-ai">
        <DeckPile
          :deck-count="ai.deck.length"
          :hand-count="ai.hand.length"
          :grave-count="ai.graveyard.length"
          :glory="ai.glory"
          :is-a-i="true"
          @open-graveyard="ui.openGraveyardViewer(game.mySide === 'player1' ? 'player2' : 'player1')"
        />
        <!-- Events moved to PlayerField between L1-L2 -->
      </div>

      <!-- POLE WALKI AI (3 kolumny: L3|L2|L1, L1 przy środku) -->
      <PlayerField :player-state="ai" :is-player-side="false" />

      <!-- ŚRODKOWY SEPARATOR (pionowy) -->
      <div class="center-divider">
        <div class="divider-line" />
        <div class="divider-badge">⚔</div>
        <div class="divider-line" />
      </div>

      <!-- POLE WALKI GRACZA (3 kolumny: L1|L2|L3, L1 przy środku) -->
      <PlayerField :player-state="player" :is-player-side="true" />

      <!-- PRAWA KOLUMNA: info gracza -->
      <div class="sidebar sidebar-player">
        <DeckPile
          :deck-count="player.deck.length"
          :hand-count="player.hand.length"
          :grave-count="player.graveyard.length"
          :glory="player.glory"
          :is-a-i="false"
          :enhanced-active="ui.isEnhancedMode"
          @open-graveyard="ui.openGraveyardViewer(game.mySide)"
          @toggle-enhanced="ui.toggleEnhancedMode()"
        />
        <!-- Events moved to PlayerField between L1-L2 -->
      </div>
    </div>

    <!-- Aura bar removed — passive effects shown on creature cards, events in sidebars -->

    <!-- ===== MOBILE HUD: kompaktowe statsy pływające ===== -->
    <div class="mobile-hud">
      <!-- AI stats (left) -->
      <div class="mhud-side mhud-ai">
        <span class="mhud-label mhud-label-ai">AI</span>
        <span class="mhud-stat" @click="ui.openGraveyardViewer(game.mySide === 'player1' ? 'player2' : 'player1')">💀{{ ai.graveyard.length }}</span>
        <span class="mhud-stat">🃏{{ ai.deck.length }}</span>
        <span class="mhud-stat mhud-glory">⚔{{ ai.glory }}</span>
      </div>
      <!-- Toggle drawer -->
      <button class="mhud-toggle" @click="ui.mobileDrawerOpen = !ui.mobileDrawerOpen">
        ⚙
      </button>
      <!-- Player stats (right) -->
      <div class="mhud-side mhud-player">
        <span class="mhud-stat mhud-glory" :class="{ 'mhud-enhanced': ui.isEnhancedMode }" @click="ui.toggleEnhancedMode()">⚔{{ player.glory }}</span>
        <span class="mhud-stat">🃏{{ player.deck.length }}</span>
        <span class="mhud-stat" @click="ui.openGraveyardViewer(game.mySide)">💀{{ player.graveyard.length }}</span>
        <span class="mhud-label mhud-label-player">TY</span>
      </div>
    </div>

    <!-- ===== MOBILE DRAWER: pełne info na żądanie ===== -->
    <Transition name="drawer-slide">
      <div v-if="ui.mobileDrawerOpen" class="mobile-drawer" @click.self="ui.mobileDrawerOpen = false">
        <div class="drawer-content">
          <div class="drawer-row">
            <DeckPile
              :deck-count="ai.deck.length"
              :hand-count="ai.hand.length"
              :grave-count="ai.graveyard.length"
              :glory="ai.glory"
              :is-a-i="true"
              @open-graveyard="() => { ui.mobileDrawerOpen = false; ui.openGraveyardViewer(game.mySide === 'player1' ? 'player2' : 'player1') }"
            />
            <div class="drawer-divider" />
            <DeckPile
              :deck-count="player.deck.length"
              :hand-count="player.hand.length"
              :grave-count="player.graveyard.length"
              :glory="player.glory"
              :is-a-i="false"
              :enhanced-active="ui.isEnhancedMode"
              @open-graveyard="() => { ui.mobileDrawerOpen = false; ui.openGraveyardViewer(game.mySide) }"
              @toggle-enhanced="ui.toggleEnhancedMode()"
            />
          </div>
          <button class="drawer-close" @click="ui.mobileDrawerOpen = false">Zamknij</button>
        </div>
      </div>
    </Transition>

    <!-- ===== PODPOWIEDŹ ===== -->
    <GameHint />

    <!-- ===== CZAT Z NARRATOREM ===== -->
    <GameChat />

    <!-- ===== RĘKA GRACZA (dolny pasek) ===== -->
    <PlayerHand />

    <!-- ===== TOAST: limit wystawiania ===== -->
    <Transition name="toast-fade">
      <div v-if="ui.playLimitToast" class="play-limit-toast">
        {{ ui.playLimitToast }}
      </div>
    </Transition>

    <!-- ON_PLAY Confirmation -->
    <Transition name="onplay-fade">
      <div v-if="game.state?.awaitingOnPlayConfirmation" class="onplay-confirm">
        <div class="onplay-box">
          <div class="onplay-title">Efekt przy wystawieniu</div>
          <div class="onplay-desc">{{ onPlayDescription }}</div>
          <div class="onplay-btns">
            <button class="onplay-yes" @click="game.confirmOnPlay()">TAK — Aktywuj</button>
            <button class="onplay-no" @click="game.skipOnPlay()">NIE — Pomiń</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== POTWIERDZENIE PODDANIA ===== -->
    <Transition name="onplay-fade">
      <div v-if="ui.confirmingSurrender" class="onplay-confirm" @click.self="ui.confirmingSurrender = false">
        <div class="onplay-box">
          <div class="onplay-title">Poddanie gry</div>
          <div class="onplay-desc">Czy na pewno chcesz poddać grę?</div>
          <div class="onplay-btns">
            <button class="onplay-yes" style="border-color:rgba(239,68,68,0.5);color:#fca5a5;background:rgba(239,68,68,0.15)" @click="() => { ui.confirmingSurrender = false; game.surrender() }">TAK — Poddaj</button>
            <button class="onplay-no" @click="ui.confirmingSurrender = false">NIE — Wróć</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== POTWIERDZENIE PŁATNEJ ZDOLNOŚCI ===== -->
    <Transition name="onplay-fade">
      <div v-if="ui.pendingActivation" class="onplay-confirm">
        <div class="onplay-box">
          <div class="onplay-title">Aktywacja zdolności</div>
          <div class="onplay-desc">
            Czy chcesz wydać <strong>{{ ui.pendingActivation.cost }} PS</strong> na aktywację zdolności
            <strong>{{ ui.pendingActivation.cardName }}</strong>?
          </div>
          <div class="onplay-btns">
            <button class="onplay-yes" @click="() => {
              const pa = ui.pendingActivation!
              ui.pendingActivation = null
              if (pa.requiresTarget && pa.availableTargetIds?.length) {
                ui.enterEffectTargetMode(pa.cardInstanceId, pa.availableTargetIds)
              } else {
                game.activateCreatureEffect(pa.cardInstanceId)
              }
            }">TAK — Aktywuj</button>
            <button class="onplay-no" @click="ui.pendingActivation = null">NIE — Anuluj</button>
          </div>
        </div>
      </div>
    </Transition>

    <TurnBanner />

    <!-- Hipnoza Alkonosta — info banner zamiast modalu -->
    <Transition name="fade">
      <div v-if="ui.mode === 'hypnosis'" class="hypnosis-banner" :key="ui.hypnosisPhase">
        <Icon icon="game-icons:hypnotize" class="hypnosis-icon" />
        <div class="hypnosis-text">
          <strong>Hipnoza Alkonosta</strong>
          <span v-if="ui.hypnosisPhase === 1">Wybierz wrogą istotę do zhipnotyzowania.</span>
          <span v-else>Wybierz cel — zhipnotyzowany wróg zaatakuje go.</span>
        </div>
      </div>
    </Transition>

    <!-- Generyczny wybór celu zdolności — info banner -->
    <Transition name="fade">
      <div v-if="ui.mode === 'effect_target'" class="effect-target-banner">
        <Icon icon="game-icons:on-target" class="effect-target-icon" />
        <div class="effect-target-text">
          <strong>Wybierz cel zdolności</strong>
          <span>Kliknij podświetloną istotę na polu.</span>
        </div>
        <button class="effect-target-cancel" @click="ui.clearEffectTarget()">Anuluj</button>
      </div>
    </Transition>

    <InfoBox />
    <CardTooltip />
    <GameOverModal />
    <GraveyardModal />
    <!-- P3 VFX Overlay — single canvas for all visual effects -->
    <VFXOverlay />
    <!-- Three.js slash overlay for melee attacks -->
    <ClientOnly><SlashAttackVFX ref="slashVfxRef" /></ClientOnly>
    <ClientOnly><BowAttackVFX ref="bowVfxRef" /></ClientOnly>
    <ClientOnly><ElementalVFX ref="elementalVfxRef" /></ClientOnly>
    <ClientOnly><MagicVFX ref="magicVfxRef" /></ClientOnly>
    <ClientOnly><DeathVFX ref="deathVfxRef" /></ClientOnly>
  </div>

  <div v-else class="board-loading">
    <div class="loading-spinner" />
    Ładowanie gry...
  </div>

  <PendingInteractionModal />
</template>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: var(--bg-board);
  color: var(--text-primary);
  position: relative;
}

/* Battlefield background — fallback via ::before, crossfade via .season-bg layers */
.game-board::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--bf-bg, var(--bg-board));
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Season crossfade layers */
.season-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
}
.season-bg-current {
  z-index: 1;
}
.season-bg-old {
  z-index: 1;
}
.season-bg-out {
  animation: season-fade-out 2s ease forwards;
}
.season-bg-in {
  animation: season-fade-in 2s ease forwards;
}
@keyframes season-fade-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes season-fade-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

/* Vignette overlay — darker edges for readability */
.game-board::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 85% 70% at 50% 50%,
      transparent 30%,
      rgba(0, 0, 0, var(--vignette-opacity, 0.55)) 100%
    );
}

/* Season light tint — color temperature overlay */
.season-tint {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  transition: background 1.5s ease;
  mix-blend-mode: soft-light;
}
.tint-spring {
  background: radial-gradient(ellipse 100% 80% at 50% 30%,
    rgba(74, 222, 128, 0.08) 0%,
    rgba(167, 243, 208, 0.04) 40%,
    transparent 70%);
}
.tint-summer {
  background:
    radial-gradient(ellipse 70% 50% at 65% 15%,
      rgba(251, 191, 36, 0.12) 0%,
      rgba(251, 146, 60, 0.06) 40%,
      transparent 65%),
    linear-gradient(180deg,
      rgba(251, 191, 36, 0.04) 0%,
      transparent 40%);
}
.tint-autumn {
  background: radial-gradient(ellipse 90% 70% at 40% 50%,
    rgba(249, 115, 22, 0.06) 0%,
    rgba(220, 38, 38, 0.03) 40%,
    transparent 65%);
}
.tint-winter {
  background:
    radial-gradient(ellipse 100% 80% at 50% 40%,
      rgba(96, 165, 250, 0.08) 0%,
      rgba(147, 197, 253, 0.04) 40%,
      transparent 65%),
    linear-gradient(180deg,
      transparent 60%,
      rgba(96, 165, 250, 0.04) 100%);
}

/* Layout children above the ::before/::after pseudo-elements and .season-bg layers */
.board-main, .mobile-hud { position: relative; z-index: 3; }
.top-bar { position: relative; z-index: 10; }

/* ====== PASEK GÓRNY (minimalny) ====== */
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 10px;
  border-bottom: 1px solid rgba(200,168,78,0.08);
  background: linear-gradient(90deg, rgba(4,3,10,0.9), rgba(15,12,25,0.85), rgba(4,3,10,0.9));
  /* backdrop-filter removed for performance */
  flex-shrink: 0;
  min-height: 32px;
  position: relative;
}
/* Ornament pod top barem */
.top-bar::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200,168,78,0.15) 20%, rgba(200,168,78,0.2) 50%, rgba(200,168,78,0.15) 80%, transparent);
  pointer-events: none;
}

.top-bar-spacer { flex: 1; }

.turn-badge {
  font-family: var(--font-display, Georgia, serif);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.12em;
  padding: 3px 16px;
  border-radius: 5px;
  border: 1px solid;
  position: relative;
}
/* Runiczna dekoracja po bokach */
.turn-badge::before { content: '᛫'; margin-right: 6px; opacity: 0.4; font-size: 10px; }
.turn-badge::after  { content: '᛫'; margin-left: 6px; opacity: 0.4; font-size: 10px; }

.round-counter {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--font-display, Georgia, serif);
  color: #94a3b8;
  padding: 2px 14px;
}
.round-label {
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.round-number {
  font-size: 42px;
  font-weight: 500;
  color: #c8a84e;
  text-shadow: 0 0 12px rgba(200, 168, 78, 0.4), 0 0 24px rgba(200, 168, 78, 0.15);
  line-height: 1;
}
.tb-player {
  color: #86efac;
  background: linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(34,197,94,0.04) 100%);
  border-color: rgba(134,239,172,0.25);
  text-shadow: 0 0 8px rgba(34,197,94,0.3);
}
.tb-ai {
  color: #fca5a5;
  background: linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.04) 100%);
  border-color: rgba(252,165,165,0.25);
  text-shadow: 0 0 8px rgba(239,68,68,0.3);
  animation: ai-blink 1.2s ease infinite;
}
@keyframes ai-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ====== TURN TIMER ====== */
.turn-timer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: #c8a84e;
  padding: 3px 12px;
  border-radius: 5px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  background: rgba(200, 168, 78, 0.06);
  transition: color 0.3s, border-color 0.3s, background 0.3s, text-shadow 0.3s;
}
.timer-icon {
  font-size: 20px;
  opacity: 0.8;
}
.timer-value {
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: center;
}
.timer-critical {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.1);
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
  animation: timer-pulse 1s ease infinite;
}
.timer-critical .timer-icon {
  opacity: 1;
  color: #ef4444;
}
@keyframes timer-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.season-badge {
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 500;
  padding: 5px 16px;
  border-radius: 6px;
  text-transform: uppercase;
  white-space: nowrap;
  letter-spacing: 0.06em;
  transition: color 0.4s, background-color 0.4s, border-color 0.4s, text-shadow 0.4s;
}
/* Season colors */
.season-spring {
  color: #86efac;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.2);
  text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
}
.season-summer {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.3);
}
.season-autumn {
  color: #fb923c;
  background: rgba(249, 115, 22, 0.08);
  border: 1px solid rgba(249, 115, 22, 0.2);
  text-shadow: 0 0 10px rgba(249, 115, 22, 0.3);
}
.season-winter {
  color: #93c5fd;
  background: rgba(96, 165, 250, 0.08);
  border: 1px solid rgba(96, 165, 250, 0.2);
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.3);
}

.fullscreen-btn {
  padding: 4px 8px;
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 4px;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  line-height: 1;
  display: flex;
  align-items: center;
}
.fullscreen-btn:hover {
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
}
.surrender-top-btn {
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 4px;
  color: #ef4444;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
  line-height: 1;
  text-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}
.surrender-top-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.7);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
}

/* ====== GŁÓWNA PLANSZA ====== */
.board-main {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ====== SIDEBARY ====== */
.sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 6px 4px;
  border-right: 1px solid rgba(200,168,78,0.08);
  background: linear-gradient(180deg, rgba(4,3,10,0.92) 0%, rgba(10,8,20,0.88) 100%);
  /* backdrop-filter removed for performance */
  flex-shrink: 0;
  width: 82px;
  border-radius: 0 0 8px 0;
  position: relative;
}
/* Ornament: złota linia wzdłuż boku */
.sidebar::after {
  content: '';
  position: absolute;
  top: 10%;
  right: 0;
  width: 1px;
  height: 80%;
  background: linear-gradient(180deg, transparent, rgba(200,168,78,0.15) 30%, rgba(200,168,78,0.15) 70%, transparent);
  pointer-events: none;
}

.sidebar-player {
  border-right: none;
  border-left: 1px solid rgba(200,168,78,0.08);
  border-radius: 0 0 0 8px;
}
.sidebar-player::after {
  right: auto;
  left: 0;
}


/* ====== SEPARATOR ŚRODKOWY (pionowy) ====== */
.center-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  flex-shrink: 0;
  width: 24px;
}

.divider-line {
  flex: 1;
  width: 1px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(200, 168, 78, 0.2) 30%,
    rgba(200, 168, 78, 0.35) 50%,
    rgba(200, 168, 78, 0.2) 70%,
    transparent
  );
}

.divider-badge {
  font-size: 16px;
  color: rgba(200, 168, 78, 0.35);
  padding: 6px 0;
  writing-mode: vertical-rl;
  text-shadow: 0 0 12px rgba(200, 168, 78, 0.2);
  /* rune-glow animation removed — static for performance */
}


/* ====== LOADING ====== */
.board-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-muted);
  font-size: 16px;
  gap: 12px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(139, 92, 246, 0.2);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ====== PLAY LIMIT TOAST ====== */
.play-limit-toast {
  position: fixed;
  bottom: 160px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  border: 1px solid #f87171;
  color: #fca5a5;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 6px;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

/* ===== SURRENDER (sidebar) ===== */

.toast-fade-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(10px); }
.toast-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-6px); }

/* ===== ON_PLAY CONFIRMATION ===== */
.onplay-confirm {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  background: rgba(0,0,0,0.5);
}

.onplay-box {
  background: #0f172a;
  border: 1px solid rgba(139,92,246,0.5);
  border-radius: 10px;
  padding: 20px 24px;
  max-width: 340px;
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.2);
}

.onplay-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a78bfa;
}

.onplay-desc {
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.5;
}

.onplay-btns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.onplay-yes {
  flex: 1;
  padding: 8px 0;
  background: rgba(139,92,246,0.2);
  border: 1px solid rgba(139,92,246,0.5);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.onplay-yes:hover { background: rgba(139,92,246,0.35); }

.onplay-no {
  flex: 1;
  padding: 8px 0;
  background: rgba(100,116,139,0.1);
  border: 1px solid rgba(100,116,139,0.3);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.onplay-no:hover { background: rgba(100,116,139,0.2); }

.onplay-fade-enter-active, .onplay-fade-leave-active { transition: opacity 0.2s; }
.onplay-fade-enter-from, .onplay-fade-leave-to { opacity: 0; }


/* ====================================================================
   MOBILE HUD — ukryty na desktopie, widoczny na mobile
   ==================================================================== */
.mobile-hud {
  display: none;
}
.mobile-drawer {
  display: none;
}

/* ====================================================================
   MOBILE RESPONSIVE — pionowa orientacja pola bitwy (< 768px)
   ==================================================================== */
@media (max-width: 767px) {
  .game-board {
    height: 100dvh;
    overflow: hidden;
  }

  /* === TOP BAR: kompaktowy === */
  .top-bar {
    padding: 2px 6px;
    gap: 3px;
    min-height: 26px;
  }
  .turn-badge {
    font-size: 9px;
    padding: 2px 6px;
    letter-spacing: 0.04em;
  }
  .turn-badge::before, .turn-badge::after { display: none; }
  .season-badge {
    font-size: 11px;
    padding: 2px 8px;
  }
  .round-counter { padding: 0 4px; }
  .round-label { font-size: 10px; }
  .round-number { font-size: 22px; }
  .surrender-top-btn {
    font-size: 11px;
    padding: 2px 4px;
  }

  /* === SIDEBARY: UKRYTE na mobile === */
  .sidebar {
    display: none !important;
  }

  /* === MOBILE HUD: kompaktowy pasek statystyk === */
  .mobile-hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px;
    background: rgba(4,3,10,0.85);
    /* backdrop-filter removed for performance */
    border-bottom: 1px solid rgba(200,168,78,0.08);
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    gap: 4px;
  }
  .mhud-side {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mhud-label {
    font-family: var(--font-display, Georgia, serif);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.1em;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .mhud-label-ai {
    color: #fca5a5;
    background: rgba(239,68,68,0.12);
    border: 1px solid rgba(239,68,68,0.25);
  }
  .mhud-label-player {
    color: #86efac;
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.25);
  }
  .mhud-stat {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    cursor: pointer;
    padding: 1px 3px;
    border-radius: 3px;
    transition: background 0.15s;
    white-space: nowrap;
    line-height: 1;
  }
  .mhud-stat:active {
    background: rgba(200,168,78,0.12);
  }
  .mhud-gold {
    color: #fbbf24;
  }
  .mhud-glory {
    color: #86efac;
  }
  .mhud-enhanced {
    background: rgba(251,191,36,0.2);
    border: 1px solid rgba(251,191,36,0.5);
    box-shadow: 0 0 6px rgba(251,191,36,0.2);
  }
  .mhud-toggle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid rgba(200,168,78,0.2);
    background: rgba(200,168,78,0.06);
    color: rgba(200,168,78,0.5);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 0.15s, color 0.15s;
  }
  .mhud-toggle:active {
    background: rgba(200,168,78,0.15);
    color: rgba(200,168,78,0.8);
  }

  /* === MOBILE DRAWER: overlay z pełnym info === */
  .mobile-drawer {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 180;
    background: rgba(0,0,0,0.7);
    align-items: flex-end;
    justify-content: center;
    /* backdrop-filter removed for performance */
  }
  .drawer-content {
    background: linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%);
    border-radius: 14px 14px 0 0;
    border: 1px solid rgba(200,168,78,0.12);
    border-bottom: none;
    width: 100%;
    max-width: 480px;
    padding: 16px 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .drawer-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-around;
    gap: 12px;
  }
  .drawer-divider {
    width: 1px;
    align-self: stretch;
    background: linear-gradient(180deg, transparent, rgba(200,168,78,0.2), transparent);
  }
  .drawer-close {
    align-self: center;
    padding: 6px 24px;
    border-radius: 6px;
    border: 1px solid rgba(200,168,78,0.2);
    background: rgba(200,168,78,0.06);
    color: rgba(200,168,78,0.6);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.06em;
  }
  .drawer-close:active {
    background: rgba(200,168,78,0.15);
  }

  /* Drawer slide animation */
  .drawer-slide-enter-active { transition: opacity 0.25s ease-out; }
  .drawer-slide-enter-active .drawer-content { transition: transform 0.25s ease-out; }
  .drawer-slide-leave-active { transition: opacity 0.2s ease-in; }
  .drawer-slide-leave-active .drawer-content { transition: transform 0.2s ease-in; }
  .drawer-slide-enter-from { opacity: 0; }
  .drawer-slide-enter-from .drawer-content { transform: translateY(100%); }
  .drawer-slide-leave-to { opacity: 0; }
  .drawer-slide-leave-to .drawer-content { transform: translateY(100%); }

  /* === BOARD MAIN: pionowa orientacja, FILL viewport === */
  .board-main {
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }

  /* === SEPARATOR ŚRODKOWY: poziomy, minimalny === */
  .center-divider {
    flex-direction: row;
    width: 100%;
    padding: 0 12px;
    height: 14px;
    flex-shrink: 0;
  }
  .divider-line {
    height: 1px;
    width: auto;
    flex: 1;
    background: linear-gradient(90deg, transparent, rgba(200,168,78,0.25) 30%, rgba(200,168,78,0.35) 50%, rgba(200,168,78,0.25) 70%, transparent);
  }
  .divider-badge {
    writing-mode: horizontal-tb;
    padding: 0 6px;
    font-size: 12px;
  }

  /* === PLAY LIMIT TOAST === */
  .play-limit-toast {
    bottom: 100px;
    font-size: 11px;
    padding: 6px 14px;
  }

  /* === ONPLAY CONFIRM BOX === */
  .onplay-box {
    max-width: 92vw;
    padding: 14px;
  }
}

/* ====== HIPNOZA BANNER ====== */
.hypnosis-banner {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(90, 40, 140, 0.92), rgba(60, 20, 100, 0.95));
  border: 1px solid rgba(180, 120, 255, 0.4);
  border-radius: 10px;
  box-shadow: 0 0 20px rgba(140, 80, 220, 0.3);
  color: #e8d8ff;
  pointer-events: none;
}
.hypnosis-icon {
  font-size: 28px;
  color: #c8a0ff;
}
.hypnosis-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hypnosis-text strong {
  font-size: 14px;
  color: #e0c0ff;
  letter-spacing: 0.5px;
}
.hypnosis-text span {
  font-size: 12px;
  opacity: 0.85;
}

/* ====== EFFECT TARGET BANNER ====== */
.effect-target-banner {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(40, 100, 140, 0.92), rgba(20, 70, 110, 0.95));
  border: 1px solid rgba(100, 200, 255, 0.4);
  border-radius: 10px;
  box-shadow: 0 0 20px rgba(60, 160, 220, 0.3);
  color: #d8f0ff;
  pointer-events: auto;
}
.effect-target-icon {
  font-size: 28px;
  color: #80d0ff;
}
.effect-target-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.effect-target-text strong {
  font-size: 14px;
  color: #a0e0ff;
  letter-spacing: 0.5px;
}
.effect-target-text span {
  font-size: 12px;
  opacity: 0.85;
}
.effect-target-cancel {
  margin-left: 8px;
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #d8f0ff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}
.effect-target-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
