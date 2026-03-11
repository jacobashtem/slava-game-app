<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

const activeSection = ref<string | null>(null)
function toggle(id: string) {
  activeSection.value = activeSection.value === id ? null : id
}
</script>

<template>
  <div class="rules-page">
    <!-- Header -->
    <div class="rules-header">
      <NuxtLink to="/" class="back-link">
        <Icon icon="game-icons:return-arrow" /> Menu
      </NuxtLink>
      <div class="header-title">
        <Icon icon="game-icons:book-cover" class="header-icon" />
        <h1>Jak grać w Sławę?</h1>
      </div>
    </div>

    <!-- Quick TOC -->
    <nav class="toc">
      <a href="#overview" class="toc-link">Przegląd</a>
      <a href="#turns" class="toc-link">Tury</a>
      <a href="#battlefield" class="toc-link">Pole bitwy</a>
      <a href="#positions" class="toc-link">Pozycje</a>
      <a href="#attacks" class="toc-link">Ataki</a>
      <a href="#counter" class="toc-link">Kontratak</a>
      <a href="#adventure" class="toc-link">Przygody</a>
      <a href="#domains" class="toc-link">Domeny</a>
      <a href="#gold" class="toc-link">Punkty Sławy</a>
      <a href="#abilities" class="toc-link">Zdolności</a>
      <a href="#seasons" class="toc-link">Pory roku</a>
      <a href="#victory" class="toc-link">Zwycięstwo</a>
      <a href="#glossary" class="toc-link">Słownik</a>
    </nav>

    <div class="rules-content">
      <!-- OVERVIEW -->
      <section id="overview" class="rule-section">
        <h2><Icon icon="game-icons:scroll-unfurled" /> Przegląd gry</h2>
        <p><strong>Sława Vol. 2</strong> to strategiczna gra karciana osadzona w słowiańskiej mitologii. Grasz jako wódz jednej z czterech domen — Peruna, Żywych, Nieumarłych lub Welesa — i dowodzisz armiami nadprzyrodzonych istot w turowej walce przeciw AI.</p>

        <div class="highlight-box">
          <Icon icon="game-icons:info" class="hb-icon" />
          <div>
            <strong>Cel gry:</strong> Zniszcz wszystkie istoty wroga i wyczerpaj jego zasoby.
            Każdy gracz zaczyna z <strong>talią 30 kart</strong>, <strong>5 kartami na ręce</strong> i <strong>5 PS</strong> (Punktów Sławy).
          </div>
        </div>
      </section>

      <!-- TURNS -->
      <section id="turns" class="rule-section">
        <h2><Icon icon="game-icons:sword-clash" /> Przebieg tury</h2>
        <p>Gra toczy się turami. Ty i AI gracie naprzemiennie. Każda tura składa się z 4 faz:</p>

        <div class="phase-list">
          <div class="phase-item">
            <div class="phase-badge phase-start">1</div>
            <div class="phase-info">
              <strong>START</strong>
              <span>Efekty początku tury aktywują się automatycznie. Dobierasz 1 kartę z talii.</span>
            </div>
          </div>
          <div class="phase-item">
            <div class="phase-badge phase-play">2</div>
            <div class="phase-info">
              <strong>GRA</strong>
              <span>Wystaw jedną istotę z ręki na pole bitwy. Możesz też zagrać kartę przygody.</span>
            </div>
          </div>
          <div class="phase-item">
            <div class="phase-badge phase-combat">3</div>
            <div class="phase-info">
              <strong>WALKA</strong>
              <span>Zmień pozycje istot (atak/obrona). Zaatakuj wrogą istotę.</span>
            </div>
          </div>
          <div class="phase-item">
            <div class="phase-badge phase-end">4</div>
            <div class="phase-info">
              <strong>KONIEC</strong>
              <span>Efekty końca tury aktywują się. Tura przechodzi do przeciwnika.</span>
            </div>
          </div>
        </div>

        <div class="example-box">
          <div class="example-label"><Icon icon="game-icons:scroll-quill" /> Przykład</div>
          <p>Faza START → dobierasz kartę „Strzyga" (domena Nieumarłych). Faza GRA → wystawiasz Strzygę na linię L1 (Front). Faza WALKA → przestawiasz ją w pozycję ATAK i atakujesz wrogą istotę na L1. Faza KONIEC → tura przechodzi do AI.</p>
        </div>
      </section>

      <!-- BATTLEFIELD -->
      <section id="battlefield" class="rule-section">
        <h2><Icon icon="game-icons:battle-gear" /> Pole bitwy</h2>
        <p>Każdy gracz ma 3 linie bojowe. Istoty wystawiasz na odpowiednią linię w zależności od ich typu ataku:</p>

        <div class="lines-visual">
          <div class="line-row">
            <div class="line-tag l1">L1 FRONT</div>
            <div class="line-desc">
              <strong>Wręcz</strong> i <strong>Żywioł</strong> — pierwsza linia, atakowana jako pierwsza. Maks. 5 istot na CAŁYM polu (nie per linia).
            </div>
          </div>
          <div class="line-row">
            <div class="line-tag l2">L2 DYSTANS</div>
            <div class="line-desc">
              <strong>Dystans</strong> — chronione przez L1. Wrogi wręcz nie sięgnie tutaj jeśli L1 jest zajęta.
            </div>
          </div>
          <div class="line-row">
            <div class="line-tag l3">L3 WSPARCIE</div>
            <div class="line-desc">
              <strong>Magia</strong> — najdalsza linia. Chroniona przez L1 i L2.
            </div>
          </div>
        </div>

        <div class="example-box">
          <div class="example-label"><Icon icon="game-icons:scroll-quill" /> Przykład</div>
          <p>Masz Wojownika (Wręcz) na L1 i Wiedźmę (Magia) na L3. Wróg z atakiem Wręcz może zaatakować TYLKO Wojownika — Wiedźma jest chroniona. Ale wróg z atakiem Magia lub Dystans może celować w dowolną linię, w tym Wiedźmę!</p>
        </div>
      </section>

      <!-- POSITIONS -->
      <section id="positions" class="rule-section">
        <h2><Icon icon="game-icons:shield-reflect" /> Pozycje kart</h2>
        <p>Każda istota na polu może być w jednej z dwóch pozycji:</p>

        <div class="positions-visual">
          <div class="pos-card pos-attack">
            <div class="pos-icon">
              <Icon icon="game-icons:broadsword" />
            </div>
            <div>
              <strong>ATAK</strong> (karta obrócona poziomo)
              <ul>
                <li>Może aktywnie atakować wrogą istotę</li>
                <li><strong>NIE</strong> kontratakuje gdy zaatakowana</li>
              </ul>
            </div>
          </div>
          <div class="pos-card pos-defense">
            <div class="pos-icon">
              <Icon icon="game-icons:shield-echoes" />
            </div>
            <div>
              <strong>OBRONA</strong> (karta pionowo)
              <ul>
                <li>Nie może aktywnie atakować</li>
                <li><strong>Kontratakuje</strong> automatycznie gdy zaatakowana</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="highlight-box">
          <Icon icon="game-icons:info" class="hb-icon" />
          <div>Zmiana pozycji jest darmowa. Istota, która zmieniła pozycję w tej turze, traci możliwość atakowania w tej turze. Nowo wystawione istoty zawsze zaczynają w pozycji <strong>OBRONA</strong>.</div>
        </div>
      </section>

      <!-- ATTACK TYPES -->
      <section id="attacks" class="rule-section">
        <h2><Icon icon="game-icons:crossed-swords" /> Typy ataku</h2>
        <p>Każda istota ma jeden z czterech typów ataku, który określa jej zasięg:</p>

        <div class="atk-grid">
          <div class="atk-card atk-melee">
            <Icon icon="game-icons:broadsword" class="atk-icon" />
            <strong>Wręcz</strong>
            <span>Atakuje pierwszą zajętą linię wroga. Nie przebija się przez L1.</span>
          </div>
          <div class="atk-card atk-elem">
            <Icon icon="game-icons:fire-dash" class="atk-icon" />
            <strong>Żywioł</strong>
            <span>Jak Wręcz, ale trafia też latające istoty. Ogniste/lodowe efekty.</span>
          </div>
          <div class="atk-card atk-ranged">
            <Icon icon="game-icons:arrow-flights" class="atk-icon" />
            <strong>Dystans</strong>
            <span>Atakuje dowolną linię wroga — ignoruje frontową ochronę.</span>
          </div>
          <div class="atk-card atk-magic">
            <Icon icon="game-icons:magic-swirl" class="atk-icon" />
            <strong>Magia</strong>
            <span>Atakuje dowolną linię wroga. Potężne efekty specjalne.</span>
          </div>
        </div>

        <div class="example-box">
          <div class="example-label"><Icon icon="game-icons:scroll-quill" /> Przykład</div>
          <p>Twój Łucznik (Dystans) na L2 może zaatakować wrogą Wiedźmę na L3 — pomimo że wróg ma istoty na L1. Ale Twój Wojownik (Wręcz) na L1 nie może celować w L2/L3 wroga jeśli L1 wroga jest zajęta.</p>
        </div>
      </section>

      <!-- COUNTERATTACK -->
      <section id="counter" class="rule-section">
        <h2><Icon icon="game-icons:shield-bash" /> Kontratak</h2>
        <p>Walka w Sławie jest <strong>simultaniczna</strong>. Gdy atakujesz istotę w pozycji OBRONA, ona natychmiast kontratakuje.</p>

        <div class="combat-flow">
          <div class="flow-step">
            <div class="flow-num">1</div>
            <span>Twoja istota zadaje obrażenia = swój <strong>ATK</strong></span>
          </div>
          <div class="flow-arrow"><Icon icon="mdi:arrow-down" /></div>
          <div class="flow-step">
            <div class="flow-num">2</div>
            <span>Obrońca kontratakuje swoim <strong>ATK</strong> (jeśli w pozycji OBRONA)</span>
          </div>
          <div class="flow-arrow"><Icon icon="mdi:arrow-down" /></div>
          <div class="flow-step">
            <div class="flow-num">3</div>
            <span>Obrażenia odejmowane od <strong>DEF</strong>. DEF ≤ 0 = śmierć</span>
          </div>
        </div>

        <div class="highlight-box warning-box">
          <Icon icon="game-icons:shield-bash" class="hb-icon" />
          <div>
            <strong>Ważne:</strong> Kontratak działa tylko jeśli obrońca jest w pozycji OBRONA i jest w zasięgu. Istota Wręcz na L1 wroga kontratakuje, ale jeśli Twoja istota atakuje z L2 — kontratak Wręcz nie dosięgnie!
          </div>
        </div>

        <div class="example-box">
          <div class="example-label"><Icon icon="game-icons:scroll-quill" /> Przykład</div>
          <p>Twój Berserk (ATK 5, Wręcz) atakuje wrogi Golem (ATK 3, DEF 8, pozycja OBRONA). Golem traci 5 DEF → zostaje mu 3. Golem kontratakuje za 3 → Twój Berserk traci 3 DEF. Obaj przeżyli, ale obaj osłabieni!</p>
        </div>
      </section>

      <!-- ADVENTURE CARDS -->
      <section id="adventure" class="rule-section">
        <h2><Icon icon="game-icons:spell-book" /> Karty przygody</h2>
        <p>Oprócz istot, Twoja talia zawiera karty przygody — potężne efekty jednorazowe i trwałe.</p>

        <div class="adventure-types">
          <div class="adv-type" style="--adv-color: #60a5fa">
            <Icon icon="game-icons:lightning-storm" class="adv-icon" />
            <div>
              <strong>Zdarzenie</strong>
              <span>Jednorazowy efekt — obrażenia, leczenie, manipulacja. Znika po użyciu.</span>
            </div>
          </div>
          <div class="adv-type" style="--adv-color: #fbbf24">
            <Icon icon="game-icons:gem-pendant" class="adv-icon" />
            <div>
              <strong>Artefakt</strong>
              <span>Przypinajesz do istoty na polu. Daje trwały bonus (np. +2 ATK, regeneracja).</span>
            </div>
          </div>
          <div class="adv-type" style="--adv-color: #34d399">
            <Icon icon="game-icons:castle" class="adv-icon" />
            <div>
              <strong>Lokacja</strong>
              <span>Pasywny efekt globalny — wpływa na całe pole bitwy przez określoną liczbę rund.</span>
            </div>
          </div>
        </div>

        <div class="highlight-box gold-box">
          <Icon icon="game-icons:two-coins" class="hb-icon" />
          <div>
            Każda karta przygody ma <strong>efekt podstawowy</strong> (darmowy) i <strong>efekt wzmocniony</strong> (kosztuje <strong>1 PS</strong>). Efekt wzmocniony jest zawsze silniejszy. Aby go użyć, kliknij ikonę monet przed zagraniem karty.
          </div>
        </div>
      </section>

      <!-- DOMAINS -->
      <section id="domains" class="rule-section">
        <h2><Icon icon="game-icons:triquetra" /> Domeny</h2>
        <p>Każda istota należy do jednej z 4 domen. Możesz wybrać domenę przed grą, by skierować talię w konkretną strategię:</p>

        <div class="domain-cards">
          <div class="domain-card" style="--dc: #f5c542">
            <Icon icon="game-icons:lightning-storm" class="dc-icon" />
            <strong>Perun</strong>
            <span>Wojownicy bogów i bohaterowie. Silne istoty z wysokim ATK. Bezpośrednia walka i pioruny.</span>
          </div>
          <div class="domain-card" style="--dc: #4caf50">
            <Icon icon="game-icons:oak-leaf" class="dc-icon" />
            <strong>Żywi</strong>
            <span>Ludzie, zwierzęta i natura. Zbalansowane — leczenie, buffy sojuszników, kontrola pola.</span>
          </div>
          <div class="domain-card" style="--dc: #9c27b0">
            <Icon icon="game-icons:skull-crossed-bones" class="dc-icon" />
            <strong>Nieumarli</strong>
            <span>Upiory i duchy. Draining life, wskrzeszanie, osłabianie wroga. Kontrola przez atrycję.</span>
          </div>
          <div class="domain-card" style="--dc: #c62828">
            <Icon icon="game-icons:fire-dash" class="dc-icon" />
            <strong>Weles</strong>
            <span>Demony i bestie zaświatów. Destrukcja, chaos, AOE obrażenia. Ryzykowne, ale potężne.</span>
          </div>
        </div>
      </section>

      <!-- GOLD -->
      <section id="gold" class="rule-section">
        <h2><Icon icon="game-icons:two-coins" /> Punkty Sławy (PS)</h2>
        <p>Punkty Sławy to kluczowy zasób. Zaczynasz z <strong>5 PS</strong> i możesz wydać je na:</p>
        <ul>
          <li><strong>Wzmocnione efekty przygód</strong> — 1 PS za silniejszy efekt karty</li>
          <li><strong>Aktywowalne zdolności istot</strong> — koszt zależy od karty (0–3 PS)</li>
        </ul>

        <div class="example-box">
          <div class="example-label"><Icon icon="game-icons:scroll-quill" /> Przykład</div>
          <p>Masz kartę „Magiczny Kamień" (Artefakt). Efekt podstawowy: +1 ATK. Efekt wzmocniony (1 PS): +2 ATK i +1 DEF. Jeśli masz PS i silną istotę — warto dopłacić!</p>
        </div>

        <p>PS możesz zdobywać dzięki efektom kart — np. „Chowaniec" daje PS za każdym razem gdy pomaga w walce. Zarządzaj Punktami Sławy mądrze — to klucz do zwycięstwa w późnej grze!</p>
      </section>

      <!-- ABILITIES -->
      <section id="abilities" class="rule-section">
        <h2><Icon icon="game-icons:magic-swirl" /> Zdolności istot</h2>
        <p>Wiele istot ma unikalne zdolności. Rozpoznasz je po kolorowych etykietach:</p>

        <div class="ability-tags">
          <div class="ability-tag" style="--tag-c: #22c55e"><strong>WEJŚCIE</strong> — aktywuje się gdy istota wchodzi na pole</div>
          <div class="ability-tag" style="--tag-c: #a855f7"><strong>AKCJA ⚡</strong> — gracz może ręcznie aktywować (kliknij błyskawicę)</div>
          <div class="ability-tag" style="--tag-c: #3b82f6"><strong>AURA</strong> — pasywny efekt co turę (start lub koniec tury)</div>
          <div class="ability-tag" style="--tag-c: #f97316"><strong>ODWET</strong> — aktywuje się gdy istota otrzymuje obrażenia</div>
          <div class="ability-tag" style="--tag-c: #ef4444"><strong>NATARCIE</strong> — aktywuje się gdy istota zadaje obrażenia</div>
          <div class="ability-tag" style="--tag-c: #ef4444"><strong>ZABÓJSTWO</strong> — aktywuje się gdy istota zabije wroga</div>
          <div class="ability-tag" style="--tag-c: #64748b"><strong>CZUJNOŚĆ</strong> — reaguje na zdarzenia na polu (śmierć, zagranie karty)</div>
        </div>

        <div class="highlight-box">
          <Icon icon="game-icons:info" class="hb-icon" />
          <div>Zdolności AKCJA ⚡ wymagają kliknięcia ikony błyskawicy na karcie. Niektóre kosztują PS i mają cooldown (raz na turę / raz na rundę).</div>
        </div>
      </section>

      <!-- SEASONS -->
      <section id="seasons" class="rule-section">
        <h2><Icon icon="game-icons:sun" /> Pory roku</h2>
        <p>Gra dzieli się na pory roku — co 3 rundy zmienia się sezon:</p>

        <div class="seasons-grid">
          <div class="season-card spring"><Icon icon="game-icons:daisy" /> Wiosna <span>Rundy 1–3</span></div>
          <div class="season-card summer"><Icon icon="game-icons:sun" /> Lato <span>Rundy 4–6</span></div>
          <div class="season-card autumn"><Icon icon="game-icons:falling-leaf" /> Jesień <span>Rundy 7–9</span></div>
          <div class="season-card winter"><Icon icon="game-icons:snowflake-1" /> Zima <span>Runda 10+</span></div>
        </div>

        <p>Niektóre efekty kart zależą od pory roku — sprawdzaj opisy zdolności!</p>
      </section>

      <!-- VICTORY -->
      <section id="victory" class="rule-section">
        <h2><Icon icon="game-icons:laurel-crown" /> Warunki zwycięstwa</h2>
        <p>Wygrywasz gdy wystąpi dowolny z poniższych warunków:</p>
        <div class="victory-conditions">
          <div class="vc-item">
            <Icon icon="game-icons:skull-crossed-bones" class="vc-icon" />
            <span>Wróg nie ma istot na polu ANI w ręce/talii</span>
          </div>
          <div class="vc-item">
            <Icon icon="game-icons:card-burn" class="vc-icon" />
            <span>Wróg nie może dobrać karty — talia pusta</span>
          </div>
          <div class="vc-item">
            <Icon icon="game-icons:white-flag" class="vc-icon" />
            <span>Wróg się poddaje</span>
          </div>
        </div>
      </section>

      <!-- GLOSSARY -->
      <section id="glossary" class="rule-section">
        <h2><Icon icon="game-icons:book-cover" /> Słownik pojęć</h2>
        <div class="glossary">
          <div class="gl-item"><strong>ATK</strong> <span>Atak — obrażenia zadawane przez istotę</span></div>
          <div class="gl-item"><strong>DEF</strong> <span>Obrona — punkty życia istoty</span></div>
          <div class="gl-item"><strong>PS</strong> <span>Punkty Sławy — waluta gry</span></div>
          <div class="gl-item"><strong>Latający</strong> <span>Istota latająca — ignoruje ataki Wręcz (ale nie Żywioł, Dystans, Magia)</span></div>
          <div class="gl-item"><strong>Ukryty</strong> <span>Karta zakryta — nie widzisz jej statystyk do momentu ataku</span></div>
          <div class="gl-item"><strong>Wzmocniony</strong> <span>Silniejsza wersja efektu karty przygody (koszt: 1 PS)</span></div>
          <div class="gl-item"><strong>Runda</strong> <span>1 tura Twoja + 1 tura AI = 1 runda</span></div>
          <div class="gl-item"><strong>Kontratak</strong> <span>Automatyczna odpowiedź istoty w OBRONIE na atak</span></div>
          <div class="gl-item"><strong>AOE</strong> <span>Area of Effect — obrażenia trafiające wiele celów</span></div>
          <div class="gl-item"><strong>Buff / Debuff</strong> <span>Tymczasowe wzmocnienie / osłabienie statystyk</span></div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rules-page {
  min-height: 100vh;
  background: #070b14;
  color: #e2e8f0;
  padding: 24px;
}

