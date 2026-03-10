<script setup lang="ts">
import { computed, ref } from 'vue'
import CreatureCard from '../cards/CreatureCard.vue'
import { Icon } from '@iconify/vue'
import type { CardInstance } from '../../game-engine/types'
import { BattleLine, GamePhase, GOLD_EDITION_RULES } from '../../game-engine/constants'
import lokacjaImg from '~/assets/cards/lokacja.png'
import artefaktImg from '~/assets/cards/artefakt.png'
import defaultAdvImg from '~/assets/cards/creature/117.png'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import { getAllCreaturesOnField } from '../../game-engine/LineManager'
import { getEffect } from '../../game-engine/EffectRegistry'

// Mobile detection — disable hover tooltips, use info button instead
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
if (typeof window !== 'undefined') {
  window.matchMedia('(max-width: 767px)').addEventListener('change', (e) => { isMobile.value = e.matches })
}

function onInfoClick(e: Event, card: CardInstance) {
  e.stopPropagation()
  ui.showTooltip(card.instanceId)
}

const adventureTypeImgs: Record<number, string> = { 1: artefaktImg, 2: lokacjaImg }

const canPlayEnhanced = (card: CardInstance) =>
  (game.player?.gold ?? 0) >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST

const HAND_SIZE = GOLD_EDITION_RULES.STARTING_HAND

const ui = useUIStore()
const game = useGameStore()

const hand = computed(() => game.getHand())

const canDraw = computed(() =>
  game.isPlayerTurn
  && (game.player?.deck.length ?? 0) > 0
  && hand.value.length < HAND_SIZE
)


function onCardClick(card: CardInstance) {
  console.log('[PlayerHand] onCardClick', {
    cardId: card.instanceId,
    cardName: card.cardData.name,
    cardType: card.cardData.cardType,
    isPlayerTurn: game.isPlayerTurn,
    currentPhase: game.currentPhase,
    creaturesPlayed: game.player?.creaturesPlayedThisTurn ?? 0,
    playLimit: GOLD_EDITION_RULES.PLAY_LIMIT_CREATURES,
  })
  if (!game.isPlayerTurn) { console.warn('[PlayerHand] BLOCKED: not player turn'); return }
  if (card.cardData.cardType !== 'creature') { console.log('[PlayerHand] not creature, skipping'); return }
  if (game.currentPhase !== GamePhase.PLAY) { console.warn('[PlayerHand] BLOCKED: not PLAY phase'); return }

  if ((game.player?.creaturesPlayedThisTurn ?? 0) >= GOLD_EDITION_RULES.PLAY_LIMIT_CREATURES) {
    console.warn('[PlayerHand] BLOCKED: play limit reached')
    ui.showPlayLimitToast('Możesz wystawić tylko 1 istotę na turę!')
    return
  }

  ui.selectCardFromHand(card.instanceId)
  console.log('[PlayerHand] after selectCardFromHand', { selectedCardId: ui.selectedCardId, mode: ui.mode })

  if (ui.selectedCardId === card.instanceId) {
    // Sprawdź czy karta wystawiana na pole wroga (Wieszczy, Bieda)
    const effectId = (card.cardData as any).effectId
    const effect = effectId ? getEffect(effectId) : null
    const onEnemyField = effect?.playOnEnemyField === true

    if (onEnemyField) {
      ui.placingOnEnemyField = true
      ui.setHighlightedLines([
        `player2-${BattleLine.FRONT}`,
        `player2-${BattleLine.RANGED}`,
        `player2-${BattleLine.SUPPORT}`,
      ])
    } else {
      ui.setHighlightedLines([
        `player1-${BattleLine.FRONT}`,
        `player1-${BattleLine.RANGED}`,
        `player1-${BattleLine.SUPPORT}`,
      ])
    }
  } else {
    ui.setHighlightedLines([])
  }
}

