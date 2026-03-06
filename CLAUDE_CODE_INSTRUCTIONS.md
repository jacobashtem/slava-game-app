# SLAVA VOL.2 — Instrukcje dla Claude Code

---
## ★ AKTUALNY STAN PROJEKTU (aktualizuj przy każdym zakończeniu pracy)

**Data ostatniej sesji:** 2026-03-05
**Etap:** ETAP 2 ✅ ZAKOŃCZONY → ETAP 3 (efekty kart) W TRAKCIE

### Co jest gotowe:
- Etap 1: Cały silnik gry (types, constants, CardFactory, DeckBuilder, LineManager, CombatResolver, TurnManager, GameEngine, AIPlayer, EffectRegistry, GameStateUtils) ✅
- Etap 2: Pełne UI (GameBoard, BattleLine, CreatureCard, PlayerHand, ActionLog, TurnIndicator, DeckPile, CardTooltip, PhaseControls, GameOverModal, ActiveEventsBar, AISummaryPanel) ✅
- AI przeciwnik (medium difficulty, wszystkie fazy) ✅
- EffectRegistry — "Księga Zdolności" — jedyne źródło efektów ✅
- Arena mode (/arena) — plac testowy kart z autocomplete ✅
- Alpha Deck — talia z tylko sprawdzonych kart ✅

### Aktualny task (zaczynamy od tego przy następnym uruchomieniu):
**ETAP 3: Testowanie i implementacja efektów kart po kolei przez Arenę**
- Workflow: Arena → wybierz kartę → przetestuj efekt → oznacz ✅ w `memory/cards-status.md` → dodaj effectId do `ALPHA_CREATURE_EFFECT_IDS` w DeckBuilder.ts
- Następna karta do implementacji: **Matoha** (matoha_effect — przeczytać opis, zakodować)
- Potem: Łapiduch, Świetle, Żar-ptak, Żmije, i cała reszta niezaimplementowanych

### Kluczowe pliki do sprawdzenia na starcie:
- `memory/CHANGELOG.md` — co było zrobione
- `memory/cards-status.md` — które karty ✅/📋
- `game-engine/EffectRegistry.ts` — efekty kart
- `game-engine/DeckBuilder.ts` — ALPHA_CREATURE_EFFECT_IDS (lista gotowych kart)

### Mechaniki ustalone (nie zmieniać bez pytania):
- ATAK = poziomo (rotate 90°), OBRONA = pionowo (niebieskie obramowanie)
- Karty przygód: efekt PODSTAWOWY = GRATIS, efekt ULEPSZONY = 2 ZŁ
- Ręka auto-uzupełnia do 5 kart na początku każdej tury
- Komunikaty walki: "Wilkołak zabija Leszego!", "Leszy kontratakuje — Wilkołak ginie!"
- effectId = jedyne źródło prawdy dla efektów (NIE parsujemy stringów)

---

## 1. OPIS PROJEKTU

Słowiańska karcianka turowa: gracz vs komputer (AI). Gra oparta na trzech plikach JSON z danymi kart i mechanik. Cel: grywalny prototyp w przeglądarce z pełną logiką walki.

### Dwa tryby gry (implementowane KOLEJNO):

**TRYB 1: "Gold Edition"** (implementujemy NAJPIERW)
- Uproszczony tryb nastawiony na szybką akcję
- Waluta: Złocisze (ZŁ) — 5 na start, nie odnawiają się
- Brak Panteonu, Pór Roku, Licytacji, Sławy
- Karty Przygody działają od razu z `enhancedEffect`
- Wygrana: wyczyść pole + rękę wroga, LUB wróg ma 0 kart w talii

**TRYB 2: "Slava!"** (implementujemy PO Gold Edition)
- Pełna mechanika z ekonomią Sławy (Glory Points)
- Panteon, Pory Roku, Licytacja o moce bogów
- Trofea, przełamanie linii, kradzież GP
- Cel: 10 GP

### Przeciwnik: AI (nie hotseat)
Gracz zawsze gra jako dolny gracz. Górny gracz to AI.
AI jest wymagane od pierwszego grywalnego prototypu — bez niego nie da się testować gry.

