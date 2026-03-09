<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

const expanded = ref(false)
const selectedGod = ref<number | null>(null)
const selectedEnhanced = ref(false)
const bidAmount = ref(1)

const gods = computed(() => game.slavaData?.gods ?? [])
const playerGlory = computed(() => game.playerGlory)
const availableCount = computed(() => gods.value.filter(g => !g.usedThisCycle).length)

const holiday = computed(() => {
  const slava = game.slavaData
  if (!slava?.holiday) return null
  return {
    name: slava.holiday.name,
    reward: slava.holiday.reward,
    playerDone: slava.holiday.completed.player1,
    aiDone: slava.holiday.completed.player2,
  }
})

const seasonInfo = computed(() => {
  const slava = game.slavaData
  if (!slava) return null
  const seasonNames = ['Zima', 'Wiosna', 'Lato', 'Jesień']
  return {
    name: seasonNames[slava.currentSeason] ?? 'Zima',
    round: slava.seasonRound,
  }
})

// Unique icon + accent color + portrait per god
const godMeta: Record<number, { icon: string; accent: string; domain: string; image: string }> = {
  1: { icon: 'game-icons:death-skull', accent: '#a78bfa', domain: 'Weles', image: '/images/gods/weles.svg' },
  2: { icon: 'game-icons:fire-ray', accent: '#f97316', domain: 'Swarożyc', image: '/images/gods/swarozyc.svg' },
  3: { icon: 'game-icons:frozen-body', accent: '#67e8f9', domain: 'Marzanna', image: '/images/gods/marzanna.svg' },
  4: { icon: 'game-icons:sun-radiations', accent: '#fbbf24', domain: 'Jaryło', image: '/images/gods/jarylo.svg' },
  5: { icon: 'game-icons:wheat', accent: '#86efac', domain: 'Mokosz', image: '/images/gods/mokosz.svg' },
  6: { icon: 'game-icons:lightning-storm', accent: '#60a5fa', domain: 'Perun', image: '/images/gods/perun.svg' },
  7: { icon: 'game-icons:anvil-impact', accent: '#fb923c', domain: 'Swaróg', image: '/images/gods/swarog.svg' },
  8: { icon: 'game-icons:family-tree', accent: '#e2e8f0', domain: 'Rod', image: '/images/gods/rod.svg' },
}

const godDescriptions: Record<number, { base: string; enhanced: string }> = {
  1: { base: 'Wskrzesza twoją istotę z cmentarza', enhanced: 'Wskrzesza istotę RYWALA — walczy po twojej stronie' },
  2: { base: '15 obrażeń rozdzielonych na wrogów', enhanced: 'Niszczy istotę Welesa' },
  3: { base: 'Perunowcy wroga muszą być w Obronie', enhanced: 'Niszczy istotę Peruna' },
  4: { base: 'Leczy wszystkich sojuszników do pełna', enhanced: 'Leczy + darmowy atak każdego wyleczonego' },
  5: { base: 'Dobierz 3 karty + darmowe wystawienie', enhanced: 'Niszczy premie i artefakty wroga' },
  6: { base: '10 obrażeń istoty Welesa (ignoruje odporności)', enhanced: 'Niszczy dowolną istotę na stole' },
  7: { base: 'Odtwarza kartę przygody z cmentarza', enhanced: 'Kopiuje aktywną kartę przygody' },
  8: { base: 'Zamienia premie dwóch sojuszników', enhanced: 'Daje sojusznikowi +3 ATK' },
}

// Holiday descriptions per season name
const holidayDescriptions: Record<string, string> = {
  'Szczodre Gody': 'Suma OBR twoich istot na polu ≥ 20',
  'Jare Gody': 'Miej istoty z 4 różnych domen na polu',
  'Święto Kupały': 'Zadaj ≥ 15 obrażeń w jednej turze',
  'Dziady': 'Miej ≥ 3 istoty więcej niż wróg na polu',
}

function selectGod(godId: number, enhanced: boolean) {
  selectedGod.value = godId
  selectedEnhanced.value = enhanced
  bidAmount.value = 1
}