// Mapa: effectId → typ celu dla przygód zdarzeniowych (typ 0)
// 'ally' = własna istota, 'enemy' = wroga, 'any' = dowolna na polu
const adventureTargetMap: Record<string, 'ally' | 'enemy' | 'any'> = {
  // Zdarzenia celujące w WROGA
  adventure_trucizna: 'enemy',
  adventure_trucizna_enhanced: 'enemy',
  adventure_okaleczenie: 'enemy',
  adventure_okaleczenie_enhanced: 'enemy',
  adventure_wygnanie: 'enemy',
  adventure_wygnanie_enhanced: 'enemy',
  adventure_sza_bitewny: 'enemy',
  adventure_sza_bitewny_enhanced: 'enemy',
  adventure_zacmienie_sonca: 'enemy',
  adventure_zacmienie_sonca_enhanced: 'enemy',
  adventure_topor_peruna: 'enemy',
  adventure_topor_peruna_enhanced: 'enemy',
  // Zdarzenia celujące w SOJUSZNIKA
  adventure_boskie_wsparcie: 'ally',
  adventure_boskie_wsparcie_enhanced: 'ally',
  adventure_matecznik: 'ally',
  adventure_matecznik_enhanced: 'ally',
  adventure_nekromancja: 'ally',
  adventure_nekromancja_enhanced: 'ally',
  adventure_pioro_zarptaka: 'ally',
  adventure_pioro_zarptaka_enhanced: 'ally',
  adventure_aska_roda: 'ally',
  adventure_aska_roda_enhanced: 'ally',
  adventure_aska_swietowida: 'ally',
  adventure_aska_swietowida_enhanced: 'ally',
  adventure_kwiat_paproci: 'ally',
  adventure_kwiat_paproci_enhanced: 'ally',
  adventure_moc_swiatogora: 'ally',
  adventure_moc_swiatogora_enhanced: 'ally',
  adventure_likantropia: 'ally',
  adventure_likantropia_enhanced: 'ally',
  // Zdarzenia celujące w DOWOLNĄ istotę
  adventure_obled: 'any',
  adventure_obled_enhanced: 'any',
  adventure_srebrna_gaaz: 'any',
  adventure_srebrna_gaaz_enhanced: 'any',
  adventure_gusa: 'any',
  adventure_gusa_enhanced: 'any',
  adventure_rusalczy_taniec: 'any',
  adventure_rusalczy_taniec_enhanced: 'any',
  adventure_sobowtór: 'any',
  adventure_sobowtór_enhanced: 'any',
  adventure_braterstwo_bogatyrow: 'any',
  adventure_braterstwo_bogatyrow_enhanced: 'any',
  adventure_zertwa: 'ally',
  adventure_zertwa_enhanced: 'ally',
  adventure_przyjazn: 'ally',
  adventure_przyjazn_enhanced: 'ally',
}

function onPlayAdventure(card: CardInstance, useEnhanced: boolean) {
  if (!game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY) return

  if (useEnhanced && (game.player?.gold ?? 0) < GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST) {
    ui.showPlayLimitToast(`Potrzebujesz ${GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST} ZŁ na ulepszony efekt!`)
    return
  }

  const adventureType = (card.cardData as any).adventureType
  const effectId = useEnhanced
    ? ((card.cardData as any).enhancedEffectId ?? (card.cardData as any).effectId)
    : (card.cardData as any).effectId

  // Artefakt (typ 1) — zawsze wymaga celu (własna istota)
  if (adventureType === 1) {
    const hasOwnCreatures = game.state
      ? getAllCreaturesOnField(game.state, 'player1').length > 0
      : false
    if (!hasOwnCreatures) {
      ui.showPlayLimitToast('Nie masz istot na polu do wyposażenia!')
      return
    }
    ui.setPendingArtifact(card.instanceId, 'ally', useEnhanced)
    ui.showPlayLimitToast('Kliknij istotę na polu, którą chcesz wyposażyć')
    return
  }

  // Zdarzenie (typ 0) — sprawdź czy wymaga celu
  const targetType = adventureTargetMap[effectId]
  if (targetType) {
    const hasTargets = game.state
      ? (targetType === 'enemy'
          ? getAllCreaturesOnField(game.state, 'player2').length > 0
          : targetType === 'ally'
            ? getAllCreaturesOnField(game.state, 'player1').length > 0
            : (getAllCreaturesOnField(game.state, 'player1').length + getAllCreaturesOnField(game.state, 'player2').length) > 0
        )
      : false
    if (!hasTargets) {
      ui.showPlayLimitToast('Brak dostępnych celów!')
      return
    }
    ui.setPendingArtifact(card.instanceId, targetType, useEnhanced)
    const hint = targetType === 'enemy' ? 'Kliknij wrogą istotę jako cel'
      : targetType === 'ally' ? 'Kliknij swoją istotę jako cel'
      : 'Kliknij istotę na polu jako cel'
    ui.showPlayLimitToast(hint)
    return
  }

  // Bez celu — graj od razu
  game.playAdventure(card.instanceId, undefined, useEnhanced)
  ui.clearSelection()
}

