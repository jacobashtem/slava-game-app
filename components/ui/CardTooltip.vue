<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import type { CardInstance } from '../../game-engine/types'
import { BattleLine, AttackType, Domain } from '../../game-engine/constants'

import domainImg1 from '~/assets/cards/domain-1.png'
import domainImg2 from '~/assets/cards/domain-2.png'
import domainImg3 from '~/assets/cards/domain-3.png'
import domainImg4 from '~/assets/cards/domain-4.png'
import attackTypeImg1 from '~/assets/cards/attackType1.png'
import attackTypeImg2 from '~/assets/cards/attackType2.png'
import attackTypeImg3 from '~/assets/cards/attackType3.png'
import flyingImg from '~/assets/cards/isFlying.png'
import lokacjaImg from '~/assets/cards/lokacja.png'
import artefaktImg from '~/assets/cards/artefakt.png'

const domainImgs: Record<number, string> = { 1: domainImg1, 2: domainImg2, 3: domainImg3, 4: domainImg4 }
// attackType: 0=MELEE(brak pliku), 1=ELEMENTAL, 2=MAGIC, 3=RANGED
const attackTypeImgs: Record<number, string> = { 1: attackTypeImg1, 2: attackTypeImg2, 3: attackTypeImg3 }
const adventureTypeImgs: Record<number, string> = { 1: artefaktImg, 2: lokacjaImg }

// Grafiki stworzeń — ten sam glob co w CreatureCard
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.png', { eager: true, import: 'default' }) as Record<string, string>
const creatureImgs = Object.fromEntries(
  Object.entries(_creatureImgModules)
    .map(([key, val]) => { const m = key.match(/(\d+)\.png$/); return m ? [parseInt(m[1]), val] : null })
    .filter(Boolean) as [number, string][]
) as Record<number, string>

const ui = useUIStore()
const game = useGameStore()

function findCard(instanceId: string): CardInstance | null {
  if (!game.state) return null
  const all = [
    ...game.state.players.player1.hand,
    ...game.state.players.player2.hand,
    ...game.state.players.player1.field.lines[BattleLine.FRONT],
    ...game.state.players.player1.field.lines[BattleLine.RANGED],
    ...game.state.players.player1.field.lines[BattleLine.SUPPORT],
    ...game.state.players.player2.field.lines[BattleLine.FRONT],
    ...game.state.players.player2.field.lines[BattleLine.RANGED],
    ...game.state.players.player2.field.lines[BattleLine.SUPPORT],
  ]
  const found = all.find(c => c.instanceId === instanceId)
  if (found) return found

  // Sprawdź aktywne zdarzenia (karty przygód leżące w polu)
  const ev = game.state.activeEvents.find(e => e.instanceId === instanceId)
  if (ev) {
    return {
      instanceId: ev.instanceId,
      cardData: ev.cardData,
      owner: ev.owner,
      isRevealed: true,
      activeEffects: [],
      equippedArtifacts: [],
      turnsInPlay: 0,
      currentStats: { attack: 0, defense: 0, maxAttack: 0, maxDefense: 0 },
    } as unknown as CardInstance
  }

  return null
}

const card = computed(() => {
  if (!ui.tooltipCardId) return null
  const c = findCard(ui.tooltipCardId)
  // Don't reveal hidden enemy cards via tooltip
  if (c && !c.isRevealed && c.owner === 'player2') return null
  return c
})
const data = computed(() => card.value?.cardData as any ?? null)
const isCreature = computed(() => data.value?.cardType === 'creature')

const attackTypeInfo = computed(() => {
  const t = data.value?.attackType as AttackType
  return {
    [AttackType.MELEE]:     { label: 'Wręcz',   icon: 'game-icons:crossed-swords', color: '#fca5a5' },
    [AttackType.ELEMENTAL]: { label: 'Żywioł',  icon: 'game-icons:fire-dash',      color: '#fb923c' },
    [AttackType.MAGIC]:     { label: 'Magia',   icon: 'game-icons:magic-swirl',    color: '#c084fc' },
    [AttackType.RANGED]:    { label: 'Dystans', icon: 'game-icons:arrow-flights',  color: '#67e8f9' },
  }[t] ?? { label: 'Wręcz', icon: 'game-icons:crossed-swords', color: '#fca5a5' }
})

const domainInfo = computed(() => {
  const d = data.value?.domain as Domain
  return {
    [Domain.PERUN]:  { name: 'Perun',     color: '#f5c542' },
    [Domain.ZYVI]:   { name: 'Żywi',      color: '#4caf50' },
    [Domain.UNDEAD]: { name: 'Nieumarli', color: '#9c27b0' },
    [Domain.WELES]:  { name: 'Weles',     color: '#c62828' },
  }[d] ?? { name: '', color: '#64748b' }
})

const adventureTypeLabel = computed(() => {
  const t = data.value?.adventureType
  return t === 0 ? 'Zdarzenie' : t === 1 ? 'Artefakt' : t === 2 ? 'Lokacja' : ''
})

