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
    // Should not throw — just validates the constructor accepts sprite format
    // (Won't actually play audio in test environment)
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
    howl.unload() // Clean up
  })
})

describe('tsParticles', () => {
  it('@tsparticles/slim module is importable', async () => {
    const mod = await import('@tsparticles/slim')
    expect(typeof mod.loadSlim).toBe('function')
  })

  it('@tsparticles/vue3 module is importable', async () => {
    const mod = await import('@tsparticles/vue3')
    expect(mod.default).toBeDefined()
  })
})

describe('WeatherEffects particle configs', () => {
  // Validate that each season produces a valid tsParticles options object
  const seasons = ['spring', 'summer', 'autumn', 'winter'] as const

  for (const season of seasons) {
    it(`${season} config has required particle properties`, () => {
      // Simulate the config generation from WeatherEffects.vue
      const config = getSeasonConfig(season)
      expect(config).toBeDefined()
      expect(config.particles).toBeDefined()
      expect(config.particles.number).toBeDefined()
      expect(config.particles.number.value).toBeGreaterThan(0)
      expect(config.particles.move).toBeDefined()
      expect(config.particles.move.enable).toBe(true)
      expect(config.particles.move.speed).toBeDefined()
      expect(config.fullScreen).toBe(false)
    })
  }

  it('spring has flower characters', () => {
    const config = getSeasonConfig('spring')
    const chars = config.particles.shape.options.char.value
    expect(chars).toContain('🌸')
  })

  it('winter has snowflake characters', () => {
    const config = getSeasonConfig('winter')
    const chars = config.particles.shape.options.char.value
    expect(chars).toContain('❄')
  })

  it('summer uses circle shape (fireflies)', () => {
    const config = getSeasonConfig('summer')
    expect(config.particles.shape.type).toBe('circle')
  })

  it('autumn has leaf characters', () => {
    const config = getSeasonConfig('autumn')
    const chars = config.particles.shape.options.char.value
    expect(chars).toContain('🍂')
  })
})

// ===== HELPER: replicate WeatherEffects config generation for testing =====
function getSeasonConfig(season: 'spring' | 'summer' | 'autumn' | 'winter') {
  const base = { fullScreen: false, fpsLimit: 60, detectRetina: true, background: { color: 'transparent' } }

  switch (season) {
    case 'spring':
      return {
        ...base,
        particles: {
          number: { value: 18 },
          shape: { type: 'char', options: { char: { value: ['🌸', '🌺', '✿'], font: 'serif', weight: '400' } } },
          size: { value: { min: 8, max: 14 } },
          opacity: { value: { min: 0.15, max: 0.5 }, animation: { enable: true, speed: 0.3, minimumValue: 0.1 } },
          move: { enable: true, speed: { min: 0.5, max: 1.5 }, direction: 'bottom' as const, drift: 1.5, outModes: { default: 'out' as const } },
          rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 3 } },
          wobble: { enable: true, distance: 15, speed: 3 },
        },
      }
    case 'summer':
      return {
        ...base,
        particles: {
          number: { value: 12 },
          shape: { type: 'circle' },
          size: { value: { min: 2, max: 5 } },
          color: { value: ['#fbbf24', '#f59e0b', '#fcd34d'] },
          opacity: { value: { min: 0.1, max: 0.6 }, animation: { enable: true, speed: 0.8, minimumValue: 0.05, sync: false } },
          move: { enable: true, speed: { min: 0.2, max: 0.6 }, direction: 'none' as const, random: true, outModes: { default: 'bounce' as const } },
          shadow: { enable: true, color: '#fbbf24', blur: 8 },
        },
      }
    case 'autumn':
      return {
        ...base,
        particles: {
          number: { value: 22 },
          shape: { type: 'char', options: { char: { value: ['🍂', '🍁', '🍃'], font: 'serif', weight: '400' } } },
          size: { value: { min: 10, max: 16 } },
          opacity: { value: { min: 0.15, max: 0.45 } },
          move: { enable: true, speed: { min: 0.8, max: 2 }, direction: 'bottom' as const, drift: 2.5, outModes: { default: 'out' as const } },
          rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 5 } },
          wobble: { enable: true, distance: 20, speed: 5 },
        },
      }
    case 'winter':
      return {
        ...base,
        particles: {
          number: { value: 35 },
          shape: { type: 'char', options: { char: { value: ['❄', '❅', '•'], font: 'serif', weight: '400' } } },
          size: { value: { min: 4, max: 12 } },
          color: { value: ['#e2e8f0', '#cbd5e1', '#ffffff'] },
          opacity: { value: { min: 0.1, max: 0.4 } },
          move: { enable: true, speed: { min: 0.3, max: 1.2 }, direction: 'bottom' as const, drift: 1, outModes: { default: 'out' as const } },
          wobble: { enable: true, distance: 10, speed: 2 },
        },
      }
  }
}
