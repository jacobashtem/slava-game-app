# RAPORT AUDYTU: Wdrożenie Stosu Produkcyjnego — Sława! Vol.2

**Data:** 2026-03-09
**Projekt:** Sława! Vol.2 — słowiańska karcianka turowa
**Stack:** Nuxt 4.3.1 + Vue 3.5.29 + TypeScript + Pinia

---

## 1. PODSUMOWANIE (TL;DR)

Projekt jest **dobrze przygotowany** na migrację — czysta separacja engine (pure TS) od UI (Vue), reaktywny Pinia store jako jedyny most, brak zewnętrznych zależności animacyjnych. **Główne ryzyka:** (1) PixiJS wymaga przepisania ~1800 linii CreatureCard.vue z DOM na Sprites — to największy koszt, (2) SSR domyślnie włączony w Nuxt — PixiJS wymaga client-only wrappera, (3) 77 keyframes CSS do przepisania na GSAP, (4) @vueuse/motion zainstalowany ale nieużywany — można usunąć. **Rekomendacja:** Opcja B (DOM + GSAP + tsParticles) jest optymalna — zachowuje istniejący DOM rendering, dodaje profesjonalne animacje i particles bez ryzyka pełnego przepisania. PixiJS warto rozważyć dopiero w przyszłości dla tła i heavy VFX.

---

## 2. STAN OBECNY

### 2.1 Struktura projektu

```
slava-game-app/
├── app/
│   ├── app.vue                     ← globalny CSS (60 zmiennych, 6 keyframes, @font-face)
│   ├── pages/                      ← index, game, arena, gallery, rules, showcase
│   └── plugins/v-tip.client.ts     ← tooltip directive
├── components/
│   ├── board/                      ← GameBoard (1165 LOC), BattleLine (577), PlayerField (396)
│   ├── cards/                      ← CreatureCard (1800), CardBack
│   └── ui/                         ← 19 komponentów (PlayerHand, CardTooltip, WeatherEffects, AttackVFX...)
├── composables/
│   ├── useSFX.ts                   ← 358 LOC, Web Audio API, 23 syntezowane SFX
│   └── useTokenIcons.ts            ← parser tokenów ikon w tekście zdolności
├── stores/
│   ├── gameStore.ts                ← 888 LOC, most engine↔UI
│   ├── uiStore.ts                  ← 283 LOC, stan animacji/selekcji
│   └── arenaStore.ts               ← tryb arena
├── game-engine/                    ← pure TS (0 zależności Vue)
│   ├── GameEngine.ts               ← ~1100 LOC, synchroniczny
│   ├── CombatResolver.ts           ← walka + efekty
│   ├── TurnManager.ts              ← fazy tury
│   ├── EffectRegistry.ts           ← definicje efektów
│   ├── AIPlayer.ts                 ← easy/medium/hard
│   ├── GloryManager.ts             ← system Sławy
│   └── types.ts                    ← interfejsy TS
├── data/                           ← JSON: 182 istoty, 62 przygody, 8 bogów
├── assets/
│   ├── backgrounds/battlefields/1/ ← 4 sezony (.webp 400-476K + .png 8-9M fallback)
│   ├── cards/                      ← creature/*.png, domain-*.png, attackType*.png, back.png
│   ├── songs/                      ← song1-6.mp3 (~28MB total)
│   └── fonts/                      ← Kanyon-Regular (.woff + .ttf)
└── public/images/gods/             ← 8 SVG portretów bogów
```

### 2.2 package.json — obecne zależności

```json
{
  "dependencies": {
    "@iconify/vue": "^5.0.0",
    "@pinia/nuxt": "^0.11.3",
    "@vueuse/motion": "^3.0.3",    // ⚠ ZAINSTALOWANA ALE NIEUŻYWANA
    "nuxt": "^4.3.1",
    "pinia": "^3.0.4",
    "vue": "^3.5.29",
    "vue-router": "^4.6.4"
  },
  "devDependencies": {
    "@nuxtjs/tailwindcss": "^6.14.0", // ⚠ USUNIĘTY ALE W DEVDEPS
    "@vitejs/plugin-vue": "^6.0.4",
    "vitest": "^4.0.18"
  }
}
```

