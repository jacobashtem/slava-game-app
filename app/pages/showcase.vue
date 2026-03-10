<script setup lang="ts">
/**
 * Showcase — prezentacja efektów wizualnych i dźwiękowych.
 * Klikasz efekt z listy → AI "odgrywa" animację → modal podsumowania → następny efekt.
 */
definePageMeta({ ssr: false })
import { ref, reactive, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useAudio } from '../../composables/useAudio'
import { useUIStore } from '../../stores/uiStore'
import { useVFXOrchestrator } from '../../composables/useVFXOrchestrator'
import WeatherEffects from '../../components/ui/WeatherEffects.vue'
import DrainParticles from '../../components/ui/DrainParticles.vue'
import AoEWave from '../../components/ui/AoEWave.vue'
import EggHatchVFX from '../../components/ui/EggHatchVFX.vue'
import ConversionSlideVFX from '../../components/ui/ConversionSlideVFX.vue'
import GorynychMergeVFX from '../../components/ui/GorynychMergeVFX.vue'
import FireVFX from '../../components/ui/FireVFX.vue'
import VFXOverlay from '../../components/vfx/VFXOverlay.vue'

const sfx = useAudio()
const ui = useUIStore()
const vfx = useVFXOrchestrator()

// ===== P3 SHOWCASE STATE =====
const p3ActiveSeason = ref<'spring' | 'summer' | 'autumn' | 'winter'>('spring')
const p3Tab = ref<'p3' | 'legacy'>('p3')

// Battlefield backgrounds for season panels
const bgModules = import.meta.glob('../../assets/backgrounds/battlefields/1/*.webp', { eager: true, query: '?url', import: 'default' })
const seasonBgMap: Record<string, string> = {}
for (const [path, url] of Object.entries(bgModules)) {
  if (path.includes('wiosna')) seasonBgMap.spring = url as string
  else if (path.includes('lato')) seasonBgMap.summer = url as string
  else if (path.includes('jesien')) seasonBgMap.autumn = url as string
  else if (path.includes('zima')) seasonBgMap.winter = url as string
}

function demoDamageNumber(targetId: string, value: number, color: string, label?: string) {
  const el = document.querySelector(`[data-instance-id="${targetId}"]`)
  if (!el) return
  const rect = el.getBoundingClientRect()
  vfx.emit({
    type: 'damage-number',
    targetId,
    value,
    color,
    label,
    meta: { pos: { x: rect.left + rect.width / 2, y: rect.top + 20 } },
  })
}

