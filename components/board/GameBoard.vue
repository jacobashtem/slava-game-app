<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from 'vue'
import PlayerField from './PlayerField.vue'
import PlayerHand from '../ui/PlayerHand.vue'
import TurnIndicator from '../ui/TurnIndicator.vue'
import PhaseControls from '../ui/PhaseControls.vue'
import ActionLog from '../ui/ActionLog.vue'
import DeckPile from '../ui/DeckPile.vue'
import CardTooltip from '../ui/CardTooltip.vue'
import GameOverModal from '../ui/GameOverModal.vue'
import GraveyardModal from '../ui/GraveyardModal.vue'
import PendingInteractionModal from '../ui/PendingInteractionModal.vue'
import GameHint from '../ui/GameHint.vue'
import AISummaryPanel from '../ui/AISummaryPanel.vue'
import WeatherEffects from '../ui/WeatherEffects.vue'
import MusicPlayer from '../ui/MusicPlayer.vue'
import TurnBanner from '../ui/TurnBanner.vue'
import CardBack from '../cards/CardBack.vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { BattleLine, GamePhase } from '../../game-engine/constants'
import { useSFX } from '../../composables/useSFX'

const game = useGameStore()
const ui = useUIStore()

const player = computed(() => game.state?.players.player1)
const ai = computed(() => game.state?.players.player2)

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

const bgStyle = computed(() => {
  const url = seasonBgMap[game.season]
  const bg = url ? `url(${url})` : (seasonGradients[game.season] ?? seasonGradients.summer)
  return { '--bf-bg': bg }
})

// ===== ACTIVE AURAS INFO BAR =====
const passiveAuraMap: Record<string, { icon: string; label: string; desc: string }> = {
  'matoha_anti_magic':       { icon: '🚫', label: 'Anty-Magia',   desc: 'Blokuje ataki typu Magia na sojuszników.' },
  'chmurnik_ground_flying':  { icon: '⬇',  label: 'Uziemienie',   desc: 'Wrogie latające istoty tracą latanie.' },
  'guslarka_bonus_vs_demon': { icon: '✝',  label: 'vs Demony',    desc: 'Sojusznicy +2 ATK vs demony.' },
  'zerca_welesa_demon_buff': { icon: '🔥', label: 'Demoniczny',   desc: 'Sojusznicze demony +1 ATK.' },
  'polewik_buff_neighbors':  { icon: '🌾', label: 'Wsparcie',     desc: 'Sąsiedzi w L1 +1 ATK.' },
  'szeptunka_damage_reduction':{ icon: '🤫',label: 'Szept',       desc: 'Sojusznicy -1 obrażeń.' },
  'chlop_extra_attack':      { icon: '⚔',  label: '+1 Atak',     desc: 'Sojusznicy +1 atak na turę.' },
  'tesknica_block_enhance':  { icon: '🔒', label: 'Blokada',      desc: 'Blokuje ulepszanie przygód wroga.' },
  'bieda_spy_block_draw':    { icon: '💀', label: 'Bieda',        desc: 'Właściciel nie dobiera kart.' },
  'licho_block_draw':        { icon: '👁',  label: 'Licho',       desc: 'Wróg nie dobiera kart.' },
  'bzionek_spell_intercept': { icon: '🛡',  label: 'Anty-Czar',   desc: 'Przechwytuje zaklęcia.' },
  'czarownica_redirect_spell':{ icon: '🔄',label: 'Odwrót',       desc: 'Przekierowuje zaklęcia wroga.' },
  'lapiduch_demon_hunter':   { icon: '⚔',  label: 'Łowca',       desc: 'Blokuje wystawianie demonów.' },
  'zupan_no_field_limit':    { icon: '👑', label: 'Bez limitu',   desc: 'Znosi limit istot na polu.' },
}

interface ActiveAuraEntry {
  icon: string
  label: string
  desc: string
  cardName: string
  side: 'player1' | 'player2'
}

const activeAuras = computed<ActiveAuraEntry[]>(() => {
  if (!game.state) return []
  const result: ActiveAuraEntry[] = []
  for (const side of ['player1', 'player2'] as const) {
    for (const line of Object.values(game.state.players[side].field.lines)) {
      for (const card of line as any[]) {
        if (card.isSilenced) continue
        const effectId = card.cardData?.effectId
        const aura = passiveAuraMap[effectId]
        if (aura) {
          result.push({ ...aura, cardName: card.cardData.name, side })
        }
      }
    }
  }
  return result
})

