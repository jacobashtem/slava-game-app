<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { CardInstance } from '../../game-engine/types'
import { AttackType, CardPosition } from '../../game-engine/constants'
import { useUIStore } from '../../stores/uiStore'

// Grafiki stworzeń: automatycznie wczytuje assets/cards/creature/{id}.png
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.png', { eager: true, import: 'default' }) as Record<string, string>
const creatureImgs = Object.fromEntries(
  Object.entries(_creatureImgModules)
    .map(([key, val]) => { const m = key.match(/(\d+)\.png$/); return m ? [parseInt(m[1]), val] : null })
    .filter(Boolean) as [number, string][]
) as Record<number, string>

import domainImg1 from '~/assets/cards/domain-1.png'
import domainImg2 from '~/assets/cards/domain-2.png'
import domainImg3 from '~/assets/cards/domain-3.png'
import domainImg4 from '~/assets/cards/domain-4.png'
import attackTypeImg1 from '~/assets/cards/attackType1.png'
import attackTypeImg2 from '~/assets/cards/attackType2.png'
import attackTypeImg3 from '~/assets/cards/attackType3.png'
import flyingImg from '~/assets/cards/isFlying.png'

const domainImgs: Record<number, string> = { 1: domainImg1, 2: domainImg2, 3: domainImg3, 4: domainImg4 }
const attackTypeImgs: Record<number, string> = { 1: attackTypeImg1, 2: attackTypeImg2, 3: attackTypeImg3 }

const domainNames: Record<number, string> = { 1: 'Perun', 2: 'Żywi', 3: 'Nieumarli', 4: 'Weles' }
const domainName = computed(() => domainNames[cardData.value.domain as number] ?? '')

const props = defineProps<{
  card: CardInstance
  selected?: boolean
  isAttacking?: boolean
  isHit?: boolean
  isDying?: boolean
  isValidTarget?: boolean
  dimmed?: boolean
  inHand?: boolean
  togglePositionOnClick?: boolean  // PLAY faza: klik = zmień pozycję
  effectAvailable?: boolean        // ⚡ aktywowalna zdolność gotowa
  effectCost?: number              // koszt aktywacji w ZŁ (0 = darmowe)
}>()

const emit = defineEmits<{
  click: [card: CardInstance]
  mouseenter: [card: CardInstance]
  mouseleave: []
  'change-position': [card: CardInstance]
  'activate-effect': [card: CardInstance]
}>()

const ui = useUIStore()
const cardData = computed(() => props.card.cardData as any)
const stats = computed(() => props.card.currentStats)
const isDefense = computed(() => !props.inHand && props.card.position === CardPosition.DEFENSE)
const isFlying = computed(() => cardData.value.isFlying && !props.card.isGrounded)
// Karta jest widoczna: własna ZAWSZE, wroga dopiero po ujawnieniu (lub tymczasowym reveal przed atakiem)
const isHidden = computed(() =>
  !props.card.isRevealed
  && props.card.owner === 'player2'
  && !props.inHand
  && ui.revealingCardId !== props.card.instanceId
)

const domainColor = computed(() => ({
  1: '#f5c542',
  2: '#4caf50',
  3: '#9c27b0',
  4: '#c62828',
}[cardData.value.domain as number] ?? '#64748b'))

const attackIcon = computed(() => ({
  [AttackType.MELEE]:     'game-icons:crossed-swords',
  [AttackType.ELEMENTAL]: 'game-icons:fire-dash',
  [AttackType.MAGIC]:     'game-icons:magic-swirl',
  [AttackType.RANGED]:    'game-icons:arrow-flights',
}[cardData.value.attackType as AttackType] ?? 'game-icons:crossed-swords'))

const cardClass = computed(() => [
  'creature-card',
  {
    'card-attack':     !props.inHand && !isDefense.value,
    'card-defense':    isDefense.value,
    'is-selected':     props.selected,
    'is-attacking':    props.isAttacking,
    'is-hit':          props.isHit,
    'is-dying':        props.isDying,
    'is-valid-target': props.isValidTarget,
    'is-dimmed':       props.dimmed,
    'is-silenced':     props.card.isSilenced,
    'cannot-attack':   props.card.cannotAttack,
  }
])

function onClick() {
  if (props.togglePositionOnClick) {
    emit('change-position', props.card)
  } else {
    emit('click', props.card)
  }
}
</script>