// Fan layout: karty ułożone w łuk
function fanStyle(idx: number, total: number) {
  if (total <= 1) return {}
  const maxAngle = Math.min(total * 4, 28) // max spread angle
  const mid = (total - 1) / 2
  const offset = idx - mid
  const angle = offset * (maxAngle / Math.max(total - 1, 1))
  const lift = -Math.abs(offset) * 6 // outer cards lower
  return {
    '--fan-angle': `${angle}deg`,
    '--fan-lift': `${lift}px`,
    'z-index': idx, // leftmost cards below
  } as Record<string, string | number>
}

const adventureTypeLabel = (card: CardInstance) => {
  const type = (card.cardData as any).adventureType
  return type === 0 ? 'Zdarzenie' : type === 1 ? 'Artefakt' : 'Lokacja'
}

const adventureTypeColor = (card: CardInstance) => {
  const type = (card.cardData as any).adventureType
  return type === 0 ? '#f59e0b' : type === 1 ? '#6366f1' : '#10b981'
}
</script>

<template>
  <div class="player-hand">
    <div class="hand-cards">
      <!-- Karty na ręce — fan layout -->
      <div
        v-for="(card, idx) in hand"
        :key="card.instanceId"
        :class="['hand-card-wrap', { selected: ui.selectedCardId === card.instanceId }]"
        :style="fanStyle(idx, hand.length)"
        @click="onCardClick(card)"
        @mouseenter="!isMobile && ui.showTooltip(card.instanceId)"
        @mouseleave="!isMobile && ui.hideTooltip()"
      >
        <!-- Mobile: info button for tooltip -->
        <button v-if="isMobile" class="mobile-info-btn" @click.stop="onInfoClick($event, card)">ℹ</button>

        <!-- Istota -->
        <CreatureCard
          v-if="card.cardData.cardType === 'creature'"
          :card="card"
          :selected="ui.selectedCardId === card.instanceId"
          :in-hand="true"
        />

        <!-- Karta Przygody (full-art redesign) -->
        <div
          v-else
          class="adventure-card"
          :style="{ '--adv-color': adventureTypeColor(card) }"
        >
          <!-- Full art background -->
          <img :src="defaultAdvImg" class="adv-art" aria-hidden="true" />
          <div class="adv-vignette" />
          <div class="adv-gradient-top" />
          <div class="adv-gradient-bottom" />

          <!-- Top: card name -->
          <div class="adv-header">
            <span class="adv-name">{{ card.cardData.name.toUpperCase() }}</span>
          </div>

          <!-- Bottom: type + action buttons -->
          <div class="adv-footer">
            <div class="adv-type-row">
              <img v-if="adventureTypeImgs[(card.cardData as any).adventureType]" :src="adventureTypeImgs[(card.cardData as any).adventureType]" class="adv-type-img" />
              <span class="adv-type-label">{{ adventureTypeLabel(card) }}</span>
            </div>
            <div class="adv-action-row">
              <button
                class="adv-btn-basic"
                :disabled="!game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY || (game.player?.adventuresPlayedThisTurn ?? 0) >= GOLD_EDITION_RULES.PLAY_LIMIT_ADVENTURES"
                @click.stop="onPlayAdventure(card, false)"
              >⚡</button>
              <button
                class="adv-btn-enhanced"
                :disabled="!game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY || !canPlayEnhanced(card) || (game.player?.adventuresPlayedThisTurn ?? 0) >= GOLD_EDITION_RULES.PLAY_LIMIT_ADVENTURES"
                @click.stop="onPlayAdventure(card, true)"
              >🪙{{ GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Karta Dobierz — wygląda jak karta w ręce -->
      <div v-if="canDraw" class="hand-card-wrap draw-card-wrap" @click="game.drawCard()">
        <div class="draw-card">
          <Icon icon="game-icons:card-draw" class="draw-card-icon" />
          <span class="draw-card-label">DOBIERZ</span>
        </div>
      </div>

      <div v-if="hand.length === 0 && !canDraw" class="hand-empty">Pusta ręka</div>
    </div>
  </div>
</template>

<style scoped>
.player-hand {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 12px;
  padding: 0;
  height: 174px;
  flex-shrink: 0;
  overflow: visible;
  position: relative;
  z-index: 10;
}


.hand-cards {
  display: flex;
  gap: 0;
  align-items: flex-end;
  justify-content: center;
  padding: 36px 32px 12px;
  overflow: visible;
  background: linear-gradient(to top, rgba(4,3,10,0.95) 0%, rgba(4,3,10,0.75) 50%, rgba(4,3,10,0.25) 80%, transparent 100%);
  border-radius: 28px 28px 0 0;
  min-height: 174px;
  perspective: 600px;
}

.hand-card-wrap {
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  margin-left: -18px;
  position: relative;
  border-radius: 8px;
  transform-origin: center bottom;
  transform: rotate(var(--fan-angle, 0deg)) translateY(var(--fan-lift, 0px));
}
.hand-card-wrap:first-child {
  margin-left: 0;
}
.hand-card-wrap:hover {
  transform: rotate(0deg) translateY(-28px) scale(1.18) !important;
  z-index: 30 !important;
}
/* Invisible hit area below card — prevents jitter when card lifts on hover */
.hand-card-wrap::before {
  content: '';
  position: absolute;
  left: -4px;
  right: -4px;
  bottom: -8px;
  top: -32px;
  pointer-events: auto;
  z-index: -1;
}
.hand-card-wrap:hover::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 14px;
  background: radial-gradient(ellipse, rgba(200,168,78,0.12), transparent 70%);
  pointer-events: none;
}

.hand-card-wrap.selected {
  box-shadow: 0 0 0 2px #818cf8;
  border-radius: 8px;
  transform: rotate(0deg) translateY(-30px) scale(1.2) !important;
  z-index: 35 !important;
}

/* Adventure card */
/* ===== ADVENTURE CARD (full-art redesign) ===== */
.adventure-card {
  position: relative;
  width: 110px;
  height: 154px;
  border-radius: 6px;
  border: 2px solid color-mix(in srgb, var(--adv-color, #6366f1) 35%, transparent);
  background: #0a0406;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(0,0,0,0.7);
}

.adv-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 25%;
  pointer-events: none;
}
.adv-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 95% 85% at 50% 35%, transparent 30%, rgba(0,0,0,0.4) 100%);
  pointer-events: none;
}
.adv-gradient-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 45%;
  background: linear-gradient(rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%);
  pointer-events: none;
}
.adv-gradient-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 35%;
  background: linear-gradient(transparent, rgba(5,3,8,0.95));
  pointer-events: none;
}

