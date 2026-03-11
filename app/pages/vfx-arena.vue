<script setup lang="ts">
/**
 * VFX Arena — testowe pole bitwy do pracy nad efektami wizualnymi.
 * Prawdziwy layout: 3 linie × 3 sloty po każdej stronie, kierunki ataków, arrow-flight.
 */
definePageMeta({ ssr: false })
import { ref, computed, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useVFXOrchestrator } from '../../composables/useVFXOrchestrator'
import VFXOverlay from '../../components/vfx/VFXOverlay.vue'
import SlashAttackVFX from '../../components/vfx/SlashAttackVFX.vue'
import BowAttackVFX from '../../components/vfx/BowAttackVFX.vue'
import DeathVFX from '../../components/vfx/DeathVFX.vue'
import ElementalVFX from '../../components/vfx/ElementalVFX.vue'
import MagicVFX from '../../components/vfx/MagicVFX.vue'

const vfx = useVFXOrchestrator()

// ===== CARD SLOTS =====
type Side = 'ai' | 'player'
type Line = 1 | 2 | 3
type AttackType = 'melee' | 'elemental' | 'magic' | 'ranged'

interface MockSlot {
  id: string           // data-instance-id
  side: Side
  line: Line
  slot: number         // 0-2
  label: string
  icon: string
  atk: number
  def: number
  occupied: boolean
}

const LINE_SHORT: Record<Line, string> = { 1: 'L1', 2: 'L2', 3: 'L3' }
const LINE_RUNE: Record<Line, string> = { 1: 'ᛃ', 2: 'ᛈ', 3: 'ᚾ' }
const LINE_NAME: Record<Line, string> = { 1: 'JAWIA', 2: 'PRAWIA', 3: 'NAWIA' }
const LINE_REALM: Record<Line, string> = { 1: 'Przód', 2: 'Dystans', 3: 'Wsparcie' }

// Pre-populated slots — some occupied, some empty
function makeSlots(): MockSlot[] {
  const slots: MockSlot[] = []
  const configs: Array<{ side: Side; line: Line; slot: number; label: string; icon: string; atk: number; def: number; occupied: boolean }> = [
    // AI side
    { side: 'ai', line: 1, slot: 0, label: 'Wij', icon: 'game-icons:imp', atk: 7, def: 3, occupied: true },
    { side: 'ai', line: 1, slot: 1, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'ai', line: 1, slot: 2, label: 'Żmij', icon: 'game-icons:snake-bite', atk: 5, def: 5, occupied: true },
    { side: 'ai', line: 2, slot: 0, label: 'Łucznik', icon: 'game-icons:archer', atk: 4, def: 2, occupied: true },
    { side: 'ai', line: 2, slot: 1, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'ai', line: 2, slot: 2, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'ai', line: 3, slot: 0, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'ai', line: 3, slot: 1, label: 'Żerca', icon: 'game-icons:magic-swirl', atk: 2, def: 6, occupied: true },
    { side: 'ai', line: 3, slot: 2, label: '', icon: '', atk: 0, def: 0, occupied: false },
    // Player side
    { side: 'player', line: 1, slot: 0, label: 'Wojownik', icon: 'game-icons:broadsword', atk: 6, def: 4, occupied: true },
    { side: 'player', line: 1, slot: 1, label: 'Strzyga', icon: 'game-icons:werewolf', atk: 8, def: 3, occupied: true },
    { side: 'player', line: 1, slot: 2, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'player', line: 2, slot: 0, label: 'Łucznik', icon: 'game-icons:archer', atk: 4, def: 2, occupied: true },
    { side: 'player', line: 2, slot: 1, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'player', line: 2, slot: 2, label: 'Wiedźma', icon: 'game-icons:fire-dash', atk: 5, def: 3, occupied: true },
    { side: 'player', line: 3, slot: 0, label: 'Mag', icon: 'game-icons:crystal-ball', atk: 3, def: 7, occupied: true },
    { side: 'player', line: 3, slot: 1, label: '', icon: '', atk: 0, def: 0, occupied: false },
    { side: 'player', line: 3, slot: 2, label: '', icon: '', atk: 0, def: 0, occupied: false },
  ]
  for (const c of configs) {
    slots.push({ ...c, id: `vfx-${c.side}-L${c.line}-${c.slot}` })
  }
  return slots
}

