<script setup lang="ts">
/**
 * Showcase — prezentacja efektów wizualnych i dźwiękowych.
 * Klikasz efekt z listy → AI "odgrywa" animację → modal podsumowania → następny efekt.
 */
definePageMeta({ ssr: false })
import { ref, reactive, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useAudio } from '../../composables/useAudio'

const sfx = useAudio()

// ===== MOCK CARD STATE (do animacji) =====
const mockCard = reactive({
  isAttacking: false,
  isHit: false,
  isDying: false,
  isImmune: false,
  isCounter: false,
  attackType: null as number | null, // 0=melee,1=elem,2=magic,3=ranged
  damageNumber: null as number | null,
})

// Modal
const showModal = ref(false)
const modalTitle = ref('')
const modalDesc = ref('')
const isPlaying = ref(false)
let _timers: ReturnType<typeof setTimeout>[] = []

function clearTimers() {
  _timers.forEach(t => clearTimeout(t))
  _timers = []
}

onUnmounted(clearTimers)

function resetMock() {
  mockCard.isAttacking = false
  mockCard.isHit = false
  mockCard.isDying = false
  mockCard.isImmune = false
  mockCard.isCounter = false
  mockCard.attackType = null
  mockCard.damageNumber = null
}

function later(ms: number): Promise<void> {
  return new Promise(r => {
    const t = setTimeout(r, ms)
    _timers.push(t)
  })
}

async function playEffect(effect: ShowcaseEffect) {
  if (isPlaying.value) return
  isPlaying.value = true
  showModal.value = false
  clearTimers()
  resetMock()
  await later(200)

  await effect.play()

  await later(300)
  modalTitle.value = effect.name
  modalDesc.value = effect.desc
  showModal.value = true
  isPlaying.value = false
}

function closeModal() {
  showModal.value = false
}

// Typ efektu
interface ShowcaseEffect {
  id: string
  name: string
  desc: string
  icon: string
  category: string
  color: string
  play: () => Promise<void>
}

