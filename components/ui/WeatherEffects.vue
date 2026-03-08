<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  season: 'spring' | 'summer' | 'autumn' | 'winter'
}>()

const particleCount = computed(() => ({
  spring: 12,
  summer: 8,
  autumn: 18,
  winter: 25,
}[props.season]))

const particleChar = computed(() => ({
  spring: '🌸',
  summer: '✦',
  autumn: '🍂',
  winter: '❄',
}[props.season]))
</script>

<template>
  <div :class="['weather-layer', `weather-${season}`]" aria-hidden="true">
    <span
      v-for="i in particleCount"
      :key="i"
      class="particle"
      :style="{
        '--delay': `${(i * 1.7) % 12}s`,
        '--x-start': `${(i * 17) % 100}%`,
        '--x-drift': `${((i * 7) % 60) - 30}px`,
        '--duration': `${6 + (i * 1.3) % 8}s`,
        '--size': `${8 + (i * 3) % 10}px`,
        '--opacity': `${0.15 + (i * 0.03) % 0.35}`,
      }"
    >{{ particleChar }}</span>
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

.particle {
  position: absolute;
  top: -20px;
  left: var(--x-start, 50%);
  font-size: var(--size, 10px);
  opacity: var(--opacity, 0.2);
  animation: particle-fall var(--duration, 8s) linear var(--delay, 0s) infinite;
  filter: blur(0.5px);
  user-select: none;
}

@keyframes particle-fall {
  0% {
    transform: translateY(-20px) translateX(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: var(--opacity, 0.2);
  }
  90% {
    opacity: var(--opacity, 0.2);
  }
  100% {
    transform: translateY(calc(100vh + 20px)) translateX(var(--x-drift, 20px)) rotate(360deg);
    opacity: 0;
  }
}

/* Wiosna: delikatne płatki */
.weather-spring .particle {
  filter: blur(0.3px) drop-shadow(0 0 2px rgba(255, 182, 193, 0.3));
}

/* Lato: świetliki */
.weather-summer .particle {
  filter: none;
  animation-name: firefly-float;
  color: #fbbf24;
  text-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
}

@keyframes firefly-float {
  0% {
    transform: translateY(20%) translateX(0);
    opacity: 0;
  }
  20% {
    opacity: var(--opacity, 0.2);
  }
  50% {
    transform: translateY(40%) translateX(var(--x-drift, 20px));
    opacity: calc(var(--opacity, 0.2) * 1.5);
  }
  80% {
    opacity: var(--opacity, 0.2);
  }
  100% {
    transform: translateY(60%) translateX(calc(var(--x-drift, 20px) * -1));
    opacity: 0;
  }
}

/* Jesien: liście */
.weather-autumn .particle {
  filter: blur(0.2px) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  animation-name: leaf-fall;
}

@keyframes leaf-fall {
  0% {
    transform: translateY(-20px) translateX(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: var(--opacity, 0.2);
  }
  50% {
    transform: translateY(50vh) translateX(var(--x-drift, 20px)) rotate(180deg);
  }
  90% {
    opacity: var(--opacity, 0.2);
  }
  100% {
    transform: translateY(calc(100vh + 20px)) translateX(calc(var(--x-drift, 20px) * -0.5)) rotate(400deg);
    opacity: 0;
  }
}

/* Zima: śnieg */
.weather-winter .particle {
  color: #e2e8f0;
  filter: blur(0.3px) drop-shadow(0 0 3px rgba(255, 255, 255, 0.4));
  animation-name: snow-fall;
}

@keyframes snow-fall {
  0% {
    transform: translateY(-20px) translateX(0);
    opacity: 0;
  }
  10% {
    opacity: var(--opacity, 0.2);
  }
  50% {
    transform: translateY(50vh) translateX(var(--x-drift, 20px));
  }
  90% {
    opacity: calc(var(--opacity, 0.2) * 0.8);
  }
  100% {
    transform: translateY(calc(100vh + 20px)) translateX(calc(var(--x-drift, 20px) * 1.3));
    opacity: 0;
  }
}
</style>