## 2. STOS TECHNOLOGICZNY

### Framework
- **Nuxt 3** (Vue 3 + Composition API + TypeScript)
- **pnpm** jako package manager

### Paczki do zainstalowania

```bash
# Core
pnpm create nuxt-app slava-game
# albo: npx nuxi@latest init slava-game

# State management — lekki, intuicyjny store
pnpm add pinia

# Animacje kart — przemieszczanie, obroty, wejścia/wyjścia
pnpm add @vueuse/motion

# Drag & drop kart z ręki na pole
pnpm add @formkit/drag-and-drop

# Ikony (miecze, tarcze, czaszki, domeny)
pnpm add @iconify/vue

# Efekty dźwiękowe (opcjonalnie, etap 4+)
pnpm add howler

# Multiplayer (etap 5+)
pnpm add socket.io-client
# Backend: pnpm add socket.io (w osobnym katalogu server/)

# Testy silnika logiki
pnpm add -D vitest

# CSS utility classes
pnpm add -D @nuxtjs/tailwindcss
```

### Dlaczego te paczki
- **Pinia**: natywne wsparcie Nuxt, devtools, proste do debugowania stanu gry
- **@vueuse/motion**: deklaratywne animacje Vue (`:initial`, `:enter`, `:leave`) — obroty kart, przesunięcia, fade
- **@formkit/drag-and-drop**: lekki D&D natywny dla Vue 3, nie wymaga wrapperów
- **@iconify/vue**: 100k+ ikon, w tym rpg/game ikony, zero bundla (ładuje on-demand)
- **vitest**: natywna integracja z Vite/Nuxt, szybkie testy silnika

---

## 3. ARCHITEKTURA PROJEKTU

```
slava-game/
├── server/                    # Nuxt server routes (potem WebSocket)
├── game-engine/               # CZYSTA LOGIKA — zero zależności od Vue/Nuxt
│   ├── types.ts               # Interfejsy: Card, GameState, Player, Effect...
│   ├── constants.ts           # Enumy: AttackType, Domain, Position, Phase...
│   ├── GameEngine.ts          # Główna klasa — zarządza stanem gry
│   ├── TurnManager.ts         # Fazy tury: Draw → Play → Attack → End
│   ├── CombatResolver.ts      # Logika walki: obrażenia, kontratak, linie
│   ├── EffectResolver.ts      # Pipeline efektów kart (kolejność, stackowanie)
│   ├── CardFactory.ts         # Tworzy instancje kart z JSON
│   ├── DeckBuilder.ts         # Buduje talię z kart (shuffle, draw)
│   ├── LineManager.ts         # Zarządza polem 3-liniowym (L1/L2/L3)
│   ├── GloryManager.ts       # Ekonomia Sławy (GP) — docelowo tryb Slava!
│   ├── AIPlayer.ts            # Logika AI przeciwnika (heurystyki decyzyjne)
│   ├── AIStrategy.ts          # Strategie AI: agresywna, defensywna, zbalansowana
│   └── SimulationRunner.ts    # Symulacja 10k gier do testów balansu
├── stores/
│   ├── gameStore.ts           # Pinia store — bridge między engine a UI
│   └── uiStore.ts             # Stan UI: zaznaczona karta, animacje, modals
├── composables/
│   ├── useGameActions.ts      # Akcje gracza: play card, attack, change position
│   ├── useDragDrop.ts         # Logika D&D kart
│   └── useAnimations.ts       # Hooki animacji
├── components/
│   ├── board/
│   │   ├── GameBoard.vue      # Całe pole bitwy (oba gracze)
│   │   ├── PlayerField.vue    # Pole jednego gracza (3 linie)
│   │   ├── BattleLine.vue     # Jedna linia (L1/L2/L3) ze slotami
│   │   └── CardSlot.vue       # Pojedynczy slot na kartę
│   ├── cards/
│   │   ├── CreatureCard.vue   # Karta Istoty (statystyki, efekt, domena)
│   │   ├── AdventureCard.vue  # Karta Przygody (zdarzenie/artefakt/lokacja)
│   │   └── CardBack.vue       # Rewers karty (karta zakryta)
│   ├── ui/
│   │   ├── PlayerHand.vue     # Ręka gracza (dolny pasek)
│   │   ├── GloryTracker.vue   # Punkty sławy
│   │   ├── TurnIndicator.vue  # Czyja tura + faza
│   │   ├── ActionLog.vue      # Log akcji (kto kogo zaatakował)
│   │   └── DeckPile.vue       # Talia + cmentarz (liczniki)
│   └── debug/
│       └── GameStateDebug.vue # Devtools: cały stan gry jako JSON
├── data/
│   ├── Slava_Vol2_Istoty.json
│   ├── Slava_Vol2_KartyPrzygody.json
│   └── Slava_Vol2_Panteon_Normalized.json
├── assets/
│   └── cards/                 # Obrazki kart (na później)
├── tests/
│   ├── engine/
│   │   ├── combat.test.ts     # Testy walki
│   │   ├── effects.test.ts    # Testy efektów kart
│   │   └── turn.test.ts       # Testy faz tury
│   └── simulation/
│       └── balance.test.ts    # Testy balansu (10k gier)
├── pages/
│   ├── index.vue              # Menu główne
│   ├── game.vue               # Ekran gry
│   └── balance.vue            # Dashboard balansu (wyniki symulacji)
└── nuxt.config.ts
```