/* ===== HEADER ===== */
.rules-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  max-width: 720px;
  margin-inline: auto;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon { font-size: 24px; color: #c8a84e; }

.rules-header h1 {
  font-family: var(--font-display, Georgia, serif);
  font-size: 25px;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.04em;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a78bfa;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  transition: background 0.15s;
  flex-shrink: 0;
}
.back-link:hover { background: rgba(139, 92, 246, 0.18); }

/* ===== TOC ===== */
.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 720px;
  margin: 0 auto 20px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.toc-link {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-decoration: none;
  padding: 3px 8px;
  border-radius: 4px;
  transition: color 0.12s, background-color 0.12s;
}
.toc-link:hover { color: #a5b4fc; background: rgba(99, 102, 241, 0.1); }

/* ===== CONTENT ===== */
.rules-content {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 60px;
}

.rule-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 20px 22px;
}

.rule-section h2 {
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 500;
  color: #c8a84e;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-section p {
  font-size: 13px;
  line-height: 1.7;
  color: #cbd5e1;
  margin: 8px 0;
}

.rule-section ul, .rule-section ol {
  font-size: 13px;
  line-height: 1.7;
  color: #cbd5e1;
  padding-left: 20px;
  margin: 8px 0;
}

.rule-section li { margin-bottom: 4px; }

/* ===== HIGHLIGHT BOX ===== */
.highlight-box {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.15);
  margin: 12px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #cbd5e1;
}

