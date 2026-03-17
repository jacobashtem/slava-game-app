// ===== ENUMS =====

export enum AttackType {
  MELEE = 0,     // Wręcz — tylko L1 (pierwsza zajęta linia wroga)
  ELEMENTAL = 1, // Żywioł — jak Wręcz, ale bije latające + efekty żywiołu
  MAGIC = 2,     // Magia — dowolna linia
  RANGED = 3,    // Dystans — dowolna linia
}

export enum Domain {
  PERUN = 1,    // Perunowcy — złoty
  ZYVI = 2,     // Żywi — zielony
  UNDEAD = 3,   // Nieumarli — fioletowy
  WELES = 4,    // Welesowcy — czerwony
}

export enum CardPosition {
  ATTACK = 'attack',   // Pionowo: może atakować, nie kontratakuje
  DEFENSE = 'defense', // Poziomo: nie atakuje aktywnie, kontratakuje
}

export enum GamePhase {
  START = 'start',
  DRAW = 'draw',
  PLAY = 'play',
  COMBAT = 'combat',
  END = 'end',
}

export enum AdventureType {
  EVENT = 0,    // Zdarzenie — natychmiastowe, jednorazowe
  ARTIFACT = 1, // Artefakt — podpięty pod istotę, trwały efekt
  LOCATION = 2, // Lokacja — pasywny efekt dla całego pola
}

export enum BattleLine {
  FRONT = 1,   // L1 — Wręcz/Front
  RANGED = 2,  // L2 — Dystans
  SUPPORT = 3, // L3 — Magia/Wsparcie
}

export enum EffectTrigger {
  PASSIVE = 'passive',                       // Ciągły efekt (sprawdzany co klatkę logiki)
  ON_PLAY = 'on_play',                       // Przy wystawieniu na pole
  ON_ATTACK = 'on_attack',                   // Przy wykonaniu ataku
  ON_DEFEND = 'on_defend',                   // Przy kontrataku
  ON_DAMAGE_DEALT = 'on_damage_dealt',       // Gdy TA istota ZADAJE obrażenia (Biali Ludzie, Bezkost, Homen, Strzyga, Bazyliszek)
  ON_DAMAGE_RECEIVED = 'on_damage_received', // Gdy TA istota OTRZYMUJE obrażenia (Bugaj, Brzegina)
  ON_DEATH = 'on_death',                     // Przy śmierci (przed usunięciem z pola)
  ON_KILL = 'on_kill',                       // Przy zabiciu wrogiej istoty
  ON_ANY_DEATH = 'on_any_death',             // Gdy DOWOLNA istota na stole ginie (sojusznik LUB wróg)
  ON_TURN_START = 'on_turn_start',           // Na początku tury właściciela
  ON_TURN_END = 'on_turn_end',               // Na końcu tury właściciela
  ON_ROUND_START = 'on_round_start',         // Na początku nowej rundy
  ON_ALLY_DEATH = 'on_ally_death',           // Gdy ginie sojusznik
  ON_ALLY_ATTACKED = 'on_ally_attacked',     // Gdy sojusznik zostaje zaatakowany (Chowaniec, Niedźwiedziołak, Wielkolud)
  ON_ALLY_DAMAGED = 'on_ally_damaged',       // Gdy sojusznik otrzymuje obrażenia (Brzegina)
  ON_ALLY_SURVIVES = 'on_ally_survives',     // Gdy sojusznik przeżywa atak (Znachor)
  ON_ALLY_SPELLED = 'on_ally_spelled',       // Gdy zaklęcie celuje w sojusznika (Bzionek)
  ON_ALLY_ATTACK = 'on_ally_attack',         // Gdy sojusznik atakuje (np. Leszy)
  ON_SPELL_CAST = 'on_spell_cast',           // Gdy ktokolwiek rzuca zaklęcie (Czarownica)
  ON_GOLD_SPENT = 'on_gold_spent',           // Gdy gracz wydaje PS (Najemnik)
  ON_DEFENSE_ZERO = 'on_defense_zero',       // Gdy obrona spada do 0 (Czart)
  ON_COMBAT = 'on_combat',                   // Byle kontakt bojowy (Wisielec)
  ON_ENEMY_PLAY = 'on_enemy_play',           // Gdy wróg wystawia istotę
  ON_ACTIVATE = 'on_activate',               // Gracz ręcznie aktywuje zdolność (Aitwar, Barstuk, etc.)
}

