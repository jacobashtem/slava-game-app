/**
 * Mapowanie ID karty (z JSON) → effectId (zarejestrowany w EffectRegistry).
 * Potrzebne bo plik JSON nie ma pola effectId — generowany fallback nie pasuje do registered IDs.
 */

export const CREATURE_EFFECT_MAP: Record<number, string> = {
  1:  'aitwar_steal_hand',
  2:  'alkonost_redirect_counterattack',
  5:  'biali_ludzie_wound_disarm',
  6:  'brzegina_shield_for_gold',
  7:  'bugaj_def_to_atk',
  8:  'blotnik_taunt',
  9:  'chmurnik_ground_flying',
  10: 'chowaniec_intercept',
  11: 'dobroochoczy_no_counter',
  12: 'dziewiatko_deathmark',
  13: 'dziki_mysliwy_return_on_kill',
  14: 'gryf_double_dmg_on_play_turn',
  15: 'krol_wezow_always_counter',
  16: 'leszy_post_attack_defend',
  18: 'mroz_immunity_buffs',
  19: 'rodzanice_lore_only',
  20: 'rusalka_mirror_attack',
  21: 'rybi_krol_pierce_immunity',
  22: 'strela_flash_counter',
  23: 'szalinc_negate_immunity',
  24: 'wila_convert_weak_enemies',
  25: 'wodnik_return_on_round_end',
}

export const ADVENTURE_EFFECT_MAP: Record<number, string> = {
  1:  'adventure_moc_swiatogora',
  2:  'adventure_arena',
  3:  'adventure_obled',
  4:  'adventure_topor_peruna',
  13: 'adventure_trucizna',
  14: 'adventure_laska_welesa',
  27: 'adventure_bitwa_nad_tollense',
}
