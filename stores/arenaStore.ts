/**
 * arenaStore — plac testowy dla pojedynczych kart.
 * Każda karta ma dedykowany scenariusz z odpowiednimi wrogami i sojusznikami.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreatureCardData, AdventureCardData } from '../game-engine/types'
import { GamePhase, BattleLine } from '../game-engine/constants'
import {
  CardFactory,
  createCreatureInstance,
  createAdventureInstance,
} from '../game-engine/CardFactory'
import { createInitialGameState } from '../game-engine/GameStateUtils'
import { ALPHA_CREATURE_EFFECT_IDS } from '../game-engine/DeckBuilder'
import { useGameStore } from './gameStore'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

const _factory = new CardFactory()
_factory.loadCreatures(istotypData as any)
_factory.loadAdventures(przygodyData as any)

export interface ArenaCardEntry {
  id: number
  name: string
  cardType: 'creature' | 'adventure'
  effectId: string
  effectDescription: string
  data: CreatureCardData | AdventureCardData
}

// ===== SCENARIUSZ CONFIG =====
interface ScenarioConfig {
  hint: string
  /** effectIds wrogów w L1 AI */
  aiL1?: string[]
  /** effectIds wrogów w L2 AI */
  aiL2?: string[]
  /** effectIds wrogów w L3 AI */
  aiL3?: string[]
  /** effectIds sojuszników gracza w L1 */
  allyL1?: string[]
  /** effectIds sojuszników gracza w L2 */
  allyL2?: string[]
  /** extra karty do ręki gracza */
  handExtras?: string[]
  /** effectIds do cmentarza gracza (wskrzeszenia) */
  playerGraveyard?: string[]
}

