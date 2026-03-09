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

const lineLabels: Record<number, { name: string; realm: string; rune: string }> = {
  [BL.FRONT]:   { name: 'L1', realm: 'JAWIA', rune: '᛭' },
  [BL.RANGED]:  { name: 'L2', realm: 'PRAWIA', rune: 'ᛟ' },
  [BL.SUPPORT]: { name: 'L3', realm: 'NAWIA', rune: 'ᛉ' },
}

const lineInfo = computed(() => lineLabels[props.line] ?? { name: '?', realm: '?', rune: '?' })

const MAX_SLOTS = 3
const ghostSlots = computed(() => Math.max(0, MAX_SLOTS - props.cards.length))

// ===== KLIK NA LINIĘ (wystawianie z ręki) =====
function onLineClick(e: MouseEvent) {
  if (!ui.isPlacingCard || !ui.selectedCardId) return
  if (ui.placingOnEnemyField) {
    if (props.isPlayerSide) return
  } else {
    if (!props.isPlayerSide) return
  }
  const target = e.target as HTMLElement
  if (target.closest('.creature-card')) return
  game.playCreature(ui.selectedCardId, props.line)
  ui.clearSelection()
}

// ===== KLIK NA KARTĘ =====
function onCardClick(card: CardInstance) {
  if (!game.isPlayerTurn) return

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
  return getAllCreaturesOnField(game.state, 'player2')
    .filter(e => canAttack(game.state!, attacker, e).valid)
    .map(e => e.instanceId)
}

function getAllTargets(): string[] {
  if (!game.state) return []
  return getAllCreaturesOnField(game.state, 'player2')
    .filter(e => {
      const check = canAttack(game.state!,
        getAllCreaturesOnField(game.state!, 'player1').find(c => c.instanceId === ui.attackingCardId)!,
        e)
      return check.valid || check.softFail
    })
    .map(e => e.instanceId)
}

// ===== DRAG & DROP =====
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

      <!-- Ghost slots -->
      <template v-if="isPlayerSide">
        <div
          v-for="i in ghostSlots"
          :key="`ghost-${i}`"
          :class="['ghost-slot', { 'ghost-active': isDropTarget }]"
        >
          <div class="ghost-rune">{{ lineInfo.rune }}</div>
        </div>
      </template>
      <template v-else>
        <div
          v-for="i in ghostSlots"
          :key="`ghost-enemy-${i}`"
          class="ghost-slot ghost-enemy"
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
  padding: 2px 4px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  background: rgba(0, 0, 0, 0.12);
  transition: border-color 0.3s, background 0.3s;
  position: relative;
  gap: 2px;
  overflow: visible;
}

/* Per-zone styling with atmospheric gradients */
.battle-line.line-1 {
  background: linear-gradient(180deg, rgba(200, 160, 60, 0.06) 0%, rgba(180, 130, 60, 0.02) 100%);
  border-color: rgba(200, 160, 60, 0.15);
  box-shadow: inset 0 0 20px rgba(200, 160, 60, 0.03);
}
.battle-line.line-2 {
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.05) 0%, rgba(79, 70, 229, 0.02) 100%);
  border-color: rgba(99, 102, 241, 0.12);
  box-shadow: inset 0 0 20px rgba(99, 102, 241, 0.03);
}
.battle-line.line-3 {
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.06) 0%, rgba(88, 28, 135, 0.02) 100%);
  border-color: rgba(139, 92, 246, 0.12);
  box-shadow: inset 0 0 20px rgba(139, 92, 246, 0.03);
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
  font-size: 10px;
  opacity: 0.4;
  animation: rune-glow 4s ease-in-out infinite;
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
  gap: 4px;
  flex: 1;
  width: 100%;
}

.card-wrap {
  position: relative;
  width: 110px;
  min-height: 154px;
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
  font-size: 24px;
  font-weight: 900;
  color: #ef4444;
  text-shadow:
    0 0 10px rgba(239, 68, 68, 0.9),
    0 0 20px rgba(239, 68, 68, 0.5),
    0 2px 6px rgba(0, 0, 0, 0.95);
  pointer-events: none;
  white-space: nowrap;
  font-family: var(--font-display, Georgia, serif);
  letter-spacing: -0.5px;
  animation: dmg-float 1.6s ease forwards;
}
@keyframes dmg-float {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.3); }
  15%  { transform: translateX(-50%) translateY(-8px) scale(1.5); }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-60px) scale(0.8); }
}

/* ===== GHOST SLOTS — Runic stone tablets ===== */
.ghost-slot {
  width: 86px;
  height: 120px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background:
    radial-gradient(ellipse at center, rgba(200, 168, 78, 0.02) 0%, transparent 70%),
    rgba(255, 255, 255, 0.01);
  flex-shrink: 0;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.ghost-rune {
  font-size: 20px;
  opacity: 0.08;
  color: var(--gold);
  user-select: none;
}

/* Enemy ghost slots — darker, no rune */
.ghost-enemy {
  border-color: rgba(239, 68, 68, 0.06);
  background: rgba(239, 68, 68, 0.01);
}

/* Active ghost = placing card */
.ghost-slot.ghost-active {
  border: 2px solid rgba(200, 168, 78, 0.6);
  background: rgba(200, 168, 78, 0.1);
  cursor: pointer;
  animation: rune-slot-pulse 2s ease-in-out infinite;
}
.ghost-slot.ghost-active .ghost-rune {
  opacity: 0.45;
  animation: rune-glow 2s ease-in-out infinite;
}
.ghost-slot.ghost-active:hover {
  background: rgba(200, 168, 78, 0.18);
  border-color: rgba(200, 168, 78, 0.85);
  outline: 2px solid rgba(200, 168, 78, 0.3);
  outline-offset: 2px;
}
.ghost-slot.ghost-active:hover .ghost-rune {
  opacity: 0.7;
}

@keyframes rune-slot-pulse {
  0%, 100% { border-color: rgba(200, 168, 78, 0.3); }
  50%      { border-color: rgba(200, 168, 78, 0.6); }
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
    overflow: hidden;
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
    width: 64px;
    min-height: 90px;
    flex-shrink: 0;
  }

  .ghost-slot {
    width: 48px;
    height: 68px;
    border-radius: 4px;
  }
  .ghost-rune { font-size: 12px; }

  .damage-number {
    font-size: 16px;
    top: -6px;
  }
}
</style>
