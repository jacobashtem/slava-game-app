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
  // ═══════ 1. INTRO ═══════
  {
    id: 'welcome',
    icon: 'game-icons:hooded-figure',
    title: 'Witaj, Wojowniku!',
    body: [
      'Ja Żerca — kapłan bogów słowiańskich. Poprowadzę cię przez twoją pierwszą bitwę.',
      'Będziemy szli krok po kroku. Każdą mechanikę wyjaśnię osobno, spokojnie.',
      'Kliknij DALEJ gdy będziesz gotowy.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 2. RĘKA ═══════
  {
    id: 'hand_cards',
    icon: 'game-icons:card-pickup',
    title: 'Twoja Ręka',
    body: [
      'Na dole ekranu widzisz swoje karty — to twoja RĘKA. Zaczynasz z 5 kartami.',
      'Karty dzielą się na ISTOTY i PRZYGODY. Istoty to twoi wojownicy — wystawiasz ich na pole bitwy. Przygody to zaklęcia i przedmioty — dają specjalne efekty.',
    ],
    highlight: '.hand-cards',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 3. STATY KARTY ═══════
  {
    id: 'card_stats',
    icon: 'game-icons:crossed-swords',
    title: 'Statystyki Istoty',
    body: [
      'Każda istota ma dwie liczby na dole karty:',
      'ATK (czerwona, miecz) — siła ataku. Tyle obrażeń zadaje w walce.',
      'DEF (niebieska, tarcza) — wytrzymałość. Gdy DEF spadnie do 0 — istota GINIE i trafia na cmentarz.',
      'Przykład: istota z ATK 4 atakuje wroga z DEF 6. Wróg traci 4 DEF → zostaje mu 2. Przeżył, ale jest osłabiony!',
    ],
    highlight: '.hand-cards .creature-card',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 4. POLE BITWY ═══════
  {
    id: 'field_overview',
    icon: 'game-icons:battle-gear',
    title: 'Pole Bitwy',
    body: [
      'Pole bitwy ma 3 linie — myśl o nich jak o rzędach formacji wojennej.',
      'Twoje pole jest na dole ekranu, wroga na górze. Pośrodku widzisz separator z mieczami — to linia frontu.',
      'Gdzie postawisz istotę ma OGROMNE znaczenie. Zaraz wyjaśnię każdą linię osobno.',
    ],
    highlight: '.player-field',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 5. ATAK WRĘCZ ═══════
  {
    id: 'melee',
    icon: 'game-icons:broadsword',
    title: 'Typ Ataku: Wręcz',
    body: [
      'Wojownicy WRĘCZ walczą mieczami, toporami, pięściami. Muszą być blisko wroga.',
      'Wręcz trafia TYLKO pierwszą zajętą linię wroga. Jeśli wróg ma istoty na L1 — twój wojownik wręcz nie przeskoczy do L2 ani L3. Musi najpierw oczyścić front.',
      'Miecz nie sięgnie też LATAJĄCYCH istot — smok w powietrzu jest bezpieczny przed mieczem!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 6. ATAK ŻYWIOŁEM ═══════
  {
    id: 'elemental',
    icon: 'game-icons:fire-ring',
    title: 'Typ Ataku: Żywioł',
    body: [
      'ŻYWIOŁACY walczą ogniem, lodem, wiatrem. Zasięg mają taki sam jak wręcz — trafiają pierwszą zajętą linię.',
      'ALE mają kluczową przewagę: ogień dosięgnie LATAJĄCEGO! Smok uniknie miecza, ale nie uniknie płomieni.',
      'Wręcz i żywioł walczą na linii L1 (Front).',
    ],
    highlight: '.player-field .line-1',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 7. ATAK DYSTANSOWY ═══════
  {
    id: 'ranged',
    icon: 'game-icons:bow-arrow',
    title: 'Typ Ataku: Dystans',
    body: [
      'ŁUCZNICY i strzelcy ignorują formację wroga! Strzała leci nad głowami frontu prosto do celu.',
      'Dystans celuje w DOWOLNĄ linię wroga — L1, L2 lub L3. Nie obchodzi go kto stoi z przodu.',
      'Łucznicy walczą na linii L2 (Dystans). Są chronieni przez L1 — wróg wręcz nie dosięgnie L2 dopóki masz kogoś na froncie.',
    ],
    highlight: '.player-field .line-2',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 8. ATAK MAGICZNY ═══════
  {
    id: 'magic',
    icon: 'game-icons:magic-swirl',
    title: 'Typ Ataku: Magia',
    body: [
      'MAGOWIE rzucają zaklęcia — celują w kogo chcą, jak dystans. Dowolna linia wroga.',
      'Magia walczy na linii L3 (Wsparcie). To najdalsza linia — chroniona podwójnie: przez L1 ORAZ L2.',
      'Żeby wróg wręcz dosięgnął twojego maga, musi najpierw wyeliminować WSZYSTKICH z L1, potem z L2. Magia jest bezpieczna… dopóki masz front!',
    ],
    highlight: '.player-field .line-3',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 9. GDY LINIE SĄ PUSTE ═══════
  {
    id: 'empty_lines',
    icon: 'game-icons:broken-shield',
    title: 'Uwaga: Puste Linie!',
    body: [
      'Co się stanie jeśli twoja L1 jest pusta? Wróg wręcz celuje w NASTĘPNĄ zajętą linię — więc może uderzyć L2!',
      'A jeśli L1 i L2 są puste? Wróg wręcz uderzy prosto w L3 — twoi magowie są bezbronni!',
      'Dlatego ZAWSZE pilnuj frontu. Pusty front = twoje tyły odsłonięte na ataki wręcz i żywioł.',
      'Dystans i magia wroga i tak celują wszędzie — ale przynajmniej nie dawaj wręcz darmowego dostępu!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 10. LATAJĄCE ═══════
  {
    id: 'flying',
    icon: 'game-icons:liberty-wing',
    title: 'Istoty Latające',
    body: [
      'Niektóre istoty LATAJĄ — rozpoznasz je po ikonie skrzydeł na karcie.',
      'Atak WRĘCZ kompletnie nie trafia latających. Miecz nie dosięgnie smoka!',
      'Ale ŻYWIOŁ (ogień, lód), DYSTANS (strzały) i MAGIA — trafiają latających normalnie.',
      'Budując armię, upewnij się że masz sposób na latające istoty wroga!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 11. WYSTAWIANIE ISTOTY ═══════
  {
    id: 'play_prompt',
    icon: 'game-icons:card-play',
    title: 'Wystaw Istotę!',
    body: [
      'Czas na praktykę! Kliknij kartę istoty w ręce.',
      'Podświetlą się linie na które możesz ją postawić — kliknij wybraną. Istota pojawi się na polu.',
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
      'Twoja istota jest na polu! Widzisz pionową kartę z niebieską ramką? To pozycja OBRONA.',
    ],
    highlight: '.player-field .creature-card',
    position: 'top',
    advance: 'click',
  },

  // ═══════ 13. POZYCJA OBRONA ═══════
  {
    id: 'defense_explain',
    icon: 'game-icons:shield-echoes',
    title: 'Pozycja: OBRONA',
    body: [
      'Karta stoi PIONOWO, niebieski border = OBRONA.',
      'Istota w obronie NIE może aktywnie atakować. Ale gdy wróg ją zaatakuje — KONTRATAKUJE automatycznie!',
      'Wyobraź sobie: wróg uderza mieczem, a twój wojownik odpowiada ciosem. Obaj tracą życie. Obaj mogą paść!',
      'To potężna mechanika obronna — wróg dwa razy się zastanowi zanim uderzy.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 14. POZYCJA ATAK ═══════
  {
    id: 'attack_explain',
    icon: 'game-icons:broadsword',
    title: 'Pozycja: ATAK',
    body: [
      'Karta leży POZIOMO, czerwony border = ATAK.',
      'Istota w ataku MOŻE celować we wroga i zadać mu obrażenia. Ale jest ryzyko!',
      'Jeśli wróg jest w OBRONIE — kontruje cię. Jeśli wróg jest w ATAKU — NIE kontruje (jest odsłonięty).',
      'Sama istota w ATAKU też NIE kontratakuje gdy ją zaatakują. Jest na to za zajęta szarżą.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 15. KONTRATAK SZCZEGÓŁY ═══════
  {
    id: 'counter_details',
    icon: 'game-icons:shield-bash',
    title: 'Kontratak — Ważne Szczegóły',
    body: [
      'Kontratak działa TYLKO gdy obrońca jest w pozycji OBRONA i jest w ZASIĘGU.',
      'Przykład: twój wojownik wręcz z L1 atakuje wroga na L1 w OBRONIE — wróg kontruje. Normalka.',
      'Ale jeśli twój łucznik z L2 strzela we wroga wręcz na L1 — wróg NIE kontruje! Miecz nie dosięgnie łucznika na L2.',
      'Zasięg kontry = taki sam jak zasięg ataku obrońcy. Wręcz kontruje tylko bliskie cele.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 16. OBRÓĆ KARTĘ ═══════
  {
    id: 'position_prompt',
    icon: 'game-icons:cycle',
    title: 'Obróć Kartę!',
    body: [
      'Kliknij swoją kartę na polu aby zmienić pozycję z OBRONY na ATAK.',
      'Zmiana pozycji jest darmowa — ale istota nie może atakować w turze gdy zmieniła pozycję!',
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
      'Karta leży poziomo, czerwona ramka — gotowa do boju w następnej turze!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 18. FAZY TURY ═══════
  {
    id: 'phases_intro',
    icon: 'game-icons:hourglass',
    title: 'Przebieg Tury',
    body: [
      'Każda tura ma 3 fazy:',
      '1. WYSTAWIANIE — grasz karty z ręki, zmieniasz pozycje istot.',
      '2. WALKA — atakujesz wrogów istotami w pozycji ATAK.',
      '3. KONIEC — efekty końca tury, tura przechodzi do wroga.',
    ],
    position: 'center',
    advance: 'click',
  },
  {
    id: 'phase_button',
    icon: 'game-icons:sword-clash',
    title: 'Przycisk Fazy',
    body: [
      'Widzisz przycisk na dole? Kliknij go żeby przejść do fazy WALKI!',
      'Przycisk zmienia nazwę w zależności od fazy: "DO BOJU", "ZAKOŃCZ TURĘ" itp.',
    ],
    highlight: '.phase-btn',
    position: 'bottom',
    advance: 'phase',
    waitPhase: GamePhase.COMBAT,
  },

  // ═══════ 20. WALKA ═══════
  {
    id: 'combat_how',
    icon: 'game-icons:battle-axe',
    title: 'Czas na Walkę!',
    body: [
      'Faza WALKI! Kliknij swoją istotę w ATAKU (poziomą), potem kliknij wrogą istotę.',
      'Twoja istota zada obrażenia = swój ATK. DEF wroga spadnie o tyle. Jeśli DEF ≤ 0 — wróg ginie!',
    ],
    highlight: '.enemy-field .creature-card',
    position: 'top',
    advance: 'attack',
  },
  {
    id: 'combat_done',
    icon: 'game-icons:check-mark',
    title: 'Pierwsza Walka za Tobą!',
    body: [
      'Brawo! Widziałeś animację walki i obrażenia.',
      'Pamiętaj: jeśli cel był w OBRONIE — kontrował. Jeśli w ATAKU — nie.',
      'Po ataku istota nie może atakować ponownie w tej turze (chyba że ma specjalną zdolność).',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 22. TURA WROGA ═══════
  {
    id: 'enemy_turn',
    icon: 'game-icons:skull-crossed-bones',
    title: 'Tura Wroga',
    body: [
      'Gdy zakończysz turę — gra przechodzi do wroga. AI wykona swoje ruchy: wystawi istoty, zmieni pozycje, zaatakuje.',
      'Nie możesz nic robić w turze wroga — ale twoje istoty w OBRONIE kontrują automatycznie!',
      'Dlatego dobrze jest zostawiać ważne istoty w OBRONIE na koniec tury.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 23. TALIA I CMENTARZ ═══════
  {
    id: 'deck_grave',
    icon: 'game-icons:card-draw',
    title: 'Talia i Cmentarz',
    body: [
      'Po lewej widzisz TALIĘ (stos kart) — co turę dobierasz 1 kartę. Gdy talia się skończy i nie masz istot — przegrywasz!',
      'Pod talią jest CMENTARZ — tu trafiają zabite istoty. Kliknij żeby przejrzeć co tam leży.',
      'Pilnuj zasobów! Nie trać istot bezmyślnie.',
    ],
    highlight: '.sidebar',
    position: 'center',
    advance: 'click',
  },

  // ═══════ 24. PUNKTY SŁAWY ═══════
  {
    id: 'ps',
    icon: 'game-icons:laurel-crown',
    title: 'Punkty Sławy (PS)',
    body: [
      'Duża zielona liczba to twoje PS — Punkty Sławy. Waluta gry.',
      'Wydajesz je na: wzmocnione efekty przygód (1 PS za silniejszą wersję) i aktywowane zdolności istot (koszt na karcie).',
      'PS jest mało — nie wydawaj na byle co! Najlepsze wzmocnienia zostawiaj na kluczowe momenty.',
    ],
    highlight: '.gold-section',
    position: 'center',
    advance: 'click',
  },

  // ═══════ 25. ZDOLNOŚCI ISTOT ═══════
  {
    id: 'abilities',
    icon: 'game-icons:lightning-trio',
    title: 'Zdolności Istot',
    body: [
      'Wiele istot ma unikalne zdolności! Rozpoznasz je po ikonce błyskawicy ⚡ na karcie.',
      'Zdolności PASYWNE działają automatycznie (np. "gdy ta istota zabije wroga…").',
      'Zdolności AKTYWOWANE wymagają kliknięcia ⚡ i mogą kosztować PS.',
      'Czytaj opisy kart — zdolności to klucz do wygranej!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 26. PRZYGODY SZCZEGÓŁOWO ═══════
  {
    id: 'adventures_types',
    icon: 'game-icons:spell-book',
    title: 'Karty Przygody',
    body: [
      'Przygody mają kolorowe tło w ręce. Są 3 typy:',
      'ZDARZENIE — jednorazowy efekt: obrażenia, leczenie, zamiana statystyk. Znika po użyciu.',
      'ARTEFAKT — przypinasz do istoty na polu. Daje trwały bonus (np. +2 ATK). Ginie z istotą.',
      'LOKACJA — pasywny efekt na całe pole. Trwa kilka rund.',
    ],
    position: 'center',
    advance: 'click',
  },
  {
    id: 'adventures_enhanced',
    icon: 'game-icons:two-coins',
    title: 'Wzmocnione Przygody',
    body: [
      'Każda przygoda ma DWA efekty: podstawowy (darmowy) i WZMOCNIONY (kosztuje 1 PS).',
      'Wzmocniony efekt jest ZNACZNIE silniejszy — np. zamiast 2 obrażeń zadaje 5.',
      'Aby zagrać wzmocnioną wersję: kliknij ikonę monet 🪙 przy karcie w ręce PRZED zagraniem.',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 28. WARUNKI ZWYCIĘSTWA ═══════
  {
    id: 'victory',
    icon: 'game-icons:laurel-crown',
    title: 'Jak Wygrać?',
    body: [
      'Wygrywasz gdy wróg nie ma ŻADNYCH istot — ani na polu, ani w ręce, ani w talii.',
      'Czyli musisz zabić wszystko co wystawi I wyczerpać jego talię.',
      'Przegrywasz gdy tobie się to samo stanie. Pilnuj swoich zasobów!',
    ],
    position: 'center',
    advance: 'click',
  },

  // ═══════ 29. ZAKOŃCZENIE ═══════
  {
    id: 'complete',
    icon: 'game-icons:triquetra',
    title: 'Gotowy do Bitwy!',
    body: [
      'To wszystko co musisz wiedzieć na start!',
      'Klikaj przycisk fazy żeby przechodzić dalej. Zakończ turę gdy nie masz więcej ruchów.',
      'Z każdą kartą odkryjesz nowe zdolności i taktyki. Reszta zależy od ciebie, wojowniku!',
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