### KLUCZOWA ZASADA ARCHITEKTURY

**`game-engine/` NIE importuje NIC z Vue/Nuxt/Pinia.**

To czysty TypeScript. Dzięki temu:
- Testy biegną bez przeglądarki
- Symulacja 10k gier działa w Node.js
- Przeniesienie do C#/Unity = przepisanie tego jednego katalogu
- Store Pinia jest tylko cienkim adapterem, który wywołuje metody engine'u i trzyma reaktywny stan

---

## 4. PLAN IMPLEMENTACJI — KOLEJNOŚĆ KROK PO KROKU

### ETAP 1: Fundament silnika (bez UI)
**Cel: `vitest` przechodzi — karty się biją, umierają, kontratakują.**

1. Zdefiniuj `types.ts` — wszystkie interfejsy
2. Zdefiniuj `constants.ts` — enumy AttackType, Domain, CardType, Position, GamePhase
3. `CardFactory.ts` — ładuje JSON, tworzy instancje Card z unikalnymi runtime ID
4. `DeckBuilder.ts` — shuffle, draw, discard
5. `LineManager.ts` — pole 3×N, walidacja gdzie można postawić kartę
6. `CombatResolver.ts` — NAJWAŻNIEJSZY PLIK:
   - Walidacja zasięgu ataku (Wręcz=L1, Dystans/Magia=dowolna)
   - Obliczanie obrażeń (attack vs defense)
   - Kontratak (tylko gdy cel w Pozycji Obrony)
   - Dynamiczne przesuwanie frontu (L1 pusta → L2 staje się frontem)
   - Obsługa `isFlying` (Wręcz nie bije latających, Żywioł bije)
7. `TurnManager.ts` — fazy: START → DRAW → PLAY → COMBAT → END
8. `GameEngine.ts` — orkiestracja: tworzy grę, zarządza turami, sprawdza warunki zwycięstwa
9. Testy w `vitest` dla każdego modułu

### ETAP 2: UI + AI przeciwnik → grywalna "Gold Edition"
**Cel: Gracz może rozegrać pełną partię vs komputer w trybie Gold Edition.**

**UI (gracz = dół ekranu):**
1. `gameStore.ts` — Pinia store opakowujący GameEngine
2. `GameBoard.vue` — layout: AI góra, gracz dół, 3 linie każdy
3. `CreatureCard.vue` — prostokąt z: nazwa, atak/obrona, typ ataku (ikona), domena (kolor)
4. `PlayerHand.vue` — karty na dole ekranu (tylko gracz widzi swoje)
5. `BattleLine.vue` — drop zone, karty w linii
6. Mechanika tury: klik na kartę w ręce → klik na slot = wystawienie
7. Mechanika ataku: klik na swoją kartę → klik na wrogą = atak
8. `ActionLog.vue` — tekstowy log co się dzieje

