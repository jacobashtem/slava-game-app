/**
 * CardFactory — ładuje karty z JSON i tworzy instancje runtime.
 * Każda instancja ma unikalne instanceId (nawet dwie kopie tej samej karty).
 */

import type {
  CreatureCardData, AdventureCardData, CardData,
  CardInstance, CardStats, RawCreatureCard, RawAdventureCard,
} from './types'
import { AttackType, Domain, AdventureType, CardPosition, EffectTrigger } from './constants'
import type { PlayerSide } from './types'
import { CREATURE_EFFECT_MAP, ADVENTURE_EFFECT_MAP } from './effectIdMap'

let instanceCounter = 0

function generateInstanceId(prefix: string, cardId: number): string {
  return `${prefix}-${cardId}-${(++instanceCounter).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// ===== PARSE RAW JSON → TYPED CARD DATA =====

export function parseCreatureCard(raw: RawCreatureCard): CreatureCardData {
  return {
    id: raw.id,
    cardType: 'creature',
    domain: raw.idDomain as Domain,
    name: raw.name,
    stats: {
      attack: typeof raw.stats.attack === 'number' ? raw.stats.attack : 0,
      defense: typeof raw.stats.defense === 'number' ? raw.stats.defense : 0,
      maxDefense: typeof raw.stats.defense === 'number' ? raw.stats.defense : 0,
      maxAttack: typeof raw.stats.attack === 'number' ? raw.stats.attack : 0,
    },
    attackType: raw.combat.attackType as AttackType,
    isFlying: raw.combat.isFlying,
    effectId: (raw as any).effectId ?? CREATURE_EFFECT_MAP[raw.id] ?? `creature_${raw.id}_no_effect`,
    effectDescription: (raw as any).effectDescription ?? raw.effect ?? '',
    lore: raw.lore,
    abilities: (raw as any).abilities ?? [],
  }
}

export function parseAdventureCard(raw: RawAdventureCard): AdventureCardData {
  return {
    id: raw.id,
    cardType: 'adventure',
    adventureType: raw.idType as AdventureType,
    name: raw.name,
    effectId: (raw as any).effectId ?? ADVENTURE_EFFECT_MAP[raw.id] ?? `adventure_${raw.id}_no_effect`,
    enhancedEffectId: (raw as any).enhancedEffectId ?? `adventure_${raw.id}_enhanced`,
    effectDescription: (raw as any).effectDescription ?? raw.effect ?? '',
    enhancedEffectDescription: (raw as any).enhancedEffectDescription ?? raw.enhancedEffect ?? '',
    lore: raw.lore,
    persistence: raw.persistence ?? 'instant',
    durationRounds: raw.durationRounds,
    conditionEnd: raw.conditionEnd,
    abilities: (raw as any).abilities ?? [],
  }
}

// ===== CREATE RUNTIME INSTANCE =====

export function createCreatureInstance(cardData: CreatureCardData, owner: PlayerSide): CardInstance {
  return {
    instanceId: generateInstanceId('creature', cardData.id),
    cardData,
    currentStats: {
      attack: cardData.stats.attack,
      defense: cardData.stats.defense,
      maxDefense: cardData.stats.maxDefense,
      maxAttack: cardData.stats.maxAttack,
    },
    position: CardPosition.DEFENSE,
    line: null,
    activeEffects: [],
    equippedArtifacts: [],
    isRevealed: false,
    turnsInPlay: 0,
    roundEnteredPlay: 0,
    owner,
    isSilenced: false,
    isImmune: false,
    cannotAttack: false,
    isGrounded: false,
    hasAttackedThisTurn: false,
    hasMovedThisTurn: false,
    poisonRoundsLeft: null,
    paralyzeRoundsLeft: null,
    metadata: {},
  }
}

export function createAdventureInstance(cardData: AdventureCardData, owner: PlayerSide): CardInstance {
  return {
    instanceId: generateInstanceId('adventure', cardData.id),
    cardData,
    currentStats: { attack: 0, defense: 0, maxDefense: 0, maxAttack: 0 },
    position: CardPosition.DEFENSE,
    line: null,
    activeEffects: [],
    equippedArtifacts: [],
    isRevealed: false,
    turnsInPlay: 0,
    roundEnteredPlay: 0,
    owner,
    isSilenced: false,
    isImmune: false,
    cannotAttack: false,
    isGrounded: false,
    hasAttackedThisTurn: false,
    hasMovedThisTurn: false,
    poisonRoundsLeft: null,
    paralyzeRoundsLeft: null,
    metadata: {},
  }
}

// ===== CARD FACTORY CLASS =====

export class CardFactory {
  private creatures: CreatureCardData[] = []
  private adventures: AdventureCardData[] = []

  loadCreatures(rawCards: RawCreatureCard[]): void {
    this.creatures = rawCards.map(parseCreatureCard)
  }

  loadAdventures(rawCards: RawAdventureCard[]): void {
    this.adventures = rawCards.map(parseAdventureCard)
  }

  getAllCreatures(): CreatureCardData[] {
    return [...this.creatures]
  }

  getAllAdventures(): AdventureCardData[] {
    return [...this.adventures]
  }

  getCreatureById(id: number): CreatureCardData | null {
    return this.creatures.find(c => c.id === id) ?? null
  }

  getAdventureById(id: number): AdventureCardData | null {
    return this.adventures.find(a => a.id === id) ?? null
  }

  createCreatureInstance(id: number, owner: PlayerSide): CardInstance | null {
    const cardData = this.getCreatureById(id)
    if (!cardData) return null
    return createCreatureInstance(cardData, owner)
  }

  createAdventureInstance(id: number, owner: PlayerSide): CardInstance | null {
    const cardData = this.getAdventureById(id)
    if (!cardData) return null
    return createAdventureInstance(cardData, owner)
  }
}
