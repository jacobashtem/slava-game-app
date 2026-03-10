/**
 * Card Indicator Registry — SINGLE SOURCE OF TRUTH for all card visual indicators.
 *
 * Every glow, aura, overlay, border-color, and status effect on cards is defined HERE.
 * Components consume this registry; they do NOT define visual styles themselves.
 *
 * Categories:
 *   1. STATE    — game state indicators (taunt, hidden, death mark, invincible)
 *   2. THREAT   — danger warnings (Południca, Cicha)
 *   3. STATUS   — applied debuffs (paralysis, disease, curse, silence)
 *   4. ABILITY  — creature type auras (lifesteal, death feeder, AoE)
 *   5. AURA     — persistent aura rings (ice, forest, antimagic, taunt, blood, dark)
 *   6. ARTIFACT — equipped artifact glow
 *
 * Future: VFXOrchestrator will use these definitions to render effects on TresJS canvas.
 * For now this is a data-only registry — visual implementation comes via VFXOverlay.
 */

export type IndicatorCategory = 'state' | 'threat' | 'status' | 'ability' | 'aura' | 'artifact'

export interface CardIndicator {
  /** Unique indicator ID */
  id: string
  /** Human-readable name (Polish) */
  name: string
  /** Category for grouping */
  category: IndicatorCategory
  /** Short description for UI/tooltip */
  description: string
  /** Intended color (for future VFX rendering) */
  color: string
  /** Secondary color (for gradients/glows) */
  colorSecondary?: string
  /** Effect ID(s) from EffectRegistry that trigger this indicator */
  effectIds?: string[]
  /** Metadata key on CardInstance that triggers this indicator */
  metadataKey?: string
  /** Whether this is a negative/warning indicator */
  isNegative?: boolean
}

// ===== STATE INDICATORS — game state flags =====
export const STATE_INDICATORS: CardIndicator[] = [
  {
    id: 'taunt',
    name: 'Prowokacja',
    category: 'state',
    description: 'Wymusza ataki na tę istotę (Błotnik).',
    color: '#ef4444',
    effectIds: ['blotnik_taunt'],
  },
  {
    id: 'matecznik',
    name: 'Ukryty (Matecznik)',
    category: 'state',
    description: 'Istota ukryta w Mateczniku — nieatakowana dopóki inne żyją.',
    color: '#22c55e',
    metadataKey: 'matecznikHidden',
  },
  {
    id: 'death-mark',
    name: 'Znak Śmierci',
    category: 'state',
    description: 'Dziewiątko: istota zginie na początku następnej rundy.',
    color: '#dc2626',
    isNegative: true,
    metadataKey: 'dziewiatkoDeathMark',
  },
  {
    id: 'invincible',
    name: 'Nietykalny',
    category: 'state',
    description: 'Wapiersz: odporny na obrażenia (ale traci 1 DEF/turę z głodu).',
    color: '#eab308',
    effectIds: ['wapierz_invincible_hunger'],
  },
  {
    id: 'wij-revived',
    name: 'Ostatnia tura Wija',
    category: 'state',
    description: 'Wij wskrzeszony — żyje jeszcze jedną turę.',
    color: '#60a5fa',
    metadataKey: 'wijRevived',
  },
  {
    id: 'homen-cursed',
    name: 'Klątwa Homena',
    category: 'state',
    description: 'Po śmierci wstanie jako Homen (zombie) po stronie Homena.',
    color: '#a855f7',
    isNegative: true,
    metadataKey: 'homenCurseOwner',
  },
]

// ===== THREAT INDICATORS — danger warnings =====
export const THREAT_INDICATORS: CardIndicator[] = [
  {
    id: 'threatened-cicha',
    name: 'Zagrożony (Cicha)',
    category: 'threat',
    description: 'ATK ≤ 2 — Cicha zabije tę istotę na koniec rundy.',
    color: '#ef4444',
    isNegative: true,
    effectIds: ['cicha_kill_weak'],
  },
  {
    id: 'threatened-poludnica',
    name: 'Cel Południcy',
    category: 'threat',
    description: 'Najsłabsza istota — Południca zabije ją na koniec rundy.',
    color: '#ef4444',
    isNegative: true,
    effectIds: ['poludnica_kill_weakest'],
  },
]

// ===== STATUS INDICATORS — applied debuffs =====
export const STATUS_INDICATORS: CardIndicator[] = [
  {
    id: 'paralyzed',
    name: 'Paraliż',
    category: 'status',
    description: 'Istota sparaliżowana — pomija turę.',
    color: '#94a3b8',
    isNegative: true,
  },
  {
    id: 'diseased',
    name: 'Choroba',
    category: 'status',
    description: 'Istota nie może atakować.',
    color: '#22c55e',
    isNegative: true,
  },
  {
    id: 'cursed',
    name: 'Klątwa Żagorkini',
    category: 'status',
    description: 'Przeklęty — traci 1 ATK/DEF co turę.',
    color: '#a855f7',
    isNegative: true,
    metadataKey: 'zagorkiniaCursed',
  },
  {
    id: 'silenced',
    name: 'Wyciszony',
    category: 'status',
    description: 'Istota nie może używać zdolności.',
    color: '#64748b',
    isNegative: true,
  },
  {
    id: 'poisoned',
    name: 'Trucizna',
    category: 'status',
    description: 'Istota zostanie zabita po X rundach.',
    color: '#84cc16',
    isNegative: true,
  },
]

