<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

const expanded = ref(false)
const selectedGod = ref<number | null>(null)
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
    claimable: slava.holiday.claimable?.player1 ?? false,
  }
})

const pendingFavor = computed(() => game.slavaData?.pendingFavor ?? null)
const canActivateFavor = computed(() => {
  const favor = pendingFavor.value
  if (!favor || favor.winnerSide !== 'player1') return false
  const round = game.state?.roundNumber ?? 0
  return favor.wonOnRound < round && game.isPlayerTurn
})

const seasonBuffInfo: Record<number, string> = {
  0: 'Nieumarli: +1 OBR',     // Zima
  1: 'Perunowcy: +1 ATK',     // Wiosna
  2: 'Żywi: +1 ATK',          // Lato
  3: 'Welesowcy: ulepszenie za 0 PS', // Jesień
}

const seasonParalysisInfo: Record<number, string> = {
  0: 'Perunowcy: paraliż 1 rundę',
  1: 'Welesowcy: paraliż 1 rundę',
  2: 'Nieumarli: paraliż 1 rundę',
  3: 'Żywi: paraliż 1 rundę',
}

const seasonInfo = computed(() => {
  const slava = game.slavaData
  if (!slava) return null
  const seasonNames = ['Zima', 'Wiosna', 'Lato', 'Jesień']
  return {
    name: seasonNames[slava.currentSeason] ?? 'Zima',
    season: slava.currentSeason,
    round: slava.seasonRound,
    roundsTotal: 12,
    buff: seasonBuffInfo[slava.currentSeason] ?? '',
    paralysis: slava.paralysisRoundsLeft > 0 ? (seasonParalysisInfo[slava.currentSeason] ?? '') : '',
  }
})

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

const godDescriptions: Record<number, string> = {
  1: 'Wskrzesza twoją istotę z cmentarza',
  2: '15 obrażeń rozdzielonych na wrogów',
  3: 'Perunowcy wroga muszą być w Obronie',
  4: 'Leczy wszystkich sojuszników do pełna',
  5: 'Dobierz 3 karty + darmowe wystawienie',
  6: '10 obrażeń istoty Welesa (ignoruje odporności)',
  7: 'Odtwarza kartę przygody z cmentarza',
  8: 'Zamienia premie dwóch sojuszników',
}

const holidayDescriptions: Record<string, string> = {
  'Szczodre Gody': 'Suma OBR twoich istot na polu ≥ 20',
  'Jare Gody': 'Miej istoty z 4 różnych domen na polu',
  'Święto Kupały': 'Zadaj ≥ 15 obrażeń w jednej turze',
  'Dziady': 'Miej ≥ 3 istoty więcej niż wróg na polu',
}

function selectGod(godId: number) {
  selectedGod.value = godId
  bidAmount.value = 1
}

function invokeGod() {
  if (selectedGod.value === null) return
  game.invokeGod(selectedGod.value, bidAmount.value)
  selectedGod.value = null
  expanded.value = false
}

function cancel() {
  selectedGod.value = null
}

function doActivateFavor() {
  game.activateFavor()
  expanded.value = false
}