// ===== MOCK CARD STATE (do animacji) =====
const mockCard = reactive({
  isAttacking: false,
  isHit: false,
  isDying: false,
  isImmune: false,
  isCounter: false,
  attackType: null as number | null, // 0=melee,1=elem,2=magic,3=ranged
  damageNumber: null as number | null,
  // P1 VFX
  isParalyzed: false,
  isDiseased: false,
  isCursed: false,
  isLifestealer: false,
  isDeathFeeder: false,
  isAoE: false,
  statusFlash: null as string | null,
  isHomenCursed: false,
  isZombifying: false,
  // UI VFX
  isCardPlay: false,
  isDraw: false,
  isPhaseChange: false,
  isGoldFlash: false,
  isAdventure: false,
  isActivate: false,
  isSeasonChange: false,
  isVictory: false,
  isDefeat: false,
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
  mockCard.isParalyzed = false
  mockCard.isDiseased = false
  mockCard.isCursed = false
  mockCard.isLifestealer = false
  mockCard.isDeathFeeder = false
  mockCard.isAoE = false
  mockCard.statusFlash = null
  mockCard.isHomenCursed = false
  mockCard.isZombifying = false
  mockCard.isCardPlay = false
  mockCard.isDraw = false
  mockCard.isPhaseChange = false
  mockCard.isGoldFlash = false
  mockCard.isAdventure = false
  mockCard.isActivate = false
  mockCard.isSeasonChange = false
  mockCard.isVictory = false
  mockCard.isDefeat = false
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
  // UI SOUNDS + VFX
  {
    id: 'card-play', name: 'Zagranie karty', desc: 'Karta spada na pole z odbiciem — pluck i złota poświata.',
    icon: 'game-icons:card-play', category: 'UI', color: '#34d399',
    async play() {
      sfx.sfxCardPlay()
      mockCard.isCardPlay = true
      await later(800)
      mockCard.isCardPlay = false
    }
  },
  {
    id: 'draw', name: 'Dobranie karty', desc: 'Karta wysuwa się z talii — slide z prawej z efektem świetlnym.',
    icon: 'game-icons:card-draw', category: 'UI', color: '#34d399',
    async play() {
      sfx.sfxDraw()
      mockCard.isDraw = true
      await later(700)
      mockCard.isDraw = false
    }
  },
  {
    id: 'phase', name: 'Zmiana fazy', desc: 'Złoty puls rozchodzi się od karty — przejście do następnej fazy.',
    icon: 'game-icons:hourglass', category: 'UI', color: '#a5b4fc',
    async play() {
      sfx.sfxPhase()
      mockCard.isPhaseChange = true
      await later(900)
      mockCard.isPhaseChange = false
    }
  },
  {
    id: 'gold', name: 'Złoto', desc: 'Złote monety fruwają wokół karty — clink i błysk.',
    icon: 'game-icons:two-coins', category: 'UI', color: '#fbbf24',
    async play() {
      sfx.sfxGold()
      mockCard.isGoldFlash = true
      await later(900)
      mockCard.isGoldFlash = false
    }
  },
  {
    id: 'adventure', name: 'Karta przygody', desc: 'Pergamin rozwija się — ciepła poświata i runy.',
    icon: 'game-icons:scroll-unfurled', category: 'UI', color: '#c8a84e',
    async play() {
      sfx.sfxAdventure()
      mockCard.isAdventure = true
      await later(1000)
      mockCard.isAdventure = false
    }
  },
  {
    id: 'activate', name: 'Aktywacja zdolności', desc: 'Energia pulsuje od karty — elektryczne wyładowania.',
    icon: 'game-icons:lightning-storm', category: 'UI', color: '#a855f7',
    async play() {
      sfx.sfxActivate()
      mockCard.isActivate = true
      await later(1000)
      mockCard.isActivate = false
    }
  },
  {
    id: 'season', name: 'Zmiana pory roku', desc: 'Sezonowa fala kolorów przechodzi przez kartę — głęboki róg.',
    icon: 'game-icons:sun', category: 'UI', color: '#fb923c',
    async play() {
      sfx.sfxSeasonChange()
      mockCard.isSeasonChange = true
      await later(2000)
      mockCard.isSeasonChange = false
    }
  },
  // STATUS VFX
  {
    id: 'paralysis', name: 'Paraliż', desc: 'Istota sparaliżowana — szara desaturacja, pulsująca nakładka.',
    icon: 'game-icons:frozen-body', category: 'Statusy', color: '#94a3b8',
    async play() {
      mockCard.isParalyzed = true
      await later(2500)
      mockCard.isParalyzed = false
    }
  },
  {
    id: 'disease', name: 'Choroba', desc: 'Zaraza — zielona poświata, istota nie może atakować.',
    icon: 'game-icons:death-juice', category: 'Statusy', color: '#22c55e',
    async play() {
      mockCard.isDiseased = true
      await later(2500)
      mockCard.isDiseased = false
    }
  },
  {
    id: 'curse', name: 'Klątwa', desc: 'Mroczna klątwa — fioletowa aura, statystyki osłabione.',
    icon: 'game-icons:evil-hand', category: 'Statusy', color: '#a855f7',
    async play() {
      mockCard.isCursed = true
      await later(2500)
      mockCard.isCursed = false
    }
  },
  {
    id: 'status-flash-paralyze', name: 'Flash: Paraliż', desc: 'Błysk nałożenia paraliżu — krótki flash efekt.',
    icon: 'game-icons:lightning-helix', category: 'Statusy', color: '#64748b',
    async play() {
      mockCard.statusFlash = 'paralyze'
      await later(1000)
      mockCard.statusFlash = null
    }
  },
  {
    id: 'status-flash-disease', name: 'Flash: Choroba', desc: 'Błysk nałożenia choroby — zielony flash.',
    icon: 'game-icons:biohazard', category: 'Statusy', color: '#16a34a',
    async play() {
      mockCard.statusFlash = 'disease'
      await later(1000)
      mockCard.statusFlash = null
    }
  },
  {
    id: 'status-flash-curse', name: 'Flash: Klątwa', desc: 'Błysk nałożenia klątwy — fioletowy flash.',
    icon: 'game-icons:voodoo-doll', category: 'Statusy', color: '#7c3aed',
    async play() {
      mockCard.statusFlash = 'curse'
      await later(1000)
      mockCard.statusFlash = null
    }
  },
  // AURY
  {
    id: 'aura-lifesteal', name: 'Aura: Wampiryzm', desc: 'Czerwona pulsująca poświata — istota kradnie życie.',
    icon: 'game-icons:bloody-stash', category: 'Aury', color: '#ef4444',
    async play() {
      mockCard.isLifestealer = true
      await later(3000)
      mockCard.isLifestealer = false
    }
  },
  {
    id: 'aura-death-feeder', name: 'Aura: Żywiciel śmierci', desc: 'Fioletowa pulsująca poświata — istota rośnie ze śmierci.',
    icon: 'game-icons:raise-zombie', category: 'Aury', color: '#a855f7',
    async play() {
      mockCard.isDeathFeeder = true
      await later(3500)
      mockCard.isDeathFeeder = false
    }
  },
  {
    id: 'aura-aoe', name: 'Aura: AoE zagrożenie', desc: 'Czerwona niebezpieczna poświata — istota atakuje wszystkich.',
    icon: 'game-icons:fire-ring', category: 'Aury', color: '#dc2626',
    async play() {
      mockCard.isAoE = true
      await later(3000)
      mockCard.isAoE = false
    }
  },
  // VFX entries removed — Drain, AoE, Conversion, Merge, EggHatch will be re-added after P3 VFXOrchestrator
  // SPECJALNE
  {
    id: 'homen-curse', name: 'Klątwa Homena', desc: 'Mroczna klątwa — zraniona istota po śmierci wstanie jako Homen.',
    icon: 'game-icons:raise-zombie', category: 'Specjalne', color: '#7c3aed',
    async play() {
      mockCard.isHomenCursed = true
      await later(2500)
      mockCard.isHomenCursed = false
    }
  },
  {
    id: 'homen-zombify', name: 'Homen: Wstanie', desc: 'Istota wstaje z martwych jako Homen — odwrócona animacja śmierci.',
    icon: 'game-icons:raise-zombie', category: 'Specjalne', color: '#a855f7',
    async play() {
      mockCard.isZombifying = true
      await later(1500)
      mockCard.isZombifying = false
    }
  },
  // GAME END
  {
    id: 'victory', name: 'Zwycięstwo', desc: 'Złota eksplozja i laurowy wieniec — wygrałeś bitwę!',
    icon: 'game-icons:laurel-crown', category: 'Koniec', color: '#fbbf24',
    async play() {
      sfx.sfxVictory()
      mockCard.isVictory = true
      await later(2000)
      mockCard.isVictory = false
    }
  },
  {
    id: 'defeat', name: 'Porażka', desc: 'Karta gaśnie i pęka — ponura porażka.',
    icon: 'game-icons:broken-skull', category: 'Koniec', color: '#64748b',
    async play() {
      sfx.sfxDefeat()
      mockCard.isDefeat = true
      await later(2000)
      mockCard.isDefeat = false
    }
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

      <!-- Tab switcher: P3 | Legacy -->
      <div class="showcase-tabs">
        <button :class="['stab', { active: p3Tab === 'p3' }]" @click="p3Tab = 'p3'">P3 Nowe</button>
        <button :class="['stab', { active: p3Tab === 'legacy' }]" @click="p3Tab = 'legacy'">Legacy</button>
      </div>

      <!-- P3 sidebar -->
      <div v-if="p3Tab === 'p3'" class="effect-list">
        <div class="cat-label">VFX Pipeline</div>
        <div
          :class="['effect-item', { active: activeEffectId === 'p3-dmg' }]"
          style="--ec: #ef4444"
          @click="activeEffectId = 'p3-dmg'; demoDamageNumber('showcase-source', 5, '#ef4444')"
        >
          <Icon icon="game-icons:drop" class="eff-icon" />
          <span class="eff-name">Damage Number</span>
        </div>
        <div
          :class="['effect-item', { active: activeEffectId === 'p3-counter' }]"
          style="--ec: #f59e0b"
          @click="activeEffectId = 'p3-counter'; demoDamageNumber('showcase-source', 3, '#f59e0b', 'kontra')"
        >
          <Icon icon="game-icons:crossed-swords" class="eff-icon" />
          <span class="eff-name">Counter Damage</span>
        </div>
        <div class="cat-label">Pory Roku</div>
        <div
          v-for="s in (['spring', 'summer', 'autumn', 'winter'] as const)"
          :key="s"
          :class="['effect-item', { active: p3ActiveSeason === s }]"
          :style="{ '--ec': { spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316', winter: '#60a5fa' }[s] }"
          @click="p3ActiveSeason = s"
        >
          <span class="eff-icon-text">{{ { spring: '🌸', summer: '☀', autumn: '🍂', winter: '❄' }[s] }}</span>
          <span class="eff-name">{{ { spring: 'Wiosna', summer: 'Lato', autumn: 'Jesień', winter: 'Zima' }[s] }}</span>
        </div>
      </div>

      <!-- Legacy sidebar -->
      <div v-if="p3Tab === 'legacy'" class="effect-list">
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

      <!-- ===== P3 STAGE: Seasons + Damage Numbers ===== -->
      <div v-if="p3Tab === 'p3'" class="p3-stage">
        <!-- Season panels — all 4 side by side -->
        <div class="p3-seasons-grid">
          <div
            v-for="s in (['spring', 'summer', 'autumn', 'winter'] as const)"
            :key="s"
            :class="['p3-season-panel', { 'p3-season-active': p3ActiveSeason === s }]"
            @click="p3ActiveSeason = s"
          >
            <div
              class="p3-season-bg"
              :class="`p3-bg-${s}`"
              :style="seasonBgMap[s] ? { backgroundImage: `url(${seasonBgMap[s]})` } : {}"
            >
              <WeatherEffects :season="s" />
            </div>
            <div class="p3-season-label">
              {{ { spring: '🌸 Wiosna', summer: '☀ Lato', autumn: '🍂 Jesień', winter: '❄ Zima' }[s] }}
            </div>
          </div>
        </div>

        <!-- Damage number demo card -->
        <div class="p3-damage-demo">
          <div class="p3-demo-title">Damage Numbers (GSAP + VFXOrchestrator)</div>
          <div class="p3-demo-row">
            <div class="p3-demo-card" data-instance-id="p3-demo-target">
              <div class="p3-dc-art">
                <Icon icon="game-icons:werewolf" class="p3-dc-icon" />
              </div>
              <div class="p3-dc-name">Cel ataku</div>
              <div class="p3-dc-stats"><span class="p3-atk">5</span>/<span class="p3-def">7</span></div>
            </div>
            <div class="p3-demo-buttons">
              <button class="p3-btn p3-btn-dmg" @click="demoDamageNumber('p3-demo-target', 3, '#ef4444')">
                -3 DMG
              </button>
              <button class="p3-btn p3-btn-crit" @click="demoDamageNumber('p3-demo-target', 7, '#dc2626')">
                -7 CRIT
              </button>
              <button class="p3-btn p3-btn-counter" @click="demoDamageNumber('p3-demo-target', 2, '#f59e0b', 'kontra')">
                -2 Kontra
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== LEGACY STAGE: Old showcase ===== -->
      <div v-if="p3Tab === 'legacy'" class="mock-stage">
        <div class="stage-bg" />

        <!-- The mock creature card visualization -->
        <div class="mock-card-row">
        <div
          data-instance-id="showcase-source"
          :class="['mock-card', {
            'mock-attacking': mockCard.isAttacking,
            'mock-hit': mockCard.isHit,
            'mock-dying': mockCard.isDying,
            'mock-paralyzed': mockCard.isParalyzed,
            'mock-diseased': mockCard.isDiseased,
            'mock-cursed': mockCard.isCursed,
            'mock-lifestealer': mockCard.isLifestealer,
            'mock-death-feeder': mockCard.isDeathFeeder,
            'mock-aoe-aura': mockCard.isAoE,
            'mock-homen-cursed': mockCard.isHomenCursed,
            'mock-zombifying': mockCard.isZombifying,
            'mock-card-play': mockCard.isCardPlay,
            'mock-draw': mockCard.isDraw,
            'mock-phase-change': mockCard.isPhaseChange,
            'mock-gold-flash': mockCard.isGoldFlash,
            'mock-adventure': mockCard.isAdventure,
            'mock-activate': mockCard.isActivate,
            'mock-season-change': mockCard.isSeasonChange,
            'mock-victory': mockCard.isVictory,
            'mock-defeat': mockCard.isDefeat,
            [`mock-status-flash-${mockCard.statusFlash}`]: !!mockCard.statusFlash,
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

          <!-- Paralyze overlay -->
          <div v-if="mockCard.isParalyzed" class="mock-status-overlay paralyze-overlay">
            <Icon icon="game-icons:frozen-body" class="status-icon" />
            <span>PARALIŻ</span>
          </div>

          <!-- Disease overlay -->
          <div v-if="mockCard.isDiseased" class="mock-status-overlay disease-overlay">
            <Icon icon="game-icons:death-juice" class="status-icon" />
            <span>CHOROBA</span>
          </div>

          <!-- Curse overlay -->
          <div v-if="mockCard.isCursed" class="mock-status-overlay curse-overlay">
            <Icon icon="game-icons:evil-hand" class="status-icon" />
            <span>KLĄTWA</span>
          </div>

          <!-- HIT VFX overlay -->
          <div v-if="mockCard.isHit" class="mock-hit-vfx">
            <!-- MELEE: triple slash + blood + sparks -->
            <template v-if="mockCard.attackType === 0 || mockCard.attackType === null">
              <svg viewBox="0 0 110 154" class="slash-svg">
                <line x1="8" y1="145" x2="102" y2="10" class="slash-line slash-main" />
                <line x1="88" y1="145" x2="22" y2="35" class="slash-line slash-cross" />
                <line x1="55" y1="150" x2="55" y2="5" class="slash-line slash-vert" />
              </svg>
              <div class="melee-scar scar-1" />
              <div class="melee-scar scar-2" />
              <div class="melee-sparks" v-for="n in 6" :key="'ms'+n" :style="{ '--si': n }" />
              <div class="melee-blood-splat" />
            </template>
            <!-- ELEMENTAL: glow overlay (3D fire handled by TresJS FireVFX) -->
            <template v-if="mockCard.attackType === 1">
              <div class="fire-engulf" />
            </template>
            <!-- MAGIC: rune circle + sparkles + rings -->
            <template v-if="mockCard.attackType === 2">
              <div class="magic-circle" />
              <div class="magic-rune" v-for="n in 6" :key="'mr'+n" :style="{ '--ri': n }" />
              <div class="magic-spiral" />
              <div class="magic-sparkle" v-for="n in 12" :key="'mp'+n" :style="{ '--mi': n }" />
              <div class="magic-ring" />
              <div class="magic-ring magic-ring-2" />
            </template>
            <!-- RANGED: arrow + trail + impact crater -->
            <template v-if="mockCard.attackType === 3">
              <div class="arrow-body">
                <div class="arrow-shaft" />
                <div class="arrow-head" />
                <div class="arrow-fletching" />
              </div>
              <div class="arrow-trail" v-for="n in 5" :key="'at'+n" :style="{ '--ti': n }" />
              <div class="arrow-impact-crater" />
              <div class="arrow-splinter" v-for="n in 4" :key="'as'+n" :style="{ '--si': n }" />
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

          <!-- UI VFX: Card Play — drop glow -->
          <div v-if="mockCard.isCardPlay" class="ui-vfx-overlay card-play-vfx">
            <div class="card-play-glow" />
            <div class="card-play-ring" />
          </div>

          <!-- UI VFX: Draw — slide shimmer -->
          <div v-if="mockCard.isDraw" class="ui-vfx-overlay draw-vfx">
            <div class="draw-shimmer" />
          </div>

          <!-- UI VFX: Phase Change — expanding rings -->
          <div v-if="mockCard.isPhaseChange" class="ui-vfx-overlay phase-vfx">
            <div class="phase-ring phase-ring-1" />
            <div class="phase-ring phase-ring-2" />
            <div class="phase-ring phase-ring-3" />
          </div>

          <!-- UI VFX: Gold — flying coins -->
          <div v-if="mockCard.isGoldFlash" class="ui-vfx-overlay gold-vfx">
            <div v-for="n in 8" :key="'gc'+n" class="gold-coin" :style="{ '--gi': n }">●</div>
            <div class="gold-burst" />
          </div>

          <!-- UI VFX: Adventure — parchment glow + runes -->
          <div v-if="mockCard.isAdventure" class="ui-vfx-overlay adventure-vfx">
            <div class="adventure-glow" />
            <div v-for="n in 5" :key="'ar'+n" class="adventure-rune" :style="{ '--ai': n }">✦</div>
          </div>

          <!-- UI VFX: Activate — electric burst -->
          <div v-if="mockCard.isActivate" class="ui-vfx-overlay activate-vfx">
            <div v-for="n in 6" :key="'ab'+n" class="activate-bolt" :style="{ '--bi': n }" />
            <div class="activate-core" />
            <div class="activate-ring" />
          </div>

          <!-- UI VFX: Season Change — color wash -->
          <div v-if="mockCard.isSeasonChange" class="ui-vfx-overlay season-vfx">
            <div class="season-wash" />
          </div>

          <!-- UI VFX: Victory — golden explosion -->
          <div v-if="mockCard.isVictory" class="ui-vfx-overlay victory-vfx">
            <div v-for="n in 10" :key="'vs'+n" class="victory-spark" :style="{ '--vi': n }" />
            <div class="victory-crown">👑</div>
            <div class="victory-ring" />
          </div>

          <!-- UI VFX: Defeat — crack + fade -->
          <div v-if="mockCard.isDefeat" class="ui-vfx-overlay defeat-vfx">
            <div class="defeat-crack" />
            <div class="defeat-crack defeat-crack-2" />
            <div class="defeat-fog" />
          </div>

          <!-- TresJS 3D fire for elemental hit -->
          <ClientOnly>
            <FireVFX :active="mockCard.isHit && mockCard.attackType === 1" :intensity="0.85" />
          </ClientOnly>
        </div>

        <!-- Second mock card (drain target) -->
        <div data-instance-id="showcase-target" class="mock-card mock-card-target">
          <div class="mc-art">
            <Icon icon="game-icons:imp" class="mc-creature-icon" />
          </div>
          <div class="mc-name">Ofiara</div>
          <div class="mc-stats">
            <span class="mc-atk">3</span>
            <span class="mc-sep">/</span>
            <span class="mc-def">4</span>
          </div>
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
    <!-- VFX overlay components (needed for drain/aoe/egg demos) -->
    <DrainParticles />
    <AoEWave />
    <EggHatchVFX />
    <ConversionSlideVFX />
    <GorynychMergeVFX />
    <ClientOnly><VFXOverlay /></ClientOnly>
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
  transition: color 0.15s, border-color 0.15s;
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
  transition: background-color 0.12s, border-left-color 0.12s, color 0.12s;
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
  font-weight: 500;
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
  font-weight: 500;
}

.mc-atk { color: #f87171; }
.mc-sep { color: #475569; font-size: 14px; }
.mc-def { color: #60a5fa; }

/* ===== HIT VFX (synced with CreatureCard) ===== */
.mock-hit-vfx {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  overflow: hidden;
  border-radius: 10px;
}

/* === MELEE: triple slash + blood + scars + sparks === */
.slash-svg { width: 100%; height: 100%; position: absolute; inset: 0; }
.slash-line {
  stroke-linecap: round;
  stroke-dasharray: 200; stroke-dashoffset: 200;
}
.slash-main {
  stroke: #fff; stroke-width: 3.5;
  filter: drop-shadow(0 0 8px #ef4444) drop-shadow(0 0 3px #fff);
  animation: slash-draw 0.35s ease-out forwards;
}
.slash-cross {
  stroke: #fca5a5; stroke-width: 2.5;
  filter: drop-shadow(0 0 5px #dc2626);
  animation: slash-draw 0.35s ease-out 0.08s forwards;
}
.slash-vert {
  stroke: #fbbf24; stroke-width: 2;
  filter: drop-shadow(0 0 6px #f97316);
  animation: slash-draw 0.3s ease-out 0.18s forwards;
}
@keyframes slash-draw {
  0%   { stroke-dashoffset: 200; opacity: 0; }
  15%  { opacity: 1; }
  70%  { stroke-dashoffset: 0; opacity: 0.9; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
.melee-scar {
  position: absolute; height: 2px; border-radius: 1px;
  background: linear-gradient(90deg, transparent, rgba(239,68,68,0.6), rgba(220,38,38,0.8), rgba(239,68,68,0.6), transparent);
  opacity: 0;
}
.scar-1 { top: 30%; left: 10%; right: 15%; transform: rotate(-35deg); animation: scar-appear 0.5s ease-out 0.25s forwards; }
.scar-2 { top: 55%; left: 15%; right: 10%; transform: rotate(20deg); animation: scar-appear 0.5s ease-out 0.35s forwards; }
@keyframes scar-appear { 0% { opacity: 0; } 40% { opacity: 1; } 100% { opacity: 0.5; } }
.melee-sparks {
  position: absolute; width: 3px; height: 3px; border-radius: 50%;
  background: #fbbf24; box-shadow: 0 0 4px #fbbf24;
  top: calc(20% + var(--si) * 10%); left: calc(15% + var(--si) * 12%);
  opacity: 0; animation: spark-fly 0.4s ease-out forwards;
  animation-delay: calc(0.05s + var(--si) * 0.04s);
}
@keyframes spark-fly {
  0%   { opacity: 0; transform: translate(0,0) scale(0.5); }
  20%  { opacity: 1; transform: translate(calc((var(--si) - 3) * 8px), calc(-10px - var(--si) * 5px)) scale(1.5); }
  100% { opacity: 0; transform: translate(calc((var(--si) - 3) * 15px), calc(-25px - var(--si) * 8px)) scale(0); }
}
.melee-blood-splat {
  position: absolute; inset: 0; border-radius: 10px;
  background: radial-gradient(ellipse at 40% 45%, rgba(180,20,20,0.35) 0%, transparent 50%);
  opacity: 0; animation: blood-flash 0.6s ease-out 0.1s forwards;
}
@keyframes blood-flash { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0; } }

/* === ELEMENTAL: realistic fire wrapping around card === */
.fire-engulf {
  position: absolute; inset: -8px; border-radius: 14px;
  background:
    radial-gradient(ellipse 120% 60% at 50% 100%, rgba(251,146,60,0.7) 0%, rgba(239,68,68,0.4) 30%, transparent 55%),
    radial-gradient(ellipse 80% 40% at 50% 0%, rgba(239,68,68,0.3) 0%, transparent 50%),
    radial-gradient(ellipse 40% 80% at 0% 50%, rgba(251,146,60,0.2) 0%, transparent 50%),
    radial-gradient(ellipse 40% 80% at 100% 50%, rgba(251,146,60,0.2) 0%, transparent 50%);
  animation: sc-fire-engulf 1.2s ease-out forwards;
}
@keyframes sc-fire-engulf {
  0% { opacity: 0; } 10% { opacity: 0.6; } 30% { opacity: 1; } 70% { opacity: 0.8; } 100% { opacity: 0; }
}

/* Fire tongues, sparks, inner glow — REMOVED (TresJS FireVFX handles 3D fire) */

/* === MAGIC: rune circle + spiral + sparkles + dual rings === */
.magic-circle {
  position: absolute; top: 50%; left: 50%;
  width: 80px; height: 80px; margin: -40px 0 0 -40px;
  border: 1.5px solid rgba(168,85,247,0.6); border-radius: 50%;
  opacity: 0; animation: magic-circle-spin 0.8s ease-out forwards;
}
@keyframes magic-circle-spin {
  0%   { opacity: 0; transform: scale(0.2) rotate(0deg); }
  20%  { opacity: 0.8; transform: scale(0.8) rotate(60deg); }
  100% { opacity: 0; transform: scale(1.3) rotate(360deg); }
}
.magic-rune {
  position: absolute; top: 50%; left: 50%;
  width: 8px; height: 8px; margin: -4px 0 0 -4px;
  font-size: 12px; color: #c084fc; text-shadow: 0 0 6px #a855f7;
  opacity: 0; --rune-angle: calc(var(--ri) * 60deg);
  animation: rune-orbit 0.7s ease-out forwards;
  animation-delay: calc(var(--ri) * 0.06s);
}
.magic-rune::after { content: '✦'; display: block; }
@keyframes rune-orbit {
  0%   { opacity: 0; transform: translate(0,0) scale(0); }
  25%  { opacity: 1; transform: translate(calc(cos(var(--rune-angle)) * 30px), calc(sin(var(--rune-angle)) * 30px)) scale(1.5); }
  60%  { opacity: 0.7; transform: translate(calc(cos(var(--rune-angle)) * 35px), calc(sin(var(--rune-angle)) * 35px)) rotate(180deg); }
  100% { opacity: 0; transform: translate(calc(cos(var(--rune-angle)) * 10px), calc(sin(var(--rune-angle)) * 10px)) rotate(360deg) scale(0.3); }
}
.magic-spiral {
  position: absolute; top: 50%; left: 50%;
  width: 4px; height: 4px; margin: -2px 0 0 -2px;
  border-radius: 50%; background: #e9d5ff;
  box-shadow: 0 0 12px #a855f7, 0 0 24px rgba(168,85,247,0.4);
  opacity: 0; animation: spiral-pulse 0.6s ease-out forwards;
}
@keyframes spiral-pulse {
  0% { opacity: 0; transform: scale(0); }  30% { opacity: 1; transform: scale(3); }
  60% { opacity: 0.8; transform: scale(1.5); }  100% { opacity: 0; transform: scale(8); }
}
.magic-sparkle {
  position: absolute; width: 3px; height: 3px; border-radius: 50%;
  background: #e9d5ff; box-shadow: 0 0 4px #c084fc, 0 0 10px rgba(168,85,247,0.6);
  top: 50%; left: 50%; opacity: 0;
  --angle: calc(var(--mi) * 30deg);
  animation: magic-burst 0.6s ease-out forwards;
  animation-delay: calc(var(--mi) * 0.04s);
}
@keyframes magic-burst {
  0% { opacity: 0; transform: translate(0,0) scale(0); }
  25% { opacity: 1; transform: translate(calc(cos(var(--angle)) * 15px), calc(sin(var(--angle)) * 15px)) scale(1.8); }
  60% { opacity: 0.7; transform: translate(calc(cos(var(--angle)) * 35px), calc(sin(var(--angle)) * 35px)) scale(1); }
  100% { opacity: 0; transform: translate(calc(cos(var(--angle)) * 50px), calc(sin(var(--angle)) * 50px)) scale(0); }
}
.magic-ring {
  position: absolute; top: 50%; left: 50%;
  width: 16px; height: 16px; margin: -8px 0 0 -8px;
  border: 2px solid rgba(168,85,247,0.7); border-radius: 50%;
  box-shadow: 0 0 8px rgba(168,85,247,0.4);
  opacity: 0; animation: magic-ring-expand 0.6s ease-out forwards;
}
.magic-ring-2 { border-color: rgba(139,92,246,0.4); animation-delay: 0.15s; }
@keyframes magic-ring-expand {
  0% { opacity: 0; transform: scale(0.2); border-width: 3px; }
  25% { opacity: 1; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(7); border-width: 0.5px; }
}

/* === RANGED: arrow with fletching + trail + impact crater === */
.arrow-body {
  position: absolute; top: 50%; left: -20px;
  width: 60px; height: 6px; transform: translateY(-50%);
  animation: arrow-fly-full 0.35s ease-out forwards;
}
.arrow-shaft {
  position: absolute; top: 50%; left: 10px; right: 12px;
  height: 2px; margin-top: -1px;
  background: linear-gradient(90deg, rgba(139,92,246,0.2), #94a3b8, #cbd5e1);
  border-radius: 1px;
}
.arrow-head {
  position: absolute; right: 0; top: 50%; margin-top: -5px;
  width: 0; height: 0;
  border-left: 10px solid #e2e8f0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  filter: drop-shadow(0 0 3px rgba(59,130,246,0.6));
}
.arrow-fletching {
  position: absolute; left: 0; top: 50%; margin-top: -4px;
  width: 12px; height: 8px;
  background: linear-gradient(90deg, #dc2626, #b91c1c);
  clip-path: polygon(0% 0%, 100% 25%, 100% 75%, 0% 100%, 30% 50%);
}
@keyframes arrow-fly-full {
  0% { left: -40px; opacity: 0; }  15% { opacity: 1; }  60% { left: 35%; opacity: 1; }  100% { left: 55%; opacity: 0; }
}
.arrow-trail {
  position: absolute; top: 50%; height: 1.5px; margin-top: -0.75px;
  width: 20px; background: linear-gradient(90deg, transparent, rgba(59,130,246,0.5), transparent);
  left: calc(-10px + var(--ti) * 10px);
  opacity: 0; animation: trail-fade 0.3s ease-out forwards;
  animation-delay: calc(var(--ti) * 0.04s);
}
@keyframes trail-fade {
  0% { opacity: 0; transform: translateX(-10px); }  30% { opacity: 0.6; transform: translateX(20px); }  100% { opacity: 0; transform: translateX(70px); }
}
.arrow-impact-crater {
  position: absolute; top: 50%; right: 20%;
  width: 18px; height: 18px; margin-top: -9px; border-radius: 50%;
  background: radial-gradient(circle, rgba(59,130,246,0.6) 0%, transparent 70%);
  box-shadow: 0 0 12px rgba(59,130,246,0.4);
  opacity: 0; animation: crater-burst 0.5s ease-out 0.25s forwards;
}
@keyframes crater-burst {
  0% { opacity: 0; transform: scale(0.2); }  30% { opacity: 1; transform: scale(1.8); }  100% { opacity: 0; transform: scale(2.5); }
}
.arrow-splinter {
  position: absolute; top: 50%; right: calc(18% + var(--si) * 3%);
  width: 6px; height: 1.5px; background: #94a3b8; border-radius: 1px;
  opacity: 0; --sp-angle: calc(var(--si) * 90deg - 135deg);
  animation: splinter-fly 0.35s ease-out 0.28s forwards;
}
@keyframes splinter-fly {
  0% { opacity: 0; transform: translate(0,0) rotate(0deg); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(cos(var(--sp-angle)) * 20px), calc(sin(var(--sp-angle)) * 20px)) rotate(calc(var(--si) * 45deg)) scale(0.3); }
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

/* ===== Mock card row (source + target side by side) ===== */
.mock-card-row {
  display: flex;
  align-items: center;
  gap: 60px;
}

.mock-card-target {
  opacity: 0.5;
  transform: scale(0.85);
  transition: opacity 0.3s;
}

/* ===== STATUS OVERLAYS ===== */
.mock-paralyzed {
  filter: saturate(0.15) brightness(0.7);
  animation: mock-paralyze-pulse 2.5s ease-in-out infinite;
}
@keyframes mock-paralyze-pulse {
  0%, 100% { filter: saturate(0.15) brightness(0.7); }
  50% { filter: saturate(0.1) brightness(0.55); }
}

.mock-diseased {
  filter: hue-rotate(80deg) saturate(1.3) brightness(0.85);
}

.mock-cursed {
  filter: hue-rotate(260deg) saturate(1.4) brightness(0.75);
  animation: mock-curse-pulse 3s ease-in-out infinite;
}
@keyframes mock-curse-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(168,85,247,0.4); }
  50% { box-shadow: 0 0 24px rgba(168,85,247,0.7), inset 0 0 12px rgba(168,85,247,0.2); }
}

.mock-status-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 10px;
  pointer-events: none;
  animation: overlay-in 0.3s ease-out;
}
.mock-status-overlay .status-icon {
  font-size: 36px;
}
.mock-status-overlay span {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.15em;
  padding: 2px 10px;
  border-radius: 4px;
}

.paralyze-overlay {
  background: rgba(80, 80, 100, 0.6);
  color: #cbd5e1;
}
.paralyze-overlay .status-icon { color: #94a3b8; }
.paralyze-overlay span { background: rgba(50, 50, 70, 0.9); color: #cbd5e1; }

.disease-overlay {
  background: rgba(20, 80, 30, 0.5);
  color: #4ade80;
}
.disease-overlay .status-icon { color: #22c55e; }
.disease-overlay span { background: rgba(10, 60, 20, 0.9); color: #4ade80; }

.curse-overlay {
  background: rgba(60, 20, 100, 0.5);
  color: #c084fc;
}
.curse-overlay .status-icon { color: #a855f7; }
.curse-overlay span { background: rgba(40, 10, 80, 0.9); color: #c084fc; }

/* ===== AURA GLOWS ===== */
.mock-lifestealer {
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.4), 0 0 24px rgba(239, 68, 68, 0.2);
  animation: mock-lifesteal-pulse 2.5s ease-in-out infinite;
}
@keyframes mock-lifesteal-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.4), 0 0 24px rgba(239, 68, 68, 0.2); }
  50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.7), 0 0 40px rgba(239, 68, 68, 0.3); }
}

.mock-death-feeder {
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.4), 0 0 24px rgba(168, 85, 247, 0.2);
  animation: mock-death-feeder-pulse 3s ease-in-out infinite;
}
@keyframes mock-death-feeder-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.4), 0 0 24px rgba(168, 85, 247, 0.2); }
  50% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.7), 0 0 40px rgba(168, 85, 247, 0.3); }
}

.mock-aoe-aura {
  box-shadow: 0 0 12px rgba(220, 38, 38, 0.4), 0 0 24px rgba(220, 38, 38, 0.2);
  animation: mock-aoe-pulse 2s ease-in-out infinite;
}
@keyframes mock-aoe-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(220, 38, 38, 0.4), 0 0 24px rgba(220, 38, 38, 0.2); }
  50% { box-shadow: 0 0 24px rgba(220, 38, 38, 0.7), 0 0 48px rgba(220, 38, 38, 0.35); }
}

