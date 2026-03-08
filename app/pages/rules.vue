<script setup lang="ts">
import { Icon } from '@iconify/vue'
</script>

<template>
  <div class="rules-page">
    <div class="rules-header">
      <NuxtLink to="/" class="back-link">
        <Icon icon="game-icons:return-arrow" /> Menu
      </NuxtLink>
      <h1>Jak grac?</h1>
    </div>

    <div class="rules-content">
      <!-- PRZEBIEG GRY -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:sword-clash" /> Przebieg gry</h2>
        <p>Gra toczy sie turami. Kazdy gracz wykonuje swoja ture, potem gra przeciwnik. Celem jest pokonanie wszystkich istot wroga lub wyczerpanie jego talii.</p>

        <h3>Fazy tury</h3>
        <ol>
          <li><strong>START</strong> — efekty poczatku tury, dobiór 1 karty</li>
          <li><strong>GRA</strong> — wystaw istote, zagraj karte przygody</li>
          <li><strong>WALKA</strong> — zmien pozycje istot, zaatakuj wroga</li>
          <li><strong>KONIEC</strong> — efekty konca tury, tura przechodzi do przeciwnika</li>
        </ol>
      </section>

      <!-- POLE BITWY -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:battle-gear" /> Pole bitwy</h2>
        <p>Pole bitwy sklada sie z 3 linii po kazdej stronie:</p>
        <div class="lines-grid">
          <div class="line-info">
            <span class="line-badge l1">L1</span>
            <div>
              <strong>Front</strong> — istoty Wrecz i Zywiol. Atakowane w pierwszej kolejnosci.
            </div>
          </div>
          <div class="line-info">
            <span class="line-badge l2">L2</span>
            <div>
              <strong>Dystans</strong> — istoty z atakiem Dystans. Chronione przez L1.
            </div>
          </div>
          <div class="line-info">
            <span class="line-badge l3">L3</span>
            <div>
              <strong>Wsparcie</strong> — istoty z atakiem Magia. Chronione przez L1 i L2.
            </div>
          </div>
        </div>
        <p>Maksymalnie <strong>5 istot</strong> na calym polu (wszystkie linie lacznie).</p>
      </section>

      <!-- POZYCJE -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:shield-reflect" /> Pozycje kart</h2>
        <div class="positions-grid">
          <div class="pos-info attack-pos">
            <span class="pos-badge">ATAK</span>
            <span>Karta obrocona poziomo. Moze atakowac, ale nie kontratakuje.</span>
          </div>
          <div class="pos-info defense-pos">
            <span class="pos-badge">OBRONA</span>
            <span>Karta pionowo. Nie atakuje, ale kontratakuje gdy zaatakowana.</span>
          </div>
        </div>
        <p>Zmiana pozycji jest darmowa i mozliwa raz na ture (w fazie WALKA).</p>
      </section>

      <!-- TYPY ATAKU -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:crossed-swords" /> Typy ataku</h2>
        <div class="attack-types">
          <div class="atk-type"><span class="atk-badge melee">Wrecz</span> Atakuje pierwsza zajeta linie wroga. Nie siega L2/L3 zza L1.</div>
          <div class="atk-type"><span class="atk-badge elem">Zywiol</span> Jak Wrecz, ale trafia latajace istoty.</div>
          <div class="atk-type"><span class="atk-badge ranged">Dystans</span> Atakuje dowolna linie wroga.</div>
          <div class="atk-type"><span class="atk-badge magic">Magia</span> Atakuje dowolna linie wroga.</div>
        </div>
      </section>

      <!-- KONTRATAK -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:shield-bash" /> Kontratak</h2>
        <p>Walka jest <strong>simultaniczna</strong>. Gdy atakujesz, obronca natychmiast kontratakuje (jesli jest w pozycji OBRONA) swoimi pelnymi statystykami <em>przed</em> otrzymaniem obrazen.</p>
        <p>Kontratak uzywa DEF obrażanego jako obrazenia — NIE jego ATK.</p>
        <p>Kontratak ma taki sam zasieg jak atak — istota Wrecz w L1 nie dosiegnie kontry z L2.</p>
      </section>

      <!-- KARTY PRZYGODY -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:spell-book" /> Karty przygody</h2>
        <p>Karty przygody to zaklecia, artefakty i lokacje.</p>
        <ul>
          <li><strong>Zdarzenie</strong> — jednorazowy efekt (np. obrazenia, leczenie)</li>
          <li><strong>Artefakt</strong> — przypiecie do istoty, trwaly bonus</li>
          <li><strong>Lokacja</strong> — pasywny efekt dla calego pola</li>
        </ul>
        <p>Efekt podstawowy jest <strong>darmowy</strong>. Efekt wzmocniony kosztuje <strong>1 ZL</strong> (Punkt Slawy).</p>
      </section>

      <!-- DOMENY -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:triquetra" /> Domeny</h2>
        <div class="domain-list">
          <div class="domain-item" style="--dc: #f5c542">
            <Icon icon="game-icons:lightning-storm" /> <strong>Perun</strong> — wojownicy bogów, pioruny
          </div>
          <div class="domain-item" style="--dc: #4caf50">
            <Icon icon="game-icons:oak-leaf" /> <strong>Zywi</strong> — ludzie, zwierzeta, natura
          </div>
          <div class="domain-item" style="--dc: #9c27b0">
            <Icon icon="game-icons:skull-crossed-bones" /> <strong>Nieumarli</strong> — upiory, duchy
          </div>
          <div class="domain-item" style="--dc: #c62828">
            <Icon icon="game-icons:fire-dash" /> <strong>Weles</strong> — demony, zaswiatowe bestie
          </div>
        </div>
      </section>

      <!-- ZLOTO -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:two-coins" /> Punkty Slawy (ZL)</h2>
        <p>Kazdy gracz zaczyna z <strong>5 ZL</strong>. Zloto mozna wydac na:</p>
        <ul>
          <li>Wzmocnione efekty kart przygody (1 ZL)</li>
          <li>Aktywowalne zdolnosci istot (koszt zalezy od karty)</li>
        </ul>
        <p>Niektóre karty zarabiaja ZL przy zabiciu, smierci itp.</p>
      </section>

      <!-- ZWYCIESTWO -->
      <section class="rule-section">
        <h2><Icon icon="game-icons:laurel-crown" /> Warunki zwyciestwa</h2>
        <ul>
          <li>Wrog traci wszystkie istoty z pola <strong>i</strong> nie ma wiecej w rece/talii</li>
          <li>Wrog nie moze dobrac karty bo talia jest pusta</li>
          <li>Wrog sie poddaje</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rules-page {
  min-height: 100vh;
  background: var(--bg-board);
  color: #e2e8f0;
  padding: 24px;
}