function invokeGod() {
  if (selectedGod.value === null) return
  game.invokeGod(selectedGod.value, selectedEnhanced.value, bidAmount.value)
  selectedGod.value = null
  expanded.value = false
}

function cancel() {
  selectedGod.value = null
}
</script>

<template>
  <div class="panteon-wrapper" v-if="game.gameMode === 'slava'">
    <button class="panteon-toggle" @click="expanded = !expanded">
      <Icon icon="game-icons:temple-gate" class="pt-icon" />
      <span>Bogowie</span>
      <span class="pt-count" v-if="availableCount > 0">{{ availableCount }}</span>
    </button>

    <Transition name="panteon-slide">
      <div v-if="expanded" class="panteon-panel">
        <!-- Header with runic ornament -->
        <div class="panteon-header">
          <div class="ph-ornament-left" />
          <Icon icon="game-icons:triple-corn" class="ph-icon" />
          <span class="ph-title">PANTEON</span>
          <span class="ph-sub" v-if="seasonInfo">{{ seasonInfo.name }} · Runda {{ seasonInfo.round }}/4</span>
          <Icon icon="game-icons:triple-corn" class="ph-icon" />
          <div class="ph-ornament-right" />
        </div>

        <!-- Holiday / Mission tile -->
        <div v-if="holiday" :class="['mission-tile', { 'mission-done': holiday.playerDone }]">
          <div class="mission-header">
            <Icon :icon="holiday.playerDone ? 'game-icons:check-mark' : 'game-icons:party-popper'" class="mission-icon" />
            <span class="mission-label">ŚWIĘTO</span>
            <span class="mission-reward" v-if="!holiday.playerDone">+{{ holiday.reward }} PS</span>
            <span class="mission-completed" v-else>UKOŃCZONE</span>
          </div>
          <div class="mission-name">{{ holiday.name }}</div>
          <div class="mission-desc">{{ holidayDescriptions[holiday.name] ?? '' }}</div>
          <div class="mission-progress-track">
            <div class="mission-progress-fill" :style="{ width: holiday.playerDone ? '100%' : '0%' }" />
          </div>
        </div>

        <!-- God selection -->
        <div v-if="selectedGod === null" class="gods-grid">
          <button
            v-for="god in gods" :key="god.id"
            :class="['god-tile', { 'god-tile--used': god.usedThisCycle }]"
            :style="{ '--god-accent': godMeta[god.id]?.accent ?? '#c8a84e' }"
            :disabled="god.usedThisCycle"
            @click="!god.usedThisCycle ? selectGod(god.id, false) : undefined"
          >
            <!-- God portrait -->
            <div class="god-portrait">
              <img :src="godMeta[god.id]?.image" :alt="god.name" class="god-portrait-img" />
            </div>

            <!-- God name -->
            <div class="god-name">{{ god.name }}</div>

            <!-- Status -->
            <div v-if="god.usedThisCycle" class="god-status god-status--used">
              <Icon icon="game-icons:padlock" class="god-status-icon" />
              UŻYTY
            </div>
            <div v-else class="god-status god-status--ready">
              <Icon icon="game-icons:laurel-crown" class="god-status-icon" />
              GOTÓW
            </div>
          </button>
        </div>

        <!-- Powers selection (after clicking a god tile) -->
        <div v-else class="powers-screen">
          <div class="powers-god-header" :style="{ '--god-accent': godMeta[selectedGod]?.accent ?? '#c8a84e' }">
            <button class="powers-back" @click="cancel">
              <Icon icon="game-icons:return-arrow" />
            </button>
            <div class="powers-god-portrait">
              <img :src="godMeta[selectedGod]?.image" :alt="gods.find(g => g.id === selectedGod)?.name ?? ''" class="powers-god-portrait-img" />
            </div>
            <div class="powers-god-info">
              <div class="powers-god-name">{{ gods.find(g => g.id === selectedGod)?.name }}</div>
              <div class="powers-god-sub">Wybierz moc do przyzwania</div>
            </div>
          </div>

          <!-- Two power cards -->
          <div class="powers-cards">
            <button class="power-card power-card--base" @click="selectGod(selectedGod, false); selectedGod = selectedGod"
              :class="{ 'power-card--selected': !selectedEnhanced }"
              @click.prevent="selectedEnhanced = false"
            >
              <div class="pc-badge">BAZOWA</div>
              <Icon icon="game-icons:plain-circle" class="pc-icon pc-icon--base" />
              <div class="pc-desc">{{ godDescriptions[selectedGod]?.base ?? '—' }}</div>
            </button>

            <button class="power-card power-card--enhanced"
              :class="{ 'power-card--selected': selectedEnhanced }"
              @click.prevent="selectedEnhanced = true"
            >
              <div class="pc-badge">WZMOCNIONA</div>
              <Icon icon="game-icons:lightning-trio" class="pc-icon pc-icon--enhanced" />
              <div class="pc-desc">{{ godDescriptions[selectedGod]?.enhanced ?? '—' }}</div>
            </button>
          </div>

          <!-- Bid section -->
          <div class="bid-section">
            <div class="bid-glory">
              <Icon icon="game-icons:laurel-crown" class="bid-glory-icon" />
              <span>Twoje PS: <strong>{{ playerGlory }}</strong></span>
            </div>

            <div class="bid-input-row">
              <span class="bid-label">Stawka:</span>
              <button class="bid-adj" @click="bidAmount = Math.max(1, bidAmount - 1)">
                <Icon icon="game-icons:plain-arrow" style="transform: rotate(180deg)" />
              </button>
              <span class="bid-val">{{ bidAmount }}</span>
              <span class="bid-unit">PS</span>
              <button class="bid-adj" @click="bidAmount = Math.min(playerGlory, bidAmount + 1)">
                <Icon icon="game-icons:plain-arrow" />
              </button>
            </div>

            <div class="bid-actions">
              <button class="bid-cancel" @click="cancel">Anuluj</button>
              <button
                class="bid-confirm"
                :disabled="bidAmount > playerGlory || bidAmount < 1"
                @click="invokeGod"
              >
                <Icon icon="game-icons:temple-gate" />
                PRZYZWIJ
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.panteon-wrapper {
  position: relative;
}

