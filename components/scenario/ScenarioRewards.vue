<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useScenarioStore } from '../../stores/scenarioStore'

const { t } = useI18n()
const scenario = useScenarioStore()

const rewards = computed(() => scenario.currentRewards)
const pendingChoice = computed(() => scenario.pendingRewardChoice)

function selectTarget(instanceId: string) {
  if (!pendingChoice.value) return
  if (pendingChoice.value.type === 'buff_creature') {
    scenario.applyBuffRewardChoice(instanceId)
  } else if (pendingChoice.value.type === 'recover_graveyard') {
    scenario.applyGraveyardRecoveryChoice(instanceId)
  }
}

function continueWithoutChoice() {
  scenario.applyRewardsAndContinue()
}

const rewardIcon = (type: string): string => {
  switch (type) {
    case 'draw': return 'game-icons:card-pickup'
    case 'heal_all': return 'game-icons:health-potion'
    case 'buff_creature': return 'game-icons:upgrade'
    case 'recover_graveyard': return 'game-icons:raise-zombie'
    case 'add_adventure': return 'game-icons:scroll-unfurled'
    default: return 'game-icons:laurel-crown'
  }
}
</script>

<template>
  <div class="sr-overlay">
    <div class="sr-fog" />
    <div class="sr-vignette" />

    <div class="sr-content">
      <div class="sr-header">
        <Icon icon="game-icons:laurel-crown" class="sr-crown" />
        <h2 class="sr-title">{{ $t('scenario.reward') }}</h2>
      </div>

      <!-- Reward list -->
      <div class="sr-rewards">
        <div v-for="(r, i) in rewards" :key="i" class="sr-reward">
          <Icon :icon="rewardIcon(r.type)" class="sr-reward-icon" />
          <span class="sr-reward-text">{{ r.description }}</span>
        </div>
      </div>

      <!-- Choice: buff target -->
      <div v-if="pendingChoice?.type === 'buff_creature'" class="sr-choice">
        <p class="sr-choice-prompt">
          {{ t('scenario.chooseBuff', { value: pendingChoice.value, stat: pendingChoice.stat === 'atk' ? 'ATK' : 'DEF' }) }}
        </p>
        <div class="sr-candidates">
          <button
            v-for="c in pendingChoice.candidates"
            :key="c.instanceId"
            class="sr-candidate-btn"
            @click="selectTarget(c.instanceId)"
          >
            <Icon icon="game-icons:person" class="sr-cand-icon" />
            {{ c.name }}
          </button>
        </div>
      </div>

      <!-- Choice: graveyard recovery -->
      <div v-else-if="pendingChoice?.type === 'recover_graveyard'" class="sr-choice">
        <p class="sr-choice-prompt">{{ $t('scenario.chooseGraveyard') }}</p>
        <div class="sr-candidates">
          <button
            v-for="c in pendingChoice.candidates"
            :key="c.instanceId"
            class="sr-candidate-btn"
            @click="selectTarget(c.instanceId)"
          >
            <Icon icon="game-icons:raise-zombie" class="sr-cand-icon" />
            {{ c.name }}
          </button>
        </div>
      </div>

      <!-- Auto-continue if no choice needed -->
      <button
        v-else
        class="sr-continue-btn"
        @click="continueWithoutChoice"
      >
        <Icon icon="game-icons:compass" />
        {{ $t('scenario.continue') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sr-overlay {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sr-fog {
  position: absolute;
  inset: 0;
  background: rgba(4, 3, 10, 0.94);
}

.sr-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 20%, rgba(0, 0, 0, 0.5) 100%);
  pointer-events: none;
}

.sr-content {
  position: relative;
  max-width: 440px;
  width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 32px 24px;
}

.sr-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.sr-crown {
  font-size: 40px;
  color: #c8a84e;
  filter: drop-shadow(0 0 16px rgba(200, 168, 78, 0.4));
}

.sr-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 24px;
  font-weight: 500;
  color: #ddd6c1;
  margin: 0;
  letter-spacing: 0.1em;
  text-shadow: 0 0 20px rgba(200, 100, 30, 0.2);
}

/* ===== REWARDS ===== */
.sr-rewards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.sr-reward {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.12);
  background: rgba(200, 168, 78, 0.04);
}

.sr-reward-icon {
  font-size: 20px;
  color: #c8a84e;
  flex-shrink: 0;
}

.sr-reward-text {
  font-size: 13px;
  color: rgba(200, 190, 170, 0.8);
  line-height: 1.4;
  font-family: Georgia, serif;
}

/* ===== CHOICE ===== */
.sr-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.sr-choice-prompt {
  font-size: 13px;
  color: rgba(200, 168, 78, 0.7);
  margin: 0;
  font-weight: 600;
}

.sr-candidates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.sr-candidate-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  background: rgba(200, 168, 78, 0.06);
  color: rgba(200, 190, 170, 0.85);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.sr-candidate-btn:hover {
  background: rgba(200, 168, 78, 0.15);
  border-color: rgba(200, 168, 78, 0.4);
  color: #c8a84e;
}

.sr-cand-icon {
  font-size: 16px;
  color: rgba(200, 168, 78, 0.5);
}

/* ===== CONTINUE ===== */
.sr-continue-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.3);
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.15), rgba(200, 168, 78, 0.08));
  color: rgba(200, 168, 78, 0.9);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-display, Georgia, serif);
  letter-spacing: 0.06em;
}

.sr-continue-btn:hover {
  background: linear-gradient(135deg, rgba(200, 100, 30, 0.25), rgba(200, 168, 78, 0.12));
  border-color: rgba(200, 168, 78, 0.5);
}
</style>
