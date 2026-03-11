<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import type { CardInstance } from '../../game-engine/types'
import { BattleLine, AttackType, Domain } from '../../game-engine/constants'
import { parseTokens } from '../../composables/useTokenIcons'

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
import defaultAdvImg from '~/assets/cards/creature/117.png'

const domainImgs: Record<number, string> = { 1: domainImg1, 2: domainImg2, 3: domainImg3, 4: domainImg4 }
const attackTypeImgs: Record<number, string> = { 1: attackTypeImg1, 2: attackTypeImg2, 3: attackTypeImg3 }
const adventureTypeImgs: Record<number, string> = { 1: artefaktImg, 2: lokacjaImg }

const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.png', { eager: true, import: 'default' }) as Record<string, string>
const creatureImgs = Object.fromEntries(
  Object.entries(_creatureImgModules)
    .map(([key, val]) => { const m = key.match(/(\d+)\.png$/); return m ? [parseInt(m[1]!), val] : null })
    .filter(Boolean) as [number, string][]
) as Record<number, string>

const ui = useUIStore()
const game = useGameStore()

// Mobile detection
const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches

function dismissTooltip() {
  ui.hideTooltip()
}

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
  const ev = game.state.activeEvents.find(e => e.instanceId === instanceId)
  if (ev) {
    return {
      instanceId: ev.instanceId, cardData: ev.cardData, owner: ev.owner,
      isRevealed: true, activeEffects: [], equippedArtifacts: [], turnsInPlay: 0,
      currentStats: { attack: 0, defense: 0, maxAttack: 0, maxDefense: 0 },
    } as unknown as CardInstance
  }
  // Location lookup — activeLocation per player
  for (const side of ['player1', 'player2'] as const) {
    const loc = game.state.players[side].activeLocation
    if (loc && loc.instanceId === instanceId) return loc
  }
  // Artifact lookup: instanceId = "artifact:<effectId>"
  if (instanceId.startsWith('artifact:')) {
    const artEffectId = instanceId.slice('artifact:'.length)
    for (const side of ['player1', 'player2'] as const) {
      for (const line of Object.values(game.state.players[side].field.lines)) {
        for (const card of line as CardInstance[]) {
          const art = card.equippedArtifacts?.find((a: any) => a.effectId === artEffectId)
          if (art) {
            return {
              instanceId, cardData: art, owner: side,
              isRevealed: true, activeEffects: [], equippedArtifacts: [], turnsInPlay: 0,
              currentStats: { attack: 0, defense: 0, maxAttack: 0, maxDefense: 0 },
            } as unknown as CardInstance
          }
        }
      }
    }
  }
  return null
}

const card = computed(() => {
  if (!ui.tooltipCardId) return null
  const c = findCard(ui.tooltipCardId)
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
    [Domain.PERUN]:  { name: 'Perun',     color: '#d4a843' },
    [Domain.ZYVI]:   { name: 'Żywi',      color: '#4a9e4a' },
    [Domain.UNDEAD]: { name: 'Nieumarli', color: '#8b5fc7' },
    [Domain.WELES]:  { name: 'Weles',     color: '#c44040' },
  }[d] ?? { name: '', color: '#64748b' }
})

const adventureTypeLabel = computed(() => {
  const t = data.value?.adventureType
  return t === 0 ? 'Zdarzenie' : t === 1 ? 'Artefakt' : t === 2 ? 'Lokacja' : ''
})

// Stat deltas
const baseAtk = computed(() => isCreature.value ? (data.value?.stats?.attack ?? 0) : 0)
const baseDef = computed(() => isCreature.value ? (data.value?.stats?.defense ?? 0) : 0)
const atkDelta = computed(() => (!isCreature.value || !card.value) ? 0 : card.value.currentStats.attack - baseAtk.value)
const defDelta = computed(() => (!isCreature.value || !card.value) ? 0 : card.value.currentStats.defense - baseDef.value)
const atkDamaged = computed(() => isCreature.value && card.value && atkDelta.value < 0)
const atkBuffed = computed(() => isCreature.value && card.value && atkDelta.value > 0)
const defDamaged = computed(() => isCreature.value && card.value && defDelta.value < 0)
const defBuffed = computed(() => isCreature.value && card.value && defDelta.value > 0)