/* ===== STATUS FLASH ===== */
.mock-status-flash-paralyze {
  animation: sf-paralyze 0.8s ease-out;
}
.mock-status-flash-disease {
  animation: sf-disease 0.8s ease-out;
}
.mock-status-flash-curse {
  animation: sf-curse 0.8s ease-out;
}

@keyframes sf-paralyze {
  0% { box-shadow: none; }
  20% { box-shadow: 0 0 30px rgba(148, 163, 184, 0.9), inset 0 0 20px rgba(148, 163, 184, 0.4); }
  100% { box-shadow: none; }
}
@keyframes sf-disease {
  0% { box-shadow: none; }
  20% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.9), inset 0 0 20px rgba(34, 197, 94, 0.4); }
  100% { box-shadow: none; }
}
@keyframes sf-curse {
  0% { box-shadow: none; }
  20% { box-shadow: 0 0 30px rgba(168, 85, 247, 0.9), inset 0 0 20px rgba(168, 85, 247, 0.4); }
  100% { box-shadow: none; }
}

/* ===== HOMEN CURSE + ZOMBIFY ===== */
.mock-homen-cursed {
  box-shadow: 0 0 8px 3px rgba(107, 33, 168, 0.4), 0 0 16px 6px rgba(107, 33, 168, 0.2);
  animation: mock-homen-pulse 2s ease-in-out infinite;
}
@keyframes mock-homen-pulse {
  0%, 100% { box-shadow: 0 0 8px 3px rgba(107, 33, 168, 0.4); }
  50% { box-shadow: 0 0 16px 6px rgba(107, 33, 168, 0.7), 0 0 32px 10px rgba(107, 33, 168, 0.25); }
}

