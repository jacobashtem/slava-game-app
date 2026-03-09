<script setup lang="ts">
/**
 * WeatherEffects — seasonal particle effects using tsParticles.
 * Replaces 8-25 CSS div particles with GPU-accelerated canvas particles.
 */
import { computed, ref, watch, onMounted } from 'vue'

const props = defineProps<{
  season: 'spring' | 'summer' | 'autumn' | 'winter'
}>()

const containerRef = ref<any>(null)

const particlesId = computed(() => `weather-${props.season}`)

/** tsParticles config per season */
const particlesOptions = computed(() => {
  const base = {
    fullScreen: false,
    fpsLimit: 60,
    detectRetina: true,
    background: { color: 'transparent' },
  }

  switch (props.season) {
    case 'spring':
      return {
        ...base,
        particles: {
          number: { value: 18 },
          shape: {
            type: 'char',
            options: {
              char: {
                value: ['🌸', '🌺', '✿'],
                font: 'serif',
                weight: '400',
              },
            },
          },
          size: { value: { min: 8, max: 14 } },
          opacity: { value: { min: 0.15, max: 0.5 }, animation: { enable: true, speed: 0.3, minimumValue: 0.1 } },
          move: {
            enable: true,
            speed: { min: 0.5, max: 1.5 },
            direction: 'bottom' as const,
            drift: 1.5,
            outModes: { default: 'out' as const },
          },
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
          opacity: {
            value: { min: 0.1, max: 0.6 },
            animation: { enable: true, speed: 0.8, minimumValue: 0.05, sync: false },
          },
          move: {
            enable: true,
            speed: { min: 0.2, max: 0.6 },
            direction: 'none' as const,
            random: true,
            outModes: { default: 'bounce' as const },
          },
          shadow: {
            enable: true,
            color: '#fbbf24',
            blur: 8,
          },
        },
      }
    case 'autumn':
      return {
        ...base,
        particles: {
          number: { value: 22 },
          shape: {
            type: 'char',
            options: {
              char: {
                value: ['🍂', '🍁', '🍃'],
                font: 'serif',
                weight: '400',
              },
            },
          },
          size: { value: { min: 10, max: 16 } },
          opacity: { value: { min: 0.15, max: 0.45 } },
          move: {
            enable: true,
            speed: { min: 0.8, max: 2 },
            direction: 'bottom' as const,
            drift: 2.5,
            outModes: { default: 'out' as const },
          },
          rotate: {
            value: { min: 0, max: 360 },
            animation: { enable: true, speed: 5 },
          },
          wobble: { enable: true, distance: 20, speed: 5 },
        },
      }
    case 'winter':
      return {
        ...base,
        particles: {
          number: { value: 35 },
          shape: {
            type: 'char',
            options: {
              char: {
                value: ['❄', '❅', '•'],
                font: 'serif',
                weight: '400',
              },
            },
          },
          size: { value: { min: 4, max: 12 } },
          color: { value: ['#e2e8f0', '#cbd5e1', '#ffffff'] },
          opacity: { value: { min: 0.1, max: 0.4 } },
          move: {
            enable: true,
            speed: { min: 0.3, max: 1.2 },
            direction: 'bottom' as const,
            drift: 1,
            outModes: { default: 'out' as const },
          },
          wobble: { enable: true, distance: 10, speed: 2 },
        },
      }
    default:
      return base
  }
})
</script>

<template>
  <div class="weather-layer" aria-hidden="true">
    <vue-particles
      :id="particlesId"
      :key="season"
      :options="particlesOptions"
      class="particles-canvas"
    />
  </div>
</template>

<style scoped>
.weather-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.particles-canvas {
  width: 100%;
  height: 100%;
}
/* Reduce particles on mobile for performance */
@media (max-width: 767px) {
  .weather-layer {
    opacity: 0.6;
  }
}
</style>
