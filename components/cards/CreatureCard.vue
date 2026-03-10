<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { CardInstance } from '../../game-engine/types'
import { AttackType, CardPosition } from '../../game-engine/constants'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import { parseTokens } from '../../composables/useTokenIcons'
// Grafiki stworzeń: automatycznie wczytuje assets/cards/creature/{id}.png
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.png', { eager: true, import: 'default' }) as Record<string, string>
const creatureImgs = Object.fromEntries(
  Object.entries(_creatureImgModules)
    .map(([key, val]) => { const m = key.match(/(\d+)\.png$/); return m ? [parseInt(m[1]!), val] : null })
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
  ON_DAMAGE_DEALT: 'NATARCIE',
  ON_DAMAGE_RECEIVED: 'ODWET',
  ON_ACTIVATE: 'AKCJA',
  ON_ALLY_ATTACKED: 'CZUJNOŚĆ',
}

// Tag colors for trigger labels and [TAG] badges
const tagColors: Record<string, string> = {
  'WEJŚCIE': '#22c55e',
  'AKCJA': '#a855f7',
  'AURA': '#3b82f6',
  'ODWET': '#f97316',
  'NATARCIE': '#ef4444',
  'ZABÓJSTWO': '#ef4444',
  'POŻEGNANIE': '#6b7280',
  'CZUJNOŚĆ': '#eab308',
}

// Passive aura icons — shown directly on the creature card
const passiveAuraIcons: Record<string, { icon: string; label: string }> = {
  'matoha_anti_magic':       { icon: '🚫', label: 'Anty-Magia' },
  'chmurnik_ground_flying':  { icon: '⬇', label: 'Uziemienie' },
  'guslarka_bonus_vs_demon': { icon: '✝', label: 'vs Demony' },
  'zerca_welesa_demon_buff': { icon: '🔥', label: 'Demoniczny' },
  'polewik_buff_neighbors':  { icon: '🌾', label: 'Wsparcie' },
  'szeptunka_damage_reduction': { icon: '🤫', label: 'Szept' },
  'chlop_extra_attack':      { icon: '⚔', label: '+1 Atak' },
  'tesknica_block_enhance':  { icon: '🔒', label: 'Blokada' },
  'bieda_spy_block_draw':    { icon: '💀', label: 'Bieda' },
  'licho_block_draw':        { icon: '👁', label: 'Licho' },
  'bzionek_spell_intercept': { icon: '🛡', label: 'Anty-Czar' },
  'czarownica_redirect_spell': { icon: '🔄', label: 'Odwrót' },
  'lapiduch_demon_hunter':   { icon: '⚔', label: 'Łowca' },
  'zupan_no_field_limit':    { icon: '👑', label: 'Bez limitu' },
}

function getTriggerColor(trigger: string): string {
  const label = triggerLabels[trigger] ?? trigger
  return tagColors[label] ?? '#a5b4fc'
}

const abilities = computed(() => (cardData.value.abilities ?? []) as Array<{trigger: string; text: string}>)

// Passive aura badge for this creature
const auraBadge = computed(() => {
  if (!props.card || props.card.isSilenced) return null
  return passiveAuraIcons[cardData.value.effectId] ?? null
})

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
  effectCost?: number              // koszt aktywacji w ZŁ (0 = darmowe)
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
// ===== WSKAŹNIKI STANU (TIER 4 visual indicators) =====
const isTaunt       = computed(() => !props.inHand && (cardData.value as any).effectId === 'blotnik_taunt' && !props.card.isSilenced)
const isMatecznik   = computed(() => !props.inHand && !!props.card.metadata?.matecznikHidden)
const isPrzyjaznGuard    = computed(() => !props.inHand && !!props.card.metadata?.przyjaznGuard)
const isPrzyjaznProtected = computed(() => !props.inHand && !!props.card.metadata?.przyjaznProtector)
const isLycan       = computed(() => !props.inHand && !!props.card.metadata?.likantropiaActive)
const hasDeathMark  = computed(() => !props.inHand && !!props.card.metadata?.dziewiatkoDeathMark)
const isCursed      = computed(() => !props.inHand && !!props.card.metadata?.zagorkiniaCursed)
const isInvincible  = computed(() => !props.inHand && (cardData.value as any).effectId === 'wapierz_invincible_hunger')
const isWijRevived  = computed(() => !props.inHand && !!props.card.metadata?.wijRevived)
const isGuardian    = computed(() => !props.inHand && (cardData.value as any).effectId === 'niedzwiedzioak_guardian' && !props.card.isSilenced)
const isRiding      = computed(() => !props.inHand && !!props.card.metadata?.rumakActive)
const isHomenCursed = computed(() => !props.inHand && !!props.card.metadata?.homenCurseOwner)