.mock-zombifying {
  animation: mock-zombify-rise 1.2s ease-out !important;
}
@keyframes mock-zombify-rise {
  0%   { transform: translateY(40px) scale(0.5); opacity: 0; filter: hue-rotate(180deg) saturate(0.3) brightness(0.4); }
  30%  { transform: translateY(10px) scale(0.9); opacity: 0.7; }
  60%  { transform: translateY(-5px) scale(1.05); opacity: 1; filter: hue-rotate(180deg) saturate(0.6) brightness(0.8); }
  80%  { transform: translateY(2px) scale(0.98); }
  100% { transform: translateY(0) scale(1); opacity: 1; filter: none; }
}

/* ===== UI VFX OVERLAYS ===== */
.ui-vfx-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  overflow: hidden;
  border-radius: 10px;
}

/* — Card Play: drop + glow — */
.mock-card-play {
  animation: card-play-drop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes card-play-drop {
  0%   { transform: translateY(-60px) scale(0.7); opacity: 0; }
  40%  { transform: translateY(8px) scale(1.05); opacity: 1; }
  60%  { transform: translateY(-4px) scale(0.98); }
  80%  { transform: translateY(2px) scale(1.01); }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.card-play-glow {
  position: absolute; inset: -4px; border-radius: 14px;
  background: radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.5) 0%, transparent 60%);
  animation: card-play-glow-fade 0.7s ease-out forwards;
}
@keyframes card-play-glow-fade {
  0%   { opacity: 0; }
  30%  { opacity: 1; }
  100% { opacity: 0; }
}
.card-play-ring {
  position: absolute; bottom: -10px; left: 50%; width: 120px; height: 30px;
  margin-left: -60px; border-radius: 50%;
  border: 2px solid rgba(52,211,153,0.6);
  animation: card-play-ring-expand 0.6s ease-out 0.15s forwards; opacity: 0;
}
@keyframes card-play-ring-expand {
  0%   { opacity: 0; transform: scaleX(0.3) scaleY(0.3); }
  30%  { opacity: 0.8; }
  100% { opacity: 0; transform: scaleX(1.5) scaleY(1); }
}

