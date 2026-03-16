/**
 * useTutorial — modal-based step-by-step tutorial.
 *
 * Each step shows a styled popup with narrator text + button.
 * Highlighted elements get a golden pulsing outline.
 * Some steps wait for player action, others advance on click.
 */

import { ref, watch, readonly, nextTick, shallowRef } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { GamePhase } from '../game-engine/constants'

export interface TutorialStep {
  id: string
  icon: string
  title: string
  body: string[]
  highlight?: string
  position?: 'top' | 'bottom' | 'center'
  advance: 'click' | 'field' | 'position' | 'phase' | 'attack'
  waitPhase?: string
}

const STEPS: TutorialStep[] = [
  // ═══════ INTRO ═══════
  {
    id: 'welcome',
    icon: 'game-icons:hooded-figure',
    title: 'Witaj, Wojowniku!',
    body: [
      'Ja Żerca — kapłan bogów słowiańskich.',
      'Poprowadzę cię przez twoją pierwszą bitwę krok po kroku. Nie spiesz się — wyjaśnię wszystko po kolei.',
      'Kliknij DALEJ gdy będziesz gotowy.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ RĘKA ═══════
  {
    id: 'hand',
    icon: 'game-icons:card-pickup',
    title: 'Twoja Ręka',
    body: [
      'Na dole ekranu widzisz swoje karty — to twoja RĘKA. Zaczynasz z 5 kartami.',
      'Są dwa rodzaje kart: ISTOTY (wojownicy, potwory, duchy) i PRZYGODY (zaklęcia, artefakty, lokacje).',
      'Istoty wystawiasz na pole bitwy żeby walczyły. Przygody dają specjalne efekty.',
    ],
    highlight: '.hand-cards',
    position: 'top',
    advance: 'click',
  },

  // ═══════ POLE BITWY ═══════
  {
    id: 'field_overview',
    icon: 'game-icons:battle-gear',
    title: 'Pole Bitwy',
    body: [
      'Pole bitwy dzieli się na 3 linie — każda ma inną rolę. Twoje pole jest na dole, wroga na górze.',
      'To gdzie postawisz istotę ma znaczenie! Zaraz wyjaśnię każdą linię.',
    ],
    highlight: '.player-field',
    position: 'top',
    advance: 'click',
  },

  // ═══════ LINIA 1: FRONT ═══════
  {
    id: 'line_front',
    icon: 'game-icons:broadsword',
    title: 'L1 — Linia Frontu',
    body: [
      'Pierwsza linia to FRONT. Tu walczą wojownicy WRĘCZ — miecze, topory, pięści.',
      'Atak wręcz trafia TYLKO pierwszą zajętą linię wroga. Jeśli wróg ma kogoś na L1 — twój wojownik wręcz nie dosięgnie L2 ani L3.',
      'Tu trafiają też ŻYWIOŁACY — ci co walczą ogniem, lodem, wiatrem. Działają jak wręcz, ale mają jedną przewagę: potrafią trafić istoty LATAJĄCE, których zwykły wręcz nie ruszy!',
    ],
    highlight: '.player-field .line-1',
    position: 'top',
    advance: 'click',
  },

  // ═══════ LINIA 2: DYSTANS ═══════
  {
    id: 'line_ranged',
    icon: 'game-icons:bow-arrow',
    title: 'L2 — Linia Dystansu',
    body: [
      'Druga linia to DYSTANS — łucznicy i strzelcy.',
      'Atak dystansowy jest potężny: ignoruje linie! Łucznik z L2 może celować w DOWOLNĄ linię wroga — nawet jeśli wróg ma pełny front.',
      'Ale uwaga: L2 jest CHRONIONA przez L1. Wróg walczący wręcz nie dosięgnie twoich łuczników dopóki masz kogoś na L1.',
    ],
    highlight: '.player-field .line-2',
    position: 'top',
    advance: 'click',
  },

  // ═══════ LINIA 3: WSPARCIE ═══════
  {
    id: 'line_support',
    icon: 'game-icons:magic-swirl',
    title: 'L3 — Linia Wsparcia',
    body: [
      'Trzecia linia to WSPARCIE — tu stoi magia.',
      'Atak magiczny, podobnie jak dystans, trafia DOWOLNĄ linię wroga. Magowie mogą celować w kogo chcą!',
      'L3 jest najlepiej chroniona — wróg wręcz musi najpierw przebić L1, potem L2, żeby dosięgnąć twoich magów. Ale dystans i magia wroga celują wszędzie!',
    ],
    highlight: '.player-field .line-3',
    position: 'top',
    advance: 'click',
  },

  // ═══════ LATAJĄCE ═══════
  {
    id: 'flying',
    icon: 'game-icons:liberty-wing',
    title: 'Istoty Latające',
    body: [
      'Niektóre istoty LATAJĄ — mają ikonę skrzydeł.',
      'Atak WRĘCZ nie trafia latających! Miecz nie dosięgnie smoka w powietrzu.',
      'Ale ŻYWIOŁ (ogień, lód), DYSTANS (łuki) i MAGIA — trafiają latających normalnie. Pamiętaj o tym dobierając armię!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ WYSTAWIANIE ISTOTY ═══════
  {
    id: 'play_prompt',
    icon: 'game-icons:card-play',
    title: 'Wystaw Istotę!',
    body: [
      'Czas na praktykę! Kliknij kartę istoty w ręce — podświetlą się linie na które możesz ją postawić.',
      'Potem kliknij wybraną linię. Istota pojawi się na polu w pozycji OBRONA.',
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
      'Twoja istota stoi na polu! Widzisz niebieską ramkę i pionową orientację? To pozycja OBRONA.',
      'Zaraz wyjaśnię co to znaczy i czym się różni od ATAKU.',
    ],
    highlight: '.player-field .creature-card',
    position: 'top',
    advance: 'click',
  },

  // ═══════ POZYCJA OBRONA ═══════
  {
    id: 'defense_explain',
    icon: 'game-icons:shield-echoes',
    title: 'Pozycja: OBRONA',
    body: [
      'Karta pionowo z niebieską ramką = pozycja OBRONA.',
      'Istota w obronie NIE MOŻE aktywnie atakować — ale ma supermoc: gdy wróg ją zaatakuje, KONTRATAKUJE automatycznie!',
      'To znaczy, że wróg oberwie swoim ATK w twarz. Obaj mogą stracić punkty życia, a nawet obaj mogą zginąć!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ POZYCJA ATAK ═══════
  {
    id: 'attack_explain',
    icon: 'game-icons:broadsword',
    title: 'Pozycja: ATAK',
    body: [
      'Karta poziomo z czerwoną ramką = pozycja ATAK.',
      'Istota w ataku MOŻE aktywnie celować we wrogą istotę i zadać obrażenia. Ale jest ryzyko — jeśli wróg jest w OBRONIE, dostaniesz kontrę!',
      'Istota w ATAKU sama NIE kontratakuje gdy ją zaatakują. Jest odsłonięta.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ ZMIANA POZYCJI ═══════
  {
    id: 'position_prompt',
    icon: 'game-icons:cycle',
    title: 'Obróć Kartę!',
    body: [
      'Kliknij swoją kartę na polu aby zmienić jej pozycję z OBRONY na ATAK.',
      'Zmiana pozycji jest darmowa, ale uwaga: istota która zmieniła pozycję w tej turze nie może atakować!',
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
      'Karta leży teraz poziomo z czerwoną ramką — gotowa do ataku w następnej turze!',
      'Strategia: zostaw istoty w OBRONIE jeśli chcesz kontrować, przełącz na ATAK gdy chcesz zaatakować.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ FAZY TURY ═══════
  {
    id: 'phases',
    icon: 'game-icons:hourglass',
    title: 'Fazy Tury',
    body: [
      'Każda tura dzieli się na fazy:',
      '1. WYSTAWIANIE — wystawiasz istoty, grasz przygody, zmieniasz pozycje.',
      '2. WALKA — atakujesz wrogim istotom swoimi kartami w pozycji ATAK.',
      '3. KONIEC — efekty końca tury, tura przechodzi do wroga.',
      'Kliknij przycisk fazy (np. "DO BOJU") żeby przejść dalej!',
    ],
    highlight: '.phase-btn',
    position: 'bottom',
    advance: 'phase',
    waitPhase: GamePhase.COMBAT,
  },

  // ═══════ ATAK ═══════
  {
    id: 'combat_explain',
    icon: 'game-icons:battle-axe',
    title: 'Walka!',
    body: [
      'Teraz faza WALKI. Kliknij swoją istotę w pozycji ATAK, potem kliknij wrogą istotę.',
      'Twoja istota zada obrażenia równe swojemu ATK. Obrażenia odejmują się od DEF (punktów życia) wroga.',
      'Jeśli DEF wroga spadnie do 0 lub mniej — zginie! Ale jeśli wróg jest w OBRONIE, kontrze — i ty też oberwiesz.',
    ],
    highlight: '.enemy-field .creature-card',
    position: 'top',
    advance: 'attack',
  },
  {
    id: 'combat_done',
    icon: 'game-icons:check-mark',
    title: 'Brawo!',
    body: [
      'Widziałeś walkę w akcji! ATK atakującego → odjęte od DEF obrońcy.',
      'Jeśli obrońca był w OBRONIE → kontraatak: jego ATK → odjęte od DEF atakującego.',
      'Dlatego atakowanie istoty w obronie jest ryzykowne — ale czasem konieczne!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ STATY KARTY ═══════
  {
    id: 'stats',
    icon: 'game-icons:crossed-swords',
    title: 'Statystyki Karty',
    body: [
      'Każda istota ma dwie główne statystyki na dole karty:',
      'ATK (czerwona, ⚔) — ile obrażeń zadaje przy ataku.',
      'DEF (niebieska, 🛡) — ile obrażeń wytrzyma zanim zginie.',
      'Gdy DEF spadnie do 0 → istota trafia na cmentarz. Nie można jej odzyskać (chyba że masz specjalny efekt).',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ PUNKTY SŁAWY ═══════
  {
    id: 'ps',
    icon: 'game-icons:laurel-crown',
    title: 'Punkty Sławy (PS)',
    body: [
      'W panelu z boku widzisz liczbę PS — Punkty Sławy. To waluta gry.',
      'Za PS możesz: wzmacniać karty przygody (silniejszy efekt za 1 PS) i aktywować specjalne zdolności istot.',
      'PS jest mało — zarządzaj nimi mądrze! Nie wydawaj na wzmocnienie byle czego.',
    ],
    highlight: '.gold-section',
    position: 'center',
    advance: 'click',
  },

  // ═══════ PRZYGODY ═══════
  {
    id: 'adventures',
    icon: 'game-icons:spell-book',
    title: 'Karty Przygody',
    body: [
      'W ręce masz też karty PRZYGODY — rozpoznasz je po kolorowym tle.',
      'Są 3 typy: ZDARZENIA (jednorazowy efekt), ARTEFAKTY (przypinasz do istoty) i LOKACJE (pasywny efekt na polu).',
      'Zagrywasz je w fazie WYSTAWIANIA. Każda ma efekt podstawowy (darmowy) i WZMOCNIONY (za 1 PS) — znacznie silniejszy!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ DOBIERANIE ═══════
  {
    id: 'draw',
    icon: 'game-icons:card-draw',
    title: 'Dobieranie Kart',
    body: [
      'Na początku każdej tury automatycznie dobierasz kartę z talii.',
      'Gdy talia się skończy i nie masz kart w ręce ani na polu — przegrywasz! Pilnuj swoich zasobów.',
      'Niektóre efekty pozwalają dobierać dodatkowe karty — to duża przewaga.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ ZAKOŃCZENIE ═══════
  {
    id: 'complete',
    icon: 'game-icons:triquetra',
    title: 'Gotowy do Bitwy!',
    body: [
      'To wszystko co musisz wiedzieć na start! Reszty nauczysz się w boju.',
      'Klikaj przycisk fazy żeby przechodzić dalej. Zakończ turę gdy nie masz więcej ruchów.',
      'Niech bogowie będą łaskawi, wojowniku! ⚔',
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
  showModal.value = true
  advancePending = false
}

function dismissModal() {
  showModal.value = false
  const step = currentStepData.value
  if (!step) return
  if (step.advance === 'click') nextStep()
  // For action steps: modal dismissed, watchers handle progression
}

function nextStep() {
  const nextIdx = currentStepIndex.value + 1
  if (nextIdx >= STEPS.length) { finish(); return }
  currentStepIndex.value = nextIdx
  showStep()
}

function onActionCompleted() {
  if (advancePending) return
  advancePending = true
  setTimeout(nextStep, 800)
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

      if (step.advance === 'phase' && step.waitPhase && game.currentPhase === step.waitPhase)
        onActionCompleted()

      if (step.advance === 'field') {
        const has = game.state?.players.player1.field.lines
          ? Object.values(game.state.players.player1.field.lines).some((l: any) => l.length > 0) : false
        if (has) onActionCompleted()
      }

      if (step.advance === 'attack') {
        if ((game.actionLog ?? []).some(e => e.type === 'attack' || e.type === 'damage'))
          onActionCompleted()
      }

      if (step.advance === 'position') {
        const has = game.state?.players.player1.field.lines
          ? Object.values(game.state.players.player1.field.lines).some((l: any) =>
              l.some((c: any) => c.position === 'attack')) : false
        if (has) onActionCompleted()
      }
    }, { deep: true })
  }

  function startTutorial() {
    isActive.value = true
    currentStepIndex.value = 0
    advancePending = false
    setTimeout(showStep, 1200)
  }

  return {
    isActive: readonly(isActive),
    showModal: readonly(showModal),
    step: readonly(currentStepData),
    stepIndex: readonly(currentStepIndex),
    totalSteps: STEPS.length,
    dismissModal,
    startTutorial,
    stopTutorial: finish,
  }
}