// ===== P1 VFX STATUSY =====
const isParalyzed   = computed(() => !props.inHand && props.card.paralyzeRoundsLeft !== null && props.card.paralyzeRoundsLeft !== 0)
const isDiseased    = computed(() => !props.inHand && !!props.card.cannotAttack && !isParalyzed.value)
const isLifestealer = computed(() => !props.inHand && ['strzyga_lifesteal', 'bezkost_atk_drain', 'latawica_drain_ally'].includes((cardData.value as any).effectId) && !props.card.isSilenced)
const isDeathFeeder = computed(() => !props.inHand && ['baba_jaga_death_growth', 'smierc_death_growth_save'].includes((cardData.value as any).effectId) && !props.card.isSilenced)
const isAoEAura     = computed(() => !props.inHand && ['morowa_dziewica_aoe_all', 'cicha_kill_weak', 'poludnica_kill_weakest'].includes((cardData.value as any).effectId) && !props.card.isSilenced)

// P2 AURA_RING — persistent aura glow per effect type
const auraRingClass = computed(() => {
  if (props.inHand || props.card.isSilenced) return ''
  const eid = (cardData.value as any).effectId
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

// ===== PASYWNE AURY — badge z opisem =====
const passiveAuraMap: Record<string, { icon: string; label: string; desc: string }> = {
  'matoha_anti_magic':       { icon: '🚫', label: 'Anty-Magia',   desc: 'Blokuje ataki typu Magia na wszystkich sojuszników.' },
  'chmurnik_ground_flying':  { icon: '⬇',  label: 'Uziemienie',   desc: 'Wrogie latające istoty tracą latanie.' },
  'dobroochoczy_no_counter': { icon: '🕊',  label: 'Pokojowy',     desc: 'Nigdy nie kontratakuje.' },
  'cmuch_no_counter_received':{ icon: '💨', label: 'Nieuchwytny',  desc: 'Nie otrzymuje kontrataku po ataku.' },
  'guslarka_bonus_vs_demon': { icon: '✝',  label: 'vs Demony',    desc: 'Sojusznicy zyskują +2 ATK vs demony (Weles).' },
  'zerca_welesa_demon_buff': { icon: '🔥', label: 'Demoniczny',   desc: 'Sojusznicze demony zyskują +1 ATK.' },
  'polewik_buff_neighbors':  { icon: '🌾', label: 'Wsparcie',     desc: 'Żywi sąsiedzi w L1 zyskują +1 ATK.' },
  'szeptunka_damage_reduction':{ icon: '🤫',label: 'Szept',       desc: 'Sojusznicy otrzymują -1 obrażeń.' },
  'utopiec_half_damage':     { icon: '🌊', label: '½ Obrażeń',   desc: 'Otrzymuje połowę obrażeń.' },
  'chlop_extra_attack':      { icon: '⚔',  label: '+1 Atak',     desc: 'Daje sojusznikom +1 dodatkowy atak na turę.' },
  'kikimora_free_attack':    { icon: '👻', label: 'Darmowy',      desc: 'Jej atak nie zajmuje slotu atakowego.' },
  'lesnica_double_attack':   { icon: '⚡', label: '2× Atak',     desc: 'Może atakować dwa razy na turę.' },
  'zupan_no_field_limit':    { icon: '👑', label: 'Bez limitu',   desc: 'Znosi limit 5 istot na polu.' },
  'tesknica_block_enhance':  { icon: '🔒', label: 'Blokada',      desc: 'Blokuje ulepszanie kart przygody wroga.' },
  'bieda_spy_block_draw':    { icon: '💀', label: 'Bieda',        desc: 'Właściciel nie może dobierać kart.' },
  'licho_block_draw':        { icon: '👁',  label: 'Licho',       desc: 'Wróg nie może dobierać kart.' },
  'bzionek_spell_intercept': { icon: '🛡',  label: 'Anty-Czar',   desc: 'Przechwytuje zaklęcia celujące w sojuszników.' },
  'czarownica_redirect_spell':{ icon: '🔄',label: 'Odwrót',       desc: 'Przekierowuje zaklęcia wroga na jego istoty.' },
  'julki_adventure_immunity':{ icon: '✨', label: 'Odporność',    desc: 'Odporna na karty przygody.' },
  'mavka_line_shield':       { icon: '🌿', label: 'Osłona',       desc: 'Chroni sojuszników w tej samej linii.' },
  'znachor_absorb':          { icon: '💚', label: 'Absorpcja',    desc: 'Redukuje obrażenia zadawane sojusznikom.' },
  'lapiduch_demon_hunter':   { icon: '⚔',  label: 'Łowca',       desc: 'Atakuje tylko demony. Blokuje wystawianie demonów.' },
  'wilkolak_melee_immune':   { icon: '🐺', label: 'Odporny',      desc: 'Odporny na Wręcz poniżej 7 ATK.' },
  'stukacz_strong_immune':   { icon: '🪨', label: 'Twardy',       desc: 'Silniejsi wrogowie nie mogą atakować.' },
  'dydko_strong_immune':     { icon: '🪨', label: 'Zwinny',       desc: 'Równi i silniejsi wrogowie nie mogą atakować.' },
  'buka_force_defense':      { icon: '😱', label: 'Strach',       desc: 'Słabsi wrogowie nie mogą atakować Buki.' },
  'rybi_krol_pierce_immunity':{ icon: '🔱',label: 'Przebicie',    desc: 'Ignoruje odporności celów.' },
  'krol_wezow_always_counter':{ icon: '🐍',label: 'Kontra',       desc: 'Kontratakuje zawsze, nawet w ataku.' },
  'grad_magic_element_only': { icon: '❄',  label: 'Grad',         desc: 'Tylko Magia/Żywioł mogą go zaatakować.' },
}

const passiveAura = computed(() => {
  if (props.inHand) return null
  const effectId = (props.card.cardData as any).effectId
  return passiveAuraMap[effectId] ?? null
})

// ===== LICZNIKI NA KARTACH =====
const game = useGameStore()

// Smocze Jajo: odliczanie do wylęgu (5 rund)
const jajoCounter = computed(() => {
  if (props.inHand || (props.card.cardData as any).effectId !== 'smocze_jajo_hatch') return null
  const roundsInPlay = (game.state?.roundNumber ?? 0) - (props.card.roundEnteredPlay ?? 0)
  return { current: Math.min(roundsInPlay, 5), max: 5 }
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
// Karta jest widoczna: własna ZAWSZE, wroga dopiero po ujawnieniu (lub tymczasowym reveal przed atakiem)
const isHidden = computed(() =>
  !props.card.isRevealed
  && props.card.owner === 'player2'
  && !props.inHand
)

const domainColor = computed(() => ({
  1: '#d4a843',
  2: '#4a9e4a',
  3: '#8b5fc7',
  4: '#c44040',
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
    'in-hand':         props.inHand,
    'card-attack':     !props.inHand && !isDefense.value,
    'card-defense':    isDefense.value,
    'is-selected':     props.selected,
    'is-valid-target': props.isValidTarget,
    'is-dimmed':       props.dimmed,
    'is-silenced':          props.card.isSilenced,
    'cannot-attack':        props.card.cannotAttack,
    // Visual indicators stripped — all defined in useCardIndicators.ts registry
    // VFXOrchestrator will render glows/auras via VFXOverlay
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
    <!-- Górny pasek: nazwa w ramce + ikona domeny -->
    <div class="card-header">
      <div class="card-name-badge">
        <span class="card-name">{{ cardData.name.toUpperCase() }}</span>
      </div>
      <img v-if="domainImgs[cardData.domain]" :src="domainImgs[cardData.domain]" class="card-domain-img" />
      <div v-else class="card-domain-dot" :style="{ background: domainColor }" />
    </div>

    <!-- Grafika stworzenia (fallback: Tugaryn) -->
    <img
      :src="creatureImgs[cardData.id] ?? creatureImgs[117]"
      class="card-art"
      aria-hidden="true"
    />

    <!-- Środek: badges -->
    <div class="card-body">
      <!-- Latający: duży, prawostronnie -->
      <div v-if="isFlying" class="flying-row">
        <img :src="flyingImg" class="flying-img" v-tip="'Latający'" />
      </div>
      <div class="card-badges">
        <Icon v-if="card.isSilenced"   icon="game-icons:silenced"       class="badge-icon badge-silenced" v-tip="'Uciszony'" />
        <Icon v-if="card.isImmune"     icon="game-icons:shield-reflect" class="badge-icon badge-immune"   v-tip="'Odporny'" />
        <Icon v-if="card.cannotAttack" icon="game-icons:chains"         class="badge-icon badge-disarmed" v-tip="'Nie może atakować'" />
        <span v-if="card.poisonRoundsLeft" class="badge-poison">☠ {{ card.poisonRoundsLeft }}</span>
        <span v-if="card.paralyzeRoundsLeft !== null && card.paralyzeRoundsLeft !== 0" class="badge-paralyze" v-tip="card.paralyzeRoundsLeft === -1 ? 'Paraliż permanentny' : `Paraliż: ${card.paralyzeRoundsLeft} rund`">
          ⚡ {{ card.paralyzeRoundsLeft === -1 ? '∞' : card.paralyzeRoundsLeft }}
        </span>
        <!-- TIER 4 badges -->
        <span v-if="isTaunt"            class="badge-tag badge-taunt"       v-tip="'Prowokacja — wróg musi atakować Błotnika'">🎯</span>
        <span v-if="isPrzyjaznGuard"    class="badge-tag badge-friend-g"    v-tip="'Chroni sojusznika (Przyjaźń)'">🛡</span>
        <span v-if="isPrzyjaznProtected" class="badge-tag badge-friend-p"   v-tip="'Chroniony przez sojusznika (Przyjaźń)'">💛</span>
        <span v-if="isLycan"            class="badge-tag badge-lycan"       v-tip="'Likantropia — wchłania ofiary'">🐺</span>
        <span v-if="isCursed"           class="badge-tag badge-cursed"      v-tip="'Przeklęty — traci 1 ATK/DEF co turę'">🪄</span>
        <span v-if="isInvincible"       class="badge-tag badge-invincible"  v-tip="'Nieśmiertelny — odporny na obrażenia'">♾</span>
        <span v-if="isWijRevived"       class="badge-tag badge-wij"         v-tip="'Wskrzeszony — ginie na koniec tej tury!'">⏰</span>
        <span v-if="isGuardian"         class="badge-tag badge-guardian"    v-tip="'Strażnik — kontratakuje napastników sojuszników'">🐻</span>
        <span v-if="isRiding"           class="badge-tag badge-rider"       v-tip="'Dosiadł Rumaka — rani całą linię'">🐴</span>
        <!-- Pasywna aura -->
        <span
          v-if="passiveAura"
          class="badge-tag badge-passive"
          v-tip="`${passiveAura.label}: ${passiveAura.desc}`"
        >{{ passiveAura.icon }}</span>
        <!-- Licznik: Smocze Jajo -->
        <span v-if="jajoCounter" class="badge-tag badge-counter badge-jajo" v-tip="`Wylęg za ${jajoCounter.max - jajoCounter.current} rund`">
          🥚 {{ jajoCounter.current }}/{{ jajoCounter.max }}
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
        <Icon :icon="isDefense ? 'game-icons:shield' : 'game-icons:crossed-swords'" class="pos-icon" />
        {{ isDefense ? 'OBR' : 'ATK' }}
      </div>

      <!-- Rząd zdolności: dwa niezależne sloty [⚡ lewo] [🪙 prawo] -->
      <div v-if="!inHand && effectAvailable" class="ability-row">
        <!-- LEWY SLOT: tylko gdy darmowa (cost=0) -->
        <button
          v-if="effectCost === 0"
          class="effect-activate-btn"
          v-tip="'Aktywuj zdolność (gratis)'"
          @click.stop="emit('activate-effect', card)"
        >⚡</button>
        <span v-else class="ability-slot-empty" />

        <!-- PRAWY SLOT: tylko gdy płatna (cost>0) -->
        <button
          v-if="effectCost !== undefined && effectCost > 0"
          class="effect-cost-pill"
          v-tip="`Aktywuj za ${effectCost} ZŁ`"
          @click.stop="emit('activate-effect', card)"
        >🪙{{ effectCost }}</button>
      </div>
    </div>

    <!-- Aura badge — pasywny efekt tej istoty -->
    <div v-if="!inHand && auraBadge" class="aura-badge"
      @mouseenter.stop="ui.showTooltip(card.instanceId)"
      @mouseleave.stop="ui.hideTooltip()"
    >
      {{ auraBadge.icon }}
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
            <Icon v-else-if="seg.iconify" :icon="seg.iconify" class="token-icon-svg" :style="{ color: seg.color }" :title="seg.label" />
          </template>
        </span>
      </div>
    </div>

    <!-- Dolny pasek: ATK / DEF -->
    <div class="card-footer">
      <div class="stat atk">
        <img v-if="attackTypeImgs[cardData.attackType]" :src="attackTypeImgs[cardData.attackType]" class="stat-img" />
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

    <!-- P1 status overlays (paralysis/disease) stripped — P3 VFXOrchestrator will handle -->

    <div v-if="isValidTarget" class="target-overlay" />
  </div>
</template>

<style scoped>
.creature-card {
  position: relative;
  width: 110px;
  height: 154px;
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

/* ===== HEADER ===== */
.card-header {
  display: flex;
  align-items: flex-start;
  padding: 3px 3px 2px;
  min-height: 26px;
  position: relative;
  z-index: 1;
}

.card-name-badge {
  display: inline-flex;
  max-width: calc(100% - 4px);
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

.card-domain-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.card-domain-img {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  object-fit: contain;
  opacity: 0.9;
}

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
.pos-icon    { font-size: 8px; }

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

/* Aura badge — small indicator on creature cards with passive effects */
.aura-badge {
  position: absolute;
  bottom: 28px;
  left: 3px;
  font-size: 12px;
  line-height: 1;
  z-index: 3;
  cursor: help;
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
  background: rgba(0,0,0,0.88);
  border-radius: 0 0 4px 4px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 22px;
  font-weight: 800;
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

/* Pulsing animations use OPACITY only (compositor-only, zero paint cost) */
@keyframes effect-pulse {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1; }
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

/* ===== LICZNIKI (Smocze Jajo, Młot) ===== */
.badge-counter {
  font-size: 8px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 3px;
  padding: 0 3px;
  color: #fbbf24;
}
.badge-jajo {
  border: 1px solid rgba(251, 191, 36, 0.5);
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
    width: 56px;
    height: 76px;
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
  .flying-row { padding-right: 1px; }
  .flying-img { width: 10px; height: 10px; }
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
  .pos-icon { font-size: 10px; }

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

  .aura-badge {
    transform: scale(0.55);
    transform-origin: bottom left;
    bottom: 24px;
    left: 1px;
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
</style>
