<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

// ===== CARD PLAY ANIMATION: track which cards are newly placed =====
const recentlyPlayedIds = ref<string[]>([])
const knownCardIds = new Set<string>()

// Initialize knownCardIds on first render (don't animate pre-existing cards)
if (props.cards) {
  for (const c of props.cards) knownCardIds.add(c.instanceId)
}

watch(() => props.cards.map(c => c.instanceId).join(','), () => {
  const newIds: string[] = []
  for (const card of props.cards) {
    if (!knownCardIds.has(card.instanceId)) {
      knownCardIds.add(card.instanceId)
      newIds.push(card.instanceId)
    }
  }
  if (newIds.length > 0) {
    recentlyPlayedIds.value = [...recentlyPlayedIds.value, ...newIds]
    setTimeout(() => {
      recentlyPlayedIds.value = recentlyPlayedIds.value.filter(id => !newIds.includes(id))
    }, 450)
  }
  // Clean up removed cards
  const currentIds = new Set(props.cards.map(c => c.instanceId))
  for (const id of knownCardIds) {
    if (!currentIds.has(id)) knownCardIds.delete(id)
  }
})

const lineKey = computed(() => `${props.side}-${props.line}`)
const isHighlighted = computed(() => ui.highlightedLines.has(lineKey.value))
const isDropTarget = computed(() =>
  isHighlighted.value && (ui.isPlacingCard || ui.isMovingCard)
)
const isEnemyAttackTarget = computed(() =>
  !props.isPlayerSide && ui.isSelectingTarget
)

const lineLabels: Record<number, { name: string; realm: string; rune: string }> = {
  [BL.FRONT]:   { name: 'L1', realm: 'JAWIA', rune: '᛭' },
  [BL.RANGED]:  { name: 'L2', realm: 'PRAWIA', rune: 'ᛟ' },
  [BL.SUPPORT]: { name: 'L3', realm: 'NAWIA', rune: 'ᛉ' },
}

const lineInfo = computed(() => lineLabels[props.line] ?? { name: '?', realm: '?', rune: '?' })

const MAX_SLOTS = 3

// ===== FLAT RENDER LIST: fixed 3-slot grid, cards at their metadata.slotPosition =====
interface RenderItem {
  key: string
  type: 'card' | 'slot'
  card?: CardInstance
  slotIndex: number
}

const renderItems = computed((): RenderItem[] => {
  const result: (RenderItem | null)[] = new Array(MAX_SLOTS).fill(null)
  const usedSlots = new Set<number>()
  const unplaced: CardInstance[] = []

  // First pass: place cards that have explicit slotPosition
  for (const card of props.cards) {
    const slot = card.metadata?.slotPosition as number | undefined
    if (slot !== undefined && slot >= 0 && slot < MAX_SLOTS && !usedSlots.has(slot)) {
      result[slot] = { key: `slot-${slot}`, type: 'card', card, slotIndex: slot }
      usedSlots.add(slot)
    } else {
      unplaced.push(card)
    }
  }

  // Second pass: auto-assign cards without slotPosition to first available slot
  let nextFree = 0
  for (const card of unplaced) {
    while (nextFree < MAX_SLOTS && usedSlots.has(nextFree)) nextFree++
    if (nextFree < MAX_SLOTS) {
      result[nextFree] = { key: `slot-${nextFree}`, type: 'card', card, slotIndex: nextFree }
      usedSlots.add(nextFree)
      nextFree++
    }
  }

  // Fill remaining positions with empty slots
  // IMPORTANT: Use stable positional keys (slot-0, slot-1, slot-2) so Vue patches
  // in place instead of inserting/removing VNodes. Prevents 'insertBefore null' crash
  // when stale setTimeout (hitAmounts delete) triggers re-render mid-VDOM patch.
  const items: RenderItem[] = []
  for (let i = 0; i < MAX_SLOTS; i++) {
    items.push(result[i] ?? { key: `slot-${i}`, type: 'slot', slotIndex: i })
  }
  return items
})

// ===== KLIK NA LINIĘ (fallback — append to end) =====
function onLineClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.creature-card') || target.closest('.slot-empty')) return

  if (ui.isPlacingCard && ui.selectedCardId) {
    if (ui.placingOnEnemyField ? props.isPlayerSide : !props.isPlayerSide) return
    // Line-level click: engine auto-assigns first available slot (no slotIndex)
    game.playCreature(ui.selectedCardId, props.line)
    // clearSelection is called inside gameStore.playCreature
  }
}