function doClaimHoliday() {
  game.playerClaimHoliday()
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
          <span class="ph-sub" v-if="seasonInfo">{{ seasonInfo.name }} · Runda {{ seasonInfo.round }}/{{ seasonInfo.roundsTotal }}</span>
          <Icon icon="game-icons:triple-corn" class="ph-icon" />
          <div class="ph-ornament-right" />
        </div>

        <!-- Season buff info -->
        <div v-if="seasonInfo" class="season-info-tile">
          <div class="season-info-row season-info-buff">
            <Icon icon="game-icons:arrow-dunk" class="season-info-icon season-info-icon--buff" />
            <span>{{ seasonInfo.buff }}</span>
          </div>
          <div v-if="seasonInfo.paralysis" class="season-info-row season-info-debuff">
            <Icon icon="game-icons:frozen-body" class="season-info-icon season-info-icon--debuff" />
            <span>{{ seasonInfo.paralysis }}</span>
          </div>
        </div>

        <!-- Holiday / Mission tile -->
        <div
          v-if="holiday"
          :class="['mission-tile', { 'mission-done': holiday.playerDone, 'mission-claimable': holiday.claimable && !holiday.playerDone }]"
          @click="holiday.claimable && !holiday.playerDone ? doClaimHoliday() : undefined"
        >
          <div class="mission-header">
            <Icon :icon="holiday.playerDone ? 'game-icons:check-mark' : holiday.claimable ? 'game-icons:party-popper' : 'game-icons:scroll-quill'" class="mission-icon" />
            <span class="mission-label">ŚWIĘTO</span>
            <span class="mission-reward" v-if="!holiday.playerDone">+{{ holiday.reward }} PS</span>
            <span class="mission-completed" v-else>UKOŃCZONE</span>
          </div>
          <div class="mission-name">{{ holiday.name }}</div>
          <div class="mission-desc">{{ holidayDescriptions[holiday.name] ?? '' }}</div>
          <div v-if="holiday.claimable && !holiday.playerDone" class="mission-claim-btn">
            <Icon icon="game-icons:party-popper" /> ŚWIĘTUJ! (+{{ holiday.reward }} PS)
          </div>
          <div class="mission-progress-track">
            <div class="mission-progress-fill" :style="{ width: holiday.playerDone ? '100%' : holiday.claimable ? '100%' : '0%' }" />
          </div>
        </div>

        <!-- Pending Favor (ZŁÓŻ OFIARĘ) -->
        <div v-if="pendingFavor && pendingFavor.winnerSide === 'player1'" class="favor-tile" :style="{ '--god-accent': godMeta[pendingFavor.godId]?.accent ?? '#c8a84e' }">
          <div class="favor-header">
            <div class="favor-portrait">
              <img :src="godMeta[pendingFavor.godId]?.image" :alt="pendingFavor.godName" class="favor-portrait-img" />
            </div>
            <div class="favor-info">
              <div class="favor-god-name">{{ pendingFavor.godName }}</div>
              <div class="favor-power">{{ godDescriptions[pendingFavor.godId] ?? '' }}</div>
              <div class="favor-cost">Koszt: {{ pendingFavor.cost }} PS</div>
            </div>
          </div>
          <button
            class="favor-activate"
            :disabled="!canActivateFavor"
            @click="canActivateFavor ? doActivateFavor() : undefined"
          >
            <Icon icon="game-icons:temple-gate" />
            {{ canActivateFavor ? 'ZŁÓŻ OFIARĘ' : 'Dostępne od nast. rundy' }}
          </button>
        </div>

        <!-- God selection -->
        <div v-if="selectedGod === null" class="gods-grid">
          <button
            v-for="god in gods" :key="god.id"
            :class="['god-tile', { 'god-tile--used': god.usedThisCycle }]"
            :style="{ '--god-accent': godMeta[god.id]?.accent ?? '#c8a84e' }"
            :disabled="god.usedThisCycle"
            @click="!god.usedThisCycle ? selectGod(god.id) : undefined"
          >
            <div class="god-portrait">
              <img :src="godMeta[god.id]?.image" :alt="god.name" class="god-portrait-img" />
            </div>
            <div class="god-name">{{ god.name }}</div>
            <div class="god-power-desc">{{ godDescriptions[god.id] ?? '' }}</div>
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

        <!-- Bid screen (after clicking a god) -->
        <div v-else class="bid-screen">
          <div class="bid-god-header" :style="{ '--god-accent': godMeta[selectedGod]?.accent ?? '#c8a84e' }">
            <button class="bid-back" @click="cancel">
              <Icon icon="game-icons:return-arrow" />
            </button>
            <div class="bid-god-portrait">
              <img :src="godMeta[selectedGod]?.image" :alt="gods.find(g => g.id === selectedGod)?.name ?? ''" class="bid-god-portrait-img" />
            </div>
            <div class="bid-god-info">
              <div class="bid-god-name">{{ gods.find(g => g.id === selectedGod)?.name }}</div>
              <div class="bid-god-power">{{ godDescriptions[selectedGod] ?? '' }}</div>
            </div>
          </div>

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
  transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s;
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

.panteon-slide-enter-active, .panteon-slide-leave-active { transition: opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
.panteon-slide-enter-from, .panteon-slide-leave-to { opacity: 0; transform: translateY(-10px) scale(0.97); }

/* ===== SEASON INFO ===== */
.season-info-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(200, 168, 78, 0.08);
  margin-bottom: 10px;
}
.season-info-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
}
.season-info-icon { font-size: 12px; }
.season-info-icon--buff { color: #86efac; }
.season-info-icon--debuff { color: #f87171; }
.season-info-buff { color: rgba(134, 239, 172, 0.8); }
.season-info-debuff { color: rgba(248, 113, 113, 0.7); }

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
  font-size: 14px;
  font-weight: 500;
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

/* Mission claimable state */
.mission-claimable {
  border-color: rgba(251, 191, 36, 0.4);
  cursor: pointer;
  animation: mission-glow 1.5s ease-in-out infinite alternate;
}
.mission-claimable:hover {
  border-color: rgba(251, 191, 36, 0.6);
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(251, 191, 36, 0.03) 100%);
}
@keyframes mission-glow {
  from { box-shadow: 0 0 4px rgba(251, 191, 36, 0.1); }
  to { box-shadow: 0 0 16px rgba(251, 191, 36, 0.25); }
}
.mission-claim-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 10px;
  margin-top: 6px;
  border-radius: 5px;
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.08));
  border: 1px solid rgba(251, 191, 36, 0.35);
  color: #fbbf24;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
}

