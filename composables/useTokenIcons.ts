/**
 * Token icon renderer for ability text.
 * Parses {ATK}, {DEF}, {DEMON}, etc. and maps them to inline icon images.
 *
 * {ATK} resolves to the card's own attack type icon (context-sensitive).
 */

import domainImg1 from '~/assets/cards/domain-1.png'
import domainImg2 from '~/assets/cards/domain-2.png'
import domainImg3 from '~/assets/cards/domain-3.png'
import domainImg4 from '~/assets/cards/domain-4.png'
import attackTypeImg1 from '~/assets/cards/attackType1.png'
import attackTypeImg2 from '~/assets/cards/attackType2.png'
import attackTypeImg3 from '~/assets/cards/attackType3.png'
import flyingImg from '~/assets/cards/isFlying.png'

export interface TokenSegment {
  type: 'text' | 'icon'
  value: string        // text content or token name
  img?: string         // image URL for icons
  iconify?: string     // iconify icon name (fallback)
  color?: string       // tint color
  label?: string       // tooltip label
}

// Attack type → image mapping (1=Melee, 2=Elemental, 3=Magic)
const attackTypeImgMap: Record<number, string> = {
  1: attackTypeImg1,
  2: attackTypeImg2,
  3: attackTypeImg3,
}

// Token → icon mapping (ATK handled separately based on card context)
const tokenMap: Record<string, { img?: string; iconify?: string; color: string; label: string }> = {
  DEF:       { iconify: 'game-icons:shield', color: '#3b82f6', label: 'Obrona' },
  DMG:       { img: attackTypeImg1, color: '#ef4444', label: 'Obrażenia' },
  FLY:       { img: flyingImg, color: '#a78bfa', label: 'Lot' },
  GOLD:      { iconify: 'game-icons:two-coins', color: '#eab308', label: 'Złocisze' },
  POISON:    { iconify: 'game-icons:poison-bottle', color: '#22c55e', label: 'Trucizna' },
  SILENCE:   { iconify: 'game-icons:silenced', color: '#6b7280', label: 'Uciszenie' },
  MELEE:     { img: attackTypeImg1, color: '#ef4444', label: 'Wręcz' },
  ELEMENTAL: { img: attackTypeImg2, color: '#f97316', label: 'Żywioł' },
  MAGIC:     { img: attackTypeImg3, color: '#a855f7', label: 'Magia' },
  RANGED:    { iconify: 'game-icons:bow-arrow', color: '#22d3ee', label: 'Dystans' },
  DEMON:     { img: domainImg4, color: '#a855f7', label: 'Demony' },
  UNDEAD:    { img: domainImg3, color: '#6b7280', label: 'Nieumarli' },
  ZYVI:      { img: domainImg2, color: '#22c55e', label: 'Żywi' },
  PERUN:     { img: domainImg1, color: '#eab308', label: 'Perun' },
  WELES:     { img: domainImg4, color: '#a855f7', label: 'Weles' },
}

/**
 * Parse ability text containing {TOKEN} markers into renderable segments.
 * @param text - ability text with tokens like {ATK}, {DEF}
 * @param attackType - card's attack type (1=Melee, 2=Elemental, 3=Magic) for {ATK} icon
 */
export function parseTokens(text: string, attackType?: number): TokenSegment[] {
  const segments: TokenSegment[] = []
  const regex = /\{([A-Z_]+)\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Resolve ATK icon based on card's attack type
  const atkImg = attackTypeImgMap[attackType ?? 1] ?? attackTypeImg1

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    const tokenName = match[1]!

    if (tokenName === 'ATK') {
      segments.push({
        type: 'icon',
        value: 'ATK',
        img: atkImg,
        color: '#ef4444',
        label: 'Atak',
      })
    } else {
      const tokenInfo = tokenMap[tokenName]
      if (tokenInfo) {
        segments.push({
          type: 'icon',
          value: tokenName,
          img: tokenInfo.img,
          iconify: tokenInfo.iconify,
          color: tokenInfo.color,
          label: tokenInfo.label,
        })
      } else {
        segments.push({ type: 'text', value: match[0] })
      }
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}

/**
 * Check if text contains any tokens.
 */
export function hasTokens(text: string): boolean {
  return /\{[A-Z_]+\}/.test(text)
}
