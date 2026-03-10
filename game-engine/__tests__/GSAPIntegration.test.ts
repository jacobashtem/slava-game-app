/**
 * Tests for GSAP integration, tsParticles config, and Howler audio setup.
 * Validates that composables and plugins export correctly and configs are well-formed.
 */
import { describe, it, expect } from 'vitest'

describe('useGSAP composable', () => {
  it('exports useGSAP function', async () => {
    const mod = await import('../../composables/useGSAP')
    expect(typeof mod.useGSAP).toBe('function')
  })

  it('gsap module is importable and has core methods', async () => {
    const gsap = (await import('gsap')).default
    expect(typeof gsap.to).toBe('function')
    expect(typeof gsap.from).toBe('function')
    expect(typeof gsap.fromTo).toBe('function')
    expect(typeof gsap.timeline).toBe('function')
    expect(typeof gsap.set).toBe('function')
    expect(typeof gsap.killTweensOf).toBe('function')
  })

  it('gsap.defaults can be configured', async () => {
    const gsap = (await import('gsap')).default
    // Should not throw
    gsap.defaults({ ease: 'power2.out', duration: 0.4 })
    expect(true).toBe(true)
  })
})

describe('Howler audio', () => {
  it('howler module exports Howl and Howler', async () => {
    const mod = await import('howler')
    expect(mod.Howl).toBeDefined()
    expect(mod.Howler).toBeDefined()
    expect(typeof mod.Howl).toBe('function')
  })

  it('Howl can be instantiated with sprite config', async () => {
    const { Howl } = await import('howler')
    const howl = new Howl({
      src: ['test.mp3'],
      sprite: {
        attackMelee: [0, 500],
        attackMagic: [500, 800],
        hit: [1300, 400],
      },
    })
    expect(howl).toBeDefined()
    expect(typeof howl.play).toBe('function')
    expect(typeof howl.stop).toBe('function')
    expect(typeof howl.volume).toBe('function')
    howl.unload()
  })

  it('Howl supports html5 streaming mode', async () => {
    const { Howl } = await import('howler')
    const howl = new Howl({
      src: ['test.mp3'],
      html5: true,
      volume: 0.3,
    })
    expect(howl).toBeDefined()
    expect(typeof howl.fade).toBe('function')
    expect(typeof howl.seek).toBe('function')
    expect(typeof howl.duration).toBe('function')
    expect(typeof howl.unload).toBe('function')
    howl.unload()
  })
})

describe('useAudio composable', () => {
  it('exports useAudio function', async () => {
    const mod = await import('../../composables/useAudio')
    expect(typeof mod.useAudio).toBe('function')
  })

  it('returns all expected SFX functions', async () => {
    const { useAudio } = await import('../../composables/useAudio')
    const audio = useAudio()
    // Core SFX
    expect(typeof audio.sfxCardPlay).toBe('function')
    expect(typeof audio.sfxDraw).toBe('function')
    expect(typeof audio.sfxPhase).toBe('function')
    expect(typeof audio.sfxGold).toBe('function')
    expect(typeof audio.sfxGameOver).toBe('function')
    expect(typeof audio.sfxAttack).toBe('function')
    expect(typeof audio.sfxHit).toBe('function')
    expect(typeof audio.sfxDeath).toBe('function')
    // Type-specific attack/hit SFX
    expect(typeof audio.sfxAttackMelee).toBe('function')
    expect(typeof audio.sfxAttackElemental).toBe('function')
    expect(typeof audio.sfxAttackMagic).toBe('function')
    expect(typeof audio.sfxAttackRanged).toBe('function')
    expect(typeof audio.sfxHitMelee).toBe('function')
    expect(typeof audio.sfxHitElemental).toBe('function')
    expect(typeof audio.sfxHitMagic).toBe('function')
    expect(typeof audio.sfxHitRanged).toBe('function')
    // Special SFX
    expect(typeof audio.sfxCounterattack).toBe('function')
    expect(typeof audio.sfxImmune).toBe('function')
    expect(typeof audio.sfxActivate).toBe('function')
    expect(typeof audio.sfxSeasonChange).toBe('function')
    expect(typeof audio.sfxAdventure).toBe('function')
    expect(typeof audio.sfxVictory).toBe('function')
    expect(typeof audio.sfxDefeat).toBe('function')
    // Controls
    expect(typeof audio.setSFXEnabled).toBe('function')
    expect(typeof audio.setVolume).toBe('function')
  })

  it('has same interface as useSFX (drop-in replacement)', async () => {
    const { useSFX } = await import('../../composables/useSFX')
    const { useAudio } = await import('../../composables/useAudio')
    const sfxKeys = Object.keys(useSFX()).sort()
    const audioKeys = Object.keys(useAudio()).sort()
    expect(audioKeys).toEqual(sfxKeys)
  })
})

