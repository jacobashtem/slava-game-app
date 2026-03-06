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
  PASSIVE = 'passive',               // Ciągły efekt (sprawdzany co klatkę logiki)
  ON_PLAY = 'on_play',               // Przy wystawieniu na pole
  ON_ATTACK = 'on_attack',           // Przy wykonaniu ataku
  ON_DEFEND = 'on_defend',           // Przy kontrataku
  ON_DAMAGE = 'on_damage',           // Przy otrzymaniu obrażeń
  ON_DEATH = 'on_death',             // Przy śmierci (przed usunięciem z pola)
  ON_KILL = 'on_kill',               // Przy zabiciu wrogiej istoty
  ON_TURN_START = 'on_turn_start',   // Na początku tury właściciela
  ON_TURN_END = 'on_turn_end',       // Na końcu tury właściciela
  ON_ROUND_START = 'on_round_start', // Na początku nowej rundy
  ON_ALLY_DEATH = 'on_ally_death',   // Gdy ginie sojusznik
  ON_ALLY_ATTACK = 'on_ally_attack', // Gdy sojusznik atakuje (np. Leszy)
  ON_ACTIVATE = 'on_activate',       // Gracz ręcznie aktywuje zdolność (Aitwar, Barstuk, etc.)
}

// Priorytet rozwiązywania efektów (niższy = wcześniejszy)
export enum EffectPriority {
  PREVENTION = 0,   // Zapobieganie (odporność, tarcze)
  REPLACEMENT = 1,  // Zastąpienie (np. redirect damage)
  MODIFIER = 2,     // Modyfikatory (buffy/debuffy)
  REACTION = 3,     // Reakcje (kontratak, triggers)
  CLEANUP = 4,      // Sprzątanie (death effects, remove tokens)
}

export const GOLD_EDITION_RULES = {
  STARTING_HAND: 5,
  STARTING_GOLD: 5,
  DECK_SIZE: 30,
  MAX_FIELD_CREATURES: 5,
  PLAY_LIMIT_CREATURES: 1,  // max istot do wystawienia na turę
  PLAY_LIMIT_ADVENTURES: 1, // max kart przygody na turę
  ADVENTURE_COST: 0,        // efekt podstawowy — DARMOWY
  ENHANCED_ADVENTURE_COST: 2, // efekt ulepszony — kosztuje 2 ZŁ
  CARDS_DRAWN_PER_TURN: 1,
} as const

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