.rules-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  max-width: 680px;
  margin-inline: auto;
}

.rules-header h1 {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  letter-spacing: 0.05em;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a78bfa;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.25);
  transition: background 0.15s;
}
.back-link:hover { background: rgba(139, 92, 246, 0.2); }

.rules-content {
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.rule-section {
  background: rgba(255,255,255,0.03);
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 20px;
}

.rule-section h2 {
  font-size: 17px;
  font-weight: 700;
  color: #a5b4fc;
  margin: 0 0 10px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  margin: 12px 0 6px 0;
}

.rule-section p {
  font-size: 13px;
  line-height: 1.6;
  color: #cbd5e1;
  margin: 6px 0;
}

.rule-section ul, .rule-section ol {
  font-size: 13px;
  line-height: 1.6;
  color: #cbd5e1;
  padding-left: 20px;
  margin: 6px 0;
}

.rule-section li { margin-bottom: 4px; }

/* Lines grid */
.lines-grid { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.line-info { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: #cbd5e1; }
.line-badge { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 24px; border-radius: 4px; font-size: 11px; font-weight: 800; flex-shrink: 0; }
.line-badge.l1 { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
.line-badge.l2 { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
.line-badge.l3 { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }

/* Positions */
.positions-grid { display: flex; gap: 12px; margin: 10px 0; }
.pos-info { flex: 1; padding: 10px; border-radius: 6px; font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px; }
.attack-pos { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); }
.defense-pos { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); }
.pos-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }

/* Attack types */
.attack-types { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
.atk-type { font-size: 13px; color: #cbd5e1; display: flex; align-items: center; gap: 8px; }
.atk-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; flex-shrink: 0; min-width: 60px; text-align: center; }
.atk-badge.melee { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.atk-badge.elem { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
.atk-badge.ranged { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.atk-badge.magic { background: rgba(168, 85, 247, 0.15); color: #c084fc; }

/* Domain list */
.domain-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.domain-item { font-size: 13px; color: var(--dc, #cbd5e1); display: flex; align-items: center; gap: 8px; }
</style>