/* ===== TOGGLE BUTTON ===== */
.panteon-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  background: rgba(200, 168, 78, 0.06);
  color: #c8a84e;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.panteon-toggle:hover {
  background: rgba(200, 168, 78, 0.12);
  border-color: rgba(200, 168, 78, 0.35);
  box-shadow: 0 0 12px rgba(200, 168, 78, 0.1);
}
.pt-icon { font-size: 14px; }
.pt-count {
  font-size: 9px;
  font-weight: 800;
  background: rgba(200, 168, 78, 0.25);
  padding: 0 4px;
  border-radius: 3px;
  color: #fbbf24;
}

/* ===== PANEL ===== */
.panteon-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  width: 340px;
  max-height: 480px;
  overflow-y: auto;
  background: linear-gradient(180deg, rgba(12, 10, 22, 0.97) 0%, rgba(8, 6, 16, 0.98) 100%);
  border: 1px solid rgba(200, 168, 78, 0.18);
  border-radius: 10px;
  padding: 12px;
  z-index: 100;
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.7),
    0 0 1px rgba(200, 168, 78, 0.15) inset;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.15) transparent;
}

.panteon-slide-enter-active, .panteon-slide-leave-active { transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
.panteon-slide-enter-from, .panteon-slide-leave-to { opacity: 0; transform: translateY(-10px) scale(0.97); }

/* ===== HEADER ===== */
.panteon-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(200, 168, 78, 0.1);
  position: relative;
}

.ph-ornament-left, .ph-ornament-right {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.25));
}
.ph-ornament-right {
  background: linear-gradient(90deg, rgba(200, 168, 78, 0.25), transparent);
}

.ph-icon {
  font-size: 12px;
  color: rgba(200, 168, 78, 0.4);
}

.ph-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: rgba(200, 168, 78, 0.7);
}

.ph-sub {
  font-size: 9px;
  color: rgba(148, 163, 184, 0.4);
  font-weight: 600;
  white-space: nowrap;
}

