<script setup lang="ts">
/**
 * GameLoadingScreen — mystical Slavic loading overlay.
 *
 * Shows while WebGPU/TSL modules load and game state initializes.
 * SVG runic circle draws itself, embers rise, then the veil lifts.
 */
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  /** Set to true when the game is fully ready to play */
  ready?: boolean
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const phase = ref<'loading' | 'ready' | 'exit' | 'done'>('loading')
const progressHint = ref('Przywołuję duchy przodków…')

const hints = [
  'Przywołuję duchy przodków…',
  'Rysowanie runów ochronnych…',
  'Rozpalanie świętego ognia…',
  'Wyostrzanie mieczy…',
  'Budząc Żar-Ptaka…',
  'Otwieranie bram Nawii…',
]

let hintInterval: ReturnType<typeof setInterval> | null = null
let hintIdx = 0

onMounted(() => {
  // Cycle through loading hints
  hintInterval = setInterval(() => {
    hintIdx = (hintIdx + 1) % hints.length
    progressHint.value = hints[hintIdx]!
  }, 2400)
})

onUnmounted(() => {
  if (hintInterval) clearInterval(hintInterval)
})

// Watch for ready signal
import { watch } from 'vue'
watch(() => props.ready, (isReady) => {
  if (isReady && phase.value === 'loading') {
    phase.value = 'ready'
    progressHint.value = 'Bitwa czeka!'
    if (hintInterval) { clearInterval(hintInterval); hintInterval = null }
    // Brief pause to show "ready" state, then exit
    setTimeout(() => {
      phase.value = 'exit'
      setTimeout(() => {
        phase.value = 'done'
        emit('complete')
      }, 800) // exit animation duration
    }, 600)
  }
}, { immediate: true })
</script>

<template>
  <Transition name="loading-veil">
    <div v-if="phase !== 'done'" :class="['loading-screen', phase]">

      <!-- Deep background atmosphere -->
      <div class="ls-bg">
        <div class="ls-fog ls-fog-1" />
        <div class="ls-fog ls-fog-2" />
        <div class="ls-radial" />
        <div class="ls-vignette" />
      </div>

      <!-- Rising embers (CSS-only) -->
      <div class="ls-embers">
        <div v-for="i in 18" :key="i" class="ls-ember"
          :style="{
            left: (5 + (i * 37 + i * i * 13) % 90) + '%',
            animationDelay: ((i * 0.7) % 4.5) + 's',
            animationDuration: (7 + (i * 3) % 6) + 's',
            '--sz': (1.5 + (i % 4) * 0.8) + 'px',
          }"
        />
      </div>

      <!-- Central runic sigil -->
      <div class="ls-center">
        <!-- Outer rotating ring -->
        <svg class="ls-ring ls-ring-outer" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" class="ring-track" />
          <circle cx="100" cy="100" r="92" class="ring-draw" />
          <!-- Cardinal rune markers -->
          <g v-for="n in 8" :key="n"
            :transform="`rotate(${n * 45} 100 100)`"
          >
            <line x1="100" y1="12" x2="100" y2="20" class="rune-tick" />
          </g>
        </svg>

        <!-- Inner counter-rotating ring -->
        <svg class="ls-ring ls-ring-inner" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="68" class="ring-track" />
          <circle cx="100" cy="100" r="68" class="ring-draw ring-draw-2" />
          <!-- Inner ticks -->
          <g v-for="n in 12" :key="n"
            :transform="`rotate(${n * 30} 100 100)`"
          >
            <line x1="100" y1="35" x2="100" y2="40" class="rune-tick-sm" />
          </g>
        </svg>

        <!-- Pulsing core glow -->
        <div class="ls-core-glow" />

        <!-- Central triquetra symbol -->
        <div class="ls-symbol">ᛝ</div>

        <!-- Title -->
        <div class="ls-title">SŁAWA</div>
        <div class="ls-subtitle">Vol. 2</div>

        <!-- Ready flash -->
        <div v-if="phase === 'ready' || phase === 'exit'" class="ls-ready-flash" />
      </div>

      <!-- Loading info below clock -->
      <div class="ls-below">
        <div class="ls-hint">
          <Transition name="hint-fade" mode="out-in">
            <span :key="progressHint">{{ progressHint }}</span>
          </Transition>
        </div>
        <div v-show="phase === 'loading'" class="ls-dots">
          <span class="ls-dot" />
          <span class="ls-dot" />
          <span class="ls-dot" />
        </div>
      </div>

    </div>
  </Transition>