/* — Draw: slide in from right + shimmer — */
.mock-draw {
  animation: draw-slide 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes draw-slide {
  0%   { transform: translateX(100px) rotate(8deg); opacity: 0; }
  50%  { transform: translateX(-8px) rotate(-1deg); opacity: 1; }
  100% { transform: translateX(0) rotate(0); opacity: 1; }
}
.draw-shimmer {
  position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
  background: linear-gradient(
    105deg, transparent 30%, rgba(52,211,153,0.25) 45%,
    rgba(255,255,255,0.15) 50%, rgba(52,211,153,0.25) 55%, transparent 70%
  );
  animation: draw-shimmer-move 0.6s ease-out forwards;
}
@keyframes draw-shimmer-move {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* — Phase Change: expanding golden rings — */
.mock-phase-change {
  animation: phase-pulse 0.8s ease-out;
}
@keyframes phase-pulse {
  0%   { box-shadow: 0 0 0 rgba(165,180,252,0); }
  30%  { box-shadow: 0 0 20px rgba(165,180,252,0.6), inset 0 0 10px rgba(165,180,252,0.2); }
  100% { box-shadow: 0 0 0 rgba(165,180,252,0); }
}
.phase-ring {
  position: absolute; top: 50%; left: 50%;
  width: 20px; height: 20px; margin: -10px 0 0 -10px;
  border-radius: 50%;
  border: 2px solid rgba(165,180,252,0.7);
  box-shadow: 0 0 8px rgba(165,180,252,0.3);
  opacity: 0;
}
.phase-ring-1 { animation: phase-ring-expand 0.8s ease-out forwards; }
.phase-ring-2 { animation: phase-ring-expand 0.8s ease-out 0.15s forwards; }
.phase-ring-3 { animation: phase-ring-expand 0.8s ease-out 0.3s forwards; }
@keyframes phase-ring-expand {
  0%   { opacity: 0; transform: scale(0.3); }
  20%  { opacity: 0.9; }
  100% { opacity: 0; transform: scale(6); border-width: 0.5px; }
}

/* — Gold: flying coins + burst — */
.mock-gold-flash {
  animation: gold-shimmer 0.8s ease-out;
}
@keyframes gold-shimmer {
  0%   { box-shadow: 0 0 0 rgba(251,191,36,0); }
  25%  { box-shadow: 0 0 24px rgba(251,191,36,0.6), inset 0 0 12px rgba(251,191,36,0.15); }
  100% { box-shadow: 0 0 0 rgba(251,191,36,0); }
}
.gold-coin {
  position: absolute;
  font-size: 12px; color: #fbbf24;
  text-shadow: 0 0 6px rgba(251,191,36,0.8), 0 0 2px #fff;
  top: 50%; left: 50%;
  opacity: 0;
  --angle: calc(var(--gi) * 45deg);
  animation: gold-coin-fly 0.8s ease-out forwards;
  animation-delay: calc(var(--gi) * 0.04s);
}
@keyframes gold-coin-fly {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.3); }
  20%  { opacity: 1; transform: translate(calc(cos(var(--angle)) * 15px), calc(sin(var(--angle)) * 15px)) scale(1.3); }
  60%  { opacity: 0.8; transform: translate(calc(cos(var(--angle)) * 40px), calc(sin(var(--angle)) * 40px)) scale(1); }
  100% { opacity: 0; transform: translate(calc(cos(var(--angle)) * 55px), calc(sin(var(--angle)) * 55px)) scale(0.4); }
}
.gold-burst {
  position: absolute; inset: 0; border-radius: 10px;
  background: radial-gradient(circle at center, rgba(251,191,36,0.4) 0%, transparent 50%);
  animation: gold-burst-flash 0.5s ease-out forwards;
}
@keyframes gold-burst-flash {
  0%   { opacity: 0; transform: scale(0.5); }
  25%  { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0; transform: scale(1.3); }
}