// Active event cards (Zlot Czarownic, Twierdza, etc.)
const activeEventCards = computed(() => game.state?.activeEvents ?? [])

// ===== SFX WATCHERS =====
const sfx = useSFX()
watch(() => ui.animatingAttack, (v) => { if (v) sfx.sfxAttack() })
watch(() => ui.animatingHit, (v) => { if (v) sfx.sfxHit() })
watch(() => ui.animatingDeath, (v) => { if (v.size > 0) sfx.sfxDeath() }, { deep: true })
watch(() => game.winner, (v) => { if (v) sfx.sfxGameOver() })
watch(() => game.currentPhase, () => sfx.sfxPhase())

// ===== KEYBOARD SHORTCUTS =====
function onKeyDown(e: KeyboardEvent) {
  // Don't handle if modal is open or typing in input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (game.state?.pendingInteraction || ui.pendingActivation || ui.confirmingSurrender) return
  if (game.state?.awaitingOnPlayConfirmation) return
  if (ui.isEnhancedMode || ui.isPlacingCard || ui.isMovingCard || ui.pendingArtifactId) return

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
    ...game.state.players.player1.field.lines[BattleLine.FRONT],
    ...game.state.players.player1.field.lines[BattleLine.RANGED],
    ...game.state.players.player1.field.lines[BattleLine.SUPPORT],
  ]
  const card = allCards.find(c => c.instanceId === cardId)
  if (!card) return ''
  return `${card.cardData.name}: ${(card.cardData as any).effectDescription ?? ''}`
})
</script>

<template>
  <div class="game-board" v-if="game.state && player && ai" :style="bgStyle">

    <!-- ===== EFEKTY POGODOWE ===== -->
    <WeatherEffects :season="game.season" />

    <!-- ===== PASEK GÓRNY ===== -->
    <div class="top-bar">
      <div class="top-bar-left">
        <TurnIndicator />
      </div>
      <div class="top-bar-center">
        <ActionLog />
      </div>
      <div class="top-bar-right">
        <MusicPlayer />
        <PhaseControls />
      </div>
    </div>

    <!-- ===== GŁÓWNA PLANSZA (lewa-prawa) ===== -->
    <div class="board-main">

      <!-- LEWA KOLUMNA: info AI -->
      <div class="sidebar sidebar-ai">
        <DeckPile
          :deck-count="ai.deck.length"
          :hand-count="ai.hand.length"
          :grave-count="ai.graveyard.length"
          :gold="ai.gold"
          :is-a-i="true"
          @open-graveyard="ui.openGraveyardViewer('player2')"
        />
        <!-- AI hand: stacked card backs -->
        <div v-if="ai.hand.length > 0" class="ai-hand-backs">
          <CardBack v-for="i in Math.min(ai.hand.length, 6)" :key="i" :small="true" class="ai-back" />
          <span v-if="ai.hand.length > 6" class="ai-hand-extra">+{{ ai.hand.length - 6 }}</span>
        </div>
        <span v-else class="empty-hand-label">Pusta ręka</span>
        <div class="sidebar-spacer" />
        <button
          v-if="!game.winner"
          class="surrender-side-btn"
          @click="ui.confirmingSurrender = true"
          title="Poddaj grę"
        >
          🏳
        </button>
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
          :gold="player.gold"
          :is-a-i="false"
          :enhanced-active="ui.isEnhancedMode"
          @open-graveyard="ui.openGraveyardViewer('player1')"
          @toggle-enhanced="ui.toggleEnhancedMode()"
        />
      </div>
    </div>

    <!-- ===== WSKAZÓWKA KONTEKSTOWA + AURY (overlayowane nad planszą) ===== -->
    <div class="board-overlays">
      <GameHint />
      <div v-if="activeAuras.length || activeEventCards.length" class="aura-bar">
      <span
        v-for="(a, i) in activeAuras"
        :key="'aura-' + i"
        class="aura-chip"
        :class="a.side === 'player1' ? 'aura-ally' : 'aura-enemy'"
        :title="`${a.cardName}: ${a.desc}`"
      >
        {{ a.icon }} {{ a.label }}
      </span>
      <span
        v-for="ev in activeEventCards"
        :key="'ev-' + ev.instanceId"
        class="aura-chip aura-event"
        :title="`${ev.cardData.name} (${ev.roundsRemaining != null ? ev.roundsRemaining + ' rund' : 'permanentna'})`"
      >
        📜 {{ ev.cardData.name }}
        <span v-if="ev.roundsRemaining != null" class="aura-rounds">{{ ev.roundsRemaining }}</span>
      </span>
      </div>
    </div>

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
          <div class="onplay-title">Efekt przy wystawieniu (GRATIS)</div>
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
            Czy chcesz wydać <strong>{{ ui.pendingActivation.cost }} ZŁ</strong> na aktywację zdolności
            <strong>{{ ui.pendingActivation.cardName }}</strong>?
          </div>
          <div class="onplay-btns">
            <button class="onplay-yes" @click="() => {
              const pa = ui.pendingActivation!
              try {
                if (pa.requiresTarget && pa.availableTargetIds?.length) {
                  game.injectPendingInteraction({
                    type: 'on_play_target',
                    sourceInstanceId: pa.cardInstanceId,
                    respondingPlayer: 'player1',
                    availableTargetIds: pa.availableTargetIds,
                    metadata: { isActivation: true, paidCost: pa.cost },
                  })
                } else {
                  game.activateCreatureEffect(pa.cardInstanceId)
                }
              } finally {
                ui.pendingActivation = null
              }
            }">TAK — Aktywuj</button>
            <button class="onplay-no" @click="ui.pendingActivation = null">NIE — Anuluj</button>
          </div>
        </div>
      </div>
    </Transition>

    <TurnBanner />
    <CardTooltip />
    <AISummaryPanel />
    <GameOverModal />
    <GraveyardModal />
    <PendingInteractionModal />
  </div>

  <div v-else class="board-loading">
    <div class="loading-spinner" />
    Ładowanie gry...
  </div>
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

