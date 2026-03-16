/**
 * useTutorial — modal-based step-by-step tutorial.
 *
 * Each step shows a styled popup with narrator text + "Dalej" button.
 * Highlighted elements get a golden pulsing outline.
 * Some steps wait for player action (play card, change position, attack).
 * Modal disappears during action steps, reappears after.
 */

import { ref, watch, readonly, nextTick, shallowRef } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { GamePhase } from '../game-engine/constants'

export interface TutorialStep {
  id: string
  /** Narrator character icon */
  icon: string
  /** Step title */
  title: string
  /** One or more paragraphs of text */
  body: string[]
  /** CSS selector(s) to highlight */
  highlight?: string
  /** Position hint for the popup: 'top' | 'bottom' | 'center' */
  position?: 'top' | 'bottom' | 'center'
  /** How to progress: 'click' = user clicks Dalej, 'action' = wait for game action */
  advance: 'click' | 'field' | 'position' | 'phase' | 'attack'
  /** For 'phase' advance — which phase triggers it */
  waitPhase?: string
}

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    icon: 'game-icons:hooded-figure',
    title: 'Witaj, Wojowniku!',
    body: [
      'Ja Żerca — kapłan bogów. Poprowadzę cię przez pierwszą bitwę.',
      'Każdy krok wyjaśnię na żywo. Kliknij DALEJ gdy będziesz gotowy.',
    ],
    position: 'center',
    advance: 'click',
  },
  {
    id: 'hand',
    icon: 'game-icons:card-pickup',
    title: 'Twoja Ręka',
    body: [
      'Na dole widzisz swoje karty — to twoja RĘKA.',
      'Masz 5 kart na start. Każda to istota lub przygoda.',
    ],
    highlight: '.hand-cards',
    position: 'top',
    advance: 'click',
  },
  {
    id: 'field',
    icon: 'game-icons:battle-gear',
    title: 'Pole Bitwy',
    body: [
      'Pole bitwy ma 3 linie:',
      'L1 FRONT — wręcz i żywioł walczą tutaj.',
      'L2 DYSTANS — łucznicy, chronieni przez L1.',
      'L3 WSPARCIE — magia, chroniona przez L1 i L2.',
    ],
    highlight: '.player-field .battle-line',
    position: 'top',
    advance: 'click',
  },
  {
    id: 'play_prompt',
    icon: 'game-icons:card-play',
    title: 'Wystaw istotę!',
    body: [
      'Kliknij kartę w ręce, a potem kliknij podświetloną linię na polu.',
      'Spróbuj teraz!',
    ],
    highlight: '.hand-cards',
    position: 'top',
    advance: 'field',
  },
  {
    id: 'play_done',
    icon: 'game-icons:check-mark',
    title: 'Świetnie!',
    body: [
      'Twoja istota jest na polu w pozycji OBRONA (pionowo, niebieski border).',
      'W obronie istota KONTRATAKUJE automatycznie gdy wróg ją zaatakuje!',
    ],
    highlight: '.player-field .creature-card',
    position: 'top',
    advance: 'click',
  },
  {
    id: 'position_prompt',
    icon: 'game-icons:broadsword',
    title: 'Zmień pozycję!',
    body: [
      'Kliknij swoją kartę na polu aby ją obrócić w pozycję ATAK.',
      'W ATAKU (poziomo, czerwony border) może aktywnie atakować wroga — ale nie kontratakuje!',
    ],
    highlight: '.player-field .creature-card',
    position: 'top',
    advance: 'position',
  },
  {
    id: 'position_done',
    icon: 'game-icons:check-mark',
    title: 'Doskonale!',
    body: [
      'OBRONA = kontratakuje automatycznie.',
      'ATAK = może atakować, ale nie kontratakuje.',
      'Zmiana pozycji jest darmowa, ale istota nie może atakować w turze w której zmieniła pozycję.',
    ],
    position: 'center',
    advance: 'click',
  },
  {
    id: 'phase_prompt',
    icon: 'game-icons:sword-clash',
    title: 'Do Walki!',
    body: [
      'Każda tura ma fazy: WYSTAWIANIE → WALKA → KONIEC.',
      'Kliknij przycisk fazy (DO BOJU / ATAKUJ) aby przejść do walki!',
    ],
    highlight: '.phase-btn',
    position: 'bottom',
    advance: 'phase',
    waitPhase: GamePhase.COMBAT,
  },
  {
    id: 'attack_prompt',
    icon: 'game-icons:battle-axe',
    title: 'Zaatakuj Wroga!',
    body: [
      'Kliknij swoją istotę w pozycji ATAK, potem kliknij wrogą istotę.',
      'Obrażenia = twój ATK. Jeśli wróg jest w OBRONIE — kontruje!',
    ],
    highlight: '.enemy-field .creature-card',
    position: 'top',
    advance: 'attack',
  },
  {
    id: 'attack_done',
    icon: 'game-icons:check-mark',
    title: 'Brawo!',
    body: [
      'ATK atakującego odejmuje się od DEF obrońcy.',
      'DEF ≤ 0 = istota ginie. Kontratak działa tak samo — obaj mogą paść!',
    ],
    position: 'center',
    advance: 'click',
  },
  {
    id: 'ps',
    icon: 'game-icons:laurel-crown',
    title: 'Punkty Sławy',
    body: [
      'Po lewej widzisz PS — Punkty Sławy. To waluta gry.',
      'Za PS wzmacniasz karty przygody i aktywujesz zdolności istot.',
    ],
    highlight: '.gold-section',
    position: 'center',
    advance: 'click',
  },
  {
    id: 'adventures',
    icon: 'game-icons:spell-book',
    title: 'Karty Przygody',
    body: [
      'W ręce masz też karty PRZYGODY — z kolorowym tłem.',
      'Zagraj je w fazie WYSTAWIANIA: leczą, osłabiają wroga, dają bonusy.',
      'Kliknij ikonę monet (🪙) przed zagraniem — to wzmocniony efekt za 1 PS!',
    ],
    position: 'center',
    advance: 'click',
  },
  {
    id: 'complete',
    icon: 'game-icons:triquetra',
    title: 'Gotowy do Bitwy!',
    body: [
      'Znasz już podstawy Sławy!',
      'Zakończ turę gdy nie masz więcej ruchów. Reszta zależy od Ciebie, wojowniku.',
      'Niech bogowie będą łaskawi! ⚔',
    ],
    position: 'center',
    advance: 'click',
  },
]