/* — Adventure: parchment glow + rune particles — */
.mock-adventure {
  animation: adventure-glow-card 0.9s ease-out;
}
@keyframes adventure-glow-card {
  0%   { box-shadow: 0 0 0 rgba(200,168,78,0); filter: brightness(1); }
  20%  { box-shadow: 0 0 20px rgba(200,168,78,0.5), 0 0 40px rgba(200,168,78,0.2); filter: brightness(1.15); }
  100% { box-shadow: 0 0 0 rgba(200,168,78,0); filter: brightness(1); }
}
.adventure-glow {
  position: absolute; inset: 0; border-radius: 10px;
  background: linear-gradient(180deg, rgba(200,168,78,0.15) 0%, rgba(200,168,78,0.3) 50%, rgba(200,168,78,0.1) 100%);
  animation: adventure-glow-fade 0.9s ease-out forwards;
}
@keyframes adventure-glow-fade {
  0%   { opacity: 0; }
  25%  { opacity: 1; }
  100% { opacity: 0; }
}
.adventure-rune {
  position: absolute;
  font-size: 14px; color: #c8a84e;
  text-shadow: 0 0 8px rgba(200,168,78,0.8);
  top: calc(15% + var(--ai) * 14%);
  left: calc(10% + var(--ai) * 15%);
  opacity: 0;
  animation: adventure-rune-float 0.8s ease-out forwards;
  animation-delay: calc(var(--ai) * 0.1s);
}
@keyframes adventure-rune-float {
  0%   { opacity: 0; transform: translateY(10px) scale(0.3) rotate(0deg); }
  30%  { opacity: 1; transform: translateY(0) scale(1.2) rotate(30deg); }
  60%  { opacity: 0.8; transform: translateY(-10px) scale(1) rotate(60deg); }
  100% { opacity: 0; transform: translateY(-25px) scale(0.5) rotate(90deg); }
}

