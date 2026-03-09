# SŁAWA! Vol.2 — UI REDESIGN PROMPT

> Ten dokument opisuje REDESIGN wizualny gry. Silnik, typy, stany, AI — wszystko działa.
> NIE powtarza treści z `CLAUDE_CODE_INSTRUCTIONS.md` ani `CLAUDE_CODE_TASKS.md`.
> Czytaj oba dokumenty razem.

---

## 1. CO ZMIENIAMY

Obecne UI (prototypowe) zastępujemy docelowym designem:
- **Plansza**: layout Lewo/Prawo z tłem Axis Mundi (Drzewo Świata)
- **Karty na polu**: full-art, tylko nazwa + symbole + staty (zero tekstu zdolności)
- **Karty w ręce**: full-art, czyste (zero tagu, zero fragmentu efektu)
- **Podgląd**: duży panel z lewej strony, stała pozycja (nie na środku ekranu)
- **Ikony**: custom SVG w stylu bold silhouette (nie @iconify)
- **Paleta**: ciemna, ornamentalna, kolory domen jak w Axis Mundi

Obecne pliki do ZASTĄPIENIA (nie usuwaj — nowa wersja obok):
- `components/board/GameBoard.vue` → nowy layout
- `components/board/PlayerField.vue` → kolumny zamiast wierszy
- `components/board/BattleLine.vue` → pionowe kolumny
- `components/cards/CreatureCard.vue` → SmallCard (full-art)
- `components/ui/PlayerHand.vue` → wachlarz z animacją
- `components/ui/CardTooltip.vue` → CardPreview (duży, lewy dolny róg)

Pliki do DODANIA:
- `components/board/BattlefieldBackground.vue`
- `components/cards/SmallCard.vue`
- `components/cards/HandCard.vue`
- `components/cards/CardPreview.vue`
- `components/cards/FireParticles.vue`
- `components/icons/SvgIcon.vue`

---

## 2. LAYOUT PLANSZY — WARIANT B (LEWO/PRAWO)

Zamiast obecnego top/bottom, plansza jest HORYZONTALNA:

```
┌─────────────────────────────────────────────────────────────┐
│ TOP BAR: Twoja tura | R.1 | Wystawiaj | [Zakończ turę]     │
├────┬────────┬────────┬────────┬──┬────────┬────────┬────────┤
│    │  oL3   │  oL2   │  oL1   │◆ │  pL1   │  pL2   │  pL3  │
│WRÓG│korzenie│        │  pień  │AX│  pień  │        │korona │
│info│ NAWIA  │        │        │IS│        │        │PRAWIA │
│    │        │        │        │  │        │        │       │
├────┴────────┴────────┴────────┴──┴────────┴────────┴───────┤
│ PROMPT: "Wystaw istotę lub zagraj kartę przygody"          │
├────────────────────────────────────────────────────────────-┤
│ RĘKA:  [K1] [K2] [K3] [K4] [K5]  (wachlarz)              │
└────────────────────────────────────────────────────────────-┘
```

### Proporcje (% szerokości)
- Side panels: ~5% (lewy=wróg, prawy=gracz) — talia, nawia, PS
- oL3: 8–16% | oL2: 16–30% | oL1: 30–46%
- AXIS MUNDI divider: 46–54%
- pL1: 54–70% | pL2: 70–84% | pL3: 84–96%

### Tło — Axis Mundi (Drzewo Świata)
Obraz WebP (1920×1080) jako `background-size: cover`. Drzewo rośnie POZIOMO:
- Korzenie (lewo) = NAWIA (wróg, fiolet)
- Pień (centrum) = JAWIA (divider, złoty)
- Korona (prawo) = PRAWIA (gracz, złoty)

