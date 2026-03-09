<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { useUIStore } from '../../stores/uiStore'
import { GamePhase, CardPosition } from '../../game-engine/constants'
import { getAllCreaturesOnField } from '../../game-engine/LineManager'

const game = useGameStore()
const ui = useUIStore()

const hint = computed((): { text: string; type: 'info' | 'warn' | 'ok' } | null => {
  if (game.winner) return null

  // AI thinking hint
  if (!game.isPlayerTurn) {
    if (game.isAIThinking) return { text: 'Przeciwnik rozważa swój ruch...', type: 'info' }
    return null
  }

  // Pending interaction — modal handles it
  if (game.state?.pendingInteraction || game.state?.awaitingOnPlayConfirmation) return null

  const phase = game.currentPhase

  if (phase === GamePhase.PLAY) {
    if (ui.pendingArtifactId) {
      return { text: 'Kliknij swoją istotę na polu, aby wyposażyć artefakt', type: 'info' }
    }
    if (ui.isEnhancedMode) {
      return { text: '⚡ Tryb wzmocniony — kliknij kartę przygody, aby zagrać za 1 ZŁ (efekt ulepszony)', type: 'warn' }
    }
    if (ui.isMovingCard) {
      return { text: 'Kliknij linię docelową, aby przenieść istotę', type: 'info' }
    }
    if (ui.isPlacingCard) {
      return { text: 'Kliknij linię na polu, aby wystawić istotę', type: 'info' }
    }
    return { text: 'Faza Wystawiania — wystaw istotę, zagraj kartę przygody lub przenieś istotę na pole [Spacja → dalej]', type: 'info' }
  }

  if (phase === GamePhase.COMBAT) {
    if (ui.isSelectingTarget) {
      return { text: 'Kliknij podświetlonego wroga, aby zaatakować', type: 'warn' }
    }

    // Sprawdź czy ktoś w ogóle może atakować
    const canAttackers = game.state
      ? getAllCreaturesOnField(game.state, 'player1').filter(
          c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack
        )
      : []

    if (canAttackers.length === 0) {
      return { text: 'Brak istot zdolnych do ataku — zakończ turę [Spacja]', type: 'ok' }
    }

    return { text: `Faza Walki — wybierz swoją istotę (⚔ ATK) aby zaatakować [Spacja → zakończ turę, Esc → anuluj]`, type: 'warn' }
  }

  return null
})
</script>

<template>
  <Transition name="hint-fade">
    <div v-if="hint" :class="['game-hint', `hint-${hint.type}`]">
      {{ hint.text }}
    </div>
  </Transition>
</template>

<style scoped>
.game-hint {
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  padding: 5px 16px;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.hint-info {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.06);
  border-top: 1px solid rgba(59, 130, 246, 0.15);
}

.hint-warn {
  color: #fcd34d;
  background: rgba(251, 191, 36, 0.06);
  border-top: 1px solid rgba(251, 191, 36, 0.15);
}

.hint-ok {
  color: #86efac;
  background: rgba(134, 239, 172, 0.06);
  border-top: 1px solid rgba(134, 239, 172, 0.15);
}

.hint-ai {
  color: #fca5a5;
  background: rgba(252, 165, 165, 0.06);
  border-top: 1px solid rgba(252, 165, 165, 0.15);
  animation: blink 1.5s ease infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hint-fade-enter-active, .hint-fade-leave-active { transition: opacity 0.2s; }
.hint-fade-enter-from, .hint-fade-leave-to { opacity: 0; }
</style>