/* — Activate: electric burst — */
.mock-activate {
  animation: activate-pulse 0.9s ease-out;
}
@keyframes activate-pulse {
  0%   { box-shadow: 0 0 0 rgba(168,85,247,0); }
  15%  { box-shadow: 0 0 30px rgba(168,85,247,0.8), inset 0 0 15px rgba(168,85,247,0.3); }
  40%  { box-shadow: 0 0 15px rgba(168,85,247,0.4); }
  100% { box-shadow: 0 0 0 rgba(168,85,247,0); }
}
.activate-bolt {
  position: absolute;
  width: 2px; height: 30px;
  background: linear-gradient(to bottom, rgba(168,85,247,0.9), rgba(139,92,246,0.4), transparent);
  top: 50%; left: 50%;
  transform-origin: center top;
  --bolt-angle: calc(var(--bi) * 60deg);
  transform: rotate(var(--bolt-angle));
  opacity: 0;
  animation: bolt-flash 0.4s ease-out forwards;
  animation-delay: calc(var(--bi) * 0.05s);
  box-shadow: 0 0 6px rgba(168,85,247,0.6);
}
@keyframes bolt-flash {
  0%   { opacity: 0; height: 5px; }
  20%  { opacity: 1; height: 40px; }
  50%  { opacity: 0.8; height: 50px; }
  100% { opacity: 0; height: 60px; }
}
.activate-core {
  position: absolute; top: 50%; left: 50%;
  width: 12px; height: 12px; margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: radial-gradient(circle, #e9d5ff 0%, #a855f7 50%, transparent 70%);
  box-shadow: 0 0 20px rgba(168,85,247,0.8), 0 0 40px rgba(168,85,247,0.4);
  animation: activate-core-pulse 0.7s ease-out forwards;
}
@keyframes activate-core-pulse {
  0%   { opacity: 0; transform: scale(0); }
  25%  { opacity: 1; transform: scale(2); }
  50%  { opacity: 0.8; transform: scale(1.5); }
  100% { opacity: 0; transform: scale(3); }
}
.activate-ring {
  position: absolute; top: 50%; left: 50%;
  width: 20px; height: 20px; margin: -10px 0 0 -10px;
  border: 2px solid rgba(168,85,247,0.7);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(168,85,247,0.4);
  opacity: 0;
  animation: activate-ring-expand 0.8s ease-out 0.1s forwards;
}
@keyframes activate-ring-expand {
  0%   { opacity: 0; transform: scale(0.2); }
  20%  { opacity: 1; }
  100% { opacity: 0; transform: scale(5); border-width: 0.5px; }
}

/* — Season Change: flowing color wash — */
.mock-season-change {
  animation: season-border-cycle 1.8s ease-in-out;
}
@keyframes season-border-cycle {
  0%   { border-color: rgba(52,211,153,0.6); }   /* wiosna – zielony */
  25%  { border-color: rgba(251,191,36,0.6); }   /* lato – złoty */
  50%  { border-color: rgba(249,115,22,0.6); }   /* jesień – pomarańcz */
  75%  { border-color: rgba(96,165,250,0.6); }   /* zima – niebieski */
  100% { border-color: rgba(200,168,78,0.2); }   /* powrót */
}
.season-wash {
  position: absolute; inset: 0; border-radius: 10px;
  animation: season-wash-cycle 1.8s ease-in-out forwards;
}
@keyframes season-wash-cycle {
  0%   { background: rgba(52,211,153,0.2); opacity: 0; }
  5%   { opacity: 1; }
  25%  { background: rgba(251,191,36,0.2); }
  50%  { background: rgba(249,115,22,0.2); }
  75%  { background: rgba(96,165,250,0.2); }
  95%  { opacity: 1; }
  100% { background: rgba(52,211,153,0.1); opacity: 0; }
}

/* — Victory: golden explosion + crown — */
.mock-victory {
  animation: victory-glow 1.8s ease-out;
}
@keyframes victory-glow {
  0%   { box-shadow: 0 0 0 rgba(251,191,36,0); filter: brightness(1); }
  15%  { box-shadow: 0 0 40px rgba(251,191,36,0.8), 0 0 80px rgba(251,191,36,0.3); filter: brightness(1.3); }
  40%  { box-shadow: 0 0 25px rgba(251,191,36,0.5); filter: brightness(1.15); }
  100% { box-shadow: 0 0 0 rgba(251,191,36,0); filter: brightness(1); }
}
.victory-spark {
  position: absolute;
  width: 4px; height: 4px; border-radius: 50%;
  background: #fbbf24; box-shadow: 0 0 6px #fbbf24, 0 0 12px rgba(251,191,36,0.5);
  top: 50%; left: 50%;
  --vs-angle: calc(var(--vi) * 36deg);
  opacity: 0;
  animation: victory-spark-fly 1s ease-out forwards;
  animation-delay: calc(var(--vi) * 0.04s);
}
@keyframes victory-spark-fly {
  0%   { opacity: 0; transform: translate(0, 0) scale(0); }
  15%  { opacity: 1; transform: translate(calc(cos(var(--vs-angle)) * 20px), calc(sin(var(--vs-angle)) * 20px)) scale(1.8); }
  50%  { opacity: 0.8; transform: translate(calc(cos(var(--vs-angle)) * 50px), calc(sin(var(--vs-angle)) * 50px)) scale(1); }
  100% { opacity: 0; transform: translate(calc(cos(var(--vs-angle)) * 70px), calc(sin(var(--vs-angle)) * 70px)) scale(0); }
}
.victory-crown {
  position: absolute; top: 15%; left: 50%; transform: translateX(-50%);
  font-size: 36px;
  opacity: 0;
  animation: victory-crown-drop 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  filter: drop-shadow(0 0 8px rgba(251,191,36,0.8));
}
@keyframes victory-crown-drop {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-30px) scale(0.3); }
  30%  { opacity: 1; transform: translateX(-50%) translateY(5px) scale(1.2); }
  50%  { transform: translateX(-50%) translateY(-3px) scale(1); }
  70%  { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
}
.victory-ring {
  position: absolute; top: 50%; left: 50%;
  width: 30px; height: 30px; margin: -15px 0 0 -15px;
  border: 3px solid rgba(251,191,36,0.8);
  border-radius: 50%;
  box-shadow: 0 0 15px rgba(251,191,36,0.4);
  opacity: 0;
  animation: victory-ring-expand 1s ease-out forwards;
}
@keyframes victory-ring-expand {
  0%   { opacity: 0; transform: scale(0.2); }
  15%  { opacity: 1; }
  100% { opacity: 0; transform: scale(6); border-width: 0.5px; }
}