function onSlotClick(slotIndex: number) {
  if (ui.isPlacingCard && ui.selectedCardId) {
    game.playCreature(ui.selectedCardId, props.line, slotIndex)
  } else if (ui.isMovingCard && ui.selectedCardId) {
    game.moveCreatureLine(ui.selectedCardId, props.line, slotIndex)
    ui.clearSelection()
  }
}

// ===== KLIK NA KARTĘ =====
function onCardClick(card: CardInstance) {
  if (!game.isPlayerTurn) return

  // Hipnoza Alkonosta — faza 1: wybierz wroga, faza 2: wybierz ofiarę
  if (ui.mode === 'hypnosis' && ui.hypnosisTargets.has(card.instanceId)) {
    const pending = game.state?.pendingInteraction
    if (pending?.type === 'alkonost_target') {
      game.resolvePendingInteraction(card.instanceId)
    } else if (ui.hypnosisSourceId) {
      game.activateCreatureEffect(ui.hypnosisSourceId, card.instanceId)
    }
    return
  }

  // Generyczny wybór celu zdolności — field highlighting
  if (ui.mode === 'effect_target' && ui.effectTargetIds.has(card.instanceId) && ui.effectTargetSourceId) {
    const sourceId = ui.effectTargetSourceId
    ui.clearEffectTarget()
    game.activateCreatureEffect(sourceId, card.instanceId)
    return
  }

  if (ui.pendingArtifactId && game.currentPhase === GamePhase.PLAY) {
    const targetType = ui.pendingAdventureTargetType
    const isValidSide = targetType === 'any'
      || (targetType === 'ally' && props.isPlayerSide)
      || (targetType === 'enemy' && !props.isPlayerSide)
      || (!targetType && props.isPlayerSide)
    if (isValidSide) {
      try {
        game.playAdventure(ui.pendingArtifactId, card.instanceId, ui.pendingAdventureEnhanced)
      } finally {
        ui.clearPendingArtifact()
      }
      return
    }
  }

  if (props.isPlayerSide) {
    if (game.currentPhase === GamePhase.COMBAT) {
      if (card.position === CardPosition.DEFENSE) {
        ui.showPlayLimitToast('Istota jest w obronie — zmień pozycję na atak.')
        return
      }
      if (card.cannotAttack) {
        ui.showPlayLimitToast('Ta istota nie może atakować (efekt statusu).')
        return
      }
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
      const isKikimora = (card.cardData as any).effectId === 'kikimora_free_attack'
      if (!isKikimora && !((card.metadata.freeAttacksLeft as number) > 0)) {
        const myCreatures = game.state ? getAllCreaturesOnField(game.state, game.mySide) : []
        const normalAttacksUsed = myCreatures
          .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
          .filter(c => {
            if ((c.cardData as any).effectId === 'lesnica_double_attack') {
              return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
            }
            return c.hasAttackedThisTurn
          }).length
        const hasChlop = myCreatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
        const maxAttacks = hasChlop ? 2 : 1
        if (normalAttacksUsed >= maxAttacks) {
          ui.showPlayLimitToast(`Możesz wykonać tylko ${maxAttacks} atak${maxAttacks > 1 ? 'i' : ''} na turę.`)
          return
        }
      }
      ui.selectAttacker(card.instanceId)
      const targets = getAllTargets()
      if (targets.length === 0) {
        ui.showPlayLimitToast('Brak wrogich istot na polu.')
        ui.clearSelection()
        return
      }
      ui.setValidAttackTargets(targets)
    }
  } else {
    if (ui.isSelectingTarget && ui.attackingCardId) {
      if (ui.validAttackTargets.has(card.instanceId)) {
        game.attack(ui.attackingCardId, card.instanceId)
        ui.clearSelection()
      }
    }
  }
}

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
  const oppSide = game.mySide === 'player1' ? 'player2' : 'player1'
  return getAllCreaturesOnField(game.state, oppSide)
    .filter(e => canAttack(game.state!, attacker, e).valid)
    .map(e => e.instanceId)
}

function getAllTargets(): string[] {
  if (!game.state) return []
  const attacker = getAllCreaturesOnField(game.state, game.mySide).find(c => c.instanceId === ui.attackingCardId)
  if (!attacker) return []
  const oppSide = game.mySide === 'player1' ? 'player2' : 'player1'
  return getAllCreaturesOnField(game.state, oppSide)
    .filter(e => {
      const check = canAttack(game.state!, attacker, e)
      return check.valid || check.softFail
    })
    .map(e => e.instanceId)
}