Obraz jest JUŻ WGRANY: `assets/backgrounds/battlefields/1.webp` (lub .png/.jpg — sprawdź rozszerzenie).
Użyj go jako domyślne tło. Gradientowy fallback na wypadek gdyby obraz nie załadował:
```css
background: linear-gradient(90deg, #06031a 0%, #0e0a24 45%, #0a0620 55%, #08041a 100%);
```
Docelowo: sezonowe warianty (summer/winter/autumn/spring) + opcjonalnie `<video>` z zapętlonym WebM.

### Linie = PIONOWE kolumny
Karty układają się w pionie (max 3-4 na linię). Każda kolumna ma marker (I/II/III).

### Side panels
Półprzezroczyste z backdrop-blur. Zawartość: avatar, talia (CardBack + count), nawia (count), PS/ZŁ.

### Top bar
Zachowaj obecną strukturę (`TurnIndicator` + `ActionLog` + `PhaseControls`), zmień styl na ciemniejszy z golden accent.

### Action prompt (GameHint)
Jedna linia tekstu między planszą a ręką. Zachowaj istniejącą logikę z `GameHint.vue`.

---

## 3. DESIGN KART

### 3A. SmallCard.vue (karta na polu)

Wymiary: ~88×120px (ATK) / ~120×88px (OBR — obrócona)