**AI (górny gracz — komputer):**
9. `AIPlayer.ts` — interfejs decyzyjny, dostaje GameState, zwraca akcję
10. `AIStrategy.ts` — heurystyki dla Gold Edition:

```
FAZA PLAY (AI decyduje co wystawić):
1. Jeśli pole puste → wystaw najsilniejszą istotę (max attack+defense) w L1, pozycja Obrona
2. Jeśli pole nie puste → wystaw istotę uzupełniającą linię:
   - Brak L1? → Wręcz do L1
   - Brak L2? → Dystans do L2
   - Brak L3? → Magia do L3
3. Jeśli ma Kartę Przygody i ZŁ → zagraj ją na najsłabszego wroga (debuff) lub najsilniejszego sojusznika (buff)

FAZA COMBAT (AI decyduje kogo atakować):
1. Zmień pozycję na Atak istoty z najwyższym atakiem
2. Priorytet celów:
   a) Wróg którego mogę zabić jednym ciosem (jego defense <= mój attack)
   b) Wróg z najniższym defense (łatwy cel)
   c) Wróg z najwyższym attack (eliminuj zagrożenie)
3. Jeśli moja istota ma mało HP (defense <= 2): zostaw w Obronie

FAZA END:
1. Jeśli mam istoty bez celu ataku → pozycja Obrona
```

**Zasady Gold Edition:**
11. Talia: 30 losowych kart (istoty + przygody, mieszane domeny)
12. Ręka startowa: 5 kart
13. Złocisze: 5 na start, nie odnawiają się (nie mylić ze Sławą!)
14. Przygody: kosztują 1 ZŁ, działają od razu z `enhancedEffect`
15. Limit pola: max 5 istot jednocześnie
16. Limit wystawiania: 1 istota + 1 przygoda na turę
17. Wygrana: wróg nie ma istot na polu I w ręce, LUB wróg ma 0 kart w talii
18. Karty AI: rewers (CardBack.vue) — gracz nie widzi ręki AI

**Tura gracza:**
- START: +1 karta z talii
- PLAY: wystawiaj istoty i przygody (klik/drag)
- COMBAT: wybierz atakujących i cele (klik→klik)
- END: potwierdź koniec tury → AI gra automatycznie

**Tura AI:**
- AI wykonuje wszystkie fazy automatycznie z ~1s opóźnieniem między akcjami
- Każda akcja AI logowana w ActionLog
- Karty AI na polu są widoczne (odkryte), karty w ręce — zakryte

### ETAP 3: Efekty kart
**Cel: Kluczowe efekty istot działają w Gold Edition.**

1. `EffectResolver.ts` — system pluginów:
   - Każdy efekt karty to funkcja `(gameState, sourceCard, targetCard?) => GameState`
   - Efekty mają priorytet (trigger timing): ON_PLAY, ON_ATTACK, ON_DAMAGE, ON_DEATH, PASSIVE
   - Pipeline: zbierz aktywne efekty → sortuj po priorytecie → wykonaj po kolei
2. Implementacja efektów partiami (w kolejności trudności):
   - PROSTE: statyczne buffy (+2 atak, odporność, latanie)
   - WARUNKOWE: Gryf (podwójne obrażenia w rundzie wystawienia), Dziewiątko (finish)
   - ZŁOŻONE: Rusałka (kopiuje atak celu), Wiła (przejmij istoty), Homen (konwersja)
3. Karty Przygody: Zdarzenia, Artefakty, Lokacje
4. AI musi rozumieć efekty: `AIStrategy` priorytetyzuje karty z silnymi efektami

### ETAP 4: Polish Gold Edition
**Cel: Gold Edition jest kompletna i testowalna.**

1. Drag & drop kart z ręki na pole
2. Animacje: wejście karty, atak (przesunięcie), obrażenia (shake), śmierć (fade)
3. Dźwięki ataków (opcjonalnie)
4. Ekran wyboru talii (losowa / wybierz domenę)
5. Ekran końca gry (wygrana/przegrana, statystyki partii)

### ETAP 5: Symulacja balansu --- nie robimy panie claude leć dalej - wrocimy do tego potem
**Cel: 10 000 gier AI vs AI, raport win-rate per karta/domena.**