</template>

<style scoped>
/* ===== FULLSCREEN OVERLAY ===== */
.loading-screen {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #04030a;
  overflow: hidden;
}

/* ===== EXIT ANIMATION ===== */
.loading-screen.exit {
  animation: veil-lift 0.8s cubic-bezier(0.4, 0, 0, 1) forwards;
}

@keyframes veil-lift {
  0% { opacity: 1; transform: scale(1); }
  60% { opacity: 0.6; transform: scale(1.04); }
  100% { opacity: 0; transform: scale(1.12); }
}

/* Vue transition fallback */
.loading-veil-leave-active { transition: opacity 0.3s; }
.loading-veil-leave-to { opacity: 0; }

/* ===== BACKGROUND ATMOSPHERE ===== */
.ls-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ls-fog {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  animation: fog-drift 10s ease-in-out infinite;
}

.ls-fog-1 {
  width: 120%;
  height: 60%;
  bottom: -20%;
  left: -10%;
  background: radial-gradient(ellipse, rgba(140, 50, 10, 0.08) 0%, transparent 60%);
  animation-delay: 0s;
}

.ls-fog-2 {
  width: 80%;
  height: 80%;
  top: -20%;
  right: -15%;
  background: radial-gradient(ellipse, rgba(60, 20, 80, 0.06) 0%, transparent 55%);
  animation-delay: -5s;
}

@keyframes fog-drift {
  0%, 100% { opacity: 0.4; transform: translateX(0) scale(1); }
  50% { opacity: 0.8; transform: translateX(15px) scale(1.05); }
}

.ls-radial {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 55%, rgba(200, 100, 30, 0.04) 0%, transparent 50%);
}

.ls-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 20%, rgba(0, 0, 0, 0.8) 100%);
}