/* Top: card name */
.adv-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  padding: 6px 6px 0;
  text-align: center;
}
.adv-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 800;
  color: #f0ede8;
  line-height: 1.05;
  text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 1px 6px rgba(0,0,0,0.9), 0 0 20px color-mix(in srgb, var(--adv-color) 25%, transparent);
  letter-spacing: 0.04em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* Bottom: type + action buttons */
.adv-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
  padding: 4px 6px 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(0,0,0,0.82);
  border-top: 1px solid color-mix(in srgb, var(--adv-color) 15%, transparent);
}
.adv-type-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.adv-type-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  opacity: 0.85;
}
.adv-type-label {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, var(--adv-color) 80%, transparent);
}

.adv-action-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.adv-btn-basic {
  background: color-mix(in srgb, var(--adv-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--adv-color) 40%, transparent);
  border-radius: 4px;
  color: var(--adv-color);
  font-size: 12px;
  padding: 2px 8px;
  cursor: pointer;
  line-height: 1.2;
  transition: background 0.12s;
}
.adv-btn-basic:hover:not(:disabled) { background: color-mix(in srgb, var(--adv-color) 25%, transparent); }
.adv-btn-basic:disabled { opacity: 0.25; cursor: not-allowed; }

.adv-btn-enhanced {
  background: rgba(251,191,36,0.08);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 4px;
  color: #fbbf24;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  cursor: pointer;
  line-height: 1.2;
  transition: background 0.12s;
}
.adv-btn-enhanced:hover:not(:disabled) { background: rgba(251,191,36,0.2); }
.adv-btn-enhanced:disabled { opacity: 0.25; cursor: not-allowed; }