1. `SimulationRunner.ts` — odpala gry bez UI:
   - AI vs AI z różnymi strategiami i taliami
   - Zbieranie metryk: win%, avg turns, card pick rate, card kill rate
   - Wykrywa karty "broken" (win% > 70% gdy w talii) i "useless" (pick rate < 5%)
2. `pages/balance.vue` — dashboard z wykresami (chart.js)
3. Eksport wyników do CSV/JSON

### ETAP 6: Tryb "Slava!" (pełna mechanika)
**Cel: Drugi tryb gry z ekonomią Sławy i Panteonem.**

1. `GloryManager.ts` — Punkty Sławy:
   - Start: 0 GP, Cel: 10 GP
   - +1 GP co turę
   - Trofea: suma obrony zabitych wrogów >= 9 → +1 GP
   - Przełamanie: atak w pustą linię → kradnij 1 GP
2. Panteon i Pory Roku z Slava_Vol2_Panteon_Normalized.json
3. System Licytacji o moce bogów
4. AI Strateg: rozszerzone heurystyki o zarządzanie GP i licytację
5. Menu główne: wybór trybu (Gold Edition / Slava!)
### ETAP 6,5  (opcjonalny): Bajery
Dysponuje grafikami dla każdej karty, pomyślmy o planszy ( a moze planszach), dodajy efekty dzwiekowe dla roznych akcji. Im więcje tym lepiej! Atak magią - jakas wiedzma cos belkocze, ( jak kobieta, albo czarodziej ), atak smoka - dzwiek smoka - uderze wrecz/ uderzenie zywiolem/ atak strzaly - jak atak dystansowy. Dodamy tez muzyczke w tle jakąś fajną. W tej fazie będziemy picować graficznie wszystko by UI Był przyjemny

### ETAP 7 (opcjonalny): Multiplayer
Socket.io — serwer trzyma GameEngine, klienci wysyłają akcje, serwer odsyła stan. Gry toczą się w 'pokojach'  - podrzucę pliki od kolegi który robił prostą grę w tej strukturze.

### ETAP 8 (opcjonalny): Mobile
Capacitor wrap → Google Play.

---

## 5. KLUCZOWE TYPY (types.ts) — PUNKT WYJŚCIA

