<script setup lang="ts">
import { computed } from 'vue'
import CreatureCard from '../cards/CreatureCard.vue'
import { Icon } from '@iconify/vue'
import type { CardInstance } from '../../game-engine/types'
import { BattleLine, GamePhase, GOLD_EDITION_RULES } from '../../game-engine/constants'
import lokacjaImg from '~/assets/cards/lokacja.png'
import artefaktImg from '~/assets/cards/artefakt.png'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import { getAllCreaturesOnField } from '../../game-engine/LineManager'

const adventureTypeImgs: Record<number, string> = { 1: artefaktImg, 2: lokacjaImg }

const canPlayEnhanced = (card: CardInstance) =>
  (game.player?.gold ?? 0) >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST

const HAND_SIZE = GOLD_EDITION_RULES.STARTING_HAND

const ui = useUIStore()
const game = useGameStore()

const hand = computed(() => game.getHand())

const canDraw = computed(() =>
  game.isPlayerTurn
  && (game.currentPhase === GamePhase.PLAY || game.currentPhase === GamePhase.COMBAT)
  && (game.player?.deck.length ?? 0) > 0
  && hand.value.length < HAND_SIZE
)

// Hand composition summary
const creatureCount = computed(() => hand.value.filter(c => c.cardData.cardType === 'creature').length)
const adventureCount = computed(() => hand.value.filter(c => c.cardData.cardType !== 'creature').length)

function onCardClick(card: CardInstance) {
  if (!game.isPlayerTurn) return
  if (card.cardData.cardType !== 'creature') return
  if (game.currentPhase !== GamePhase.PLAY) return

  if ((game.player?.creaturesPlayedThisTurn ?? 0) >= GOLD_EDITION_RULES.PLAY_LIMIT_CREATURES) {
    ui.showPlayLimitToast('Możesz wystawić tylko 1 istotę na turę!')
    return
  }

  ui.selectCardFromHand(card.instanceId)

  if (ui.selectedCardId === card.instanceId) {
    ui.setHighlightedLines([
      `player1-${BattleLine.FRONT}`,
      `player1-${BattleLine.RANGED}`,
      `player1-${BattleLine.SUPPORT}`,
    ])
  } else {
    ui.setHighlightedLines([])
  }
}

function onPlayAdventure(card: CardInstance, useEnhanced: boolean) {
  if (!game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY) return

  if (useEnhanced && (game.player?.gold ?? 0) < GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST) {
    ui.showPlayLimitToast(`Potrzebujesz ${GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST} ZŁ na ulepszony efekt!`)
    return
  }

  const adventureType = (card.cardData as any).adventureType
  if (adventureType === 1) {
    const hasOwnCreatures = game.state
      ? getAllCreaturesOnField(game.state, 'player1').length > 0
      : false
    if (!hasOwnCreatures) {
      ui.showPlayLimitToast('Nie masz istot na polu do wyposażenia!')
      return
    }
    ui.setPendingArtifact(card.instanceId)
    ui.showPlayLimitToast('Kliknij istotę na polu, którą chcesz wyposażyć')
    return
  }

  game.playAdventure(card.instanceId, undefined, useEnhanced)
}

const adventureTypeLabel = (card: CardInstance) => {
  const type = (card.cardData as any).adventureType
  return type === 0 ? 'Zdarzen.' : type === 1 ? 'Artefakt' : 'Lokacja'
}

const adventureTypeColor = (card: CardInstance) => {
  const type = (card.cardData as any).adventureType
  return type === 0 ? '#f59e0b' : type === 1 ? '#6366f1' : '#10b981'
}
</script>

