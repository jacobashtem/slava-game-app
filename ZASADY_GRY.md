# Sława Vol.2 — Zasady Gry (Gold Edition)

## Tryby gry
- **Gold Edition** (aktywny) — walka na Złocisze (ZŁ). Cel: wyeliminowanie wszystkich istot przeciwnika lub wyjście ze złota.
- **Tryb Sława** (planowany) — zdobywanie Sławy przez atakowanie niezabezpieczonych linii (bez istot).

---

## Struktura tury

Każda tura przebiega automatycznie przez fazy:

1. **START** — reset flag (ataki, ruchy), reset liczników tury *(automatyczne)*
2. **DRAW** — gracz dobiera 1 kartę z talii *(automatyczne)*
3. **PLAY** — gracz wystawia istoty i gra karty przygody
4. **COMBAT** — gracz atakuje istotami
5. **END** — zakończenie tury, przekazanie do przeciwnika

> START i DRAW są przetwarzane automatycznie. Gracz zawsze zaczyna turę w fazie PLAY.

---

## Zasoby

- **Złocisze (ZŁ)** — waluta do grania kart przygody. Koszt: 1 ZŁ za kartę.
- **Startowe złoto**: 5 ZŁ *(do ustalenia czy odnawia się co turę)*
- **Talia startowa**: 30 kart
- **Ręka startowa**: 5 kart
- **Dobieranie**: 1 karta na turę

---

## Karty

### Istoty
- **Wystawianie**: max 1 istota na turę (faza PLAY)
- **Linie walki**:
  - **L1 (Front/Wręcz)** — najbliżej centrum planszy
  - **L2 (Dystans)** — środkowa linia
  - **L3 (Wsparcie/Magia)** — najdalej od centrum
- **Pozycja**:
  - **Atak** (pionowo) — może atakować, nie kontratakuje
  - **Obrona** (poziomo) — nie atakuje aktywnie, kontratakuje
- **Typy ataku**:
  - **Wręcz** — tylko L1 (pierwsza zajęta linia wroga)
  - **Żywioł** — jak Wręcz + może bić latające
  - **Dystans** — dowolna linia
  - **Magia** — dowolna linia

### Karty Przygody (koszt: 1 ZŁ, max 1 na turę)
- **Zdarzenie** — efekt natychmiastowy, jednorazowy → na cmentarz
- **Artefakt** — trwały efekt; trzeba wybrać istotę na polu do wyposażenia (**wymagana istota na polu!**)
- **Lokacja** — pasywny efekt dla całego pola; wchodzi jako activeLocation (stara lokacja idzie na cmentarz)
  - Lokację można też wystawić jako istotę w linii (liczy się w limit 1 istoty na turę)

---

## Walka (faza COMBAT)

1. Wybierz własną istotę w pozycji Atak (która jeszcze nie atakowała)
2. Kliknij wrogą istotę (podświetleni legalni celowie)
3. Istota kontratakuje jeśli jest w pozycji Obrona
4. Martwe istoty idą na cmentarz

**Brak wrogów na polu** → przycisk "Zakończ turę" (bez fazy walki)

---

## Domeny
- **Perun** (złoty) — bogowie burzy i nieba
- **Żywi** (zielony) — duchy natury
- **Nieumarli** (fioletowy) — umarli i demony
- **Weles** (czerwony) — bóg podziemia

---

## Cmentarz
- Można przeglądać oba cmentarze klikając ikonę cmentarza w sidebarze

---

## Notatki / TODO
- [ ] Tryb Sława: atakowanie niezabezpieczonych linii → zdobywanie Sławy
- [ ] Złocisze: sprawdzić czy odnawia się co turę czy jest jednorazowe
- [ ] Limit kart w linii (MAX_FIELD_CREATURES = 5 łącznie?)
- [ ] Efekty istot (EffectRegistry) — większość niezaimplementowana
- [ ] Wzmocnione efekty przygód (enhancedEffectId)