@keyframes adv-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
  50%       { box-shadow: 0 0 0 3px rgba(99,102,241,0.35); }
}

.hand-empty {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  margin: auto;
}

/* Karta Dobierz */
.draw-card-wrap {
  cursor: pointer !important;
}
.draw-card {
  width: 110px;
  height: 154px;
  border-radius: 6px;
  border: 2px solid rgba(99, 102, 241, 0.35);
  background: linear-gradient(160deg, rgba(99,102,241,0.15) 0%, rgba(55,48,107,0.12) 50%, rgba(30,25,60,0.2) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
}
.draw-card-wrap:hover .draw-card {
  border-color: rgba(99, 102, 241, 0.7);
  background: linear-gradient(160deg, rgba(99,102,241,0.28) 0%, rgba(79,70,229,0.18) 50%, rgba(55,48,107,0.15) 100%);
  box-shadow: 0 0 20px 4px rgba(99,102,241,0.2);
}
.draw-card-icon {
  font-size: 36px;
  color: rgba(99, 102, 241, 0.7);
}
.draw-card-label {
  font-size: 12px;
  font-weight: 800;
  color: rgba(99, 102, 241, 0.8);
  letter-spacing: 0.1em;
}

/* Mobile info button (hidden on desktop) */
.mobile-info-btn {
  display: none;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .player-hand {
    height: auto;
    min-height: 0;
  }
  .hand-cards {
    padding: 8px 8px 6px;
    min-height: 96px;
    gap: 0;
    border-radius: 14px 14px 0 0;
    overflow-x: auto;
    overflow-y: visible;
    justify-content: flex-start;
    scrollbar-width: none;
  }
  .hand-cards::-webkit-scrollbar { display: none; }

  /* Wyłącz fan layout na mobile — horizontal scroll zamiast */
  .hand-card-wrap {
    margin-left: -14px;
    transform: none !important;
    position: relative;
  }
  .hand-card-wrap:first-child {
    margin-left: 0;
  }
  .hand-card-wrap:hover {
    transform: translateY(-12px) scale(1.08) !important;
  }
  .hand-card-wrap.selected {
    transform: translateY(-14px) scale(1.1) !important;
    box-shadow: 0 0 0 1.5px #818cf8;
  }
  .hand-card-wrap:hover::after {
    inset: -4px;
  }

  /* Mobile info button: small circle in top-right corner */
  .mobile-info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: -4px;
    right: -4px;
    z-index: 40;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.85);
    border: 1px solid rgba(129, 140, 248, 0.6);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 0;
    cursor: pointer;
    line-height: 1;
    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
  }

  .adventure-card,
  .draw-card {
    width: 62px;
    height: 86px;
    border-radius: 4px;
  }
  .adv-name {
    font-size: 9px;
  }
  .adv-header {
    padding: 3px 3px 0;
  }
  .adv-type-label {
    font-size: 6px;
  }
  .adv-type-img {
    width: 10px;
    height: 10px;
  }
  .adv-btn-basic {
    font-size: 9px;
    padding: 1px 4px;
  }
  .adv-btn-enhanced {
    font-size: 7px;
    padding: 1px 3px;
  }
  .adv-footer {
    padding: 2px 3px 3px;
    gap: 2px;
  }
  .adv-action-row {
    gap: 2px;
  }
  .draw-card-icon {
    font-size: 20px;
  }
  .draw-card-label {
    font-size: 9px;
  }
}
</style>