.hb-icon { font-size: 18px; color: #a5b4fc; flex-shrink: 0; margin-top: 1px; }

.warning-box {
  background: rgba(245, 158, 11, 0.06);
  border-color: rgba(245, 158, 11, 0.15);
}
.warning-box .hb-icon { color: #fbbf24; }

.gold-box {
  background: rgba(200, 168, 78, 0.06);
  border-color: rgba(200, 168, 78, 0.15);
}
.gold-box .hb-icon { color: #c8a84e; }

/* ===== EXAMPLE BOX ===== */
.example-box {
  background: rgba(52, 211, 153, 0.04);
  border: 1px solid rgba(52, 211, 153, 0.12);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 12px 0;
}

.example-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 800;
  color: #34d399;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}

.example-box p {
  font-size: 12px !important;
  color: #94a3b8 !important;
  margin: 0 !important;
  font-style: italic;
  line-height: 1.6;
}

/* ===== PHASES ===== */
.phase-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.phase-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.phase-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 900;
  flex-shrink: 0;
}

.phase-start  { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
.phase-play   { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
.phase-combat { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
.phase-end    { background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); }

.phase-info { font-size: 13px; color: #cbd5e1; line-height: 1.5; }
.phase-info strong { display: block; font-size: 12px; letter-spacing: 0.06em; }

/* ===== LINES VISUAL ===== */
.lines-visual {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}

.line-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.line-tag {
  font-size: 10px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 5px;
  min-width: 90px;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: 0.04em;
}

.line-tag.l1 { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
.line-tag.l2 { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
.line-tag.l3 { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.2); }

.line-desc { font-size: 12px; color: #94a3b8; line-height: 1.5; padding-top: 2px; }

/* ===== POSITIONS VISUAL ===== */
.positions-visual { display: flex; gap: 10px; margin: 12px 0; }

.pos-card {
  flex: 1;
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.5;
}

.pos-card ul { margin: 4px 0 0; padding-left: 16px; font-size: 11px; }
.pos-card li { margin-bottom: 2px; }

.pos-attack {
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
}

.pos-defense {
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.pos-icon { font-size: 24px; flex-shrink: 0; }
.pos-attack .pos-icon { color: #f87171; }
.pos-defense .pos-icon { color: #60a5fa; }

/* ===== ATTACK TYPES GRID ===== */
.atk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }

.atk-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px;
  border-radius: 8px;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  line-height: 1.4;
}

.atk-icon { font-size: 24px; }

.atk-melee { background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.12); }
.atk-melee .atk-icon { color: #f87171; }
.atk-elem { background: rgba(251, 191, 36, 0.06); border: 1px solid rgba(251, 191, 36, 0.12); }
.atk-elem .atk-icon { color: #fbbf24; }
.atk-ranged { background: rgba(59, 130, 246, 0.06); border: 1px solid rgba(59, 130, 246, 0.12); }
.atk-ranged .atk-icon { color: #60a5fa; }
.atk-magic { background: rgba(168, 85, 247, 0.06); border: 1px solid rgba(168, 85, 247, 0.12); }
.atk-magic .atk-icon { color: #c084fc; }

/* ===== COMBAT FLOW ===== */
.combat-flow { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 12px 0; }

.flow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  width: 100%;
  font-size: 12px;
  color: #cbd5e1;
}

.flow-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.15);
  color: #a5b4fc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.flow-arrow { color: #475569; font-size: 16px; }

/* ===== ADVENTURE TYPES ===== */
.adventure-types { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }

.adv-type {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--adv-color) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--adv-color) 15%, transparent);
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.5;
}

.adv-icon { font-size: 20px; color: var(--adv-color); flex-shrink: 0; margin-top: 1px; }

/* ===== DOMAINS ===== */
.domain-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }

.domain-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dc) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--dc) 15%, transparent);
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  line-height: 1.4;
}

.dc-icon { font-size: 26px; color: var(--dc); }
.domain-card strong { color: var(--dc); font-size: 13px; }

/* ===== ABILITY TAGS ===== */
.ability-tags { display: flex; flex-direction: column; gap: 5px; margin: 12px 0; }

.ability-tag {
  font-size: 12px;
  color: #cbd5e1;
  padding: 6px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tag-c) 5%, transparent);
  border-left: 3px solid var(--tag-c);
  line-height: 1.4;
}