// ===== ABILITY INDICATORS — creature type auras =====
export const ABILITY_INDICATORS: CardIndicator[] = [
  {
    id: 'lifestealer',
    name: 'Kradzież życia',
    category: 'ability',
    description: 'Leczy się za zadane obrażenia (Strzyga, Bezkost, Latawica).',
    color: '#ef4444',
    colorSecondary: '#b91c1c',
    effectIds: ['strzyga_lifesteal', 'bezkost_atk_drain', 'latawica_drain_ally'],
  },
  {
    id: 'death-feeder',
    name: 'Żywiciel śmierci',
    category: 'ability',
    description: 'Rośnie w siłę gdy giną inne istoty (Baba Jaga, Śmierć).',
    color: '#a855f7',
    colorSecondary: '#6b21a8',
    effectIds: ['baba_jaga_death_growth', 'smierc_death_growth_save'],
  },
  {
    id: 'aoe-aura',
    name: 'Atak obszarowy',
    category: 'ability',
    description: 'Zabija istoty spełniające warunek (Morowa Dziewica, Cicha, Południca).',
    color: '#dc2626',
    colorSecondary: '#991b1b',
    effectIds: ['morowa_dziewica_aoe_all', 'cicha_kill_weak', 'poludnica_kill_weakest'],
  },
]

// ===== AURA INDICATORS — persistent aura rings =====
export const AURA_INDICATORS: CardIndicator[] = [
  {
    id: 'aura-ice',
    name: 'Aura Lodu',
    category: 'aura',
    description: 'Mróz: immunitet i buffy dla sojuszników.',
    color: '#60a5fa',
    colorSecondary: '#3b82f6',
    effectIds: ['mroz_immunity_buffs'],
  },
  {
    id: 'aura-forest',
    name: 'Aura Lasu',
    category: 'aura',
    description: 'Leszy: po ataku wraca do obrony.',
    color: '#22c55e',
    colorSecondary: '#16a34a',
    effectIds: ['leszy_post_attack_defend'],
  },
  {
    id: 'aura-antimagic',
    name: 'Aura Antymagii',
    category: 'aura',
    description: 'Matoha: blokuje ataki magiczne na sojuszników.',
    color: '#a855f7',
    colorSecondary: '#7c3aed',
    effectIds: ['matoha_anti_magic'],
  },
  {
    id: 'aura-taunt',
    name: 'Aura Prowokacji',
    category: 'aura',
    description: 'Błotnik: wymusza ataki na siebie.',
    color: '#ef4444',
    colorSecondary: '#dc2626',
    effectIds: ['blotnik_taunt'],
  },
  {
    id: 'aura-blood',
    name: 'Aura Krwi',
    category: 'aura',
    description: 'Kudłak: nietykalny ale traci HP z głodu.',
    color: '#b91c1c',
    colorSecondary: '#7f1d1d',
    effectIds: ['kudlak_invincible_hunger'],
  },
  {
    id: 'aura-dark',
    name: 'Aura Mroku',
    category: 'aura',
    description: 'Wapiersz: nietykalny ale traci HP z głodu.',
    color: '#6b21a8',
    colorSecondary: '#4c1d95',
    effectIds: ['wapierz_invincible_hunger'],
  },
]

// ===== INTERACTION INDICATORS — UI targeting/placement guides =====
export const INTERACTION_INDICATORS: CardIndicator[] = [
  {
    id: 'valid-target',
    name: 'Cel ataku',
    category: 'state',
    description: 'Podświetlenie: ta istota jest poprawnym celem ataku.',
    color: '#ef4444',
  },
  {
    id: 'slot-active',
    name: 'Aktywny slot',
    category: 'state',
    description: 'Złoty puls: możesz umieścić kartę w tym slocie.',
    color: '#c8a84e',
  },
  {
    id: 'selected',
    name: 'Zaznaczona karta',
    category: 'state',
    description: 'Karta wybrana przez gracza (biała obwódka).',
    color: '#ffffff',
  },
]

// ===== ALL INDICATORS — combined for easy iteration =====
export const ALL_INDICATORS: CardIndicator[] = [
  ...STATE_INDICATORS,
  ...THREAT_INDICATORS,
  ...STATUS_INDICATORS,
  ...ABILITY_INDICATORS,
  ...AURA_INDICATORS,
  ...INTERACTION_INDICATORS,
]

/** Lookup indicator by ID */
export function getIndicator(id: string): CardIndicator | undefined {
  return ALL_INDICATORS.find(i => i.id === id)
}

/** Get all indicators for a given category */
export function getIndicatorsByCategory(category: IndicatorCategory): CardIndicator[] {
  return ALL_INDICATORS.filter(i => i.category === category)
}