/* ===== PENDING FAVOR (ZŁÓŻ OFIARĘ) ===== */
.favor-tile {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--god-accent) 25%, transparent);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--god-accent) 5%, transparent) 0%,
    color-mix(in srgb, var(--god-accent) 2%, transparent) 100%);
  margin-bottom: 10px;
}
.favor-header {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}
.favor-portrait {
  width: 40px;
  height: 52px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--god-accent) 30%, transparent);
  flex-shrink: 0;
  box-shadow: 0 0 10px color-mix(in srgb, var(--god-accent) 15%, transparent);
}
.favor-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.favor-info { flex: 1; min-width: 0; }
.favor-god-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 500;
  color: var(--god-accent);
}
.favor-power {
  font-size: 9px;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
  line-height: 1.3;
  margin-top: 1px;
}
.favor-cost {
  font-size: 9px;
  font-weight: 700;
  color: #fbbf24;
  margin-top: 2px;
}
.favor-activate {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--god-accent) 40%, transparent);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--god-accent) 20%, transparent),
    color-mix(in srgb, var(--god-accent) 8%, transparent));
  color: var(--god-accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.favor-activate:hover:not(:disabled) {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--god-accent) 32%, transparent),
    color-mix(in srgb, var(--god-accent) 14%, transparent));
  border-color: color-mix(in srgb, var(--god-accent) 60%, transparent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--god-accent) 20%, transparent);
  transform: translateY(-1px);
}
.favor-activate:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  font-size: 10px;
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
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
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
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
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
  font-size: 14px;
  font-weight: 500;
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

/* ===== GOD POWER DESCRIPTION ===== */
.god-power-desc {
  font-size: 9px;
  color: rgba(148, 163, 184, 0.6);
  line-height: 1.3;
  font-style: italic;
}

/* ===== BID SCREEN ===== */
.bid-screen {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bid-god-header {
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

.bid-back {
  background: none;
  border: none;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s, background-color 0.15s;
  display: flex;
  align-items: center;
}
.bid-back:hover { color: #94a3b8; background: rgba(255, 255, 255, 0.05); }

.bid-god-portrait {
  width: 44px;
  height: 56px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--god-accent) 30%, transparent);
  flex-shrink: 0;
  box-shadow: 0 0 10px color-mix(in srgb, var(--god-accent) 15%, transparent);
}
.bid-god-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.bid-god-info { flex: 1; min-width: 0; }

.bid-god-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 500;
  color: var(--god-accent);
}

.bid-god-power {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
  line-height: 1.3;
  margin-top: 2px;
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
  transition: background-color 0.15s;
}
.bid-adj:hover { background: rgba(200, 168, 78, 0.15); }

.bid-val {
  font-family: var(--font-display, Georgia, serif);
  font-size: 26px;
  font-weight: 500;
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
  transition: background-color 0.15s, color 0.15s;
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
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s;
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
  .bid-god-portrait { width: 36px; height: 46px; }
  .bid-god-name { font-size: 12px; }
}
</style>