const slots = ref(makeSlots())

const occupiedSlots = computed(() => slots.value.filter(s => s.occupied))

// ===== SELECTION =====
const sourceId = ref<string | null>(null)
const targetId = ref<string | null>(null)
const selectionMode = ref<'source' | 'target'>('source')

function selectSlot(slot: MockSlot) {
  if (!slot.occupied) return
  if (selectionMode.value === 'source') {
    sourceId.value = slot.id
    selectionMode.value = 'target'
  } else {
    targetId.value = slot.id
    selectionMode.value = 'source'
  }
}

function clearSelection() {
  sourceId.value = null
  targetId.value = null
  selectionMode.value = 'source'
}

const sourceSlot = computed(() => slots.value.find(s => s.id === sourceId.value) ?? null)
const targetSlot = computed(() => slots.value.find(s => s.id === targetId.value) ?? null)

// ===== ATTACK CONFIG =====
const attackType = ref<AttackType>('melee')
const attackDamage = ref(5)

// ===== SANDBOX =====
const autoRepeat = ref(false)
const repeatInterval = ref(2000)
let _repeatTimer: ReturnType<typeof setInterval> | null = null

// VFX component refs
const slashRef = ref<InstanceType<typeof SlashAttackVFX> | null>(null)
const bowRef = ref<InstanceType<typeof BowAttackVFX> | null>(null)
const deathRef = ref<InstanceType<typeof DeathVFX> | null>(null)
const elementalRef = ref<InstanceType<typeof ElementalVFX> | null>(null)
const magicRef = ref<InstanceType<typeof MagicVFX> | null>(null)

