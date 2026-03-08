/**
 * DeckBuilder — buduje talie, tasuje, dobiera karty.
 */

import type { CardInstance, PlayerState } from './types'
import type { CardFactory } from './CardFactory'
import { createCreatureInstance, createAdventureInstance } from './CardFactory'
import type { PlayerSide } from './types'
import { GOLD_EDITION_RULES } from './constants'

// Fisher-Yates shuffle (in-place)
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export interface DeckConfig {
  deckSize: number
  creatureRatio: number  // 0–1: jaki % talii to istoty (reszta = przygody)
  domainFilter?: number[]  // idDomain do użycia; undefined = wszystkie
}

export const GOLD_EDITION_DECK_CONFIG: DeckConfig = {
  deckSize: GOLD_EDITION_RULES.DECK_SIZE,
  creatureRatio: 0.7,  // 70% istoty, 30% przygody
}

/**
 * Efekty istot z pełną implementacją (talia Alpha).
 * Aktualizuj tę listę po przetestowaniu każdej karty w Arenie.
 */
export const ALPHA_CREATURE_EFFECT_IDS = new Set([
  // === PERUN ===
  'aitwar_steal_hand',
  'alkonost_redirect_counterattack',
  'biali_ludzie_wound_disarm',
  'brzegina_shield_for_gold',
  'bugaj_def_to_atk',
  'blotnik_taunt',
  'chmurnik_ground_flying',
  'chowaniec_intercept',
  'dobroochoczy_no_counter',
  'dziewiatko_deathmark',
  'dziki_mysliwy_return_on_kill',
  'gryf_double_dmg_on_play_turn',
  'krol_wezow_always_counter',
  'leszy_post_attack_defend',
  'matoha_anti_magic',
  'mroz_immunity_buffs',
  'rodzanice_scry',
  'rusalka_mirror_attack',
  'rybi_krol_pierce_immunity',
  'strela_flash_counter',
  'szalinc_negate_immunity',
  'wila_convert_weak_enemies',
  'wodnik_return_on_round_end',
  // === ŻYWI ===
  'guslarka_bonus_vs_demon',
  'starszyzna_scry_deck',
  'tur_ranged_magic_immune',
  'lucznik_pin',
  'zupan_no_field_limit',
  'zerca_spell_shield',
  'zerca_welesa_demon_buff',
  'szeptunka_damage_reduction',
  'jedza_remove_buff',
  'wolch_heal',
  'swietle_reveal_card',
  'siemiargl_cleanse',
  'zmije_glory_on_empty_field',
  'chlop_extra_attack',
  'junak_double_hit_kill',
  'lesnica_double_attack',
  'swiatogor_line_cleave',
  // === NIEUMARLI ===
  'jaroszek_paralyze',
  'poludnica_kill_weakest',
  'latawica_drain_ally',
  'polnocnica_mass_paralyze',
  'tesknica_block_enhance',
  'strzyga_lifesteal',
  'stukacz_strong_immune',
  'utopiec_half_damage',
  'wilkolak_melee_immune',
  'wisielec_bounce_both',
  'wapierz_invincible_hunger',
  'zmora_grow_sacrifice',
  'zagorkinia_curse_drain',
  'dziad_reveal_all',
  'wieszczy_spy_burn',
  'bagiennik_cleanse_buff',
  'cmentarna_baba_resurrect',
  'grad_magic_element_only',
  'mavka_line_shield',
  'bledny_ognik_bounce',
  'kikimora_free_attack',
  'morowa_dziewica_aoe_all',
  // === WELES ===
  'baba_jaga_death_growth',
  'bazyliszek_paralyze',
  'bogunka_instant_kill_human',
  'czart_shift_stats',
  'darmopych_friendly_fire',
  'mara_sacrifice_takeover',
  'przyloznik_heal_on_zyvi_kill',
  'szatopierz_discard_for_gold',
  'wietrzyca_rearrange_enemy',
  'bezkost_atk_drain',
  'bies_reverse_damage',
  'buka_force_defense',
  'chasnik_gold_on_kill',
  'cicha_kill_weak',
  'cmuch_no_counter_received',
  'czarnoksieznik_steal_abilities',
  'domowik_hand_size',
  'dydko_strong_immune',
  'dzicy_ludzie_steal_killed',
  'dziwolzona_swap_cards',
  'homen_convert_on_death',
  'kania_chain_kill',
  'konny_cleave',
  'kudlak_conditional_immunity',
  'lamia_death_reward',
  'latawiec_mutual_death',
  'licho_block_draw',
  'waz_tugaryn_cleave',
  'zar_ptak_death_explosion',
  // === Batch 3 — Żywi/Nieumarli ===
  'woj_mass_deploy',
  'znachor_absorb',
  'polewik_buff_neighbors',
  'kosciej_melee_resurrection',
  'azdacha_vanilia',
  // === Batch 4 — Żywi/Weles ===
  'baba_bonus_vs_type',
  'gorynych_merge_dragons',
  'smierc_death_growth_save',
  'bieda_spy_block_draw',
  // === Batch 5 — różne domeny ===
  'smocze_jajo_hatch',
  'belt_rearrange',
  'julki_adventure_immunity',
  'kresnik_choose_buff',
  'niedzwiedzioak_guardian',
  'wielkolud_choose_counter',
  'inkluz_steal_buff',
  // === Batch 6 ===
  'liczyrzepa_choose_type',
  'wij_revive_once',
  'poroniec_copy_ability',
  'bzionek_spell_intercept',
  // === Batch 7 ===
  'czarownica_redirect_spell',
  'naczelnik_human_rally',
  'rumak_mount',
])