// Damage float removed — will be handled by VFXOrchestrator (P3)

// ===== DRAG & DROP =====
let _draggingId = ''
const dragOverSlot = ref<number | null>(null)

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
  dragOverSlot.value = null
}

function onDragOver(e: DragEvent) {
  if (!props.isPlayerSide || !game.isPlayerTurn) return
  e.preventDefault()
  isDragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave() {
  isDragOver.value = false
  dragOverSlot.value = null
}

function onSlotDragOver(e: DragEvent, slotIndex: number) {
  if (!props.isPlayerSide || !game.isPlayerTurn) return
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = true
  dragOverSlot.value = slotIndex
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onSlotDragLeave(slotIndex: number) {
  if (dragOverSlot.value === slotIndex) dragOverSlot.value = null
}

function onSlotDrop(e: DragEvent, slotIndex: number) {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  dragOverSlot.value = null
  const cardId = e.dataTransfer?.getData('text/plain') || _draggingId
  if (cardId && props.isPlayerSide && game.isPlayerTurn) {
    game.moveCreatureLine(cardId, props.line, slotIndex)
  }
  _draggingId = ''
}

function onCardDragOver(e: DragEvent, card: CardInstance) {
  if (!props.isPlayerSide || !game.isPlayerTurn || game.currentPhase !== GamePhase.PLAY) return
  if (card.instanceId === _draggingId) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverSlot.value = (card.metadata.slotPosition as number) ?? null
}

function onCardDrop(e: DragEvent, card: CardInstance) {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  dragOverSlot.value = null
  const cardId = e.dataTransfer?.getData('text/plain') || _draggingId
  if (cardId && cardId !== card.instanceId && props.isPlayerSide && game.isPlayerTurn) {
    const targetSlot = (card.metadata.slotPosition as number) ?? 0
    game.moveCreatureLine(cardId, props.line, targetSlot)
  }
  _draggingId = ''
}

function onLineDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  dragOverSlot.value = null
  const cardId = e.dataTransfer?.getData('text/plain') || _draggingId
  if (cardId && props.isPlayerSide && game.isPlayerTurn) {
    // Line-level drop: auto-assign first available slot
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
    <!-- Runic line header -->
    <div class="line-header">
      <span class="line-rune">{{ lineInfo.rune }}</span>
      <span class="line-label">{{ lineInfo.name }}</span>
      <span class="line-realm">{{ lineInfo.realm }}</span>
    </div>

    <!-- Ornamental top border -->
    <div class="line-ornament" />

    <div class="cards-col">
      <div
        v-for="item in renderItems"
        :key="item.key"
        :class="item.type === 'slot'
          ? ['slot-empty', { 'slot-active': isDropTarget || dragOverSlot === item.slotIndex, 'slot-drop-hover': dragOverSlot === item.slotIndex, 'slot-enemy': !isPlayerSide }]
          : ['card-wrap', { 'card-just-played': recentlyPlayedIds.includes(item.card!.instanceId) }]"
        :draggable="item.type === 'card' && isPlayerSide && game.isPlayerTurn && game.currentPhase === GamePhase.PLAY"
        @click.stop="item.type === 'slot' ? onSlotClick(item.slotIndex) : undefined"
        @dragstart="item.type === 'card' ? onDragStart($event, item.card!) : undefined"
        @dragend="item.type === 'card' ? onDragEnd() : undefined"
        @dragover="item.type === 'slot' ? onSlotDragOver($event, item.slotIndex) : (item.type === 'card' ? onCardDragOver($event, item.card!) : undefined)"
        @dragleave="item.type === 'slot' ? onSlotDragLeave(item.slotIndex) : undefined"
        @drop="item.type === 'slot' ? onSlotDrop($event, item.slotIndex) : (item.type === 'card' ? onCardDrop($event, item.card!) : undefined)"
      >
        <!-- Empty slot rune -->
        <template v-if="item.type === 'slot'">
          <div v-if="isPlayerSide" class="slot-rune">{{ (isDropTarget || dragOverSlot === item.slotIndex) ? '+' : lineInfo.rune }}</div>
        </template>

        <!-- Card content -->
        <template v-else>
          <CreatureCard
            :card="item.card!"
            :selected="ui.selectedCardId === item.card!.instanceId || ui.attackingCardId === item.card!.instanceId"
            :is-valid-target="ui.validAttackTargets.has(item.card!.instanceId) || ui.hypnosisTargets.has(item.card!.instanceId) || ui.effectTargetIds.has(item.card!.instanceId)"
            :dimmed="(ui.isSelectingTarget && !ui.validAttackTargets.has(item.card!.instanceId) && !isPlayerSide) || (ui.mode === 'hypnosis' && !ui.hypnosisTargets.has(item.card!.instanceId)) || (ui.mode === 'effect_target' && !ui.effectTargetIds.has(item.card!.instanceId))"
            :toggle-position-on-click="isPlayerSide && game.isPlayerTurn && game.currentPhase === GamePhase.PLAY && !ui.pendingArtifactId && !isDropTarget && ui.mode !== 'effect_target' && ui.mode !== 'hypnosis'"
            :can-toggle-position="isPlayerSide && game.isPlayerTurn && (game.currentPhase === GamePhase.PLAY || (game.currentPhase === GamePhase.COMBAT && !item.card!.hasAttackedThisTurn)) && !ui.pendingArtifactId"
            :effect-available="isEffectAvailable(item.card!)"
            :effect-cost="getEffectCost(item.card!)"
            @click="onCardClick(item.card!)"
            @change-position="onChangePosition(item.card!)"
            @activate-effect="onActivateEffect(item.card!)"
            @mouseenter="ui.showTooltip(item.card!.instanceId)"
            @mouseleave="ui.hideTooltip()"
          />
        </template>
      </div>
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
  contain: layout style;
  height: 100%;
  padding: 2px 4px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  background: rgba(0, 0, 0, 0.12);
  position: relative;
  gap: 2px;
  overflow: visible;
}

/* Per-zone styling with atmospheric gradients — strengthened for visibility */
.battle-line.line-1 {
  background:
    radial-gradient(ellipse 80% 60% at 50% 30%, rgba(200, 160, 60, 0.06) 0%, transparent 70%),
    linear-gradient(180deg, rgba(200, 160, 60, 0.08) 0%, rgba(180, 130, 60, 0.02) 100%);
  border-color: rgba(200, 160, 60, 0.18);
  box-shadow: inset 0 0 25px rgba(200, 160, 60, 0.04);
}
.battle-line.line-2 {
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(99, 102, 241, 0.05) 0%, transparent 70%),
    linear-gradient(180deg, rgba(99, 102, 241, 0.07) 0%, rgba(79, 70, 229, 0.02) 100%);
  border-color: rgba(99, 102, 241, 0.16);
  box-shadow: inset 0 0 25px rgba(99, 102, 241, 0.04);
}
.battle-line.line-3 {
  background:
    radial-gradient(ellipse 80% 60% at 50% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 70%),
    linear-gradient(180deg, rgba(139, 92, 246, 0.08) 0%, rgba(88, 28, 135, 0.02) 100%);
  border-color: rgba(139, 92, 246, 0.16);
  box-shadow: inset 0 0 25px rgba(139, 92, 246, 0.04);
}

.battle-line.highlighted {
  border-color: rgba(99, 102, 241, 0.85);
  background: rgba(99, 102, 241, 0.15);
  cursor: pointer;
  outline: 2px solid rgba(129, 140, 248, 0.5);
  outline-offset: -1px;
}

/* Enemy side */
.battle-line.enemy-line {
  background: rgba(239, 68, 68, 0.03);
  border-color: rgba(239, 68, 68, 0.08);
}
.battle-line.enemy-line.line-1 {
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 50, 50, 0.02) 100%);
  border-color: rgba(239, 68, 68, 0.12);
  box-shadow: inset 0 0 20px rgba(239, 68, 68, 0.03);
}
.battle-line.enemy-line.line-2 {
  background: linear-gradient(180deg, rgba(200, 50, 50, 0.04) 0%, rgba(180, 40, 40, 0.01) 100%);
  border-color: rgba(200, 50, 50, 0.10);
}
.battle-line.enemy-line.line-3 {
  background: linear-gradient(180deg, rgba(160, 30, 60, 0.04) 0%, rgba(140, 20, 50, 0.01) 100%);
  border-color: rgba(160, 30, 60, 0.10);
}

