<script setup lang="ts">
/**
 * TutorialOverlay — modal popup + dimmed backdrop for tutorial steps.
 * Slavic manuscript aesthetic: parchment-toned modal, runic ornaments.
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useTutorial } from '../../composables/useTutorial'

const tutorial = useTutorial()

const isAction = computed(() => {
  const adv = tutorial.step.value?.advance
  return adv && adv !== 'click'
})

const progressPct = computed(() =>
  Math.round(((tutorial.stepIndex.value + 1) / tutorial.totalSteps) * 100)
)
</script>

<template>
  <Transition name="tut-fade">
    <div v-if="tutorial.showModal.value && tutorial.step.value" class="tut-overlay" @click.self="isAction ? tutorial.dismissModal() : undefined">
      <!-- Dimmed backdrop (lighter than game over — player needs to see board) -->
      <div class="tut-dim" />

      <!-- Modal popup -->
      <div :class="['tut-modal', `tut-pos-${tutorial.step.value.position ?? 'center'}`]">
        <!-- Progress bar -->
        <div class="tut-progress">
          <div class="tut-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>

        <!-- Content -->
        <div class="tut-content">
          <!-- Icon + Title -->
          <div class="tut-header">
            <div class="tut-icon-wrap">
              <Icon :icon="tutorial.step.value.icon" class="tut-icon" />
            </div>
            <div class="tut-titles">
              <h3 class="tut-title">{{ tutorial.step.value.title }}</h3>
              <span class="tut-step-num">{{ tutorial.stepIndex.value + 1 }} / {{ tutorial.totalSteps }}</span>
            </div>
          </div>

          <!-- Body text -->
          <div class="tut-body">
            <p v-for="(line, i) in tutorial.step.value.body" :key="i">{{ line }}</p>
          </div>

          <!-- Action area -->
          <div class="tut-actions">
            <button v-if="!isAction" class="tut-btn tut-btn-next" @click="tutorial.dismissModal()">
              <span>Dalej</span>
              <Icon icon="mdi:arrow-right" />
            </button>
            <button v-else class="tut-btn tut-btn-action" @click="tutorial.dismissModal()">
              <Icon icon="game-icons:hand" />
              <span>Rozumiem — chcę spróbować!</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.tut-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.tut-dim {
  position: absolute;
  inset: 0;
  background: rgba(4, 3, 10, 0.75);
  pointer-events: none;
}

/* ===== MODAL ===== */
.tut-modal {
  position: relative;
  max-width: 420px;
  width: 92%;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(200, 168, 78, 0.04) 0%, transparent 50%),
    linear-gradient(170deg, rgba(16, 12, 24, 0.97) 0%, rgba(10, 8, 16, 0.98) 100%);
  border-radius: 14px;
  border: 1px solid rgba(200, 168, 78, 0.15);
  padding: 0;
  overflow: hidden;
  box-shadow:
    0 16px 60px rgba(0, 0, 0, 0.8),
    0 0 30px rgba(200, 100, 30, 0.06),
    inset 0 1px 0 rgba(200, 168, 78, 0.08);
  animation: tut-enter 0.35s cubic-bezier(0, 0.6, 0.3, 1) forwards;
}

/* Position variants */
.tut-pos-top { align-self: flex-start; margin-top: 60px; }
.tut-pos-bottom { align-self: flex-end; margin-bottom: 200px; }

@keyframes tut-enter {
  from { opacity: 0; transform: translateY(15px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Progress bar */
.tut-progress {
  height: 2px;
  background: rgba(200, 168, 78, 0.06);
  overflow: hidden;
}
.tut-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.4), rgba(200, 168, 78, 0.7));
  transition: width 0.4s ease;
  border-radius: 0 1px 1px 0;
}

/* Content */
.tut-content {
  padding: 20px 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Header: icon + title */
.tut-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tut-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background:
    radial-gradient(circle, rgba(200, 168, 78, 0.1) 0%, rgba(200, 168, 78, 0.03) 100%);
  border: 1px solid rgba(200, 168, 78, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tut-icon {
  font-size: 22px;
  color: rgba(200, 168, 78, 0.75);
  filter: drop-shadow(0 0 4px rgba(200, 100, 30, 0.2));
}

.tut-titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tut-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 22px;
  font-weight: 500;
  color: rgba(221, 214, 193, 0.95);
  margin: 0;
  letter-spacing: 0.04em;
  text-shadow: 0 0 12px rgba(200, 100, 30, 0.15);
}

.tut-step-num {
  font-size: 12px;
  color: rgba(148, 130, 100, 0.4);
  letter-spacing: 0.1em;
}

/* Body text */
.tut-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tut-body p {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: rgba(200, 190, 170, 0.75);
}

.tut-body p:first-child {
  color: rgba(200, 190, 170, 0.9);
}

/* Actions */
.tut-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.tut-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;
  font-family: var(--font-display, Georgia, serif);
  letter-spacing: 0.04em;
}

.tut-btn:active { transform: scale(0.97); }

.tut-btn-next {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.15), rgba(200, 168, 78, 0.08));
  border-color: rgba(200, 168, 78, 0.3);
  color: rgba(200, 168, 78, 0.95);
}
.tut-btn-next:hover {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.25), rgba(200, 168, 78, 0.12));
  border-color: rgba(200, 168, 78, 0.5);
  box-shadow: 0 0 12px rgba(200, 100, 30, 0.1);
}

.tut-btn-action {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(59, 130, 246, 0.06));
  border-color: rgba(59, 130, 246, 0.25);
  color: rgba(140, 180, 240, 0.9);
}
.tut-btn-action:hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1));
  border-color: rgba(59, 130, 246, 0.4);
}

/* Transition */
.tut-fade-enter-active { transition: opacity 0.25s; }
.tut-fade-leave-active { transition: opacity 0.2s; }
.tut-fade-enter-from, .tut-fade-leave-to { opacity: 0; }

/* ===== MOBILE ===== */
@media (max-width: 767px) {
  .tut-modal { max-width: 96%; }
  .tut-pos-top { margin-top: 40px; }
  .tut-pos-bottom { margin-bottom: 120px; }
  .tut-content { padding: 16px 18px 14px; gap: 10px; }
  .tut-title { font-size: 16px; }
  .tut-body p { font-size: 12px; }
  .tut-icon-wrap { width: 36px; height: 36px; }
  .tut-icon { font-size: 18px; }
}
</style>
