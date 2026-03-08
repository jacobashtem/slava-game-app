<script setup lang="ts">
import { computed, ref } from 'vue'
import CreatureCard from '../cards/CreatureCard.vue'
import type { CardInstance } from '../../game-engine/types'
import { BattleLine as BL, CardPosition, GamePhase } from '../../game-engine/constants'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import { getAllCreaturesOnField, canAttack } from '../../game-engine/LineManager'
import { canActivateEffect, getEffect } from '../../game-engine/EffectRegistry'

const props = defineProps<{
  cards: CardInstance[]
  line: BL
  side: 'player1' | 'player2'
  isPlayerSide: boolean
}>()

const ui = useUIStore()
const game = useGameStore()

const isDragOver = ref(false)

const lineKey = computed(() => `${props.side}-${props.line}`)
const isHighlighted = computed(() => ui.highlightedLines.has(lineKey.value))
const isDropTarget = computed(() =>
  props.isPlayerSide && isHighlighted.value && ui.isPlacingCard
)
const isEnemyAttackTarget = computed(() =>
  !props.isPlayerSide && ui.isSelectingTarget
)

const lineLabel = computed(() => ({
  [BL.FRONT]: 'L1',
  [BL.RANGED]: 'L2',
  [BL.SUPPORT]: 'L3',
}[props.line]))

// ===== KLIK NA LINIĘ (wystawianie z ręki) =====
function onLineClick() {
  if (!props.isPlayerSide) return
  if (ui.isPlacingCard && ui.selectedCardId) {
    game.playCreature(ui.selectedCardId, props.line)
    ui.clearSelection()
  }
}

// ===== KLIK NA KARTĘ =====
function onCardClick(card: CardInstance) {
  if (!game.isPlayerTurn) return

  if (props.isPlayerSide) {
    // Artefakt czeka na cel
    if (ui.pendingArtifactId && game.currentPhase === GamePhase.PLAY) {
      game.playAdventure(ui.pendingArtifactId, card.instanceId)
      ui.clearPendingArtifact()
      return
    }

    if (game.currentPhase === GamePhase.COMBAT) {
      // W COMBAT: karta w obronie nie może atakować — zmiana pozycji przez badge
      if (card.position === CardPosition.DEFENSE) return
      if (card.cannotAttack) {
        ui.showPlayLimitToast('Ta istota nie może atakować (efekt statusu).')
        return
      }
      if (card.hasAttackedThisTurn) {
        ui.showPlayLimitToast('Ta istota już atakowała w tej turze.')
        return
      }
      // Limit: tylko jeden atak na turę
      const alreadyAttacked = game.state ? getAllCreaturesOnField(game.state, 'player1').some(c => c.hasAttackedThisTurn) : false
      if (alreadyAttacked) {
        ui.showPlayLimitToast('Możesz wykonać tylko jeden atak na turę.')
        return
      }
      ui.selectAttacker(card.instanceId)
      const targets = getValidTargets(card)
      if (targets.length === 0) {
        ui.showPlayLimitToast('Ta istota nie ma dostępnych celów. Sprawdź typ ataku i linię.')
        ui.clearSelection()
        return
      }
      ui.setValidAttackTargets(targets)
    }
    // PLAY faza: klik = zmień pozycję (obsługiwane przez togglePositionOnClick prop)
  } else {
    // Klik na wrogą kartę → atak
    if (ui.isSelectingTarget && ui.attackingCardId) {
      if (ui.validAttackTargets.has(card.instanceId)) {
        game.attack(ui.attackingCardId, card.instanceId)
        ui.clearSelection()
      } else {
        const attacker = game.findCardOnField('player1', ui.attackingCardId)
        if (attacker && game.state) {
          const check = canAttack(game.state, attacker, card)
          if (!check.valid) ui.showPlayLimitToast(check.reason ?? 'Nieprawidłowy cel.')
        }
      }
    }
  }
}

// Zmiana pozycji (emitowana przez CreatureCard gdy togglePositionOnClick)
function onChangePosition(card: CardInstance) {
  if (!game.isPlayerTurn) return
  const newPos = card.position === CardPosition.ATTACK ? CardPosition.DEFENSE : CardPosition.ATTACK
  game.changePosition(card.instanceId, newPos)
}

function isEffectAvailable(card: CardInstance): boolean {
  if (!props.isPlayerSide || !game.isPlayerTurn || !game.state) return false
  return canActivateEffect(game.state, card)
}

function getEffectCost(card: CardInstance): number | undefined {
  if (card.metadata.freeActivationPending) return 0
  const effect = getEffect((card.cardData as any).effectId)
  return effect?.activatable ? (effect.activationCost ?? 0) : undefined
}

function onActivateEffect(card: CardInstance) {
  game.requestActivateEffect(card.instanceId)
}

function getValidTargets(attacker: CardInstance): string[] {
  if (!game.state) return []
  return getAllCreaturesOnField(game.state, 'player2')
    .filter(e => canAttack(game.state!, attacker, e).valid)
    .map(e => e.instanceId)
}

// ===== DRAG & DROP (przenoszenie między liniami) =====
let _draggingId = ''

