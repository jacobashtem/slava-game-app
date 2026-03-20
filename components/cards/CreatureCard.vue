<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { CardInstance } from '../../game-engine/types'
import { AttackType, CardPosition } from '../../game-engine/constants'
import { getAllCreaturesOnField } from '../../game-engine/LineManager'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import { parseTokens } from '../../composables/useTokenIcons'
// Grafiki stworzeń: automatycznie wczytuje assets/cards/creature/{id}.webp
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const creatureImgs = Object.fromEntries(
  Object.entries(_creatureImgModules)
    .map(([key, val]) => { const m = key.match(/(\d+)\.webp$/); return m ? [parseInt(m[1]!), val] : null })
    .filter(Boolean) as [number, string][]
) as Record<number, string>

import domainImg1 from '~/assets/cards/domain-1.svg'
import domainImg2 from '~/assets/cards/domain-2.svg'
import domainImg3 from '~/assets/cards/domain-3.svg'
import domainImg4 from '~/assets/cards/domain-4.svg'
import attackTypeImg1 from '~/assets/cards/attackType1.svg'
import attackTypeImg2 from '~/assets/cards/attackType2.svg'
import attackTypeImg2Alt from '~/assets/cards/attackType2-alt.svg'
import attackTypeImg0 from '~/assets/cards/attackType0.svg'
import attackTypeImg3 from '~/assets/cards/attackType3.svg'
import attackTypeImg0Alt from '~/assets/cards/attackType0-alt.svg'

const domainImgs: Record<number, string> = { 1: domainImg1, 2: domainImg2, 3: domainImg3, 4: domainImg4 }
const attackTypeImgs: Record<number, string> = {}
const attackTypeOverrides: Record<number, string> = {}

const domainNames: Record<number, string> = { 1: 'Perun', 2: 'Żywi', 3: 'Nieumarli', 4: 'Weles' }
const domainName = computed(() => domainNames[cardData.value.domain as number] ?? '')

const triggerLabels: Record<string, string> = {
  ON_PLAY: 'WEJŚCIE',
  ACTION: 'AKCJA',
  AURA: 'AURA',
  REACTION: 'ODWET',
  ON_DEATH: 'POŻEGNANIE',
  ON_KILL: 'ZABÓJSTWO',
  ON_TURN_START: 'AURA',
  ON_TURN_END: 'AURA',
  ON_ANY_DEATH: 'CZUJNOŚĆ',
  ON_ATTACK: 'NATARCIE',
  ON_ENEMY_PLAY: 'CZUJNOŚĆ',
  ENEMY_ACTION: 'CZUJNOŚĆ',
  PASSIVE: 'AURA',
  ON_DAMAGE_DEALT: 'ZRANIENIE',
  ON_DAMAGE_RECEIVED: 'ODWET',
  ON_ACTIVATE: 'AKCJA',
  ON_ALLY_ATTACKED: 'CZUJNOŚĆ',
  // Display labels z JSON (abilities[].trigger mogą być już po polsku)
  'WEJŚCIE': 'WEJŚCIE',
  'AKCJA': 'AKCJA',
  // 'AURA' already mapped above
  'ODWET': 'ODWET',
  'NATARCIE': 'NATARCIE',
  'ZRANIENIE': 'ZRANIENIE',
  'ZABÓJSTWO': 'ZABÓJSTWO',
  'POŻEGNANIE': 'POŻEGNANIE',
  'CZUJNOŚĆ': 'CZUJNOŚĆ',
}

// Tag colors for trigger labels and [TAG] badges
const tagColors: Record<string, string> = {
  'WEJŚCIE': '#22c55e',
  'AKCJA': '#a855f7',
  'AURA': '#3b82f6',
  'ODWET': '#f97316',
  'NATARCIE': '#ef4444',
  'ZRANIENIE': '#dc2626',
  'ZABÓJSTWO': '#ef4444',
  'POŻEGNANIE': '#6b7280',
  'CZUJNOŚĆ': '#eab308',
}

function getTriggerColor(trigger: string): string {
  const label = triggerLabels[trigger] ?? trigger
  return tagColors[label] ?? '#a5b4fc'
}

const abilities = computed(() => (cardData.value.abilities ?? []) as Array<{trigger: string; text: string}>)

// Spy badge — cards played on enemy field
const spyEffectIds = new Set([
  'wieszczy_spy_burn',
  'bieda_spy_block_draw',
])
const isSpy = computed(() => {
  if (!props.card || props.inHand) return false
  return spyEffectIds.has(cardData.value.effectId)
})

// Parse ability text tokens into renderable segments
function getTokenSegments(text: string) {
  return parseTokens(text, cardData.value.attackType as number)
}

const props = defineProps<{
  card: CardInstance
  selected?: boolean
  isValidTarget?: boolean
  dimmed?: boolean
  inHand?: boolean
  togglePositionOnClick?: boolean  // PLAY faza: klik = zmień pozycję
  effectAvailable?: boolean        // ⚡ aktywowalna zdolność gotowa
  effectCost?: number              // koszt aktywacji w PS (0 = darmowe)
  canTogglePosition?: boolean      // może zmienić pozycję (PLAY lub COMBAT nieaatkująca)
}>()

const emit = defineEmits<{
  click: [card: CardInstance]
  mouseenter: [card: CardInstance]
  mouseleave: []
  'change-position': [card: CardInstance]
  'activate-effect': [card: CardInstance]
}>()

const ui = useUIStore()

// Efektywny effectId: uwzględnia zamianę Rodzanic
const activeEffectId = computed(() => {
  if (props.card.metadata?.rodzaniceStolen && props.card.metadata?.rodzaniceBonusEffectId) {
    return props.card.metadata.rodzaniceBonusEffectId as string
  }
  return (cardData.value as any).effectId
})

// ===== WSKAŹNIKI STANU (TIER 4 visual indicators) =====
const isTaunt       = computed(() => !props.inHand && activeEffectId.value === 'blotnik_taunt' && !props.card.isSilenced)
const isMatecznik   = computed(() => !props.inHand && !!props.card.metadata?.matecznikHidden)
const isPrzyjaznGuard    = computed(() => !props.inHand && !!props.card.metadata?.przyjaznGuard)
const isPrzyjaznProtected = computed(() => !props.inHand && !!props.card.metadata?.przyjaznProtector)
const isLycan       = computed(() => !props.inHand && !!props.card.metadata?.likantropiaActive)
const hasDeathMark  = computed(() => !props.inHand && !!props.card.metadata?.dziewiatkoDeathMark)
const isCursed      = computed(() => !props.inHand && !!props.card.metadata?.zagorkiniaCursed)
const isInvincible  = computed(() => !props.inHand && activeEffectId.value === 'wapierz_invincible_hunger')
const isWijRevived  = computed(() => !props.inHand && !!props.card.metadata?.wijRevived)
const isGuardian    = computed(() => !props.inHand && activeEffectId.value === 'niedzwiedzioak_guardian' && !props.card.isSilenced)
const isRiding      = computed(() => !props.inHand && !!props.card.metadata?.rumakActive)
const isHomenCursed = computed(() => !props.inHand && !!props.card.metadata?.homenCurseOwner)
const isHypnotized  = computed(() => !props.inHand && ui.mode === 'hypnosis' && ui.hypnosisAttackerId === props.card.instanceId && ui.hypnosisPhase === 2)

// ===== P1 VFX STATUSY =====
const isParalyzed   = computed(() => !props.inHand && props.card.paralyzeRoundsLeft !== null && props.card.paralyzeRoundsLeft !== 0)
const isDiseased    = computed(() => !props.inHand && !!props.card.cannotAttack && !isParalyzed.value)
// Matoha aura: enemy magic creatures can't attack (visual indicator even without cannotAttack flag)
const isMatohaBlocked = computed(() => {
  if (props.inHand || (cardData.value as any).attackType !== AttackType.MAGIC) return false
  const game = useGameStore()
  if (!game.state) return false
  const oppSide = props.card.owner === 'player1' ? 'player2' : 'player1'
  return getAllCreaturesOnField(game.state, oppSide).some(c => {
    const eid = c.metadata?.rodzaniceStolen ? (c.metadata.rodzaniceBonusEffectId as string) : (c.cardData as any).effectId
    return eid === 'matoha_anti_magic' && !c.isSilenced
  })
})
const isLifestealer = computed(() => !props.inHand && ['strzyga_lifesteal', 'bezkost_atk_drain', 'latawica_drain_ally'].includes(activeEffectId.value) && !props.card.isSilenced)
const isDeathFeeder = computed(() => !props.inHand && ['baba_jaga_death_growth', 'smierc_death_growth_save'].includes(activeEffectId.value) && !props.card.isSilenced)
const isAoEAura     = computed(() => !props.inHand && ['morowa_dziewica_aoe_all', 'cicha_kill_weak', 'poludnica_kill_weakest'].includes(activeEffectId.value) && !props.card.isSilenced)