```typescript
// === ENUMS ===

export enum AttackType {
  MELEE = 0,       // Wręcz — L1 only
  ELEMENTAL = 1,   // Żywioł — L1, bije latające
  MAGIC = 2,       // Magia — dowolna linia
  RANGED = 3,      // Dystans — dowolna linia (wręcz + dystans)
}

export enum Domain {
  PERUN = 1,       // Perunowcy
  ZYVI = 2,        // Żywi
  UNDEAD = 3,      // Nieumarli
  WELES = 4,       // Welesowcy
}

export enum CardPosition {
  ATTACK = 'attack',     // Pionowo — może atakować, brak kontrataku
  DEFENSE = 'defense',   // Poziomo — nie atakuje, kontratakuje
}

export enum GamePhase {
  START = 'start',
  DRAW = 'draw',
  PLAY = 'play',
  COMBAT = 'combat',
  END = 'end',
}

export enum AdventureType {
  EVENT = 0,       // Zdarzenie — natychmiastowe
  ARTIFACT = 1,    // Artefakt — podpięty pod istotę
  LOCATION = 2,    // Lokacja — jedna aktywna na stole
}

export enum BattleLine {
  FRONT = 1,       // L1 — Wręcz
  RANGED = 2,      // L2 — Dystans
  SUPPORT = 3,     // L3 — Magia/Wsparcie
}

export enum EffectTrigger {
  PASSIVE = 'passive',         // Ciągły efekt
  ON_PLAY = 'on_play',         // Przy wystawieniu
  ON_ATTACK = 'on_attack',     // Przy ataku
  ON_DEFEND = 'on_defend',     // Przy obronie/kontrataku
  ON_DAMAGE = 'on_damage',     // Przy otrzymaniu obrażeń
  ON_DEATH = 'on_death',       // Przy śmierci
  ON_KILL = 'on_kill',         // Przy zabiciu wroga
  ON_TURN_START = 'on_turn_start',
  ON_TURN_END = 'on_turn_end',
  ON_ROUND_START = 'on_round_start',
}

// === INTERFACES ===

export interface CardStats {
  attack: number
  defense: number
  maxDefense: number   // bazowa wartość do leczenia/resetu
  maxAttack: number
}

export interface CreatureCardData {
  id: number
  domain: Domain
  name: string
  stats: CardStats
  attackType: AttackType
  isFlying: boolean
  effectId: string          // klucz do EffectRegistry
  lore: string
}

export interface AdventureCardData {
  id: number
  type: AdventureType
  name: string
  effectId: string
  enhancedEffectId: string
  lore: string
}

export interface CardInstance {
  instanceId: string        // unikalne ID runtime (np. "creature-15-abc123")
  cardData: CreatureCardData | AdventureCardData
  currentStats: CardStats   // zmodyfikowane statystyki
  position: CardPosition
  line: BattleLine | null   // null = w ręce/talii
  activeEffects: ActiveEffect[]
  equippedArtifacts: AdventureCardData[]
  isRevealed: boolean       // czy przeciwnik widzi kartę (zakryte wystawianie)
  turnsInPlay: number       // ile tur na polu (potrzebne np. dla Gryfa)
  owner: PlayerSide
}

export interface ActiveEffect {
  effectId: string
  sourceInstanceId: string
  trigger: EffectTrigger
  remainingTurns: number | null  // null = permanentny
}

export type PlayerSide = 'player1' | 'player2'

export interface PlayerState {
  side: PlayerSide
  deck: CardInstance[]
  hand: CardInstance[]
  field: FieldState
  graveyard: CardInstance[]   // Nawia/Cmentarz
  trophies: CardInstance[]    // Trofeów wroga
  glory: number               // Sława (tryb Strateg)
  gold: number                // Złocisze (tryb Łupanka)
  activeLocation: CardInstance | null
  handLimit: number
}

export interface FieldState {
  lines: {
    [BattleLine.FRONT]: CardInstance[]
    [BattleLine.RANGED]: CardInstance[]
    [BattleLine.SUPPORT]: CardInstance[]
  }
}

export interface GameState {
  players: Record<PlayerSide, PlayerState>
  currentTurn: PlayerSide
  currentPhase: GamePhase
  roundNumber: number
  turnNumber: number
  actionLog: LogEntry[]
  winner: PlayerSide | null
}

export interface LogEntry {
  round: number
  turn: number
  message: string
  type: 'attack' | 'damage' | 'death' | 'play' | 'effect' | 'system'
}

export interface CombatResult {
  attacker: CardInstance
  defender: CardInstance
  damageToDefender: number
  damageToAttacker: number  // kontratak
  defenderDied: boolean
  attackerDied: boolean
  log: LogEntry[]
}
```

---

## 6. REGUŁY WALKI — IMPLEMENTACJA CombatResolver

```
ATAK(attacker, defender):

1. WALIDACJA ZASIĘGU:
   - attackType 0 (Wręcz): cel musi być w pierwszej ZAJĘTEJ linii wroga
   - attackType 1 (Żywioł): jak Wręcz, ale może celować w isFlying
   - attackType 2 (Magia): dowolna linia
   - attackType 3 (Dystans): dowolna linia
   - WYJĄTEK: Wręcz NIE może atakować isFlying (chyba że sam lata)

2. ZADAJ OBRAŻENIA:
   damageToDefender = attacker.currentStats.attack
   defender.currentStats.defense -= damageToDefender

3. KONTRATAK (jeśli dotyczy):
   JEŚLI defender.position === DEFENSE:
     damageToAttacker = defender.currentStats.defense (PRZED obrażeniami? PO?)
     → Decyzja: kontratak używa defense PO otrzymaniu obrażeń
     attacker.currentStats.defense -= damageToAttacker

4. ŚMIERĆ:
   JEŚLI defender.currentStats.defense <= 0: → graveyard
   JEŚLI attacker.currentStats.defense <= 0: → graveyard

5. DYNAMICZNY FRONT:
   Po każdej śmierci sprawdź: czy linia L1 wroga jest pusta?
   Jeśli tak: L2 staje się nowym "frontem" dla ataków Wręcz.
```