const SCENARIO_MAP: Record<string, ScenarioConfig> = {
  // ===== PERUN =====
  'aitwar_steal_hand': {
    hint: 'Aitwar przy wejściu kradnie kartę z ręki AI. ⚡ = ponowna kradzież za 1 PS (raz na grę). AI ma pełną rękę.',
  },
  'alkonost_redirect_counterattack': {
    hint: 'Alkonost: gdy wróg kontratakuje sojusznika, Alkonost przejmuje kontratak na siebie.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'biali_ludzie_wound_disarm': {
    hint: 'Biali Ludzie: atak rani i rozbrajia cel (nie może atakować przez rundę). Zaatakuj wroga.',
  },
  'brzegina_shield_for_gold': {
    hint: 'Brzegina: gdy sojusznik traci HP, możesz zapłacić 1 PS by zablokować obrażenia.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'bugaj_def_to_atk': {
    hint: 'Bugaj: gdy otrzyma obrażenia, traci DEF ale zyskuje tyle samo ATK. Postaw go jako cel.',
    allyL1: ['bugaj_def_to_atk', 'dobroochoczy_no_counter'],
  },
  'blotnik_taunt': {
    hint: 'Błotnik: wszystkie wrogie ataki MUSZĄ celować w Błotnika (Taunt). Postaw go obok sojuszników.',
    allyL1: ['blotnik_taunt', 'dobroochoczy_no_counter'],
  },
  'chmurnik_ground_flying': {
    hint: 'Chmurnik: przy wejściu usadza WSZYSTKIE latające wrogie istoty. AI ma same latające!',
    aiL1: ['gryf_double_dmg_on_play_turn'],
    aiL2: ['zar_ptak_death_explosion'],
    aiL3: ['blotnik_taunt'],
  },
  'chowaniec_intercept': {
    hint: 'Chowaniec: gdy wróg atakuje sojusznika, Chowaniec może zastąpić go jako cel (darmowo).',
    allyL1: ['chowaniec_intercept', 'dobroochoczy_no_counter'],
  },
  'dobroochoczy_no_counter': {
    hint: 'Dobroochoczy: nigdy nie kontratakuje. Zaatakuj nim wroga — zero odpowiedzi.',
    allyL1: ['dobroochoczy_no_counter'],
  },
  'dziewiatko_deathmark': {
    hint: 'Dziewiątko: gdy cel osiągnie DEF ≤ 3 po ataku, przeciwnik musi zapłacić 1 PS lub karta ginie. Wróg L1 ma 2 HP.',
    aiL1: ['licho_block_draw'],
    aiL2: ['bazyliszek_paralyze'],
    aiL3: ['gryf_double_dmg_on_play_turn'],
  },
  'dziki_mysliwy_return_on_kill': {
    hint: 'Dziki Myśliwy: po zabiciu może wrócić na wierzch talii zachowując efekty. Zlikwiduj słabego wroga.',
    aiL1: ['licho_block_draw'],
    aiL2: ['domowik_hand_size'],
    aiL3: ['gryf_double_dmg_on_play_turn'],
  },
  'gryf_double_dmg_on_play_turn': {
    hint: 'Gryf: w turze wystawienia zadaje PODWÓJNE obrażenia! Wystaw i natychmiast atakuj.',
  },
  'krol_wezow_always_counter': {
    hint: 'Król Wężów: nawet w pozycji OBRONY zawsze kontratakuje atakującego. Postaw w obronie.',
    allyL1: ['krol_wezow_always_counter'],
  },
  'leszy_post_attack_defend': {
    hint: 'Leszy: po każdym ataku automatycznie przechodzi do pozycji obrony. Zaatakuj nim.',
    allyL1: ['leszy_post_attack_defend'],
  },
  'matoha_anti_magic': {
    hint: 'Matoha: blokuje WSZYSTKIE ataki Magii (typ 2) na Twoją stronę. AI ma magów!',
    aiL1: ['rusalka_mirror_attack'],
    aiL2: ['czarnoksieznik_steal_abilities'],
    aiL3: ['gryf_double_dmg_on_play_turn'],
    allyL1: ['dobroochoczy_no_counter'],
  },
  'mroz_immunity_buffs': {
    hint: 'Mróz: odporny na wszystkie aktywne buffy. Testuj interakcję z efektami.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'rodzanice_scry': {
    hint: 'Rodzanice: raz na turę przenosi artefakt/efekt między sojusznikami tej samej linii. ⚡',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'rusalka_mirror_attack': {
    hint: 'Rusałka (Magia): cel jej ataku musi zaatakować SAM SIEBIE! Zaatakuj mocnego wroga.',
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['kudlak_conditional_immunity'],
    aiL3: ['homen_convert_on_death'],
  },
  'rybi_krol_pierce_immunity': {
    hint: 'Rybi Król: przebija odporność (immune) celów. AI: Stukacz i Wilkołak (blokują normalne ataki).',
    aiL1: ['stukacz_strong_immune'],
    aiL2: ['wilkolak_melee_immune'],
    aiL3: ['dydko_strong_immune'],
  },
  'strela_flash_counter': {
    hint: 'Strela (REAKCJA): wyciągnij ze swojej ręki podczas tury WROGA i kontratakluj! Masz ją w ręce.',
    handExtras: ['strela_flash_counter'],
  },
  'szalinc_negate_immunity': {
    hint: 'Szalińc: neguje odporności celu podczas ataku. AI ma Stukacza i Wilkołaka (silne odporności).',
    aiL1: ['stukacz_strong_immune'],
    aiL2: ['wilkolak_melee_immune'],
    aiL3: ['dydko_strong_immune'],
  },
  'wila_convert_weak_enemies': {
    hint: 'Wiła: na początku tury przejmuje wrogie istoty z ATK ≤ 2. AI ma SAME słabe stwory!',
    aiL1: ['licho_block_draw'],
    aiL2: ['bazyliszek_paralyze'],
    aiL3: ['domowik_hand_size'],
  },
  'wodnik_return_on_round_end': {
    hint: 'Wodnik: na koniec rundy wraca do ręki. Wystawiasz go raz za razem. Zakończ turę i obserwuj.',
    allyL1: ['wodnik_return_on_round_end'],
  },
  'swietle_reveal_card': {
    hint: 'Świetle: na początku Twojej tury odkrywa pierwszą zakrytą kartę w ręce AI. AI ma 5 zakrytych.',
  },
  'zar_ptak_death_explosion': {
    hint: 'Żar-ptak: gdy ginie, wybucha zadając 5 DMG WSZYSTKIM wrogom. Pozwól AI go zabić.',
    allyL1: ['zar_ptak_death_explosion'],
    aiL1: ['bezkost_atk_drain'],
  },

  // ===== ŻYWI =====
  'guslarka_bonus_vs_demon': {
    hint: 'Guślarka: +2 ATK dla sojuszników atakujących WELES (domain 4). AI to same demony Weles!',
    aiL1: ['bies_reverse_damage'],
    aiL2: ['kania_chain_kill'],
    aiL3: ['cicha_kill_weak'],
    allyL1: ['dobroochoczy_no_counter'],
  },
  'naczelnik_human_rally': {
    hint: 'Naczelnik Plemienia: gdy Żywi (domain 2) atakuje, nie zużywa limitu ataku. Masz Żywi w ręce.',
    handExtras: ['guslarka_bonus_vs_demon', 'lucznik_pin'],
    allyL1: ['dobroochoczy_no_counter'],
  },
  'starszyzna_scry_deck': {
    hint: 'Starszyzna: na początku tury ujawnia 3 pierwsze karty z Twojej talii. Masz pełną talię.',
  },
  'tur_ranged_magic_immune': {
    hint: 'Tur: odporny na Dystans i Magię. AI ma strzelca (RANGED) i maga (MAGIC) — próbuj go atakować.',
    aiL1: ['dziki_mysliwy_return_on_kill'],
    aiL2: ['rusalka_mirror_attack'],
    aiL3: ['gryf_double_dmg_on_play_turn'],
    allyL1: ['tur_ranged_magic_immune'],
  },
  'lucznik_pin': {
    hint: 'Łucznik (Dystans): po trafieniu, cel nie może zmieniać pozycji (positionLocked).',
  },
  'zupan_no_field_limit': {
    hint: 'Żupan: usuwa limit 5 istot w polu. Masz już 4 sojuszników — bez Żupana 5. nie możesz.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
    allyL2: ['leszy_post_attack_defend', 'jaroszek_paralyze'],
  },
  'zerca_spell_shield': {
    hint: 'Żerca: przy wejściu daje Tarczę Zaklęć WSZYSTKIM sojusznikom. Zaklęcia AI ich nie trafią.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
    allyL2: ['leszy_post_attack_defend'],
  },
  'zerca_welesa_demon_buff': {
    hint: 'Żerca Welesa: AURA +1 ATK dla Weles sojuszników. Masz Bazyliszka i Cichą po swojej stronie.',
    allyL1: ['bazyliszek_paralyze', 'cicha_kill_weak'],
    allyL2: ['dydko_strong_immune'],
  },
  'szeptunka_damage_reduction': {
    hint: 'Szeptunka: redukuje obrażenia zadawane sojusznikom. Pozwól AI atakować Twoich i sprawdź log.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'znachor_absorb': {
    hint: 'Znachor (stub): absorbuje obrażenia na siebie zamiast sojusznika.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'jedza_remove_buff': {
    hint: 'Jędza: ⚡ usuwa jeden aktywny efekt z dowolnej istoty. Wróg L1 ma buffy aktywne.',
    aiL1: ['kudlak_conditional_immunity'],
    aiL2: ['bezkost_atk_drain'],
    aiL3: ['homen_convert_on_death'],
  },
  'wolch_heal': {
    hint: 'Wołch: ⚡ leczy sojusznika tej samej linii do max HP. Masz sojuszników do leczenia.',
    allyL1: ['dobroochoczy_no_counter', 'blotnik_taunt'],
  },
  'siemiargl_cleanse': {
    hint: 'Siemiargł: przy wejściu czyści WSZYSTKICH sojuszników z wrogich debuffów. Wróg ma Zagorkinie.',
    aiL1: ['zagorkinia_curse_drain'],
    aiL2: ['jaroszek_paralyze'],
    allyL1: ['dobroochoczy_no_counter'],
  },

  // ===== NIEUMARLI =====
  'bezkost_atk_drain': {
    hint: 'Bezkost: zamiast DEF, obrażenia odejmują ATK celu. Zaatakuj mocnego wroga — obserwuj utratę ATK.',
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['kudlak_conditional_immunity'],
  },
  'domowik_hand_size': {
    hint: 'Domowik: zwiększa limit ręki i dobiera kartę na początku tury gdy hand < limit.',
  },
  'homen_convert_on_death': {
    hint: 'Homen: przeklęty cel po śmierci wstaje po TWOJEJ stronie. Przeklnij wroga i zabij go.',
    aiL1: ['licho_block_draw'],
    aiL2: ['domowik_hand_size'],
    aiL3: ['gryf_double_dmg_on_play_turn'],
  },
  'jaroszek_paralyze': {
    hint: 'Jaroszek: przy wejściu PERMANENTNIE paraliżuje wybranego wroga. Wybierz cel!',
  },
  'kudlak_conditional_immunity': {
    hint: 'Kudłak: w rundzie gdy atakuje, jest NIETYKALNY. Zaatakuj nim, potem sprawdź immunitet.',
    allyL1: ['kudlak_conditional_immunity'],
  },
  'latawica_drain_ally': {
    hint: 'Latawica: ⚡ pochłania wybranego sojusznika — duplikuje jego ATK+DEF. Poświęć Bezkost lub Kudłaka!',
    allyL1: ['bezkost_atk_drain', 'kudlak_conditional_immunity'],
  },
  'latawiec_mutual_death': {
    hint: 'Latawiec: kto go zabije — ginie razem z nim! Sprowokuj AI do ataku.',
    allyL1: ['latawiec_mutual_death'],
    aiL1: ['bezkost_atk_drain'],
  },
  'poludnica_kill_weakest': {
    hint: 'Południca: na początku każdej tury zabija najsłabszego ATK na CAŁYM polu. AI ma mieszane siły.',
    aiL1: ['licho_block_draw'],
    aiL2: ['bazyliszek_paralyze'],
    aiL3: ['bezkost_atk_drain'],
  },
  'polnocnica_mass_paralyze': {
    hint: 'Północnica: ⚡ za 1 PS paraliżuje WSZYSTKICH wrogów na 1 rundę. AI ma 3 stworzenia.',
  },
  // siemiargl_cleanse — zdefiniowany wyżej
  'strzyga_lifesteal': {
    hint: 'Strzyga: regeneruje HP równe zadanym obrażeniom (wampiryzm). Zaatakuj wroga.',
    allyL1: ['strzyga_lifesteal'],
  },
  'stukacz_strong_immune': {
    hint: 'Stukacz (ATK:2): silniejsze istoty NIE mogą go atakować. AI: Bezkost(7) nie trafi, Licho(2) tak.',
    allyL1: ['stukacz_strong_immune'],
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['licho_block_draw'],
  },
  'tesknica_block_enhance': {
    hint: 'Tęsknica: AURA — wróg nie może ulepszać zaklęć (enhanced). Sprawdź próbę użycia enhanced karty.',
    allyL1: ['tesknica_block_enhance'],
  },
  'utopiec_half_damage': {
    hint: 'Utopiec: otrzymuje tylko POŁOWĘ obrażeń. Sprawdź w logu ile zadał Bezkost (ATK:7 → 3 dmg).',
    allyL1: ['utopiec_half_damage'],
    aiL1: ['bezkost_atk_drain'],
  },
  'wilkolak_melee_immune': {
    hint: 'Wilkołak: odporny na ataki Wręcz < 7 ATK. Licho(2) nie trafi, Bezkost(7) tak.',
    allyL1: ['wilkolak_melee_immune'],
    aiL1: ['licho_block_draw'],
    aiL2: ['bezkost_atk_drain'],
  },
  'wisielec_bounce_both': {
    hint: 'Wisielec (stub): w walce wręcz obie karty wracają na ręce.',
    allyL1: ['wisielec_bounce_both'],
    aiL1: ['bugaj_def_to_atk'],
  },
  'wapierz_invincible_hunger': {
    hint: 'Wąpierz (stub): dopóki zabija w turze, jest niezniszczalny.',
    allyL1: ['wapierz_invincible_hunger'],
    aiL1: ['licho_block_draw'],
    aiL2: ['domowik_hand_size'],
  },
  'zmora_grow_sacrifice': {
    hint: 'Zmora (stub): rośnie po poświęceniu sojusznika. ⚡ wybierz sojusznika.',
    allyL1: ['zmora_grow_sacrifice', 'dobroochoczy_no_counter'],
  },
  'dziad_reveal_all': {
    hint: 'Dziad: przy wejściu odkrywa WSZYSTKIE karty wroga (pole + ręka). AI ma 5 zakrytych kart.',
  },
  'wieszczy_spy_burn': {
    hint: 'Wieszczy: ujawnia pole wroga + co turę SPALA 1 kartę z ręki AI. AI ma pełną rękę.',
  },
  'bagiennik_cleanse_buff': {
    hint: 'Bagiennik: ⚡ usuwa efekt z wybranej istoty → Bagiennik podwaja ATK i DEF!',
    aiL1: ['kudlak_conditional_immunity'],
    allyL1: ['dobroochoczy_no_counter'],
  },
  'cmentarna_baba_resurrect': {
    hint: 'Cmentarna Baba: przy wejściu wskrzesza Nieumarłego z Twojego cmentarza! Masz 3 Nieumarłe w cmentarzu.',
    playerGraveyard: ['stukacz_strong_immune', 'jaroszek_paralyze', 'wilkolak_melee_immune'],
  },
  'grad_magic_element_only': {
    hint: 'Grad: odporny na Wręcz i Dystans — tylko Magia/Żywioł trafiają. AI: Strzelec(RANGED) nie trafi, Rusałka(MAG) tak.',
    allyL1: ['grad_magic_element_only'],
    aiL1: ['dziki_mysliwy_return_on_kill'],
    aiL2: ['rusalka_mirror_attack'],
    aiL3: ['guslarka_bonus_vs_demon'],
  },
  'mavka_line_shield': {
    hint: 'Mavka: AURA — sojusznicy w jej linii NIE mogą być celem ataków wroga!',
    allyL1: ['mavka_line_shield', 'dobroochoczy_no_counter'],
    allyL2: ['leszy_post_attack_defend'],
  },

  // ===== WELES =====
  'baba_jaga_death_growth': {
    hint: 'Baba Jaga (stub): rośnie przy każdej śmierci na polu. Zabij cokolwiek.',
    allyL1: ['baba_jaga_death_growth', 'dobroochoczy_no_counter'],
    aiL1: ['licho_block_draw'],
  },
  'bazyliszek_paralyze': {
    hint: 'Bazyliszek: po trafieniu paraliżuje cel (nie może atakować). Zaatakuj wroga.',
    allyL1: ['bazyliszek_paralyze'],
  },
  'bies_reverse_damage': {
    hint: 'Bies: zwraca CAŁE obrażenia atakującemu! Bezkost(7 ATK) uderzy — sam oberwie 7 dmg.',
    allyL1: ['bies_reverse_damage'],
    aiL1: ['bezkost_atk_drain'],
  },
  'buka_force_defense': {
    hint: 'Buka (ATK:5): wrogowie z ATK < 5 nie mogą go atakować. Licho(2) nie może, Bezkost(7) może.',
    allyL1: ['buka_force_defense'],
    aiL1: ['licho_block_draw'],
    aiL2: ['bezkost_atk_drain'],
  },
  'chasnik_gold_on_kill': {
    hint: 'Chasnik: za co DRUGIEGO zabitego wroga zdobywa 1 PS. Zabij 2 słabych wrogów.',
    allyL1: ['chasnik_gold_on_kill'],
    aiL1: ['licho_block_draw'],
    aiL2: ['domowik_hand_size'],
    aiL3: ['bazyliszek_paralyze'],
  },
  'cicha_kill_weak': {
    hint: 'Cicha: na początku każdej tury zabija najsłabszego ATK na polu. AI ma słabe i mocne stwory.',
    aiL1: ['domowik_hand_size'],
    aiL2: ['licho_block_draw'],
    aiL3: ['bezkost_atk_drain'],
  },
  'cmuch_no_counter_received': {
    hint: 'Ćmuch: nie może być KONTRATAKOWANY. Zaatakuj nim — zero odpowiedzi!',
    allyL1: ['cmuch_no_counter_received'],
  },
  'czarnoksieznik_steal_abilities': {
    hint: 'Czarnoksiężnik: po zabiciu wroga przejmuje jego zdolności! Zabij Bezkosta — przejmiesz ATK drain.',
    allyL1: ['czarnoksieznik_steal_abilities'],
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['kudlak_conditional_immunity'],
  },
  'czart_shift_stats': {
    hint: 'Czart (DEF:3): ⚡ przenosi całą DEF na ATK (DEF=0, ATK+=3 → ATK staje się 3+3=6). Użyj akcji!',
    allyL1: ['czart_shift_stats'],
  },
  'darmopych_friendly_fire': {
    hint: 'Darmopych: przy wejściu wybrana wroga istota atakuje SWOJEGO najsłabszego sojusznika!',
    aiL1: ['bezkost_atk_drain', 'licho_block_draw'],
    aiL2: ['homen_convert_on_death'],
  },
  'dydko_strong_immune': {
    hint: 'Dydko (ATK:3): wrogowie z ATK ≥ 3 nie mogą go atakować. Licho(2) może, Bezkost(7) nie.',
    allyL1: ['dydko_strong_immune'],
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['licho_block_draw'],
  },
  'dzicy_ludzie_steal_killed': {
    hint: 'Dzicy Ludzie: zabita wroga istota trafia do TWOJEJ ręki zamiast na cmentarz!',
    allyL1: ['dzicy_ludzie_steal_killed'],
    aiL1: ['kudlak_conditional_immunity'],
    aiL2: ['homen_convert_on_death'],
  },
  'dziwolzona_swap_cards': {
    hint: 'Dziwożona: po zabiciu dobiera po 1 karcie z obu talii.',
  },
  // homen_convert_on_death — zdefiniowany wyżej
  'kania_chain_kill': {
    hint: 'Kania (ATK:5): po zabiciu słabszego wroga może atakować ponownie — chain kill!',
    allyL1: ['kania_chain_kill'],
    aiL1: ['licho_block_draw'],
    aiL2: ['domowik_hand_size'],
    aiL3: ['bezkost_atk_drain'],
  },
  'lamia_death_reward': {
    hint: 'Lamia: gdy zabije wroga, obie strony dostają nagrodę (PS lub karta). Zabij coś!',
    allyL1: ['lamia_death_reward'],
    aiL1: ['licho_block_draw'],
    aiL2: ['domowik_hand_size'],
  },
  'licho_block_draw': {
    hint: 'Licho: AURA blokuje dobieranie kart przez wroga. Sprawdź w logu turę AI.',
    allyL1: ['licho_block_draw'],
  },
  'mara_sacrifice_takeover': {
    hint: 'Mara: ⚡ poświęca się — przejmuje wrogu istotę z ATK ≤ 2×ATK Mary. Wybierz cel!',
    aiL1: ['homen_convert_on_death'],
    aiL2: ['licho_block_draw'],
  },
  'przyloznik_heal_on_zyvi_kill': {
    hint: 'Przyłóżnik: po zabiciu Żywi (domain 2) regeneruje się do max HP. AI ma same Żywi!',
    allyL1: ['przyloznik_heal_on_zyvi_kill'],
    aiL1: ['guslarka_bonus_vs_demon'],
    aiL2: ['lucznik_pin'],
    aiL3: ['tur_ranged_magic_immune'],
  },
  'szatopierz_discard_for_gold': {
    hint: 'Szątopierz: ⚡ odrzuć 2 karty z ręki → zyskaj 1 PS. Masz pełną rękę z kartami do odrzucenia.',
    allyL1: ['szatopierz_discard_for_gold'],
    handExtras: ['blotnik_taunt', 'rusalka_mirror_attack', 'alkonost_redirect_counterattack'],
  },
  'waz_tugaryn_cleave': {
    hint: 'Wąż Tugaryn: nadmiar obrażeń przechodzi na kolejną istotę w tej samej linii. AI L1 ma 2 słabych.',
    allyL1: ['waz_tugaryn_cleave'],
    aiL1: ['licho_block_draw', 'domowik_hand_size'],
    aiL2: ['bezkost_atk_drain'],
  },
  'wietrzyca_rearrange_enemy': {
    hint: 'Wietrzyca: ⚡ przetasowuje pozycje WSZYSTKICH wrogich istot między liniami. Chaos!',
    allyL1: ['wietrzyca_rearrange_enemy'],
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['kudlak_conditional_immunity'],
    aiL3: ['homen_convert_on_death'],
  },
  'zagorkinia_curse_drain': {
    hint: 'Zagorkinia: przeklęty cel traci 1 ATK na początku każdej tury. Przeklnij mocnego wroga.',
    aiL1: ['bezkost_atk_drain'],
    aiL2: ['kudlak_conditional_immunity'],
  },
  'bogunka_instant_kill_human': {
    hint: 'Bogunka: jednym atakiem natychmiast zabija ŻYWI (domain 2)! AI to same Żywi.',
    allyL1: ['bogunka_instant_kill_human'],
    aiL1: ['guslarka_bonus_vs_demon'],
    aiL2: ['lucznik_pin'],
    aiL3: ['tur_ranged_magic_immune'],
  },
}

// ===== KATALOG KART =====
export const useArenaStore = defineStore('arena', () => {
  const catalog: ArenaCardEntry[] = [
    ..._factory.getAllCreatures().map(c => ({
      id: c.id,
      name: c.name,
      cardType: 'creature' as const,
      effectId: c.effectId,
      effectDescription: c.effectDescription,
      data: c,
    })),
    ..._factory.getAllAdventures().map(a => ({
      id: a.id,
      name: a.name,
      cardType: 'adventure' as const,
      effectId: a.effectId,
      effectDescription: a.effectDescription,
      data: a,
    })),
  ]

  const focusedEntry = ref<ArenaCardEntry | null>(null)
  const isReady = ref(false)
  const currentHint = ref('')

  // ===== HELPERS =====
  function makeCreature(effectId: string, owner: 'player1' | 'player2', line: BattleLine) {
    const data = _factory.getAllCreatures().find(c => c.effectId === effectId)
    if (!data) return null
    const inst = createCreatureInstance(data, owner)
    inst.line = line
    inst.isRevealed = true
    inst.roundEnteredPlay = 1
    inst.turnsInPlay = 1
    return inst
  }

  function makeCreatureForGraveyard(effectId: string, owner: 'player1') {
    const data = _factory.getAllCreatures().find(c => c.effectId === effectId)
    if (!data) return null
    const inst = createCreatureInstance(data, owner)
    inst.isRevealed = true
    inst.line = null
    return inst
  }

  // ===== SETUP SCENARIUSZA =====
  function setupScenario(entry: ArenaCardEntry) {
    const game = useGameStore()
    focusedEntry.value = entry
    const scenario = SCENARIO_MAP[entry.effectId]
    currentHint.value = scenario?.hint ?? 'Wystaw kartę z ręki i przetestuj jej zdolność.'

    const freshState = createInitialGameState('gold')
    freshState.currentPhase = GamePhase.PLAY
    freshState.players.player1.glory = 5
    freshState.players.player2.glory = 5
    freshState.roundNumber = 1
    freshState.turnNumber = 1

    const allCreatures = _factory.getAllCreatures()

    // ===== Testowana karta w ręce gracza =====
    const selectedInstance = entry.cardType === 'creature'
      ? createCreatureInstance(entry.data as CreatureCardData, 'player1')
      : createAdventureInstance(entry.data as AdventureCardData, 'player1')
    selectedInstance.isRevealed = true
    freshState.players.player1.hand.push(selectedInstance)

    // ===== Extra karty w ręce gracza =====
    const allAdventures = _factory.getAllAdventures()
    const defaultHandExtras = ['blotnik_taunt', 'rusalka_mirror_attack', 'alkonost_redirect_counterattack']
    const handExtras = scenario?.handExtras ?? defaultHandExtras
    for (const hId of handExtras) {
      if (hId === entry.effectId) continue
      // Szukaj w istotach i przygodach
      const hCreature = allCreatures.find(c => c.effectId === hId)
      if (hCreature) {
        const h = createCreatureInstance(hCreature, 'player1')
        h.isRevealed = true
        freshState.players.player1.hand.push(h)
      } else {
        const hAdv = allAdventures.find(a => a.effectId === hId)
        if (hAdv) {
          const h = createAdventureInstance(hAdv, 'player1')
          h.isRevealed = true
          freshState.players.player1.hand.push(h)
        }
      }
    }

    // ===== Jedna karta przygody w ręce gracza (jeśli testujemy istotę) =====
    if (entry.cardType === 'creature') {
      const advData = allAdventures.find(a => a.effectId === 'adventure_trucizna')
      if (advData) {
        const adv = createAdventureInstance(advData, 'player1')
        adv.isRevealed = true
        freshState.players.player1.hand.push(adv)
      }
    }

    // ===== Talia gracza: 10 losowych alpha kart (do dobierania) =====
    const deckCandidates = allCreatures.filter(c =>
      ALPHA_CREATURE_EFFECT_IDS.has(c.effectId) && c.effectId !== entry.effectId
    )
    const deckIds = ['dobroochoczy_no_counter', 'blotnik_taunt', 'rusalka_mirror_attack', 'jaroszek_paralyze', 'strzyga_lifesteal', 'bezkost_atk_drain', 'licho_block_draw', 'kania_chain_kill', 'bazyliszek_paralyze', 'stukacz_strong_immune']
    for (const dId of deckIds) {
      if (dId === entry.effectId) continue
      const dData = allCreatures.find(c => c.effectId === dId)
      if (dData) {
        const d = createCreatureInstance(dData, 'player1')
        d.isRevealed = false
        freshState.players.player1.deck.push(d)
      }
    }

    // ===== Sojusznicy gracza =====
    const allyL1 = scenario?.allyL1 ?? ['dobroochoczy_no_counter']
    const allyL2 = scenario?.allyL2 ?? []

    for (const aId of allyL1) {
      if (aId === entry.effectId) continue  // testowana karta jest w ręce
      const ally = makeCreature(aId, 'player1', BattleLine.FRONT)
      if (ally) freshState.players.player1.field.lines[BattleLine.FRONT].push(ally)
    }
    for (const aId of allyL2) {
      if (aId === entry.effectId) continue
      const ally = makeCreature(aId, 'player1', BattleLine.RANGED)
      if (ally) freshState.players.player1.field.lines[BattleLine.RANGED].push(ally)
    }

    // ===== Cmentarz gracza =====
    if (scenario?.playerGraveyard) {
      for (const gId of scenario.playerGraveyard) {
        const gc = makeCreatureForGraveyard(gId, 'player1')
        if (gc) freshState.players.player1.graveyard.push(gc)
      }
    }

    // ===== Wrogowie AI =====
    const aiL1 = scenario?.aiL1 ?? ['bugaj_def_to_atk']
    const aiL2 = scenario?.aiL2 ?? ['leszy_post_attack_defend']
    const aiL3 = scenario?.aiL3 ?? ['gryf_double_dmg_on_play_turn']

    for (const eId of aiL1) {
      const e = makeCreature(eId, 'player2', BattleLine.FRONT)
      if (e) freshState.players.player2.field.lines[BattleLine.FRONT].push(e)
    }
    for (const eId of aiL2) {
      const e = makeCreature(eId, 'player2', BattleLine.RANGED)
      if (e) freshState.players.player2.field.lines[BattleLine.RANGED].push(e)
    }
    for (const eId of aiL3) {
      const e = makeCreature(eId, 'player2', BattleLine.SUPPORT)
      if (e) freshState.players.player2.field.lines[BattleLine.SUPPORT].push(e)
    }

    // ===== Talia AI: 8 kart (do testów Aitwara, Licha itp.) =====
    const aiDeckCandidates = allCreatures.filter(c =>
      ALPHA_CREATURE_EFFECT_IDS.has(c.effectId) &&
      !aiL1.includes(c.effectId) && !aiL2.includes(c.effectId) && !aiL3.includes(c.effectId)
    )
    for (const aiData of aiDeckCandidates.slice(0, 8)) {
      const aiCard = createCreatureInstance(aiData, 'player2')
      aiCard.isRevealed = false
      freshState.players.player2.deck.push(aiCard)
    }

    // ===== Ręka AI: 5 zakrytych kart =====
    const aiHandCandidates = allCreatures.filter(c =>
      ALPHA_CREATURE_EFFECT_IDS.has(c.effectId) &&
      !aiL1.includes(c.effectId) && !aiL2.includes(c.effectId) && !aiL3.includes(c.effectId)
    )
    for (const aiData of aiHandCandidates.slice(8, 13)) {
      const aiCard = createCreatureInstance(aiData, 'player2')
      aiCard.isRevealed = false
      freshState.players.player2.hand.push(aiCard)
    }

    game.setupArenaMode(freshState, entry.name)
    isReady.value = true
  }

  function reset() {
    if (focusedEntry.value) setupScenario(focusedEntry.value)
  }

  return {
    catalog,
    focusedEntry,
    isReady,
    currentHint,
    setupScenario,
    reset,
  }
})