// Active effect names + descriptions
const activeEffectNameMap: Record<string, { name: string; desc: string }> = {
  sztandar_mocy_buff: { name: 'Sztandar Mocy', desc: '+2 ATK dla sojuszników.' },
  twierdza_def_buff: { name: 'Twierdza', desc: '-3 DMG otrzymane.' },
  bazyliszek_paralyze: { name: 'Paraliż', desc: 'Nie może atakować przez 1 turę.' },
  zagorkinia_curse_drain: { name: 'Klątwa Żagorkini', desc: '-1 DEF na turę.' },
  likantropia_absorb: { name: 'Likantropia', desc: 'Po śmierci staje się Wilkołakiem.' },
  czarnoksieznik_steal_abilities: { name: 'Skradzione zdolności', desc: 'Zdolność ukradziona.' },
  wieszczy_spy_burn: { name: 'Szpieg', desc: '-1 DEF na turę właściciela.' },
  bieda_spy_block_draw: { name: 'Bieda', desc: 'Właściciel nie dobiera kart.' },
  homen_convert_on_death: { name: 'Homunculus', desc: 'Po śmierci wstaje jako Homen.' },
  trucizna_poison: { name: 'Trucizna', desc: '-1 DEF na turę.' },
  zmora_grow_sacrifice: { name: 'Zmora', desc: 'Rośnie w siłę kosztem sojuszników.' },
  solowiej_disarm: { name: 'Gwizd Słowieja', desc: 'Choroba: nie może atakować.' },
  biali_ludzie_disarm: { name: 'Choroba', desc: 'Nie może atakować — traci zdolność.' },
}
function getEffectName(effectId: string): string {
  return activeEffectNameMap[effectId]?.name ?? effectId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function getEffectDesc(effectId: string): string {
  return activeEffectNameMap[effectId]?.desc ?? ''
}

// Status explanations
const statusDescriptions: Record<string, string> = {
  CHOROBA: 'Istota nie może atakować. Nałożona przez efekt karty wroga.',
  PARALIZ: 'Istota jest sparaliżowana — pomija turę.',
  TRUCIZNA: 'Traci 1 DEF na początku każdej tury.',
  UCISZENIE: 'Zdolność istoty wyłączona.',
  KLATWA: 'Klątwa — negatywny efekt.',
}

// Buff source info — check card metadata for stat modifiers
const buffSources = computed<string[]>(() => {
  if (!card.value || !isCreature.value) return []
  const sources: string[] = []
  const c = card.value
  // Check equipped artifacts
  if (c.equippedArtifacts?.length) {
    for (const art of c.equippedArtifacts) {
      sources.push(`${(art as any).name ?? 'Artefakt'}`)
    }
  }
  // Check active effects that modify stats
  for (const eff of c.activeEffects) {
    const info = activeEffectNameMap[eff.effectId]
    if (info) sources.push(info.name)
  }
  return sources
})

// Trigger labels
const ttTriggerLabels: Record<string, string> = {
  ON_PLAY: 'WEJŚCIE', ACTION: 'AKCJA', AURA: 'AURA', REACTION: 'ODWET',
  ON_DEATH: 'POŻEGNANIE', ON_KILL: 'ZABÓJSTWO', ON_TURN_START: 'AURA',
  ON_TURN_END: 'AURA', ON_ANY_DEATH: 'CZUJNOŚĆ', ON_ATTACK: 'NATARCIE',
  ON_ENEMY_PLAY: 'CZUJNOŚĆ', ENEMY_ACTION: 'CZUJNOŚĆ', PASSIVE: 'AURA',
  ON_DAMAGE_DEALT: 'NATARCIE', ON_DAMAGE_RECEIVED: 'ODWET', ON_ACTIVATE: 'AKCJA',
  ON_ALLY_ATTACKED: 'CZUJNOŚĆ',
}
const ttTriggerColors: Record<string, string> = {
  'WEJŚCIE': '#22c55e', 'AKCJA': '#a855f7', 'AURA': '#3b82f6', 'ODWET': '#f97316',
  'NATARCIE': '#ef4444', 'ZABÓJSTWO': '#ef4444', 'POŻEGNANIE': '#6b7280', 'CZUJNOŚĆ': '#eab308',
}

const tagColors = ttTriggerColors
function parseTaggedDescription(desc: string): Array<{ type: 'tag' | 'text'; value: string; color?: string }> {
  const parts: Array<{ type: 'tag' | 'text'; value: string; color?: string }> = []
  const regex = /\[(WEJŚCIE|AKCJA|AURA|ODWET|NATARCIE|ZABÓJSTWO|POŻEGNANIE|CZUJNOŚĆ)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(desc)) !== null) {
    if (match.index > lastIndex) {
      const text = desc.slice(lastIndex, match.index).trim()
      if (text) parts.push({ type: 'text', value: text })
    }
    parts.push({ type: 'tag', value: match[1]!, color: tagColors[match[1]!] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < desc.length) {
    const text = desc.slice(lastIndex).trim()
    if (text) parts.push({ type: 'text', value: text })
  }
  return parts
}
const parsedEffectDescription = computed(() => {
  if (!data.value?.effectDescription) return []
  return parseTaggedDescription(data.value.effectDescription)
})

// Border color based on domain
const borderColor = computed(() => isCreature.value ? domainInfo.value.color : '#6366f1')
</script>

<template>
  <!-- Mobile: backdrop to dismiss tooltip -->
  <Transition name="pv-backdrop-fade">
    <div v-if="card && data && isMobile" class="pv-mobile-backdrop" @click="dismissTooltip" />
  </Transition>

  <Transition name="pv-fade">
    <div v-if="card && data" class="card-preview" :style="{ '--dc': borderColor }">

      <!-- Mobile close button -->
      <button v-if="isMobile" class="pv-mobile-close" @click="dismissTooltip">✕</button>

      <!-- Animated shimmer border -->
      <div class="pv-shimmer-border" />

      <!-- Outer glow -->
      <div class="pv-glow" />

      <!-- Inner content -->
      <div class="pv-inner">

        <!-- ART SECTION (top 38%) -->
        <div class="pv-art-section" v-if="isCreature">
          <img :src="creatureImgs[data.id] ?? defaultAdvImg" class="pv-art" />
          <div class="pv-art-vignette" />
          <div class="pv-art-gradient" />

          <!-- Drobinki ognia -->
          <div class="pv-fire-particles">
            <span v-for="i in 8" :key="'fp'+i" class="pv-fire-dot" :style="{ left: (8 + ((i * 41) % 84)) + '%', animationDuration: (1.8 + (i * 0.19) % 2) + 's', animationDelay: ((i * 0.29) % 3) + 's', width: (1.5 + (i % 4) * 0.6) + 'px', height: (1.5 + (i % 4) * 0.6) + 'px', '--dot-color': ['#ff3300','#ff5500','#ff8800','#ffaa00'][i % 4] }" />
          </div>

          <!-- Domain badge (top-left) -->
          <div class="pv-domain-badge">
            <img v-if="domainImgs[data.domain]" :src="domainImgs[data.domain]" class="pv-domain-img" />
            <span class="pv-domain-label" :style="{ color: domainInfo.color + 'bb' }">{{ domainInfo.name.toUpperCase() }}</span>
          </div>

          <!-- Name badge (top-right) -->
          <div class="pv-name-badge">
            <div class="pv-name">{{ data.name.toUpperCase() }}</div>
          </div>

          <!-- Attribute badges (bottom-left of art) -->
          <div class="pv-attr-badges">
            <div class="pv-attr-badge" :style="{ borderColor: attackTypeInfo.color + '30' }" v-tip="attackTypeInfo.label">
              <img v-if="attackTypeImgs[data.attackType]" :src="attackTypeImgs[data.attackType]" class="pv-attr-icon" />
              <Icon v-else :icon="attackTypeInfo.icon" class="pv-attr-icon-svg" :style="{ color: attackTypeInfo.color }" />
            </div>
            <div v-if="data.isFlying && !card.isGrounded" class="pv-attr-badge" style="border-color: rgba(56,189,248,0.2)" v-tip="'Latający'">
              <img :src="flyingImg" class="pv-attr-icon" />
            </div>
          </div>
        </div>

        <!-- Art section for non-creature (adventure cards) — miniature card style -->
        <div class="pv-adv-card" v-else :style="{ '--adv-color': data.adventureType === 0 ? '#f59e0b' : data.adventureType === 1 ? '#6366f1' : data.adventureType === 2 ? '#10b981' : '#94a3b8' }">
          <!-- Top type bar -->
          <div class="pv-adv-type-bar">
            <img v-if="adventureTypeImgs[data.adventureType]" :src="adventureTypeImgs[data.adventureType]" class="pv-adv-type-img" />
            <Icon v-else icon="game-icons:scroll-unfurled" class="pv-adv-type-icon" />
            <span class="pv-adv-type-label">{{ adventureTypeLabel.toUpperCase() }}</span>
            <span v-if="data.persistence" class="pv-adv-persist">
              {{ data.persistence === 'permanent' ? '∞ TRWAŁY' : data.persistence === 'duration' ? '⏳ CZASOWY' : data.persistence === 'conditional' ? '⛓ WARUNKOWY' : '⚡ NATYCHMIASTOWY' }}
            </span>
          </div>
          <!-- Art -->
          <div class="pv-adv-art-wrap">
            <img :src="defaultAdvImg" class="pv-art" style="filter: hue-rotate(200deg) saturate(0.7) brightness(0.8);" />
            <div class="pv-art-vignette" />
            <div class="pv-art-gradient" />
            <!-- Name overlay -->
            <div class="pv-adv-name-overlay">
              <div class="pv-name">{{ data.name.toUpperCase() }}</div>
            </div>
          </div>
        </div>

        <!-- CONTENT SECTION -->
        <div class="pv-content">

          <!-- Abilities (triggers + text) -->
          <template v-if="data.abilities && data.abilities.length">
            <div class="pv-abilities">
              <div v-for="(ab, i) in data.abilities" :key="i" class="pv-ability">
                <span
                  v-if="ab.text.startsWith('+')"
                  class="pv-trigger-badge"
                  :style="{ background: '#eab30818', color: '#fbbf24', borderColor: '#eab30844' }"
                >ULEPSZENIE</span>
                <span
                  v-else
                  class="pv-trigger-badge"
                  :style="{ background: (ttTriggerColors[ttTriggerLabels[ab.trigger] ?? ''] ?? '#a5b4fc') + '18', color: ttTriggerColors[ttTriggerLabels[ab.trigger] ?? ''] ?? '#a5b4fc', borderColor: (ttTriggerColors[ttTriggerLabels[ab.trigger] ?? ''] ?? '#a5b4fc') + '44' }"
                >{{ ttTriggerLabels[ab.trigger] ?? ab.trigger }}</span>
                <span class="pv-ability-text">
                  <template v-for="(seg, si) in parseTokens(ab.text, data?.attackType)" :key="si">
                    <span v-if="seg.type === 'text'">{{ seg.value }}</span>
                    <img v-else-if="seg.img" :src="seg.img" class="tt-token-icon" :title="seg.label" />
                    <Icon v-else-if="seg.iconify" :icon="seg.iconify" class="tt-token-icon-svg" :style="{ color: seg.color }" :title="seg.label" />
                  </template>
                </span>
              </div>
            </div>
          </template>
          <div v-else-if="data.effectDescription" class="pv-effect-desc">
            <template v-for="(part, pi) in parsedEffectDescription" :key="pi">
              <span
                v-if="part.type === 'tag'"
                class="pv-trigger-badge pv-inline-tag"
                :style="{ background: part.color + '18', color: part.color, borderColor: part.color + '44' }"
              >{{ part.value }}</span>
              <span v-else>{{ part.value }}</span>
            </template>
          </div>

          <!-- Enhanced effect (adventures) — only if no abilities[] (legacy fallback) -->
          <div v-if="!isCreature && data.enhancedEffectDescription && !(data.abilities && data.abilities.length)" class="pv-enhanced">
            <span class="pv-enhanced-label">Ulepszony:</span> {{ data.enhancedEffectDescription }}
          </div>

          <!-- Traits (silenced, immune, etc.) with descriptions -->
          <div v-if="isCreature && (card.isSilenced || card.isImmune || card.cannotAttack || card.poisonRoundsLeft)" class="pv-traits">
            <div v-if="card.isSilenced" class="pv-trait-block">
              <span class="pv-trait pv-trait-bad">Uciszony</span>
              <span class="pv-trait-desc">Zdolność istoty wyłączona.</span>
            </div>
            <div v-if="card.isImmune" class="pv-trait-block">
              <span class="pv-trait pv-trait-good">Odporny</span>
            </div>
            <div v-if="card.cannotAttack" class="pv-trait-block">
              <span class="pv-trait pv-trait-bad">Choroba — Nie może atakować</span>
              <span class="pv-trait-desc">Nałożona przez efekt karty wroga.</span>
            </div>
            <div v-if="card.poisonRoundsLeft" class="pv-trait-block">
              <span class="pv-trait pv-trait-bad">☠ Trucizna ({{ card.poisonRoundsLeft }}t)</span>
              <span class="pv-trait-desc">Traci 1 DEF na początku każdej tury.</span>
            </div>
          </div>

          <!-- STATS BAR -->
          <div v-if="isCreature" class="pv-stats-bar">
            <div class="pv-stat pv-stat-atk">
              <img v-if="attackTypeImgs[data.attackType]" :src="attackTypeImgs[data.attackType]" class="pv-stat-img" />
              <Icon v-else :icon="attackTypeInfo.icon" class="pv-stat-icon" :style="{ color: '#fb923c' }" />
              <span class="pv-stat-num" :class="{ 'pv-damaged': atkDamaged, 'pv-buffed': atkBuffed }">{{ card.currentStats.attack }}</span>
              <span v-if="atkDelta !== 0" class="pv-stat-delta" :class="{ 'pv-delta-up': atkDelta > 0, 'pv-delta-down': atkDelta < 0 }">{{ atkDelta > 0 ? '+' : '' }}{{ atkDelta }}</span>
              <span v-if="atkDelta !== 0" class="pv-stat-base">({{ baseAtk }})</span>
            </div>
            <div class="pv-stat pv-stat-def">
              <Icon icon="game-icons:shield" class="pv-stat-icon" style="color: #60a5fa" />
              <span class="pv-stat-num" :class="{ 'pv-damaged': defDamaged, 'pv-buffed': defBuffed }">{{ card.currentStats.defense }}</span>
              <span v-if="defDelta !== 0" class="pv-stat-delta" :class="{ 'pv-delta-up': defDelta > 0, 'pv-delta-down': defDelta < 0 }">{{ defDelta > 0 ? '+' : '' }}{{ defDelta }}</span>
              <span v-if="defDelta !== 0" class="pv-stat-base">({{ baseDef }})</span>
            </div>
          </div>

          <!-- Buff/debuff sources -->
          <div v-if="(atkDelta !== 0 || defDelta !== 0) && buffSources.length > 0" class="pv-buff-sources">
            <span class="pv-buff-label">Modyfikatory:</span>
            <span v-for="(src, si) in buffSources" :key="si" class="pv-buff-src">{{ src }}</span>
          </div>

          <!-- Equipped artifacts -->
          <div v-if="card.equippedArtifacts && card.equippedArtifacts.length > 0" class="pv-section">
            <div class="pv-section-label">Artefakty</div>
            <div v-for="art in card.equippedArtifacts" :key="art.id" class="pv-artifact">
              <span class="pv-art-name">⚙ {{ art.name }}</span>
              <span v-if="art.effectDescription" class="pv-art-desc">{{ art.effectDescription }}</span>
            </div>
          </div>

          <!-- Active effects with descriptions -->
          <div v-if="card.activeEffects.length > 0" class="pv-section">
            <div class="pv-section-label">Aktywne efekty</div>
            <div v-for="(eff, i) in card.activeEffects" :key="i" class="pv-effect-entry-block">
              <div class="pv-effect-entry">
                <span class="pv-effect-dot">✦</span>
                <span class="pv-effect-name">{{ getEffectName(eff.effectId) }}</span>
                <span v-if="eff.remainingTurns !== null" class="pv-effect-dur">({{ eff.remainingTurns }}t)</span>
                <span v-else class="pv-effect-perm">∞</span>
              </div>
              <div v-if="getEffectDesc(eff.effectId)" class="pv-effect-desc-text">{{ getEffectDesc(eff.effectId) }}</div>
            </div>
          </div>

          <!-- Lore -->
          <div v-if="data.lore" class="pv-lore" v-html="data.lore" />

          <!-- Turns on field -->
          <div v-if="card.turnsInPlay > 0" class="pv-turns">Na polu: {{ card.turnsInPlay }} tur</div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.card-preview {
  position: fixed;
  bottom: 10px;
  left: 10px;
  width: 340px;
  max-height: calc(100vh - 40px);
  z-index: 150;
  pointer-events: none;
}

/* Animated shimmer border */
.pv-shimmer-border {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  padding: 2px;
  background: linear-gradient(135deg, var(--dc), color-mix(in srgb, var(--dc) 60%, #ff6b35), color-mix(in srgb, var(--dc) 40%, #ffaa00), color-mix(in srgb, var(--dc) 60%, #ff6b35), var(--dc));
  background-size: 300% 300%;
  animation: shimmerBorder 5s linear infinite;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0.45;
}
@keyframes shimmerBorder {
  0%   { background-position: 0% 0%; }
  100% { background-position: 300% 300%; }
}

/* Outer glow */
.pv-glow {
  position: absolute;
  inset: -6px;
  border-radius: 16px;
  background: radial-gradient(ellipse, color-mix(in srgb, var(--dc) 15%, transparent), transparent 70%);
  /* filter: blur(10px) removed — causes GPU blur on every tooltip show, lags hover */
  opacity: 0.6;
  pointer-events: none;
}

.pv-inner {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #0a0406;
  box-shadow: 0 8px 32px rgba(0,0,0,0.8);
}

/* ART SECTION */
.pv-art-section {
  position: relative;
  height: 260px;
  overflow: hidden;
}
.pv-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  display: block;
}
.pv-art-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 85% 80% at 50% 35%, transparent 30%, rgba(10,4,6,0.45) 100%);
}
.pv-art-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: linear-gradient(transparent, #0a0406);
}

/* Fire particles */
.pv-fire-particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: inherit;
}
.pv-fire-dot {
  position: absolute;
  bottom: 8%;
  border-radius: 50%;
  background: radial-gradient(circle, var(--dot-color), transparent);
  box-shadow: 0 0 4px var(--dot-color);
  opacity: 0;
  animation: pvFireRise ease-out infinite;
}
@keyframes pvFireRise {
  0%   { transform: translateY(0) scale(1); opacity: 0; }
  8%   { opacity: 0.8; }
  100% { transform: translateY(-100px) translateX(-6px) scale(0.1); opacity: 0; }
}

