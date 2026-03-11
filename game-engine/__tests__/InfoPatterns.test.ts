/**
 * Tests for InfoBox notification patterns.
 * Ensures important game events are detected from action log entries.
 */
import { describe, it, expect } from 'vitest'

// Same patterns as in gameStore — kept in sync
const infoPatterns: { pattern: RegExp; icon: string; type: 'effect' | 'info' | 'warning' }[] = [
  { pattern: /Kluwa się.*dobiera (\d+) kart/i, icon: '🥚', type: 'effect' },
  { pattern: /Likantropia.*absorb|wchłania/i, icon: '🐺', type: 'effect' },
  { pattern: /Wskrze(sza|szony|szenie)/i, icon: '💀', type: 'effect' },
  { pattern: /Przejmuje zdolnoś/i, icon: '🧙', type: 'effect' },
  { pattern: /trwale unieruchomion/i, icon: '⚡', type: 'warning' },
  { pattern: /ŁUPIENIE|ukradł kartę/i, icon: '💰', type: 'warning' },
  { pattern: /Nowy sezon:/i, icon: '🌿', type: 'info' },
  { pattern: /przechwytuje zaklęcie|Przekierowuje zaklęcie/i, icon: '🛡', type: 'effect' },
  { pattern: /Paraliż.*całe pole|masowy paraliż/i, icon: '⚡', type: 'warning' },
  { pattern: /zabija najsłabsz/i, icon: '☠', type: 'warning' },
  { pattern: /przeskakuje do|Teleportacja/i, icon: '✨', type: 'effect' },
  { pattern: /Sobowtór.*kopiuje/i, icon: '👤', type: 'effect' },
  { pattern: /Strela.*przechwyc/i, icon: '⚡', type: 'effect' },
]

function matchPattern(message: string): { icon: string; type: string } | null {
  for (const p of infoPatterns) {
    if (p.pattern.test(message)) {
      return { icon: p.icon, type: p.type }
    }
  }
  return null
}

describe('InfoBox notification patterns', () => {
  it('matches Smocze Jajo hatch', () => {
    const m = matchPattern('Smocze Jajo: Kluwa się po 5 rundach! Właściciel dobiera 3 karty.')
    expect(m).not.toBeNull()
    expect(m!.icon).toBe('🥚')
    expect(m!.type).toBe('effect')
  })

  it('matches Likantropia absorb', () => {
    const m = matchPattern('Likantropia: wchłania ofiarę — ATK +2, DEF +3!')
    expect(m).not.toBeNull()
    expect(m!.icon).toBe('🐺')
  })

  it('matches resurrection', () => {
    expect(matchPattern('Kościej: Wskrzeszenie! Wraca na L1.')).not.toBeNull()
    expect(matchPattern('Cmentarna Baba: Wskrzesza Upior z cmentarza.')).not.toBeNull()
    expect(matchPattern('Wij: Wskrzeszony — ostatnia tura!')).not.toBeNull()
  })

  it('matches ability theft', () => {
    const m = matchPattern('Czarnoksiężnik: Przejmuje zdolność Gryfa!')
    expect(m).not.toBeNull()
    expect(m!.icon).toBe('🧙')
  })

  it('matches permanent paralyze', () => {
    const m = matchPattern('Jaroszek: Wróg trwale unieruchomiony — nie może atakować!')
    expect(m).not.toBeNull()
    expect(m!.type).toBe('warning')
  })

  it('matches plunder and card theft', () => {
    expect(matchPattern('Runda 3: ŁUPIENIE! Wróg bez obrony — kradniesz 1 PS!')).not.toBeNull()
    expect(matchPattern('Aitwar ukradł kartę "Żmij" z ręki przeciwnika!')).not.toBeNull()
  })

  it('matches new season', () => {
    const m = matchPattern('Nowy sezon: Zima')
    expect(m).not.toBeNull()
    expect(m!.type).toBe('info')
  })

  it('matches spell intercept', () => {
    expect(matchPattern('Bzionek przechwytuje zaklęcie wroga!')).not.toBeNull()
    expect(matchPattern('Czarownica: Przekierowuje zaklęcie na wroga!')).not.toBeNull()
  })

  it('matches mass paralyze', () => {
    const m = matchPattern('Południca: masowy paraliż na 1 rundę!')
    expect(m).not.toBeNull()
    expect(m!.type).toBe('warning')
  })

  it('matches kill weakest', () => {
    const m = matchPattern('Południca zabija najsłabszą istotę na polu!')
    expect(m).not.toBeNull()
    expect(m!.icon).toBe('☠')
  })

  it('matches teleport', () => {
    expect(matchPattern('Błędny Ognik przeskakuje do Linii 2!')).not.toBeNull()
  })

  it('matches Sobowtór copy', () => {
    const m = matchPattern('Sobowtór kopiuje Gryfa — staje się identyczny!')
    expect(m).not.toBeNull()
    expect(m!.icon).toBe('👤')
  })

  it('matches Strela intercept', () => {
    const m = matchPattern('Strela przechwyciła atak — cel zmieniony!')
    expect(m).not.toBeNull()
  })

  it('does NOT match ordinary combat messages', () => {
    expect(matchPattern('Gryf atakuje Upior za 5 obrażeń.')).toBeNull()
    expect(matchPattern('Gryf zabija Upior!')).toBeNull()
    expect(matchPattern('Tura gracza rozpoczęta.')).toBeNull()
  })

  it('does NOT match empty or short messages', () => {
    expect(matchPattern('')).toBeNull()
    expect(matchPattern('test')).toBeNull()
  })
})
