<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import gsap from 'gsap'
import type { CardInstance } from '../../game-engine/types'
import { AttackType, CardPosition } from '../../game-engine/constants'
import { useUIStore } from '../../stores/uiStore'
import { useGameStore } from '../../stores/gameStore'
import { parseTokens } from '../../composables/useTokenIcons'
// FireVFX (TresJS) removed — too heavy for card game, CSS-only fire used instead

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
  isAttacking?: boolean
  isHit?: boolean
  isDying?: boolean
  isValidTarget?: boolean
  dimmed?: boolean
  inHand?: boolean
  togglePositionOnClick?: boolean  // PLAY faza: klik = zmień pozycję
  effectAvailable?: boolean        // ⚡ aktywowalna zdolność gotowa
  effectCost?: number              // koszt aktywacji w ZŁ (0 = darmowe)
  isCounterattacking?: boolean     // (legacy prop, kept for compat)
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
// Kontratak — sprawdzamy bezpośrednio w UIStore, nie przez prop (unika problemów z reaktywnością)
const isCounterattacking = computed(() => ui.counterAttackCardId === props.card.instanceId)
// ODPORNY flash — atak zadał 0 obrażeń (soft-fail immunity)
const isImmuneFlash = computed(() => ui.immuneCardId === props.card.instanceId)

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
const isZombifying  = computed(() => ui.zombifyVFX?.cardId === props.card.instanceId)

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

// Conversion VFX — card being taken over
const isConverting = computed(() => ui.conversionVFX?.cardId === props.card.instanceId)

// Status flash VFX (krótki puls gdy efekt się aktywuje)
const hasStatusFlash = computed(() => ui.statusFlashId === props.card.instanceId)
const statusFlashClass = computed(() => hasStatusFlash.value ? `status-flash-${ui.statusFlashType}` : '')

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

