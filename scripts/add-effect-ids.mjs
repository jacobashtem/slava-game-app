/**
 * Skrypt migracyjny: dodaje effectId do plików JSON kart.
 * Uruchom: node scripts/add-effect-ids.mjs
 *
 * Zasada nadawania ID:
 * - Istoty: nazwa karty → snake_case + suffix opisujący efekt
 * - Przygody: "adventure_" + nazwa → snake_case, enhanced = + "_enhanced"
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')

function toSnakeCase(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // usuń diakrytyki
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

// ===================================================================
// MAPA EFFECTID DLA ISTOT (name → effectId)
// Ręcznie przypisane dla kart z unikalną logiką.
// Reszta dostaje automatyczny ID z sufiksem _effect.
// ===================================================================

const CREATURE_EFFECT_MAP = {
  // PERUN
  'Aitwar': 'aitwar_steal_hand',
  'Alkonost': 'alkonost_redirect_counterattack',
  'Barstuk': 'barstuk_ally_regen',
  'Bałwan': 'balwan_free_divine_favor',
  'Biali ludzie': 'biali_ludzie_wound_disarm',
  'Brzegina': 'brzegina_shield_for_gold',
  'Bugaj': 'bugaj_def_to_atk',
  'Błotnik': 'blotnik_taunt',
  'Chmurnik': 'chmurnik_ground_flying',
  'Chowaniec': 'chowaniec_intercept',
  'Dobroochoczy': 'dobroochoczy_no_counter',
  'Dziewiątko': 'dziewiatko_deathmark',
  'Dziki Myśliwy': 'dziki_mysliwy_return_on_kill',
  'Gryf': 'gryf_double_dmg_on_play_turn',
  'Król wężów': 'krol_wezow_always_counter',
  'Leszy': 'leszy_post_attack_defend',
  'Matoha': 'matoha_effect',
  'Mróz': 'mroz_immunity_buffs',
  'Rodzanice': 'rodzanice_lore_only',
  'Rusałka': 'rusalka_mirror_attack',
  'Rybi król': 'rybi_krol_pierce_immunity',
  'Strela': 'strela_flash_counter',
  'Szalińc': 'szalinc_negate_immunity',
  'Wiła': 'wila_convert_weak_enemies',
  'Wodnik': 'wodnik_return_on_round_end',
  'korgorusze': 'korgorusze_recover_glory',
  'Łapiduch': 'lapiduch_demon_hunter',
  'Świetle': 'swietle_reveal_card',
  'Żar-ptak': 'zar_ptak_death_explosion',
  'Żmije': 'zmije_attack_deck',

  // ŻYWI
  'Baba': 'baba_bonus_vs_nonhuman',
  'Chały / Ały': 'chaly_attack_locations',
  'Chąśnik': 'chasnik_gold_on_kill',
  'Chłop': 'chlop_extra_attack',
  'Czarnoksiężnik': 'czarnoksieznik_steal_buffs',
  'Czarownica': 'czarownica_redirect_spell',
  'Dzicy ludzie': 'dzicy_ludzie_steal_killed',
  'Guślarka': 'guslarka_bonus_vs_demon',
  'Julki': 'julki_adventure_immunity',
  'Junak': 'junak_double_hit_kill',
  'Jędza': 'jedza_remove_buff',
  'Konny': 'konny_cleave',
  'Kościej': 'kosciej_melee_resurrection',
  'Naczelnik Plemienia': 'naczelnik_human_rally',
}

// ===================================================================
// MAPA EFFECTID DLA KART PRZYGODY (name → {effectId, enhancedEffectId})
// ===================================================================

const ADVENTURE_EFFECT_MAP = {
  'Moc Światogora': {
    effectId: 'adventure_moc_swiatogora',
    enhancedEffectId: 'adventure_moc_swiatogora_enhanced',
  },
  'Arena': {
    effectId: 'adventure_arena',
    enhancedEffectId: 'adventure_arena_enhanced',
  },
  'Oblęd': {
    effectId: 'adventure_obled',
    enhancedEffectId: 'adventure_obled_enhanced',
  },
  'Topór Peruna': {
    effectId: 'adventure_topor_peruna',
    enhancedEffectId: 'adventure_topor_peruna_enhanced',
  },
  'Kradzież': {
    effectId: 'adventure_kradzież',
    enhancedEffectId: 'adventure_kradzież_enhanced',
  },
  'Okaleczenie': {
    effectId: 'adventure_okaleczenie',
    enhancedEffectId: 'adventure_okaleczenie_enhanced',
  },
  'Arkona': {
    effectId: 'adventure_arkona',
    enhancedEffectId: 'adventure_arkona_enhanced',
  },
  'Likantropia': {
    effectId: 'adventure_likantropia',
    enhancedEffectId: 'adventure_likantropia_enhanced',
  },
  'Sobowtór': {
    effectId: 'adventure_sobowtór',
    enhancedEffectId: 'adventure_sobowtór_enhanced',
  },
  'Rusałczy Taniec': {
    effectId: 'adventure_rusalczy_taniec',
    enhancedEffectId: 'adventure_rusalczy_taniec_enhanced',
  },
  'Matecznik': {
    effectId: 'adventure_matecznik',
    enhancedEffectId: 'adventure_matecznik_enhanced',
  },
  'Sztandar': {
    effectId: 'adventure_sztandar',
    enhancedEffectId: 'adventure_sztandar_enhanced',
  },
  'Trucizna': {
    effectId: 'adventure_trucizna',
    enhancedEffectId: 'adventure_trucizna_enhanced',
  },
  'Łaska Welesa': {
    effectId: 'adventure_laska_welesa',
    enhancedEffectId: 'adventure_laska_welesa_enhanced',
  },
  'Wygnanie': {
    effectId: 'adventure_wygnanie',
    enhancedEffectId: 'adventure_wygnanie_enhanced',
  },
  'Kwiat Paproci': {
    effectId: 'adventure_kwiat_paproci',
    enhancedEffectId: 'adventure_kwiat_paproci_enhanced',
  },
  'Zlot Czarownic': {
    effectId: 'adventure_zlot_czarownic',
    enhancedEffectId: 'adventure_zlot_czarownic_enhanced',
  },
  'Twierdza': {
    effectId: 'adventure_twierdza',
    enhancedEffectId: 'adventure_twierdza_enhanced',
  },
  'Rehtra': {
    effectId: 'adventure_rehtra',
    enhancedEffectId: 'adventure_rehtra_enhanced',
  },
  'Przyjaźń': {
    effectId: 'adventure_przyjazn',
    enhancedEffectId: 'adventure_przyjazn_enhanced',
  },
  'Miecz Kladenet': {
    effectId: 'adventure_miecz_kladenet',
    enhancedEffectId: 'adventure_miecz_kladenet_enhanced',
  },
  'Młot Swaroga': {
    effectId: 'adventure_mlot_swaroga',
    enhancedEffectId: 'adventure_mlot_swaroga_enhanced',
  },
}

// ===================================================================
// PRZETWARZANIE ISTOT
// ===================================================================

const istotypath = join(dataDir, 'Slava_Vol2_Istoty.json')
const istoty = JSON.parse(readFileSync(istotypath, 'utf-8'))

let unknownCreatures = []

const istotypWithIds = istoty.map(card => {
  const effectId = CREATURE_EFFECT_MAP[card.name]
    ?? `${toSnakeCase(card.name)}_effect`

  if (!CREATURE_EFFECT_MAP[card.name]) {
    unknownCreatures.push({ id: card.id, name: card.name, effectId })
  }

  return {
    ...card,
    effectId,
    // Zachowujemy oryginalny tekst efektu jako effectDescription dla UI
    effectDescription: card.effect,
  }
})

writeFileSync(istotypath, JSON.stringify(istotypWithIds, null, 2), 'utf-8')
console.log(`✅ Istoty: dodano effectId do ${istotypWithIds.length} kart`)

if (unknownCreatures.length > 0) {
  console.log(`\n⚠️  Karty bez ręcznego mapowania (auto-ID nadane):`)
  unknownCreatures.forEach(c => console.log(`   [${c.id}] "${c.name}" → "${c.effectId}"`))
}

// ===================================================================
// PRZETWARZANIE KART PRZYGODY
// ===================================================================

const przygodyPath = join(dataDir, 'Slava_Vol2_KartyPrzygody.json')
const przygody = JSON.parse(readFileSync(przygodyPath, 'utf-8'))

let unknownAdventures = []

const przygodyWithIds = przygody.map(card => {
  const mapped = ADVENTURE_EFFECT_MAP[card.name]

  if (!mapped) {
    const baseId = `adventure_${toSnakeCase(card.name)}`
    unknownAdventures.push({ id: card.id, name: card.name })
    return {
      ...card,
      effectId: baseId,
      enhancedEffectId: `${baseId}_enhanced`,
      effectDescription: card.effect,
      enhancedEffectDescription: card.enhancedEffect,
    }
  }

  return {
    ...card,
    effectId: mapped.effectId,
    enhancedEffectId: mapped.enhancedEffectId,
    effectDescription: card.effect,
    enhancedEffectDescription: card.enhancedEffect,
  }
})

writeFileSync(przygodyPath, JSON.stringify(przygodyWithIds, null, 2), 'utf-8')
console.log(`\n✅ Karty Przygody: dodano effectId do ${przygodyWithIds.length} kart`)

if (unknownAdventures.length > 0) {
  console.log(`\n⚠️  Przygody bez ręcznego mapowania:`)
  unknownAdventures.forEach(c => console.log(`   [${c.id}] "${c.name}"`))
}

console.log('\n🎉 Migracja zakończona!')
console.log('Teraz dodaj brakujące effectId do EffectRegistry.ts dla kart oznaczonych ⚠️')