/* ===== MISSION TILE ===== */
.mission-tile {
  position: relative;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(251, 191, 36, 0.15);
  background:
    linear-gradient(135deg, rgba(251, 191, 36, 0.04) 0%, rgba(251, 191, 36, 0.01) 100%);
  margin-bottom: 10px;
  overflow: hidden;
}

.mission-tile::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(251, 191, 36, 0.3) 50%, transparent 90%);
}

.mission-tile.mission-done {
  border-color: rgba(34, 197, 94, 0.2);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.04) 0%, rgba(34, 197, 94, 0.01) 100%);
}
.mission-tile.mission-done::before {
  background: linear-gradient(90deg, transparent 10%, rgba(34, 197, 94, 0.3) 50%, transparent 90%);
}

.mission-header {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
}

.mission-icon {
  font-size: 14px;
  color: #fbbf24;
}
.mission-done .mission-icon { color: #22c55e; }

.mission-label {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(251, 191, 36, 0.6);
}
.mission-done .mission-label { color: rgba(34, 197, 94, 0.6); }

.mission-reward {
  margin-left: auto;
  font-size: 11px;
  font-weight: 900;
  font-family: var(--font-display, Georgia, serif);
  color: #86efac;
  text-shadow: 0 0 6px rgba(134, 239, 172, 0.3);
}

.mission-completed {
  margin-left: auto;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
  padding: 1px 6px;
  border-radius: 3px;
}

.mission-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 800;
  color: #fbbf24;
  margin-bottom: 2px;
}
.mission-done .mission-name {
  color: #86efac;
  text-decoration: line-through;
  text-decoration-color: rgba(134, 239, 172, 0.3);
}

.mission-desc {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.6);
  line-height: 1.3;
  font-style: italic;
  margin-bottom: 6px;
}

.mission-progress-track {
  height: 2px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 1px;
  overflow: hidden;
}
.mission-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #fbbf24, #86efac);
  border-radius: 1px;
  transition: width 0.6s ease;
}
.mission-done .mission-progress-fill {
  background: linear-gradient(90deg, #22c55e, #86efac);
}

/* ===== GODS GRID ===== */
.gods-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.god-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
  text-align: center;
}

.god-tile:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--god-accent) 40%, transparent);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--god-accent) 8%, transparent) 0%,
    color-mix(in srgb, var(--god-accent) 2%, transparent) 100%);
  transform: translateY(-2px);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.3),
    0 0 20px color-mix(in srgb, var(--god-accent) 10%, transparent);
}

.god-tile--used {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

/* God portrait */
.god-portrait {
  width: 64px;
  height: 82px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--god-accent) 25%, transparent);
  transition: all 0.25s ease;
  flex-shrink: 0;
}
.god-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}
.god-tile:not(:disabled):hover .god-portrait {
  border-color: color-mix(in srgb, var(--god-accent) 55%, transparent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--god-accent) 25%, transparent);
}
.god-tile:not(:disabled):hover .god-portrait-img {
  transform: scale(1.05);
}

.god-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 12px;
  font-weight: 800;
  color: #e2e8f0;
  letter-spacing: 0.03em;
}

.god-status {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.god-status-icon {
  width: 8px;
  height: 8px;
}

.god-status--ready {
  color: rgba(134, 239, 172, 0.5);
}

.god-status--used {
  color: rgba(239, 68, 68, 0.5);
}

/* ===== POWERS SCREEN ===== */
.powers-screen {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.powers-god-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--god-accent) 6%, transparent),
    transparent);
  border: 1px solid color-mix(in srgb, var(--god-accent) 12%, transparent);
}

.powers-back {
  background: none;
  border: none;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s;
  display: flex;
  align-items: center;
}
.powers-back:hover { color: #94a3b8; background: rgba(255, 255, 255, 0.05); }

.powers-god-portrait {
  width: 44px;
  height: 56px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--god-accent) 30%, transparent);
  flex-shrink: 0;
  box-shadow: 0 0 10px color-mix(in srgb, var(--god-accent) 15%, transparent);
}
.powers-god-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.powers-god-info { flex: 1; min-width: 0; }