### 2.3 nuxt.config.ts

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],
  // SSR: DOMYŚLNIE WŁĄCZONY (brak ssr: false)
  components: [{ path: './components', pathPrefix: false }],
  typescript: { strict: true },
})
```

### 2.4 Tabela plików do migracji

| Plik | LOC | Co robi | Obecne animacje | Co wymaga zmiany |
|------|-----|---------|-----------------|------------------|
| `app/app.vue` | 150 | Global CSS, zmienne, 6 keyframes | card-enter, shake, death-fade, pulse-glow, rune-glow, ember-float | Keyframes → GSAP |
| `CreatureCard.vue` | 1800 | Renderowanie karty, hit VFX, death | 21 keyframes (slash, fire, magic, arrow, death-burn, pulse) | DOM→PixiJS LUB GSAP timeline |
| `PlayerHand.vue` | 660 | Wachlarz kart, selekcja | CSS fan (--fan-angle, --fan-lift), hover scale | GSAP fan animation |
| `GameBoard.vue` | 1165 | Plansza, tło, SFX watchers | 5 keyframes (ai-blink, spin, aura-pulse), season BG swap | GSAP tło transition, tło→PixiJS? |
| `BattleLine.vue` | 577 | Linie bitewne, drag&drop | dmg-float, rune-slot-pulse | GSAP dmg float |
| `PlayerField.vue` | 396 | Pole gracza, events zone | counter-glow, counter-urgent | GSAP pulse |
| `WeatherEffects.vue` | ~180 | Cząsteczki sezonowe (8-25 divs) | 4 keyframes (particle-fall, firefly, leaf, snow) | tsParticles preset |
| `AttackVFX.vue` | ~50 | Screen flash overlay | screen-flash keyframe | GSAP flash |
| `CardTooltip.vue` | 947 | Podgląd karty, fire particles | shimmerBorder, pvFireRise | GSAP + tsParticles |
| `GameOverModal.vue` | ~210 | Modal końca gry | glow-breathe, modal-enter, icon-entrance | GSAP timeline |
| `DeckPile.vue` | ~180 | Talia wizualna | gold-active-glow | GSAP pulse |
| `useSFX.ts` | 358 | 23 SFX syntezowane (Web Audio) | — | Howler.js zamiana |
| `MusicPlayer.vue` | 276 | HTML5 Audio, 6 MP3 | — | Howler.js zamiana |
| `showcase.vue` | ~750 | Demo VFX/SFX | 11 keyframes (duplikaty z CreatureCard) | GSAP timeline |
| `index.vue` | ~480 | Menu główne | fire-breathe, ember-rise, spin, btn-glow-pulse | GSAP + tsParticles embers |

---

## 3. PLAN MIGRACJI (kolejność wdrażania)

### Etap 1: GSAP (priorytet: WYSOKI, ryzyko: NISKIE)

**Dlaczego pierwszy:** Najmniej inwazyjny — zamiana CSS keyframes na `gsap.to()` / `gsap.timeline()`. Nie zmienia struktury DOM ani architektury. Natychmiastowa poprawa jakości animacji (easing, sekwencjonowanie, callbacks).

**Zakres:**
- 77 keyframes CSS → GSAP
- Composable `useGSAP()` z auto-cleanup na `onUnmounted`
- Timeline sekwencje ataków (reveal → charge → hit → damage float → death)

### Etap 2: Howler.js (priorytet: WYSOKI, ryzyko: NISKIE)

**Dlaczego drugi:** Całkowicie niezależny — nowy system audio obok istniejącego. Zamiana 358 linii Web Audio boilerplate na konfiguracyjny Howler + audio sprites. Możliwość dodania prawdziwych sampli zamiast syntezowanych tonów.

**Zakres:**
- Nowy `useAudio.ts` (zamiana useSFX.ts)
- Audio sprite sheet (1 plik = 50+ efektów)
- MusicPlayer refactor na Howler
- Stereo panning (lewy kanał = lewa strona planszy)

### Etap 3: tsParticles (priorytet: ŚREDNI, ryzyko: NISKI)

**Dlaczego trzeci:** Zamiana ręcznych CSS particles (WeatherEffects: 25 divów, CreatureCard fire: 10 divów) na konfigurowalny system. Daje kontrolę nad emitterami, collision, interaction.

**Zakres:**
- WeatherEffects.vue: 4 presety sezonowe
- CreatureCard.vue: per-domain VFX (ogień, iskry, duchy, liście)
- Menu: embers
- Celebracja zwycięstwa: konfetti
- Bóstwa: moce bogów particles

### Etap 4: PixiJS (priorytet: OPCJONALNY, ryzyko: WYSOKI)

**Dlaczego opcjonalny:** Największa zmiana — wymaga przepisania renderingu kart z DOM na Sprites. Obecny DOM rendering działa dobrze przy max 24 kartach. PixiJS opłaca się tylko jeśli:
- Potrzebne heavy VFX (>100 cząsteczek jednocześnie)
- Plansza ma być wizualnie bogatsza (parallax tło, particle tło)
- Cel: 60fps na słabych urządzeniach

**Rekomendacja:** Hybrid — tło w PixiJS, karty w DOM. Lub pominąć.

### Etap 5: Electron + Steam (priorytet: NA KOŃCU, ryzyko: ŚREDNI)

**Dlaczego ostatni:** Packaging nie wymaga zmian w kodzie gry. Wymaga:
- `nuxt generate` (zmiana z SSR na static)
- Electron wrapper
- steamworks.js integracja
- Build pipeline (Windows: .exe, Mac: .app, Linux: .deb)

---

## 4. PUNKTY INTEGRACJI

### 4.1 GSAP

**Pliki do zmiany:**

| Plik | Zmiana | Linie |
|------|--------|-------|
| `CreatureCard.vue` | 21 keyframes → GSAP, attack timeline, death timeline | 760-1603 |
| `app/app.vue` | 6 keyframes → GSAP utility classes | 85-148 |
| `WeatherEffects.vue` | 4 particle keyframes → GSAP stagger | 61-160 |
| `GameBoard.vue` | 5 keyframes → GSAP | 533-925 |
| `BattleLine.vue` | dmg-float → GSAP tween | 443-504 |
| `PlayerHand.vue` | fan layout → GSAP + Flip | ~191-203 |
| `GameOverModal.vue` | 4 entrance keyframes → GSAP timeline | 141-203 |
| `CardTooltip.vue` | shimmer + fire → GSAP | 387-458 |
| `PlayerField.vue` | counter pulse → GSAP | 312-329 |
| `DeckPile.vue` | gold glow → GSAP | 166-169 |
| `showcase.vue` | 11 keyframes → GSAP (duplikaty) | 457-743 |
| `index.vue` | 4 menu keyframes → GSAP | 253-467 |
| `AttackVFX.vue` | screen-flash → GSAP | 44-47 |

**Nowe pliki:**
```
composables/useGSAP.ts    — GSAP context per-komponent, auto-kill on unmount
plugins/gsap.client.ts     — rejestracja pluginów (Flip, ScrollTrigger jeśli potrzebny)
```

**Composable `useGSAP.ts`:**
```typescript
import { onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'

export function useGSAP() {
  let ctx: gsap.Context

  onMounted(() => { ctx = gsap.context(() => {}) })
  onUnmounted(() => { ctx?.revert() })

  return {
    gsap,
    timeline: (vars?: gsap.TimelineVars) => gsap.timeline(vars),
    to: gsap.to,
    from: gsap.from,
    context: () => ctx,
  }
}
```

**Przykład migracji — CreatureCard hit-impact:**
```css
/* PRZED (CSS): */
@keyframes hit-impact {
  0%   { translate: 0 0; }
  15%  { translate: -5px 3px; }
  30%  { translate: 6px -2px; }
  45%  { translate: -4px 4px; }
  60%  { translate: 3px -3px; }
  80%  { translate: -2px 1px; }
  100% { translate: 0 0; }
}
```
```typescript
// PO (GSAP):
gsap.to(cardEl, {
  x: [-5, 6, -4, 3, -2, 0],
  y: [3, -2, 4, -3, 1, 0],
  duration: 0.5,
  ease: 'power2.out'
})
```

**Przykład migracji — attack timeline:**
```typescript
const attackTimeline = gsap.timeline()
  .to(attackerEl, { scale: 1.1, duration: 0.2 })        // charge
  .to(attackerEl, { x: 20, duration: 0.15 })             // lunge
  .call(() => sfx.sfxAttackMelee())                      // SFX
  .to(defenderEl, { x: [-5, 6, -4, 0], duration: 0.4 }) // shake
  .to(dmgNumberEl, { y: -60, opacity: 0, duration: 1 }) // float dmg
  .to(attackerEl, { x: 0, scale: 1, duration: 0.2 })    // return
```

**Konflikty:**
- `@vueuse/motion` (zainstalowany) — USUNĄĆ (nieużywany, potencjalny konflikt z GSAP)
- CSS `transition` na elementach animowanych przez GSAP — usunąć (GSAP zarządza)
- `will-change` ręczne — GSAP sam zarządza `will-change`

---

### 4.2 Howler.js

**Pliki do zmiany:**

| Plik | Zmiana |
|------|--------|
| `composables/useSFX.ts` | Zamiana 358 LOC Web Audio → Howler sprites |
| `components/ui/MusicPlayer.vue` | HTML5 Audio → Howler instancja |
| `components/board/GameBoard.vue` | SFX watchers — import zmiana (useSFX → useAudio) |

**Nowe pliki:**
```
composables/useAudio.ts        — Howler AudioManager (singleton)
plugins/audio.client.ts         — preload audio sprites
public/audio/sfx-sprite.mp3    — sprite sheet z efektami
public/audio/sfx-sprite.json   — timing map
```

**Composable `useAudio.ts`:**
```typescript
import { Howl, Howler } from 'howler'

let sfxSprite: Howl | null = null
let bgmHowl: Howl | null = null

export function useAudio() {
  function init() {
    sfxSprite = new Howl({
      src: ['/audio/sfx-sprite.mp3'],
      sprite: {
        attackMelee: [0, 500],
        attackMagic: [500, 800],
        hit: [1300, 400],
        death: [1700, 900],
        // ... 50+ efektów
      }
    })
  }

  function play(name: string) { sfxSprite?.play(name) }
  function setVolume(v: number) { Howler.volume(v) }

  return { init, play, setVolume }
}
```

**Konflikty:**
- Web Audio context z useSFX.ts — usunąć stary system po migracji
- Browser autoplay policy — Howler automatycznie obsługuje (unlock on interaction)
- SSR — Howler wymaga `window` → client-only plugin

---

### 4.3 tsParticles

**Pliki do zmiany:**

| Plik | Zmiana |
|------|--------|
| `WeatherEffects.vue` | 8-25 divów CSS → `<vue-particles>` z presetem sezonowym |
| `CreatureCard.vue` | Fire/magic/arrow particles → tsParticles emitter |
| `CardTooltip.vue` | pvFireRise particles → tsParticles |
| `index.vue` | ember-rise → tsParticles emitter |
| `showcase.vue` | Duplikaty particles → tsParticles |

**Nowe pliki:**
```
composables/useParticles.ts     — tsParticles preset factory
plugins/particles.client.ts     — tsParticles Vue3 plugin init
```

**Presety cząsteczek:**
```
Wiosna:  kwiaty (🌸) opadające, jasne kolory, lekki drift
Lato:    świetliki (●) unoszące się, pulsujące opacity, złote
Jesień:  liście (🍂) opadające z rotacją, bursztynowe/czerwone
Zima:    śnieg (●) opadający, białe, wolny drift
Ogień:   cząsteczki (●) wznoszące się, gradient żółty→czerwony
Magia:   iskry (✦) rozbiegające się radialnie, fioletowe
Strzała: szybki strumień (—) z lewej na prawo, niebieski
Śmierć:  dym (●) unoszący się, szary, zanikający
Konfetti: multi-color (■) eksplozja radialna
Bóstwa:  per-bóg unikalne (Perun=pioruny, Marzanna=lód, Jarył=kwiaty...)
```

**Konflikty:**
- tsParticles vs @pixi/particle-emitter — decyzja do podjęcia (sekcja 5)
- Z-index: tsParticles canvas musi być pod UI ale nad tłem
- Mobile performance: limit particle count na słabych urządzeniach

---

### 4.4 PixiJS + vue3-pixi (OPCJONALNY)

**Pliki do zmiany (jeśli full migration):**

| Plik | Zmiana | Skala |
|------|--------|-------|
| `GameBoard.vue` | `<div>` → `<Application>` + `<Container>` | OGROMNA |
| `BattleLine.vue` | `<div>` → `<Container>` + `<Sprite>` per karta | OGROMNA |
| `CreatureCard.vue` | DOM → PixiJS Sprite + text layers | OGROMNA (1800 LOC) |
| `PlayerHand.vue` | DOM → PixiJS Container z fan layout | DUŻA |
| `PlayerField.vue` | Flex → PixiJS Container positioning | DUŻA |
| `WeatherEffects.vue` | CSS particles → @pixi/particle-emitter | ŚREDNIA |

**Pliki do zmiany (jeśli hybrid — REKOMENDOWANE):**

| Plik | Zmiana | Skala |
|------|--------|-------|
| `GameBoard.vue` | Dodać PixiJS `<canvas>` jako tło (za DOM overlay) | MAŁA |
| `WeatherEffects.vue` | CSS → PixiJS particles (opcjonalnie) | ŚREDNIA |

**Nowe pliki:**
```
composables/usePixiApp.ts       — PixiJS Application singleton
plugins/pixi.client.ts           — vue3-pixi Nuxt plugin (client-only)
components/board/PixiBg.vue      — PixiJS background renderer (hybrid)
```

**Konflikty:**
- SSR: PixiJS wymaga `window`/`document` → `<ClientOnly>` wrapper lub `ssr: false`
- vue3-pixi peer deps — sprawdzić kompatybilność z Vue 3.5.29
- Event system: PixiJS ma własny event system, nie Vue events
- CSS zmienne nie działają w PixiJS — kolory muszą być hex/rgb wartości

---

### 4.5 Electron + steamworks.js

**Pliki do zmiany:**

| Plik | Zmiana |
|------|--------|
| `nuxt.config.ts` | Dodać `ssr: false` + `nitro: { preset: 'static' }` |
| `package.json` | Nowe scripts: `electron:dev`, `electron:build` |

**Nowe pliki:**
```
electron/
  main.js              — Electron main process (BrowserWindow + Steam overlay)
  preload.js           — IPC bridge (jeśli contextIsolation)
  forge.config.js      — Electron Forge: makers (squirrel/zip/deb)

steam/
  steam_appid.txt      — Steam App ID
```

**Konflikty:**
- SSR→Static: zmiana build pipeline (`nuxt generate` zamiast `nuxt build`)
- steamworks.js wymaga `contextIsolation: false` — potencjalne ryzyko bezpieczeństwa
- Electron base: ~120MB + assets (~35MB) = ~155MB installer
- Cross-platform builds wymagają CI (GitHub Actions)

---

## 4B. DODATKOWE PACZKI — ANALIZA

### 4B.1 KAPLAY.js (dawniej Kaboom.js)

**Co to:** HTML5 game engine z ECS (Entity Component System), wbudowaną fizyką, kolizjami, edytorem (KAPLAYGROUND). Następca Kaboom.js po porzuceniu przez Replit.

| Cecha | Wartość |
|-------|---------|
| **Bundle size** | ~50-80KB gzipped (lekki) |
| **Vue integracja** | ❌ BRAK — osobny canvas, zero komponentów Vue |
| **Nuxt module** | ❌ Brak |
| **Cel** | Gry arcade/platformówki w canvas |
| **ECS** | ✅ Wbudowany (entity + components + systems) |
| **Fizyka** | ✅ Wbudowana (arcade physics) |
| **Particles** | ✅ Wbudowane (proste) |
| **TypeScript** | ✅ Pełny support |

**Plusy:**
- Lekki, szybki prototyping
- Wbudowany ECS — dobry do zarządzania wieloma istotami
- TypeScript + KAPLAYGROUND editor
- Darmowy, open-source, aktywna społeczność

**Minusy:**
- **Zero integracji z Vue** — dwa osobne systemy renderingu (Vue DOM + KAPLAY canvas)
- Wymaga ręcznego wiring event bubbling między Vue a canvas
- Nie projektowany pod component-heavy UI (karty z wieloma stanami/badge'ami)
- Overkill jeśli Vue już zarządza UI
- Brak hybrid mode — albo KAPLAY albo DOM

**Ocena dla Sławy:**
⚠️ **Słaby fit.** KAPLAY świetny pod gry arcade/platformówki, ale karcianka turowa z bogatym UI (20+ stanów na karcie, tooltips, modals, drag&drop) to domena DOM/Vue. Przepisanie CreatureCard (1800 LOC z badge'ami, overlays, konterami) na KAPLAY entities byłoby ogromnym kosztem bez zysku. Ewentualne zastosowanie: **osobna mini-gra** w ramach Sławy (np. bitwa na planszy w stylu arcade).

---

### 4B.2 @pixi/particle-emitter (zamiast tsParticles)

**Co to:** Dedykowany system cząsteczek dla PixiJS, korzystający z GPU-accelerated ParticleContainer.

| Cecha | tsParticles | @pixi/particle-emitter |
|-------|-------------|----------------------|
| **Bundle** | ~40KB (slim) | ~15KB + PixiJS (~200KB) = **~215KB** |
| **Peer dep** | Standalone (własny canvas) | ❌ **Wymaga pixi.js** |
| **Performance** | Dobra (do ~500 cząsteczek) | Świetna (1M+ cząsteczek @ 60fps) |
| **Vue plugin** | ✅ `@tsparticles/vue3` | ❌ Ręczna integracja |
| **Config** | JSON presets (łatwy) | Programmatic + JSON |
| **Editor** | ✅ Online editor | ✅ Particle editor tool |
| **Standalone** | ✅ TAK | ❌ NIE (wymaga PixiJS context) |

**Kiedy wybrać @pixi/particle-emitter:**
- Gdy PixiJS jest JUŻ w projekcie (Opcja A lub C z sekcji 9)
- Potrzeba 500+ cząsteczek jednocześnie (heavy VFX)
- Cząsteczki muszą interagować z innymi PixiJS obiektami

**Kiedy wybrać tsParticles:**
- Gdy rendering jest DOM-based (Opcja B — rekomendowana)
- Standalone — nie wymaga PixiJS
- Łatwiejsza konfiguracja JSON
- Oficjalny Vue plugin

**Ocena dla Sławy:**
Przy Opcji B (DOM + GSAP) → **tsParticles** jest lepszym wyborem (standalone, łatwiejszy setup).
Przy Opcji A/C (PixiJS) → **@pixi/particle-emitter** jest naturalnym wyborem (natywny, wydajniejszy).

**Jeśli chcesz @pixi/particle-emitter BEZ pełnego PixiJS renderingu kart:**
Możliwy hybrid: PixiJS canvas TYLKO na particles (tło + VFX), karty w DOM. Ale to oznacza PixiJS dependency (~200KB) tylko dla cząsteczek — tsParticles robi to samo za ~40KB.

---

### 4B.3 TresJS (Vue 3 renderer dla Three.js)

**Co to:** Custom Vue 3 renderer dla Three.js — pisze się `<TresCanvas>`, `<TresMesh>`, `<TresPointLight>` jako komponenty Vue. Oficjalny Nuxt module `@tresjs/nuxt`.

| Cecha | Wartość |
|-------|---------|
| **Bundle size** | ~155KB gzipped (Three.js core) + ~5-10KB (TresJS wrapper) |
| **Vue integracja** | ✅ **DOSKONAŁA** — custom renderer, composables, reactive props |
| **Nuxt module** | ✅ `@tresjs/nuxt` — auto-imports, client-only, devtools |
| **Cel** | 3D sceny w Vue (WebGL) |
| **2D support** | ⚠️ Możliwy ale overkill (OrthographicCamera + PlaneGeometry) |
| **Shaders** | ✅ Custom shaders (GLSL) — fire, magic, ice, lightning |
| **Post-processing** | ✅ `@tresjs/post-processing` (bloom, blur, chromatic aberration) |

**Plusy:**
- **Najlepsza integracja z Vue/Nuxt** spośród wszystkich paczek
- 3D card flips (realistyczna rotacja karty z perspektywą)
- Parallax battlefield background (warstwy z depth)
- Custom shaders: ogień, magia, pioruny, lód — programowalne GPU efekty
- Post-processing: bloom glow na kartach, blur na modals, god aura
- Oficjalny Nuxt module z devtools

**Minusy:**
- **155KB to dużo** na "ładniejsze animacje"
- Learning curve (Three.js: geometries, materials, cameras, lighting)
- Overkill jeśli nie planujesz 3D efektów
- WebGL context — dodatkowe zużycie GPU

**Potencjalne zastosowania w Sławie:**
- 🃏 **3D card flip** — obrót karty 180° z perspektywą (reveal hidden cards)
- 🏔️ **Parallax tło** — 3-4 warstwy z depth (niebo, góry, las, pole bitwy)
- ✨ **Shader VFX** — fire shader (Perun), ice shader (Marzanna), magic shader (Weles)
- 🌟 **Post-processing bloom** — złoty glow na legendach, boski blask na Łasce
- ⚡ **GPU particle system** — Three.js Points z custom shader (1M+ cząsteczek)

**Ocena dla Sławy:**
✅ **Dobry wybór JEŚLI** planujesz premium 3D efekty (card flip, parallax, shaders). Najlepsza integracja z Vue/Nuxt. Ale **overkill jeśli** wystarczą 2D animacje GSAP.

**Rekomendacja:** Rozważ TresJS jako **Etap 4 alternatywa** zamiast PixiJS — lepsza integracja z Vue, shaders > sprites, ale większy bundle.

---

## 5. DECYZJE DO PODJĘCIA

### 5.1 PixiJS: full canvas vs hybrid DOM+Canvas vs DOM-only?

| | Opcja A: Full PixiJS | Opcja B: DOM + GSAP | Opcja C: Hybrid |
|---|---|---|---|
| **Trudność** | OGROMNA (przepisanie 5000+ LOC) | NISKA (zamiana keyframes) | ŚREDNIA (PixiJS tło + DOM karty) |
| **Wydajność** | Najlepsza (GPU rendering) | Bardzo dobra (max 24 kart) | Dobra (tło GPU, karty DOM) |
| **Elastyczność** | Niska (pixel-perfect design) | Najwyższa (CSS + HTML + flexbox) | Wysoka (CSS dla kart, GPU dla efektów) |
| **Czas implementacji** | 80-120h | 15-25h | 30-50h |
| **Mobile** | Skomplikowane (touch, scaling) | Natywne (responsive CSS) | Mieszane |
| **Dostępność** | Brak (canvas) | Pełna (DOM) | Częściowa |
| **Online multiplayer** | Neutralne | Neutralne | Neutralne |

**REKOMENDACJA: Opcja B (DOM + GSAP + tsParticles)** — najlepszy stosunek efektu do kosztu. Obecny DOM rendering obsługuje 24 karty bez problemu. GSAP daje profesjonalne animacje. tsParticles daje particles bez PixiJS overhead.

### 5.2 Particles: tsParticles vs @pixi/particle-emitter?

| | tsParticles | @pixi/particle-emitter |
|---|---|---|
| **Wymaga PixiJS?** | NIE (standalone canvas) | TAK |
| **Konfiguracja** | JSON presets (łatwa) | Programmatic (więcej kodu) |
| **Wydajność** | Dobra (do ~500 cząsteczek) | Świetna (1M+ @ 60fps) |
| **Vue integracja** | `@tsparticles/vue3` (oficjalna) | Ręczna |
| **Bundle size** | ~40KB (slim) | ~15KB (ale wymaga pixi.js ~200KB) |

**REKOMENDACJA:**
- **Opcja B (DOM-only):** tsParticles — standalone, łatwy config
- **Opcja A/C (PixiJS):** @pixi/particle-emitter — natywny, wydajniejszy

### 5.6 3D efekty: TresJS vs PixiJS vs GSAP-only?

| | GSAP-only | PixiJS | TresJS (Three.js) |
|---|---|---|---|
| **Card flip 3D** | ⚠️ CSS perspective | ❌ 2D-only | ✅ Prawdziwy 3D |
| **Parallax tło** | CSS layers | ✅ Sprite layers | ✅ Z-depth layers |
| **Custom shaders** | ❌ | ⚠️ Fragment shaders | ✅ GLSL + post-processing |
| **Bundle** | 28KB | 200KB | 160KB |
| **Vue integracja** | Composable | Ręczna | ✅ Nuxt module |

**REKOMENDACJA:** Jeśli potrzebujesz 3D card flip lub custom shaders → TresJS. Jeśli 2D wystarczy → GSAP-only.

### 5.7 KAPLAY.js: pełny game engine czy komponenty?

**REKOMENDACJA: NIE dla głównej gry.** KAPLAY to canvas-first game engine — nie integruje się z Vue. Sensowny tylko jako osobny mini-game w ramach projektu (np. interaktywna bitwa arcade). Dla karciankę turowej z bogatym UI → Vue DOM + GSAP.

### 5.3 GSAP: globalne timeline'y vs per-komponent?

**REKOMENDACJA: Per-komponent z useGSAP()** — każdy komponent zarządza swoimi animacjami, auto-cleanup na unmount. Globalne timeline'y (attack sequence) w gameStore.

### 5.4 Audio: sprite sheets vs osobne pliki?

**REKOMENDACJA: Sprite sheets** — 1 plik = 50+ efektów, jedno połączenie HTTP, szybsze odtwarzanie (preloaded). Osobne pliki tylko dla BGM (streaming).

### 5.5 Electron: electron-forge vs electron-builder?

| | electron-forge | electron-builder |
|---|---|---|
| **Oficjalny** | TAK (Electron team) | Community |
| **Prostota** | Wyższa | Niższa (więcej opcji) |
| **Cross-platform** | GitHub Actions | GitHub Actions |
| **Steam** | Wspiera | Wspiera |
| **Auto-update** | Wbudowany | Wbudowany |

**REKOMENDACJA: electron-forge** — oficjalny, prostszy setup, wystarczający dla gry single-player.

---

## 6. RYZYKA I MITYGACJE

### 6.1 Wydajność

| Scenariusz | Max elementów | Ryzyko | Mitygacja |
|---|---|---|---|
| Karty na planszy | 24 (2×3 linie × 4 karty) | NISKIE | DOM rendering wystarczy |
| Particles (pogoda) | 25 divs → tsParticles | NISKIE | Limit na mobile |
| Particles (VFX ataku) | 10 per atak | NISKIE | One-shot, krótkie |
| Particles (menu embers) | 30 | NISKIE | CSS/tsParticles |
| Animacje jednoczesne | 3-5 (atak + hit + dmg + death) | ŚREDNIE | GSAP timeline sekwencja |

### 6.2 Rozmiar bundla

| Paczka | Rozmiar (gzipped) | Wpływ |
|---|---|---|
| GSAP | ~28KB | Minimalny |
| Howler.js | ~10KB | Minimalny |
| @tsparticles/slim | ~40KB | Akceptowalny |
| pixi.js (jeśli użyty) | ~200KB | Znaczący |
| @pixi/particle-emitter | ~15KB (+PixiJS ~200KB) | Znaczący (jeśli PixiJS nie jest) |
| TresJS + Three.js | ~160KB | Znaczący |
| KAPLAY.js | ~50-80KB | Średni |
| Electron base | ~120MB | Duży (desktop only) |
| **Opcja B: GSAP+Howler+tsParticles** | **~78KB** | **Akceptowalny** |
| **Opcja B+TresJS** | **~238KB** | **Akceptowalny (premium 3D)** |
| **Opcja A: Full PixiJS** | **~253KB** | **Znaczący** |
| **Z Electron** | **+~120MB** | **Typowy dla Electron** |

**Obecny build:** ~41MB (głównie audio MP3 + PNG). Po optymalizacji: audio sprites + WebP creature art mogą zmniejszyć do ~15MB.

### 6.3 SSR/SSG kompatybilność

| Paczka | SSR-safe? | Mitygacja |
|---|---|---|
| GSAP | ❌ (wymaga DOM) | `<ClientOnly>` lub `process.client` guard |
| Howler.js | ❌ (wymaga Web Audio) | Plugin `.client.ts` |
| tsParticles | ❌ (wymaga canvas) | Plugin `.client.ts` |
| PixiJS | ❌ (wymaga WebGL) | Plugin `.client.ts` + `<ClientOnly>` |

**Rekomendacja:** Dodać `ssr: false` w `nuxt.config.ts` — gra nie potrzebuje SSR (zero SEO value). Upraszcza wszystkie integracje.

### 6.4 Mobile

| Paczka | Mobile support | Uwagi |
|---|---|---|
| GSAP | ✅ Pełny | Touch events + reduced motion |
| Howler.js | ✅ Pełny | Auto-unlock on touch |
| tsParticles | ✅ Dobry | Trzeba limitować particle count |
| PixiJS | ⚠️ Częściowy | WebGL2 nie na wszystkich mobile |

---

## 7. NOWE PLIKI DO STWORZENIA

```
composables/
  useGSAP.ts           — GSAP context per-komponent (cleanup na unmount)
  useAudio.ts          — Howler AudioManager singleton (zamiana useSFX.ts)
  useParticles.ts      — tsParticles preset factory (sezon, domena, VFX)

plugins/
  gsap.client.ts       — rejestracja GSAP plugins (Flip, ScrollTrigger)
  audio.client.ts      — preload audio sprites, inicjalizacja Howler
  particles.client.ts  — tsParticles Vue3 plugin init (@tsparticles/slim)

public/audio/
  sfx-sprite.mp3       — audio sprite sheet (50+ efektów, ~2MB)
  sfx-sprite.json      — timing map dla sprite sheet

electron/              — (Etap 5, opcjonalny)
  main.js              — Electron main process
  preload.js           — IPC bridge
  forge.config.js      — Electron Forge config

steam/                 — (Etap 5, opcjonalny)
  steam_appid.txt      — Steam App ID
```

---

## 8. KOMENDY INSTALACJI

```bash
# Etap 1: Animacje
npm install gsap

# Etap 2: Audio
npm install howler
npm install -D @types/howler

# Etap 3: Particles (WYBIERZ JEDNĄ OPCJĘ)
# Opcja A: tsParticles (standalone, łatwy config)
npm install @tsparticles/vue3 @tsparticles/slim
# Opcja B: PixiJS + particle-emitter (GPU, wymaga PixiJS)
npm install pixi.js @pixi/particle-emitter

# Etap 4 (opcjonalny): 3D efekty / GPU rendering (WYBIERZ JEDNĄ)
# Opcja A: TresJS (3D, najlepsza integracja z Vue/Nuxt)
npm install @tresjs/core three
npm install -D @tresjs/nuxt @types/three
# Opcja B: PixiJS (2D GPU rendering)
npm install pixi.js vue3-pixi
# Opcja C: KAPLAY (game engine, NIE REKOMENDOWANY dla karciankę)
npm install kaplay

# Etap 5 (opcjonalny): Desktop
npm install -D electron @electron-forge/cli @electron-forge/maker-squirrel @electron-forge/maker-zip @electron-forge/maker-deb
npm install steamworks.js

# Cleanup: usunąć nieużywane
npm uninstall @vueuse/motion @nuxtjs/tailwindcss
```

---

## 9. PORÓWNANIE OPCJI RENDERINGU

### Opcja A: Full PixiJS

```
Plansza (canvas)
  └─ Container: PlayerField AI
      └─ Container: BattleLine × 3
          └─ Sprite: CreatureCard × 4
  └─ Container: PlayerField Player
      └─ ...
  └─ ParticleEmitter: pogoda
  └─ Container: PlayerHand
      └─ Sprite: cards

UI overlay (DOM, position: absolute over canvas)
  └─ TopBar, ActionLog, Modals, PhaseControls
```

**Koszt:** 80-120h. Przepisanie CreatureCard (1800 LOC DOM → PixiJS Sprite layers), PlayerHand fan, BattleLine flex. Tooltip/modals zostają DOM.

### Opcja B: DOM + GSAP + tsParticles (REKOMENDOWANA)

```
DOM (bez zmian w strukturze)
  └─ GameBoard (flex layout — jak jest)
      └─ PlayerField × 2
          └─ BattleLine × 3
              └─ CreatureCard × 4
      └─ tsParticles canvas (weather, za kartami)
  └─ PlayerHand (flex fan)
  └─ Modals, TopBar, etc.

Animacje: GSAP (zamiast CSS @keyframes)
Particles: tsParticles (zamiast div-based)
Audio: Howler.js (zamiast Web Audio raw)
```

**Koszt:** 15-25h. Zamiana keyframes → GSAP, particles → tsParticles, audio → Howler. Zero zmian w DOM structure.

### Opcja C: Hybrid (PixiJS tło + DOM karty)

```
PixiJS canvas (background layer, z-index: 0)
  └─ Sprite: seasonal background
  └─ ParticleEmitter: weather
  └─ Shader: vignette, glow effects

DOM overlay (z-index: 1+)
  └─ GameBoard (flex layout)
      └─ CreatureCards (DOM, animowane GSAP)
  └─ UI (modals, bars, hand)
```

**Koszt:** 30-50h. PixiJS tylko dla tła/particles, karty i UI w DOM. Dobry kompromis jeśli potrzebujesz GPU particle effects.

---

## 10. PACZKI POD GRĘ ONLINE (MULTIPLAYER)

Jeśli planowany jest tryb online, dodatkowe paczki:

| Paczka | Cel | Uwagi |
|---|---|---|
| **Socket.IO** (`socket.io-client`) | Real-time komunikacja | Serwer: Node.js + socket.io |
| **Colyseus** | Game server framework | Autorytarny serwer, state sync |
| **Supabase** | Auth + DB + Realtime | Konta graczy, ranking, matchmaking |
| **PeerJS** | P2P (bez serwera) | Prostsze ale mniej niezawodne |

**Rekomendacja dla karciankę turowej:** **Colyseus** — specjalnie zaprojektowany pod gry turowe, autorytarny serwer (anti-cheat), state sync z interpolacją. GameEngine (pure TS) można uruchomić po stronie serwera bez zmian.

**Architektura online:**
```
Client (Nuxt)                    Server (Node.js + Colyseus)
  └─ gameStore.ts                  └─ GameEngine.ts (TEN SAM KOD)
      └─ socket.emit('action')  →      └─ processAction()
      └─ socket.on('state')    ←       └─ broadcastState()
```

Dzięki temu że GameEngine jest pure TS bez zależności Vue, **ten sam kod silnika** może działać na serwerze.

---

## 11. PERFORMANCE AUDIT — OBECNE PROBLEMY

### Animacje powodujące layout thrashing (DO NAPRAWIENIA)

| Plik | Keyframe | Problem | Fix |
|------|----------|---------|-----|
| `CreatureCard.vue:760` | `attack-charge` | `outline` / `outline-offset` zmiana | → `box-shadow` |
| `CreatureCard.vue:1101` | `shield-pulse` | `outline` / `outline-offset` | → `box-shadow` |
| `CreatureCard.vue:1134` | `shield-bg` | `background` zmiana | → `opacity` overlay |
| `CreatureCard.vue:1195` | `effect-pulse` | `outline` / `outline-offset` | → `box-shadow` |
| `CreatureCard.vue:1523` | `magic-ring-expand` | `width` / `height` / `margin` | → `transform: scale()` |
| `CreatureCard.vue:1553` | `arrow-fly` | `left` / `width` | → `transform: translateX()` |
| `CreatureCard.vue:1406` | `growth-flash` | `outline` / `outline-offset` | → `box-shadow` |
| `CreatureCard.vue:1416` | `resurrect-glow` | `outline` / `outline-offset` | → `box-shadow` |
| `GameBoard.vue:921` | `aura-pulse` | `outline` / `outline-offset` | → `box-shadow` |
| `app/app.vue:138` | `rune-glow` | `text-shadow` infinite | → `opacity` + stały shadow |

**Łącznie: 12 animacji do poprawy** — przy migracji na GSAP zostaną naturalnie naprawione (GSAP używa `transform`/`opacity` domyślnie).

---

## 12. PODSUMOWANIE REKOMENDACJI

1. **Opcja B (DOM + GSAP + tsParticles + Howler)** — najlepszy wybór
2. **Usuń `@vueuse/motion` i `@nuxtjs/tailwindcss`** z package.json
3. **Dodaj `ssr: false`** do nuxt.config.ts
4. **Kolejność:** GSAP → Howler → tsParticles → (opcjonalnie Electron)
5. **PixiJS odłóż** — nie jest potrzebny przy 24 kartach
6. **Online:** Colyseus + ten sam GameEngine na serwerze
7. **Napraw 12 layout-thrashing animacji** przy okazji migracji GSAP