.battle-line.enemy-targeting { cursor: crosshair; }
.battle-line.enemy-targeting .card-wrap { cursor: crosshair; }

/* ===== LINE HEADER — Runic style ===== */
.line-header {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 1px 0;
  width: 100%;
  justify-content: center;
}

.line-rune {
  font-size: 11px;
  opacity: 0.5;
  animation: rune-shimmer 4s ease-in-out infinite;
}
@keyframes rune-shimmer {
  0%, 100% { opacity: 0.35; text-shadow: none; }
  50% { opacity: 0.7; text-shadow: 0 0 6px currentColor; }
}

.line-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  font-family: monospace;
}

.line-realm {
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  opacity: 0.3;
}

/* Line label colors */
.line-1 .line-label { color: rgba(200, 160, 70, 0.7); }
.line-1 .line-rune  { color: rgba(200, 160, 70, 0.5); }
.line-1 .line-realm { color: rgba(200, 160, 70, 0.3); }

.line-2 .line-label { color: rgba(129, 140, 248, 0.6); }
.line-2 .line-rune  { color: rgba(129, 140, 248, 0.5); }
.line-2 .line-realm { color: rgba(129, 140, 248, 0.3); }

.line-3 .line-label { color: rgba(168, 85, 247, 0.6); }
.line-3 .line-rune  { color: rgba(168, 85, 247, 0.5); }
.line-3 .line-realm { color: rgba(168, 85, 247, 0.3); }