.powers-god-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 800;
  color: var(--god-accent);
}

.powers-god-sub {
  font-size: 9px;
  color: rgba(148, 163, 184, 0.5);
}

/* Power cards */
.powers-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.power-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.power-card--base {
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.04) 0%, rgba(34, 197, 94, 0.01) 100%);
}
.power-card--enhanced {
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.05) 0%, rgba(139, 92, 246, 0.01) 100%);
}

.power-card:hover {
  transform: translateY(-1px);
}
.power-card--base:hover {
  border-color: rgba(34, 197, 94, 0.3);
  box-shadow: 0 2px 12px rgba(34, 197, 94, 0.1);
}
.power-card--enhanced:hover {
  border-color: rgba(139, 92, 246, 0.3);
  box-shadow: 0 2px 12px rgba(139, 92, 246, 0.1);
}

.power-card--selected.power-card--base {
  border-color: rgba(34, 197, 94, 0.6);
  background: rgba(34, 197, 94, 0.08);
  box-shadow: 0 0 16px rgba(34, 197, 94, 0.15), inset 0 0 8px rgba(34, 197, 94, 0.05);
}
.power-card--selected.power-card--enhanced {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.08);
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.15), inset 0 0 8px rgba(139, 92, 246, 0.05);
}

.pc-badge {
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.1em;
  padding: 1px 6px;
  border-radius: 3px;
}
.power-card--base .pc-badge {
  color: #4ade80;
  background: rgba(34, 197, 94, 0.1);
}
.power-card--enhanced .pc-badge {
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.1);
}

.pc-icon {
  font-size: 16px;
}
.pc-icon--base { color: #4ade80; }
.pc-icon--enhanced { color: #a78bfa; }

.pc-desc {
  font-size: 9px;
  color: #94a3b8;
  line-height: 1.3;
}

/* ===== BID SECTION ===== */
.bid-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 7px;
  border: 1px solid rgba(200, 168, 78, 0.1);
  background: rgba(200, 168, 78, 0.02);
}

.bid-glory {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.bid-glory strong { color: #86efac; font-size: 13px; }
.bid-glory-icon { font-size: 14px; color: #86efac; }

.bid-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bid-label {
  font-size: 10px;
  color: #64748b;
  font-weight: 700;
}

.bid-adj {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  background: rgba(200, 168, 78, 0.06);
  color: #c8a84e;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.bid-adj:hover { background: rgba(200, 168, 78, 0.15); }

.bid-val {
  font-family: var(--font-display, Georgia, serif);
  font-size: 22px;
  font-weight: 900;
  color: #fbbf24;
  min-width: 30px;
  text-align: center;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.3);
}

.bid-unit {
  font-size: 10px;
  font-weight: 800;
  color: rgba(200, 168, 78, 0.5);
  letter-spacing: 0.08em;
}

.bid-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.bid-cancel {
  padding: 6px 14px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #64748b;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.bid-cancel:hover { background: rgba(255, 255, 255, 0.06); color: #94a3b8; }

.bid-confirm {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 18px;
  border-radius: 5px;
  border: 1px solid rgba(200, 168, 78, 0.35);
  background: linear-gradient(180deg, rgba(200, 168, 78, 0.18), rgba(200, 168, 78, 0.06));
  color: #c8a84e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.2s;
}
.bid-confirm:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(200, 168, 78, 0.3), rgba(200, 168, 78, 0.12));
  border-color: rgba(200, 168, 78, 0.55);
  box-shadow: 0 0 16px rgba(200, 168, 78, 0.15);
  transform: translateY(-1px);
}
.bid-confirm:disabled { opacity: 0.3; cursor: not-allowed; }

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .panteon-panel { width: 290px; max-height: 400px; padding: 8px; }
  .panteon-toggle { font-size: 9px; padding: 3px 6px; }
  .gods-grid { gap: 6px; }
  .god-tile { padding: 10px 6px 8px; }
  .god-portrait { width: 52px; height: 66px; }
  .god-name { font-size: 11px; }
  .powers-cards { gap: 4px; }
  .power-card { padding: 8px 6px; }
}
</style>
