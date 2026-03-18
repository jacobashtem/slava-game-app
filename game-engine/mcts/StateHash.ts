/**
 * StateHash — Zobrist hashing dla LightState.
 *
 * Deterministycznie hashuje obserwowalny stan gry (pole, PS, soul points,
 * wielkość rąk, tura, runda) na 64-bit BigInt.
 * Ukryte informacje (karty w ręce, kolejność talii) NIE wchodzą do hasha.
 *
 * Zastosowanie:
 * - Transposition Table (Faza 2) — cache ewaluacji
 * - Tree Reuse (Faza 3) — matching stanów między turami
 *
 * Metoda: Zobrist XOR hashing
 * - Pre-generated random BigInt per (feature_type × value)
 * - Full computation: ~0.01ms (18 field slots + 8 global features)
 */

import type { LightState } from './LightweightState'

// ===== PRNG (Mulberry32 → 64-bit BigInt) =====

function createPRNG(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ s >>> 15, 1 | s)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 0x100000000
  }
}

function randomBigInt(rng: () => number): bigint {
  return (BigInt(Math.floor(rng() * 0x100000000)) << 32n) |
         BigInt(Math.floor(rng() * 0x100000000))
}

// ===== PRE-GENERATED ZOBRIST TABLES =====

const rng = createPRNG(0x534C4156)

/** PS values: psZ[side][value], value 0..19 */
const psZ: bigint[][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 20 }, () => randomBigInt(rng)),
)

/** Soul points (bucketed /5): spZ[side][bucket], bucket 0..9 */
const spZ: bigint[][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 10 }, () => randomBigInt(rng)),
)

/** Hand size: handZ[side][size], size 0..19 */
const handZ: bigint[][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 20 }, () => randomBigInt(rng)),
)

/** Turn: turnZ[0|1] */
const turnZ: bigint[] = [randomBigInt(rng), randomBigInt(rng)]

/** Round: roundZ[round], round 0..49 */
const roundZ: bigint[] = Array.from({ length: 50 }, () => randomBigInt(rng))

/** ATK values: atkZ[value], value 0..19 */
const atkZ: bigint[] = Array.from({ length: 20 }, () => randomBigInt(rng))

/** DEF values: defZ[value], value 0..19 */
const defZ: bigint[] = Array.from({ length: 20 }, () => randomBigInt(rng))

/** Position: posZ[0=DEF|1=ATK] */
const posZ: bigint[] = [randomBigInt(rng), randomBigInt(rng)]

/** Line-slot: lineSlotZ[line * 3 + slot], 18 values (6 lines × 3 max cards) */
const lineSlotZ: bigint[] = Array.from({ length: 18 }, () => randomBigInt(rng))

/** Deck size (bucketed /3): deckZ[side][bucket], bucket 0..14 */
const deckZ: bigint[][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 15 }, () => randomBigInt(rng)),
)

// ===== EFFECT ID → HASH CACHE =====

const effectIdCache = new Map<string, bigint>()

function effectIdHash(effectId: string): bigint {
  let h = effectIdCache.get(effectId)
  if (h !== undefined) return h
  // DJB2 variant → 64-bit
  let hash = 5381n
  for (let i = 0; i < effectId.length; i++) {
    hash = ((hash << 5n) + hash + BigInt(effectId.charCodeAt(i))) & ((1n << 64n) - 1n)
  }
  effectIdCache.set(effectId, hash)
  return hash
}

// ===== COMPUTE HASH =====

/**
 * Compute Zobrist hash of a LightState.
 * Hashes observable state only (field, PS, soul points, hand/deck sizes, turn, round).
 * ~0.01ms per call.
 */
export function computeHash(s: LightState): bigint {
  let hash = 0n

  // PS
  hash ^= psZ[0]![Math.min(s.ps[0], 19)]!
  hash ^= psZ[1]![Math.min(s.ps[1], 19)]!

  // Soul points (bucketed by 5)
  hash ^= spZ[0]![Math.min(Math.floor(s.soulPoints[0] / 5), 9)]!
  hash ^= spZ[1]![Math.min(Math.floor(s.soulPoints[1] / 5), 9)]!

  // Hand sizes
  hash ^= handZ[0]![Math.min(s.hands[0].length, 19)]!
  hash ^= handZ[1]![Math.min(s.hands[1].length, 19)]!

  // Deck sizes (bucketed by 3)
  hash ^= deckZ[0]![Math.min(Math.floor(s.deckCount[0] / 3), 14)]!
  hash ^= deckZ[1]![Math.min(Math.floor(s.deckCount[1] / 3), 14)]!

  // Field cards (6 lines × up to 3 cards each)
  for (let line = 0; line < 6; line++) {
    const cards = s.field[line]!
    for (let slot = 0; slot < cards.length && slot < 3; slot++) {
      const c = cards[slot]!
      let cardHash = effectIdHash(c.effectId)
      cardHash ^= atkZ[Math.min(c.atk, 19)]!
      cardHash ^= defZ[Math.min(c.def, 19)]!
      cardHash ^= posZ[c.position]!
      cardHash ^= lineSlotZ[line * 3 + slot]!
      hash ^= cardHash
    }
  }

  // Turn & round
  hash ^= turnZ[s.currentTurn]!
  hash ^= roundZ[Math.min(s.round, 49)]!

  return hash
}