// Sprawdź czy DEF różni się od bazowej (obrażenia)
const defDamaged = computed(() =>
  isCreature.value &&
  card.value &&
  card.value.currentStats.defense < card.value.currentStats.maxDefense
)
const atkDamaged = computed(() =>
  isCreature.value &&
  card.value &&
  card.value.currentStats.attack < card.value.currentStats.maxAttack
)
</script>

<template>
  <Transition name="tooltip-fade">
    <div v-if="card && data" class="card-tooltip">

      <!-- Nagłówek -->
      <div class="tt-header" :style="{ '--tc': isCreature ? domainInfo.color : '#6366f1' }">
        <span class="tt-name">{{ data.name }}</span>
        <div class="tt-header-right">
          <img v-if="isCreature && domainImgs[data.domain]" :src="domainImgs[data.domain]" class="tt-domain-img" :title="domainInfo.name" />
          <img v-else-if="!isCreature && adventureTypeImgs[data.adventureType]" :src="adventureTypeImgs[data.adventureType]" class="tt-domain-img" />
          <span v-if="isCreature" class="tt-domain">{{ domainInfo.name }}</span>
          <span v-else class="tt-adventure-type">{{ adventureTypeLabel }}</span>
        </div>
      </div>

      <!-- Grafika stworzenia -->
      <div v-if="isCreature && creatureImgs[data.id]" class="tt-art-wrap">
        <img :src="creatureImgs[data.id]" class="tt-art" />
        <img
          v-if="data.isFlying && !card.isGrounded"
          :src="flyingImg"
          class="tt-art-flying"
          title="Latający"
        />
      </div>

      <!-- Statystyki istoty -->
      <template v-if="isCreature">
        <div class="tt-stats-row">
          <!-- ATK -->
          <div class="tt-stat-block">
            <img v-if="attackTypeImgs[data.attackType]" :src="attackTypeImgs[data.attackType]" class="tt-attack-img" />
            <Icon v-else :icon="attackTypeInfo.icon" class="tt-stat-icon" :style="{ color: attackTypeInfo.color }" />
            <span class="tt-stat-val" :class="{ damaged: atkDamaged }">{{ card.currentStats.attack }}</span>
            <span v-if="atkDamaged" class="tt-stat-base">/{{ card.currentStats.maxAttack }}</span>
          </div>
          <div class="tt-stat-sep">vs</div>
          <!-- DEF -->
          <div class="tt-stat-block">
            <Icon icon="game-icons:shield" class="tt-stat-icon" style="color: #86efac" />
            <span class="tt-stat-val" :class="{ damaged: defDamaged }">{{ card.currentStats.defense }}</span>
            <span v-if="defDamaged" class="tt-stat-base">/{{ card.currentStats.maxDefense }}</span>
          </div>
        </div>

        <!-- Aktywne statusy (bez WRĘCZ i LATAJĄCY — widoczne na karcie i w statach) -->
        <div v-if="card.isSilenced || card.isImmune || card.cannotAttack || card.poisonRoundsLeft" class="tt-traits">
          <span v-if="card.isSilenced" class="tt-trait tt-trait-status">Uciszony</span>
          <span v-if="card.isImmune" class="tt-trait tt-trait-immune">Odporny</span>
          <span v-if="card.cannotAttack" class="tt-trait tt-trait-status">Nie może atakować</span>
          <span v-if="card.poisonRoundsLeft" class="tt-trait tt-trait-status">☠ Trucizna ({{ card.poisonRoundsLeft }}t)</span>
        </div>
      </template>

      <!-- Abilities z triggerami (jeśli dostępne) -->
      <template v-if="data.abilities && data.abilities.length">
        <div class="tt-abilities">
          <div v-for="(ab, i) in data.abilities" :key="i" class="tt-ability-entry">
            <span class="tt-ab-trigger">{{ {
              ON_PLAY: 'WEJŚCIE', ACTION: 'AKCJA', AURA: 'AURA', REACTION: 'REAKCJA',
              ON_DEATH: 'ŚMIERĆ', ON_KILL: 'ZABÓJSTWO', ON_TURN_START: 'START TURY',
              ON_TURN_END: 'KONIEC TURY', ON_ANY_DEATH: 'KAŻDA ŚMIERĆ', ON_ATTACK: 'ATAK',
              ON_ENEMY_PLAY: 'ZASADZKA', ENEMY_ACTION: 'AKCJA WROGA', PASSIVE: 'AURA',
            }[ab.trigger] ?? ab.trigger }}</span>
            <span class="tt-ab-text">{{ ab.text }}</span>
          </div>
        </div>
      </template>
      <!-- Fallback: stary opis efektu -->
      <div v-else-if="data.effectDescription" class="tt-effect">
        {{ data.effectDescription }}
      </div>

      <!-- Lore -->
      <div v-if="data.lore" class="tt-lore" v-html="data.lore" />

      <!-- Wyposażone artefakty -->
      <div v-if="card.equippedArtifacts && card.equippedArtifacts.length > 0" class="tt-artifacts">
        <div class="tt-section-label">Artefakty:</div>
        <div v-for="art in card.equippedArtifacts" :key="art.id" class="tt-artifact">
          <span class="tt-art-name">⚙ {{ art.name }}</span>
          <span v-if="art.effectDescription" class="tt-art-desc">{{ art.effectDescription }}</span>
        </div>
      </div>

      <!-- Aktywne efekty (buffy/debuffy) -->
      <div v-if="card.activeEffects.length > 0" class="tt-active-effects">
        <div
          v-for="(eff, i) in card.activeEffects"
          :key="i"
          class="tt-eff-entry"
        >
          <span class="tt-eff-id">{{ eff.effectId }}</span>
          <span v-if="eff.remainingTurns !== null" class="tt-eff-dur">({{ eff.remainingTurns }}t)</span>
        </div>
      </div>

      <!-- Tury na polu -->
      <div v-if="card.turnsInPlay > 0" class="tt-turns">
        Na polu: {{ card.turnsInPlay }} tur
      </div>

    </div>
  </Transition>
