/**
 * useTutorial — step-based tutorial system.
 *
 * Watches gameStore state and progresses through tutorial steps.
 * Each step has a narrator message + optional highlight selector.
 * Messages are fed into GameChat via a reactive messages array.
 */

import { ref, watch, readonly, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { GamePhase } from '../game-engine/constants'

// ===== STEP DEFINITIONS =====

interface TutorialStep {
  id: string
  messages: string[]
  highlight?: string       // CSS selector to highlight
  waitFor: 'phase' | 'field' | 'action' | 'delay' | 'attack' | 'position'
  waitPhase?: string       // for waitFor: 'phase'
  waitDelay?: number       // for waitFor: 'delay'
}

const STEPS: TutorialStep[] = [
  // === INTRO ===
  {
    id: 'welcome',
    messages: [
      'Witaj, wojowniku! Ja Żerca — kapłan bogów.',
      'Poprowadzę cię przez twoją pierwszą bitwę. Słuchaj uważnie.',
    ],
    waitFor: 'delay',
    waitDelay: 4000,
  },
  {
    id: 'explain_hand',
    messages: [
      'Na dole ekranu widzisz swoje karty — to twoja RĘKA. Masz 5 kart na start.',
      'Każda karta to istota lub przygoda. Istoty walczą na polu bitwy.',
    ],
    highlight: '.hand-cards',
    waitFor: 'delay',
    waitDelay: 5000,
  },
  {
    id: 'explain_field',
    messages: [
      'Pole bitwy ma 3 linie: FRONT (L1), DYSTANS (L2) i WSPARCIE (L3).',
      'Wręcz i Żywioł walczą na L1. Dystans na L2. Magia na L3.',
    ],
    highlight: '.player-field .battle-line',
    waitFor: 'delay',
    waitDelay: 5000,
  },

  // === LEKCJA 1: WYSTAWIANIE ===
  {
    id: 'play_creature',
    messages: [
      'Teraz WYSTAW istotę z ręki! Kliknij kartę w ręce, potem kliknij linię na polu.',
      'Spróbuj wystawić kartę na podświetloną linię.',
    ],
    highlight: '.hand-cards',
    waitFor: 'field', // wait until a creature appears on player field
  },
  {
    id: 'creature_played',
    messages: [
      'Świetnie! Twoja istota jest teraz na polu w pozycji OBRONA (pionowo).',
      'W obronie istota KONTRATAKUJE gdy wróg ją zaatakuje. To ważne!',
    ],
    waitFor: 'delay',
    waitDelay: 4000,
  },

  // === LEKCJA 2: POZYCJE ===
  {
    id: 'explain_positions',
    messages: [
      'Teraz zmień pozycję istoty na ATAK — kliknij na swoją kartę na polu.',
      'W ATAKU karta leży poziomo i może ATAKOWAĆ wroga. Ale nie kontratakuje!',
    ],
    highlight: '.player-field .creature-card',
    waitFor: 'position', // wait until a card changes to attack position
  },
  {
    id: 'position_changed',
    messages: [
      'Doskonale! Karta w pozycji ATAK (poziomo, czerwony border).',
      'Pamiętaj: OBRONA = kontratakuje, ATAK = może aktywnie atakować.',
    ],
    waitFor: 'delay',
    waitDelay: 3500,
  },

  // === LEKCJA 3: FAZY ===
  {
    id: 'explain_phases',
    messages: [
      'Każda tura ma fazy: WYSTAWIANIE → WALKA → KONIEC.',
      'Teraz kliknij przycisk "DO BOJU" aby przejść do fazy walki!',
    ],
    highlight: '.phase-btn',
    waitFor: 'phase',
    waitPhase: GamePhase.COMBAT,
  },

  // === LEKCJA 4: ATAK ===
  {
    id: 'explain_attack',
    messages: [
      'Faza WALKI! Kliknij swoją istotę w pozycji ATAK, potem kliknij wrogą istotę.',
      'Twoja istota zada obrażenia równe swojemu ATK.',
    ],
    highlight: '.enemy-field .creature-card',
    waitFor: 'attack', // wait for a combat to happen
  },
  {
    id: 'after_attack',
    messages: [
      'Brawo! Widziałeś obrażenia? ATK atakującego odejmuje się od DEF obrońcy.',
      'Jeśli DEF spadnie do 0 — istota ginie. Kontratak działa tak samo.',
    ],
    waitFor: 'delay',
    waitDelay: 4500,
  },

  // === LEKCJA 5: PS I PRZYGODY ===
  {
    id: 'explain_ps',
    messages: [
      'Po lewej widzisz PS — Punkty Sławy. To waluta gry.',
      'Za PS możesz wzmacniać karty przygody i aktywować zdolności istot.',
    ],
    highlight: '.gold-section',
    waitFor: 'delay',
    waitDelay: 4000,
  },
  {
    id: 'explain_adventures',
    messages: [
      'W ręce masz też karty PRZYGODY — mają kolorowe tło i efekty.',
      'Zagraj je w fazie WYSTAWIANIA. Mogą leczyć, osłabiać wroga, dawać bonusy!',
    ],
    waitFor: 'delay',
    waitDelay: 4000,
  },

  // === ZAKOŃCZENIE ===
  {
    id: 'tutorial_complete',
    messages: [
      'To wszystko! Znasz już podstawy Sławy.',
      'Klikaj przycisk fazy aby przechodzić dalej. Zakończ turę gdy nie masz więcej ruchów.',
      'Reszta zależy od Ciebie, wojowniku. Niech bogowie będą łaskawi! ⚔',
    ],
    waitFor: 'delay',
    waitDelay: 1000,
  },
]

// ===== STATE =====

const isActive = ref(false)
const currentStepIndex = ref(0)
const highlightSelector = ref<string | null>(null)
const tutorialMessages = ref<string[]>([])
let initialized = false
let stepTimer: ReturnType<typeof setTimeout> | null = null

function currentStep(): TutorialStep | null {
  if (!isActive.value) return null
  return STEPS[currentStepIndex.value] ?? null
}

function advanceStep() {
  if (stepTimer) { clearTimeout(stepTimer); stepTimer = null }

  const nextIdx = currentStepIndex.value + 1
  if (nextIdx >= STEPS.length) {
    // Tutorial complete
    isActive.value = false
    highlightSelector.value = null
    return
  }

  currentStepIndex.value = nextIdx
  executeStep()
}

function executeStep() {
  const step = currentStep()
  if (!step) return

  // Push narrator messages with slight stagger
  step.messages.forEach((msg, i) => {
    setTimeout(() => {
      tutorialMessages.value = [...tutorialMessages.value, msg]
    }, i * 1200)
  })

  // Set highlight
  highlightSelector.value = step.highlight ?? null

  // Apply highlight class to DOM
  nextTick(() => applyHighlight())

  // If delay-based, auto-advance after timeout
  if (step.waitFor === 'delay' && step.waitDelay) {
    const totalMsgTime = step.messages.length * 1200
    stepTimer = setTimeout(advanceStep, Math.max(step.waitDelay, totalMsgTime + 500))
  }
}

function applyHighlight() {
  // Remove previous highlights
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'))

  if (highlightSelector.value) {
    document.querySelectorAll(highlightSelector.value).forEach(el => el.classList.add('tutorial-highlight'))
  }
}

// ===== COMPOSABLE =====

export function useTutorial() {
  if (!initialized) {
    initialized = true

    const game = useGameStore()

    // Watch for game state changes to auto-progress steps
    watch([
      () => game.currentPhase,
      () => game.actionLog?.length ?? 0,
      () => game.state?.players.player1.field,
    ], () => {
      if (!isActive.value) return
      const step = currentStep()
      if (!step) return

      // Phase-based progression
      if (step.waitFor === 'phase' && step.waitPhase && game.currentPhase === step.waitPhase) {
        setTimeout(advanceStep, 600)
      }

      // Field-based: wait for player to have creatures on field
      if (step.waitFor === 'field') {
        const hasCreatures = game.state?.players.player1.field.lines
          ? Object.values(game.state.players.player1.field.lines).some((line: any) => line.length > 0)
          : false
        if (hasCreatures) setTimeout(advanceStep, 800)
      }

      // Attack-based: watch for combat log entries
      if (step.waitFor === 'attack') {
        const log = game.actionLog ?? []
        const hasCombat = log.some(e => e.type === 'attack' || e.type === 'damage')
        if (hasCombat) setTimeout(advanceStep, 1500)
      }

      // Position-based: any card in attack position
      if (step.waitFor === 'position') {
        const hasAttacker = game.state?.players.player1.field.lines
          ? Object.values(game.state.players.player1.field.lines).some((line: any) =>
              line.some((c: any) => c.position === 'attack'))
          : false
        if (hasAttacker) setTimeout(advanceStep, 800)
      }
    }, { deep: true })
  }

  function startTutorial() {
    isActive.value = true
    currentStepIndex.value = 0
    tutorialMessages.value = []
    highlightSelector.value = null

    // Start first step after a brief delay (let game load)
    setTimeout(executeStep, 1500)
  }

  function stopTutorial() {
    isActive.value = false
    highlightSelector.value = null
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null }
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'))
  }

  return {
    isActive: readonly(isActive),
    messages: readonly(tutorialMessages),
    highlightSelector: readonly(highlightSelector),
    startTutorial,
    stopTutorial,
  }
}
