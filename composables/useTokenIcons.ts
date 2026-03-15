/**
 * Token icon renderer for ability text.
 * Parses {ATK}, {DEF}, {DEMON}, etc. and maps them to inline icon images.
 *
 * {ATK} resolves to the card's own attack type icon (context-sensitive).
 */

import domainImg1 from '~/assets/cards/domain-1.svg'
import domainImg2 from '~/assets/cards/domain-2.svg'
import domainImg3 from '~/assets/cards/domain-3.svg'
import domainImg4 from '~/assets/cards/domain-4.svg'
import attackTypeImg0 from '~/assets/cards/attackType0.svg'
import attackTypeImg1 from '~/assets/cards/attackType1.svg'
import attackTypeImg2 from '~/assets/cards/attackType2.svg'
import attackTypeImg3 from '~/assets/cards/attackType3.svg'

export interface TokenSegment {
  type: 'text' | 'icon'
  value: string        // text content or token name
  img?: string         // image URL for icons
  iconify?: string     // iconify icon name (fallback)
  color?: string       // tint color
  label?: string       // tooltip label
}

// Attack type → image mapping (0=Melee, 1=Elemental, 2=Magic, 3=Ranged)
const attackTypeImgMap: Record<number, string> = {
  0: attackTypeImg0,
  1: attackTypeImg1,
  2: attackTypeImg2,
  3: attackTypeImg3,
}

// Token → icon mapping (ATK handled separately based on card context)
const tokenMap: Record<string, { img?: string; iconify?: string; color: string; label: string }> = {
  DEF:       { iconify: 'game-icons:shield', color: '#3b82f6', label: 'Obrona' },
  DMG:       { iconify: 'game-icons:battle-axe', color: '#ef4444', label: 'Obrażenia' },
  FLY:       { iconify: 'game-icons:liberty-wing', color: '#ffffff', label: 'Lot' },
  GOLD:      { iconify: 'game-icons:two-coins', color: '#eab308', label: 'Punkty Sławy' },
  POISON:    { iconify: 'mdi:bottle-tonic', color: '#a3e635', label: 'Trucizna' },
  SILENCE:   { iconify: 'game-icons:silenced', color: '#6b7280', label: 'Uciszenie' },
  COMBAT:    { iconify: 'game-icons:sword-clash', color: '#fbbf24', label: 'Atak' },
  MELEE:     { iconify: 'game-icons:battle-axe', color: '#fb923c', label: 'Wręcz' },
  ELEMENTAL: { iconify: 'bi:fire', color: '#fb923c', label: 'Żywioł' },
  MAGIC:     { iconify: 'fa6-solid:wand-sparkles', color: '#fb923c', label: 'Magia' },
  RANGED:    { iconify: 'boxicons:bow-filled', color: '#fb923c', label: 'Dystans' },
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