/* Domain badge */
.pv-domain-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(0,0,0,0.8);
  border: 1px solid color-mix(in srgb, var(--dc) 30%, transparent);
}
.pv-domain-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.pv-domain-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

/* Name badge */
.pv-name-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  max-width: calc(100% - 100px);
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(0,0,0,0.8);
  border: 1px solid color-mix(in srgb, var(--dc) 20%, transparent);
}
.pv-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 500;
  color: #f0ede8;
  letter-spacing: 0.08em;
  text-shadow: 0 1px 6px rgba(0,0,0,0.9);
  line-height: 1.2;
}

/* Attribute badges (bottom of art) */
.pv-attr-badges {
  position: absolute;
  bottom: 12px;
  left: 10px;
  display: flex;
  gap: 6px;
  z-index: 10;
}
.pv-attr-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0,0,0,0.8);
  border: 1px solid;
}
.pv-attr-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.pv-attr-icon-svg {
  font-size: 16px;
}
.pv-attr-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

/* ===== ADVENTURE CARD MINIATURE ===== */
.pv-adv-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pv-adv-type-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--adv-color) 12%, #0a0406);
  border-bottom: 1px solid color-mix(in srgb, var(--adv-color) 25%, transparent);
}
.pv-adv-type-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.pv-adv-type-icon {
  font-size: 16px;
  color: var(--adv-color);
}
.pv-adv-type-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--adv-color);
}
.pv-adv-persist {
  margin-left: auto;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--adv-color) 70%, #94a3b8);
  text-transform: uppercase;
}
.pv-adv-art-wrap {
  position: relative;
  height: 200px;
  overflow: hidden;
}
.pv-adv-name-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px 14px;
  background: linear-gradient(transparent, rgba(10,4,6,0.95) 60%);
}

