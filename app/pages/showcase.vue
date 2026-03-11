<script setup lang="ts">
/**
 * Showcase — prezentacja efektów wizualnych i dźwiękowych.
 * Klikasz efekt z listy → AI "odgrywa" animację → modal podsumowania → następny efekt.
 */
definePageMeta({ ssr: false })
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue'
import gsap from 'gsap'
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
import SwordSlashVFX from '../../components/vfx/SwordSlashVFX.vue'
import SlashAttackVFX from '../../components/vfx/SlashAttackVFX.vue'
import TornadoVFX from '../../components/vfx/TornadoVFX.vue'
import CientosShowcase from '../../components/vfx/CientosShowcase.vue'
import SlashAttackWebGPU from '../../components/vfx/SlashAttackWebGPU.vue'
import BowAttackVFX from '../../components/vfx/BowAttackVFX.vue'
import BowAttackWebGL from '../../components/vfx/BowAttackWebGL.vue'
import DeathVFX from '../../components/vfx/DeathVFX.vue'
import ElementalVFX from '../../components/vfx/ElementalVFX.vue'
import MagicVFX from '../../components/vfx/MagicVFX.vue'

const sfx = useAudio()
const ui = useUIStore()
const vfx = useVFXOrchestrator()

// Aktualny efekt (shared between P3 and Legacy)
const activeEffectId = ref<string | null>(null)

// ===== P3 SHOWCASE STATE =====
const p3ActiveSeason = ref<'spring' | 'summer' | 'autumn' | 'winter'>('spring')
const p3Tab = ref<'p3' | 'legacy'>('p3')

// TresJS demos
const slashActive = ref(false)
const tornadoActive = ref(true)

// Combat overlay flashes for demo cards
const p3CounterCard = ref<string | null>(null)
const p3BlockCard = ref<string | null>(null)

// Slash attack VFX component refs (arena + 3D section)
const slashAttackRef = ref<InstanceType<typeof SlashAttackVFX> | null>(null)
const slashAttackRef3d = ref<InstanceType<typeof SlashAttackVFX> | null>(null)
const slashWebGPURef = ref<InstanceType<typeof SlashAttackWebGPU> | null>(null)
const bowAttackRef = ref<InstanceType<typeof BowAttackVFX> | null>(null)
const bowWebGLRef = ref<InstanceType<typeof BowAttackWebGL> | null>(null)
const bowGPUCompareRef = ref<InstanceType<typeof BowAttackVFX> | null>(null)
const bowGLCompareRef = ref<InstanceType<typeof BowAttackWebGL> | null>(null)
const deathVfxRef = ref<InstanceType<typeof DeathVFX> | null>(null)
const elementalVfxRef = ref<InstanceType<typeof ElementalVFX> | null>(null)
const magicVfxRef = ref<InstanceType<typeof MagicVFX> | null>(null)

// ===== SANDBOX CONTROLS =====
const sandboxAutoRepeat = ref(false)
const sandboxInterval = ref(2000)
let _sandboxTimer: ReturnType<typeof setInterval> | null = null

interface P3EffectMeta {
  name: string
  desc: string
  color: string
  trigger: () => void
}

// Populated after demo functions are defined (see below)
let p3EffectMeta: Record<string, P3EffectMeta> = {}
const currentP3Effect = computed(() => activeEffectId.value ? p3EffectMeta[activeEffectId.value] ?? null : null)

// Which view to show in P3 main area
const p3ViewType = computed(() => {
  const id = activeEffectId.value
  if (!id || p3Tab.value !== 'p3') return 'none'
  if (id in p3EffectMeta) return 'arena'
  if (id === 'p3-sword-slash') return '3d-slash-old'
  if (id === 'p3-slash-compare') return '3d-slash-compare'
  if (id === 'p3-bow-compare') return '3d-bow-compare'
  if (id === 'p3-tornado') return '3d-tornado'
  if (id === 'p3-fire') return '3d-fire'
  if (id === 'p3-cientos') return 'cientos'
  if (id.startsWith('p3-season-')) return 'season'
  return 'none'
})

function triggerCurrentEffect() {
  currentP3Effect.value?.trigger()
}

function startAutoRepeat() {
  stopAutoRepeat()
  sandboxAutoRepeat.value = true
  triggerCurrentEffect()
  _sandboxTimer = setInterval(triggerCurrentEffect, sandboxInterval.value)
}

function stopAutoRepeat() {
  sandboxAutoRepeat.value = false
  if (_sandboxTimer) { clearInterval(_sandboxTimer); _sandboxTimer = null }
}

// Stop auto-repeat when switching effects, and auto-trigger on sidebar click
watch(activeEffectId, async (newId) => {
  stopAutoRepeat()
  // Auto-trigger arena effect after DOM renders (nextTick needed for view switch)
  if (newId && p3EffectMeta[newId]) {
    await nextTick()
    // Small extra delay to ensure DOM is fully painted
    setTimeout(() => p3EffectMeta[newId]?.trigger(), 50)
  }
})

function triggerSlash() {
  slashActive.value = false
  // Next tick to re-trigger
  setTimeout(() => { slashActive.value = true }, 20)
}

// Battlefield backgrounds for season panels
const bgModules = import.meta.glob('../../assets/backgrounds/battlefields/1/*.webp', { eager: true, query: '?url', import: 'default' })
const seasonBgMap: Record<string, string> = {}
for (const [path, url] of Object.entries(bgModules)) {
  if (path.includes('wiosna')) seasonBgMap.spring = url as string
  else if (path.includes('lato')) seasonBgMap.summer = url as string
  else if (path.includes('jesien')) seasonBgMap.autumn = url as string
  else if (path.includes('zima')) seasonBgMap.winter = url as string
}