function onDragStart(e: DragEvent, card: CardInstance) {
  if (!props.isPlayerSide || !game.isPlayerTurn) return
  _draggingId = card.instanceId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', card.instanceId)
  }
}

function onDragEnd() {
  _draggingId = ''
  isDragOver.value = false
}

function onDragOver(e: DragEvent) {
  if (!props.isPlayerSide || !game.isPlayerTurn) return
  e.preventDefault()
  isDragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave() {
  isDragOver.value = false
}

function onLineDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const cardId = e.dataTransfer?.getData('text/plain') || _draggingId
  if (cardId && props.isPlayerSide && game.isPlayerTurn) {
    game.moveCreatureLine(cardId, props.line)
  }
  _draggingId = ''
}
</script>

<template>
  <div
    :class="['battle-line', `line-${line}`, { highlighted: isDropTarget || isDragOver, 'enemy-targeting': isEnemyAttackTarget }]"
    @click.self="onLineClick"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onLineDrop"
  >
    <span class="line-label">{{ lineLabel }}</span>

    <div class="cards-col">
      <div
        v-for="card in cards"
        :key="card.instanceId"
        class="card-wrap"
        :draggable="isPlayerSide && game.isPlayerTurn && game.currentPhase === GamePhase.PLAY"
        @dragstart="onDragStart($event, card)"
        @dragend="onDragEnd"
      >
        <!-- Floating damage number -->
        <div v-if="ui.hitAmounts[card.instanceId]" class="damage-number" :key="`dmg-${card.instanceId}-${ui.hitAmounts[card.instanceId]}`">
          -{{ ui.hitAmounts[card.instanceId] }}
        </div>

        <CreatureCard
          :card="card"
          :selected="ui.selectedCardId === card.instanceId || ui.attackingCardId === card.instanceId"
          :is-attacking="ui.attackingCardId === card.instanceId || ui.animatingAttack === card.instanceId"
          :is-hit="ui.animatingHit === card.instanceId"
          :is-dying="ui.animatingDeath.has(card.instanceId)"
          :is-valid-target="ui.validAttackTargets.has(card.instanceId)"
          :dimmed="ui.isSelectingTarget && !ui.validAttackTargets.has(card.instanceId) && !isPlayerSide"
          :toggle-position-on-click="isPlayerSide && game.isPlayerTurn && game.currentPhase === GamePhase.PLAY && !ui.pendingArtifactId"
          :can-toggle-position="isPlayerSide && game.isPlayerTurn && (game.currentPhase === GamePhase.PLAY || (game.currentPhase === GamePhase.COMBAT && !card.hasAttackedThisTurn)) && !ui.pendingArtifactId"
          :effect-available="isEffectAvailable(card)"
          :effect-cost="getEffectCost(card)"
          @click="onCardClick(card)"
          @change-position="onChangePosition(card)"
          @activate-effect="onActivateEffect(card)"
          @mouseenter="ui.showTooltip(card.instanceId)"
          @mouseleave="ui.hideTooltip()"
        />
      </div>

      <!-- Drop zone: visible when placing (regardless of cards already in line) -->
      <div
        v-if="isPlayerSide && isDropTarget"
        class="empty-slot active"
        @click.stop="onLineClick"
      >
        <span>+</span>
      </div>
      <div v-else-if="cards.length === 0" class="empty-slot" @click="onLineClick" />
    </div>
  </div>
</template>

<style scoped>
.battle-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 100px;
  height: 100%;
  padding: 4px 4px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-line);
  transition: border-color 0.2s, background 0.2s;
  position: relative;
  gap: 4px;
  overflow-y: auto;
}

.battle-line.highlighted {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.06);
  cursor: pointer;
}

.battle-line.enemy-targeting {
  cursor: crosshair;
}
.battle-line.enemy-targeting .card-wrap {
  cursor: crosshair;
}

.line-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
  font-family: monospace;
  flex-shrink: 0;
  padding: 2px 0;
}

.cards-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  width: 100%;
}

.card-wrap {
  position: relative;
}

/* ===== FLOATING DAMAGE NUMBER ===== */
.damage-number {
  position: absolute;
  top: -10px;
  left: 50%;
  z-index: 30;
  font-size: 22px;
  font-weight: 900;
  color: #ef4444;
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.9), 0 2px 6px rgba(0, 0, 0, 0.95);
  pointer-events: none;
  white-space: nowrap;
  font-family: monospace;
  letter-spacing: -0.5px;
  animation: dmg-float 1.6s ease forwards;
}
@keyframes dmg-float {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.2); }
  15%  { transform: translateX(-50%) translateY(-6px) scale(1.4); }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-55px) scale(0.9); }
}


.empty-slot {
  width: 80px;
  height: 112px;
  border-radius: 6px;
  border: 1px dashed var(--border-highlight);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.3;
  transition: opacity 0.2s;
}

.empty-slot.active {
  opacity: 0.8;
  border-color: rgba(99, 102, 241, 0.7);
  color: rgba(99, 102, 241, 0.9);
  font-size: 24px;
  cursor: pointer;
}
.empty-slot.active:hover {
  background: rgba(99, 102, 241, 0.1);
}
</style>