/* Battlefield background image/gradient layer */
.game-board::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--bf-bg, var(--bg-board));
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transition: background 2s ease;
}

/* Vignette overlay — darker edges for readability */
.game-board::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 85% 70% at 50% 50%,
      transparent 30%,
      rgba(0, 0, 0, var(--vignette-opacity, 0.55)) 100%
    );
}

/* Layout children above the ::before/::after pseudo-elements */
.top-bar, .board-main, .player-hand { position: relative; z-index: 1; }

/* ====== PASEK GÓRNY ====== */
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
  flex-shrink: 0;
  min-height: 44px;
}

.top-bar-left { flex: 0 0 auto; }
.top-bar-center { flex: 1; min-width: 0; }
.top-bar-right { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }

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
  gap: 8px;
  padding: 8px 4px;
  border-right: 1px solid rgba(255,255,255,0.04);
  background: rgba(0,0,0,0.25);
  flex-shrink: 0;
  width: 80px;
}

.sidebar-player {
  border-right: none;
  border-left: 1px solid rgba(255,255,255,0.04);
}

/* AI hand backs */
.ai-hand-backs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

.ai-back {
  margin-top: -20px;
}
.ai-back:first-child {
  margin-top: 0;
}

.ai-hand-extra {
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 2px;
}

.empty-hand-label {
  font-size: 9px;
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
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
  font-size: 14px;
  color: rgba(200, 168, 78, 0.4);
  padding: 4px 0;
  writing-mode: vertical-rl;
  text-shadow: 0 0 8px rgba(200, 168, 78, 0.2);
}

/* ====== OVERLAY HINTS + AURAS (above board, don't affect layout) ====== */
.board-overlays {
  position: absolute;
  bottom: 150px; /* sits above the hand */
  left: 0;
  right: 0;
  z-index: 10;
  pointer-events: none;
  display: flex;
  flex-direction: column;
}
.board-overlays > * {
  pointer-events: auto;
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
.sidebar-spacer { flex: 1; }

.surrender-side-btn {
  padding: 5px 6px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  color: rgba(239, 68, 68, 0.35);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}
.surrender-side-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.5);
}

.toast-fade-enter-active { transition: all 0.25s ease; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(10px); }
.toast-fade-leave-active { transition: all 0.3s ease; }
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

/* ===== AURA BAR ===== */
.aura-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-top: 1px solid rgba(255,255,255,0.04);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  flex-shrink: 0;
  min-height: 24px;
  overflow-x: auto;
  scrollbar-width: none;
}
.aura-bar::-webkit-scrollbar { display: none; }

.aura-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  cursor: help;
  flex-shrink: 0;
}

.aura-ally {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #86efac;
}
.aura-enemy {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}
.aura-event {
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.35);
  color: #fde68a;
}
.aura-rounds {
  font-size: 8px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.4);
  padding: 0 3px;
  border-radius: 3px;
  margin-left: 2px;
}
</style>