export const ALPHA_ADVENTURE_EFFECT_IDS = new Set([
  'adventure_moc_swiatogora',
  'adventure_arena',
  'adventure_obled',
  'adventure_topor_peruna',
  'adventure_trucizna',
  'adventure_laska_welesa',
  'adventure_bitwa_nad_tollense',
  // === Batch 8 — Karty przygód ===
  'adventure_okaleczenie',
  'adventure_wygnanie',
  'adventure_rusalczy_taniec',
  'adventure_kwiat_paproci',
  'adventure_sobowtór',
  'adventure_kradzież',
  'adventure_arkona',
  'adventure_twierdza',
  'adventure_rehtra',
  'adventure_zlot_czarownic',
  'adventure_likantropia',
  'adventure_mlot_swaroga',
  'adventure_sztandar',
  'adventure_miecz_kladenet',
  // === Batch 9 ===
  'adventure_matecznik',
  'adventure_przyjazn',
])

/**
 * Buduje talię Alpha — tylko karty z zaimplementowanymi efektami.
 * Używana w trybie "Alpha Gra" zamiast buildRandomDeck.
 */
export function buildAlphaDeck(
  factory: CardFactory,
  owner: PlayerSide,
  config: DeckConfig = GOLD_EDITION_DECK_CONFIG
): CardInstance[] {
  const creatureCount = Math.round(config.deckSize * config.creatureRatio)
  const adventureCount = config.deckSize - creatureCount

  const alphaCreatures = factory.getAllCreatures()
    .filter(c => ALPHA_CREATURE_EFFECT_IDS.has(c.effectId))
  const alphaAdventures = factory.getAllAdventures()
    .filter(a => ALPHA_ADVENTURE_EFFECT_IDS.has(a.effectId))

  const deck: CardInstance[] = []

  const shuffledCreatures = shuffle([...alphaCreatures])
  const shuffledAdventures = shuffle([...alphaAdventures])

  for (let i = 0; i < creatureCount; i++) {
    if (shuffledCreatures.length === 0) break
    const cardData = shuffledCreatures[i % shuffledCreatures.length]
    deck.push(createCreatureInstance(cardData, owner))
  }

  for (let i = 0; i < adventureCount; i++) {
    if (shuffledAdventures.length === 0) break
    const cardData = shuffledAdventures[i % shuffledAdventures.length]
    deck.push(createAdventureInstance(cardData, owner))
  }

  return shuffle(deck)
}

/**
 * Buduje losową talię Gold Edition.
 * Pobiera losowe istoty i przygody z dostępnej puli.
 */
export function buildRandomDeck(
  factory: CardFactory,
  owner: PlayerSide,
  config: DeckConfig = GOLD_EDITION_DECK_CONFIG
): CardInstance[] {
  const creatureCount = Math.round(config.deckSize * config.creatureRatio)
  const adventureCount = config.deckSize - creatureCount

  const allCreatures = factory.getAllCreatures()
  const allAdventures = factory.getAllAdventures()

  // Filtruj po domenie jeśli podano
  const availableCreatures = config.domainFilter
    ? allCreatures.filter(c => config.domainFilter!.includes(c.domain))
    : allCreatures

  const availableAdventures = allAdventures

  // Losuj karty (z powtórzeniami jeśli pula jest mniejsza niż potrzeba)
  const deck: CardInstance[] = []

  const shuffledCreatures = shuffle([...availableCreatures])
  const shuffledAdventures = shuffle([...availableAdventures])

  for (let i = 0; i < creatureCount; i++) {
    const cardData = shuffledCreatures[i % shuffledCreatures.length]
    deck.push(createCreatureInstance(cardData, owner))
  }

  for (let i = 0; i < adventureCount; i++) {
    const cardData = shuffledAdventures[i % shuffledAdventures.length]
    deck.push(createAdventureInstance(cardData, owner))
  }

  return shuffle(deck)
}

/**
 * Dobiera `count` kart z talii do ręki.
 * Zwraca faktycznie dobrane karty (może być mniej jeśli talia pusta).
 */
export function drawCards(player: PlayerState, count: number): CardInstance[] {
  const drawn: CardInstance[] = []
  for (let i = 0; i < count; i++) {
    if (player.deck.length === 0) break
    const card = player.deck.shift()!
    card.isRevealed = false  // karty dobrane są zakryte dla przeciwnika
    player.hand.push(card)
    drawn.push(card)
  }
  return drawn
}

/**
 * Dobiera kartę na rękę respektując limit ręki.
 */
export function drawCard(player: PlayerState): CardInstance | null {
  if (player.deck.length === 0) return null
  if (player.hand.length >= player.handLimit) return null

  const card = player.deck.shift()!
  card.isRevealed = false
  player.hand.push(card)
  return card
}

/**
 * Odrzuca kartę z ręki na cmentarz.
 */
export function discardFromHand(player: PlayerState, instanceId: string): CardInstance | null {
  const idx = player.hand.findIndex(c => c.instanceId === instanceId)
  if (idx === -1) return null

  const [card] = player.hand.splice(idx, 1)
  card.line = null
  player.graveyard.push(card)
  return card
}

/**
 * Wkłada kartę na spód talii (np. efekt Streli).
 */
export function putOnBottomOfDeck(player: PlayerState, card: CardInstance): void {
  card.line = null
  card.isRevealed = false
  player.deck.push(card)
}

/**
 * Wkłada kartę na wierzch talii.
 */
export function putOnTopOfDeck(player: PlayerState, card: CardInstance): void {
  card.line = null
  card.isRevealed = false
  player.deck.unshift(card)
}

/**
 * Tasuje cmentarz z powrotem do talii (np. po wyczerpaniu).
 */
export function reshuffleGraveyard(player: PlayerState): void {
  player.deck.push(...player.graveyard)
  player.graveyard = []
  shuffle(player.deck)
}