function getRect(id: string) {
  const el = document.querySelector(`[data-instance-id="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
}

function triggerAttack() {
  if (!sourceId.value || !targetId.value) return

  const srcRect = getRect(sourceId.value)
  const tgtRect = getRect(targetId.value)
  if (!tgtRect) return

  const type = attackType.value
  const dmg = attackDamage.value

  if (type === 'melee') {
    // Three.js slash choreography
    const atkEl = document.querySelector(`[data-instance-id="${sourceId.value}"]`) as HTMLElement
    const defEl = document.querySelector(`[data-instance-id="${targetId.value}"]`) as HTMLElement
    if (atkEl && defEl && slashRef.value) {
      slashRef.value.play(atkEl, defEl, dmg)
    }
  } else if (type === 'ranged') {
    // WebGPU energy bow + arrow flight
    const atkEl = document.querySelector(`[data-instance-id="${sourceId.value}"]`) as HTMLElement
    const defEl = document.querySelector(`[data-instance-id="${targetId.value}"]`) as HTMLElement
    if (atkEl && defEl && bowRef.value?.gpuReady) {
      bowRef.value.play(atkEl, defEl, dmg)
    } else {
      // Fallback: canvas arrow-flight
      if (srcRect) {
        vfx.emit({ type: 'arrow-flight', meta: { sourceRect: srcRect, targetRect: tgtRect } })
      }
      setTimeout(() => {
        const tgtRect2 = getRect(targetId.value!)
        if (!tgtRect2) return
        vfx.emit({ type: 'hit', targetId: targetId.value!, attackType: 'ranged', value: dmg, meta: { rect: tgtRect2 } })
        setTimeout(() => {
          const pos = getRect(targetId.value!)
          if (!pos) return
          vfx.emit({ type: 'damage-number', targetId: targetId.value!, value: dmg, color: '#60a5fa', meta: { pos: { x: pos.cx, y: pos.y + 10 } } })
        }, 200)
      }, 600)
    }
  } else if (type === 'elemental') {
    // WebGPU fire orb + impact
    const atkEl = document.querySelector(`[data-instance-id="${sourceId.value}"]`) as HTMLElement
    const defEl = document.querySelector(`[data-instance-id="${targetId.value}"]`) as HTMLElement
    if (atkEl && defEl && elementalRef.value?.gpuReady) {
      elementalRef.value.play(atkEl, defEl, dmg)
    } else {
      // Fallback: canvas particle hit
      vfx.emit({ type: 'hit', targetId: targetId.value, attackType: type, value: dmg, meta: { rect: tgtRect, attackerRect: srcRect } })
      setTimeout(() => {
        const pos = getRect(targetId.value!)
        if (!pos) return
        vfx.emit({ type: 'damage-number', targetId: targetId.value!, value: dmg, color: '#f97316', meta: { pos: { x: pos.cx, y: pos.y + 10 } } })
      }, 200)
    }
  } else if (type === 'magic') {
    // WebGPU arcane circle + beam + implosion
    const atkEl = document.querySelector(`[data-instance-id="${sourceId.value}"]`) as HTMLElement
    const defEl = document.querySelector(`[data-instance-id="${targetId.value}"]`) as HTMLElement
    if (atkEl && defEl && magicRef.value?.gpuReady) {
      magicRef.value.play(atkEl, defEl, dmg)
    } else {
      // Fallback: canvas particle hit
      vfx.emit({ type: 'hit', targetId: targetId.value, attackType: type, value: dmg, meta: { rect: tgtRect, attackerRect: srcRect } })
      setTimeout(() => {
        const pos = getRect(targetId.value!)
        if (!pos) return
        vfx.emit({ type: 'damage-number', targetId: targetId.value!, value: dmg, color: '#a855f7', meta: { pos: { x: pos.cx, y: pos.y + 10 } } })
      }, 200)
    }
  } else {
    // Generic fallback
    vfx.emit({ type: 'hit', targetId: targetId.value, attackType: type, value: dmg, meta: { rect: tgtRect, attackerRect: srcRect } })
    setTimeout(() => {
      const pos = getRect(targetId.value!)
      if (!pos) return
      vfx.emit({ type: 'damage-number', targetId: targetId.value!, value: dmg, color: '#ef4444', meta: { pos: { x: pos.cx, y: pos.y + 10 } } })
    }, 200)
  }
}

function triggerEffect(effectType: string) {
  if (!targetId.value) return

  if (effectType === 'death') {
    // WebGPU death dissolution
    const el = document.querySelector(`[data-instance-id="${targetId.value}"]`) as HTMLElement
    if (el && deathRef.value?.gpuReady) {
      deathRef.value.play(el)
      return
    }
  }

  const rect = getRect(targetId.value)
  if (!rect) return
  vfx.emit({ type: effectType as any, targetId: targetId.value, meta: { rect } })
}

function startAutoRepeat() {
  stopAutoRepeat()
  autoRepeat.value = true
  triggerAttack()
  _repeatTimer = setInterval(triggerAttack, repeatInterval.value)
}

function stopAutoRepeat() {
  autoRepeat.value = false
  if (_repeatTimer) { clearInterval(_repeatTimer); _repeatTimer = null }
}

watch([sourceId, targetId, attackType], () => stopAutoRepeat())

onUnmounted(() => stopAutoRepeat())

// Quick presets
function preset(srcSide: Side, srcLine: Line, tgtSide: Side, tgtLine: Line, type: AttackType) {
  const src = slots.value.find(s => s.side === srcSide && s.line === srcLine && s.occupied)
  const tgt = slots.value.find(s => s.side === tgtSide && s.line === tgtLine && s.occupied)
  if (src) sourceId.value = src.id
  if (tgt) targetId.value = tgt.id
  attackType.value = type
  selectionMode.value = 'source'
}
</script>

<template>
  <div class="vfx-arena-page">
    <!-- SIDEBAR -->
    <div class="va-sidebar">
      <div class="va-header">
        <NuxtLink to="/" class="va-back">
          <Icon icon="game-icons:return-arrow" />
        </NuxtLink>
        <div class="va-title">
          <Icon icon="game-icons:crossed-swords" class="va-title-icon" />
          <span>VFX Arena</span>
        </div>
      </div>

      <!-- Selection info -->
      <div class="va-section">
        <div class="va-section-label">Wybór kart</div>
        <div class="va-sel-info">
          <div :class="['va-sel-row', { active: selectionMode === 'source' }]" @click="selectionMode = 'source'">
            <span class="va-sel-dot va-dot-atk"></span>
            <span class="va-sel-label">Atakujący:</span>
            <span class="va-sel-value">{{ sourceSlot ? `${sourceSlot.label} (${sourceSlot.side === 'ai' ? 'AI' : 'Gracz'} ${LINE_SHORT[sourceSlot.line]})` : '— kliknij kartę —' }}</span>
          </div>
          <div :class="['va-sel-row', { active: selectionMode === 'target' }]" @click="selectionMode = 'target'">
            <span class="va-sel-dot va-dot-def"></span>
            <span class="va-sel-label">Cel:</span>
            <span class="va-sel-value">{{ targetSlot ? `${targetSlot.label} (${targetSlot.side === 'ai' ? 'AI' : 'Gracz'} ${LINE_SHORT[targetSlot.line]})` : '— kliknij kartę —' }}</span>
          </div>
          <button class="va-btn-clear" @click="clearSelection">Wyczyść</button>
        </div>
      </div>

      <!-- Attack type -->
      <div class="va-section">
        <div class="va-section-label">Typ ataku</div>
        <div class="va-atk-grid">
          <button :class="['va-atk-btn', { active: attackType === 'melee' }]" style="--ac: #ef4444" @click="attackType = 'melee'">
            <Icon icon="game-icons:broadsword" /> Wręcz
          </button>
          <button :class="['va-atk-btn', { active: attackType === 'elemental' }]" style="--ac: #f97316" @click="attackType = 'elemental'">
            <Icon icon="game-icons:fire-dash" /> Żywioł
          </button>
          <button :class="['va-atk-btn', { active: attackType === 'magic' }]" style="--ac: #a855f7" @click="attackType = 'magic'">
            <Icon icon="game-icons:magic-swirl" /> Magia
          </button>
          <button :class="['va-atk-btn', { active: attackType === 'ranged' }]" style="--ac: #60a5fa" @click="attackType = 'ranged'">
            <Icon icon="game-icons:archer" /> Dystans
          </button>
        </div>
        <label class="va-dmg-label">
          Obrażenia: {{ attackDamage }}
          <input type="range" min="1" max="15" v-model.number="attackDamage" class="va-slider" />
        </label>
      </div>

      <!-- Trigger -->
      <div class="va-section">
        <button class="va-trigger-btn" :disabled="!sourceId || !targetId" @click="triggerAttack">
          <Icon icon="game-icons:sword-clash" /> Atakuj!
        </button>
        <div class="va-repeat-row">
          <button :class="['va-repeat-btn', { active: autoRepeat }]" :disabled="!sourceId || !targetId" @click="autoRepeat ? stopAutoRepeat() : startAutoRepeat()">
            <Icon :icon="autoRepeat ? 'game-icons:pause-button' : 'game-icons:cycle'" />
            {{ autoRepeat ? 'Stop' : 'Auto' }}
          </button>
          <label class="va-interval-label">
            {{ repeatInterval }}ms
            <input type="range" min="500" max="5000" step="100" v-model.number="repeatInterval" class="va-slider" />
          </label>
        </div>
      </div>

      <!-- Quick presets -->
      <div class="va-section">
        <div class="va-section-label">Szybkie scenariusze</div>
        <div class="va-presets">
          <button class="va-preset" @click="preset('player', 1, 'ai', 1, 'melee')">Gracz L1 → AI L1 (wręcz)</button>
          <button class="va-preset" @click="preset('player', 2, 'ai', 1, 'ranged')">Gracz L2 → AI L1 (łuk)</button>
          <button class="va-preset" @click="preset('player', 3, 'ai', 2, 'magic')">Gracz L3 → AI L2 (magia)</button>
          <button class="va-preset" @click="preset('player', 2, 'ai', 3, 'ranged')">Gracz L2 → AI L3 (łuk)</button>
          <button class="va-preset" @click="preset('ai', 2, 'player', 1, 'ranged')">AI L2 → Gracz L1 (łuk)</button>
          <button class="va-preset" @click="preset('ai', 1, 'player', 1, 'melee')">AI L1 → Gracz L1 (wręcz)</button>
          <button class="va-preset" @click="preset('ai', 3, 'player', 2, 'magic')">AI L3 → Gracz L2 (magia)</button>
          <button class="va-preset" @click="preset('player', 2, 'ai', 1, 'elemental')">Gracz L2 → AI L1 (żywioł)</button>
        </div>
      </div>

      <!-- Extra effects on target -->
      <div class="va-section">
        <div class="va-section-label">Efekty (na cel)</div>
        <div class="va-fx-grid">
          <button class="va-fx-btn" style="--fc: #4ade80" :disabled="!targetId" @click="triggerEffect('heal')">Leczenie</button>
          <button class="va-fx-btn" style="--fc: #93c5fd" :disabled="!targetId" @click="triggerEffect('freeze')">Mróz</button>
          <button class="va-fx-btn" style="--fc: #22c55e" :disabled="!targetId" @click="triggerEffect('poison')">Trucizna</button>
          <button class="va-fx-btn" style="--fc: #fbbf24" :disabled="!targetId" @click="triggerEffect('lightning')">Piorun</button>
          <button class="va-fx-btn" style="--fc: #fde68a" :disabled="!targetId" @click="triggerEffect('stun')">Ogłuszenie</button>
          <button class="va-fx-btn" style="--fc: #64748b" :disabled="!targetId" @click="triggerEffect('death')">Śmierć</button>
          <button class="va-fx-btn" style="--fc: #fde68a" :disabled="!targetId" @click="triggerEffect('resurrect')">Wskrzeszenie</button>
          <button class="va-fx-btn" style="--fc: #93c5fd" :disabled="!targetId" @click="triggerEffect('shield-break')">Tarcza</button>
        </div>
      </div>
    </div>

    <!-- BATTLEFIELD — mirrors actual game layout (horizontal: AI left, Player right) -->
    <div class="va-battlefield game-board">
      <!-- VFX layers -->
      <ClientOnly><SlashAttackVFX ref="slashRef" /></ClientOnly>
      <ClientOnly><BowAttackVFX ref="bowRef" /></ClientOnly>
      <ClientOnly><DeathVFX ref="deathRef" /></ClientOnly>
      <ClientOnly><ElementalVFX ref="elementalRef" /></ClientOnly>
      <ClientOnly><MagicVFX ref="magicRef" /></ClientOnly>
      <ClientOnly><VFXOverlay /></ClientOnly>

      <!-- Vignette overlay -->
      <div class="va-vignette" />

      <div class="board-main">
        <!-- AI LABEL -->
        <div class="field-label field-label--enemy">WRÓG</div>

        <!-- AI FIELD: L3 | L2 | L1 (FRONT rightmost, nearest center) -->
        <div class="player-field player-field--enemy">
          <div v-for="line in ([3, 2, 1] as Line[])" :key="'ai-'+line" class="battle-line" :class="'line-'+line">
            <div class="line-header">
              <span class="line-rune">{{ LINE_RUNE[line] }}</span>
              <span class="line-label-text">{{ LINE_NAME[line] }}</span>
              <span class="line-realm">{{ LINE_REALM[line] }}</span>
            </div>
            <div class="line-ornament" />
            <div class="cards-col">
              <div
                v-for="s in slots.filter(x => x.side === 'ai' && x.line === line)"
                :key="s.id"
                :data-instance-id="s.id"
                :class="[
                  s.occupied ? 'card-wrap' : 'slot-empty',
                  {
                    'is-source': sourceId === s.id,
                    'is-target': targetId === s.id,
                  }
                ]"
                @click="selectSlot(s)"
              >
                <template v-if="s.occupied">
                  <div class="va-card-inner card-inner">
                    <Icon :icon="s.icon" class="va-card-icon" />
                    <div class="va-card-name">{{ s.label }}</div>
                    <div class="va-card-stats"><span class="va-atk-val">{{ s.atk }}</span>/<span class="va-def-val">{{ s.def }}</span></div>
                  </div>
                </template>
                <template v-else>
                  <div class="slot-rune">{{ LINE_RUNE[line] }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- CENTER DIVIDER -->
        <div class="center-divider">
          <div class="divider-line" />
          <div class="divider-badge">⚔</div>
          <div class="divider-line" />
        </div>

        <!-- PLAYER FIELD: L1 | L2 | L3 (FRONT leftmost, nearest center) -->
        <div class="player-field player-field--player">
          <div v-for="line in ([3, 2, 1] as Line[])" :key="'player-'+line" class="battle-line" :class="'line-'+line">
            <div class="line-header">
              <span class="line-rune">{{ LINE_RUNE[line] }}</span>
              <span class="line-label-text">{{ LINE_NAME[line] }}</span>
              <span class="line-realm">{{ LINE_REALM[line] }}</span>
            </div>
            <div class="line-ornament" />
            <div class="cards-col">
              <div
                v-for="s in slots.filter(x => x.side === 'player' && x.line === line)"
                :key="s.id"
                :data-instance-id="s.id"
                :class="[
                  s.occupied ? 'card-wrap' : 'slot-empty',
                  {
                    'is-source': sourceId === s.id,
                    'is-target': targetId === s.id,
                  }
                ]"
                @click="selectSlot(s)"
              >
                <template v-if="s.occupied">
                  <div class="va-card-inner card-inner">
                    <Icon :icon="s.icon" class="va-card-icon" />
                    <div class="va-card-name">{{ s.label }}</div>
                    <div class="va-card-stats"><span class="va-atk-val">{{ s.atk }}</span>/<span class="va-def-val">{{ s.def }}</span></div>
                  </div>
                </template>
                <template v-else>
                  <div class="slot-rune">{{ LINE_RUNE[line] }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- PLAYER LABEL -->
        <div class="field-label field-label--player">TY</div>
      </div>

      <!-- Selection hint -->
      <div v-if="!sourceId" class="va-hint">
        Kliknij kartę aby wybrać atakującego, potem cel
      </div>
      <div v-else-if="!targetId" class="va-hint va-hint-target">
        Teraz kliknij kartę-cel
      </div>
    </div>
  </div>
</template>

<style scoped>
.vfx-arena-page {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #04030a;
}

/* ===== SIDEBAR ===== */
.va-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: rgba(10, 12, 20, 0.95);
  border-right: 1px solid rgba(200, 168, 78, 0.08);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(200, 168, 78, 0.15) transparent;
}

.va-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.va-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px; height: 30px;
  color: #475569;
  text-decoration: none;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: color 0.15s, border-color 0.15s;
}
.va-back:hover { color: #e2e8f0; border-color: rgba(255, 255, 255, 0.15); }
.va-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 800;
  color: #e2e8f0;
}
.va-title-icon { font-size: 18px; color: #c8a84e; }

.va-section {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.va-section-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(200, 168, 78, 0.4);
  margin-bottom: 8px;
}

/* Selection info */
.va-sel-info { display: flex; flex-direction: column; gap: 6px; }
.va-sel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: border-color 0.15s;
}
.va-sel-row.active { border-color: rgba(200, 168, 78, 0.3); background: rgba(200, 168, 78, 0.04); }
.va-sel-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.va-dot-atk { background: #ef4444; box-shadow: 0 0 6px rgba(239, 68, 68, 0.5); }
.va-dot-def { background: #60a5fa; box-shadow: 0 0 6px rgba(96, 165, 250, 0.5); }
.va-sel-label { font-size: 10px; font-weight: 700; color: #64748b; }
.va-sel-value { font-size: 10px; color: #94a3b8; flex: 1; text-align: right; }
.va-btn-clear {
  font-size: 10px; font-weight: 600; color: #475569;
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px; padding: 3px 8px; cursor: pointer;
  align-self: flex-end;
  transition: color 0.15s;
}
.va-btn-clear:hover { color: #94a3b8; }

/* Attack type grid */
.va-atk-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.va-atk-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 8px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  color: #64748b;
  font-size: 11px; font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}
.va-atk-btn:hover { color: #94a3b8; }
.va-atk-btn.active {
  color: var(--ac);
  border-color: var(--ac);
  background: color-mix(in srgb, var(--ac) 8%, transparent);
}

.va-dmg-label {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px;
  font-size: 11px; font-weight: 600; color: #475569;
}

.va-slider {
  flex: 1; height: 4px;
  -webkit-appearance: none; appearance: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px; outline: none; cursor: pointer;
}
.va-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: #c8a84e; border: 2px solid #0a0c14; cursor: pointer;
}

/* Trigger */
.va-trigger-btn {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; border-radius: 8px;
  border: 2px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 14px; font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s;
}
.va-trigger-btn:hover:not(:disabled) { background: rgba(239, 68, 68, 0.15); }
.va-trigger-btn:active:not(:disabled) { transform: scale(0.97); }
.va-trigger-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.va-repeat-row {
  display: flex; align-items: center; gap: 8px; margin-top: 8px;
}
.va-repeat-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent; color: #64748b;
  font-size: 11px; font-weight: 600; cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.va-repeat-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.va-repeat-btn.active {
  color: #4ade80;
  border-color: rgba(74, 222, 128, 0.4);
  background: rgba(74, 222, 128, 0.06);
}
.va-interval-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 600; color: #475569; flex: 1;
}

/* Presets */
.va-presets { display: flex; flex-direction: column; gap: 3px; }
.va-preset {
  text-align: left;
  padding: 5px 8px; border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: transparent; color: #64748b;
  font-size: 10px; font-weight: 600; cursor: pointer;
  transition: color 0.12s, background-color 0.12s;
}
.va-preset:hover { color: #94a3b8; background: rgba(255, 255, 255, 0.03); }

/* FX buttons */
.va-fx-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 3px;
}
.va-fx-btn {
  padding: 4px 6px; border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--fc) 30%, transparent);
  background: color-mix(in srgb, var(--fc) 5%, transparent);
  color: var(--fc);
  font-size: 10px; font-weight: 600; cursor: pointer;
  transition: background-color 0.15s;
}
.va-fx-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--fc) 12%, transparent); }
.va-fx-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ===== BATTLEFIELD — mirrors GameBoard layout ===== */
.va-battlefield {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--bg-board, #04030a);
  color: var(--text-primary, #e2e8f0);
}

/* Vignette */
.va-vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 85% 70% at 50% 50%,
      transparent 30%,
      rgba(0, 0, 0, 0.55) 100%
    );
}

/* Board main — horizontal: AI left, Player right */
.board-main {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  z-index: 3;
}

/* ===== FIELD LABELS (vertical text) ===== */
.field-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  flex-shrink: 0;
  user-select: none;
}
.field-label--enemy { color: rgba(248, 113, 113, 0.6); }
.field-label--player { color: rgba(134, 239, 172, 0.6); }

/* ===== PLAYER FIELD — 3 line columns ===== */
.player-field {
  display: flex;
  flex-direction: row;
  flex: 1;
  gap: 2px;
  min-height: 0;
  height: 100%;
}
.player-field--player {
  flex-direction: row-reverse;
  border-bottom: 1px solid rgba(34, 197, 94, 0.12);
}
.player-field--enemy {
  border-bottom: 1px solid rgba(239, 68, 68, 0.12);
  background: rgba(239, 68, 68, 0.02);
}

/* ===== BATTLE LINE — vertical column of cards ===== */
.battle-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 100px;
  height: 100%;
  padding: 2px 4px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  background: rgba(0, 0, 0, 0.12);
  position: relative;
  gap: 2px;
}

.line-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 0 0;
  user-select: none;
  flex-shrink: 0;
}
.line-rune {
  font-size: 12px;
  color: rgba(200, 168, 78, 0.5);
}
.line-label-text {
  font-family: var(--font-display, Georgia, serif);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(200, 168, 78, 0.3);
}
.line-realm {
  font-size: 8px;
  color: rgba(200, 168, 78, 0.15);
  font-weight: 600;
}
.line-ornament {
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 168, 78, 0.12), transparent);
  flex-shrink: 0;
}

/* Cards column — vertical stacking like real game */
.cards-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: center;
  width: 100%;
}

/* ===== CARD SLOTS ===== */
.card-wrap {
  width: 90px;
  height: 110px;
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}
.card-wrap:hover { transform: scale(1.04); }

.va-card-inner {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: linear-gradient(165deg, #1a1520 0%, #0d0a14 100%);
  border: 2px solid rgba(200, 168, 78, 0.2);
  transition: border-color 0.15s;
}
.card-wrap:hover .va-card-inner {
  border-color: rgba(200, 168, 78, 0.4);
}

.slot-empty {
  width: 90px;
  height: 110px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.01);
  border: 1px dashed rgba(255, 255, 255, 0.06);
}
.slot-rune {
  font-size: 18px;
  color: rgba(200, 168, 78, 0.08);
}

/* Selection highlights */
.is-source .va-card-inner,
.card-wrap.is-source .va-card-inner {
  border-color: #ef4444 !important;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.3), inset 0 0 8px rgba(239, 68, 68, 0.1);
}
.is-target .va-card-inner,
.card-wrap.is-target .va-card-inner {
  border-color: #60a5fa !important;
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.3), inset 0 0 8px rgba(96, 165, 250, 0.1);
}

/* Card content */
.va-card-icon { font-size: 28px; color: rgba(200, 168, 78, 0.4); }
.va-card-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 9px; font-weight: 500; color: #94a3b8;
  text-align: center; line-height: 1.2;
}
.va-card-stats {
  font-family: var(--font-display, Georgia, serif);
  font-size: 13px; font-weight: 500;
}
.va-atk-val { color: #f87171; }
.va-def-val { color: #60a5fa; }

/* ===== CENTER DIVIDER (vertical) ===== */
.center-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  flex-shrink: 0;
  width: 24px;
}
.divider-line {
  flex: 1;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(200, 168, 78, 0.2), transparent);
}
.divider-badge {
  font-size: 14px;
  padding: 6px 0;
  color: rgba(200, 168, 78, 0.4);
  user-select: none;
}

/* ===== HINTS ===== */
.va-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #334155;
  padding: 6px 16px;
  border-radius: 6px;
  background: rgba(10, 12, 20, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.04);
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.va-hint-target { color: #60a5fa; border-color: rgba(96, 165, 250, 0.2); }
</style>