</template>

<style scoped>
.card-tooltip {
  position: fixed;
  bottom: 165px;
  left: 50%;
  transform: translateX(-50%);
  background: #0c1220;
  border: 1px solid var(--tc, #334155);
  border-radius: 8px;
  padding: 0;
  width: 200px;
  z-index: 150;
  pointer-events: none;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
  overflow: hidden;
}

.tt-header {
  padding: 7px 10px 5px;
  background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.tt-name {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  flex: 1;
}

.tt-domain {
  font-size: 9px;
  font-weight: 600;
  color: var(--tc, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tt-adventure-type {
  font-size: 9px;
  color: #818cf8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tt-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tt-domain-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  opacity: 0.9;
  flex-shrink: 0;
}

.tt-attack-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  opacity: 0.9;
  flex-shrink: 0;
}

.tt-trait-img {
  width: 11px;
  height: 11px;
  object-fit: contain;
  opacity: 0.85;
}

/* Grafika stworzenia */
.tt-art-wrap {
  width: 100%;
  height: 120px;
  overflow: hidden;
  position: relative;
}

.tt-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  display: block;
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

.tt-art-flying {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 28px;
  height: 28px;
  object-fit: contain;
  opacity: 0.95;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.7));
}

/* Statystyki */
.tt-stats-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 10px 4px;
}

.tt-stat-block {
  display: flex;
  align-items: center;
  gap: 3px;
}

.tt-stat-icon {
  font-size: 13px;
}

.tt-stat-val {
  font-size: 16px;
  font-weight: 800;
  font-family: monospace;
  color: #e2e8f0;
}

.tt-stat-val.damaged {
  color: #ef4444;
}

.tt-stat-base {
  font-size: 10px;
  color: #475569;
  font-family: monospace;
  margin-top: 2px;
}

.tt-stat-sep {
  font-size: 9px;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Cechy */
.tt-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 0 8px 6px;
}

.tt-trait {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid currentColor;
  display: flex;
  align-items: center;
  gap: 3px;
  opacity: 0.85;
}

.tt-trait-fly {
  color: #7dd3fc;
  border-color: rgba(125, 211, 252, 0.35);
}

.tt-trait-status {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.35);
}

.tt-trait-immune {
  color: #a78bfa;
  border-color: rgba(167, 139, 250, 0.35);
}

/* Abilities list */
.tt-abilities {
  padding: 5px 10px;
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tt-ability-entry {
  display: flex;
  gap: 5px;
  align-items: flex-start;
  line-height: 1.4;
}
.tt-ab-trigger {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(99,102,241,0.25);
  color: #a5b4fc;
  border-radius: 3px;
  padding: 1px 4px;
  flex-shrink: 0;
  margin-top: 1px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.tt-ab-text {
  font-size: 10px;
  color: #cbd5e1;
  line-height: 1.4;
}

/* Efekt (fallback) */
.tt-effect {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.5;
  font-style: italic;
  padding: 5px 10px;
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* Aktywne efekty */
.tt-active-effects {
  padding: 4px 10px;
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tt-eff-entry {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
}

.tt-eff-id {
  color: #86efac;
  font-family: monospace;
}

.tt-eff-dur {
  color: #64748b;
}

/* Artefakty */
.tt-artifacts {
  padding: 5px 10px;
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tt-section-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #475569;
  font-weight: 700;
}

.tt-artifact {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 4px;
  padding: 3px 6px;
}

.tt-art-name {
  font-size: 10px;
  font-weight: 600;
  color: #a5b4fc;
}

.tt-art-desc {
  font-size: 9px;
  color: #64748b;
  font-style: italic;
}

/* Lore */
.tt-lore {
  font-size: 9px;
  color: #475569;
  line-height: 1.5;
  font-style: italic;
  padding: 4px 10px 5px;
  border-top: 1px solid rgba(255,255,255,0.03);
}

/* Tury na polu */
.tt-turns {
  padding: 3px 10px 5px;
  font-size: 9px;
  color: #475569;
  border-top: 1px solid rgba(255,255,255,0.04);
  font-family: monospace;
}

/* Animacja */
.tooltip-fade-enter-active, .tooltip-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.tooltip-fade-enter-from, .tooltip-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
</style>