.ability-tag strong { color: var(--tag-c); font-size: 11px; letter-spacing: 0.03em; }

/* ===== SEASONS ===== */
.seasons-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0; }

.season-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.season-card span { font-size: 9px; font-weight: 400; opacity: 0.6; }

.spring { background: rgba(34, 197, 94, 0.08); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.15); }
.summer { background: rgba(251, 191, 36, 0.08); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.15); }
.autumn { background: rgba(251, 146, 60, 0.08); color: #fb923c; border: 1px solid rgba(251, 146, 60, 0.15); }
.winter { background: rgba(147, 197, 253, 0.08); color: #93c5fd; border: 1px solid rgba(147, 197, 253, 0.15); }

/* ===== VICTORY CONDITIONS ===== */
.victory-conditions { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }

.vc-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #cbd5e1;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(200, 168, 78, 0.04);
  border: 1px solid rgba(200, 168, 78, 0.1);
}

.vc-icon { font-size: 18px; color: #c8a84e; flex-shrink: 0; }

/* ===== GLOSSARY ===== */
.glossary { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }

.gl-item {
  display: flex;
  gap: 10px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.02);
}

.gl-item strong {
  color: #a5b4fc;
  min-width: 80px;
  flex-shrink: 0;
  font-size: 11px;
}

.gl-item span { color: #94a3b8; }

/* ===== MOBILE ===== */
@media (max-width: 600px) {
  .rules-page { padding: 16px; }
  .toc { gap: 2px; }
  .toc-link { font-size: 10px; padding: 2px 5px; }
  .positions-visual { flex-direction: column; }
  .atk-grid { grid-template-columns: 1fr; }
  .domain-cards { grid-template-columns: 1fr; }
  .seasons-grid { grid-template-columns: 1fr 1fr; }
  .rule-section { padding: 14px 16px; }
}
</style>