/* Ornamental line between header and cards */
.line-ornament {
  width: 80%;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent 100%);
  opacity: 0.5;
  flex-shrink: 0;
}

.cards-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  width: 100%;
  overflow: visible;
}

.card-wrap {
  position: relative;
  width: 130px;
  height: 175px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Damage float removed — will be handled by VFXOrchestrator (P3) */

/* ===== EMPTY SLOTS — uniform with card-wrap sizing ===== */
.slot-empty {
  width: 130px;
  height: 175px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background:
    radial-gradient(ellipse at center, rgba(200, 168, 78, 0.02) 0%, transparent 70%),
    rgba(255, 255, 255, 0.01);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: border-color 0.15s, background 0.15s;
}

.slot-rune {
  font-size: 20px;
  opacity: 0.08;
  color: var(--gold);
  user-select: none;
  transition: opacity 0.15s;
}

/* Enemy empty slots */
.slot-enemy {
  border-color: rgba(239, 68, 68, 0.06);
  background: rgba(239, 68, 68, 0.01);
}

/* Active slot = placing/moving card */
.slot-active {
  border: 2px solid rgba(200, 168, 78, 0.6);
  background: rgba(200, 168, 78, 0.1);
  cursor: pointer;
  animation: slot-pulse 2s ease-in-out infinite;
}
.slot-active .slot-rune {
  opacity: 0.5;
  font-size: 16px;
  font-weight: 700;
  color: rgba(200, 168, 78, 0.8);
}
.slot-active:hover,
.slot-drop-hover {
  background: rgba(200, 168, 78, 0.2);
  border-color: rgba(200, 168, 78, 0.85);
  box-shadow: 0 0 12px rgba(200, 168, 78, 0.2);
}
.slot-active:hover .slot-rune,
.slot-drop-hover .slot-rune {
  opacity: 0.8;
}

@keyframes slot-pulse {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .battle-line {
    min-width: 0;
    width: 100%;
    height: auto;
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 0;
    padding: 1px 2px;
    border-radius: 4px;
    overflow: visible;
  }

  /* Line header: thin vertical strip */
  .line-header {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    flex-direction: column;
    padding: 2px 1px;
    width: auto;
    min-width: 14px;
    flex-shrink: 0;
    gap: 1px;
  }
  .line-label { font-size: 7px; letter-spacing: 0.06em; }
  .line-rune { font-size: 7px; }
  .line-realm { display: none; }

  .line-ornament {
    width: 1px;
    height: 80%;
    align-self: center;
    background: linear-gradient(180deg, transparent, var(--gold-dim, rgba(200,168,78,0.15)), transparent);
    flex-shrink: 0;
  }

  /* Cards row: horizontal scroll, no wrap, no overlap */
  .cards-col {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 3px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    padding: 2px 0;
    flex: 1;
    min-width: 0;
  }
  .cards-col::-webkit-scrollbar { display: none; }

  .card-wrap {
    width: 66px;
    height: 90px;
    flex-shrink: 0;
  }

  .slot-empty {
    width: 66px;
    height: 90px;
    border-radius: 3px;
  }
  .slot-rune { font-size: 12px; }

}

/* ===== CARD PLAY ANIMATION ===== */
.card-just-played {
  animation: card-drop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes card-drop-in {
  0%   { transform: translateY(-30px) scale(0.85); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}

/* TransitionGroup removed for performance — plain v-for */
</style>