<template>
  <!-- Ukryta karta AI — rewers z ? -->
  <div
    v-if="isHidden"
    :class="['creature-card', 'card-hidden', { 'is-valid-target': isValidTarget, 'is-dimmed': dimmed }]"
    @click="emit('click', card)"
    @mouseenter="emit('mouseenter', card)"
    @mouseleave="emit('mouseleave')"
  >
    <div class="hidden-pattern" />
    <div class="hidden-mark">?</div>
  </div>

  <!-- Widoczna karta -->
  <div
    v-else
    :class="cardClass"
    :style="{ '--domain-color': domainColor }"
    @click="onClick"
    @mouseenter="emit('mouseenter', card)"
    @mouseleave="emit('mouseleave')"
  >
    <!-- Górny pasek: nazwa + ikona + nazwa domeny -->
    <div class="card-header">
      <span class="card-name">{{ cardData.name }}</span>
      <div class="card-domain-group">
        <img v-if="domainImgs[cardData.domain]" :src="domainImgs[cardData.domain]" class="card-domain-img" />
        <div v-else class="card-domain-dot" :style="{ background: domainColor }" />
        <span class="card-domain-name" :style="{ color: domainColor }">{{ domainName }}</span>
      </div>
    </div>

    <!-- Grafika stworzenia (jeśli istnieje) -->
    <img
      v-if="creatureImgs[cardData.id]"
      :src="creatureImgs[cardData.id]"
      class="card-art"
      aria-hidden="true"
    />

    <!-- Środek: badges -->
    <div class="card-body">
      <!-- Latający: duży, prawostronnie -->
      <div v-if="isFlying" class="flying-row">
        <img :src="flyingImg" class="flying-img" title="Latający" />
      </div>
      <div class="card-badges">
        <Icon v-if="card.isSilenced"   icon="game-icons:silenced"       class="badge-icon badge-silenced" title="Uciszony" />
        <Icon v-if="card.isImmune"     icon="game-icons:shield-reflect" class="badge-icon badge-immune"   title="Odporny" />
        <Icon v-if="card.cannotAttack" icon="game-icons:chains"         class="badge-icon badge-disarmed" title="Nie może atakować" />
        <span v-if="card.poisonRoundsLeft" class="badge-poison">☠ {{ card.poisonRoundsLeft }}</span>
      </div>

      <!-- Wskaźnik pozycji (tylko na polu) -->
      <div v-if="!inHand" :class="['position-badge', isDefense ? 'pos-defense' : 'pos-attack']">
        <Icon :icon="isDefense ? 'game-icons:shield' : 'game-icons:crossed-swords'" class="pos-icon" />
        {{ isDefense ? 'OBR' : 'ATK' }}
      </div>

      <!-- Rząd zdolności: dwa niezależne sloty [⚡ lewo] [🪙 prawo] -->
      <div v-if="!inHand && effectAvailable" class="ability-row">
        <!-- LEWY SLOT: tylko gdy darmowa (cost=0) -->
        <button
          v-if="effectCost === 0"
          class="effect-activate-btn"
          :title="`Aktywuj zdolność (gratis)`"
          @click.stop="emit('activate-effect', card)"
        >⚡</button>
        <span v-else class="ability-slot-empty" />

        <!-- PRAWY SLOT: tylko gdy płatna (cost>0) -->
        <button
          v-if="effectCost !== undefined && effectCost > 0"
          class="effect-cost-pill"
          :title="`Aktywuj za ${effectCost} ZŁ`"
          @click.stop="emit('activate-effect', card)"
        >🪙{{ effectCost }}</button>
      </div>
    </div>

    <!-- Dolny pasek: ATK / DEF -->
    <div class="card-footer">
      <div class="stat atk">
        <img v-if="attackTypeImgs[cardData.attackType]" :src="attackTypeImgs[cardData.attackType]" class="stat-img" />
        <Icon v-else :icon="attackIcon" class="stat-icon" />
        <span>{{ stats.attack }}</span>
      </div>
      <div class="stat def">
        <Icon icon="game-icons:shield" class="stat-icon" />
        <span :class="{ 'stat-damaged': stats.defense < cardData.stats.defense }">
          {{ stats.defense }}
        </span>
      </div>
    </div>

    <div v-if="isValidTarget" class="target-overlay" />
  </div>
</template>

<style scoped>
.creature-card {
  position: relative;
  width: 96px;
  height: 134px;
  border-radius: 6px;
  border: 2px solid var(--domain-color, #334155);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  user-select: none;
  flex-shrink: 0;
}

.creature-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 6px 1px var(--domain-color, #334155);
}

/* ===== ATAK: rotacja 90° (poziomo = szarża) ===== */
.card-attack {
  transform: rotate(90deg);
}
.card-attack:hover {
  transform: rotate(90deg) translateY(-3px);
}

/* ===== OBRONA: pionowo + niebieski border ===== */
.card-defense {
  border-color: #3b82f6;
}

/* ===== UKRYTA KARTA ===== */
.card-hidden {
  border: 2px solid #1e293b;
  background: url('~/assets/cards/back.png') center / cover no-repeat;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: default;
  position: relative;
}

.hidden-pattern {
  display: none;
}

.hidden-mark {
  display: none;
}

/* ===== STANY ===== */
.is-selected {
  box-shadow: 0 0 0 3px #fff, 0 0 16px 4px var(--domain-color);
  transform: translateY(-6px) scale(1.05);
}
.card-attack.is-selected {
  transform: rotate(90deg) translateY(-6px) scale(1.05);
}

.is-attacking {
  box-shadow: 0 0 0 3px #f59e0b, 0 0 16px 4px #f59e0b;
  animation: pulse-glow 0.8s ease infinite;
}

.is-valid-target {
  box-shadow: 0 0 0 2px #ef4444, 0 0 12px 3px rgba(239,68,68,0.4);
}
.is-valid-target:hover {
  box-shadow: 0 0 0 3px #ef4444, 0 0 20px 6px rgba(239,68,68,0.6);
}

.is-hit   { animation: shake 0.5s ease; }
.is-dying { animation: death-fade 0.75s ease forwards; }
.is-dimmed { opacity: 0.45; pointer-events: none; }

/* ===== HEADER ===== */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 5px 2px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  min-height: 22px;
  position: relative;
  z-index: 1;
  background: rgba(0,0,0,0.45);
}