/* CONTENT */
.pv-content {
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Abilities */
.pv-abilities {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pv-ability {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  line-height: 1.5;
}
.pv-trigger-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid;
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
  margin-top: 1px;
  white-space: nowrap;
}
.pv-ability-text {
  font-size: 12px;
  color: rgba(235,225,215,0.9);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.55;
}

/* Token inline icons in tooltip */
.tt-token-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  vertical-align: middle;
  margin: -2px 1px;
}
.tt-token-icon-svg {
  display: inline;
  width: 15px;
  height: 15px;
  vertical-align: middle;
  margin: -2px 1px;
}

/* Effect description fallback */
.pv-effect-desc {
  font-size: 12px;
  color: rgba(235,225,215,0.85);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.55;
}
.pv-inline-tag {
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
}

/* Enhanced */
.pv-enhanced {
  font-size: 11px;
  color: #fbbf24;
  line-height: 1.5;
}
.pv-enhanced-label {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fbbf24;
}

/* Traits */
.pv-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pv-trait {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid;
  font-weight: 600;
}
.pv-trait-bad {
  color: #f87171;
  border-color: rgba(248,113,113,0.3);
  background: rgba(248,113,113,0.08);
}
.pv-trait-good {
  color: #a78bfa;
  border-color: rgba(167,139,250,0.3);
  background: rgba(167,139,250,0.08);
}