// ===== LISTA EFEKTÓW =====
const effects: ShowcaseEffect[] = [
  // ATTACK SFX + VFX
  {
    id: 'atk-melee', name: 'Atak Wręcz', desc: 'Podwójne cięcie mieczem — metaliczny zgrzyp i iskry.',
    icon: 'game-icons:broadsword', category: 'Atak', color: '#f87171',
    async play() {
      mockCard.attackType = 0
      sfx.sfxAttackMelee()
      mockCard.isAttacking = true
      await later(500)
      mockCard.isAttacking = false
      mockCard.isHit = true
      sfx.sfxHitMelee()
      await later(800)
      mockCard.isHit = false
    }
  },
  {
    id: 'atk-elem', name: 'Atak Żywiołem', desc: 'Ogniste cząstki — ogień pochłania kartę. Syk i trzask płomieni.',
    icon: 'game-icons:fire-dash', category: 'Atak', color: '#fbbf24',
    async play() {
      mockCard.attackType = 1
      sfx.sfxAttackElemental()
      mockCard.isAttacking = true
      await later(500)
      mockCard.isAttacking = false
      mockCard.isHit = true
      sfx.sfxHitElemental()
      await later(800)
      mockCard.isHit = false
    }
  },
  {
    id: 'atk-magic', name: 'Atak Magią', desc: 'Arkane iskry rozchodzące się od centrum karty. Mistyczne tony.',
    icon: 'game-icons:magic-swirl', category: 'Atak', color: '#c084fc',
    async play() {
      mockCard.attackType = 2
      sfx.sfxAttackMagic()
      mockCard.isAttacking = true
      await later(500)
      mockCard.isAttacking = false
      mockCard.isHit = true
      sfx.sfxHitMagic()
      await later(800)
      mockCard.isHit = false
    }
  },
  {
    id: 'atk-ranged', name: 'Atak Dystansowy', desc: 'Strzała przelatuje przez kartę — świst i tępe uderzenie.',
    icon: 'game-icons:arrow-flights', category: 'Atak', color: '#60a5fa',
    async play() {
      mockCard.attackType = 3
      sfx.sfxAttackRanged()
      mockCard.isAttacking = true
      await later(500)
      mockCard.isAttacking = false
      mockCard.isHit = true
      sfx.sfxHitRanged()
      await later(800)
      mockCard.isHit = false
    }
  },
  // COMBAT EFFECTS
  {
    id: 'death', name: 'Śmierć istoty', desc: 'Karta kurczy się, iskry i płomienie — istota ginie.',
    icon: 'game-icons:skull-crossed-bones', category: 'Walka', color: '#ef4444',
    async play() {
      sfx.sfxDeath()
      mockCard.isDying = true
      await later(900)
      mockCard.isDying = false
    }
  },
  {
    id: 'counter', name: 'Kontratak', desc: 'Tarcza pojawia się na karcie — obrońca odpowiada ciosem.',
    icon: 'game-icons:shield-bash', category: 'Walka', color: '#3b82f6',
    async play() {
      sfx.sfxCounterattack()
      mockCard.isCounter = true
      await later(1200)
      mockCard.isCounter = false
    }
  },
  {
    id: 'immune', name: 'Odporność', desc: 'Atak nie zadaje obrażeń — istota jest odporna.',
    icon: 'game-icons:aura', category: 'Walka', color: '#f59e0b',
    async play() {
      sfx.sfxImmune()
      mockCard.isImmune = true
      await later(1200)
      mockCard.isImmune = false
    }
  },
  {
    id: 'damage', name: 'Obrażenia', desc: 'Liczba obrażeń unosi się z karty — floating damage number.',
    icon: 'game-icons:drop', category: 'Walka', color: '#ef4444',
    async play() {
      mockCard.attackType = 0
      mockCard.isHit = true
      sfx.sfxHitMelee()
      mockCard.damageNumber = 5
      await later(1600)
      mockCard.isHit = false
      mockCard.damageNumber = null
    }
  },
  // UI SOUNDS
  {
    id: 'card-play', name: 'Zagranie karty', desc: 'Delikatny pluck — karta wchodzi na pole.',
    icon: 'game-icons:card-play', category: 'UI', color: '#34d399',
    async play() { sfx.sfxCardPlay(); await later(400) }
  },
  {
    id: 'draw', name: 'Dobranie karty', desc: 'Szybki slide — karta dobrana z talii.',
    icon: 'game-icons:card-draw', category: 'UI', color: '#34d399',
    async play() { sfx.sfxDraw(); await later(300) }
  },
  {
    id: 'phase', name: 'Zmiana fazy', desc: 'Krótki chime — przejście do następnej fazy tury.',
    icon: 'game-icons:hourglass', category: 'UI', color: '#a5b4fc',
    async play() { sfx.sfxPhase(); await later(400) }
  },
  {
    id: 'gold', name: 'Złoto', desc: 'Clink monety — złoto wydane lub zdobyte.',
    icon: 'game-icons:two-coins', category: 'UI', color: '#fbbf24',
    async play() { sfx.sfxGold(); await later(300) }
  },
  {
    id: 'adventure', name: 'Karta przygody', desc: 'Szelest pergaminu — zagranie karty przygody.',
    icon: 'game-icons:scroll-unfurled', category: 'UI', color: '#c8a84e',
    async play() { sfx.sfxAdventure(); await later(400) }
  },
  {
    id: 'activate', name: 'Aktywacja zdolności', desc: 'Magiczny zap — gracz aktywuje zdolność istoty.',
    icon: 'game-icons:lightning-storm', category: 'UI', color: '#a855f7',
    async play() { sfx.sfxActivate(); await later(400) }
  },
  {
    id: 'season', name: 'Zmiana pory roku', desc: 'Głęboki róg — nowy sezon nadchodzi.',
    icon: 'game-icons:sun', category: 'UI', color: '#fb923c',
    async play() { sfx.sfxSeasonChange(); await later(800) }
  },
  // GAME END
  {
    id: 'victory', name: 'Zwycięstwo', desc: 'Triumfalny akord — wygrałeś bitwę!',
    icon: 'game-icons:laurel-crown', category: 'Koniec', color: '#fbbf24',
    async play() { sfx.sfxVictory(); await later(1200) }
  },
  {
    id: 'defeat', name: 'Porażka', desc: 'Ponure schodzenie — przegrałeś bitwę.',
    icon: 'game-icons:broken-skull', category: 'Koniec', color: '#64748b',
    async play() { sfx.sfxDefeat(); await later(1200) }
  },
]