// P2 AURA_RING — persistent aura glow per effect type
const auraRingClass = computed(() => {
  if (props.inHand || props.card.isSilenced) return ''
  const eid = activeEffectId.value
  switch (eid) {
    case 'mroz_immunity_buffs': return 'aura-ring-ice'
    case 'leszy_post_attack_defend': return 'aura-ring-forest'
    case 'matoha_anti_magic': return 'aura-ring-antimagic'
    case 'blotnik_taunt': return 'aura-ring-taunt'
    case 'kudlak_invincible_hunger': return 'aura-ring-blood'
    case 'wapierz_invincible_hunger': return 'aura-ring-dark'
    default: return ''
  }
})

// VFX (conversion, status flash, zombify) removed — will be handled by VFXOrchestrator (P3)

// ===== LICZNIKI NA KARTACH =====
const game = useGameStore()

// Smocze Jajo: odliczanie do wylęgu (5 rund)
const jajoCounter = computed(() => {
  if (props.inHand || (props.card.cardData as any).effectId !== 'smocze_jajo_hatch') return null
  const roundsInPlay = (game.state?.roundNumber ?? 0) - (props.card.roundEnteredPlay ?? 0)
  return { current: Math.min(roundsInPlay, 5), max: 5 }
})

// Bałwan: odliczanie do pęknięcia (3 rundy)
const balwanCounter = computed(() => {
  if (props.inHand || (props.card.cardData as any).effectId !== 'balwan_free_divine_favor') return null
  const roundsInPlay = (game.state?.roundNumber ?? 0) - (props.card.roundEnteredPlay ?? 0)
  return { current: Math.min(roundsInPlay, 3), max: 3 }
})

// Młot Swaroga: ile ataków zostało
const mlotCounter = computed(() => {
  if (props.inHand || !props.card.metadata?.mlotSwarogaActive) return null
  return (props.card.metadata.mlotSwarogaAttacksLeft as number) ?? 0
})

// Artefakt badge: pokaż ikony artefaktów na karcie (obsługuje wiele)
const artMap: Record<string, { icon: string; label: string }> = {
  'adventure_sztandar':           { icon: '🏴', label: 'Sztandar (+2 ATK sojusznikom, nie atakuje)' },
  'adventure_sztandar_enhanced':  { icon: '🏴', label: 'Sztandar+ (+2 ATK, sojusznik przejmuje atak)' },
  'adventure_miecz_kladenet':     { icon: '⚔', label: 'Miecz Kladenet (2 cele, brak kontrataku)' },
  'adventure_miecz_kladenet_enhanced': { icon: '⚔', label: 'Miecz Kladenet+ (2 cele, dowolna linia)' },
  'adventure_topor_peruna':       { icon: '⚡', label: 'Topór Peruna (×4 DMG, brak kontrataku)' },
  'adventure_topor_peruna_enhanced': { icon: '⚡', label: 'Topór Peruna+ (×4, piercing)' },
  'adventure_mlot_swaroga':       { icon: '🔨', label: 'Młot Swaroga (3 szalone ataki)' },
  'adventure_mlot_swaroga_enhanced': { icon: '🔨', label: 'Młot Swaroga+ (3 ataki bez kontry)' },
  'adventure_likantropia':        { icon: '🐺', label: 'Likantropia (absorpcja przy zabiciu)' },
  'adventure_likantropia_enhanced': { icon: '🐺', label: 'Likantropia+ (absorpcja + sojusznicy)' },
  'adventure_kwiat_paproci':      { icon: '🌸', label: 'Kwiat Paproci (zmiana typu ataku)' },
  'adventure_kwiat_paproci_enhanced': { icon: '🌸', label: 'Kwiat Paproci+ (typ + odporność)' },
  'adventure_moc_swiatogora':     { icon: '💪', label: 'Moc Światogora (×2 staty)' },
  'adventure_moc_swiatogora_enhanced': { icon: '💪', label: 'Moc Światogora+ (×2, wskrzeszenie)' },
  'adventure_matecznik':          { icon: '🌿', label: 'Matecznik (ukryta)' },
  'adventure_matecznik_enhanced': { icon: '🌿', label: 'Matecznik+ (ukryta + regen)' },
  'adventure_przyjazn':           { icon: '🤝', label: 'Przyjaźń (strażnik)' },
  'adventure_przyjazn_enhanced':  { icon: '🤝', label: 'Przyjaźń+ (strażnik + free ataki)' },
}
const equippedArtifactBadge = computed(() => {
  if (props.inHand || !props.card.equippedArtifacts?.length) return null
  return props.card.equippedArtifacts.map((art: any) => {
    const mapped = artMap[art.effectId]
    return { effectId: art.effectId, ...(mapped ?? { icon: '⚙', label: art.name ?? 'Artefakt' }) }
  })
})

// Trofea Czarnoksiężnika — lista przejętych zdolności
const trophies = computed(() => {
  if (props.inHand) return null
  const t = props.card.metadata?.trophies as any[] | undefined
  if (!t?.length) return null
  return t
})

// Zagrożenie Południcą / Cichą — computed only checks THIS card's stats
// Field scan (hasCicha/hasPoludnica/weakestId) cached at game-store level to avoid N×M iteration
const isThreatened = computed(() => {
  if (props.inHand || props.card.owner !== 'player1') return null
  const threats = game.fieldThreats
  if (!threats) return null

  if (threats.hasCicha && props.card.currentStats.attack <= 2) {
    return 'Zagrożony przez Cichą (ATK ≤ 2)!'
  }
  if (threats.weakestId === props.card.instanceId) {
    return 'Najsłabsza istota — cel Południcy!'
  }
  return null
})

// ===== COMBAT OVERLAY FLASHES =====
const isCounterFlash = computed(() => ui.counterAttackCardId === props.card.instanceId)
const isBlockFlash = computed(() => ui.blockCardId === props.card.instanceId)
const isShaking = computed(() => ui.shakeCardId === props.card.instanceId)
const isPoisonFlash = computed(() => ui.poisonFlashCardId === props.card.instanceId)
const isParalyzeFlash = computed(() => ui.paralyzeFlashCardId === props.card.instanceId)

// ===== AKTYWNE EFEKTY (widoczne na karcie) =====
// Mapa czytelnych nazw efektów aktywnych
const activeEffectNameMap: Record<string, { label: string; icon: string; type: 'buff' | 'debuff' | 'neutral' }> = {
  // Buffy
  'polewik_buff_neighbors': { label: '+1 ATK', icon: '⚔', type: 'buff' },
  'guslarka_bonus_vs_demon': { label: '+2 vs Demon', icon: '✝', type: 'buff' },
  'zerca_welesa_demon_buff': { label: '+1 ATK', icon: '🔥', type: 'buff' },
  'chlop_extra_attack': { label: '+Atak', icon: '⚔', type: 'buff' },
  'naczelnik_rally': { label: 'Rajd', icon: '📯', type: 'buff' },
  'dobroochoczy_no_counter': { label: 'Pokój', icon: '🕊', type: 'neutral' },
  'adventure_sztandar': { label: '+2 ATK', icon: '🏴', type: 'buff' },
  'adventure_likantropia': { label: 'Lykan', icon: '🐺', type: 'buff' },
  'adventure_kwiat_paproci': { label: 'Kwiat', icon: '🌸', type: 'buff' },
  'adventure_moc_swiatogora': { label: '×2', icon: '💪', type: 'buff' },
  'adventure_twierdza': { label: '-3 DMG', icon: '🏰', type: 'buff' },
  'adventure_rehtra': { label: 'Rehtra', icon: '⛪', type: 'buff' },
  'adventure_arkona': { label: 'Arkona', icon: '⛪', type: 'buff' },
  // Debuffy
  'zagorkinia_curse_drain': { label: 'Klątwa', icon: '🪄', type: 'debuff' },
  'adventure_okaleczenie': { label: '-ATK', icon: '🩸', type: 'debuff' },
  'adventure_wygnanie': { label: 'Wygnanie', icon: '🚫', type: 'debuff' },
  'adventure_rusalczy_taniec': { label: 'Taniec', icon: '💃', type: 'debuff' },
  'adventure_kradzież': { label: 'Kradzież', icon: '🤚', type: 'debuff' },
  // Neutralne
  'adventure_sobowtór': { label: 'Sobowtór', icon: '👤', type: 'neutral' },
  'adventure_zlot_czarownic': { label: 'Zlot', icon: '🧙', type: 'neutral' },
}