/* STATS BAR */
.pv-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}
.pv-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 10px;
  background: rgba(0,0,0,0.5);
}
.pv-stat-atk { border: 1.5px solid rgba(251,146,60,0.2); }
.pv-stat-def { border: 1.5px solid rgba(96,165,250,0.2); }
.pv-stat-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.pv-stat-icon {
  font-size: 20px;
}
.pv-stat-num {
  font-size: 22px;
  font-weight: 800;
  font-family: var(--font-display, Georgia, serif);
  color: #e2e8f0;
}
.pv-stat-atk .pv-stat-num { color: #fb923c; text-shadow: 0 0 14px rgba(251,146,60,0.3); }
.pv-stat-def .pv-stat-num { color: #60a5fa; text-shadow: 0 0 14px rgba(96,165,250,0.3); }
.pv-damaged { color: #ef4444 !important; }
.pv-buffed { color: #4ade80 !important; text-shadow: 0 0 8px rgba(74,222,128,0.4) !important; }
.pv-stat-delta {
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
}
.pv-delta-up { color: #4ade80; }
.pv-delta-down { color: #f87171; }
.pv-stat-base {
  font-size: 10px;
  color: #475569;
  font-family: monospace;
}

/* Sections (artifacts, effects) */
.pv-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pv-section-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
  font-weight: 700;
}
.pv-artifact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(99,102,241,0.08);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 6px;
  padding: 5px 8px;
}
.pv-art-name {
  font-size: 11px;
  font-weight: 600;
  color: #a5b4fc;
}
.pv-art-desc {
  font-size: 10px;
  color: #64748b;
  font-style: italic;
}

/* Active effects */
.pv-effect-entry-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pv-effect-entry {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pv-effect-dot { color: #a78bfa; font-size: 9px; }
.pv-effect-name { color: #c4b5fd; font-size: 10px; }
.pv-effect-dur { color: #64748b; font-size: 9px; }
.pv-effect-perm { color: #475569; font-size: 9px; }
.pv-effect-desc-text {
  font-size: 9px;
  color: #64748b;
  font-style: italic;
  padding-left: 16px;
}

/* Trait blocks with description */
.pv-trait-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pv-trait-desc {
  font-size: 9px;
  color: #64748b;
  font-style: italic;
  padding-left: 8px;
}

/* Buff sources */
.pv-buff-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.pv-buff-label {
  font-size: 9px;
  color: #475569;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pv-buff-src {
  font-size: 9px;
  color: #a78bfa;
  background: rgba(167,139,250,0.08);
  border: 1px solid rgba(167,139,250,0.2);
  padding: 1px 6px;
  border-radius: 3px;
}

/* LORE */
.pv-lore {
  font-size: 12px;
  color: #c4956a;
  line-height: 1.65;
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
  padding-left: 14px;
  border-left: 3px solid rgba(196,140,80,0.3);
}

/* Separator before lore */
.pv-lore::before {
  content: '';
  display: block;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--dc) 12%, transparent), transparent);
  margin-bottom: 8px;
  margin-left: -14px;
}

.pv-turns {
  font-size: 10px;
  color: #475569;
  font-family: monospace;
}

/* ANIMATION */
.pv-fade-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}
.pv-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.pv-fade-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
.pv-fade-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

/* Mobile backdrop */
.pv-mobile-backdrop {
  display: none;
}
.pv-mobile-close {
  display: none;
}

/* Backdrop transition */
.pv-backdrop-fade-enter-active { transition: opacity 0.2s; }
.pv-backdrop-fade-leave-active { transition: opacity 0.15s; }
.pv-backdrop-fade-enter-from,
.pv-backdrop-fade-leave-to { opacity: 0; }

/* ====== MOBILE RESPONSIVE — full-screen card preview ====== */
@media (max-width: 767px) {
  /* Dark backdrop behind tooltip */
  .pv-mobile-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 149;
    background: rgba(0,0,0,0.7);
    pointer-events: auto;
  }

  /* Close button */
  .pv-mobile-close {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 160;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0,0,0,0.7);
    border: 1px solid rgba(200,168,78,0.3);
    color: #f0ede8;
    font-size: 16px;
    cursor: pointer;
    pointer-events: auto;
  }

  /* Full-screen centered card preview */
  .card-preview {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    bottom: auto;
    width: 92vw;
    max-width: 360px;
    max-height: 85vh;
    border-radius: 12px;
    overflow: hidden;
    pointer-events: auto;
    z-index: 155;
  }
  .pv-shimmer-border {
    border-radius: 12px;
  }
  .pv-glow {
    display: none;
  }
  .pv-inner {
    border-radius: 12px;
    max-height: 85vh;
    overflow-y: auto;
  }
  .pv-art-section {
    height: 200px;
  }
  .pv-adv-card .pv-adv-art-wrap {
    height: 140px;
  }
  .pv-name {
    font-size: 15px;
  }
  .pv-content {
    padding: 8px 12px 16px;
    gap: 6px;
  }
  .pv-ability-text {
    font-size: 11px;
  }
  .pv-stat-num {
    font-size: 20px;
  }
  .pv-stat-icon {
    font-size: 18px;
  }
  .pv-stat {
    padding: 5px 12px;
  }
  .pv-lore {
    font-size: 11px;
  }

  /* Transition: scale in from center */
  .pv-fade-enter-from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.85);
  }
  .pv-fade-leave-to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
  .pv-fade-enter-active {
    transition: opacity 0.2s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .pv-fade-leave-active {
    transition: opacity 0.15s, transform 0.15s ease-in;
  }
}
</style>