// Zagrożenie Południcą / Cichą — najsłabsza istota na polu
const isThreatened = computed(() => {
  if (props.inHand || props.card.owner !== 'player1') return null
  const state = game.state
  if (!state) return null

  const enemySide = 'player2'
  const enemyField = Object.values(state.players[enemySide].field.lines).flat()

  // Południca: zabija najsłabszą istotę na polu (obie strony!)
  const hasPoludnica = enemyField.some(c => (c.cardData as any).effectId === 'poludnica_kill_weakest' && !c.isSilenced)
  // Cicha: zabija istoty z ATK ≤ 2 (obie strony!)
  const hasCicha = enemyField.some(c => (c.cardData as any).effectId === 'cicha_kill_weak' && !c.isSilenced)
  // Cicha gracza (zabija też swoje)
  const playerField = Object.values(state.players.player1.field.lines).flat()
  const playerHasCicha = playerField.some(c => (c.cardData as any).effectId === 'cicha_kill_weak' && !c.isSilenced)

  if (hasCicha || playerHasCicha) {
    if (props.card.currentStats.attack <= 2) return 'Zagrożony przez Cichą (ATK ≤ 2)!'
  }

  if (hasPoludnica) {
    const allOnField = [...playerField, ...enemyField].filter(c => c.currentStats.defense > 0)
    if (allOnField.length === 0) return null
    const weakest = allOnField.reduce((a, b) => a!.currentStats.defense < b!.currentStats.defense ? a : b, allOnField[0])
    if (weakest?.instanceId === props.card.instanceId) return 'Najsłabsza istota — cel Południcy!'
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

// Stat growth flash (Baba Jaga / Śmierć)
const isGrowing = computed(() => !props.inHand && !!props.card.metadata?.justGrew)

// Resurrection flash (Kościej)
const isResurrecting = computed(() => !props.inHand && !!props.card.metadata?.justResurrected)

// Sticky death flag — once dying, never show card again (prevents flash after animation)
const hasDied = ref(false)
watch(() => props.isDying, (v) => { if (v) hasDied.value = true })

// ===== GSAP ANIMATION REFS =====
const cardEl = ref<HTMLElement | null>(null)

// GSAP: Hit impact — compositor-only (transform + opacity). No filter/boxShadow animations.
watch(() => props.isHit, (v) => {
  if (!v || !cardEl.value) return
  const el = cardEl.value!
  const atkType = ui.animatingAttackType
  nextTick(() => {
    const tl = gsap.timeline({
      onComplete: () => { gsap.set(el, { clearProps: 'transform,opacity' }) }
    })

    if (atkType === AttackType.MELEE) {
      // Melee: heavy slam shake
      tl.to(el, { x: -10, duration: 0.08, ease: 'power2.out' })
        .to(el, { x: 10, duration: 0.08 })
        .to(el, { x: -7, y: -4, duration: 0.07 })
        .to(el, { x: 7, y: 3, duration: 0.07 })
        .to(el, { x: -4, y: 2, duration: 0.08 })
        .to(el, { x: 0, y: 0, duration: 0.12, ease: 'power2.out' })
      // Flash via opacity pulse (compositor-only)
      tl.fromTo(el, { opacity: 1 }, { opacity: 0.4, duration: 0.08, yoyo: true, repeat: 1 }, 0)

    } else if (atkType === AttackType.ELEMENTAL) {
      // Elemental: wobble rotation
      tl.to(el, { rotation: -5, duration: 0.1 })
        .to(el, { rotation: 5, duration: 0.1 })
        .to(el, { rotation: -3, duration: 0.1 })
        .to(el, { rotation: 0, duration: 0.15, ease: 'elastic.out(1,0.5)' })
      tl.fromTo(el, { opacity: 1 }, { opacity: 0.5, duration: 0.12, yoyo: true, repeat: 1 }, 0)

    } else if (atkType === AttackType.MAGIC) {
      // Magic: arcane scale pulse
      tl.to(el, { scale: 0.92, duration: 0.15, ease: 'power2.in' })
        .to(el, { scale: 1.08, duration: 0.18, ease: 'power2.out' })
        .to(el, { scale: 1, duration: 0.3, ease: 'elastic.out(1,0.4)' })
      tl.fromTo(el, { opacity: 1 }, { opacity: 0.45, duration: 0.15, yoyo: true, repeat: 1 }, 0)

    } else if (atkType === AttackType.RANGED) {
      // Ranged: sharp push-back
      tl.to(el, { x: 8, scale: 0.95, duration: 0.1, ease: 'power3.out' })
        .to(el, { x: -3, scale: 1.03, duration: 0.12 })
        .to(el, { x: 0, scale: 1, duration: 0.2, ease: 'back.out(2)' })
      tl.fromTo(el, { opacity: 1 }, { opacity: 0.5, duration: 0.1, yoyo: true, repeat: 1 }, 0)

    } else {
      // Fallback: basic shake
      tl.fromTo(el, { x: 0, y: 0 },
        { x: 'random(-7, 7)', y: 'random(-3, 3)', duration: 0.1, repeat: 5, yoyo: true, ease: 'power1.inOut' })
    }
  })
})

// GSAP: Death — compositor-only (transform + opacity). No filter/boxShadow.
watch(() => props.isDying, (v) => {
  if (!v || !cardEl.value) return
  nextTick(() => {
    const el = cardEl.value!
    gsap.timeline()
      // Phase 1: bright flash (scale pop + flash white via opacity)
      .to(el, { scale: 1.12, opacity: 0.7, duration: 0.2 })
      // Phase 2: shrink
      .to(el, { scale: 0.88, opacity: 0.5, duration: 0.35 })
      // Phase 3: crumble
      .to(el, { scale: 0.35, opacity: 0.08, rotation: 'random(-15, 15)', duration: 0.5, ease: 'power2.in' })
      // Phase 4: vanish
      .to(el, { scale: 0, opacity: 0, rotation: 'random(-25, 25)', duration: 0.3, ease: 'power3.in' })
  })
})

// GSAP: Growth flash — compositor-only scale pulse
watch(isGrowing, (v) => {
  if (!v || !cardEl.value) return
  nextTick(() => {
    gsap.fromTo(cardEl.value!,
      { scale: 1 },
      { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out',
        onComplete() { gsap.set(cardEl.value!, { clearProps: 'transform' }) } }
    )
  })
})

// GSAP: Resurrect glow — compositor-only scale + opacity pulse
watch(isResurrecting, (v) => {
  if (!v || !cardEl.value) return
  nextTick(() => {
    gsap.fromTo(cardEl.value!,
      { scale: 1, opacity: 1 },
      { scale: 1.08, opacity: 0.6, duration: 0.35, yoyo: true, repeat: 1, ease: 'power2.out',
        onComplete() { gsap.set(cardEl.value!, { clearProps: 'transform,opacity' }) } }
    )
  })
})

// Cleanup GSAP on unmount
onUnmounted(() => {
  if (cardEl.value) gsap.killTweensOf(cardEl.value)
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
  && ui.revealingCardId !== props.card.instanceId
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
    'is-attacking':    props.isAttacking,
    'is-hit':          props.isHit,
    'is-dying':        props.isDying,
    'has-died':        hasDied.value,
    'is-valid-target': props.isValidTarget,
    'is-dimmed':       props.dimmed,
    'is-silenced':          props.card.isSilenced,
    'cannot-attack':        props.card.cannotAttack,
    'is-counterattacking':  isCounterattacking.value,
    // TIER 4 visual indicators
    'is-taunt':      isTaunt.value,
    'is-matecznik':  isMatecznik.value,
    'has-death-mark': hasDeathMark.value,
    'is-invincible': isInvincible.value,
    'wij-last-turn': isWijRevived.value,
    'is-threatened': !!isThreatened.value,
    'is-growing': isGrowing.value,
    'is-resurrecting': isResurrecting.value,
    // P1 VFX
    'is-paralyzed': isParalyzed.value,
    'is-diseased': isDiseased.value,
    'is-lifestealer': isLifestealer.value,
    'is-death-feeder': isDeathFeeder.value,
    'is-aoe-aura': isAoEAura.value,
    'is-homen-cursed': isHomenCursed.value,
    'is-zombifying': isZombifying.value,
    'is-converting': isConverting.value,
    [auraRingClass.value]: !!auraRingClass.value,
    [statusFlashClass.value]: hasStatusFlash.value,
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
    :class="['creature-card', 'card-hidden', { 'card-attack': !inHand && card.position === CardPosition.ATTACK, 'is-valid-target': isValidTarget, 'is-dimmed': dimmed, 'is-counterattacking': isCounterattacking }]"
    @click="emit('click', card)"
    @mouseenter="emit('mouseenter', card)"
    @mouseleave="emit('mouseleave')"
  >
    <div class="hidden-pattern" />
    <div class="hidden-mark">?</div>
    <!-- Kontratak na zakrytej karcie -->
    <div v-show="ui.counterAttackCardId === card.instanceId" class="shield-overlay">
      🛡️
      <span class="shield-label">KONTRATAK</span>
    </div>
  </div>

  <!-- Widoczna karta -->
  <div
    v-else
    ref="cardEl"
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

    <!-- P1: Paraliż overlay (Bazyliszek, Jaroszek, Północnica) -->
    <div v-if="isParalyzed && !hasDeathMark" class="state-overlay paralyze-overlay">
      <span class="state-overlay-icon">⚡</span>
      <span class="state-overlay-label">PARALIŻ</span>
    </div>

    <!-- P1: Choroba overlay (Biali Ludzie - cannotAttack bez paralyze) -->
    <div v-if="isDiseased && !hasDeathMark" class="state-overlay disease-overlay">
      <span class="state-overlay-icon">🦠</span>
      <span class="state-overlay-label">CHOROBA</span>
    </div>

    <div v-if="isValidTarget" class="target-overlay" />

    <!-- HIT VFX: type-specific effect on attacked card -->
    <div v-if="isHit" class="hit-vfx">
      <!-- MELEE: triple slash + blood splatter + scar marks -->
      <template v-if="ui.animatingAttackType === 0">
        <svg viewBox="0 0 110 154" class="slash-svg">
          <line x1="8" y1="145" x2="102" y2="10" class="slash-line slash-main" />
          <line x1="88" y1="145" x2="22" y2="35" class="slash-line slash-cross" />
          <line x1="55" y1="150" x2="55" y2="5" class="slash-line slash-vert" />
        </svg>
        <div class="melee-scar scar-1" />
        <div class="melee-scar scar-2" />
        <div class="melee-blood-splat" />
      </template>
      <!-- ELEMENTAL: lightweight CSS fire (no WebGL) -->
      <template v-if="ui.animatingAttackType === 1">
        <div class="fire-engulf" />
        <div class="elem-flame elem-flame-1" />
        <div class="elem-flame elem-flame-2" />
        <div class="elem-flame elem-flame-3" />
        <div class="elem-flame elem-flame-4" />
      </template>
      <!-- MAGIC: rune circle + energy spiral + arcane explosion -->
      <template v-if="ui.animatingAttackType === 2">
        <div class="magic-circle" />
        <div class="magic-rune" v-for="n in 6" :key="'mr'+n" :style="{ '--ri': n }" />
        <div class="magic-spiral" />
        <div class="magic-sparkle" v-for="n in 12" :key="'mp'+n" :style="{ '--mi': n }" />
        <div class="magic-ring" />
        <div class="magic-ring magic-ring-2" />
      </template>
      <!-- RANGED: arrow with fletching + trail + impact crater -->
      <template v-if="ui.animatingAttackType === 3">
        <div class="arrow-body">
          <div class="arrow-shaft" />
          <div class="arrow-head" />
          <div class="arrow-fletching" />
        </div>
        <div class="arrow-trail" v-for="n in 5" :key="'at'+n" :style="{ '--ti': n }" />
        <div class="arrow-impact-crater" />
        <div class="arrow-splinter" v-for="n in 4" :key="'as'+n" :style="{ '--si': n }" />
      </template>
    </div>

    <!-- DEATH FIRE: efekt płonięcia przy śmierci karty -->
    <div v-if="isDying" class="death-fire">
      <div class="fire-ember" v-for="n in 8" :key="n" :style="{ '--i': n }" />
      <div class="fire-glow" />
    </div>

    <!-- Kontratak: duża tarcza na twarzy karty -->
    <div v-show="ui.counterAttackCardId === card.instanceId" class="shield-overlay">
      🛡️
      <span class="shield-label">KONTRATAK</span>
    </div>

    <!-- ODPORNY: atak zadał 0 obrażeń -->
    <Transition name="immune-flash">
      <div v-if="isImmuneFlash" class="immune-overlay">
        ✋
        <span class="immune-label">ODPORNY</span>
      </div>
    </Transition>
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

.is-attacking {
  animation: attack-charge 0.8s ease infinite;
}
@keyframes attack-charge {
  0%, 100% { box-shadow: 0 0 0 3px #f59e0b, 0 0 8px 2px rgba(245,158,11,0.5); }
  50%      { box-shadow: 0 0 0 4px #fbbf24, 0 0 20px 6px rgba(251,191,36,0.8); }
}

.is-valid-target {
  box-shadow: 0 0 0 2px #ef4444, 0 0 12px 3px rgba(239,68,68,0.4);
}
.is-valid-target:hover {
  box-shadow: 0 0 0 3px #ef4444, 0 0 20px 6px rgba(239,68,68,0.6);
}

/* hit-impact and death-burn now handled by GSAP watchers in <script> */
.is-hit   { /* GSAP handles shake animation */ }
.is-dying { /* GSAP handles death timeline */ }
/* Po zakończeniu animacji śmierci — karta pozostaje niewidoczna */
.has-died:not(.is-dying) { opacity: 0; pointer-events: none; }
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
  font-size: 16px;
  font-weight: 800;
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
.badge-fly      { color: #7dd3fc; }
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

/* ===== KONTRATAK: niebieski blask tarczy ===== */
.is-counterattacking {
  animation: shield-pulse 0.4s ease infinite alternate;
  border-color: #60a5fa !important;
}
.card-attack.is-counterattacking {
  transform: rotate(90deg);
}
@keyframes shield-pulse {
  from { box-shadow: 0 0 0 3px #60a5fa, 0 0 8px 2px rgba(96,165,250,0.4); opacity: 0.85; }
  to   { box-shadow: 0 0 0 5px #93c5fd, 0 0 16px 4px rgba(147,197,253,0.6); opacity: 1; }
}

/* Overlay tarczy na twarzy karty */
.shield-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 48px;
  border-radius: 5px;
  pointer-events: none;
  background: rgba(30, 90, 200, 0.78);
  box-shadow: 0 0 0 3px #60a5fa;
  animation: shield-bg 0.35s ease-in-out infinite alternate;
}
.shield-label {
  font-size: 9px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.06em;
  text-shadow: 0 0 8px #60a5fa, 0 1px 3px rgba(0,0,0,0.9);
  background: rgba(10, 40, 120, 0.9);
  padding: 2px 5px;
  border-radius: 3px;
  line-height: 1.4;
}
@keyframes shield-bg {
  from { background: rgba(30, 90, 200, 0.65); box-shadow: inset 0 0 0 2px #60a5fa; }
  to   { background: rgba(50, 130, 255, 0.88); box-shadow: inset 0 0 0 3px #fff; }
}

/* Klikalny badge pozycji */
.pos-clickable {
  cursor: pointer;
  box-shadow: 0 0 0 1px currentColor;
}
.pos-clickable:hover {
  filter: brightness(1.4);
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

@keyframes effect-pulse {
  0%, 100% { box-shadow: 0 0 0 0px rgba(251,191,36,0); }
  50%       { box-shadow: 0 0 0 2px rgba(251,191,36,0.35), 0 0 6px rgba(251,191,36,0.2); }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 3px #f59e0b, 0 0 8px 2px rgba(245,158,11,0.5); }
  50%       { box-shadow: 0 0 0 3px #f59e0b, 0 0 22px 8px rgba(245,158,11,0.8); }
}

/* hit-impact & death-burn: removed — now GSAP-driven in <script> */

/* ===== PASYWNA AURA ===== */
.badge-passive {
  background: rgba(124, 58, 237, 0.25);
  border: 1px solid rgba(167, 139, 250, 0.5);
  border-radius: 4px;
  padding: 0 2px;
  animation: passive-glow 2.5s ease-in-out infinite;
  cursor: help;
}

@keyframes passive-glow {
  0%, 100% { box-shadow: 0 0 3px rgba(167, 139, 250, 0.3); }
  50%      { box-shadow: 0 0 8px rgba(167, 139, 250, 0.7), 0 0 2px rgba(167, 139, 250, 0.5); }
}

/* ===== TIER 4 WSKAŹNIKI STANU ===== */

/* BADGE'Y STANU — małe emoji/tekst */
.badge-tag {
  font-size: 10px;
  line-height: 1;
  text-shadow: 0 0 2px rgba(0,0,0,0.8);
}

/* Kolory obramowania dla stanów kart */
.is-taunt    { border-color: #ef4444 !important; animation: taunt-pulse 1.8s ease-in-out infinite; }
.is-matecznik { border-color: #22c55e !important; }
.has-death-mark { animation: deathmark-pulse 1.2s ease-in-out infinite; }
.is-invincible  { border-color: #eab308 !important; box-shadow: 0 0 8px 2px rgba(234,179,8,0.4); }
.wij-last-turn  { border-color: #60a5fa !important; animation: wij-pulse 1s ease-in-out infinite; }

@keyframes taunt-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(239,68,68,0.4), 0 0 8px 2px rgba(239,68,68,0.2); }
  50%       { box-shadow: 0 0 0 3px rgba(239,68,68,0.8), 0 0 14px 4px rgba(239,68,68,0.5); }
}
@keyframes deathmark-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(239,68,68,0.5); border-color: #dc2626 !important; }
  50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0.9), 0 0 16px 6px rgba(239,68,68,0.6); border-color: #ff0000 !important; }
}
@keyframes wij-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(96,165,250,0.5); }
  50%       { box-shadow: 0 0 0 3px rgba(96,165,250,0.9), 0 0 12px 4px rgba(96,165,250,0.5); }
}

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

.matecznik-overlay {
  background: rgba(21, 128, 61, 0.55);
}
.matecznik-overlay .state-overlay-label {
  color: #bbf7d0;
  background: rgba(21, 128, 61, 0.8);
}

.deathmark-overlay {
  background: rgba(127, 0, 0, 0.45);
  animation: deathmark-overlay-pulse 1.2s ease-in-out infinite;
}
.deathmark-overlay .state-overlay-label {
  color: #fca5a5;
  background: rgba(127, 0, 0, 0.8);
}
@keyframes deathmark-overlay-pulse {
  0%, 100% { background: rgba(127, 0, 0, 0.35); }
  50%       { background: rgba(220, 0, 0, 0.55); }
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
  animation: artifact-shimmer 3s ease-in-out infinite;
  cursor: help;
}
@keyframes artifact-shimmer {
  0%, 100% { box-shadow: 0 0 2px rgba(251, 191, 36, 0.3); }
  50%      { box-shadow: 0 0 8px rgba(251, 191, 36, 0.7), 0 0 3px rgba(251, 191, 36, 0.4); }
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
  animation: trophy-glow 2s ease-in-out infinite;
}
@keyframes trophy-glow {
  0%, 100% { box-shadow: 0 0 2px rgba(168, 85, 247, 0.3); }
  50%      { box-shadow: 0 0 8px rgba(168, 85, 247, 0.7); }
}


/* ===== ZAGROŻENIE (Południca/Cicha) ===== */
.is-threatened {
  animation: threat-pulse 1.5s ease-in-out infinite;
}
.threat-overlay {
  background: rgba(220, 38, 38, 0.35);
  animation: threat-overlay-pulse 1.5s ease-in-out infinite;
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
@keyframes threat-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3); }
  50%      { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.7), 0 0 12px 4px rgba(239, 68, 68, 0.4); }
}
@keyframes threat-overlay-pulse {
  0%, 100% { background: rgba(220, 38, 38, 0.25); }
  50%      { background: rgba(220, 38, 38, 0.45); }
}

/* growth-flash and resurrect-glow now handled by GSAP watchers in <script> */
.is-growing { /* GSAP green pulse */ }
.is-resurrecting { /* GSAP purple pulse */ }

/* ===== P1 VFX: STATUSY NA KARTACH ===== */

/* Paraliż: szary + lekkie cracks */
.is-paralyzed { filter: saturate(0.3) brightness(0.85); }
.paralyze-overlay {
  background: rgba(100, 116, 139, 0.45);
  animation: status-opacity-pulse 1.5s ease-in-out infinite;
}
.paralyze-overlay .state-overlay-label {
  color: #e2e8f0;
  background: rgba(71, 85, 105, 0.85);
}

/* Choroba: zielonkawy + drżenie */
.is-diseased { filter: hue-rotate(60deg) saturate(0.5) brightness(0.9); }
.disease-overlay {
  background: rgba(22, 101, 52, 0.4);
  animation: status-opacity-pulse 2s ease-in-out infinite;
}
.disease-overlay .state-overlay-label {
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.85);
}

/* Shared compositor-friendly pulse for status overlays (opacity only, no background repaint) */
@keyframes status-opacity-pulse {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}

/* Lifesteal aura: delikatny czerwony/fioletowy puls */
.is-lifestealer {
  animation: lifesteal-aura 2.5s ease-in-out infinite;
}
@keyframes lifesteal-aura {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(239, 68, 68, 0.2); }
  50%      { box-shadow: 0 0 10px 3px rgba(239, 68, 68, 0.5), 0 0 20px 6px rgba(239, 68, 68, 0.15); }
}

/* Death feeder aura: mroczny puls (Baba Jaga, Śmierć) */
.is-death-feeder {
  animation: death-feeder-aura 3s ease-in-out infinite;
}
@keyframes death-feeder-aura {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(107, 33, 168, 0.2); }
  50%      { box-shadow: 0 0 8px 3px rgba(107, 33, 168, 0.5), 0 0 16px 5px rgba(107, 33, 168, 0.15); }
}

/* AoE aura: niebezpieczny puls (Morowa Dziewica, Cicha, Południca) */
.is-aoe-aura {
  animation: aoe-aura 2s ease-in-out infinite;
}
@keyframes aoe-aura {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(220, 38, 38, 0.15); }
  50%      { box-shadow: 0 0 10px 4px rgba(220, 38, 38, 0.4), 0 0 20px 8px rgba(220, 38, 38, 0.1); }
}

/* Status flash: krótki puls przy aktywacji statusu */
.status-flash-paralyze { animation: flash-paralyze 0.5s ease-out; }
.status-flash-disease  { animation: flash-disease 0.5s ease-out; }
.status-flash-curse    { animation: flash-curse 0.5s ease-out; }
.status-flash-petrify  { animation: flash-petrify 0.5s ease-out; }

@keyframes flash-paralyze {
  0% { box-shadow: 0 0 20px 8px rgba(100,116,139,0.8); filter: brightness(1.5); }
  100% { box-shadow: none; filter: none; }
}
@keyframes flash-disease {
  0% { box-shadow: 0 0 20px 8px rgba(22,163,74,0.8); filter: brightness(1.3) hue-rotate(60deg); }
  100% { box-shadow: none; filter: none; }
}
@keyframes flash-curse {
  0% { box-shadow: 0 0 20px 8px rgba(168,85,247,0.8); filter: brightness(1.4); }
  100% { box-shadow: none; filter: none; }
}
@keyframes flash-petrify {
  0% { box-shadow: 0 0 20px 8px rgba(148,163,184,0.9); filter: brightness(1.6) grayscale(0.8); }
  100% { box-shadow: none; filter: none; }
}

/* ===== SLASH EFFECT — cięcie miecza na trafionym celu ===== */
/* ===== HIT VFX CONTAINER ===== */
.hit-vfx {
  position: absolute;
  inset: 0;
  z-index: 45;
  pointer-events: none;
  overflow: hidden;
  border-radius: 5px;
}

/* ===== MELEE: triple slash + blood + scars + sparks ===== */
.slash-svg { width: 100%; height: 100%; position: absolute; inset: 0; }
.slash-line {
  stroke-linecap: round;
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  will-change: stroke-dashoffset;
}
.slash-main {
  stroke: #fff; stroke-width: 3.5;
  filter: drop-shadow(0 0 8px #ef4444) drop-shadow(0 0 3px #fff);
  animation: slash-draw 0.35s ease-out forwards;
}
.slash-cross {
  stroke: #fca5a5; stroke-width: 2.5;
  filter: drop-shadow(0 0 5px #dc2626);
  animation: slash-draw 0.35s ease-out 0.08s forwards;
}
.slash-vert {
  stroke: #e2e8f0; stroke-width: 2;
  filter: drop-shadow(0 0 5px #94a3b8);
  animation: slash-draw 0.3s ease-out 0.18s forwards;
}
@keyframes slash-draw {
  0%   { stroke-dashoffset: 200; opacity: 0; }
  15%  { opacity: 1; }
  70%  { stroke-dashoffset: 0; opacity: 0.9; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

.melee-scar {
  position: absolute;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(90deg, transparent, rgba(239,68,68,0.6), rgba(220,38,38,0.8), rgba(239,68,68,0.6), transparent);
  opacity: 0;
}
.scar-1 {
  top: 30%; left: 10%; right: 15%;
  transform: rotate(-35deg);
  animation: scar-appear 0.5s ease-out 0.25s forwards;
}
.scar-2 {
  top: 55%; left: 15%; right: 10%;
  transform: rotate(20deg);
  animation: scar-appear 0.5s ease-out 0.35s forwards;
}
@keyframes scar-appear {
  0%   { opacity: 0; }
  40%  { opacity: 1; }
  100% { opacity: 0.5; }
}

.melee-sparks {
  position: absolute;
  width: 3px; height: 3px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 4px #fbbf24, 0 0 8px rgba(251,191,36,0.5);
  top: calc(20% + var(--si) * 10%);
  left: calc(15% + var(--si) * 12%);
  opacity: 0;
  animation: spark-fly 0.4s ease-out forwards;
  animation-delay: calc(0.05s + var(--si) * 0.04s);
}
@keyframes spark-fly {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.5); }
  20%  { opacity: 1; transform: translate(calc((var(--si) - 3) * 8px), calc(-10px - var(--si) * 5px)) scale(1.5); }
  100% { opacity: 0; transform: translate(calc((var(--si) - 3) * 15px), calc(-25px - var(--si) * 8px)) scale(0); }
}

.melee-blood-splat {
  position: absolute;
  inset: 0;
  border-radius: 5px;
  background: radial-gradient(ellipse at 40% 45%, rgba(180,20,20,0.35) 0%, transparent 50%);
  opacity: 0;
  animation: blood-flash 0.6s ease-out 0.1s forwards;
}
@keyframes blood-flash {
  0%   { opacity: 0; }
  25%  { opacity: 1; }
  100% { opacity: 0; }
}

/* ===== ELEMENTAL: realistic fire wrapping around card ===== */
.fire-engulf {
  position: absolute;
  inset: -8px;
  border-radius: 12px;
  background:
    radial-gradient(ellipse 120% 60% at 50% 100%, rgba(251,146,60,0.7) 0%, rgba(239,68,68,0.4) 30%, transparent 55%),
    radial-gradient(ellipse 80% 40% at 50% 0%, rgba(239,68,68,0.3) 0%, transparent 50%),
    radial-gradient(ellipse 40% 80% at 0% 50%, rgba(251,146,60,0.2) 0%, transparent 50%),
    radial-gradient(ellipse 40% 80% at 100% 50%, rgba(251,146,60,0.2) 0%, transparent 50%);
  animation: fire-engulf-pulse 1.2s ease-out forwards;
}
@keyframes fire-engulf-pulse {
  0%   { opacity: 0; }
  10%  { opacity: 0.6; }
  30%  { opacity: 1; }
  70%  { opacity: 0.8; }
  100% { opacity: 0; }
}

/* Lightweight CSS fire — 4 gradient flames, compositor-only (transform + opacity) */
.elem-flame {
  position: absolute;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  pointer-events: none;
  will-change: transform, opacity;
}
.elem-flame-1 {
  bottom: -10px; left: 15%;
  width: 30px; height: 50px;
  background: radial-gradient(ellipse at 50% 100%, rgba(255,180,0,0.9), rgba(239,68,68,0.6) 50%, transparent 100%);
  animation: elem-flicker 0.4s ease-in-out infinite alternate;
}
.elem-flame-2 {
  bottom: -8px; right: 15%;
  width: 25px; height: 42px;
  background: radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.85), rgba(251,146,60,0.5) 50%, transparent 100%);
  animation: elem-flicker 0.35s ease-in-out 0.1s infinite alternate;
}
.elem-flame-3 {
  bottom: -6px; left: 40%;
  width: 35px; height: 55px;
  background: radial-gradient(ellipse at 50% 100%, rgba(255,220,100,0.9), rgba(239,68,68,0.5) 55%, transparent 100%);
  animation: elem-flicker 0.45s ease-in-out 0.05s infinite alternate;
}
.elem-flame-4 {
  top: -8px; left: 30%;
  width: 22px; height: 28px;
  border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%;
  background: radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.7), rgba(180,30,0,0.3) 60%, transparent 100%);
  animation: elem-flicker-top 0.38s ease-in-out 0.08s infinite alternate;
}
@keyframes elem-flicker {
  0%   { transform: scaleY(0.85) scaleX(0.92); opacity: 0.7; }
  100% { transform: scaleY(1.15) scaleX(1.08); opacity: 1; }
}
@keyframes elem-flicker-top {
  0%   { transform: scaleY(0.8) scaleX(0.9); opacity: 0.5; }
  100% { transform: scaleY(1.2) scaleX(1.1); opacity: 0.85; }
}

/* ===== MAGIC: rune circle + energy spiral + arcane explosion ===== */
.magic-circle {
  position: absolute;
  top: 50%; left: 50%;
  width: 70px; height: 70px;
  margin: -35px 0 0 -35px;
  border: 1.5px solid rgba(168,85,247,0.6);
  border-radius: 50%;
  opacity: 0;
  animation: magic-circle-spin 0.8s ease-out forwards;
}
@keyframes magic-circle-spin {
  0%   { opacity: 0; transform: scale(0.2) rotate(0deg); }
  20%  { opacity: 0.8; transform: scale(0.8) rotate(60deg); }
  50%  { opacity: 0.6; transform: scale(1) rotate(150deg); }
  100% { opacity: 0; transform: scale(1.3) rotate(360deg); }
}

.magic-rune {
  position: absolute;
  top: 50%; left: 50%;
  width: 8px; height: 8px;
  margin: -4px 0 0 -4px;
  font-size: 10px;
  color: #c084fc;
  text-shadow: 0 0 6px #a855f7;
  opacity: 0;
  --rune-angle: calc(var(--ri) * 60deg);
  animation: rune-orbit 0.7s ease-out forwards;
  animation-delay: calc(var(--ri) * 0.06s);
}
.magic-rune::after {
  content: '✦';
  display: block;
}
@keyframes rune-orbit {
  0%   { opacity: 0; transform: translate(0,0) scale(0); }
  25%  { opacity: 1; transform: translate(calc(cos(var(--rune-angle)) * 25px), calc(sin(var(--rune-angle)) * 25px)) scale(1.5); }
  60%  { opacity: 0.7; transform: translate(calc(cos(var(--rune-angle)) * 30px), calc(sin(var(--rune-angle)) * 30px)) rotate(180deg) scale(1); }
  100% { opacity: 0; transform: translate(calc(cos(var(--rune-angle)) * 10px), calc(sin(var(--rune-angle)) * 10px)) rotate(360deg) scale(0.3); }
}

.magic-spiral {
  position: absolute;
  top: 50%; left: 50%;
  width: 4px; height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: #e9d5ff;
  box-shadow: 0 0 12px #a855f7, 0 0 24px rgba(168,85,247,0.4), 0 0 40px rgba(139,92,246,0.2);
  opacity: 0;
  animation: spiral-pulse 0.6s ease-out forwards;
}
@keyframes spiral-pulse {
  0%   { opacity: 0; transform: scale(0); }
  30%  { opacity: 1; transform: scale(3); }
  60%  { opacity: 0.8; transform: scale(1.5); }
  80%  { opacity: 0.4; transform: scale(5); }
  100% { opacity: 0; transform: scale(8); }
}

.magic-sparkle {
  position: absolute;
  width: 3px; height: 3px;
  border-radius: 50%;
  background: #e9d5ff;
  box-shadow: 0 0 4px #c084fc, 0 0 10px rgba(168,85,247,0.6);
  top: 50%; left: 50%;
  opacity: 0;
  --angle: calc(var(--mi) * 30deg);
  animation: magic-burst 0.6s ease-out forwards;
  animation-delay: calc(var(--mi) * 0.04s);
}
@keyframes magic-burst {
  0%   { opacity: 0; transform: translate(0,0) scale(0); }
  25%  { opacity: 1; transform: translate(calc(cos(var(--angle)) * 15px), calc(sin(var(--angle)) * 15px)) scale(1.8); }
  60%  { opacity: 0.7; transform: translate(calc(cos(var(--angle)) * 35px), calc(sin(var(--angle)) * 35px)) scale(1); }
  100% { opacity: 0; transform: translate(calc(cos(var(--angle)) * 50px), calc(sin(var(--angle)) * 50px)) scale(0); }
}

.magic-ring {
  position: absolute;
  top: 50%; left: 50%;
  width: 16px; height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid rgba(168,85,247,0.7);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(168,85,247,0.4), inset 0 0 4px rgba(168,85,247,0.2);
  opacity: 0;
  animation: magic-ring-expand 0.6s ease-out forwards;
}
.magic-ring-2 {
  border-color: rgba(139,92,246,0.4);
  animation-delay: 0.15s;
}
@keyframes magic-ring-expand {
  0%   { opacity: 0; transform: scale(0.2); border-width: 3px; }
  25%  { opacity: 1; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(7); border-width: 0.5px; }
}

/* ===== RANGED: arrow with fletching + trail + impact crater ===== */
.arrow-body {
  position: absolute;
  top: 50%;
  left: -20px;
  width: 60px;
  height: 6px;
  transform: translateY(-50%);
  animation: arrow-fly-full 0.35s ease-out forwards;
}
.arrow-shaft {
  position: absolute;
  top: 50%; left: 10px; right: 12px;
  height: 2px; margin-top: -1px;
  background: linear-gradient(90deg, rgba(139,92,246,0.2), #94a3b8, #cbd5e1);
  border-radius: 1px;
}
.arrow-head {
  position: absolute;
  right: 0; top: 50%;
  width: 0; height: 0;
  margin-top: -5px;
  border-left: 10px solid #e2e8f0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  filter: drop-shadow(0 0 3px rgba(59,130,246,0.6));
}
.arrow-fletching {
  position: absolute;
  left: 0; top: 50%;
  margin-top: -4px;
  width: 12px; height: 8px;
  background: linear-gradient(90deg, #dc2626, #b91c1c);
  clip-path: polygon(0% 0%, 100% 25%, 100% 75%, 0% 100%, 30% 50%);
}
@keyframes arrow-fly-full {
  0%   { left: -40px; opacity: 0; }
  15%  { opacity: 1; }
  60%  { left: 35%; opacity: 1; }
  100% { left: 55%; opacity: 0; }
}

.arrow-trail {
  position: absolute;
  top: 50%;
  height: 1.5px;
  margin-top: -0.75px;
  width: 20px;
  background: linear-gradient(90deg, transparent, rgba(59,130,246,0.5), transparent);
  left: calc(-10px + var(--ti) * 10px);
  opacity: 0;
  animation: trail-fade 0.3s ease-out forwards;
  animation-delay: calc(var(--ti) * 0.04s);
}
@keyframes trail-fade {
  0%   { opacity: 0; transform: translateX(-10px); }
  30%  { opacity: 0.6; transform: translateX(20px); }
  100% { opacity: 0; transform: translateX(70px); }
}

.arrow-impact-crater {
  position: absolute;
  top: 50%; right: 20%;
  width: 18px; height: 18px;
  margin-top: -9px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59,130,246,0.6) 0%, rgba(96,165,250,0.3) 40%, transparent 70%);
  box-shadow: 0 0 12px rgba(59,130,246,0.4);
  opacity: 0;
  animation: crater-burst 0.5s ease-out 0.25s forwards;
}
@keyframes crater-burst {
  0%   { opacity: 0; transform: scale(0.2); }
  30%  { opacity: 1; transform: scale(1.8); }
  70%  { opacity: 0.6; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(2.5); }
}

.arrow-splinter {
  position: absolute;
  top: 50%; right: calc(18% + var(--si) * 3%);
  width: 6px; height: 1.5px;
  background: #94a3b8;
  border-radius: 1px;
  opacity: 0;
  --sp-angle: calc(var(--si) * 90deg - 135deg);
  animation: splinter-fly 0.35s ease-out 0.28s forwards;
}
@keyframes splinter-fly {
  0%   { opacity: 0; transform: translate(0,0) rotate(0deg) scale(1); }
  20%  { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(cos(var(--sp-angle)) * 20px), calc(sin(var(--sp-angle)) * 20px)) rotate(calc(var(--si) * 45deg)) scale(0.3); }
}

/* ===== DEATH FIRE — iskry/żar przy śmierci ===== */
.death-fire {
  position: absolute;
  inset: 0;
  z-index: 44;
  pointer-events: none;
  overflow: visible;
}
.fire-glow {
  position: absolute;
  inset: -4px;
  border-radius: 8px;
  background: radial-gradient(ellipse at center bottom, rgba(251,146,60,0.6) 0%, rgba(239,68,68,0.3) 40%, transparent 70%);
  animation: fire-glow-anim 0.9s ease-out forwards;
}
@keyframes fire-glow-anim {
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  60%  { opacity: 0.7; }
  100% { opacity: 0; }
}
.fire-ember {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 4px 1px rgba(251,191,36,0.7);
  bottom: 20%;
  left: calc(10% + var(--i) * 10%);
  animation: ember-rise 0.8s ease-out forwards;
  animation-delay: calc(var(--i) * 0.06s);
  opacity: 0;
}
@keyframes ember-rise {
  0%   { opacity: 0; transform: translateY(0) scale(1); }
  15%  { opacity: 1; }
  50%  { opacity: 0.8; transform: translateY(-30px) scale(0.8); }
  100% { opacity: 0; transform: translateY(-60px) scale(0); }
}

/* ===== ODPORNY FLASH — atak zadał 0 obrażeń ===== */
.immune-overlay {
  position: absolute;
  inset: 0;
  z-index: 52;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 48px;
  border-radius: 5px;
  pointer-events: none;
  background: rgba(120, 80, 20, 0.78);
  box-shadow: 0 0 0 3px #f59e0b;
  animation: immune-bg 0.35s ease-in-out infinite alternate;
}
.immune-label {
  font-size: 9px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.06em;
  text-shadow: 0 0 8px #f59e0b, 0 1px 3px rgba(0,0,0,0.9);
  background: rgba(100, 60, 10, 0.9);
  padding: 2px 5px;
  border-radius: 3px;
  line-height: 1.4;
}
@keyframes immune-bg {
  from { opacity: 0.85; }
  to   { opacity: 1; }
}
.immune-flash-enter-active {
  transition: opacity 0.15s ease;
}
.immune-flash-leave-active {
  transition: opacity 0.3s ease-out;
}
.immune-flash-enter-from {
  opacity: 0;
}
.immune-flash-leave-to {
  opacity: 0;
}

/* ===== HOMEN CURSE + ZOMBIFY ===== */
.badge-homen-curse {
  background: rgba(107, 33, 168, 0.8) !important;
  animation: homen-curse-badge 2s ease-in-out infinite;
}
@keyframes homen-curse-badge {
  0%, 100% { box-shadow: 0 0 4px rgba(168, 85, 247, 0.4); }
  50% { box-shadow: 0 0 10px rgba(168, 85, 247, 0.8); }
}

.is-homen-cursed {
  box-shadow: 0 0 6px 2px rgba(107, 33, 168, 0.3);
}

.is-zombifying {
  animation: zombify-rise 1.2s ease-out !important;
  filter: hue-rotate(180deg) saturate(0.6) brightness(0.8);
}
@keyframes zombify-rise {
  0%   { transform: translateY(40px) scale(0.5); opacity: 0; filter: hue-rotate(180deg) saturate(0.3) brightness(0.4); }
  30%  { transform: translateY(10px) scale(0.9); opacity: 0.7; }
  60%  { transform: translateY(-5px) scale(1.05); opacity: 1; filter: hue-rotate(180deg) saturate(0.6) brightness(0.8); }
  80%  { transform: translateY(2px) scale(0.98); }
  100% { transform: translateY(0) scale(1); opacity: 1; filter: none; }
}

/* Smocze Jajo pulsing counter when close to hatching */
.badge-jajo {
  transition: background 0.3s;
}

/* ===== P2: AURA_RING — persistent aura glow per card ===== */
.aura-ring-ice {
  animation: aura-ice 3s ease-in-out infinite;
}
@keyframes aura-ice {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(96,165,250,0.2), 0 0 8px 2px rgba(96,165,250,0.1); }
  50%      { box-shadow: 0 0 8px 3px rgba(96,165,250,0.5), 0 0 16px 5px rgba(96,165,250,0.15); }
}

.aura-ring-forest {
  animation: aura-forest 2.5s ease-in-out infinite;
}
@keyframes aura-forest {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(34,197,94,0.2), 0 0 8px 2px rgba(34,197,94,0.1); }
  50%      { box-shadow: 0 0 8px 3px rgba(34,197,94,0.45), 0 0 16px 5px rgba(34,197,94,0.12); }
}