// ===== STATE =====

const isActive = ref(false)
const currentStepIndex = ref(0)
const showModal = ref(false)
const currentStepData = shallowRef<TutorialStep | null>(null)

let initialized = false
let advancePending = false

function applyHighlight(selector?: string) {
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'))
  if (selector) {
    nextTick(() => {
      document.querySelectorAll(selector).forEach(el => el.classList.add('tutorial-highlight'))
    })
  }
}

function showStep() {
  const step = STEPS[currentStepIndex.value]
  if (!step) { finish(); return }

  currentStepData.value = step
  applyHighlight(step.highlight)

  // For action-based steps, hide modal so player can interact
  if (step.advance !== 'click') {
    showModal.value = true
    // Show modal briefly, then hide it so player can act
    // The modal has a "Rozumiem!" button that hides it
  } else {
    showModal.value = true
  }

  advancePending = false
}

function dismissModal() {
  showModal.value = false
  const step = currentStepData.value
  if (!step) return

  if (step.advance === 'click') {
    // Click-based: advance immediately on dismiss
    nextStep()
  }
  // For action steps, modal is dismissed but we wait for the action
}

function nextStep() {
  const nextIdx = currentStepIndex.value + 1
  if (nextIdx >= STEPS.length) {
    finish()
    return
  }
  currentStepIndex.value = nextIdx
  showStep()
}

function onActionCompleted() {
  if (advancePending) return
  advancePending = true
  // Brief delay to let VFX play, then show next step
  setTimeout(() => {
    nextStep()
  }, 800)
}

function finish() {
  isActive.value = false
  showModal.value = false
  currentStepData.value = null
  applyHighlight()
}

// ===== COMPOSABLE =====

export function useTutorial() {
  if (!initialized) {
    initialized = true

    const game = useGameStore()

    watch([
      () => game.currentPhase,
      () => game.actionLog?.length ?? 0,
      () => game.state?.players.player1.field,
    ], () => {
      if (!isActive.value || showModal.value) return
      const step = currentStepData.value
      if (!step) return

      if (step.advance === 'phase' && step.waitPhase && game.currentPhase === step.waitPhase) {
        onActionCompleted()
      }

      if (step.advance === 'field') {
        const hasCreatures = game.state?.players.player1.field.lines
          ? Object.values(game.state.players.player1.field.lines).some((line: any) => line.length > 0)
          : false
        if (hasCreatures) onActionCompleted()
      }

      if (step.advance === 'attack') {
        const log = game.actionLog ?? []
        if (log.some(e => e.type === 'attack' || e.type === 'damage')) onActionCompleted()
      }

      if (step.advance === 'position') {
        const hasAttacker = game.state?.players.player1.field.lines
          ? Object.values(game.state.players.player1.field.lines).some((line: any) =>
              line.some((c: any) => c.position === 'attack'))
          : false
        if (hasAttacker) onActionCompleted()
      }
    }, { deep: true })
  }

  function startTutorial() {
    isActive.value = true
    currentStepIndex.value = 0
    advancePending = false
    setTimeout(() => showStep(), 1200)
  }

  function stopTutorial() {
    finish()
  }

  return {
    isActive: readonly(isActive),
    showModal: readonly(showModal),
    step: readonly(currentStepData),
    stepIndex: readonly(currentStepIndex),
    totalSteps: STEPS.length,
    dismissModal,
    startTutorial,
    stopTutorial,
  }
}