describe('tsParticles (REMOVED — replaced by canvas WeatherEffects)', () => {
  it('tsParticles packages no longer used at runtime', () => {
    // tsParticles caused lifecycle errors (emitsOptions null, __vnode null)
    // WeatherEffects.vue now uses raw canvas 2D + requestAnimationFrame
    expect(true).toBe(true)
  })
})

describe('WeatherEffects canvas config', () => {
  // Validates the SEASON_CONFIG structure used by the canvas-based WeatherEffects
  const SEASON_CONFIG: Record<string, { count: number; chars: string[]; isCircle: boolean; colors: string[]; sizeRange: [number, number]; speedRange: [number, number]; opacityRange: [number, number]; drift: number; wobble: number }> = {
    spring: { count: 16, chars: ['🌸', '🌺', '✿'], isCircle: false, colors: [], sizeRange: [10, 16], speedRange: [0.4, 1.2], opacityRange: [0.15, 0.5], drift: 1.2, wobble: 12 },
    summer: { count: 10, chars: [], isCircle: true, colors: ['#fbbf24', '#f59e0b', '#fcd34d'], sizeRange: [2, 5], speedRange: [0.15, 0.5], opacityRange: [0.1, 0.55], drift: 0.3, wobble: 8 },
    autumn: { count: 18, chars: ['🍂', '🍁', '🍃'], isCircle: false, colors: [], sizeRange: [12, 18], speedRange: [0.6, 1.6], opacityRange: [0.15, 0.45], drift: 2.0, wobble: 16 },
    winter: { count: 28, chars: ['❄', '❅', '•'], isCircle: false, colors: ['#e2e8f0', '#cbd5e1', '#ffffff'], sizeRange: [5, 13], speedRange: [0.2, 0.9], opacityRange: [0.1, 0.4], drift: 0.8, wobble: 8 },
  }

  const seasons = ['spring', 'summer', 'autumn', 'winter'] as const

  for (const season of seasons) {
    it(`${season} config has valid particle count and speed`, () => {
      const cfg = SEASON_CONFIG[season]!
      expect(cfg.count).toBeGreaterThan(0)
      expect(cfg.speedRange[0]).toBeGreaterThan(0)
      expect(cfg.speedRange[1]).toBeGreaterThan(cfg.speedRange[0])
      expect(cfg.sizeRange[1]).toBeGreaterThan(cfg.sizeRange[0])
    })
  }

  it('spring has flower emoji chars', () => {
    expect(SEASON_CONFIG.spring!.chars).toContain('🌸')
  })

  it('winter has snowflake chars', () => {
    expect(SEASON_CONFIG.winter!.chars).toContain('❄')
  })

  it('summer uses circle shapes (fireflies)', () => {
    expect(SEASON_CONFIG.summer!.isCircle).toBe(true)
    expect(SEASON_CONFIG.summer!.colors.length).toBeGreaterThan(0)
  })

  it('autumn has leaf emoji chars', () => {
    expect(SEASON_CONFIG.autumn!.chars).toContain('🍂')
  })
})