.aura-ring-antimagic {
  animation: aura-antimagic 2s ease-in-out infinite;
}
@keyframes aura-antimagic {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(107,33,168,0.2), 0 0 8px 2px rgba(107,33,168,0.1); }
  50%      { box-shadow: 0 0 8px 3px rgba(107,33,168,0.5), 0 0 16px 5px rgba(107,33,168,0.15); }
}

.aura-ring-taunt {
  animation: aura-taunt 1.5s ease-in-out infinite;
}
@keyframes aura-taunt {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(239,68,68,0.2), 0 0 8px 2px rgba(239,68,68,0.1); }
  50%      { box-shadow: 0 0 8px 3px rgba(239,68,68,0.5), 0 0 16px 5px rgba(239,68,68,0.12); }
}

.aura-ring-blood {
  animation: aura-blood 2s ease-in-out infinite;
}
@keyframes aura-blood {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(185,28,28,0.25), 0 0 8px 2px rgba(185,28,28,0.1); }
  50%      { box-shadow: 0 0 10px 4px rgba(185,28,28,0.5), 0 0 20px 6px rgba(185,28,28,0.15); }
}

.aura-ring-dark {
  animation: aura-dark 2.5s ease-in-out infinite;
}
@keyframes aura-dark {
  0%, 100% { box-shadow: 0 0 5px 2px rgba(30,0,50,0.3), 0 0 10px 3px rgba(107,33,168,0.15); }
  50%      { box-shadow: 0 0 10px 4px rgba(30,0,50,0.5), 0 0 20px 6px rgba(107,33,168,0.25); }
}

/* ===== P2: CONVERSION — card being taken over ===== */
.is-converting {
  animation: converting-pulse 0.8s ease-in-out;
}
@keyframes converting-pulse {
  0%   { box-shadow: none; filter: none; }
  30%  { box-shadow: 0 0 20px 8px rgba(168,85,247,0.7); filter: brightness(1.3); }
  70%  { box-shadow: 0 0 15px 5px rgba(168,85,247,0.4); filter: brightness(1.1); }
  100% { box-shadow: none; filter: none; }
}

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
    backdrop-filter: blur(4px);
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
    0%, 100% { box-shadow: 0 0 8px rgba(200, 168, 78, 0.5); }
    50% { box-shadow: 0 0 14px rgba(200, 168, 78, 0.8); }
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

  /* Shield overlay */
  .shield-overlay { font-size: 18px; }
  .shield-label { font-size: 5px; }

  /* State overlays */
  .state-overlay { font-size: 10px; }
  .state-overlay-icon { font-size: 16px; }
  .state-overlay-label { font-size: 5px; }
}
</style>