function getCardRect(targetId: string) {
  const el = document.querySelector(`[data-instance-id="${targetId}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
}

function demoDamageNumber(targetId: string, value: number, color: string, label?: string) {
  const rect = getCardRect(targetId)
  if (!rect) return
  vfx.emit({
    type: 'damage-number',
    targetId,
    value,
    color,
    label,
    meta: { pos: { x: rect.cx, y: rect.y + 20 } },
  })
}

function demoHit(targetId: string, attackType: 'melee' | 'elemental' | 'magic' | 'ranged') {
  const rect = getCardRect(targetId)
  if (!rect) return
  vfx.emit({ type: 'hit', targetId, attackType, meta: { rect } })
  // Also show damage number after short delay
  setTimeout(() => {
    const r2 = getCardRect(targetId)
    if (!r2) return
    const colors = { melee: '#ef4444', elemental: '#f97316', magic: '#a855f7', ranged: '#60a5fa' }
    vfx.emit({
      type: 'damage-number', targetId, value: Math.floor(Math.random() * 5) + 2,
      color: colors[attackType], meta: { pos: { x: r2.cx, y: r2.y + 20 } },
    })
  }, 150)
}

function demoDeath(targetId: string) {
  const rect = getCardRect(targetId)
  if (!rect) return
  vfx.emit({ type: 'death', targetId, meta: { rect } })
}

// Counter-attack demo:
// - Shield overlay on DEFENDER (they're counter-attacking)
// - Particles + blue damage on ATTACKER (receiving the hit)
function demoCounter(targetId: string) {
  // targetId = the card being tested (defender). Other card = attacker.
  const otherId = targetId === 'p3-defender' ? 'p3-attacker' : 'p3-defender'
  const defRect = getCardRect(targetId)
  const atkRect = getCardRect(otherId)
  if (!defRect) return
  // Overlay on defender (they counter-attack)
  p3CounterCard.value = targetId
  setTimeout(() => { if (p3CounterCard.value === targetId) p3CounterCard.value = null }, 900)
  // Particles hit the attacker
  if (atkRect) {
    vfx.emit({ type: 'hit', targetId: otherId, attackType: 'melee', label: 'kontra', meta: { rect: atkRect } })
    setTimeout(() => {
      const r2 = getCardRect(otherId)
      if (!r2) return
      vfx.emit({
        type: 'damage-number', targetId: otherId, value: Math.floor(Math.random() * 4) + 2,
        color: '#3b82f6', label: 'kontra', meta: { pos: { x: r2.cx, y: r2.y + 20 } },
      })
    }, 200)
  }
}

// Block/Odporny demo: overlay + particles on target, no floating text (overlay says it)
function demoBlock(targetId: string) {
  const rect = getCardRect(targetId)
  if (!rect) return
  p3BlockCard.value = targetId
  setTimeout(() => { if (p3BlockCard.value === targetId) p3BlockCard.value = null }, 900)
  vfx.emit({ type: 'block', targetId, label: 'Odporny!', meta: { rect } })
}

// Generic effect on a single target
function demoEffect(targetId: string, type: string) {
  const rect = getCardRect(targetId)
  if (!rect) return
  vfx.emit({ type: type as any, targetId, meta: { rect } })
}

// ===== SLASH ATTACK — uses SlashAttackVFX component (Three.js WebGL shaders) =====
function demoSlashAttack(attackerId: string, defenderId: string) {
  const atkEl = document.querySelector(`[data-instance-id="${attackerId}"]`) as HTMLElement
  const defEl = document.querySelector(`[data-instance-id="${defenderId}"]`) as HTMLElement
  if (!atkEl || !defEl) return
  slashAttackRef.value?.play(atkEl, defEl, 6)
}

// 3D section — separate instance with its own mini-cards
function demoSlashAttack3d() {
  const atkEl = document.querySelector('[data-instance-id="p3-slash-atk"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-slash-def"]') as HTMLElement
  if (!atkEl || !defEl) return
  slashAttackRef3d.value?.play(atkEl, defEl, 8)
}

// WebGPU bow attack — energy bow + arrow projectile
function demoBowAttack() {
  const atkEl = document.querySelector('[data-instance-id="p3-attacker"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-defender"]') as HTMLElement
  if (!atkEl || !defEl) return
  bowAttackRef.value?.play(atkEl, defEl, 5)
}

// Bow compare demos
function demoBowGPU() {
  const atkEl = document.querySelector('[data-instance-id="p3-bow-gpu-atk"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-bow-gpu-def"]') as HTMLElement
  if (!atkEl || !defEl) return
  bowGPUCompareRef.value?.play(atkEl, defEl, 5)
}

function demoBowGL() {
  const atkEl = document.querySelector('[data-instance-id="p3-bow-gl-atk"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-bow-gl-def"]') as HTMLElement
  if (!atkEl || !defEl) return
  bowGLCompareRef.value?.play(atkEl, defEl, 5)
}

// WebGPU slash — uses the TSL material version
function demoSlashWebGPU() {
  const atkEl = document.querySelector('[data-instance-id="p3-gpu-atk"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-gpu-def"]') as HTMLElement
  if (!atkEl || !defEl) return
  slashWebGPURef.value?.play(atkEl, defEl, 8)
}

// Arrow flight: from attacker → defender
function demoArrow(sourceId: string, targetId: string) {
  const src = getCardRect(sourceId)
  const tgt = getCardRect(targetId)
  if (!src || !tgt) return
  vfx.emit({ type: 'arrow-flight', meta: { sourceRect: src, targetRect: tgt } })
}

// Full combat sequence: hit → counter → death
function demoFullCombat(attackerId: string, defenderId: string) {
  // Phase 1: melee hit on defender (red damage)
  demoHit(defenderId, 'melee')
  // Phase 2: counter — overlay on DEFENDER, blue damage on ATTACKER (700ms)
  setTimeout(() => demoCounter(defenderId), 700)
  // Phase 3: death on defender (1400ms)
  setTimeout(() => demoDeath(defenderId), 1400)
}

// ===== NEW VFX DEMOS (WebGPU) =====
function demoDeathVFX() {
  const el = document.querySelector('[data-instance-id="p3-defender"]') as HTMLElement
  if (!el) return
  deathVfxRef.value?.play(el)
}

function demoElementalVFX() {
  const atkEl = document.querySelector('[data-instance-id="p3-attacker"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-defender"]') as HTMLElement
  if (!atkEl || !defEl) return
  elementalVfxRef.value?.play(atkEl, defEl, 7)
}

function demoMagicVFX() {
  const atkEl = document.querySelector('[data-instance-id="p3-attacker"]') as HTMLElement
  const defEl = document.querySelector('[data-instance-id="p3-defender"]') as HTMLElement
  if (!atkEl || !defEl) return
  magicVfxRef.value?.play(atkEl, defEl, 6)
}

// ===== P3 EFFECT METADATA (for sandbox UI) =====
p3EffectMeta = {
  'p3-hit-melee': { name: 'Melee Hit (Lightsaber)', desc: 'Potrójne skrzyżowane cięcia — biały rdzeń, bursztynowy krzyż, żar.', color: '#ef4444', trigger: () => demoHit('p3-defender', 'melee') },
  'p3-hit-elem': { name: 'Elemental Hit (Ogień)', desc: 'Unoszące się cząstki ognia + pomarańczowy pierścień wybuchu.', color: '#f97316', trigger: () => demoHit('p3-defender', 'elemental') },
  'p3-hit-magic': { name: 'Magic Hit (Runy)', desc: 'Rozchodzące się runy, orbitujące symbole, fioletowe iskry.', color: '#a855f7', trigger: () => demoHit('p3-defender', 'magic') },
  'p3-hit-ranged': { name: 'Ranged Hit (Krater)', desc: 'Niebieski krater uderzenia + odłamki debris.', color: '#60a5fa', trigger: () => demoHit('p3-defender', 'ranged') },
  'p3-slash': { name: 'Slash WebGL (NOWY)', desc: 'Three.js GLSL shader — zamach, cięcie, iskry, damage number.', color: '#fbbf24', trigger: () => demoSlashAttack('p3-attacker', 'p3-defender') },
  'p3-bow': { name: 'Łuk Energii (WebGPU)', desc: 'WebGPU/TSL: łuk energetyczny → naciągnięcie cięciwy → strzała energii → eksplozja uderzenia.', color: '#38bdf8', trigger: () => demoBowAttack() },
  'p3-arrow': { name: 'Łuk + Strzała (Canvas)', desc: 'Canvas 2D fallback: naciągnięcie łuku → lot strzały z ogonem → uderzenie.', color: '#38bdf8', trigger: () => demoArrow('p3-attacker', 'p3-defender') },
  'p3-elemental-vfx': { name: 'Żywioł (WebGPU)', desc: 'Kula ognia formuje się → leci łukiem → ognisty pierścień wybuchu + żar.', color: '#f97316', trigger: () => demoElementalVFX() },
  'p3-magic-vfx': { name: 'Magia (WebGPU)', desc: 'Runiczny krąg → promień energii → implosja + fioletowe iskry.', color: '#a855f7', trigger: () => demoMagicVFX() },
  'p3-death-vfx': { name: 'Śmierć (WebGPU)', desc: 'Ciemna mgła ogarnia kartę → dusza wyłania się i odchodzi w górę → popiół.', color: '#64748b', trigger: () => demoDeathVFX() },
  'p3-counter': { name: 'Kontratak', desc: 'Kopuła tarczy na obrońcy + białe iskry + uderzenie zwrotne na atakującym.', color: '#f59e0b', trigger: () => demoCounter('p3-defender') },
  'p3-block': { name: 'Odporny (Block)', desc: 'Podwójny pierścień (niebieski + złoty) + runy ochronne.', color: '#60a5fa', trigger: () => demoBlock('p3-defender') },
  'p3-death': { name: 'Śmierć (Shatter)', desc: 'Karta rozpada się na 20 fragmentów + ciemny dym + flash duszy.', color: '#64748b', trigger: () => demoDeath('p3-defender') },
  'p3-shield-break': { name: 'Rozbicie Tarczy', desc: 'Tarcza pęka na niebieskie odłamki.', color: '#93c5fd', trigger: () => demoEffect('p3-defender', 'shield-break') },
  'p3-dmg': { name: 'Damage Number', desc: 'Unosząca się liczba obrażeń — GSAP tween (scale + Y + opacity).', color: '#ef4444', trigger: () => demoDamageNumber('p3-defender', Math.floor(Math.random() * 8) + 2, '#ef4444') },
  'p3-full-combat': { name: 'Pełna Walka', desc: 'Sekwencja: Hit (0ms) → Kontratak (700ms) → Śmierć (1400ms).', color: '#fbbf24', trigger: () => demoFullCombat('p3-attacker', 'p3-defender') },
  'p3-heal': { name: 'Leczenie', desc: 'Zielone cząstki unoszą się w górę + krzyże + rozszerzający pierścień.', color: '#4ade80', trigger: () => demoEffect('p3-defender', 'heal') },
  'p3-freeze': { name: 'Zamrożenie', desc: 'Obracające się płatki śniegu + zimna mgła + lodowy pierścień.', color: '#93c5fd', trigger: () => demoEffect('p3-defender', 'freeze') },
  'p3-poison': { name: 'Trucizna', desc: 'Toksyczne krople + zielony dym + trujący pierścień.', color: '#22c55e', trigger: () => demoEffect('p3-defender', 'poison') },
  'p3-lightning': { name: 'Piorun', desc: 'Żółte błyskawice + biały flash uderzenia + elektryczne iskry.', color: '#fbbf24', trigger: () => demoEffect('p3-defender', 'lightning') },
  'p3-stun': { name: 'Ogłuszenie', desc: 'Orbitujące gwiazdki nad głową + elektryczne iskry.', color: '#fde68a', trigger: () => demoEffect('p3-defender', 'stun') },
  'p3-buff': { name: 'Buff / Wzmocnienie', desc: 'Złote cząstki unoszące się w górę z efektem blasku.', color: '#fbbf24', trigger: () => demoEffect('p3-defender', 'buff') },
  'p3-resurrect': { name: 'Wskrzeszenie', desc: 'Złote cząstki + promień światła + unoszące się gwiazdy.', color: '#fde68a', trigger: () => demoEffect('p3-defender', 'resurrect') },
  'p3-summon': { name: 'Przywołanie (Portal)', desc: 'Fioletowy portal + cząstki zbiegające się do centrum.', color: '#c084fc', trigger: () => demoEffect('p3-defender', 'summon') },
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

onUnmounted(() => {
  clearTimers()
  stopAutoRepeat()
})

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
        <div class="cat-label">Uderzenia</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-hit-melee' }]" style="--ec: #ef4444"
          @click="activeEffectId = 'p3-hit-melee'">
          <Icon icon="game-icons:broadsword" class="eff-icon" /><span class="eff-name">Melee (Lightsaber)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-hit-elem' }]" style="--ec: #f97316"
          @click="activeEffectId = 'p3-hit-elem'">
          <Icon icon="game-icons:fire-dash" class="eff-icon" /><span class="eff-name">Elemental (Ogień)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-hit-magic' }]" style="--ec: #a855f7"
          @click="activeEffectId = 'p3-hit-magic'">
          <Icon icon="game-icons:magic-swirl" class="eff-icon" /><span class="eff-name">Magic (Runy)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-hit-ranged' }]" style="--ec: #60a5fa"
          @click="activeEffectId = 'p3-hit-ranged'">
          <Icon icon="game-icons:arrow-flights" class="eff-icon" /><span class="eff-name">Ranged (Krater)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-slash' }]" style="--ec: #fbbf24"
          @click="activeEffectId = 'p3-slash'">
          <Icon icon="game-icons:saber-slash" class="eff-icon" /><span class="eff-name">Slash WebGL (NOWY)</span>
        </div>

        <div class="cat-label">Dystansowy (Łucznik)</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-bow' }]" style="--ec: #38bdf8"
          @click="activeEffectId = 'p3-bow'">
          <Icon icon="game-icons:archery-target" class="eff-icon" /><span class="eff-name">Łuk Energii (WebGPU)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-arrow' }]" style="--ec: #38bdf8"
          @click="activeEffectId = 'p3-arrow'">
          <Icon icon="game-icons:arrow-flights" class="eff-icon" /><span class="eff-name">Łuk + Strzała (Canvas)</span>
        </div>

        <div class="cat-label">Nowe 3D Efekty (WebGPU)</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-elemental-vfx' }]" style="--ec: #f97316"
          @click="activeEffectId = 'p3-elemental-vfx'">
          <Icon icon="game-icons:fire-ray" class="eff-icon" /><span class="eff-name">Żywioł (Ognista Kula)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-magic-vfx' }]" style="--ec: #a855f7"
          @click="activeEffectId = 'p3-magic-vfx'">
          <Icon icon="game-icons:magic-portal" class="eff-icon" /><span class="eff-name">Magia (Arcana)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-death-vfx' }]" style="--ec: #64748b"
          @click="activeEffectId = 'p3-death-vfx'">
          <Icon icon="game-icons:ghost" class="eff-icon" /><span class="eff-name">Śmierć (Cień Odchodzi)</span>
        </div>

        <div class="cat-label">Walka</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-counter' }]" style="--ec: #f59e0b"
          @click="activeEffectId = 'p3-counter'">
          <Icon icon="game-icons:shield-bash" class="eff-icon" /><span class="eff-name">Kontratak</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-block' }]" style="--ec: #60a5fa"
          @click="activeEffectId = 'p3-block'">
          <Icon icon="game-icons:shield-reflect" class="eff-icon" /><span class="eff-name">Odporny (Block)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-death' }]" style="--ec: #64748b"
          @click="activeEffectId = 'p3-death'">
          <Icon icon="game-icons:skull-crossed-bones" class="eff-icon" /><span class="eff-name">Śmierć (Shatter)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-shield-break' }]" style="--ec: #93c5fd"
          @click="activeEffectId = 'p3-shield-break'">
          <Icon icon="game-icons:broken-shield" class="eff-icon" /><span class="eff-name">Rozbicie Tarczy</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-dmg' }]" style="--ec: #ef4444"
          @click="activeEffectId = 'p3-dmg'">
          <Icon icon="game-icons:drop" class="eff-icon" /><span class="eff-name">Damage Number</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-full-combat' }]" style="--ec: #fbbf24"
          @click="activeEffectId = 'p3-full-combat'">
          <Icon icon="game-icons:sword-clash" class="eff-icon" /><span class="eff-name">Pełna Walka</span>
        </div>

        <div class="cat-label">Buffy / Debuffy</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-heal' }]" style="--ec: #4ade80"
          @click="activeEffectId = 'p3-heal'">
          <Icon icon="game-icons:health-potion" class="eff-icon" /><span class="eff-name">Leczenie</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-freeze' }]" style="--ec: #93c5fd"
          @click="activeEffectId = 'p3-freeze'">
          <Icon icon="game-icons:ice-cube" class="eff-icon" /><span class="eff-name">Zamrożenie</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-poison' }]" style="--ec: #22c55e"
          @click="activeEffectId = 'p3-poison'">
          <Icon icon="game-icons:death-juice" class="eff-icon" /><span class="eff-name">Trucizna</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-lightning' }]" style="--ec: #fbbf24"
          @click="activeEffectId = 'p3-lightning'">
          <Icon icon="game-icons:lightning-storm" class="eff-icon" /><span class="eff-name">Piorun</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-stun' }]" style="--ec: #fde68a"
          @click="activeEffectId = 'p3-stun'">
          <Icon icon="game-icons:star-swirl" class="eff-icon" /><span class="eff-name">Ogłuszenie</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-buff' }]" style="--ec: #fbbf24"
          @click="activeEffectId = 'p3-buff'">
          <Icon icon="game-icons:aura" class="eff-icon" /><span class="eff-name">Buff / Wzmocnienie</span>
        </div>

        <div class="cat-label">Specjalne</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-resurrect' }]" style="--ec: #fde68a"
          @click="activeEffectId = 'p3-resurrect'">
          <Icon icon="game-icons:angel-wings" class="eff-icon" /><span class="eff-name">Wskrzeszenie</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-summon' }]" style="--ec: #c084fc"
          @click="activeEffectId = 'p3-summon'">
          <Icon icon="game-icons:portal" class="eff-icon" /><span class="eff-name">Przywołanie (Portal)</span>
        </div>

        <div class="cat-label">3D Porównania</div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-bow-compare' }]" style="--ec: #38bdf8"
          @click="activeEffectId = 'p3-bow-compare'">
          <Icon icon="game-icons:archery-target" class="eff-icon" /><span class="eff-name">Łuk: WebGPU vs WebGL</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-slash-compare' }]" style="--ec: #fbbf24"
          @click="activeEffectId = 'p3-slash-compare'">
          <Icon icon="game-icons:crossed-swords" class="eff-icon" /><span class="eff-name">Slash: WebGPU vs WebGL</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-sword-slash' }]" style="--ec: #94a3b8"
          @click="activeEffectId = 'p3-sword-slash'; triggerSlash()">
          <Icon icon="game-icons:sword-wound" class="eff-icon" /><span class="eff-name">TresJS Torus (backup)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-tornado' }]" style="--ec: #f97316"
          @click="activeEffectId = 'p3-tornado'; tornadoActive = true">
          <Icon icon="game-icons:tornado" class="eff-icon" /><span class="eff-name">Tornado</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-fire' }]" style="--ec: #ef4444"
          @click="activeEffectId = 'p3-fire'">
          <Icon icon="game-icons:fire-zone" class="eff-icon" /><span class="eff-name">Ogień (Fire)</span>
        </div>
        <div :class="['effect-item', { active: activeEffectId === 'p3-cientos' }]" style="--ec: #a855f7"
          @click="activeEffectId = 'p3-cientos'">
          <Icon icon="game-icons:crystal-ball" class="eff-icon" /><span class="eff-name">Cientos (Gotowce)</span>
        </div>

        <div class="cat-label">Pory Roku</div>
        <div
          v-for="s in (['spring', 'summer', 'autumn', 'winter'] as const)"
          :key="s"
          :class="['effect-item', { active: activeEffectId === `p3-season-${s}` }]"
          :style="{ '--ec': { spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316', winter: '#60a5fa' }[s] }"
          @click="p3ActiveSeason = s; activeEffectId = `p3-season-${s}`"
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

      <!-- ===== P3 STAGE ===== -->
      <div v-if="p3Tab === 'p3'" class="p3-stage">

        <!-- Empty state -->
        <div v-if="p3ViewType === 'none'" class="p3-empty">
          <Icon icon="game-icons:sparkles" class="hint-icon" />
          <p>Wybierz efekt z listy po lewej</p>
          <p class="hint-sub">Kliknij na efekt aby zobaczyć podgląd</p>
        </div>

        <!-- ===== ARENA VIEW (particle VFX sandbox) ===== -->
        <div v-if="p3ViewType === 'arena'" class="p3-arena-view">
          <!-- Effect info header -->
          <div class="p3-effect-header">
            <div class="p3-effect-name" :style="{ color: currentP3Effect?.color }">{{ currentP3Effect?.name }}</div>
            <div class="p3-effect-desc">{{ currentP3Effect?.desc }}</div>
          </div>

          <!-- Attacker + Defender pair -->
          <div class="p3-arena-row" style="position: relative;">
            <ClientOnly><SlashAttackVFX ref="slashAttackRef" /></ClientOnly>
            <ClientOnly><BowAttackVFX ref="bowAttackRef" /></ClientOnly>
            <ClientOnly><DeathVFX ref="deathVfxRef" /></ClientOnly>
            <ClientOnly><ElementalVFX ref="elementalVfxRef" /></ClientOnly>
            <ClientOnly><MagicVFX ref="magicVfxRef" /></ClientOnly>

            <div class="p3-demo-card p3-card-attacker" data-instance-id="p3-attacker">
              <div class="p3-dc-art"><Icon icon="game-icons:werewolf" class="p3-dc-icon" /></div>
              <div class="p3-dc-name">Atakujący</div>
              <div class="p3-dc-stats"><span class="p3-atk">6</span>/<span class="p3-def">5</span></div>
              <div class="p3-dc-badge p3-badge-atk">ATK</div>
              <div v-if="p3CounterCard === 'p3-attacker'" class="p3-combat-overlay p3-overlay-counter">
                <span class="p3-ov-icon">🛡️</span><span class="p3-ov-label">KONTRATAK</span>
              </div>
              <div v-if="p3BlockCard === 'p3-attacker'" class="p3-combat-overlay p3-overlay-block">
                <span class="p3-ov-icon">✋</span><span class="p3-ov-label">ODPORNY</span>
              </div>
            </div>

            <div class="p3-arena-arrow"><Icon icon="game-icons:arrow-flights" class="p3-arrow-icon" /></div>

            <div class="p3-demo-card p3-card-defender" data-instance-id="p3-defender">
              <div class="p3-dc-art"><Icon icon="game-icons:imp" class="p3-dc-icon" /></div>
              <div class="p3-dc-name">Obrońca</div>
              <div class="p3-dc-stats"><span class="p3-atk">3</span>/<span class="p3-def">8</span></div>
              <div class="p3-dc-badge p3-badge-def">DEF</div>
              <div v-if="p3CounterCard === 'p3-defender'" class="p3-combat-overlay p3-overlay-counter">
                <span class="p3-ov-icon">🛡️</span><span class="p3-ov-label">KONTRATAK</span>
              </div>
              <div v-if="p3BlockCard === 'p3-defender'" class="p3-combat-overlay p3-overlay-block">
                <span class="p3-ov-icon">✋</span><span class="p3-ov-label">ODPORNY</span>
              </div>
            </div>
          </div>

          <!-- Sandbox controls -->
          <div class="p3-sandbox-controls">
            <button class="p3-trigger-btn" :style="{ '--tc': currentP3Effect?.color }" @click="triggerCurrentEffect()">
              <Icon icon="game-icons:play-button" /> Odpal efekt
            </button>
            <div class="p3-repeat-row">
              <button :class="['p3-repeat-btn', { active: sandboxAutoRepeat }]" @click="sandboxAutoRepeat ? stopAutoRepeat() : startAutoRepeat()">
                <Icon :icon="sandboxAutoRepeat ? 'game-icons:pause-button' : 'game-icons:cycle'" />
                {{ sandboxAutoRepeat ? 'Stop' : 'Auto-repeat' }}
              </button>
              <label class="p3-delay-label">
                <span>{{ sandboxInterval }}ms</span>
                <input type="range" min="500" max="5000" step="100" v-model.number="sandboxInterval" class="p3-delay-slider" />
              </label>
            </div>
          </div>
        </div>

        <!-- ===== 3D: SLASH COMPARE (WebGPU TSL vs WebGL GLSL) ===== -->
        <div v-if="p3ViewType === '3d-slash-compare'" class="p3-3d-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" style="color: #fbbf24">Porównanie: WebGPU (TSL) vs WebGL (GLSL)</div>
            <div class="p3-effect-desc">
              WebGPU: oryginał z <code>mx_noise_float</code> (MaterialX noise) — organiczne, gładkie krawędzie.
              WebGL: port na GLSL z hash-based noise — prostsze, szybsze, szerszy support.
            </div>
          </div>
          <div class="p3-compare-grid">
            <div class="p3-compare-panel">
              <div class="p3-compare-label p3-label-new">WebGPU + TSL (oryginał)</div>
              <div class="p3-arena-row-mini" style="position: relative;">
                <ClientOnly><SlashAttackWebGPU ref="slashWebGPURef" /></ClientOnly>
                <div class="p3-mini-card" data-instance-id="p3-gpu-atk">ATK</div>
                <div class="p3-mini-card" data-instance-id="p3-gpu-def">DEF</div>
              </div>
              <div v-if="slashWebGPURef?.gpuError" class="p3-gpu-error">{{ slashWebGPURef.gpuError }}</div>
              <button class="p3-btn p3-btn-slash" :disabled="!slashWebGPURef?.gpuReady" @click="demoSlashWebGPU()">
                {{ slashWebGPURef?.gpuReady ? 'Odpal WebGPU' : 'Ładowanie...' }}
              </button>
            </div>
            <div class="p3-compare-panel">
              <div class="p3-compare-label p3-label-old">WebGL + GLSL (obecny)</div>
              <div class="p3-arena-row-mini" style="position: relative;">
                <ClientOnly><SlashAttackVFX ref="slashAttackRef3d" /></ClientOnly>
                <div class="p3-mini-card" data-instance-id="p3-slash-atk">ATK</div>
                <div class="p3-mini-card" data-instance-id="p3-slash-def">DEF</div>
              </div>
              <button class="p3-btn p3-btn-dmg" @click="demoSlashAttack3d()">Odpal WebGL</button>
            </div>
          </div>
        </div>

        <!-- ===== 3D: BOW COMPARE (WebGPU TSL vs WebGL GLSL) ===== -->
        <div v-if="p3ViewType === '3d-bow-compare'" class="p3-3d-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" style="color: #38bdf8">Łuk Energii: WebGPU (TSL) vs WebGL (GLSL)</div>
            <div class="p3-effect-desc">
              WebGPU: oryginał z <code>mx_noise_float</code> — organiczny noise na łuku i cięciwie.
              WebGL: port na GLSL z hash-based noise — prostszy, szerszy support.
            </div>
          </div>
          <div class="p3-compare-grid">
            <div class="p3-compare-panel">
              <div class="p3-compare-label p3-label-new">WebGPU + TSL</div>
              <div class="p3-arena-row-mini" style="position: relative;">
                <ClientOnly><BowAttackVFX ref="bowGPUCompareRef" /></ClientOnly>
                <div class="p3-mini-card" data-instance-id="p3-bow-gpu-atk">🏹</div>
                <div class="p3-mini-card" data-instance-id="p3-bow-gpu-def">🎯</div>
              </div>
              <div v-if="bowGPUCompareRef?.gpuError" class="p3-gpu-error">{{ bowGPUCompareRef.gpuError }}</div>
              <button class="p3-btn p3-btn-slash" :disabled="!bowGPUCompareRef?.gpuReady" @click="demoBowGPU()">
                {{ bowGPUCompareRef?.gpuReady ? 'Odpal WebGPU' : 'Ładowanie...' }}
              </button>
            </div>
            <div class="p3-compare-panel">
              <div class="p3-compare-label p3-label-old">WebGL + GLSL</div>
              <div class="p3-arena-row-mini" style="position: relative;">
                <ClientOnly><BowAttackWebGL ref="bowGLCompareRef" /></ClientOnly>
                <div class="p3-mini-card" data-instance-id="p3-bow-gl-atk">🏹</div>
                <div class="p3-mini-card" data-instance-id="p3-bow-gl-def">🎯</div>
              </div>
              <button class="p3-btn p3-btn-dmg" @click="demoBowGL()">Odpal WebGL</button>
            </div>
          </div>
        </div>

        <!-- ===== 3D: SLASH OLD (full view) ===== -->
        <div v-if="p3ViewType === '3d-slash-old'" class="p3-3d-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" style="color: #94a3b8">Sword Slash (STARY — TresJS)</div>
            <div class="p3-effect-desc">TresJS canvas — TorusGeometry + custom GLSL shader (0.5s timeline). Backup dla starszych przeglądarek.</div>
          </div>
          <div class="p3-3d-canvas-large">
            <ClientOnly>
              <SwordSlashVFX :active="slashActive" @complete="slashActive = false" />
            </ClientOnly>
          </div>
          <button class="p3-trigger-btn" style="--tc: #94a3b8" @click="triggerSlash()">
            <Icon icon="game-icons:play-button" /> Odpal Slash Canvas
          </button>
        </div>

        <!-- ===== 3D: TORNADO ===== -->
        <div v-if="p3ViewType === '3d-tornado'" class="p3-3d-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" style="color: #f97316">Tornado (Laska Boga)</div>
            <div class="p3-effect-desc">CylinderGeometry + procedural noise GLSL — parabolic deformation, FBM, swirl UV.</div>
          </div>
          <div class="p3-3d-canvas-large">
            <ClientOnly>
              <TornadoVFX :active="tornadoActive" />
            </ClientOnly>
          </div>
          <button class="p3-trigger-btn" style="--tc: #f97316" @click="tornadoActive = !tornadoActive">
            <Icon :icon="tornadoActive ? 'game-icons:pause-button' : 'game-icons:play-button'" />
            {{ tornadoActive ? 'Wyłącz' : 'Włącz' }}
          </button>
        </div>

        <!-- ===== 3D: FIRE ===== -->
        <div v-if="p3ViewType === '3d-fire'" class="p3-3d-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" style="color: #ef4444">Ogień (Żywioł)</div>
            <div class="p3-effect-desc">Particle-based fire effect — showcase-only (zbyt ciężki per-card).</div>
          </div>
          <div class="p3-3d-canvas-large">
            <ClientOnly>
              <FireVFX :active="true" :intensity="0.8" />
            </ClientOnly>
          </div>
        </div>

        <!-- ===== CIENTOS ===== -->
        <div v-if="p3ViewType === 'cientos'" class="p3-3d-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" style="color: #a855f7">@tresjs/cientos — Gotowe efekty 3D</div>
            <div class="p3-effect-desc">5 demo scen: Sparkles, Levioso, Hologram, Stars, Wobble.</div>
          </div>
          <CientosShowcase />
        </div>

        <!-- ===== SEASON FULLVIEW ===== -->
        <div v-if="p3ViewType === 'season'" class="p3-season-fullview">
          <div class="p3-effect-header">
            <div class="p3-effect-name" :style="{ color: { spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316', winter: '#60a5fa' }[p3ActiveSeason] }">
              {{ { spring: 'Wiosna', summer: 'Lato', autumn: 'Jesień', winter: 'Zima' }[p3ActiveSeason] }}
            </div>
            <div class="p3-effect-desc">Efekt pogodowy na tle bitwy (raw canvas 2D)</div>
          </div>
          <div class="p3-season-viewport">
            <div
              class="p3-season-bg"
              :class="`p3-bg-${p3ActiveSeason}`"
              :style="seasonBgMap[p3ActiveSeason] ? { backgroundImage: `url(${seasonBgMap[p3ActiveSeason]})` } : {}"
            >
              <WeatherEffects :season="p3ActiveSeason" />
            </div>
            <div class="p3-season-label">
              {{ { spring: 'Wiosna', summer: 'Lato', autumn: 'Jesień', winter: 'Zima' }[p3ActiveSeason] }}
            </div>
          </div>
          <!-- Season quick-switch -->
          <div class="p3-season-switch">
            <button
              v-for="s in (['spring', 'summer', 'autumn', 'winter'] as const)" :key="s"
              :class="['p3-btn', { active: p3ActiveSeason === s }]"
              :style="{ color: { spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316', winter: '#60a5fa' }[s], borderColor: p3ActiveSeason === s ? { spring: '#4ade80', summer: '#fbbf24', autumn: '#f97316', winter: '#60a5fa' }[s] : 'rgba(255,255,255,0.1)' }"
              @click="p3ActiveSeason = s; activeEffectId = `p3-season-${s}`"
            >{{ { spring: 'Wiosna', summer: 'Lato', autumn: 'Jesień', winter: 'Zima' }[s] }}</button>
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

        <!-- Info when nothing selected (legacy) -->
        <div v-if="(!activeEffectId || activeEffectId.startsWith('p3-')) && !isPlaying" class="stage-hint">
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
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 16px;
  overflow: hidden;
  position: relative;
}

/* P3 Empty state */
.p3-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #334155;
}
.p3-empty p { margin: 0; font-size: 14px; }

/* P3 Effect header (name + desc) */
.p3-effect-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.p3-effect-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 600;
  text-shadow: 0 0 20px currentColor;
}
.p3-effect-desc {
  font-size: 12px;
  color: #64748b;
  max-width: 500px;
  line-height: 1.4;
}

/* P3 Arena View */
.p3-arena-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

/* P3 Sandbox controls */
.p3-sandbox-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.p3-trigger-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 28px;
  border-radius: 8px;
  border: 2px solid color-mix(in srgb, var(--tc, #c8a84e) 40%, transparent);
  background: color-mix(in srgb, var(--tc, #c8a84e) 10%, transparent);
  color: var(--tc, #c8a84e);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s;
  letter-spacing: 0.04em;
}
.p3-trigger-btn:hover {
  background: color-mix(in srgb, var(--tc, #c8a84e) 18%, transparent);
}
.p3-trigger-btn:active {
  transform: scale(0.97);
}

.p3-repeat-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.p3-repeat-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}
.p3-repeat-btn:hover { color: #94a3b8; border-color: rgba(255, 255, 255, 0.15); }
.p3-repeat-btn.active {
  color: #4ade80;
  border-color: rgba(74, 222, 128, 0.4);
  background: rgba(74, 222, 128, 0.08);
  animation: repeat-pulse 1.5s ease-in-out infinite;
}
@keyframes repeat-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(74, 222, 128, 0); }
  50% { box-shadow: 0 0 8px rgba(74, 222, 128, 0.3); }
}

.p3-delay-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
}
.p3-delay-slider {
  width: 120px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.p3-delay-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #c8a84e;
  border: 2px solid #0a0c14;
  cursor: pointer;
}

/* ===== 3D FULL VIEW ===== */
.p3-3d-fullview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 900px;
}

.p3-3d-canvas-large {
  width: 100%;
  height: 360px;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #0a0a1e;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* Compare grid (side by side) */
.p3-compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
}
.p3-compare-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.p3-compare-label {
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 4px;
}
.p3-label-new {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
}
.p3-label-old {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.2);
}
.p3-gpu-error {
  font-size: 11px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.08);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

/* ===== SEASON FULLVIEW ===== */
.p3-season-fullview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 900px;
}
.p3-season-viewport {
  width: 100%;
  height: 400px;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid rgba(200, 168, 78, 0.2);
}
.p3-season-switch {
  display: flex;
  gap: 8px;
}
.p3-season-switch .p3-btn {
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
}
.p3-season-switch .p3-btn.active {
  background: rgba(255, 255, 255, 0.06);
  font-weight: 700;
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
/* ===== ARENA TEST SECTION ===== */
.p3-arena-section {
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

.p3-arena-row {
  display: flex;
  align-items: center;
  gap: 30px;
}

.p3-arena-arrow {
  display: flex;
  align-items: center;
  color: rgba(200, 168, 78, 0.3);
  font-size: 28px;
}
.p3-arrow-icon { filter: drop-shadow(0 0 4px rgba(200, 168, 78, 0.3)); }

.p3-demo-card {
  width: 110px;
  height: 150px;
  border-radius: 8px;
  background: linear-gradient(165deg, #1a1520 0%, #0d0a14 100%);
  border: 2px solid rgba(200, 168, 78, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.p3-card-attacker { border-color: rgba(239, 68, 68, 0.3); }
.p3-card-defender { border-color: rgba(96, 165, 250, 0.3); }
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
.p3-dc-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 1px 4px;
  border-radius: 3px;
}
.p3-badge-atk { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.p3-badge-def { background: rgba(96, 165, 250, 0.2); color: #60a5fa; }

/* Combat overlay flashes on demo cards */
.p3-combat-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 7px;
  pointer-events: none;
  animation: p3-flash-in 0.3s ease-out;
}
.p3-ov-icon { font-size: 36px; text-shadow: 0 0 8px rgba(0,0,0,0.8); }
.p3-ov-label {
  font-size: 10px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.12em;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  padding: 2px 8px;
  border-radius: 4px;
}
.p3-overlay-counter {
  background: rgba(20, 40, 140, 0.8);
  box-shadow: inset 0 0 30px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.5);
}
.p3-overlay-counter .p3-ov-label { background: rgba(30, 64, 175, 0.9); }
.p3-overlay-block {
  background: rgba(120, 80, 20, 0.8);
  box-shadow: inset 0 0 30px rgba(245, 158, 11, 0.5), 0 0 16px rgba(245, 158, 11, 0.4);
}
.p3-overlay-block .p3-ov-label { background: rgba(120, 53, 15, 0.9); }
@keyframes p3-flash-in {
  0%   { opacity: 0; transform: scale(0.8); }
  60%  { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}

/* Button grid under arena cards */
.p3-arena-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  max-width: 700px;
}
.p3-btn-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
}
.p3-group-label {
  width: 100%;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(200, 168, 78, 0.4);
  margin-bottom: 2px;
}

.p3-btn {
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s;
  white-space: nowrap;
}
.p3-btn-dmg { color: #ef4444; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); }
.p3-btn-dmg:hover { background: rgba(239,68,68,0.15); }
.p3-btn-elem { color: #f97316; border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.08); }
.p3-btn-elem:hover { background: rgba(249,115,22,0.15); }
.p3-btn-magic { color: #a855f7; border-color: rgba(168,85,247,0.3); background: rgba(168,85,247,0.08); }
.p3-btn-magic:hover { background: rgba(168,85,247,0.15); }
.p3-btn-ranged { color: #60a5fa; border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.08); }
.p3-btn-ranged:hover { background: rgba(96,165,250,0.15); }
.p3-btn-slash { color: #fbbf24; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.08); }
.p3-btn-slash:hover { background: rgba(251,191,36,0.15); }
.p3-btn-counter { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
.p3-btn-counter:hover { background: rgba(245,158,11,0.15); }
.p3-btn-block { color: #60a5fa; border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.08); }
.p3-btn-block:hover { background: rgba(96,165,250,0.15); }
.p3-btn-death { color: #64748b; border-color: rgba(100,116,139,0.3); background: rgba(100,116,139,0.08); }
.p3-btn-death:hover { background: rgba(100,116,139,0.15); }
.p3-btn-arrow { color: #38bdf8; border-color: rgba(56,189,248,0.3); background: rgba(56,189,248,0.08); }
.p3-btn-arrow:hover { background: rgba(56,189,248,0.15); }
.p3-btn-shield-break { color: #93c5fd; border-color: rgba(147,197,253,0.3); background: rgba(147,197,253,0.08); }
.p3-btn-shield-break:hover { background: rgba(147,197,253,0.15); }
.p3-btn-full { color: #fbbf24; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.08); }
.p3-btn-full:hover { background: rgba(251,191,36,0.15); }
.p3-btn-heal { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
.p3-btn-heal:hover { background: rgba(74,222,128,0.15); }
.p3-btn-freeze { color: #93c5fd; border-color: rgba(147,197,253,0.3); background: rgba(147,197,253,0.08); }
.p3-btn-freeze:hover { background: rgba(147,197,253,0.15); }
.p3-btn-poison { color: #22c55e; border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.08); }
.p3-btn-poison:hover { background: rgba(34,197,94,0.15); }
.p3-btn-lightning { color: #fbbf24; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.08); }
.p3-btn-lightning:hover { background: rgba(251,191,36,0.15); }
.p3-btn-stun { color: #fde68a; border-color: rgba(253,230,138,0.3); background: rgba(253,230,138,0.08); }
.p3-btn-stun:hover { background: rgba(253,230,138,0.15); }
.p3-btn-buff { color: #fbbf24; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.08); }
.p3-btn-buff:hover { background: rgba(251,191,36,0.15); }
.p3-btn-resurrect { color: #fde68a; border-color: rgba(253,230,138,0.3); background: rgba(253,230,138,0.08); }
.p3-btn-resurrect:hover { background: rgba(253,230,138,0.15); }
.p3-btn-summon { color: #c084fc; border-color: rgba(192,132,252,0.3); background: rgba(192,132,252,0.08); }
.p3-btn-summon:hover { background: rgba(192,132,252,0.15); }

/* ===== 3D EFFECTS SECTION ===== */
.p3-3d-section,
.p3-cientos-section {
  margin-top: 20px;
}

.p3-3d-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 8px;
}

.p3-3d-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.p3-3d-label {
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
  text-align: center;
}

.p3-3d-canvas {
  width: 100%;
  height: 200px;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0a0a1e;
  border: 1px solid rgba(255,255,255,0.06);
}

.p3-3d-note {
  font-size: 10px;
  color: #64748b;
  text-align: center;
  line-height: 1.3;
}

.p3-arena-row-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  width: 100%;
  height: 160px;
  background: #0a0a1e;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
}

.p3-mini-card {
  width: 60px;
  height: 90px;
  border-radius: 6px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  border: 1px solid rgba(200,168,78,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #c8a84e;
  font-family: var(--font-display, Georgia, serif);
}
</style>