/* ===== RISING EMBERS ===== */
.ls-embers {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.ls-ember {
  position: absolute;
  bottom: -10px;
  width: var(--sz, 2px);
  height: var(--sz, 2px);
  border-radius: 50%;
  background: rgba(220, 110, 30, 0.7);
  box-shadow: 0 0 4px 1px rgba(200, 80, 20, 0.3);
  animation: ls-ember-rise linear infinite;
  will-change: transform, opacity;
}

@keyframes ls-ember-rise {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  8%   { opacity: 0.9; }
  40%  { transform: translateY(-40vh) translateX(8px); opacity: 0.6; }
  70%  { opacity: 0.25; }
  100% { transform: translateY(-105vh) translateX(-6px); opacity: 0; }
}

/* ===== CENTRAL SIGIL ===== */
.ls-center {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}

/* Ring SVGs */
.ls-ring {
  position: absolute;
  width: 260px;
  height: 260px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.ls-ring-outer {
  width: 280px;
  height: 280px;
  animation: ring-spin 30s linear infinite;
}

.ls-ring-inner {
  width: 240px;
  height: 240px;
  animation: ring-spin 22s linear infinite reverse;
}

@keyframes ring-spin {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

/* Ring strokes */
.ring-track {
  fill: none;
  stroke: rgba(200, 168, 78, 0.06);
  stroke-width: 1;
}

.ring-draw {
  fill: none;
  stroke: rgba(200, 168, 78, 0.35);
  stroke-width: 1.5;
  stroke-dasharray: 578;  /* 2 × π × 92 */
  stroke-dashoffset: 578;
  animation: draw-ring 3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  filter: drop-shadow(0 0 3px rgba(200, 120, 40, 0.3));
}

.ring-draw-2 {
  stroke: rgba(200, 168, 78, 0.25);
  stroke-dasharray: 427;  /* 2 × π × 68 */
  stroke-dashoffset: 427;
  animation: draw-ring-2 3.5s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
  filter: drop-shadow(0 0 2px rgba(200, 120, 40, 0.2));
}

@keyframes draw-ring {
  to { stroke-dashoffset: 0; }
}

@keyframes draw-ring-2 {
  to { stroke-dashoffset: 0; }
}

/* Tick marks */
.rune-tick {
  stroke: rgba(200, 168, 78, 0.3);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.rune-tick-sm {
  stroke: rgba(200, 168, 78, 0.15);
  stroke-width: 1;
  stroke-linecap: round;
}

/* Core glow */
.ls-core-glow {
  position: absolute;
  width: 120px;
  height: 120px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 100, 30, 0.12) 0%, transparent 70%);
  animation: core-pulse 2.5s ease-in-out infinite;
}

@keyframes core-pulse {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
}

/* Central rune character */
.ls-symbol {
  font-size: 52px;
  color: rgba(200, 168, 78, 0.7);
  text-shadow:
    0 0 20px rgba(200, 100, 30, 0.5),
    0 0 40px rgba(200, 80, 20, 0.2);
  animation: symbol-appear 1.5s cubic-bezier(0, 0.5, 0.3, 1) forwards;
  opacity: 0;
  margin-top: -10px;
  line-height: 1;
}

@keyframes symbol-appear {
  0% { opacity: 0; transform: scale(0.6); filter: blur(8px); }
  100% { opacity: 1; transform: scale(1); filter: blur(0); }
}

/* Title */
.ls-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 48px;
  font-weight: 500;
  letter-spacing: 0.32em;
  color: rgba(221, 214, 193, 0);
  margin-top: 24px;
  text-shadow:
    0 0 30px rgba(200, 100, 30, 0.2),
    0 2px 10px rgba(0, 0, 0, 0.8);
  animation: title-reveal 1.8s cubic-bezier(0, 0.5, 0.3, 1) 0.6s forwards;
}

@keyframes title-reveal {
  0% { color: rgba(221, 214, 193, 0); letter-spacing: 0.5em; }
  100% { color: rgba(221, 214, 193, 0.9); letter-spacing: 0.32em; }
}

.ls-subtitle {
  font-size: 11px;
  color: rgba(200, 168, 78, 0);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 700;
  margin-top: 4px;
  animation: fade-up 1s ease 1.4s forwards;
}

/* Loading hint */
.ls-hint {
  margin-top: 48px;
  height: 20px;
  font-size: 12px;
  color: rgba(148, 130, 100, 0.5);
  font-style: italic;
  letter-spacing: 0.06em;
  animation: fade-up 1s ease 0.5s forwards;
  opacity: 0;
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.hint-fade-enter-from { opacity: 0; transform: translateY(6px); }
.hint-fade-leave-to   { opacity: 0; transform: translateY(-6px); }

@keyframes fade-up {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* Progress dots */
.ls-dots {
  display: flex;
  gap: 6px;
  margin-top: 16px;
  animation: fade-up 0.6s ease 0.8s forwards;
  opacity: 0;
}

.ls-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(200, 168, 78, 0.4);
  animation: dot-blink 1.4s ease-in-out infinite;
}

.ls-dot:nth-child(2) { animation-delay: 0.2s; }
.ls-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-blink {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.3); }
}

/* Ready flash */
.ls-ready-flash {
  position: absolute;
  width: 350px;
  height: 350px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 168, 78, 0.15) 0%, transparent 60%);
  animation: ready-burst 0.8s ease-out forwards;
  pointer-events: none;
}

@keyframes ready-burst {
  0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}

/* ===== READY STATE ===== */
.loading-screen.ready .ls-title {
  text-shadow:
    0 0 40px rgba(200, 168, 78, 0.4),
    0 0 80px rgba(200, 100, 30, 0.2),
    0 2px 10px rgba(0, 0, 0, 0.8);
}

.loading-screen.ready .ls-symbol {
  color: rgba(200, 168, 78, 1);
  text-shadow:
    0 0 30px rgba(200, 168, 78, 0.6),
    0 0 60px rgba(200, 100, 30, 0.3);
}

.loading-screen.ready .ls-hint {
  color: rgba(200, 168, 78, 0.7);
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.15em;
}

/* Below-clock area — absolute so it doesn't shift the centered clock */
.ls-below {
  position: absolute;
  left: 50%;
  top: calc(50% + 160px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ===== MOBILE ===== */
@media (max-width: 480px) {
  .ls-ring-outer { width: 220px; height: 220px; }
  .ls-ring-inner { width: 190px; height: 190px; }
  .ls-title { font-size: 36px; }
  .ls-symbol { font-size: 40px; }
}
</style>