// Kategorie
const categories = [...new Set(effects.map(e => e.category))]

// Aktualny efekt
const activeEffectId = ref<string | null>(null)
</script>

<template>
  <div class="showcase-page">
    <!-- Sidebar -->
    <div class="showcase-sidebar">
      <div class="sidebar-header">
        <NuxtLink to="/" class="back-btn">
          <Icon icon="game-icons:return-arrow" />
        </NuxtLink>
        <div class="sidebar-title">
          <Icon icon="game-icons:sparkles" class="title-icon" />
          <span>Pokaz efektów</span>
        </div>
      </div>

      <div class="effect-list">
        <template v-for="cat in categories" :key="cat">
          <div class="cat-label">{{ cat }}</div>
          <div
            v-for="eff in effects.filter(e => e.category === cat)"
            :key="eff.id"
            :class="['effect-item', { active: activeEffectId === eff.id, playing: isPlaying && activeEffectId === eff.id }]"
            :style="{ '--ec': eff.color }"
            @click="activeEffectId = eff.id; playEffect(eff)"
          >
            <Icon :icon="eff.icon" class="eff-icon" />
            <span class="eff-name">{{ eff.name }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Main area -->
    <div class="showcase-main">
      <!-- Mock card display -->
      <div class="mock-stage">
        <div class="stage-bg" />

        <!-- The mock creature card visualization -->
        <div
          :class="['mock-card', {
            'mock-attacking': mockCard.isAttacking,
            'mock-hit': mockCard.isHit,
            'mock-dying': mockCard.isDying,
          }]"
        >
          <!-- Card body -->
          <div class="mc-art">
            <Icon icon="game-icons:werewolf" class="mc-creature-icon" />
          </div>
          <div class="mc-name">Strzyga</div>
          <div class="mc-stats">
            <span class="mc-atk">5</span>
            <span class="mc-sep">/</span>
            <span class="mc-def">7</span>
          </div>

          <!-- HIT VFX overlay -->
          <div v-if="mockCard.isHit" class="mock-hit-vfx">
            <!-- MELEE -->
            <svg v-if="mockCard.attackType === 0 || mockCard.attackType === null" viewBox="0 0 110 154" class="slash-svg">
              <line x1="10" y1="140" x2="100" y2="14" class="slash-line" />
              <line x1="85" y1="140" x2="25" y2="40" class="slash-line slash-line-2" />
            </svg>
            <!-- ELEMENTAL -->
            <template v-if="mockCard.attackType === 1">
              <div class="elem-fire" v-for="n in 10" :key="n" :style="{ '--ei': n }" />
              <div class="elem-glow" />
            </template>
            <!-- MAGIC -->
            <template v-if="mockCard.attackType === 2">
              <div class="magic-sparkle" v-for="n in 8" :key="n" :style="{ '--mi': n }" />
              <div class="magic-ring" />
            </template>
            <!-- RANGED -->
            <template v-if="mockCard.attackType === 3">
              <div class="arrow-streak" />
              <div class="arrow-impact" />
            </template>
          </div>

          <!-- Damage number -->
          <div v-if="mockCard.damageNumber" class="mock-damage">-{{ mockCard.damageNumber }}</div>

          <!-- Immune overlay -->
          <div v-if="mockCard.isImmune" class="mock-immune">
            ✋
            <span class="immune-text">ODPORNY</span>
          </div>

          <!-- Counter overlay -->
          <div v-if="mockCard.isCounter" class="mock-counter">
            🛡️
            <span class="counter-text">KONTRATAK</span>
          </div>
        </div>

        <!-- Info when nothing selected -->
        <div v-if="!activeEffectId && !isPlaying" class="stage-hint">
          <Icon icon="game-icons:sparkles" class="hint-icon" />
          <p>Wybierz efekt z listy po lewej</p>
          <p class="hint-sub">Każdy efekt odgrywa animację i dźwięk</p>
        </div>
      </div>

      <!-- Completion modal -->
      <Transition name="modal-fade">
        <div v-if="showModal" class="completion-modal" @click="closeModal">
          <div class="modal-card" @click.stop>
            <Icon icon="game-icons:check-mark" class="modal-check" />
            <h3>{{ modalTitle }}</h3>
            <p>{{ modalDesc }}</p>
            <button class="modal-btn" @click="closeModal">
              <Icon icon="game-icons:arrow-dunk" /> Dalej
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.showcase-page {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #04030a;
}