.card-name {
  font-size: 9px;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.2;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-domain-group {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.card-domain-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.card-domain-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
  opacity: 0.9;
}

.card-domain-name {
  font-size: 6px;
  font-weight: 700;
  white-space: nowrap;
  max-width: 36px;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.03em;
}

/* ===== BODY ===== */
.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 2px;
  position: relative; /* żeby być nad .card-art */
  z-index: 1;
}

.card-badges {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}

.flying-row {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  padding-right: 2px;
}
.flying-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  opacity: 0.9;
}

.badge-icon    { font-size: 11px; }
.stat-img      { width: 12px; height: 12px; object-fit: contain; opacity: 0.9; flex-shrink: 0; }
.badge-fly      { color: #7dd3fc; }
.badge-immune   { color: #a78bfa; }
.badge-silenced { color: #94a3b8; }
.badge-disarmed { color: #f87171; }
.badge-poison   { font-size: 9px; color: #86efac; }

/* Pozycja */
.position-badge {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 7px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.03em;
}
.pos-attack  { color: #fca5a5; background: rgba(252,165,165,0.12); border: 1px solid rgba(252,165,165,0.3); }
.pos-defense { color: #93c5fd; background: rgba(147,197,253,0.12); border: 1px solid rgba(147,197,253,0.3); }
.pos-icon    { font-size: 8px; }

/* ===== FOOTER ===== */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 5px 3px;
  border-top: 1px solid rgba(255,255,255,0.06);
  position: relative;
  z-index: 1;
  background: rgba(0,0,0,0.45);
}

.stat {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
}

.stat.atk { color: #fca5a5; }
.stat.def { color: #86efac; }
.stat-icon    { font-size: 10px; }
.stat-damaged { color: #ef4444 !important; }

.card-art {
  position: absolute;
  top: 24px;    /* pod headerem */
  bottom: 26px; /* nad footerem */
  left: 0;
  right: 0;
  width: 100%;
  height: calc(100% - 50px);
  object-fit: cover;
  object-position: center top;
  pointer-events: none;
  border-radius: 0;
  /* gradient na dole żeby footer był czytelny */
  -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}

.target-overlay {
  position: absolute;
  inset: 0;
  border-radius: 5px;
  background: rgba(239, 68, 68, 0.08);
  pointer-events: none;
}

.cannot-attack .stat.atk { color: #64748b; }

/* Rząd zdolności */
.ability-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 2px;
  gap: 2px;
}
.effect-activate-btn {
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.6);
  border-radius: 3px;
  color: #fbbf24;
  font-size: 9px;
  padding: 1px 4px;
  cursor: pointer;
  line-height: 1.2;
  animation: effect-pulse 1.5s ease-in-out infinite;
  white-space: nowrap;
}
.effect-activate-btn:hover {
  background: rgba(251, 191, 36, 0.35);
  border-color: #fbbf24;
}

/* PRAWY SLOT: 🪙 płatna aktywacja */
.effect-cost-pill {
  font-size: 8px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.5);
  border-radius: 3px;
  padding: 1px 4px;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  animation: effect-pulse 1.5s ease-in-out infinite;
  transition: background 0.15s;
}
.effect-cost-pill:hover { background: rgba(251, 191, 36, 0.28); }

/* Pusty lewy slot gdy brak ⚡ (żeby 🪙 zostało po prawej) */
.ability-slot-empty { flex: 1; }

@keyframes effect-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
  50%       { box-shadow: 0 0 0 3px rgba(251,191,36,0.35); }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 3px #f59e0b, 0 0 8px 2px rgba(245,158,11,0.5); }
  50%       { box-shadow: 0 0 0 3px #f59e0b, 0 0 22px 8px rgba(245,158,11,0.8); }
}

@keyframes shake {
  0%, 100% { translate: 0 0; }
  20%       { translate: -5px 0; }
  40%       { translate: 5px 0; }
  60%       { translate: -3px 0; }
  80%       { translate: 3px 0; }
}

@keyframes death-fade {
  0%   { opacity: 1; scale: 1; }
  40%  { opacity: 0.7; scale: 1.08; filter: brightness(2) saturate(0); }
  100% { opacity: 0; scale: 0.5; filter: brightness(3) saturate(0); }
}
</style>
