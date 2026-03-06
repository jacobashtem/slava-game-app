/**
 * KSIĘGA PRECEDENSÓW
 *
 * Gdy dwa efekty kolidują, ta tabela rozstrzyga który wygrywa.
 * Każdy precedens ma:
 * - id: unikalny identyfikator reguły
 * - conflictingEffects: effectId które mogą kolidować
 * - resolution: który wygrywa
 * - reasoning: wyjaśnienie po polsku
 *
 * Zasada generalna (gdy brak wpisu):
 *   Odporność > Zapobieganie > Modyfikator aktywny > Modyfikator pasywny
 */

import type { PrecedentRule } from './types'

export const PRECEDENT_BOOK: PrecedentRule[] = [
  // ===== ODPORNOŚCI =====
  {
    id: 'P001',
    conflictingEffects: ['immunity_buffs', 'buff_negate'],
    resolution: 'IMMUNITY_WINS',
    reasoning: 'Odporność na premie jest permanentna. Negacja premii to akcja jednorazowa. Stan > akcja.',
  },
  {
    id: 'P002',
    conflictingEffects: ['immunity_debuffs', 'any_debuff'],
    resolution: 'IMMUNITY_WINS',
    reasoning: 'Karta z odpornością na negatywne efekty jest nieczuła na wszelkie debuffy, bez wyjątku.',
  },
  {
    id: 'P003',
    conflictingEffects: ['immunity_all', 'any_effect'],
    resolution: 'IMMUNITY_WINS',
    reasoning: 'Pełna odporność blokuje wszystkie efekty, włącznie z sojuszniczymi buffami.',
  },

  // ===== ATAKI I KONTRATAK =====
  {
    id: 'P004',
    conflictingEffects: ['cannot_attack', 'forced_attack'],
    resolution: 'IMMUNITY_WINS', // "cannot_attack" traktujemy jako PREVENTION
    reasoning: 'Zakaz ataku (np. Biali Ludzie) ma wyższy priorytet niż przymus ataku. Paraliż > przymus.',
  },
  {
    id: 'P005',
    conflictingEffects: ['no_counterattack', 'counterattack_always'],
    resolution: 'FIRST_WINS',
    reasoning: 'Topór Peruna (brak kontrataku) vs Król Wężów (kontratak zawsze): wygrywa efekt na atakującym. Mechanika ataku jest aktywna, mechanika obrony jest pasywna.',
  },
  {
    id: 'P006',
    conflictingEffects: ['double_damage', 'damage_prevention'],
    resolution: 'PREVENTION_WINS',
    reasoning: 'Tarcza/prewencja obrażeń (np. Brzegina) blokuje obrażenia zanim zostaną zastosowane, nawet podwójne.',
  },

  // ===== ŚMIERĆ I WSKRZESZENIE =====
  {
    id: 'P007',
    conflictingEffects: ['death_trigger', 'resurrection_immediate'],
    resolution: 'SECOND_WINS',
    reasoning: 'Efekty śmierci odpalają się PRZED wskrzeszeniem. Kolejność: ON_DEATH triggers → remove from field → resurrect.',
  },
  {
    id: 'P008',
    conflictingEffects: ['dziewiatko_kill', 'immunity_death'],
    resolution: 'IMMUNITY_WINS',
    reasoning: 'Dziewiątko wymaga zapłaty lub śmierć. Jeśli cel ma odporność na śmierć, efekt Dziewiątka jest bezskuteczny.',
  },

  // ===== ZMIANA STRON / PRZEJĘCIE =====
  {
    id: 'P009',
    conflictingEffects: ['convert_enemy', 'cannot_be_converted'],
    resolution: 'IMMUNITY_WINS',
    reasoning: 'Niektóre istoty mają pasywną odporność na przejęcie (silne boss-like karty). Odporność > konwersja.',
  },
  {
    id: 'P010',
    conflictingEffects: ['wila_convert', 'homen_convert'],
    resolution: 'FIRST_WINS',
    reasoning: 'Gdy dwie karty jednocześnie chcą przejąć tę samą istotę: wygrywa ta która zagrała akcję jako pierwsza w tej turze.',
  },

  // ===== MODYFIKATORY STATYSTYK =====
  {
    id: 'P011',
    conflictingEffects: ['stat_swap', 'stat_lock'],
    resolution: 'FIRST_WINS',
    reasoning: 'Obłęd (swap ATK/DEF) vs Blokada statystyk: wygrywa efekt który był nałożony wcześniej.',
  },
  {
    id: 'P012',
    conflictingEffects: ['halve_stats', 'double_stats'],
    resolution: 'ACTIVE_WINS',
    reasoning: 'Okaleczenie (halve) vs podwojenie statystyk: wygrywa efekt aktywowany przez gracza, nie pasywny.',
  },
  {
    id: 'P013',
    conflictingEffects: ['likatropia_stats_gain', 'stat_cap'],
    resolution: 'PASSIVE_WINS',
    reasoning: 'Likantropowi obowiązuje limit statystyk jeśli taki istnieje (cap jest pasywną regułą pola).',
  },

  // ===== LINIA WALKI =====
  {
    id: 'P014',
    conflictingEffects: ['chmurnik_ground_flying', 'fly_immunity'],
    resolution: 'FIRST_WINS',
    reasoning: 'Chmurnik uziemia latające. Jeśli latająca istota ma odporność na uziemienie: odporność > uziemienie.',
  },
  {
    id: 'P015',
    conflictingEffects: ['arkona_no_field_limit', 'field_limit_effect'],
    resolution: 'ACTIVE_WINS',
    reasoning: 'Lokacja Arkona (brak limitu pola) ma wyższy priorytet niż efekty ograniczające liczbę istot.',
  },

  // ===== KARTY PRZYGODY =====
  {
    id: 'P016',
    conflictingEffects: ['zlot_czarownic_block', 'adventure_immunity'],
    resolution: 'FIRST_WINS',
    reasoning: 'Zlot Czarownic blokuje 3 kolejne karty przygody rywala. Jeśli rywal ma odporność na blokadę kart, Zlot nie działa na niego.',
  },
  {
    id: 'P017',
    conflictingEffects: ['matecznik_hide', 'forced_combat'],
    resolution: 'IMMUNITY_WINS',
    reasoning: 'Istota w Mateczniku jest całkowicie chroniona. Żaden efekt nie może jej zmusić do walki gdy jest ukryta.',
  },
]

/**
 * Szuka reguły dla pary efektów.
 * Zwraca null jeśli brak specyficznego precedensu — stosowana jest ogólna zasada priorytetów.
 */
export function findPrecedent(effectIdA: string, effectIdB: string): PrecedentRule | null {
  return PRECEDENT_BOOK.find(rule =>
    rule.conflictingEffects.includes(effectIdA) &&
    rule.conflictingEffects.includes(effectIdB)
  ) ?? null
}

/**
 * Ogólna zasada priorytetu gdy brak specyficznego precedensu:
 * Odporność > Zapobieganie > Aktywny modyfikator > Pasywny modyfikator
 */
export function getDefaultResolutionOrder(): string {
  return 'IMMUNITY > PREVENTION > ACTIVE_MODIFIER > PASSIVE_MODIFIER > REACTION > CLEANUP'
}