Zawartość — **TYLKO wizualia, ZERO tekstu zdolności**:
1. Pełnoekranowa ilustracja jako `background-image: cover`
2. Lekka winieta (radial-gradient, transparent→ciemny)
3. Gradient na dole (transparent→#0a0406) pod staty
4. **Nazwa** — 8-9px bold, kolor domeny, Georgia serif, text-shadow
5. **Ikona domeny** — 14-16px, obok nazwy
6. **Skrzydła (LOT)** — animowane, 16-22px, prawy górny róg, jeśli `isFlying && !isGrounded`
7. **Badge pozycji** — ⚔ ATK / ⛊ OBR, 24×24px
8. **Pasek statów** — dolny bar, ciemne tło (rgba 0,0,0,0.78):
   - Lewa: ikona ATK (22px) + liczba (18px bold pomarańczowy)
   - Prawa: liczba DEF (18px bold niebieski) + ikona DEF (22px)

Cząsteczki per domena (8-10 szt, CSS @keyframes):
- Weles → iskry ognia
- Perun → złote iskry
- Nieumarli → fioletowe orby
- Żywi → opadające liście

### 3B. HandCard.vue (karta w ręce)

Wymiary: ~100×140px. Identyczny design jak SmallCard ale:
- **Żadnego tekstu zdolności, tagu, opisu** — zero
- Tylko: art + nazwa + domena + skrzydła + staty
- Hover → prostuje się, unosi
- Klik → scale 1.3, translateY -50px
- Wachlarz: marginesy ujemne (-14px), rotacja per karta, cubic-bezier(0.34, 1.56, 0.64, 1)

### 3C. CardPreview.vue (duży podgląd)

Wymiary: ~340×520px.

**Pozycja: STAŁA, lewy dolny róg** — jak w screenshocie gry (obecny tooltip jest na dole po środku, przenosimy go na lewo-dół). Nie na środku ekranu (blokuje grę), nie podążający za myszką.

Pojawia się przy hover na DOWOLNĄ kartę (pole, ręka). Delay 150ms, fade-in 200ms.

Zawartość (od góry):
1. **Ilustracja** (40% wysokości) z cząsteczkami i vignette
2. **Domena + nazwa** — badges na ilustracji
3. **Atrybuty** — badge typ ataku (ikona + tekst) + LOT
4. **Tag** — `[ZABÓJSTWO]` / `[AURA]` / `[REAKCJA]` etc.
5. **Tekst zdolności** — 13-14px Georgia, pełny, czytelny
6. **Staty masywne** — ikony 28-30px + cyfry text-2xl
7. **Lore** — **WYRAŹNY**, nie zlewający się z tłem:
   - Kolor: **#c4956a** (ciepły miedziany)
   - Font: **13px** italic Georgia
   - **border-left: 3px solid rgba(196,140,80,0.3)** + padding-left 14px
   - line-height 1.7
   - Pełny tekst — NIGDY nie przycinany (no clamp, no overflow hidden)

Animowany border: gradient w kolorze domeny, shimmer 5s. Outer glow pulsujący.

### 3D. Mapowanie trigger → etykieta (wyświetlane TYLKO w CardPreview)

Obecny `CardTooltip.vue` nie wyświetla tagów. Nowy `CardPreview` powinien:
```
ON_PLAY       → "WEJŚCIE"
ON_ACTIVATE   → "AKCJA"
PASSIVE       → "AURA"
ON_DEFEND     → "REAKCJA"
ON_DEATH      → "ŚMIERĆ"
ON_KILL       → "ZABÓJSTWO"
ON_TURN_START → "START TURY"
ON_TURN_END   → "KONIEC TURY"
ON_ATTACK     → "ATAK"
```
Źródło tagu: `EffectRegistry.getEffect(card.cardData.effectId).trigger`.

---

## 4. IKONY SVG

### Styl: bold flat silhouette
Grube wypełnione kształty, jednokolorowe, czytelne w 16px. Bez cienkich linii, bez gradientów. `fill="currentColor"`.

### Zatwierdzona ikona: Tarcza z Kołowrótem (Obrona)
```svg
<svg viewBox="0 0 52 64">
  <path d="M26,2 L48,12 L48,28 C48,48 38,58 26,63 C14,58 4,48 4,28 L4,12Z" fill="currentColor" opacity="0.85"/>
  <path d="M26,8 L42,16 L42,28 C42,44 34,52 26,56 C18,52 10,44 10,28 L10,16Z" fill="var(--bg-base, #06050a)" opacity="0.7"/>
  <circle cx="26" cy="30" r="12" fill="currentColor" opacity="0.85"/>
  <circle cx="26" cy="30" r="8" fill="var(--bg-base, #06050a)" opacity="0.7"/>
  <circle cx="26" cy="30" r="4" fill="currentColor" opacity="0.85"/>
  <rect x="25" y="18" width="2" height="24" fill="currentColor" opacity="0.85" transform="rotate(0 26 30)"/>
  <rect x="25" y="18" width="2" height="24" fill="currentColor" opacity="0.85" transform="rotate(45 26 30)"/>
  <rect x="25" y="18" width="2" height="24" fill="currentColor" opacity="0.85" transform="rotate(90 26 30)"/>
  <rect x="25" y="18" width="2" height="24" fill="currentColor" opacity="0.85" transform="rotate(135 26 30)"/>
</svg>
```

### Pozostałe ikony — placeholdery (czekamy na dostawę od designera)
Użyj prostych kształtów jako tymczasowe:
- **ATK** → dwa ukośne prostokąty na X (topory)
- **Wręcz** → prostokąt (topór)
- **Żywioł** → trójkąt w górę (płomień)
- **Magia** → gwiazdka 5-ramienna
- **Dystans** → trójkąt w prawo (strzałka)
- **Lot** → dwa łuki (skrzydła)
- **Domeny** → kolorowe kółka z literą (P/Ż/N/W)
- **PS/ZŁ** → gwiazdka złota
- **Nawia** → łuk (brama)

Komponent `SvgIcon.vue`: ładuje SVG z `assets/icons/`, props: `name`, `size`, `color`.

---

## 5. NOWA PALETA KOLORÓW

Zastąp obecne CSS variables w `app.vue` i `assets/css/main.css`:

```css
:root {
  --bg-base: #04030a;      /* było #0a0a1a */
  --bg-card: #0a0406;      /* było #111827 */
  --bg-field: #06050a;     /* było #0d1117 */

  --perun: #d4a843;        /* było #f5c542 — cieplejszy, mniej krzykliwy */
  --zyvi: #4a9e4a;         /* było #4caf50 */
  --undead: #8b5fc7;       /* było #9c27b0 */
  --weles: #c44040;        /* było #c62828 */

  --attack-color: #fb923c;
  --defense-color: #60a5fa;

  --gold: #c8a84e;
  --gold-dim: rgba(200, 168, 78, 0.3);

  --font-display: Georgia, 'Times New Roman', serif;
  --font-body: system-ui, -apple-system, sans-serif;
}
```

---

## 6. NOWE FOLDERY

```
assets/
  backgrounds/battlefields/1.*     ← TŁO JUŻ WGRANE (Axis Mundi)
  icons/defense/shield_kolowrot.svg
  icons/attack/placeholder.svg
  icons/...

components/
  board/BattlefieldBackground.vue ← NOWY
  cards/SmallCard.vue             ← NOWY
  cards/HandCard.vue              ← NOWY
  cards/CardPreview.vue           ← NOWY
  cards/FireParticles.vue         ← NOWY
  icons/SvgIcon.vue               ← NOWY
```

---

## 7. INTEGRACJA Z ISTNIEJĄCYM KODEM

### Store'y — bez zmian
`gameStore.ts` i `uiStore.ts` działają. Nowe komponenty używają tych samych:
- `useGameStore()` → stan gry, akcje
- `useUIStore()` → selectedCardId, tooltipCardId, animacje

### CardTooltip → CardPreview
Zastąp. Ten sam trigger: `ui.showTooltip(id)` / `ui.hideTooltip()`.
Pozycja stała: `position: fixed; bottom: 10px; left: 10px;`.
Dane: ten sam mechanizm `findCard()` z obecnego `CardTooltip.vue`.

### CreatureCard → SmallCard
SmallCard jest czysto prezentacyjny. BattleLine zarządza interakcją (klik, drag, stany).
Props SmallCard: `card`, `selected`, `isAttacking`, `isHit`, `isDying`, `isValidTarget`, `dimmed`, `isDefense`.
Emity: `click`, `mouseenter`, `mouseleave`.

### PlayerHand → HandCard
Zachowaj logikę w `PlayerHand.vue`. Zmień rendering:
- Istoty: `HandCard.vue` zamiast `CreatureCard inHand=true`
- Przygody: zachowaj obecny `adventure-card` div
- Wachlarz: CSS transform per-karta

### Ilustracje kart
Obecny `import.meta.glob('../../assets/cards/creature/*.png')` działa.
SmallCard i CardPreview używają tego samego. Fallback: kolorowe tło per-domena.

### @iconify
Zostaje dla ikon UI (menu, przyciski, badge'y statusów w CardPreview). NIE dla ikon kart — karty używają custom SVG przez `SvgIcon.vue`.

---

## 8. KOLEJNOŚĆ PRACY

1. Nowa paleta CSS
2. `BattlefieldBackground.vue` (gradient placeholder)
3. `SvgIcon.vue` + tarcza + placeholdery
4. `FireParticles.vue`
5. `SmallCard.vue`
6. `CardPreview.vue`
7. `HandCard.vue`
8. Nowy `GameBoard.vue` (layout Lewo/Prawo)
9. Nowy `PlayerField.vue` (kolumny)
10. Nowy `BattleLine.vue` (pionowe, integracja SmallCard)
11. Nowy `PlayerHand.vue` (wachlarz)
12. Dopasuj overlay/vignette na istniejącym tle żeby karty były czytelne

---

## 9. NIE RUSZAJ

- `game-engine/*` — silnik działa, ten redesign go nie dotyczy
- `stores/*` — chyba że potrzebujesz nowego pola w `uiStore` (np. `previewSide`)
- `pages/arena.vue` — Arena może używać nowego designu, ale nie jest priorytetem
- `CLAUDE_CODE_INSTRUCTIONS.md` — sekcja "Aktualny stan projektu" tam żyje
- `CLAUDE_CODE_TASKS.md` — zadania silnikowe (triggery, efekty) są tam