// Priorytet rozwiązywania efektów (niższy = wcześniejszy)
export enum EffectPriority {
  IMMEDIATE = -1,   // Natychmiastowe (przed innymi)
  PREVENTION = 0,   // Zapobieganie (odporność, tarcze)
  REPLACEMENT = 1,  // Zastąpienie (np. redirect damage)
  MODIFIER = 2,     // Modyfikatory (buffy/debuffy)
  REACTION = 3,     // Reakcje (kontratak, triggers)
  CLEANUP = 4,      // Sprzątanie (death effects, remove tokens)
  PASSIVE = 5,      // Pasywne aury i stałe efekty
}

export const GOLD_EDITION_RULES = {
  STARTING_HAND: 5,
  STARTING_GOLD: 5,
  DECK_SIZE: 30,
  MAX_FIELD_CREATURES: 5,
  PLAY_LIMIT_CREATURES: 1,  // max istot do wystawienia na turę
  PLAY_LIMIT_ADVENTURES: 99, // effectively no limit on adventures per turn
  ADVENTURE_COST: 0,        // efekt podstawowy — DARMOWY
  ENHANCED_ADVENTURE_COST: 1, // efekt ulepszony — kosztuje 1 PS
  CARDS_DRAWN_PER_TURN: 1,
  GLORY_WIN_TARGET: 15,     // alternatywna wygrana: zgromadź 15 PS
  SOUL_HARVEST_THRESHOLD: 20, // co 20 pkt (ATK+DEF zabitego) → +1 PS
} as const

// ===== TRYB SŁAWA! =====

export enum Season {
  WINTER = 0,
  SPRING = 1,
  SUMMER = 2,
  AUTUMN = 3,
}

export const SLAVA_RULES = {
  GLORY_TARGET: 10,
  PASSIVE_INCOME_PER_TURN: 1,
  TROPHY_THRESHOLD: 9,        // suma bazowej DEF zabitych >= 9 → +1 PS
  BREAKTHROUGH_REWARD: 1,     // +1 PS za przełamanie
  BREAKTHROUGH_PENALTY: 1,    // -1 PS dla obrońcy
  SEASON_LENGTH_ROUNDS: 4,    // zmiana pory co 4 rundy
  ENHANCED_ADVENTURE_COST: 1, // ulepszenie przygody w Sława = 1 PS
  MIN_AUCTION_BID: 1,
  SOUL_HARVEST_THRESHOLD: 20, // co 20 pkt (ATK+DEF zabitego) → +1 PS
  STARTING_HAND: 5,
  DECK_SIZE: 30,
  MAX_FIELD_CREATURES: 5,
  PLAY_LIMIT_CREATURES: 1,
  PLAY_LIMIT_ADVENTURES: 99,
  ADVENTURE_COST: 0,
  CARDS_DRAWN_PER_TURN: 1,
} as const

export const SEASON_NAMES: Record<Season, string> = {
  [Season.WINTER]: 'Zima',
  [Season.SPRING]: 'Wiosna',
  [Season.SUMMER]: 'Lato',
  [Season.AUTUMN]: 'Jesień',
}

// Pora roku → domena premiowana (sezonowy buff)
export const SEASON_BONUS_DOMAIN: Record<Season, Domain> = {
  [Season.WINTER]: Domain.UNDEAD,   // +1 DEF
  [Season.SPRING]: Domain.PERUN,    // +1 ATK
  [Season.SUMMER]: Domain.ZYVI,     // +1 ATK
  [Season.AUTUMN]: Domain.WELES,    // enhanced za 0 PS
}

// Przy zmianie pory → paraliżowana domena (1 rundę)
export const SEASON_PARALYSIS_DOMAIN: Record<Season, Domain> = {
  [Season.WINTER]: Domain.PERUN,    // Jesień→Zima: Perun paraliż
  [Season.SPRING]: Domain.WELES,    // Zima→Wiosna: Weles paraliż
  [Season.SUMMER]: Domain.UNDEAD,   // Wiosna→Lato: Nieumarli paraliż
  [Season.AUTUMN]: Domain.ZYVI,     // Lato→Jesień: Żywi paraliż
}

export const DOMAIN_COLORS = {
  [Domain.PERUN]: '#f5c542',
  [Domain.ZYVI]: '#4caf50',
  [Domain.UNDEAD]: '#9c27b0',
  [Domain.WELES]: '#c62828',
} as const

export const DOMAIN_NAMES = {
  [Domain.PERUN]: 'Perun',
  [Domain.ZYVI]: 'Żywi',
  [Domain.UNDEAD]: 'Nieumarli',
  [Domain.WELES]: 'Weles',
} as const