/* — Defeat: cracks + fog — */
.mock-defeat {
  animation: defeat-fade 1.8s ease-out;
}
@keyframes defeat-fade {
  0%   { filter: brightness(1) saturate(1); }
  30%  { filter: brightness(0.5) saturate(0.3); }
  60%  { filter: brightness(0.4) saturate(0.2); }
  100% { filter: brightness(1) saturate(1); }
}
.defeat-crack {
  position: absolute; top: 20%; left: 30%; right: 40%;
  height: 3px;
  background: linear-gradient(90deg, transparent, rgba(100,116,139,0.8), rgba(71,85,105,0.6), transparent);
  transform: rotate(-25deg);
  opacity: 0;
  animation: defeat-crack-appear 1.2s ease-out forwards;
}
.defeat-crack-2 {
  top: 50%; left: 35%; right: 25%;
  transform: rotate(15deg);
  animation-delay: 0.15s;
}
@keyframes defeat-crack-appear {
  0%   { opacity: 0; clip-path: inset(0 100% 0 0); }
  30%  { opacity: 1; clip-path: inset(0 0 0 0); }
  70%  { opacity: 0.8; }
  100% { opacity: 0; }
}
.defeat-fog {
  position: absolute; inset: 0; border-radius: 10px;
  background: radial-gradient(ellipse at 50% 80%, rgba(30,41,59,0.6) 0%, rgba(15,23,42,0.3) 50%, transparent 80%);
  animation: defeat-fog-rise 1.5s ease-out forwards;
}
@keyframes defeat-fog-rise {
  0%   { opacity: 0; transform: translateY(20px); }
  30%  { opacity: 0.8; transform: translateY(0); }
  70%  { opacity: 0.6; transform: translateY(-10px); }
  100% { opacity: 0; transform: translateY(-20px); }
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
  font-weight: 500;
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
  transition: background-color 0.15s;
  margin-top: 4px;
}
.modal-btn:hover { background: rgba(200, 168, 78, 0.2); }

/* Modal transition */
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

/* ===== P3 TAB SWITCHER ===== */
.showcase-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.stab {
  flex: 1;
  padding: 6px 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #475569;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 5px;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}
.stab:hover { color: #94a3b8; background: rgba(255, 255, 255, 0.03); }
.stab.active {
  color: #c8a84e;
  background: rgba(200, 168, 78, 0.08);
  border-color: rgba(200, 168, 78, 0.2);
}
.eff-icon-text { font-size: 16px; flex-shrink: 0; }

/* ===== P3 STAGE ===== */
.p3-stage {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 24px;
  overflow-y: auto;
}

/* Season grid — 4 panels side by side */
.p3-seasons-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 300px;
}

.p3-season-panel {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
}
.p3-season-panel:hover { border-color: rgba(255, 255, 255, 0.12); transform: scale(1.01); }
.p3-season-active { border-color: rgba(200, 168, 78, 0.4) !important; }

.p3-season-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Season background gradients */
.p3-bg-spring {
  background: linear-gradient(180deg, #1a2e1a 0%, #0d1f12 40%, #0a1a0d 100%);
}
.p3-bg-spring::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 80% 50% at 50% 80%, rgba(74, 222, 128, 0.08) 0%, transparent 60%),
              radial-gradient(ellipse 40% 30% at 30% 20%, rgba(167, 243, 208, 0.05) 0%, transparent 50%);
}
.p3-bg-summer {
  background: linear-gradient(180deg, #2a1f0a 0%, #1a1408 40%, #12100a 100%);
}
.p3-bg-summer::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 40% at 50% 10%, rgba(251, 191, 36, 0.1) 0%, transparent 60%),
              radial-gradient(ellipse 80% 50% at 50% 90%, rgba(251, 146, 60, 0.06) 0%, transparent 50%);
}
.p3-bg-autumn {
  background: linear-gradient(180deg, #2a1510 0%, #1a0e0a 40%, #120a08 100%);
}
.p3-bg-autumn::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 40% at 60% 30%, rgba(249, 115, 22, 0.07) 0%, transparent 50%),
              radial-gradient(ellipse 50% 50% at 30% 70%, rgba(220, 38, 38, 0.04) 0%, transparent 50%);
}
.p3-bg-winter {
  background: linear-gradient(180deg, #0f1520 0%, #0a0e18 40%, #060a12 100%);
}
.p3-bg-winter::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 40% at 40% 20%, rgba(96, 165, 250, 0.06) 0%, transparent 50%),
              radial-gradient(ellipse 80% 50% at 60% 80%, rgba(147, 197, 253, 0.04) 0%, transparent 50%);
}

.p3-season-label {
  position: absolute;
  bottom: 0;
  left: 0; right: 0;
  padding: 10px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 500;
  color: #e2e8f0;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.9);
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
}

/* Damage demo section */
.p3-damage-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.p3-demo-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: uppercase;
}

.p3-demo-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.p3-demo-card {
  width: 100px;
  height: 140px;
  border-radius: 8px;
  background: linear-gradient(165deg, #1a1520 0%, #0d0a14 100%);
  border: 2px solid rgba(200, 168, 78, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.p3-dc-art {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.p3-dc-icon { font-size: 40px; color: rgba(200, 168, 78, 0.3); }
.p3-dc-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 11px;
  font-weight: 500;
  color: #e2e8f0;
  text-align: center;
  padding: 2px 4px;
}
.p3-dc-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.4);
  font-family: var(--font-display, Georgia, serif);
  font-size: 14px;
  font-weight: 500;
}
.p3-atk { color: #f87171; }
.p3-def { color: #60a5fa; }

.p3-demo-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.p3-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s;
}
.p3-btn-dmg {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}
.p3-btn-dmg:hover { background: rgba(239, 68, 68, 0.15); }
.p3-btn-crit {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.3);
  background: rgba(220, 38, 38, 0.08);
}
.p3-btn-crit:hover { background: rgba(220, 38, 38, 0.15); }
.p3-btn-counter {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.08);
}
.p3-btn-counter:hover { background: rgba(245, 158, 11, 0.15); }
</style>