/* ===== SIDEBAR ===== */
.showcase-sidebar {
  width: 260px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  background: rgba(10, 12, 20, 0.95);
  border-right: 1px solid rgba(200, 168, 78, 0.08);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: #475569;
  text-decoration: none;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.15s;
}
.back-btn:hover { color: #e2e8f0; border-color: rgba(255, 255, 255, 0.15); }

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 800;
  color: #e2e8f0;
}
.title-icon { font-size: 18px; color: #c8a84e; }

/* Effect list */
.effect-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.15) transparent;
}

.cat-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(200, 168, 78, 0.4);
  padding: 10px 14px 4px;
}

.effect-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.12s;
  color: #64748b;
}
.effect-item:hover { background: rgba(255, 255, 255, 0.03); color: #94a3b8; }
.effect-item.active {
  border-left-color: var(--ec);
  background: color-mix(in srgb, var(--ec) 6%, transparent);
  color: #e2e8f0;
}
.effect-item.playing { animation: item-pulse 0.6s ease infinite; }

@keyframes item-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.eff-icon { font-size: 16px; color: var(--ec); flex-shrink: 0; }
.eff-name { font-size: 12px; font-weight: 600; }

/* ===== MAIN STAGE ===== */
.showcase-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.mock-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  position: relative;
}

.stage-bg {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 50% 50%, rgba(200, 168, 78, 0.03) 0%, transparent 60%);
  pointer-events: none;
}

/* ===== MOCK CARD ===== */
.mock-card {
  width: 160px;
  height: 224px;
  border-radius: 10px;
  background: linear-gradient(165deg, #1a1520 0%, #0d0a14 100%);
  border: 2px solid rgba(200, 168, 78, 0.2);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.15s;
  z-index: 2;
}

.mock-attacking {
  animation: mock-charge 0.5s ease;
}

.mock-hit {
  animation: mock-shake 0.5s ease;
}

.mock-dying {
  animation: mock-death 0.8s ease-out forwards;
}

@keyframes mock-charge {
  0% { transform: translateX(0); }
  30% { transform: translateX(20px) scale(1.05); }
  60% { transform: translateX(-5px); }
  100% { transform: translateX(0); }
}

@keyframes mock-shake {
  0%   { transform: translate(0); }
  15%  { transform: translate(-6px, 2px); }
  30%  { transform: translate(6px, -1px); }
  45%  { transform: translate(-4px, 0); }
  60%  { transform: translate(4px, 1px); }
  80%  { transform: translate(-2px, 0); }
  100% { transform: translate(0); }
}

@keyframes mock-death {
  0%   { opacity: 1; transform: scale(1); }
  20%  { opacity: 1; transform: scale(1.06); }
  50%  { opacity: 0.5; transform: scale(0.85); }
  100% { opacity: 0; transform: scale(0.2); }
}

.mc-art {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(200, 168, 78, 0.06) 0%, transparent 60%);
}

.mc-creature-icon {
  font-size: 64px;
  color: rgba(200, 168, 78, 0.3);
}

