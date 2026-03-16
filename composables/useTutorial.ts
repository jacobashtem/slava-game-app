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
  { id: 'welcome', icon: 'game-icons:hooded-figure', title: 'Witaj, Wojowniku!', position: 'center', advance: 'click',
    body: ['Ja Żerca — kapłan bogów słowiańskich. Poprowadzę cię przez pierwszą bitwę.', 'Każdą mechanikę wyjaśnię osobno, krok po kroku. Kliknij DALEJ.'] },

  // ═══════ RĘKA ═══════
  { id: 'hand', icon: 'game-icons:card-pickup', title: 'Twoja Ręka', highlight: '.hand-cards', position: 'top', advance: 'click',
    body: ['Na dole ekranu widzisz swoje karty — RĘKA. Zaczynasz z 5.', 'Karty dzielą się na ISTOTY (twoi wojownicy) i PRZYGODY (zaklęcia, artefakty).'] },

  // ═══════ STATY ═══════
  { id: 'stats_atk', icon: 'game-icons:battle-axe', title: '⚔ ATK — Siła Ataku', highlight: '.hand-cards .creature-card', position: 'top', advance: 'click',
    body: ['Czerwona liczba na dole karty to ⚔ — siła ataku.', 'Tyle obrażeń istota zadaje gdy uderzy wroga. ⚔ 4 = wróg straci 4 punktów życia.'] },
  { id: 'stats_def', icon: 'game-icons:shield-echoes', title: '🛡 DEF — Wytrzymałość', highlight: '.hand-cards .creature-card', position: 'top', advance: 'click',
    body: ['Niebieska liczba to 🛡 — punkty życia istoty.', 'Gdy istota oberwie, traci 🛡. Gdy 🛡 spadnie do 0 → ginie i trafia na cmentarz.', 'Przykład: ⚔ 4 uderza 🛡 6 → wróg traci 4 → zostaje mu 🛡 2. Przeżył, ale osłabiony!'] },

  // ═══════ POLE BITWY ═══════
  { id: 'field', icon: 'game-icons:battle-gear', title: 'Pole Bitwy', highlight: '.player-field', position: 'top', advance: 'click',
    body: ['Pole bitwy ma 3 linie — jak rzędy formacji wojennej.', 'Twoje pole jest po lewej, wroga po prawej. Pośrodku ⚔ — linia frontu.', 'Gdzie postawisz istotę ma OGROMNE znaczenie!'] },

  // ═══════ TYPY ATAKU — każdy osobno ═══════
  { id: 'melee', icon: 'game-icons:battle-axe', title: '⚔ Wręcz', highlight: '.player-field .line-1', position: 'top', advance: 'click',
    body: ['Miecze, topory, pięści. Klasyczny wojownik bliskiego zasięgu.', 'Trafia TYLKO pierwszą zajętą linię wroga. Nie przeskoczy nad frontem do tyłów.', '❌ Nie trafia LATAJĄCYCH — miecz nie dosięgnie smoka w powietrzu!'] },
  { id: 'elemental', icon: 'bi:fire', title: '🔥 Żywioł', highlight: '.player-field .line-1', position: 'top', advance: 'click',
    body: ['Ogień, lód, wiatr. Zasięg jak wręcz ⚔ — trafia pierwszą zajętą linię.', 'ALE: ogień dosięgnie LATAJĄCEGO! Smok uniknie miecza, ale nie uniknie płomieni. 🔥', '⚔ Wręcz i 🔥 Żywioł walczą na linii L1 (FRONT).'] },
  { id: 'ranged', icon: 'boxicons:bow-filled', title: '🏹 Dystans', highlight: '.player-field .line-2', position: 'top', advance: 'click',
    body: ['Łucznicy i strzelcy. Strzała leci nad formacją prosto do celu!', 'Celuje w DOWOLNĄ linię wroga — L1, L2 czy L3. Ignoruje front.', '🏹 Dystans walczy na L2. Chroniony przez L1 — wróg ⚔ nie dosięgnie dopóki front stoi.'] },
  { id: 'magic', icon: 'fa6-solid:wand-sparkles', title: '✨ Magia', highlight: '.player-field .line-3', position: 'top', advance: 'click',
    body: ['Zaklęcia i rytuały. Celuje w dowolną linię, jak 🏹 dystans.', '✨ Magia walczy na L3 (WSPARCIE) — chroniona podwójnie: przez L1 ORAZ L2.', 'Żeby wróg ⚔ dosięgnął maga, musi wyeliminować WSZYSTKICH z L1, potem z L2!'] },

  // ═══════ PUSTE LINIE ═══════
  { id: 'empty_lines', icon: 'game-icons:broken-shield', title: '⚠ Puste Linie!', highlight: '.player-field .battle-line', position: 'top', advance: 'click',
    body: ['Jeśli L1 pusta → wróg ⚔ celuje w L2!', 'Jeśli L1 i L2 puste → wróg ⚔ uderzy prosto w L3. Magowie bezbronni!', 'ZAWSZE pilnuj frontu. Pusty front = tyły odsłonięte.', '🏹 i ✨ wroga i tak celują wszędzie — ale nie dawaj ⚔ darmowego dostępu!'] },

  // ═══════ LATAJĄCE ═══════
  { id: 'flying', icon: 'game-icons:liberty-wing', title: '🦅 Istoty Latające', highlight: '.player-field', position: 'top', advance: 'click',
    body: ['Ikona skrzydeł 🦅 na karcie = latający.', '⚔ Wręcz → ❌ nie trafia latających.', '🔥 Żywioł → ✅ ogień dosięgnie.', '🏹 Dystans → ✅ strzała doleci.', '✨ Magia → ✅ zaklęcie trafi.', 'Pilnuj żeby mieć sposób na latające wrogi!'] },

  // ═══════ ODPORNOŚCI ═══════
  { id: 'immunities', icon: 'game-icons:shield-reflect', title: '🛡 Odporności', highlight: '.player-field', position: 'top', advance: 'click',
    body: ['Niektóre istoty mają ODPORNOŚCI — np. „Odporny na magię" albo „Odporny na dystans".', 'Jeśli zaatakujesz odporną istotę typem na który jest odporna → atak zostaje ZABLOKOWANY, 0 obrażeń!', 'Dlatego dywersyfikuj armię — miej różne typy ataku żeby nie utknąć.'] },

  // ═══════ WYSTAWIANIE ═══════
  { id: 'play_prompt', icon: 'game-icons:card-play', title: 'Wystaw Istotę!', highlight: '.hand-cards', position: 'top', advance: 'field',
    body: ['Czas na praktykę! Kliknij istotę w ręce, potem kliknij podświetloną linię.'] },
  { id: 'play_done', icon: 'game-icons:check-mark', title: 'Świetnie!', highlight: '.player-field .creature-card', position: 'top', advance: 'click',
    body: ['Istota na polu! Pionowa karta, niebieski border = 🛡 OBRONA.'] },

  // ═══════ POZYCJE ═══════
  { id: 'pos_defense', icon: 'game-icons:shield-echoes', title: '🛡 Pozycja: OBRONA', position: 'center', advance: 'click',
    body: ['Karta PIONOWO, niebieski border.', 'NIE może aktywnie atakować. Ale gdy wróg ją zaatakuje — KONTRATAKUJE automatycznie!', 'Wróg uderza → twój wojownik odpowiada ciosem swoim ⚔. Obaj tracą 🛡!'] },
  { id: 'pos_attack', icon: 'game-icons:broadsword', title: '⚔ Pozycja: ATAK', highlight: '.player-field .creature-card', position: 'top', advance: 'click',
    body: ['Karta POZIOMO, czerwony border.', 'MOŻE celować we wroga i zadać ⚔ obrażeń. Ale sama NIE kontratakuje gdy ją zaatakują.', 'Atakujesz wroga w 🛡 → on kontruje swoim ⚔. Wroga w ⚔ → nie kontruje. Ryzyko vs zysk!'] },

  // ═══════ KONTRATAK ═══════
  { id: 'counter', icon: 'game-icons:shield-bash', title: '↩ Kontratak — Zasięg', highlight: '.player-field', position: 'top', advance: 'click',
    body: ['Kontratak ma ten sam ZASIĘG co normalny atak obrońcy.', 'Twój 🏹 z L2 strzela wroga ⚔ na L1 w 🛡. Wróg chce kontrować — ale miecz ⚔ nie dosięgnie L2! Brak kontry.', 'Twój ⚔ z L1 bije wroga ⚔ na L1 w 🛡. Miecz dosięgnie — kontra!', 'Atakuj dystansem/magią żeby unikać kontr bliskiego zasięgu.'] },

  // ═══════ OBRÓĆ KARTĘ ═══════
  { id: 'pos_prompt', icon: 'game-icons:cycle', title: 'Obróć Kartę!', highlight: '.player-field .creature-card', position: 'top', advance: 'position',
    body: ['Kliknij kartę na polu → zmiana 🛡 OBRONA ↔ ⚔ ATAK.', 'Darmowe, ale: istota nie atakuje w turze gdy zmieniła pozycję!'] },
  { id: 'pos_done', icon: 'game-icons:check-mark', title: 'Doskonale!', position: 'center', advance: 'click',
    body: ['Poziomo, czerwona ramka — gotowa do boju następnej tury!'] },

  // ═══════ FAZY ═══════
  { id: 'phases', icon: 'game-icons:hourglass', title: 'Przebieg Tury', position: 'center', advance: 'click',
    body: ['Każda tura to 3 fazy:', '1️⃣ WYSTAWIANIE — grasz karty, zmieniasz pozycje.', '2️⃣ WALKA — atakujesz istotami w ⚔.', '3️⃣ KONIEC — efekty końca tury, tura wroga.'] },
  { id: 'phase_btn', icon: 'game-icons:sword-clash', title: 'Przejdź do Walki!', highlight: '.phase-btn', position: 'bottom', advance: 'phase', waitPhase: GamePhase.COMBAT,
    body: ['Kliknij przycisk fazy żeby przejść do WALKI!'] },

  // ═══════ WALKA ═══════
  { id: 'fight', icon: 'game-icons:battle-axe', title: '⚔ Do Boju!', highlight: '.enemy-field .creature-card', position: 'top', advance: 'attack',
    body: ['Kliknij swoją istotę w ⚔, potem kliknij wrogą istotę.', 'Obrażenia = twój ⚔. Wroga 🛡 spadnie o tyle. 🛡 ≤ 0 → śmierć!'] },
  { id: 'fight_done', icon: 'game-icons:check-mark', title: 'Pierwsza Walka!', position: 'center', advance: 'click',
    body: ['Brawo! Widziałeś obrażenia w akcji.', 'Po ataku istota nie może atakować ponownie w tej turze.'] },

  // ═══════ TURA WROGA ═══════
  { id: 'enemy', icon: 'game-icons:skull-crossed-bones', title: 'Tura Wroga', position: 'center', advance: 'click',
    body: ['Gdy zakończysz turę → wróg gra. Wystawia istoty, atakuje.', 'Nie możesz nic robić — ale twoje istoty w 🛡 kontrują automatycznie!', 'Dlatego zostawiaj ważne istoty w 🛡 na koniec tury.'] },

  // ═══════ TALIA I CMENTARZ ═══════
  { id: 'deck', icon: 'game-icons:card-draw', title: 'Talia i Cmentarz', highlight: '.sidebar', position: 'center', advance: 'click',
    body: ['TALIA (stos kart po lewej) — co turę dobierasz 1 kartę.', 'CMENTARZ (pod talią) — zabite istoty. Kliknij żeby przejrzeć.', 'Talia pusta + brak istot na polu i w ręce = PRZEGRANA!'] },

  // ═══════ PS ═══════
  { id: 'ps', icon: 'game-icons:laurel-crown', title: 'PS — Punkty Sławy', highlight: '.gold-section', position: 'center', advance: 'click',
    body: ['Zielona liczba = twoje PS. Waluta gry.', 'Wydajesz na: wzmocnione przygody (1 PS) i aktywowane zdolności istot.', 'PS jest mało — nie marnuj! Zostawiaj na kluczowe momenty.'] },

  // ═══════ TRIGGERY / ZDOLNOŚCI ═══════
  { id: 'trig_intro', icon: 'game-icons:magic-swirl', title: 'Zdolności Istot', position: 'center', advance: 'click',
    body: ['Wiele istot ma unikalne zdolności! Rozpoznasz je po etykietach typu [AURA], [WEJŚCIE], [AKCJA] itp. na karcie.', 'Każda etykieta oznacza KIEDY zdolność się aktywuje. Zaraz omówię każdą.'] },

  { id: 'trig_entry', icon: 'game-icons:card-play', title: '🟢 WEJŚCIE', position: 'center', advance: 'click',
    body: ['[WEJŚCIE] — aktywuje się RAZ, w momencie gdy wystawiasz istotę na pole.', 'Np. „Gdy wchodzi na pole: zadaj 2 obrażenia losowej wrogiej istocie."', 'Efekt jednorazowy — nie powtarza się.'] },

  { id: 'trig_action', icon: 'game-icons:lightning-trio', title: '🟣 AKCJA ⚡', position: 'center', advance: 'click',
    body: ['[AKCJA] ⚡ — zdolność AKTYWOWANA. To TY decydujesz kiedy jej użyć.', 'Kliknij pulsujący przycisk ⚡ na karcie żeby aktywować.', 'Może kosztować PS. Może mieć cooldown (raz na turę / raz na rundę).'] },

  { id: 'trig_aura', icon: 'game-icons:aura', title: '🔵 AURA', position: 'center', advance: 'click',
    body: ['[AURA] — efekt PASYWNY. Działa automatycznie co turę, nie musisz nic klikać.', 'Np. „Na początku tury: przywróć 1 🛡 sojusznikowi obok."', 'Działa dopóki istota żyje na polu.'] },

  { id: 'trig_retaliation', icon: 'game-icons:shield-bash', title: '🟠 ODWET', position: 'center', advance: 'click',
    body: ['[ODWET] — aktywuje się gdy ta istota OBERWIE obrażenia.', 'Np. „Gdy otrzyma obrażenia: zadaj 1 obrażenie atakującemu."', 'Działa przy każdym trafieniu — potężne przeciw wielokrotnym atakom!'] },

  { id: 'trig_strike', icon: 'game-icons:sword-clash', title: '🔴 NATARCIE', position: 'center', advance: 'click',
    body: ['[NATARCIE] — aktywuje się gdy ta istota ZADAJE obrażenia.', 'Np. „Gdy zada obrażenia: ukradnij 1 ⚔ wrogowi."', 'Działa przy każdym twoim uderzeniu — im więcej atakujesz, tym lepiej.'] },

  { id: 'trig_kill', icon: 'game-icons:skull-crossed-bones', title: '🔴 ZABÓJSTWO', position: 'center', advance: 'click',
    body: ['[ZABÓJSTWO] — aktywuje się gdy ta istota ZABIJE wroga (🛡 → 0).', 'Np. „Gdy zabije: zyskaj 1 PS" albo „Gdy zabije: przywróć pełne 🛡."', 'Nagroda za eliminację — im więcej zabijasz, tym silniejszy jesteś!'] },

  { id: 'trig_farewell', icon: 'game-icons:tombstone', title: '⚫ POŻEGNANIE', position: 'center', advance: 'click',
    body: ['[POŻEGNANIE] — aktywuje się gdy ta istota GINIE.', 'Np. „Gdy zginie: zadaj 3 obrażenia losowemu wrogowi."', 'Ostatni akt — istota umiera, ale zabiera kogoś ze sobą!'] },

  { id: 'trig_vigilance', icon: 'game-icons:eye-shield', title: '🟡 CZUJNOŚĆ', position: 'center', advance: 'click',
    body: ['[CZUJNOŚĆ] — reaguje na zdarzenia na polu: śmierć istoty, zagranie karty przez wroga itp.', 'Np. „Gdy jakakolwiek istota zginie: zyskaj +1 ⚔."', 'Obserwator pola bitwy — pasywnie zbiera korzyści z chaosu walki.'] },

  // ═══════ PRZYGODY ═══════
  { id: 'adv_types', icon: 'game-icons:spell-book', title: 'Karty Przygody', position: 'center', advance: 'click',
    body: ['Kolorowe karty w ręce. 3 typy:', 'ZDARZENIE — jednorazowy efekt. Znika po użyciu.', 'ARTEFAKT — przypinasz do istoty. Trwały bonus. Ginie z istotą.', 'LOKACJA — pasywny efekt na pole. Trwa kilka rund.'] },
  { id: 'adv_enhanced', icon: 'game-icons:two-coins', title: '💰 Wzmocnione Przygody', position: 'center', advance: 'click',
    body: ['Każda przygoda ma efekt PODSTAWOWY (darmowy) i WZMOCNIONY (1 PS).', 'Wzmocniony jest DUŻO silniejszy. Kliknij 🪙 przy karcie PRZED zagraniem.'] },

  // ═══════ ZWYCIĘSTWO ═══════
  { id: 'victory', icon: 'game-icons:laurel-crown', title: '🏆 Jak Wygrać?', position: 'center', advance: 'click',
    body: ['Wróg nie ma istot na polu + w ręce + w talii = TWOJE ZWYCIĘSTWO!', 'Tobie się to stanie = PRZEGRANA.', 'Zarządzaj zasobami. Nie trać istot bezmyślnie!'] },

  // ═══════ KONIEC ═══════
  { id: 'complete', icon: 'game-icons:triquetra', title: 'Gotowy do Bitwy!', position: 'center', advance: 'click',
    body: ['To wszystko na start! Z każdą kartą odkryjesz nowe taktyki.', 'Niech bogowie będą łaskawi, wojowniku! ⚔'] },
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
