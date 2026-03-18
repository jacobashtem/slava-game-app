<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import type { NarrativeLine } from '../../game-engine/scenarios/types'

const props = defineProps<{
  lines: NarrativeLine[]
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const currentIndex = ref(0)

const currentLine = computed(() => props.lines[currentIndex.value])
const isLastLine = computed(() => currentIndex.value >= props.lines.length - 1)
const progress = computed(() => ((currentIndex.value + 1) / props.lines.length) * 100)

function advance() {
  if (isLastLine.value) {
    emit('dismiss')
  } else {
    currentIndex.value++
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault()
    advance()
  }
}

watch(() => props.lines, () => {
  currentIndex.value = 0
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="sn-overlay" @click="advance">
    <!-- Background fog -->
    <div class="sn-fog" />
    <div class="sn-vignette" />

    <div class="sn-content">
      <!-- Progress bar -->
      <div class="sn-progress-track">
        <div class="sn-progress-fill" :style="{ width: progress + '%' }" />
      </div>

      <!-- Text area -->
      <div class="sn-text-area">
        <Transition name="sn-line" mode="out-in">
          <div :key="currentIndex" class="sn-line-wrapper">
            <!-- Speaker name -->
            <div v-if="currentLine?.speaker" class="sn-speaker">
              {{ currentLine.speaker }}
            </div>

            <!-- Text -->
            <p
              :class="[
                'sn-text',
                {
                  'sn-italic': currentLine?.style === 'italic',
                  'sn-bold': currentLine?.style === 'bold',
                  'sn-narration': !currentLine?.speaker,
                  'sn-dialogue': !!currentLine?.speaker,
                }
              ]"
            >
              {{ currentLine?.text }}
            </p>
          </div>
        </Transition>
      </div>

      <!-- Continue hint -->
      <div class="sn-hint">
        <span v-if="!isLastLine">
          Kliknij lub nacisnij Enter
          <Icon icon="mdi:chevron-right" class="sn-hint-icon" />
        </span>
        <span v-else class="sn-hint-final">
          <Icon icon="game-icons:crossed-swords" class="sn-hint-icon" />
          Dalej
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sn-overlay {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.sn-fog {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(14, 10, 20, 0.97) 0%, rgba(4, 3, 10, 0.99) 60%),
    linear-gradient(180deg, rgba(60, 20, 10, 0.08) 0%, rgba(14, 10, 20, 0.98) 40%);
}

.sn-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 20%, rgba(0, 0, 0, 0.6) 100%);
  pointer-events: none;
}

.sn-content {
  position: relative;
  max-width: 640px;
  width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px 20px;
}

/* ===== PROGRESS ===== */
.sn-progress-track {
  width: 100%;
  height: 2px;
  background: rgba(200, 168, 78, 0.08);
  border-radius: 1px;
  overflow: hidden;
}

.sn-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.3), rgba(200, 100, 30, 0.5));
  transition: width 0.3s ease;
  border-radius: 1px;
}

/* ===== TEXT ===== */
.sn-text-area {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.sn-line-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.sn-speaker {
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c8a84e;
  text-shadow: 0 0 12px rgba(200, 168, 78, 0.3);
}

.sn-text {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  line-height: 1.8;
  color: rgba(220, 210, 190, 0.85);
  margin: 0;
  max-width: 560px;
}

.sn-narration {
  color: rgba(180, 165, 140, 0.65);
}

.sn-dialogue {
  color: rgba(230, 220, 200, 0.9);
}

.sn-italic {
  font-style: italic;
  color: rgba(160, 145, 120, 0.6);
}

.sn-bold {
  font-weight: 700;
  color: rgba(200, 168, 78, 0.8);
  font-size: 15px;
}

/* ===== HINT ===== */
.sn-hint {
  font-size: 11px;
  color: rgba(148, 130, 100, 0.3);
  display: flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.04em;
}

.sn-hint-icon {
  font-size: 14px;
}

.sn-hint-final {
  color: rgba(200, 168, 78, 0.5);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ===== TRANSITION ===== */
.sn-line-enter-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.sn-line-leave-active {
  transition: opacity 0.15s ease;
}
.sn-line-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.sn-line-leave-to {
  opacity: 0;
}

/* ===== MOBILE ===== */
@media (max-width: 600px) {
  .sn-text { font-size: 15px; }
  .sn-speaker { font-size: 12px; }
  .sn-content { padding: 30px 16px; }
}
</style>