---

## 7. WYGLĄD KART W PROTOTYPIE (bez grafik)

Karta Istoty to prostokąt ~120×180px z:
- Górny pasek: nazwa + ikona domeny (kolor: Perun=złoty, Żywi=zielony, Nieumarli=fioletowy, Weles=czerwony)
- Środek: tekst efektu (mały font, scrollowalny jeśli długi)
- Dolny pasek: ATAK (ikona miecza + liczba) | OBRONA (ikona tarczy + liczba)
- Typ ataku: mała ikona (pięść/płomień/gwiazda/łuk)
- Jeśli lata: ikonka skrzydeł
- Border: solidny w kolorze domeny, pogrubiony gdy zaznaczona
- Obrócona 90° gdy w pozycji obrony

Karta w ręce: nieco mniejsza, hover = powiększenie + tooltip z lore.

---

## 8. STYL WIZUALNY PROTOTYPU

- Dark theme — tło: ciemny granat/czerń (#0a0a1a)
- Kolory domen: Perun #f5c542, Żywi #4caf50, Nieumarli #9c27b0, Weles #c62828
- Font: monospace dla statystyk, sans-serif dla nazw
- Pole bitwy: grid z subtelną siatką linii
- Karty: zaokrąglone rogi, cień, hover glow w kolorze domeny
- Tailwind CSS do szybkiego stylowania

---

## 9. ZASADY DLA CLAUDE CODE

### Kolejność pracy:
1. **Zawsze najpierw silnik** (`game-engine/`), potem UI
2. **Zawsze testy** przed przejściem do kolejnego etapu
3. **Mały commit = jeden feature** (np. "dodaj atak wręcz", "dodaj kontratak")

### Konwencje kodu:
- Composition API + `<script setup lang="ts">`
- Pinia stores z pełnym typowaniem
- Nazwy plików: PascalCase dla komponentów, camelCase dla modułów engine
- Komentarze po polsku w logice gry, po angielsku w kodzie technicznym

### Zasady dotyczące efektów kart:
- Efekty kart NIE SĄ hardcodowane w ifach po nazwie karty
- Każdy efekt to zarejestrowana funkcja w `EffectRegistry`
- Nowa karta = nowy wpis w registry, zero zmian w silniku
- Dla MVP (etap 1-2): zaimplementuj ~10 najprostszych efektów
- Resztę oznacz jako `TODO: implement effect for [nazwa karty]`

### Kiedy coś jest niejasne w zasadach:
- Zakomentuj wariant A i B
- Dodaj `// DESIGN DECISION NEEDED:` z opisem
- Nie zgaduj — zapytaj

---

## 10. KOMENDY STARTOWE

```bash
# Inicjalizacja projektu
npx nuxi@latest init slava-game
cd slava-game

# Instalacja zależności
pnpm add pinia @vueuse/motion @iconify/vue
pnpm add -D vitest @nuxtjs/tailwindcss @formkit/drag-and-drop

# Skopiuj pliki JSON do data/
mkdir -p data
cp [ścieżka]/Slava_Vol2_*.json data/

# Stwórz strukturę katalogów
mkdir -p game-engine stores composables components/{board,cards,ui,debug} tests/{engine,simulation} pages assets/cards

# Odpal dev server
pnpm dev

# Odpal testy
pnpm vitest
```

---

## 11. TRYB "GOLD EDITION" — ZASADY MVP (implementuj PIERWSZY)

- **Przeciwnik**: AI (komputer), nie hotseat
- **Talia**: 30 losowych kart (istoty + przygody)
- **Ręka startowa**: 5 kart
- **Złocisze**: 5 na start, nie odnawiają się
- **Przygody**: kosztują 1 Złocisz, działają od razu z `enhancedEffect`
- **Limit pola**: max 5 istot na polu jednocześnie (chyba że karta mówi inaczej)
- **Limit wystawiania**: 1 istota + 1 przygoda na turę (chyba że karta mówi inaczej)
- **Wygrana**: wróg nie ma istot na polu I nie ma istot w ręce, LUB wróg ma 0 kart w talii
- **Brak**: Panteonu, Pór Roku, Licytacji, Sławy
- **Widoczność**: Gracz widzi swoją rękę. Ręka AI zakryta. Pole obu graczy widoczne.
- **Tura AI**: automatyczna, z opóźnieniem ~1s między akcjami (żeby gracz widział co się dzieje)

## 11b. TRYB "SLAVA!" — ZASADY PEŁNE (implementuj DRUGI)

Wszystko co w Gold Edition, PLUS:
- **Sława (GP)**: Start 0, Cel 10. +1 GP co turę. Trofea (suma defense zabitych >= 9 → +1 GP). Przełamanie linii → kradzież 1 GP.
- **Panteon**: Pory roku z `Slava_Vol2_Panteon_Normalized.json`. Pasywne bonusy per domena. Paraliż przy zmianie pory.
- **Licytacja**: Gracz kładzie X GP na boga → rywal przebija lub pasuje → zwycięzca odpala moc.
- **Karty Przygody**: Bazowy efekt za darmo, `enhancedEffect` za dodatkowy GP.
- **Wygrana**: Pierwszy gracz z 10 GP.

---

## 12. PRIORYTETY — CO JEST WAŻNE, A CO NIE

🔴 **KRYTYCZNE** (etap 1-2):
- Poprawna logika walki (obrażenia, kontratak, śmierć)
- Poprawny zasięg ataków (linie, typy)
- Dynamiczny front (przesunięcie linii)
- Pozycja atak/obrona
- Wystawianie kart na pole
- **AI przeciwnik** — grywalna partia vs komputer
- Wyświetlanie stanu gry
- Tryb Gold Edition kompletny

🟡 **WAŻNE** (etap 3-4):
- Efekty kart (przynajmniej 30 najważniejszych)
- Karty przygody (zdarzenia, artefakty, lokacje)
- AI rozumie efekty kart
- Drag & drop
- Action log
- Polish: animacje, ekran końca gry

🟢 **MIŁE** (etap 5):
- Symulacja balansu (AI vs AI, 10k gier)
- Dashboard statystyk
- Dźwięki

🔵 **TRYB SLAVA!** (etap 6):
- System Sławy (GP)
- Panteon i Pory Roku
- Licytacja
- AI Strateg (zarządzanie GP)

⚪ **PRZYSZŁOŚĆ** (etap 7-8):
- Multiplayer WebSocket
- Google Play (Capacitor)

---

## 13. AI — SZCZEGÓŁY IMPLEMENTACJI

### Plik: `game-engine/AIPlayer.ts`

```typescript
export interface AIDecision {
  type: 'play_creature' | 'play_adventure' | 'attack' | 'change_position' | 'end_turn'
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
}

export interface AIPlayerInterface {
  decideTurn(gameState: GameState): AIDecision[]
}
```

### Plik: `game-engine/AIStrategy.ts`

Trzy poziomy trudności (implementuj od najprostszego):

**EASY (Etap 2 — implementuj PIERWSZY):**
- Wystawia losową kartę z ręki
- Atakuje losowy cel w zasięgu
- 50% szans na zmianę pozycji

**MEDIUM (Etap 3):**
- Wystawia kartę o najwyższym attack+defense
- Atakuje cel który może zabić jednym ciosem, inaczej cel z najniższym defense
- Stawia w obronie słabe istoty (defense < 3)
- Zagrywa przygody na odpowiednie cele

**HARD (Etap 4+):**
- Analizuje zagrożenia (co wróg może zabić w następnej turze)
- Planuje 1 turę do przodu (jeśli zabiję X, to Y zostanie odkryty)
- Priorytetyzuje cele strategiczne (zabij healera/buffera przed tankiem)
- Optymalnie zarządza Złociszami

### Opóźnienia AI (UX):
- Między decyzjami AI: 800ms delay
- Przy wystawieniu karty: 500ms animacja
- Przy ataku: 1000ms (żeby gracz zobaczył co się dzieje)
- Configowalny `AI_DELAY_MS` w ustawieniach (0 dla symulacji)
