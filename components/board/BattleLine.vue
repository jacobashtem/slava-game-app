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

const lineName = computed(() => ({
  [BL.FRONT]: 'Jawia',
  [BL.RANGED]: 'Prawia',
  [BL.SUPPORT]: 'Nawia',
}[props.line]))

const MAX_SLOTS = 5
const ghostSlots = computed(() => Math.max(0, MAX_SLOTS - props.cards.length))

// ===== KLIK NA LINIĘ (wystawianie z ręki) =====
function onLineClick(e: MouseEvent) {
  if (!ui.isPlacingCard || !ui.selectedCardId) return
  // Wystawianie na pole wroga (Wieszczy, Bieda) — klik na linię wroga
  if (ui.placingOnEnemyField) {
    if (props.isPlayerSide) return // klik na własne linie zignoruj
  } else {
    if (!props.isPlayerSide) return // normalnie: tylko własne linie
  }
  // Nie reaguj gdy klik był na karcie (CreatureCard obsługuje to)
  const target = e.target as HTMLElement
  if (target.closest('.creature-card')) return
  game.playCreature(ui.selectedCardId, props.line)
  ui.clearSelection()
}

// ===== KLIK NA KARTĘ =====
function onCardClick(card: CardInstance) {
  if (!game.isPlayerTurn) return

  if (props.isPlayerSide) {
    // Artefakt czeka na cel
    if (ui.pendingArtifactId && game.currentPhase === GamePhase.PLAY) {
      try {
        game.playAdventure(ui.pendingArtifactId, card.instanceId)
      } finally {
        ui.clearPendingArtifact()
      }
      return
    }

    if (game.currentPhase === GamePhase.COMBAT) {
      // W COMBAT: karta w obronie nie może atakować — zmiana pozycji przez badge
      if (card.position === CardPosition.DEFENSE) {
        ui.showPlayLimitToast('Istota jest w obronie — zmień pozycję na atak.')
        return
      }
      if (card.cannotAttack) {
        ui.showPlayLimitToast('Ta istota nie może atakować (efekt statusu).')
        return
      }
      // Leśnica: może atakować 2 razy
      const isLesnica = (card.cardData as any).effectId === 'lesnica_double_attack'
      const attacksThisTurn = (card.metadata.attacksThisTurn as number) ?? 0
      if (isLesnica && attacksThisTurn >= 2) {
        ui.showPlayLimitToast('Leśnica już atakowała dwa razy w tej turze.')
        return
      }
      if (!isLesnica && card.hasAttackedThisTurn && !((card.metadata.freeAttacksLeft as number) > 0)) {
        ui.showPlayLimitToast('Ta istota już atakowała w tej turze.')
        return
      }
      // Kikimora: jej atak NIE liczy się do limitu
      const isKikimora = (card.cardData as any).effectId === 'kikimora_free_attack'
      if (!isKikimora && !((card.metadata.freeAttacksLeft as number) > 0)) {
        // Limit: atak na turę (z wyjątkami)
        const p1Creatures = game.state ? getAllCreaturesOnField(game.state, 'player1') : []
        const normalAttacksUsed = p1Creatures
          .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
          .filter(c => {
            if ((c.cardData as any).effectId === 'lesnica_double_attack') {
              return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
            }
            return c.hasAttackedThisTurn
          }).length
        const hasChlop = p1Creatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
        const maxAttacks = hasChlop ? 2 : 1
        if (normalAttacksUsed >= maxAttacks) {
          ui.showPlayLimitToast(`Możesz wykonać tylko ${maxAttacks} atak${maxAttacks > 1 ? 'i' : ''} na turę.`)
          return
        }
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
    :class="['battle-line', `line-${line}`, { highlighted: isDropTarget || isDragOver, 'enemy-targeting': isEnemyAttackTarget, 'enemy-line': !isPlayerSide, 'player-line': isPlayerSide }]"
    @click="onLineClick"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onLineDrop"
  >
    <div class="line-header">
      <span class="line-label">{{ lineLabel }}</span>
      <span class="line-name">{{ lineName }}</span>
    </div>

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

      <!-- Ghost slots: only on player side -->
      <template v-if="isPlayerSide">
        <div
          v-for="i in ghostSlots"
          :key="`ghost-${i}`"
          :class="['ghost-slot', { 'ghost-active': isDropTarget }]"
        />
      </template>
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
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.15);
  transition: border-color 0.2s, background 0.2s;
  position: relative;
  gap: 4px;
  overflow: visible;
}

/* Per-zone color tinting */
.battle-line.line-1 {
  background: var(--bg-jawia);
  border-color: rgba(180, 130, 60, 0.12);
}
.battle-line.line-2 {
  background: var(--bg-prawia);
  border-color: rgba(99, 102, 241, 0.10);
}
.battle-line.line-3 {
  background: var(--bg-nawia);
  border-color: rgba(88, 28, 135, 0.12);
}

.battle-line.highlighted {
  border-color: rgba(99, 102, 241, 0.7);
  background: rgba(99, 102, 241, 0.08);
  cursor: pointer;
  box-shadow: inset 0 0 30px rgba(99, 102, 241, 0.08);
}

/* Strona wroga — ciemniejsze, czerwonawe tło */
.battle-line.enemy-line {
  background: rgba(239, 68, 68, 0.03);
  border-color: rgba(239, 68, 68, 0.08);
}
.battle-line.enemy-line.line-1 {
  background: rgba(239, 68, 68, 0.04);
  border-color: rgba(239, 68, 68, 0.10);
}
.battle-line.enemy-line.line-2 {
  background: rgba(200, 50, 50, 0.03);
  border-color: rgba(200, 50, 50, 0.08);
}
.battle-line.enemy-line.line-3 {
  background: rgba(160, 30, 60, 0.03);
  border-color: rgba(160, 30, 60, 0.08);
}

.battle-line.enemy-targeting {
  cursor: crosshair;
}
.battle-line.enemy-targeting .card-wrap {
  cursor: crosshair;
}

.line-header {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 2px 0;
}

.line-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
  font-family: monospace;
}

.line-name {
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  opacity: 0.5;
}

.line-1 .line-label { color: rgba(200, 160, 70, 0.6); }
.line-1 .line-name  { color: rgba(200, 160, 70, 0.4); }
.line-2 .line-label { color: rgba(99, 102, 241, 0.5); }
.line-2 .line-name  { color: rgba(99, 102, 241, 0.35); }
.line-3 .line-label { color: rgba(168, 85, 247, 0.5); }
.line-3 .line-name  { color: rgba(168, 85, 247, 0.35); }

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
  /* Fixed outer box to prevent layout jump when card rotates (attack=90deg) */
  width: 96px;
  min-height: 134px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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


/* Ghost slot: card outline showing available space */
.ghost-slot {
  width: 86px;
  height: 120px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.015);
  flex-shrink: 0;
  transition: all 0.25s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Aktywny ghost = gracz wybrał kartę z ręki, te sloty pulsują i są klikalne */
.ghost-slot.ghost-active {
  border: 2px dashed rgba(99, 102, 241, 0.7);
  background: rgba(99, 102, 241, 0.1);
  cursor: pointer;
  animation: slot-pulse 1.2s ease-in-out infinite;
  box-shadow: inset 0 0 20px rgba(99, 102, 241, 0.15), 0 0 8px rgba(99, 102, 241, 0.2);
}
.ghost-slot.ghost-active::after {
  content: '+';
  font-size: 28px;
  font-weight: 300;
  color: rgba(99, 102, 241, 0.7);
  line-height: 1;
}
.ghost-slot.ghost-active:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.9);
  box-shadow: inset 0 0 30px rgba(99, 102, 241, 0.25), 0 0 16px rgba(99, 102, 241, 0.35);
}

@keyframes slot-pulse {
  0%, 100% { border-color: rgba(99, 102, 241, 0.5); background: rgba(99, 102, 241, 0.06); }
  50% { border-color: rgba(99, 102, 241, 0.9); background: rgba(99, 102, 241, 0.14); }
}
</style>