.mc-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 16px;
  font-weight: 800;
  color: #e2e8f0;
  text-align: center;
  padding: 4px 8px 2px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
}

.mc-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 8px 8px;
  background: rgba(0, 0, 0, 0.4);
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 900;
}

.mc-atk { color: #f87171; }
.mc-sep { color: #475569; font-size: 14px; }
.mc-def { color: #60a5fa; }

/* ===== HIT VFX (copied from CreatureCard) ===== */
.mock-hit-vfx {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  overflow: hidden;
  border-radius: 10px;
}

/* Melee slash */
.slash-svg { width: 100%; height: 100%; }
.slash-line {
  stroke: #fff; stroke-width: 3; stroke-linecap: round;
  filter: drop-shadow(0 0 6px #ef4444);
  stroke-dasharray: 200; stroke-dashoffset: 200;
  animation: slash-draw 0.4s ease-out forwards;
}
.slash-line-2 { animation-delay: 0.12s; stroke: #fca5a5; filter: drop-shadow(0 0 4px #dc2626); }
@keyframes slash-draw {
  0%   { stroke-dashoffset: 200; opacity: 0; stroke-width: 1; }
  20%  { opacity: 1; stroke-width: 4; }
  60%  { stroke-dashoffset: 0; stroke-width: 3; }
  80%  { opacity: 0.8; stroke-width: 2; }
  100% { stroke-dashoffset: 0; opacity: 0; stroke-width: 0; }
}

/* Elemental fire */
.elem-fire {
  position: absolute; width: 10px; height: 10px; border-radius: 50%;
  background: radial-gradient(circle, #fbbf24 30%, #ef4444 70%, transparent);
  bottom: 10%; left: calc(10% + var(--ei) * 8%);
  opacity: 0; animation: elem-rise 0.7s ease-out forwards;
  animation-delay: calc(var(--ei) * 0.04s);
}
.elem-glow {
  position: absolute; inset: 10%; border-radius: 50%;
  background: radial-gradient(circle, rgba(251, 146, 60, 0.5) 0%, transparent 70%);
  animation: elem-glow-pulse 0.6s ease-out forwards;
}
@keyframes elem-rise {
  0%   { opacity: 0; transform: translateY(0) scale(0.3); }
  20%  { opacity: 1; transform: translateY(-15px) scale(1.3); }
  60%  { opacity: 0.8; transform: translateY(-50px) scale(0.8); }
  100% { opacity: 0; transform: translateY(-90px) scale(0.2); }
}
@keyframes elem-glow-pulse {
  0%   { opacity: 0; transform: scale(0.5); }
  30%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.3); }
}

/* Magic sparkles */
.magic-sparkle {
  position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: #c084fc; box-shadow: 0 0 8px #a855f7, 0 0 16px rgba(168, 85, 247, 0.5);
  top: 50%; left: 50%; opacity: 0;
  animation: magic-burst 0.6s ease-out forwards;
  animation-delay: calc(var(--mi) * 0.05s);
  --angle: calc(var(--mi) * 45deg);
}
.magic-ring {
  position: absolute; top: 50%; left: 50%; width: 20px; height: 20px;
  margin: -10px 0 0 -10px; border: 2px solid #a855f7; border-radius: 50%;
  opacity: 0; animation: magic-ring-expand 0.5s ease-out forwards;
  will-change: transform;
}
@keyframes magic-burst {
  0%   { opacity: 0; transform: translate(0, 0) scale(0); }
  30%  { opacity: 1; transform: translate(calc(cos(var(--angle)) * 25px), calc(sin(var(--angle)) * 25px)) scale(1.5); }
  70%  { opacity: 0.7; transform: translate(calc(cos(var(--angle)) * 50px), calc(sin(var(--angle)) * 50px)) scale(1); }
  100% { opacity: 0; transform: translate(calc(cos(var(--angle)) * 70px), calc(sin(var(--angle)) * 70px)) scale(0); }
}
@keyframes magic-ring-expand {
  0%   { opacity: 0; transform: scale(0.07); border-width: 3px; }
  30%  { opacity: 1; transform: scale(0.5); }
  100% { opacity: 0; transform: scale(7); border-width: 1px; }
}

/* Ranged arrow */
.arrow-streak {
  position: absolute; top: 50%; left: -20px; width: 50px; height: 3px;
  background: linear-gradient(90deg, transparent, #93c5fd, #3b82f6); border-radius: 2px;
  transform: translateY(-50%); animation: arrow-fly 0.3s ease-out forwards;
}
.arrow-impact {
  position: absolute; top: 50%; right: 30%; width: 14px; height: 14px; margin-top: -7px;
  border-radius: 50%; background: radial-gradient(circle, rgba(59, 130, 246, 0.8) 0%, transparent 70%);
  opacity: 0; animation: arrow-hit 0.4s ease-out 0.25s forwards;
}
@keyframes arrow-fly {
  0%   { left: -40px; opacity: 0; width: 30px; }
  30%  { opacity: 1; width: 60px; }
  100% { left: 60%; opacity: 0; width: 20px; }
}
@keyframes arrow-hit {
  0%   { opacity: 0; transform: scale(0.3); }
  40%  { opacity: 1; transform: scale(2.5); }
  100% { opacity: 0; transform: scale(4); }
}

/* ===== Damage number ===== */
.mock-damage {
  position: absolute;
  top: 30%;
  right: 10%;
  font-family: var(--font-display, Georgia, serif);
  font-size: 32px;
  font-weight: 900;
  color: #ef4444;
  text-shadow: 0 0 12px rgba(239, 68, 68, 0.6), 0 2px 8px rgba(0, 0, 0, 0.8);
  z-index: 12;
  animation: dmg-float 1.5s ease-out forwards;
  pointer-events: none;
}

@keyframes dmg-float {
  0%   { opacity: 0; transform: translateY(10px) scale(0.5); }
  15%  { opacity: 1; transform: translateY(0) scale(1.3); }
  40%  { opacity: 1; transform: translateY(-15px) scale(1); }
  100% { opacity: 0; transform: translateY(-40px) scale(0.8); }
}

/* ===== Immune/Counter overlays ===== */
.mock-immune, .mock-counter {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 52px;
  border-radius: 10px;
  pointer-events: none;
  animation: overlay-in 0.3s ease-out;
}

.mock-immune {
  background: rgba(120, 80, 20, 0.8);
  outline: 3px solid #f59e0b;
}

.mock-counter {
  background: rgba(20, 40, 120, 0.8);
  outline: 3px solid #3b82f6;
}

.immune-text, .counter-text {
  font-size: 11px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.12em;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  padding: 2px 8px;
  border-radius: 4px;
}
.immune-text { background: rgba(100, 60, 10, 0.9); }
.counter-text { background: rgba(10, 30, 100, 0.9); }

@keyframes overlay-in {
  0%   { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}

/* ===== Stage hint ===== */
.stage-hint {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #334155;
  z-index: 1;
}
.hint-icon { font-size: 48px; opacity: 0.2; color: #c8a84e; }
.stage-hint p { margin: 0; font-size: 14px; }
.hint-sub { font-size: 11px !important; color: #1e293b !important; }

/* ===== COMPLETION MODAL ===== */
.completion-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.modal-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 36px;
  border-radius: 12px;
  background: linear-gradient(165deg, #1a1520, #0d0a14);
  border: 1px solid rgba(200, 168, 78, 0.2);
  min-width: 280px;
  text-align: center;
}

.modal-check {
  font-size: 32px;
  color: #34d399;
}

.modal-card h3 {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 800;
  color: #e2e8f0;
  margin: 0;
}

.modal-card p {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
  max-width: 240px;
}

.modal-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 7px;
  border: 1px solid rgba(200, 168, 78, 0.3);
  background: rgba(200, 168, 78, 0.1);
  color: #c8a84e;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 4px;
}
.modal-btn:hover { background: rgba(200, 168, 78, 0.2); }

/* Modal transition */
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