const activeEffectLabels = computed(() => {
  if (props.inHand || !props.card.activeEffects?.length) return []
  return props.card.activeEffects.map(eff => {
    const id = eff.effectId
    const mapped = activeEffectNameMap[id]
    if (mapped) {
      return { id, label: mapped.label, icon: mapped.icon, type: mapped.type, turns: eff.remainingTurns }
    }
    // Fallback: zgadnij typ po nazwie
    const isDebuff = id.includes('curse') || id.includes('weaken') || id.includes('drain') || id.includes('poison') || id.includes('paralyze')
    const isBuff = id.includes('buff') || id.includes('boost') || id.includes('heal') || id.includes('shield') || id.includes('rally') || id.includes('bonus')
    // Krótka nazwa z effectId
    const shortName = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      .replace(/^(Adventure |Effect )/, '').substring(0, 12)
    return {
      id,
      label: shortName,
      icon: isDebuff ? '▼' : isBuff ? '▲' : '◆',
      type: (isDebuff ? 'debuff' : isBuff ? 'buff' : 'neutral') as 'buff' | 'debuff' | 'neutral',
      turns: eff.remainingTurns,
    }
  })
})


const cardData = computed(() => props.card.cardData as any)
const stats = computed(() => props.card.currentStats)
// Różnica statystyk od bazowych (buffy/debuffy widoczne na karcie)
const atkDelta = computed(() => {
  if (props.inHand) return 0
  const base = cardData.value?.stats?.attack ?? 0
  return stats.value.attack - base
})
const defDelta = computed(() => {
  if (props.inHand) return 0
  const base = cardData.value?.stats?.defense ?? 0
  return stats.value.defense - base
})
const isDefense = computed(() => !props.inHand && props.card.position === CardPosition.DEFENSE)
const isFlying = computed(() => cardData.value.isFlying && !props.card.isGrounded)
const isDragon = computed(() => (cardData.value.tags ?? []).includes('dragon'))
// Długie jednowyrazowe nazwy — mniejszy font żeby się zmieściły
const nameSizeClass = computed(() => {
  const name = (cardData.value.name ?? '') as string
  const longestWord = name.split(/\s+/).reduce((a, b) => a.length > b.length ? a : b, '')
  if (longestWord.length >= 15) return 'name-xs'
  if (longestWord.length >= 12) return 'name-sm'
  return ''
})
// Karta jest widoczna: własna ZAWSZE, wroga dopiero po ujawnieniu (lub tymczasowym reveal przed atakiem)
const isHidden = computed(() =>
  !props.card.isRevealed
  && props.card.owner === 'player2'
  && !props.inHand
)

const domainColor = computed(() => ({
  1: '#d4a843',
  2: '#3b82f6',
  3: '#4a9e4a',
  4: '#c44040',
}[cardData.value.domain as number] ?? '#64748b'))

const attackIcon = computed(() => ({
  [AttackType.MELEE]:     'game-icons:battle-axe',
  [AttackType.ELEMENTAL]: 'bi:fire',
  [AttackType.MAGIC]:     'fa6-solid:wand-sparkles',
  [AttackType.RANGED]:    'boxicons:bow-filled',
}[cardData.value.attackType as AttackType] ?? 'game-icons:battle-axe'))