<template>
  <div class="player-hand">
    <div class="hand-label">
      <Icon icon="game-icons:card-hand" />
      <span>Ręka ({{ hand.length }})</span>
      <span v-if="hand.length > 0" class="hand-composition">
        <span class="hc-creature" v-if="creatureCount > 0">{{ creatureCount }}i</span>
        <span class="hc-adventure" v-if="adventureCount > 0">{{ adventureCount }}p</span>
      </span>
    </div>

    <div class="hand-cards">
      <!-- Karty na ręce -->
      <div
        v-for="card in hand"
        :key="card.instanceId"
        :class="['hand-card-wrap', { selected: ui.selectedCardId === card.instanceId }]"
        @click="onCardClick(card)"
        @mouseenter="ui.showTooltip(card.instanceId)"
        @mouseleave="ui.hideTooltip()"
      >
        <!-- Istota -->
        <CreatureCard
          v-if="card.cardData.cardType === 'creature'"
          :card="card"
          :selected="ui.selectedCardId === card.instanceId"
          :in-hand="true"
        />

        <!-- Karta Przygody -->
        <div
          v-else
          class="adventure-card"
          :style="{ '--adv-color': adventureTypeColor(card) }"
        >
          <div class="adv-type">
            <img v-if="adventureTypeImgs[(card.cardData as any).adventureType]" :src="adventureTypeImgs[(card.cardData as any).adventureType]" class="adv-type-img" />
            {{ adventureTypeLabel(card) }}
          </div>
          <div class="adv-name">{{ card.cardData.name }}</div>
          <div class="adv-effects">
            <div class="adv-effect-desc basic">
              <span class="effect-label">Bazowy</span>
              <span class="effect-text">{{ (card.cardData as any).effectDescription?.slice(0, 42) }}…</span>
            </div>
            <div class="adv-effect-desc enhanced">
              <span class="effect-label">Ulepszony</span>
              <span class="effect-text">{{ (card.cardData as any).enhancedEffectDescription?.slice(0, 42) }}…</span>
            </div>
          </div>
          <div class="adv-ability-row">
            <button
              class="adv-btn-basic"
              :disabled="!game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY || (game.player?.adventuresPlayedThisTurn ?? 0) >= GOLD_EDITION_RULES.PLAY_LIMIT_ADVENTURES"
              @click.stop="onPlayAdventure(card, false)"
            >⚡ ZAGRAJ</button>
            <button
              class="adv-btn-enhanced"
              :disabled="!game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY || !canPlayEnhanced(card) || (game.player?.adventuresPlayedThisTurn ?? 0) >= GOLD_EDITION_RULES.PLAY_LIMIT_ADVENTURES"
              @click.stop="onPlayAdventure(card, true)"
            >🪙{{ GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST }} ZŁ</button>
          </div>
        </div>
      </div>

      <div v-if="hand.length === 0" class="hand-empty">Pusta ręka</div>
    </div>

    <!-- Dobieranie: osobna sekcja po prawej, nie wpływa na układ kart -->
    <div v-if="canDraw" class="draw-section">
      <div class="draw-slot" @click="game.drawCard()">
        <Icon icon="game-icons:card-draw" class="draw-slot-icon" />
        <span class="draw-slot-label">Dobierz</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-hand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.3);
  border-top: 1px solid var(--border-default);
  height: 150px;
  flex-shrink: 0;
  overflow: hidden;
}

.hand-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 44px;
  flex-shrink: 0;
}

.hand-composition {
  display: flex;
  gap: 4px;
  font-size: 8px;
  font-weight: 700;
}

.hc-creature { color: #86efac; }
.hc-adventure { color: #fbbf24; }

.hand-cards {
  display: flex;
  gap: 6px;
  align-items: center;
  flex: 1;
  padding: 0 4px;
  overflow-x: auto;
  overflow-y: hidden;
  height: 100%;
}

.hand-card-wrap {
  cursor: pointer;
  flex-shrink: 0;
}

.hand-card-wrap.selected {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
  border-radius: 8px;
}

/* Adventure card */
.adventure-card {
  width: 120px;
  min-height: 112px;
  border-radius: 6px;
  border: 2px solid var(--adv-color, #6366f1);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  padding: 5px 5px 4px;
  gap: 3px;
  flex-shrink: 0;
}

.adv-type {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--adv-color);
  font-weight: 600;
}

.adv-type-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  opacity: 0.85;
  flex-shrink: 0;
}

.adv-name {
  font-size: 10px;
  font-weight: 700;
  color: #e2e8f0;
  line-height: 1.2;
}

.adv-effects {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.adv-effect-desc {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 3px;
  border-radius: 3px;
}
.adv-effect-desc.basic { background: rgba(99,102,241,0.08); }
.adv-effect-desc.enhanced { background: rgba(251,191,36,0.08); }

.effect-label {
  font-size: 7px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.basic .effect-label { color: #818cf8; }
.enhanced .effect-label { color: #fbbf24; }

.effect-text {
  font-size: 8px;
  color: #94a3b8;
  line-height: 1.3;
}

.adv-ability-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 2px;
  margin-top: 2px;
}

.adv-btn-basic {
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.5);
  border-radius: 3px;
  color: #a78bfa;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.2;
  animation: adv-pulse 1.5s ease-in-out infinite;
  transition: background 0.12s;
}
.adv-btn-basic:hover:not(:disabled) { background: rgba(99,102,241,0.3); }
.adv-btn-basic:disabled { opacity: 0.35; cursor: not-allowed; animation: none; }

.adv-btn-enhanced {
  background: rgba(251,191,36,0.08);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 3px;
  color: #fbbf24;
  font-size: 8px;
  font-weight: 600;
  padding: 2px 4px;
  cursor: pointer;
  opacity: 0.75;
  white-space: nowrap;
  line-height: 1.2;
  transition: opacity 0.12s, background 0.12s;
}
.adv-btn-enhanced:hover:not(:disabled) { opacity: 1; background: rgba(251,191,36,0.2); }
.adv-btn-enhanced:disabled { opacity: 0.3; cursor: not-allowed; }

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

/* Dobieranie — osobna sekcja, nie przesuwa kart */
.draw-section {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  border-left: 1px solid rgba(255,255,255,0.06);
  padding-left: 10px;
}

.draw-slot {
  width: 80px;
  height: 112px;
  border-radius: 6px;
  border: 2px dashed rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  flex-shrink: 0;
}

.draw-slot:hover {
  border-color: rgba(99, 102, 241, 0.8);
  background: rgba(99, 102, 241, 0.12);
}

.draw-slot-icon {
  font-size: 22px;
  color: rgba(99, 102, 241, 0.6);
}

.draw-slot-label {
  font-size: 9px;
  font-weight: 600;
  color: rgba(99, 102, 241, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