const cardClass = computed(() => [
  'creature-card',
  {
    'in-hand':         props.inHand,
    'card-attack':     !props.inHand && !isDefense.value,
    'card-defense':    isDefense.value,
    'is-selected':     props.selected,
    'is-valid-target': props.isValidTarget,
    'is-dimmed':       props.dimmed,
    'is-silenced':          props.card.isSilenced,
    'cannot-attack':        props.card.cannotAttack || isMatohaBlocked.value,
    'is-hit-shaking':       isShaking.value,
    'is-taunt':             isTaunt.value,
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
    :class="['creature-card', 'card-hidden', { 'card-attack': !inHand && card.position === CardPosition.ATTACK, 'is-valid-target': isValidTarget, 'is-dimmed': dimmed }]"
    :data-instance-id="card.instanceId"
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
    :data-instance-id="card.instanceId"
    @click="onClick"
    @mouseenter="emit('mouseenter', card)"
    @mouseleave="emit('mouseleave')"
  >
    <!-- Górny pasek: domena (lewy) + nazwa (prawy) — jak w podglądzie -->
    <div class="card-header">
      <div class="card-domain-badge" :style="{ borderColor: domainColor + '55' }" v-tip="domainName">
        <img v-if="domainImgs[cardData.domain]" :src="domainImgs[cardData.domain]" class="card-domain-img" />
        <div v-else class="card-domain-dot" :style="{ background: domainColor }" />
      </div>
      <div class="card-name-badge">
        <span :class="['card-name', nameSizeClass]">{{ cardData.name.toUpperCase() }}</span>
      </div>
    </div>

    <!-- Cechy (lot/smok) — lewa krawędź, kolumna badge'ów -->
    <div v-if="isFlying || isDragon" class="keyword-stack">
      <div v-if="isFlying" class="keyword-badge keyword-flying" v-tip="'Latający'">
        <Icon icon="game-icons:liberty-wing" class="keyword-icon" />
      </div>
      <div v-if="isDragon" class="keyword-badge keyword-dragon" v-tip="'Smok'">
        <svg viewBox="0 0 4335 4335" class="keyword-svg"><path d="m577 1824c22-37 60-92 98-110 60-29 105 42 114 86-117-21-120-9-212 24zm2953 2391h-2467c427-580 1127-908 1545-1427l57-77c62-83 108-198 71-309-32-98-70-99-110-158l87-64c646-835-92-6-129 21-205 148-252 56-464 8-131-30-274 14-367 59l-150 79c-46 28-92 57-135 88-87 64-164 139-258 193-77 44-183 55-278 62-105 8-191 35-287-3-35-14-114-66-131-92 80 0 186-14 246-33 190-59 362-195 502-334l113-98c92-72 185-142 290-195 18-9 30-16 48-24s29-11 47-20l186-87c-26-39-112-88-162-95-151-22-428 89-566 181-101 68-187 180-281 226-39 19-146 56-174 77-70 52-32 125-32 196-61-14-134-92-139-156-12 6-126 18-147 21-152 21-45 116-81 152-12 12 0 5-11 0-30-13-53-55-60-86-8-36 1-32-20-58-259-71-90-472-76-491 39-52 114-101 177-67 15 8 42 29 57 32 83 18 137-37 184-81 107-100 145-21 191-31 48-10 166-104 210-147 24-23 110-116 126-142l185-261c68-86 25-38 41-126 59-319 421-380 762-241 56-5 69 0 101-32 116-114 250-205 396-278 95-48 303-141 399-141-6 5-11 9-19 15-7 5-10 6-18 10-88 44-169 106-247 165l-66 57c-11 11-21 20-31 31l-78 95c-13 15-39 54-43 74 27 2 50 4 84 6 81 4 63 35 119-32 54-64 149-134 220-176 85-50 172-95 262-134 20-8 39-13 58-21 73-29 168-60 245-67-13 19-18 17-39 28-127 64-246 149-347 249l-62 67c-12 14-20 20-32 35-24 31-74 74-84 111 15 7 56 17 74 21 90 23 194 59 277 96 20 9 42 15 63 26 169 82 350 166 474 312 21 25 46 45 54 80-97-51-120-106-268-106 15 28 34 45 54 69 497 584 673 1595 403 2267-68 169-62 79-61-22 0-84-39-279-112-295 0 84-22 190-42 270-22 86-44 159-74 233-70 174-166 338-262 499zm-2058-2802c18-18 34-28 50-45 73-248 185-275 395-143-16 46-362 182-445 188z" fill="#e07060"/></svg>
      </div>
    </div>

    <!-- Status (trucizna/paraliż) — lewa krawędź, kolumna badge'ów z licznikiem -->
    <div v-if="card.metadata?.dziewiatkoPoison || card.metadata?.dziewiatkoParalyze" class="status-stack">
      <div v-if="card.metadata?.dziewiatkoPoison" class="keyword-badge keyword-poison" v-tip="'Trucizna: -3 {DEF} co turę'">
        <Icon icon="mdi:bottle-tonic" class="keyword-icon" />
      </div>
      <div v-if="card.metadata?.dziewiatkoParalyze" class="keyword-badge keyword-paralyze-badge" v-tip="`Paraliż: ${card.paralyzeRoundsLeft} tur — premie i Pożegnanie zablokowane`">
        <Icon icon="game-icons:frozen-body" class="keyword-icon" />
        <span class="keyword-counter keyword-counter-paralyze">{{ card.paralyzeRoundsLeft }}</span>
      </div>
    </div>

    <!-- Grafika stworzenia (fallback: Tugaryn) -->
    <img
      :src="creatureImgs[cardData.id] ?? creatureImgs[117]"
      class="card-art"
      aria-hidden="true"
    />

    <!-- Środek: badges -->
    <div class="card-body">
      <div class="card-badges">
        <Icon v-if="card.isSilenced"   icon="game-icons:silenced"       class="badge-icon badge-silenced" v-tip="'Uciszony'" />
        <Icon v-if="card.isImmune"     icon="game-icons:shield-reflect" class="badge-icon badge-immune"   v-tip="'Odporny'" />
        <Icon v-if="card.cannotAttack" icon="game-icons:chains"         class="badge-icon badge-disarmed" v-tip="'Nie może atakować'" />
        <span v-if="card.poisonRoundsLeft && !card.metadata?.dziewiatkoPoison" class="badge-poison">☠ {{ card.poisonRoundsLeft }}</span>
        <span v-if="card.paralyzeRoundsLeft !== null && card.paralyzeRoundsLeft !== 0 && !card.metadata?.dziewiatkoParalyze" class="badge-paralyze" v-tip="card.paralyzeRoundsLeft === -1 ? 'Paraliż permanentny' : `Paraliż: ${card.paralyzeRoundsLeft} rund`">
          ⚡ {{ card.paralyzeRoundsLeft === -1 ? '∞' : card.paralyzeRoundsLeft }}
        </span>
        <!-- TIER 4 badges -->
        <span v-if="isPrzyjaznGuard"    class="badge-tag badge-friend-g"    v-tip="'Chroni sojusznika (Przyjaźń)'">🛡</span>
        <span v-if="isPrzyjaznProtected" class="badge-tag badge-friend-p"   v-tip="'Chroniony przez sojusznika (Przyjaźń)'">💛</span>
        <span v-if="isLycan"            class="badge-tag badge-lycan"       v-tip="'Likantropia — wchłania ofiary'">🐺</span>
        <span v-if="isCursed"           class="badge-tag badge-cursed"      v-tip="'Przeklęty — traci 1 ATK/DEF co turę'">🪄</span>
        <span v-if="isInvincible"       class="badge-tag badge-invincible"  v-tip="'Nieśmiertelny — odporny na obrażenia'">♾</span>
        <span v-if="isWijRevived"       class="badge-tag badge-wij"         v-tip="'Wskrzeszony — ginie na koniec tej tury!'">⏰</span>
        <span v-if="isGuardian"         class="badge-tag badge-guardian"    v-tip="'Strażnik — kontratakuje napastników sojuszników'">🐻</span>
        <span v-if="isRiding"           class="badge-tag badge-rider"       v-tip="'Dosiadł Rumaka — rani całą linię'">🐴</span>
        <!-- Licznik: Smocze Jajo -->
        <span v-if="jajoCounter" class="badge-tag badge-counter badge-jajo" v-tip="`Wylęg za ${jajoCounter.max - jajoCounter.current} rund`">
          <Icon icon="game-icons:hatch" class="counter-icon" /> {{ jajoCounter.current }}/{{ jajoCounter.max }}
        </span>
        <!-- Licznik: Bałwan -->
        <span v-if="balwanCounter" class="badge-tag badge-counter badge-balwan" v-tip="`Dar bogów za ${balwanCounter.max - balwanCounter.current} rund`">
          <Icon icon="game-icons:sands-of-time" class="counter-icon" /> {{ balwanCounter.current }}/{{ balwanCounter.max }}
        </span>
        <!-- Licznik: Młot Swaroga ataków -->
        <span v-if="mlotCounter !== null" class="badge-tag badge-counter badge-mlot" v-tip="`Pozostało ataków Młota: ${mlotCounter}`">
          🔨 {{ mlotCounter }}
        </span>
        <!-- Homen curse mark -->
        <span v-if="isHomenCursed" class="badge-tag badge-homen-curse" v-tip="'Klątwa Homena: po śmierci wstanie jako Homen!'">
          💀
        </span>
        <!-- Artefakty equipped — hover pokazuje pełny podgląd karty przygody -->
        <span
          v-for="(art, ai) in (equippedArtifactBadge ?? [])"
          :key="'art-' + ai"
          class="badge-tag badge-artifact"
          v-tip="art.label"
          @mouseenter.stop="ui.showTooltip('artifact:' + art.effectId)"
          @mouseleave.stop="ui.hideTooltip()"
        >{{ art.icon }}</span>
        <!-- Trofea Czarnoksiężnika -->
        <span
          v-if="trophies"
          class="badge-tag badge-trophies"
          v-tip="trophies.map((t: any) => `${t.name} (${t.attack}/${t.defense}): ${t.effectDescription}`).join('\n')"
        >💀 {{ trophies.length }}</span>
      </div>

      <!-- Aktywne efekty (buffy/debuffy) — widoczne na karcie -->
      <div v-if="activeEffectLabels.length" class="card-active-effects">
        <span
          v-for="eff in activeEffectLabels"
          :key="eff.id"
          :class="['ae-pill', `ae-${eff.type}`]"
          v-tip="eff.label + (eff.turns !== null ? ` (${eff.turns} tur)` : ' (perm.)')"
        >
          <span class="ae-icon">{{ eff.icon }}</span>
          <span class="ae-label">{{ eff.label }}</span>
          <span v-if="eff.turns !== null" class="ae-turns">{{ eff.turns }}</span>
        </span>
      </div>

      <!-- Wskaźnik pozycji (tylko na polu) — klikalny gdy można zmienić -->
      <div
        v-if="!inHand"
        :class="['position-badge', isDefense ? 'pos-defense' : 'pos-attack', { 'pos-clickable': canTogglePosition }]"
        @click.stop="canTogglePosition ? emit('change-position', card) : undefined"
      >
        {{ isDefense ? 'OBR' : 'ATK' }}
      </div>

      <!-- Rząd zdolności: dwa niezależne sloty [ikona lewo] [koszt prawo] -->
      <div v-if="!inHand && effectAvailable" class="ability-row">
        <!-- LEWY SLOT: tylko gdy darmowa (cost=0) -->
        <button
          v-if="effectCost === 0"
          class="effect-activate-btn"
          v-tip="'Aktywuj zdolność (gratis)'"
          @click.stop="emit('activate-effect', card)"
        ><Icon icon="ix:shield-broken-filled" class="activation-icon" /></button>
        <span v-else class="ability-slot-empty" />

        <!-- PRAWY SLOT: tylko gdy płatna (cost>0) -->
        <button
          v-if="effectCost !== undefined && effectCost > 0"
          class="effect-cost-pill"
          v-tip="`Aktywuj za ${effectCost} PS`"
          @click.stop="emit('activate-effect', card)"
        ><Icon icon="ix:shield-broken-filled" class="activation-icon" />{{ effectCost }}</button>
      </div>
    </div>


    <!-- Spy badge — karta wystawiona na pole wroga -->
    <div v-if="isSpy" class="spy-badge"
      @mouseenter.stop="ui.showTooltip(card.instanceId)"
      @mouseleave.stop="ui.hideTooltip()"
    >
      <Icon icon="game-icons:spy" class="spy-icon" />
    </div>

    <!-- Lista zdolności (abilities[]) — widoczna na polu, compact -->
    <div v-if="!inHand && abilities.length" class="card-abilities">
      <div v-for="(ab, i) in abilities" :key="i" class="ability-entry">
        <span
          v-if="triggerLabels[ab.trigger]"
          class="ab-trigger"
          :style="{ background: getTriggerColor(ab.trigger) + '33', color: getTriggerColor(ab.trigger), borderColor: getTriggerColor(ab.trigger) + '55' }"
        >{{ triggerLabels[ab.trigger] }}</span>
        <span class="ab-text">
          <template v-for="(seg, si) in getTokenSegments(ab.text)" :key="si">
            <span v-if="seg.type === 'text'">{{ seg.value }}</span>
            <img v-else-if="seg.img" :src="seg.img" class="token-icon" :title="seg.label" />
            <Icon v-else-if="seg.iconify" :icon="seg.iconify" :class="['token-icon-svg', seg.value === 'POS_DEF' ? 'token-pos-def' : '', seg.value === 'POS_ATK' ? 'token-pos-atk' : '']" :style="{ color: seg.color }" :title="seg.label" />
          </template>
        </span>
      </div>
    </div>

    <!-- Dolny pasek: ATK / DEF -->
    <div class="card-footer">
      <div class="stat atk">
        <img v-if="attackTypeOverrides[cardData.id] || attackTypeImgs[cardData.attackType]" :src="attackTypeOverrides[cardData.id] ?? attackTypeImgs[cardData.attackType]" class="stat-img" />
        <Icon v-else :icon="attackIcon" class="stat-icon" />
        <span :class="{ 'stat-buffed': atkDelta > 0, 'stat-damaged': atkDelta < 0 }">{{ stats.attack }}</span>
        <span v-if="atkDelta !== 0" :class="['stat-delta', atkDelta > 0 ? 'delta-up' : 'delta-down']">{{ atkDelta > 0 ? '+' : '' }}{{ atkDelta }}</span>
      </div>
      <div class="stat def">
        <Icon icon="game-icons:shield" class="stat-icon" />
        <span :class="{ 'stat-buffed': defDelta > 0, 'stat-damaged': stats.defense < cardData.stats.defense }">
          {{ stats.defense }}
        </span>
        <span v-if="defDelta > 0" :class="['stat-delta', 'delta-up']">+{{ defDelta }}</span>
      </div>
    </div>

    <!-- Matecznik: karta ukryta w świętym lesie — zielony overlay -->
    <div v-if="isMatecznik" class="state-overlay matecznik-overlay">
      <span class="state-overlay-icon">🌿</span>
      <span class="state-overlay-label">UKRYTA</span>
    </div>

    <!-- Dziewiątko: znak śmierci — mrugający czerwony overlay -->
    <div v-if="hasDeathMark" class="state-overlay deathmark-overlay">
      <span class="state-overlay-icon">☠</span>
      <span class="state-overlay-label">ZNAK ŚMIERCI</span>
    </div>

    <!-- Zagrożenie: Południca/Cicha -->
    <div v-if="isThreatened" class="state-overlay threat-overlay" :title="isThreatened">
      <span class="state-overlay-icon">⚠</span>
      <span class="state-overlay-label">ZAGROŻONY</span>
      <span class="threat-reason">{{ isThreatened }}</span>
    </div>

    <!-- Counter-attack flash overlay -->
    <div v-if="isCounterFlash" class="state-overlay counter-flash-overlay">
      <span class="state-overlay-icon">🛡️</span>
      <span class="state-overlay-label">KONTRATAK</span>
    </div>

    <!-- Block / Odporny flash overlay -->
    <div v-if="isBlockFlash" class="state-overlay block-flash-overlay">
      <span class="state-overlay-icon">✋</span>
      <span class="state-overlay-label">ODPORNY</span>
    </div>

    <!-- Trucizna flash overlay -->
    <div v-if="isPoisonFlash" class="state-overlay poison-flash-overlay">
      <Icon icon="mdi:bottle-tonic" class="state-overlay-icon-svg" />
      <span class="state-overlay-label">ZATRUTA</span>
    </div>

    <!-- Paraliż flash overlay -->
    <div v-if="isParalyzeFlash" class="state-overlay paralyze-flash-overlay">
      <Icon icon="game-icons:frozen-body" class="state-overlay-icon-svg" />
      <span class="state-overlay-label">SPARALIŻOWANA</span>
    </div>

    <!-- Hipnoza: zahipnotyzowana istota wroga (faza 2 — wybierz cel ataku) -->
    <div v-if="isHypnotized" class="state-overlay hypnosis-overlay">
      <svg class="hypnosis-card-icon" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
        <path d="m860.76 427.08c9 38.859 12.281 111.98 11.625 125.44 3.6094 202.92-226.97 339.84-402.74 239.26-136.13-74.109-165.05-223.55-126.19-366.94-126.94 64.5-222 157.5-258.19 196.13-13.688 14.438-13.688 36.375 0 50.812 57.938 61.688 266.63 263.06 514.69 263.06s456.74-201.37 514.69-263.06c6.9375-7.3125 10.312-16.312 10.312-25.312 0-9.1875-3.375-18.375-10.312-25.5-35.812-38.062-129.19-129.56-253.87-193.87z" fill="#d8b4fe"/>
        <path d="m564.52 784.82c140.29 22.922 271.64-90.188 270.37-232.31-0.46875-49.922-4.1719-102-18.562-146.63-18-7.6875-36.562-14.812-55.5-21 6.3281 7.9219 11.438 16.547 16.125 25.5 99.562 220.78-66.656 345-212.44 374.44z" fill="#d8b4fe"/>
        <path d="m461.39 397.45c6.2812-8.0625 12.422-16.781 19.312-24.562-31.5 7.6875-62.062 18.188-91.125 30.562-35.484 99.656-36.609 212.16 22.969 291.61 33.094 44.109 89.344 64.547 143.26 52.781 71.203-15.516 172.08-55.688 206.72-159.52 11.156-27.609 16.312-164.11-70.172-218.02-39.328-15.844-85.688-12.328-127.82-11.016-8.8594 0.70312-17.531 3.7031-24.609 9.0938-91.781 70.125-146.02 242.68-15.516 295.36 81.422 34.547 220.08-69.938 153-171-41.578-65.297-157.18-49.922-164.26 34.875-5.5312 35.953 20.109 74.438 57 72 25.125-0.70312 52.922-24.516 54.562-49.688 0.5625-12-8.4375-16.312-11.25-17.438s-12.75-3.9375-20.438 5.625c-3.5625 4.3125-6.9375 9.75-10.312 16.312-4.6875 9.1875-16.125 12.938-25.312 8.0625-21.047-11.25-3.1875-36.188 6.5625-48.188 15.75-18.938 40.312-25.5 63-16.875 40.781 15.656 44.25 65.297 18.938 98.062-30.938 45.234-99.703 57.469-139.5 17.062-52.031-46.406-34.406-145.26 23.062-178.13 87.938-56.156 205.03 12.422 203.26 114.75-4.875 104.02-104.25 158.11-171.19 158.63-83.391-0.1875-150.37-69.703-152.26-151.31-0.9375-59.344 15.375-104.81 52.125-159z" fill="#d8b4fe"/>
        <path d="m1137.3 473.86c-333.05-279.19-744.05-277.36-1074.7 0-18 16.172 5.9531 44.297 24.75 28.172 2.2969-2.0156 233.44-202.18 512.63-202.18 279.19 0 510.32 200.16 512.63 202.18 18.328 15.938 43.219-11.484 24.75-28.172z" fill="#d8b4fe"/>
      </svg>
      <span class="state-overlay-label">HIPNOZA</span>
    </div>

    <div v-if="isValidTarget" class="target-overlay" />
  </div>
</template>

<style scoped>
.creature-card {
  position: relative;
  width: 130px;
  height: 175px;
  border-radius: 6px;
  border: 2px solid color-mix(in srgb, var(--domain-color, #334155) 35%, transparent);
  background: #0a0406;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.15s ease;
  user-select: none;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(0,0,0,0.7);
  overflow: hidden;
  contain: content;
}

.creature-card:hover {
  transform: translateY(-3px);
}

/* W ręce: parent (.hand-card-wrap) obsługuje hover — tu wyłączamy */
.creature-card.in-hand:hover {
  transform: none;
}

/* ===== ATAK: rotacja 90° (poziomo = szarża) + czerwony border ===== */
.card-attack {
  transform: rotate(90deg);
  border-color: #ef4444;
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
.card-hidden:hover {
  transform: none;
  box-shadow: none;
}
.card-hidden.card-attack {
  transform: rotate(90deg);
}
.card-hidden.card-attack:hover {
  transform: rotate(90deg);
  box-shadow: none;
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

.is-valid-target {
  box-shadow: 0 0 0 2px #ef4444, 0 0 12px 3px rgba(239,68,68,0.4);
}
.is-valid-target:hover {
  box-shadow: 0 0 0 3px #ef4444, 0 0 20px 6px rgba(239,68,68,0.6);
}

.is-dimmed { opacity: 0.45; pointer-events: none; }

/* ===== HEADER — domena (lewy) + nazwa (prawy) ===== */
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 3px;
  min-height: 24px;
  position: relative;
  z-index: 2;
  gap: 2px;
}

.card-domain-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  border: 1px solid;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.85);
}

.card-domain-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.card-domain-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.card-name-badge {
  display: inline-flex;
  max-width: calc(100% - 28px);
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,0.75);
  border: 1px solid color-mix(in srgb, var(--domain-color, #334155) 25%, transparent);
}

.card-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 500;
  color: #f0ede8;
  line-height: 1.05;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  letter-spacing: 0.03em;
  word-break: break-word;
}
.card-name.name-sm { font-size: 16px; }
.card-name.name-xs { font-size: 14px; }

/* ===== BODY ===== */
.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  padding: 2px 2px 4px;
  position: relative;
  z-index: 1;
}

.card-badges {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}

/* Keyword badges — right side column, below name badge */
.keyword-stack {
  position: absolute;
  top: 30px;
  right: 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  z-index: 3;
  pointer-events: auto;
}

/* Status badges — left side column (trucizna/paraliż) */
.status-stack {
  position: absolute;
  top: 30px;
  left: 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  z-index: 3;
  pointer-events: auto;
}
.keyword-poison {
  background: rgba(0, 0, 0, 0.8);
  border: 1.5px solid rgba(132, 204, 22, 0.6);
}
.keyword-poison .keyword-icon { color: #a3e635; }
.keyword-paralyze-badge {
  background: rgba(0, 0, 0, 0.8);
  border: 1.5px solid rgba(148, 163, 184, 0.6);
}
.keyword-paralyze-badge .keyword-icon { color: #94a3b8; }

/* Licznik pod ikoną statusu (paraliż countdown) */
.keyword-counter {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 4px;
  min-width: 14px;
  text-align: center;
}
.keyword-counter-paralyze {
  color: #e2e8f0;
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.6);
}
.keyword-badge {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.keyword-svg {
  width: 20px;
  height: 20px;
}
.keyword-icon {
  width: 18px;
  height: 18px;
  color: #ffffff;
}
.keyword-flying {
  background: rgba(0, 0, 0, 0.8);
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  box-shadow: none;
}
.keyword-dragon {
  background: rgba(0, 0, 0, 0.8);
  border: 1.5px solid rgba(231, 76, 60, 0.5);
  box-shadow: none;
}
.keyword-dragon .keyword-svg {
  width: 18px;
  height: 18px;
}

.badge-icon    { font-size: 11px; }
.stat-img      { width: 20px; height: 20px; object-fit: contain; opacity: 0.9; flex-shrink: 0; }
.badge-immune   { color: #a78bfa; }
.badge-silenced { color: #94a3b8; }
.badge-disarmed { color: #f87171; }
.badge-poison   { font-size: 9px; color: #86efac; }
.badge-paralyze { font-size: 9px; color: #fbbf24; background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4); border-radius: 3px; padding: 0 2px; }

/* ===== AKTYWNE EFEKTY na karcie ===== */
.card-active-effects {
  display: flex;
  gap: 1px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 100%;
}
.ae-pill {
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: help;
  white-space: nowrap;
}
.ae-icon {
  font-size: 9px;
}
.ae-label {
  font-size: 7px;
  letter-spacing: 0.01em;
}
.ae-buff {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.18);
  border: 1px solid rgba(74, 222, 128, 0.4);
}
.ae-debuff {
  color: #f87171;
  background: rgba(248, 113, 113, 0.18);
  border: 1px solid rgba(248, 113, 113, 0.4);
}
.ae-neutral {
  color: #a5b4fc;
  background: rgba(165, 180, 252, 0.15);
  border: 1px solid rgba(165, 180, 252, 0.35);
}
.ae-turns {
  font-size: 5px;
  opacity: 0.65;
  margin-left: 1px;
}

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
.pos-attack  { color: rgba(252,165,165,0.7); background: rgba(252,165,165,0.08); border: 1px solid rgba(252,165,165,0.15); }
.pos-defense { color: rgba(147,197,253,0.7); background: rgba(147,197,253,0.08); border: 1px solid rgba(147,197,253,0.15); }

/* ===== ABILITIES LIST ===== */
.card-abilities {
  display: none; /* Zdolności widoczne tylko w CardTooltip — czysta karta na polu */
}
.ability-entry {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.2;
}
.ab-trigger {
  font-size: 5.5px;
  font-weight: 700;
  text-transform: uppercase;
  border-radius: 2px;
  padding: 0 2px;
  flex-shrink: 0;
  margin-top: 1px;
  letter-spacing: 0.01em;
  border: 1px solid;
}
.ab-text {
  font-size: 6px;
  color: #94a3b8;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* Token inline icons */
.token-icon {
  display: inline-block;
  width: 10px;
  height: 10px;
  vertical-align: middle;
  margin: -1px 0;
}
.token-icon-svg {
  display: inline;
  width: 10px;
  height: 10px;
  vertical-align: middle;
  margin: -1px 0;
}
/* Position tokens: ATK = vertical rectangle, DEF = horizontal rectangle */
.token-pos-atk {
  width: 8px;
  height: 11px;
  border-radius: 1px;
}
.token-pos-def {
  transform: rotate(90deg);
  width: 8px;
  height: 11px;
  border-radius: 1px;
}

/* ===== TAUNT (Świetlik/Błotnik) — intense red glow forcing attacks ===== */
.is-taunt {
  border-color: #ef4444 !important;
  box-shadow:
    0 0 8px 2px rgba(239, 68, 68, 0.6),
    0 0 20px 6px rgba(239, 68, 68, 0.35),
    0 0 40px 12px rgba(220, 38, 38, 0.2),
    inset 0 0 12px 2px rgba(239, 68, 68, 0.15);
  animation: taunt-pulse 1.8s ease-in-out infinite;
}

@keyframes taunt-pulse {
  0%, 100% {
    box-shadow:
      0 0 8px 2px rgba(239, 68, 68, 0.6),
      0 0 20px 6px rgba(239, 68, 68, 0.35),
      0 0 40px 12px rgba(220, 38, 38, 0.2),
      inset 0 0 12px 2px rgba(239, 68, 68, 0.15);
  }
  50% {
    box-shadow:
      0 0 12px 4px rgba(239, 68, 68, 0.8),
      0 0 30px 10px rgba(239, 68, 68, 0.5),
      0 0 55px 18px rgba(220, 38, 38, 0.3),
      inset 0 0 18px 4px rgba(239, 68, 68, 0.25);
  }
}

/* Spy badge — card played on enemy field */
.spy-badge {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 3;
  background: rgba(239, 68, 68, 0.7);
  border: 1px solid rgba(239, 68, 68, 0.9);
  border-radius: 3px;
  padding: 2px;
  line-height: 1;
  cursor: help;
}
.spy-icon {
  width: 12px;
  height: 12px;
  color: #fff;
}

/* ===== FOOTER ===== */
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px 6px;
  margin-top: auto;
  position: relative;
  z-index: 1;
  background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.93) 100%);
  border-top: 1px solid rgba(200, 168, 78, 0.18);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.4);
  border-radius: 0 0 4px 4px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 22px;
  font-weight: 500;
  font-family: var(--font-display, Georgia, serif);
}

.stat.atk { color: #fb923c; text-shadow: 0 0 12px rgba(251,146,60,0.4); }
.stat.def { color: #60a5fa; text-shadow: 0 0 12px rgba(96,165,250,0.4); }
.stat-icon    { font-size: 18px; }
.stat-damaged { color: #ef4444 !important; }
.stat-buffed  { color: #4ade80 !important; text-shadow: 0 0 4px rgba(74,222,128,0.5); }
.stat-delta {
  font-size: 10px;
  font-weight: 700;
  margin-left: -1px;
}
.delta-up   { color: #4ade80; }
.delta-down { color: #ef4444; }

.card-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  pointer-events: none;
  border-radius: 4px;
  z-index: 0;
}
/* Vignette overlay na arcie */
.creature-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: 4px;
  background: radial-gradient(ellipse 95% 85% at 50% 40%, transparent 35%, rgba(0,0,0,0.35) 100%);
  pointer-events: none;
}
/* Gradient na dole pod staty — od przezroczystego do pełnej czerni */
.creature-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 55%;
  z-index: 0;
  border-radius: 0 0 4px 4px;
  background: linear-gradient(transparent 0%, rgba(5,3,8,0.4) 30%, rgba(5,3,8,0.8) 60%, rgba(5,3,8,0.97) 100%);
  pointer-events: none;
}

.target-overlay {
  position: absolute;
  inset: 0;
  border-radius: 5px;
  background: rgba(239, 68, 68, 0.08);
  pointer-events: none;
}

.cannot-attack .stat.atk { color: #64748b; }
.cannot-attack .stat.atk .stat-icon,
.cannot-attack .stat.atk .stat-img {
  filter: grayscale(1) opacity(0.4);
}

/* Klikalny badge pozycji */
.pos-clickable {
  cursor: pointer;
  box-shadow: 0 0 0 1px currentColor;
}
.pos-clickable:hover {
  opacity: 0.85;
}

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
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.6);
  border-radius: 4px;
  color: #fbbf24;
  padding: 2px 4px;
  cursor: pointer;
  line-height: 1;
  animation: activation-glow 2s ease-in-out infinite;
  white-space: nowrap;
}
.effect-activate-btn:hover {
  background: rgba(251, 191, 36, 0.4);
  border-color: #fbbf24;
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}
.activation-icon {
  width: 12px;
  height: 12px;
  color: #fbbf24;
}

/* PRAWY SLOT: płatna aktywacja */
.effect-cost-pill {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 9px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.5);
  border-radius: 4px;
  padding: 2px 4px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  animation: activation-glow 2s ease-in-out infinite;
  transition: background 0.15s, box-shadow 0.15s;
}
.effect-cost-pill:hover {
  background: rgba(251, 191, 36, 0.35);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}

/* Pusty lewy slot gdy brak ikony (żeby koszt został po prawej) */
.ability-slot-empty { flex: 1; }

/* Activation glow — złota pulsacja tarcza+piorun */
@keyframes activation-glow {
  0%, 100% { opacity: 0.75; box-shadow: 0 0 3px rgba(251, 191, 36, 0.2); }
  50%      { opacity: 1;    box-shadow: 0 0 8px rgba(251, 191, 36, 0.5); }
}

/* ===== PASYWNA AURA ===== */
.badge-passive {
  background: rgba(124, 58, 237, 0.25);
  border: 1px solid rgba(167, 139, 250, 0.5);
  border-radius: 4px;
  padding: 0 2px;
  box-shadow: 0 0 6px rgba(167, 139, 250, 0.5);
  cursor: help;
}

/* ===== TIER 4 WSKAŹNIKI STANU ===== */

/* BADGE'Y STANU — małe emoji/tekst */
.badge-tag {
  font-size: 10px;
  line-height: 1;
  text-shadow: 0 0 2px rgba(0,0,0,0.8);
}

/* Visual indicator styles stripped — defined in useCardIndicators.ts, rendered by VFXOverlay */

/* OVERLAYE STANÓW — półprzezroczyste nakładki na kartę */
.state-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 5px;
  pointer-events: none;
}

.state-overlay-icon {
  font-size: 20px;
  line-height: 1;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}

.state-overlay-label {
  font-size: 6.5px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-align: center;
  line-height: 1.2;
  padding: 1px 4px;
  border-radius: 2px;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);
}

/* State overlays — minimal text-only (VFXOverlay will add visual effects) */
.matecznik-overlay {
  background: rgba(21, 128, 61, 0.3);
}
.matecznik-overlay .state-overlay-label {
  color: #bbf7d0;
  background: rgba(21, 128, 61, 0.8);
}

.deathmark-overlay {
  background: rgba(170, 0, 0, 0.3);
}
.deathmark-overlay .state-overlay-label {
  color: #fca5a5;
  background: rgba(127, 0, 0, 0.8);
}

/* Counter-attack: blue shield flash like legacy */
.counter-flash-overlay {
  background: rgba(20, 40, 140, 0.7);
  box-shadow: inset 0 0 20px rgba(59, 130, 246, 0.6), 0 0 12px rgba(59, 130, 246, 0.4);
  animation: combat-flash-in 0.3s ease-out;
}
.counter-flash-overlay .state-overlay-icon { font-size: 28px; }
.counter-flash-overlay .state-overlay-label {
  color: #ffffff;
  background: rgba(30, 64, 175, 0.9);
  font-size: 7px;
  letter-spacing: 0.1em;
}

/* Block / Odporny: golden shield flash */
.block-flash-overlay {
  background: rgba(120, 80, 20, 0.7);
  box-shadow: inset 0 0 20px rgba(245, 158, 11, 0.5), 0 0 12px rgba(245, 158, 11, 0.3);
  animation: combat-flash-in 0.3s ease-out;
}
.block-flash-overlay .state-overlay-icon { font-size: 28px; }
.block-flash-overlay .state-overlay-label {
  color: #ffffff;
  background: rgba(120, 53, 15, 0.9);
  font-size: 7px;
  letter-spacing: 0.1em;
}

/* Hipnoza: fioletowy overlay z ikoną oka */
/* Trucizna flash — zielony overlay */
.poison-flash-overlay {
  background: rgba(20, 83, 10, 0.75);
  box-shadow: inset 0 0 25px rgba(132, 204, 22, 0.6), 0 0 15px rgba(132, 204, 22, 0.3);
  animation: combat-flash-in 0.3s ease-out;
}
.poison-flash-overlay .state-overlay-icon-svg { font-size: 28px; color: #a3e635; filter: drop-shadow(0 0 6px rgba(163, 230, 53, 0.9)); }
.poison-flash-overlay .state-overlay-label {
  color: #d9f99d;
  background: rgba(22, 101, 52, 0.9);
  font-size: 7px;
  letter-spacing: 0.1em;
}

/* Paraliż flash — szary overlay */
.paralyze-flash-overlay {
  background: rgba(30, 41, 59, 0.8);
  box-shadow: inset 0 0 25px rgba(148, 163, 184, 0.4), 0 0 15px rgba(148, 163, 184, 0.2);
  animation: combat-flash-in 0.3s ease-out;
}
.paralyze-flash-overlay .state-overlay-icon-svg { font-size: 28px; color: #94a3b8; filter: drop-shadow(0 0 6px rgba(148, 163, 184, 0.8)); }
.paralyze-flash-overlay .state-overlay-label {
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.9);
  font-size: 7px;
  letter-spacing: 0.1em;
}

.hypnosis-overlay {
  background: rgba(80, 20, 140, 0.7);
  box-shadow: inset 0 0 20px rgba(168, 85, 247, 0.6), 0 0 12px rgba(168, 85, 247, 0.4);
  animation: combat-flash-in 0.3s ease-out;
}
.hypnosis-card-icon {
  width: 28px;
  height: 28px;
  filter: drop-shadow(0 0 6px rgba(216, 180, 254, 0.9));
}
.hypnosis-overlay .state-overlay-label {
  color: #ffffff;
  background: rgba(88, 28, 135, 0.9);
  font-size: 7px;
  letter-spacing: 0.1em;
}

@keyframes combat-flash-in {
  0%   { opacity: 0; transform: scale(0.85); }
  60%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}

/* Hit shake — card vibrates when taking damage.
   Uses CSS `translate` (not transform) so it won't conflict with card-attack rotate(90deg). */
.is-hit-shaking {
  animation: card-hit-shake 0.4s ease-out;
}
@keyframes card-hit-shake {
  0%   { translate: 0 0; }
  10%  { translate: -6px -1px; }
  20%  { translate: 5px 1px; }
  30%  { translate: -4px -1px; }
  40%  { translate: 3px 1px; }
  50%  { translate: -2px 0; }
  60%  { translate: 1px 0; }
  100% { translate: 0 0; }
}

/* ===== LICZNIKI (Smocze Jajo, Bałwan, Młot) ===== */
.badge-counter {
  font-family: var(--font-display, 'Kanyon', Georgia, serif);
  font-size: 11px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.88);
  border-radius: 4px;
  padding: 2px 5px;
  color: #fbbf24;
  display: flex;
  align-items: center;
  gap: 3px;
  letter-spacing: 0.03em;
}
.counter-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.badge-jajo {
  border: 1.5px solid rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.25);
}
.badge-balwan {
  border: 1.5px solid rgba(96, 165, 250, 0.6);
  color: #93c5fd;
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.25);
}
.badge-mlot {
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}

/* ===== ARTEFAKT BADGE ===== */
.badge-artifact {
  background: rgba(251, 191, 36, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.6);
  border-radius: 4px;
  padding: 0 2px;
  box-shadow: 0 0 5px rgba(251, 191, 36, 0.5);
  cursor: help;
}

/* ===== TROFEA CZARNOKSIĘŻNIKA ===== */
.badge-trophies {
  background: rgba(168, 85, 247, 0.25);
  border: 1px solid rgba(168, 85, 247, 0.6);
  border-radius: 4px;
  padding: 0 3px;
  font-size: 8px;
  font-weight: 700;
  color: #c084fc;
  cursor: help;
  box-shadow: 0 0 5px rgba(168, 85, 247, 0.5);
}


/* Threat overlay — minimal text-only (VFXOverlay will add visual effects) */
.threat-overlay {
  background: rgba(220, 38, 38, 0.25);
}
.threat-overlay .state-overlay-label {
  color: #fca5a5;
  background: rgba(153, 27, 27, 0.85);
}
.threat-reason {
  font-size: 7px;
  color: #fca5a5;
  text-align: center;
  line-height: 1.2;
  max-width: 90%;
  opacity: 0.9;
}

/* P1 VFX status overlays (paralysis/disease/filters) stripped — P3 VFXOrchestrator will handle */

/* Creature type auras + homen curse — stripped, defined in useCardIndicators.ts */
.badge-homen-curse {
  background: rgba(107, 33, 168, 0.8) !important;
}


/* Smocze Jajo pulsing counter when close to hatching */
.badge-jajo {
  transition: background-color 0.3s;
}

/* P2 AURA_RING — stripped, defined in useCardIndicators.ts */


/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 767px) {
  .creature-card {
    width: 64px;
    height: 88px;
    border-radius: 4px;
    border-width: 1.5px;
  }
  .creature-card:hover {
    transform: none;
  }

  /* Attack rotation on mobile — scaled down to fit container */
  .card-attack {
    transform: rotate(90deg) scale(0.85);
    border-color: color-mix(in srgb, #ef4444 55%, var(--domain-color, #334155));
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.35), 0 2px 6px rgba(0,0,0,0.7);
  }
  .card-attack:hover {
    transform: rotate(90deg) scale(0.85);
  }

  /* Header hidden — name badge replaces it */
  .card-header { display: none; }

  /* Compact body */
  .card-body {
    flex: 0;
    padding: 1px 2px 0;
    gap: 1px;
  }
  .keyword-badge { width: 20px; height: 20px; border-radius: 4px; }
  .keyword-svg { width: 14px; height: 14px; }
  .keyword-dragon .keyword-svg { width: 12px; height: 12px; }
  .keyword-stack { gap: 2px; top: 2px; right: 2px; }
  .status-stack { gap: 2px; top: 2px; left: 2px; }
  .card-domain-badge { width: 20px; height: 20px; }
  .card-domain-img { width: 15px; height: 15px; }
  .card-badges { gap: 1px; }
  .badge-icon { font-size: 7px; }
  .badge-tag { font-size: 7px; }
  .badge-paralyze { font-size: 6px; padding: 0 1px; }
  .badge-poison { font-size: 6px; }
  .card-active-effects { display: none; }
  .card-abilities { display: none; }
  .ability-row { display: none; }

  /* Position badge — LARGE tappable button ABOVE the card on mobile */
  .position-badge {
    display: flex;
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    font-size: 8px;
    padding: 3px 8px;
    border-radius: 6px;
    font-weight: 900;
    letter-spacing: 0.06em;
    min-width: 36px;
    min-height: 20px;
    justify-content: center;
    align-items: center;
    gap: 2px;
    /* backdrop-filter removed — causes paint */
  }
  .pos-attack {
    background: rgba(239, 68, 68, 0.25) !important;
    border: 1.5px solid rgba(239, 68, 68, 0.5) !important;
    color: #fca5a5 !important;
  }
  .pos-defense {
    background: rgba(96, 165, 250, 0.25) !important;
    border: 1.5px solid rgba(96, 165, 250, 0.5) !important;
    color: #93c5fd !important;
  }
  .pos-clickable {
    cursor: pointer;
    box-shadow: 0 0 8px rgba(200, 168, 78, 0.5);
    animation: pos-pulse 2s ease-in-out infinite;
  }
  @keyframes pos-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Stats footer — compact for smaller cards */
  .card-footer {
    padding: 2px 3px;
    background: rgba(0,0,0,0.85);
  }
  .stat {
    font-size: 11px;
    gap: 1px;
  }
  .stat-img { width: 9px; height: 9px; }
  .stat-icon { font-size: 9px; }
  .stat-delta { font-size: 6px; }

  /* Name overlay — compact 1-line */
  .card-name-badge {
    position: absolute;
    top: 1px;
    left: 1px;
    right: 12px;
    z-index: 5;
    padding: 0 2px;
    border-radius: 2px;
    display: block;
  }
  .card-name {
    font-size: 6px;
    padding: 0;
    line-height: 1.1;
    -webkit-line-clamp: 1;
  }

  /* Domain icon */
  .card-domain-img {
    width: 11px;
    height: 11px;
    top: 1px;
    right: 1px;
  }
  .card-domain-dot {
    width: 6px;
    height: 6px;
    top: 1px;
    right: 1px;
  }

  /* Gradient for stat readability */
  .creature-card::after {
    height: 45%;
    background: linear-gradient(transparent 0%, rgba(5,3,8,0.5) 40%, rgba(5,3,8,0.9) 100%);
  }

  .spy-badge {
    transform: scale(0.55);
    transform-origin: top left;
  }

  /* State overlays */
  .state-overlay { font-size: 10px; }
  .state-overlay-icon { font-size: 16px; }
  .state-overlay-label { font-size: 5px; }
}

/* ===== VFX ANIMATING — disable infinite CSS animations during GSAP combat VFX =====
 * The .vfx-animating class is added/removed by AnimationDirector on the card element.
 * This prevents CSS animations (opacity, box-shadow) from fighting GSAP transforms. */
.creature-card.vfx-animating .effect-activate-btn,
.creature-card.vfx-animating .effect-cost-pill {
  animation: none;
}
.creature-card.vfx-animating .pos-clickable {
  animation: none;
}
</style>
