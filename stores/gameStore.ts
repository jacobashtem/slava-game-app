/**
 * gameStore — Pinia bridge między GameEngine a Vue UI.
 * Trzyma reaktywny stan gry i eksponuje akcje dla komponentów.
 */

import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch, nextTick, type Ref } from 'vue'
import { GameEngine } from '../game-engine/GameEngine'
import { AIPlayer } from '../game-engine/AIPlayer'
import type { AIDifficulty } from '../game-engine/AIPlayer'
import type { GameState, CardInstance, LogEntry } from '../game-engine/types'
import { GamePhase, BattleLine, CardPosition } from '../game-engine/constants'
import { canAttack, getAllCreaturesOnField } from '../game-engine/LineManager'
import { getEffect } from '../game-engine/EffectRegistry'
import type { PlayerSide } from '../game-engine/types'
import { useUIStore } from './uiStore'
import { useVFXOrchestrator, type AttackVisualType } from '../composables/useVFXOrchestrator'
import { useSlashAttack } from '../composables/useSlashAttack'
import { useBowAttack } from '../composables/useBowAttack'
import { useElementalAttack } from '../composables/useElementalAttack'
import { useMagicAttack } from '../composables/useMagicAttack'
import { useDeathVFX } from '../composables/useDeathVFX'
import type { CombatResult } from '../game-engine/types'
import { AttackType } from '../game-engine/constants'

/** Map engine AttackType enum to VFX visual type string */
function toVisualAttackType(card: CombatResult['attacker']): AttackVisualType {
  const data = card.cardData as { attackType?: number }
  const at = data.attackType
  if (at === AttackType.MELEE) return 'melee'
  if (at === AttackType.ELEMENTAL) return 'elemental'
  if (at === AttackType.MAGIC) return 'magic'
  return 'ranged'
}

/**
 * Snapshot a card's screen position BEFORE state update removes it from DOM.
 * Returns center-top coordinates or null if card not found.
 */
interface CardRect { x: number; y: number; cx: number; cy: number; w: number; h: number }

function snapshotCardRect(instanceId: string): CardRect | null {
  const el = document.querySelector(`[data-instance-id="${instanceId}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
}

/**
 * Reveal both combatants on the CURRENT state immediately.
 * This ensures cards are face-up during VFX (before delayed state update).
 */
function revealCombatants(currentState: GameState, combat: CombatResult) {
  for (const side of ['player1', 'player2'] as const) {
    for (const card of getAllCreaturesOnField(currentState, side)) {
      if (card.instanceId === combat.attacker.instanceId ||
          card.instanceId === combat.defender.instanceId) {
        card.isRevealed = true
      }
    }
  }
}

/** Legacy compat — returns { x: centerX, y: top } */
function snapshotCardPosition(instanceId: string): { x: number; y: number } | null {
  const r = snapshotCardRect(instanceId)
  if (!r) return null
  return { x: r.cx, y: r.y }
}

/**
 * Total VFX duration for combat sequence.
 * Used by attack() to delay state update / end-turn.
 */
const COMBAT_VFX_BASE_MS = 1200     // hit + shake + damage number (canvas fallback)
const COMBAT_VFX_SLASH_MS = 2200    // WebGPU slash full choreography (melee)
const COMBAT_VFX_BOW_MS = 2400      // WebGPU bow draw + arrow flight + impact (ranged)
const COMBAT_VFX_ELEMENTAL_MS = 2600 // WebGPU fire orb charge + flight + impact (elemental)
const COMBAT_VFX_MAGIC_MS = 1600    // WebGPU crystal orb + explosion (magic)
const COMBAT_VFX_COUNTER_MS = 1800  // counter overlay (600ms) + hit + damage (1200ms)
const COMBAT_VFX_DEATH_MS = 2000    // WebGPU death dissolution

function getCombatVFXDuration(combat: CombatResult | null): number {
  if (!combat) return 0
  const attackVisual = toVisualAttackType(combat.attacker)
  const isSlash = attackVisual === 'melee' && useSlashAttack().ready
  const isBow = attackVisual === 'ranged' && useBowAttack().ready
  const isElemental = attackVisual === 'elemental' && useElementalAttack().ready
  const isMagic = attackVisual === 'magic' && useMagicAttack().ready
  let ms = isSlash ? COMBAT_VFX_SLASH_MS
    : isBow ? COMBAT_VFX_BOW_MS
    : isElemental ? COMBAT_VFX_ELEMENTAL_MS
    : isMagic ? COMBAT_VFX_MAGIC_MS
    : COMBAT_VFX_BASE_MS
  if (combat.counterattackOccurred && combat.damageToAttacker > 0) ms += COMBAT_VFX_COUNTER_MS
  if ((combat.defenderDied || combat.attackerDied) && useDeathVFX().ready) ms += COMBAT_VFX_DEATH_MS
  return ms
}

/**
 * Find a card on the field by instanceId across both sides & all lines.
 * Mutating its currentStats triggers Vue reactivity (shallow ref spread).
 */
function findCardInLiveState(stateRef: Ref<GameState | null>, instanceId: string): CardInstance | null {
  const s = stateRef.value
  if (!s) return null
  for (const side of ['player1', 'player2'] as const) {
    for (const creatures of Object.values(s.players[side].field.lines)) {
      const card = (creatures as CardInstance[]).find(c => c.instanceId === instanceId)
      if (card) return card
    }
  }
  return null
}

// Track combat VFX timeouts for cleanup on unmount/new combat
const _combatTimeouts: ReturnType<typeof setTimeout>[] = []

function clearCombatTimeouts() {
  _combatTimeouts.forEach(clearTimeout)
  _combatTimeouts.length = 0
}

function combatTimeout(fn: () => void, ms: number) {
  _combatTimeouts.push(setTimeout(fn, ms))
}

/**
 * Emit SEQUENCED VFX events from a CombatResult.
 * Timeline:
 *   0ms   — hit particles on defender + damage number
 *   BASE_MS — defender DEF updates on card
 *   BASE_MS — counter-attack hit on attacker + damage number (if counter)
 *   BASE_MS + COUNTER_MS — attacker DEF updates, then death VFX
 */
function emitCombatVFX(
  vfx: ReturnType<typeof useVFXOrchestrator>,
  combat: CombatResult | null,
  stateRef?: Ref<GameState | null>,
) {
  if (!combat) {
    if (import.meta.dev) console.warn('[VFX] emitCombatVFX called with null combat')
    return
  }
  clearCombatTimeouts()
  const ui = useUIStore()
  const attackVisual = toVisualAttackType(combat.attacker)

  // Snapshot FULL rects NOW — before state update removes dead cards from DOM
  const defenderRect = snapshotCardRect(combat.defender.instanceId)
  const attackerRect = snapshotCardRect(combat.attacker.instanceId)
  const defenderPos = defenderRect ? { x: defenderRect.cx, y: defenderRect.y } : null
  const attackerPos = attackerRect ? { x: attackerRect.cx, y: attackerRect.y } : null

  if (import.meta.dev) {
    console.info('[VFX] Combat:', combat.attacker.cardData.name, '→', combat.defender.cardData.name,
      'dmg:', combat.damageToDefender, '/', combat.damageToAttacker)
  }

  let t = 0

  // === PHASE 1a: SoftFail / Odporny — shield block VFX (0ms) ===
  // Card overlay shows "ODPORNY" — no extra floating text needed
  if (combat.softFail && defenderRect) {
    combatTimeout(() => {
      ui.flashBlock(combat.defender.instanceId)
      vfx.emit({
        type: 'block',
        targetId: combat.defender.instanceId,
        attackType: attackVisual,
        label: combat.softFailReason ?? 'Odporny!',
        meta: { rect: defenderRect, attackerRect },
      })
    }, t)
  }
  // === PHASE 1b: Normal hit on defender (0ms) ===
  else if (defenderRect) {
    // Nawet przy 0 dmg — pokaż animację ataku (np. Bugaj 0 ATK, hipnoza)
    const hasDamage = combat.damageToDefender > 0
    const slash = useSlashAttack()
    const bow = useBowAttack()
    const elemental = useElementalAttack()
    const magic = useMagicAttack()
    const useSlash = attackVisual === 'melee' && slash.ready
    const useBow = attackVisual === 'ranged' && bow.ready
    const useElemental = attackVisual === 'elemental' && elemental.ready
    const useMagic = attackVisual === 'magic' && magic.ready

    if (hasDamage && useSlash) {
      combatTimeout(() => {
        slash.trigger(combat.attacker.instanceId, combat.defender.instanceId, combat.damageToDefender)
      }, t)
    } else if (hasDamage && useBow) {
      combatTimeout(() => {
        bow.trigger(combat.attacker.instanceId, combat.defender.instanceId, combat.damageToDefender)
      }, t)
    } else if (hasDamage && useElemental) {
      combatTimeout(() => {
        elemental.trigger(combat.attacker.instanceId, combat.defender.instanceId, combat.damageToDefender)
      }, t)
    } else if (hasDamage && useMagic) {
      combatTimeout(() => {
        magic.trigger(combat.attacker.instanceId, combat.defender.instanceId, combat.damageToDefender)
      }, t)
    } else {
      // Fallback / 0-dmg: canvas particle hit + shake + damage number
      combatTimeout(() => {
        ui.shakeCard(combat.defender.instanceId)
        vfx.emit({
          type: 'hit',
          targetId: combat.defender.instanceId,
          attackType: attackVisual,
          value: combat.damageToDefender,
          meta: { rect: defenderRect, attackerRect },
        })
      }, t)
      combatTimeout(() => {
        if (!defenderPos) return
        vfx.emit({
          type: 'damage-number',
          targetId: combat.defender.instanceId,
          value: combat.damageToDefender,
          color: hasDamage ? '#ef4444' : '#94a3b8',
          attackType: attackVisual,
          meta: { pos: defenderPos },
        })
      }, t + 200)
    }
  }

  t += COMBAT_VFX_BASE_MS

  // === Intermediate: update defender DEF on card after hit VFX ===
  if (stateRef && combat.damageToDefender > 0 && !combat.softFail) {
    combatTimeout(() => {
      const card = findCardInLiveState(stateRef, combat.defender.instanceId)
      if (card) {
        card.currentStats = {
          ...card.currentStats,
          defense: Math.max(0, card.currentStats.defense - combat.damageToDefender),
        }
        stateRef.value = { ...stateRef.value! }
      }
    }, t - 200) // slightly before counter starts
  }

  // === PHASE 2: Counter-attack (700ms) ===
  // Overlay: DEFENDER shows shield (they're counter-attacking)
  // Particles + blue damage: on ATTACKER (they're receiving the hit)
  if (combat.counterattackOccurred && combat.damageToAttacker > 0) {
    const counterVisual = toVisualAttackType(combat.defender)
    if (import.meta.dev) console.info('[VFX] Counter:', combat.attacker.cardData.name, counterVisual)
    // Counter overlay on defender (they're counter-attacking) — shows first
    combatTimeout(() => {
      if (!attackerRect) return
      ui.flashCounterAttack(combat.defender.instanceId)
    }, t)

    const slash = useSlashAttack()
    const bow = useBowAttack()
    const elemental = useElementalAttack()
    const magic = useMagicAttack()
    const useSlashCounter = counterVisual === 'melee' && slash.ready
    const useBowCounter = counterVisual === 'ranged' && bow.ready
    const useElementalCounter = counterVisual === 'elemental' && elemental.ready
    const useMagicCounter = counterVisual === 'magic' && magic.ready

    if (useSlashCounter) {
      // Melee counter: WebGPU slash (defender strikes back at attacker)
      combatTimeout(() => {
        slash.trigger(combat.defender.instanceId, combat.attacker.instanceId, combat.damageToAttacker)
      }, t + 600)
    } else if (useBowCounter) {
      // Ranged counter: bow attack (defender shoots at attacker)
      combatTimeout(() => {
        bow.trigger(combat.defender.instanceId, combat.attacker.instanceId, combat.damageToAttacker)
      }, t + 600)
    } else if (useElementalCounter) {
      // Elemental counter: fire orb (defender strikes back)
      combatTimeout(() => {
        elemental.trigger(combat.defender.instanceId, combat.attacker.instanceId, combat.damageToAttacker)
      }, t + 600)
    } else if (useMagicCounter) {
      // Magic counter: rune circles + implosion (defender strikes back)
      combatTimeout(() => {
        magic.trigger(combat.defender.instanceId, combat.attacker.instanceId, combat.damageToAttacker)
      }, t + 600)
    } else {
      // Fallback: canvas particle hit
      combatTimeout(() => {
        if (!attackerRect) return
        ui.shakeCard(combat.attacker.instanceId)
        vfx.emit({
          type: 'hit',
          targetId: combat.attacker.instanceId,
          attackType: counterVisual,
          value: combat.damageToAttacker,
          label: 'kontra',
          meta: { rect: attackerRect },
        })
      }, t + 600)
      // Counter damage number — delayed 800ms
      combatTimeout(() => {
        if (!attackerPos) return
        vfx.emit({
          type: 'damage-number',
          targetId: combat.attacker.instanceId,
          value: combat.damageToAttacker,
          color: '#3b82f6',
          label: 'kontra',
          meta: { pos: attackerPos },
        })
      }, t + 800)
    }

    // === Intermediate: update attacker DEF on card after counter VFX ===
    if (stateRef && combat.damageToAttacker > 0) {
      combatTimeout(() => {
        const card = findCardInLiveState(stateRef, combat.attacker.instanceId)
        if (card) {
          card.currentStats = {
            ...card.currentStats,
            defense: Math.max(0, card.currentStats.defense - combat.damageToAttacker),
          }
          stateRef.value = { ...stateRef.value! }
        }
      }, t + COMBAT_VFX_COUNTER_MS - 200) // just before death
    }

    t += COMBAT_VFX_COUNTER_MS
  }

  // === PHASE 3: Death (WebGPU smoke + soul wisp) ===
  const death = useDeathVFX()
  if (death.ready) {
    if (combat.defenderDied) {
      combatTimeout(() => {
        death.trigger(combat.defender.instanceId)
      }, t)
    }
    if (combat.attackerDied) {
      combatTimeout(() => {
        death.trigger(combat.attacker.instanceId)
      }, t + 200) // slight stagger if both die
    }
  }
}

export const useGameStore = defineStore('game', () => {
  // ===== STATE =====
  const engine = new GameEngine()
  let aiPlayer = new AIPlayer('player2', 'medium')
  const selectedDifficulty = ref<AIDifficulty>('medium')
  const selectedDomains = ref<number[]>([]) // empty = all domains

  const state = shallowRef<GameState | null>(null)
  const isAIThinking = ref(false)
  const gameStarted = ref(false)
  const aiTurnSummary = ref<string[]>([])
  const playerTurnSummary = ref<string[]>([])
  const isArenaMode = ref(false)
  const arenaFocusedName = ref('')
  const playerTurnLogStart = ref(0)
  const aiTurnLogStart = ref(0)

  // ===== MULTIPLAYER =====
  const isMultiplayerMode = ref(false)
  const mySide = ref<PlayerSide>('player1')

  /** Called by useMultiplayer when server sends state update */
  function receiveMultiplayerState(newState: GameState) {
    state.value = newState
    gameStarted.value = true
    isMultiplayerMode.value = true
  }

  /** Initialize multiplayer mode (called from lobby) */
  function startMultiplayer(side: PlayerSide) {
    isMultiplayerMode.value = true
    mySide.value = side
    isArenaMode.value = false
    arenaFocusedName.value = ''
    gameStarted.value = false
  }

  /**
   * Multiplayer action sender — set by game.vue when in multiplayer mode.
   * When set, player actions are routed through this callback (→ WebSocket)
   * instead of the local GameEngine.
   */
  let mpSend: ((msg: Record<string, unknown>) => void) | null = null
  function setMultiplayerSender(sender: ((msg: Record<string, unknown>) => void) | null) {
    mpSend = sender
  }
  // ===== COMPUTED =====
  const player = computed(() => state.value?.players[mySide.value] ?? null)
  const opponentSide = computed<PlayerSide>(() => mySide.value === 'player1' ? 'player2' : 'player1')
  const ai = computed(() => state.value?.players[opponentSide.value] ?? null)
  const currentTurn = computed(() => state.value?.currentTurn ?? 'player1')
  const currentPhase = computed(() => state.value?.currentPhase ?? GamePhase.START)
  const winner = computed(() => state.value?.winner ?? null)
  const actionLog = computed(() => state.value?.actionLog ?? [])
  const roundNumber = computed(() => state.value?.roundNumber ?? 1)
  const ROUNDS_PER_SEASON = 12  // season changes every 12 rounds (jak w Sława)
  const season = computed<'spring' | 'summer' | 'autumn' | 'winter'>(() => {
    // Sława: sezon z slavaData
    if (state.value?.gameMode === 'slava' && state.value.slavaData) {
      const seasonMap = ['winter', 'spring', 'summer', 'autumn'] as const
      return seasonMap[state.value.slavaData.currentSeason] ?? 'winter'
    }
    // Gold Edition: cycling seasons (2 rounds per season), z losowym offsetem startowym
    const r = roundNumber.value
    const offset = state.value?.seasonOffset ?? 0
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
    const shifted = (r - 1) + offset * ROUNDS_PER_SEASON
    const idx = Math.floor((shifted % (ROUNDS_PER_SEASON * 4)) / ROUNDS_PER_SEASON)
    return seasons[idx] ?? 'spring'
  })
  const gameMode = computed(() => state.value?.gameMode ?? 'gold')
  const slavaData = computed(() => state.value?.slavaData ?? null)
  const playerGlory = computed(() => state.value?.players[mySide.value].glory ?? 0)
  const aiGlory = computed(() => state.value?.players[opponentSide.value].glory ?? 0)
  const isPlayerTurn = computed(() => currentTurn.value === mySide.value && !isAIThinking.value)

  // Field threats — cached scan for Południca/Cicha (avoids N×M iteration in each CreatureCard)
  const fieldThreats = computed(() => {
    if (!state.value) return null
    const enemyField = Object.values(state.value.players[opponentSide.value].field.lines).flat()
    const playerField = Object.values(state.value.players[mySide.value].field.lines).flat()

    const hasPoludnica = enemyField.some(c => (c.cardData as any).effectId === 'poludnica_kill_weakest' && !c.isSilenced)
    const hasCicha = enemyField.some(c => (c.cardData as any).effectId === 'cicha_kill_weak' && !c.isSilenced)
      || playerField.some(c => (c.cardData as any).effectId === 'cicha_kill_weak' && !c.isSilenced)

    let weakestId: string | null = null
    if (hasPoludnica) {
      const allAlive = [...playerField, ...enemyField].filter(c => c.currentStats.defense > 0)
      if (allAlive.length > 0) {
        weakestId = allAlive.reduce((a, b) => a.currentStats.defense < b.currentStats.defense ? a : b).instanceId
      }
    }

    return { hasCicha, hasPoludnica, weakestId }
  })
  const playerCurrentLogs = computed(() => (state.value?.actionLog ?? []).slice(playerTurnLogStart.value).slice(-6))
  const aiCurrentLogs = computed(() => {
    const log = state.value?.actionLog ?? []
    // Scope AI logs to only the AI turn range (not player entries that come after)
    const end = playerTurnLogStart.value > aiTurnLogStart.value ? playerTurnLogStart.value : log.length
    return log.slice(aiTurnLogStart.value, end).slice(-6)
  })

  // ===== SETUP =====
  function setDifficulty(diff: AIDifficulty) {
    selectedDifficulty.value = diff
  }

  function setDomains(domains: number[]) {
    selectedDomains.value = domains
  }

  function startGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    useUIStore().resetAll()
    aiPlayer = new AIPlayer('player2', selectedDifficulty.value)
    const domainFilter = selectedDomains.value.length > 0 ? selectedDomains.value : undefined
    state.value = engine.startSlavaGame(domainFilter)
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    } else {
      useUIStore().startTurnTimer()
    }
  }

  function setupArenaMode(freshState: GameState, focusedName = '') {
    isArenaMode.value = true
    arenaFocusedName.value = focusedName
    state.value = engine.setupArena(freshState)
    gameStarted.value = true
  }

  function startAlphaGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    useUIStore().resetAll()
    aiPlayer = new AIPlayer('player2', selectedDifficulty.value)
    const domainFilter = selectedDomains.value.length > 0 ? selectedDomains.value : undefined
    state.value = engine.startAlphaGame(domainFilter)
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    } else {
      useUIStore().startTurnTimer()
    }
  }

  function startSlavaGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    useUIStore().resetAll()
    aiPlayer = new AIPlayer('player2', selectedDifficulty.value)
    const domainFilter = selectedDomains.value.length > 0 ? selectedDomains.value : undefined
    state.value = engine.startSlavaGame(domainFilter)
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    } else {
      useUIStore().startTurnTimer()
    }
  }

  // ===== SLAVA: INVOKE GOD =====
  function invokeGod(godId: number, bid: number) {
    if (!state.value) return
    if (mpSend) { mpSend({ type: 'invoke_god', godId, bid }); return }
    try {
      state.value = engine.playerInvokeGod(godId, bid)
    } catch (err: any) {
      if (import.meta.dev) console.warn('[gameStore] invokeGod error:', err)
      const ui = useUIStore()
      ui.showPlayLimitToast(err.message ?? 'Nie można przyzwać boga.')
    }
  }

  function activateFavor(targetInstanceId?: string) {
    if (!state.value) return
    if (mpSend) { mpSend({ type: 'activate_favor', targetInstanceId }); return }
    try {
      state.value = engine.playerActivateFavor(targetInstanceId)
    } catch (err: any) {
      if (import.meta.dev) console.warn('[gameStore] activateFavor error:', err)
      const ui = useUIStore()
      ui.showPlayLimitToast(err.message ?? 'Nie można złożyć ofiary.')
    }
  }

  function playerClaimHoliday() {
    if (!state.value) return
    if (mpSend) { mpSend({ type: 'claim_holiday' }); return }
    try {
      state.value = engine.playerClaimHoliday()
    } catch (err: any) {
      if (import.meta.dev) console.warn('[gameStore] claimHoliday error:', err)
    }
  }

  function plunder() {
    if (!state.value || !isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'plunder' }); return }
    try {
      state.value = engine.playerPlunder()
    } catch (err: any) {
      if (import.meta.dev) console.warn('[gameStore] plunder error:', err)
      const ui = useUIStore()
      ui.showPlayLimitToast(err.message ?? 'Nie można łupić.')
    }
  }

  // ===== AKCJE GRACZA =====
  function playCreature(cardInstanceId: string, line: BattleLine, slotIndex?: number) {
    if (!isPlayerTurn.value) return
    if (mpSend) {
      mpSend({ type: 'play_creature', cardInstanceId, targetLine: line, slotIndex })
      useUIStore().clearSelection()
      return
    }
    const ui = useUIStore()
    try {
      const newState = engine.playerPlayCreature(cardInstanceId, line, slotIndex)
      ui.clearSelection()
      // Apply state in nextTick to avoid Vue re-render collision
      // (synchronous assignment can crash mid-render, breaking the component tree)
      safeUpdateState(newState)
    } catch (e: any) {
      if (e.message?.includes('limit') || e.message?.includes('pełna') || e.message?.includes('MAX')) {
        ui.showPlayLimitToast('Pole jest pełne! Maksymalnie 5 istot.')
      } else {
        ui.showPlayLimitToast(e.message ?? 'Nie można wystawić istoty.')
      }
      ui.clearSelection()
    }
  }

  function playAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false) {
    if (!isPlayerTurn.value) return
    if (mpSend) {
      mpSend({ type: 'play_adventure', cardInstanceId, targetInstanceId, useEnhanced })
      useUIStore().clearSelection()
      return
    }
    const ui = useUIStore()
    try {
      const newState = engine.playerPlayAdventure(cardInstanceId, targetInstanceId, useEnhanced)
      ui.clearSelection()
      safeUpdateState(newState)
    } catch (e: any) {
      ui.showPlayLimitToast(e.message ?? 'Nie można zagrać karty przygody.')
      ui.clearSelection()
    }
  }

  function attack(attackerInstanceId: string, defenderInstanceId: string) {
    if (!isPlayerTurn.value) return
    if (mpSend) {
      mpSend({ type: 'attack', attackerInstanceId, defenderInstanceId })
      useUIStore().clearSelection()
      return
    }
    const ui = useUIStore()
    const vfx = useVFXOrchestrator()

    try {
      // Resolve combat — SYNCHRONOUS, no delays
      const newState = engine.playerAttack(attackerInstanceId, defenderInstanceId)
      const combatResult = engine.lastCombatResult

      // Reveal combat participants IMMEDIATELY (before delayed state update)
      // so cards are visible during VFX — especially important for AI cards
      if (state.value && combatResult) {
        revealCombatants(state.value, combatResult)
        state.value = { ...state.value } // trigger reactivity
      }

      // Emit VFX events from combat result
      emitCombatVFX(vfx, combatResult, state)
      engine.lastCombatResult = null

      // Clear selection immediately so player can't double-attack
      ui.clearSelection()

      // DELAY state update to let VFX play (dead cards need to stay in DOM)
      const vfxMs = getCombatVFXDuration(combatResult)
      setTimeout(() => {
        safeUpdateState(newState)

        // Auto-resolve AI interaction (single-player only)
        if (!isMultiplayerMode.value && newState.pendingInteraction?.respondingPlayer === opponentSide.value) {
          autoResolveAIInteraction()
        }

        // Auto-end turn if no more attacks
        if (!state.value?.pendingInteraction && !winner.value) {
          if (!hasRemainingAttacks(newState)) {
            setTimeout(() => endTurn(), 600)
          }
        }
      }, vfxMs)
    } catch (e: any) {
      ui.showPlayLimitToast(e.message ?? 'Nie można zaatakować.')
    }
  }

  /**
   * Rozwiązuje oczekującą interakcję gracza.
   * `choice` — instanceId karty lub string z opcją.
   */
  async function resolvePendingInteraction(choice: string) {
    if (mpSend) { mpSend({ type: 'resolve_interaction', choice }); return }
    const ui = useUIStore()
    try {
      const prevGrave1 = state.value?.players.player1.graveyard.length ?? 0
      const prevGrave2 = state.value?.players.player2.graveyard.length ?? 0
      const wasHypnosis = ui.mode === 'hypnosis' && ui.hypnosisPhase === 2
      if (wasHypnosis) ui.clearHypnosis()
      const wasBrzegina = state.value?.pendingInteraction?.type === 'brzegina_shield'
      const brzeginaTargetId = state.value?.pendingInteraction?.targetInstanceId
      const newState = engine.resolvePendingInteraction(choice)

      // Wymuszony atak (hipnoza) — emituj VFX przed aktualizacją stanu
      const combatResult = engine.lastCombatResult
      if (wasHypnosis && combatResult) {
        const vfx = useVFXOrchestrator()
        if (state.value) {
          revealCombatants(state.value, combatResult)
          state.value = { ...state.value }
        }
        emitCombatVFX(vfx, combatResult, state)
        engine.lastCombatResult = null
        const vfxMs = getCombatVFXDuration(combatResult)
        await delay(vfxMs)
      }

      // Brzegina: flash ODPORNY na osłoniętej karcie
      if (wasBrzegina && choice === 'yes' && brzeginaTargetId) {
        ui.flashBlock(brzeginaTargetId)
      }
      state.value = newState
      checkHypnosisMode(newState)
      // Animacje śmierci jeśli ktoś zginął (np. sojusznik trafiony przez Alkonosta)
      const died1 = newState.players.player1.graveyard.length > prevGrave1
      const died2 = newState.players.player2.graveyard.length > prevGrave2
      if (died1 || died2) await delay(600)
      // Jeśli nadal tura AI i brak nowej interakcji — wznów turę AI
      if (state.value && state.value.players[state.value.currentTurn].isAI && !winner.value && !state.value.pendingInteraction) {
        runAITurn()
      }
      // Auto-end turn po interakcji bojowej (Brzegina/Kościej) — gracz w fazie COMBAT
      else if (state.value && state.value.currentTurn === mySide.value && state.value.currentPhase === GamePhase.COMBAT && !state.value.pendingInteraction && !winner.value) {
        await delay(400)
        endTurn()
      }
    } catch (e: any) {
      if (import.meta.dev) console.error('[gameStore] resolvePendingInteraction error:', e)
      ui.showPlayLimitToast(e.message ?? 'Błąd rozwiązywania interakcji.')
    }
  }

  function changePosition(cardInstanceId: string, position: CardPosition) {
    if (!isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'change_position', cardInstanceId, newPosition: position }); return }
    try {
      safeUpdateState(engine.playerChangePosition(cardInstanceId, position))
    } catch (e: any) {
      // silently ignore position change errors
    }
  }

  function requestActivateEffect(cardInstanceId: string) {
    if (!isPlayerTurn.value) return
    const card = findCardOnField(mySide.value, cardInstanceId)
    if (!card) return

    // Darmowa aktywacja oczekująca (ON_PLAY pominięty) — wykonaj bez opłaty
    if (card.metadata.freeActivationPending) {
      activateCreatureEffect(cardInstanceId)
      return
    }

    const effect = getEffect((card.cardData as any).effectId)
    const cost = effect?.activationCost ?? 0

    // Zdolność wymaga celu → podświetlenie na polu lub pendingInteraction
    if (effect?.activationRequiresTarget) {
      if (!state.value) return
      const ui = useUIStore()
      // Zbierz wszystkie istoty na polu (obie strony) jako potencjalne cele
      const allTargets: string[] = []
      for (const side of ['player1', 'player2'] as const) {
        for (const line of Object.values(state.value.players[side].field.lines)) {
          for (const c of line as any[]) {
            if (c.instanceId !== cardInstanceId && c.currentStats.defense > 0) {
              // Jeśli efekt ma customowy filtr celów, zastosuj go
              if (effect.activationTargetFilter) {
                if (!effect.activationTargetFilter(c, card, state.value)) continue
              }
              allTargets.push(c.instanceId)
            }
          }
        }
      }
      if (allTargets.length === 0) {
        ui.showPlayLimitToast('Brak dostępnych celów dla tej zdolności.')
        return
      }

      // Jeśli jest koszt, najpierw potwierdź koszt
      const effectId = (card.cardData as any).effectId
      if (cost > 0) {
        ui.pendingActivation = {
          cardInstanceId,
          cost,
          cardName: card.cardData.name,
          effectName: effect?.name ?? '',
          requiresTarget: true,
          availableTargetIds: allTargets,
        }
      } else {
        // Darmowa + wymaga cel → podświetl cele na planszy (field highlighting)
        ui.enterEffectTargetMode(cardInstanceId, allTargets)
      }
      return
    }

    if (cost > 0) {
      const ui = useUIStore()
      ui.pendingActivation = {
        cardInstanceId,
        cost,
        cardName: card.cardData.name,
        effectName: effect?.name ?? '',
      }
    } else {
      activateCreatureEffect(cardInstanceId)
    }
  }

  function activateCreatureEffect(cardInstanceId: string, targetInstanceId?: string) {
    if (!isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'activate_effect', cardInstanceId, targetInstanceId }); return }
    try {
      const newState = engine.playerActivateEffect(cardInstanceId, targetInstanceId)

      // Heal VFX: efekt zostawia metadata.lastHealTargetId + lastHealAmount
      let cardAfter: CardInstance | null = null
      for (const side of ['player1', 'player2'] as const) {
        for (const creatures of Object.values(newState.players[side].field.lines)) {
          const found = (creatures as CardInstance[]).find(c => c.instanceId === cardInstanceId)
          if (found) { cardAfter = found; break }
        }
        if (cardAfter) break
      }
      if (cardAfter?.metadata.lastHealTargetId) {
        const healTargetId = cardAfter.metadata.lastHealTargetId as string
        const healAmount = (cardAfter.metadata.lastHealAmount as number) ?? 0
        delete cardAfter.metadata.lastHealTargetId
        delete cardAfter.metadata.lastHealAmount

        const rect = snapshotCardRect(healTargetId)
        if (rect) {
          const vfx = useVFXOrchestrator()
          vfx.emit({
            type: 'heal',
            targetId: healTargetId,
            value: healAmount,
            meta: { rect },
          })
          // Floating heal number (+X zielony)
          setTimeout(() => {
            vfx.emit({
              type: 'damage-number',
              targetId: healTargetId,
              value: 0,
              label: `+${healAmount}`,
              color: '#4ade80',
              meta: { pos: { x: rect.cx, y: rect.y } },
            })
          }, 300)
        }
      }

      safeUpdateState(newState)
    } catch (e: any) {
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można aktywować zdolności.')
    }
  }

  function confirmOnPlay() {
    if (mpSend) { mpSend({ type: 'confirm_on_play' }); return }
    try {
      state.value = engine.confirmOnPlay()
    } catch (e: any) {
    }
  }

  function skipOnPlay() {
    if (mpSend) { mpSend({ type: 'skip_on_play' }); return }
    try {
      state.value = engine.skipOnPlay()
    } catch (e: any) {
    }
  }

  function surrender() {
    if (mpSend) { mpSend({ type: 'surrender' }); return }
    try {
      state.value = engine.surrender(mySide.value)
      const ui = useUIStore()
      ui.openGameOver()
    } catch (e: any) {
    }
  }

  function injectPendingInteraction(interaction: NonNullable<import('../game-engine/types').GameState['pendingInteraction']>) {
    state.value = engine.injectPendingInteraction(interaction)
  }

  function drawCard() {
    if (!isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'draw_card' }); return }
    try {
      safeUpdateState(engine.playerDrawCard())
    } catch (e: any) {
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można dobrać karty.')
    }
  }

  function moveCreatureLine(cardInstanceId: string, targetLine: BattleLine, slotIndex?: number) {
    if (!isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'move_creature_line', cardInstanceId, targetLine, slotIndex }); return }
    try {
      safeUpdateState(engine.playerMoveCreatureLine(cardInstanceId, targetLine, slotIndex))
    } catch (e: any) {
    }
  }

  function advancePhase() {
    if (!isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'advance_phase' }); return }
    try {
      state.value = engine.playerAdvancePhase()
      // Po zakończeniu tury gracza uruchom AI
      if (state.value?.players[state.value.currentTurn].isAI && !winner.value) {
        runAITurn()
      }
    } catch (e: any) {
      if (import.meta.dev) console.error('[gameStore] advancePhase error:', e)
    }
  }

  function endTurn() {
    if (!isPlayerTurn.value) return
    if (mpSend) { mpSend({ type: 'end_turn' }); return }
    try {
      // Zbierz podsumowanie tury gracza z wpisów efektów/gry/śmierci
      const logSlice = state.value?.actionLog.slice(playerTurnLogStart.value) ?? []
      const summary = logSlice
        .filter(e => ['play', 'effect', 'death'].includes(e.type))
        .map(e => e.message)
      if (summary.length > 0) {
        playerTurnSummary.value = summary
      }

      state.value = engine.playerEndTurn()
      if (state.value?.players[state.value.currentTurn].isAI && !winner.value) {
        runAITurn()
      }
    } catch (e: any) {
      if (import.meta.dev) console.error('[gameStore] endTurn error:', e)
    }
  }

  function dismissPlayerSummary() {
    playerTurnSummary.value = []
  }

  // ===== AI TURN =====
  async function runAITurn() {
    if (!state.value || winner.value) return
    isAIThinking.value = true
    aiTurnSummary.value = []
    const vfx = useVFXOrchestrator()

    // Arena mode: AI skips card play but still attacks, then ends turn
    if (isArenaMode.value) {
      await delay(400)
      try {
        // Przejdź do combat i pozwól AI atakować
        if (engine.getCurrentPhase() === GamePhase.PLAY) {
          state.value = engine.aiAdvanceToCombat()
        }
        if (engine.getCurrentPhase() === GamePhase.COMBAT) {
          const aiDecisions = aiPlayer.planTurn(engine.getState())
          for (const d of aiDecisions) {
            if (d.type === 'change_position' && d.cardInstanceId) {
              try { state.value = engine.aiChangePosition(d.cardInstanceId, CardPosition.ATTACK) } catch {}
              continue
            }
            if (d.type !== 'attack') continue
            if (!d.cardInstanceId || !d.targetInstanceId) continue
            if (!state.value || winner.value) break
            if (state.value.pendingInteraction?.respondingPlayer === 'player1') break
            await delay(600)
            try {
              const newState = engine.aiAttack(d.cardInstanceId, d.targetInstanceId)
              const combatResult = engine.lastCombatResult
              if (state.value && combatResult) {
                revealCombatants(state.value, combatResult)
                state.value = { ...state.value }
              }
              emitCombatVFX(vfx, combatResult, state)
              engine.lastCombatResult = null
              const vfxMs = getCombatVFXDuration(combatResult)
              if (vfxMs > 0) await delay(vfxMs)
              state.value = newState
            } catch (e) {
              if (import.meta.dev) console.warn('[Arena AI] attack error:', e)
            }
          }
        }
        // Jeśli jest pendingInteraction dla gracza (np. Brzegina) — nie kończ tury
        if (!state.value?.pendingInteraction || state.value.pendingInteraction.respondingPlayer !== 'player1') {
          try { state.value = engine.aiEndTurn() } catch { try { state.value = engine.forcePlayerTurn() } catch {} }
        }
      } catch (e) {
        if (import.meta.dev) console.warn('[Arena AI] error:', e)
        try { state.value = engine.aiEndTurn() } catch { try { state.value = engine.forcePlayerTurn() } catch {} }
      }
      isAIThinking.value = false
      return
    }

    // Simple AI turn: plan → execute each decision with short pacing delay → end turn.
    // NO animation orchestration — state changes are immediate.
    // Visual effects react through watchers (GSAP on CreatureCard, CSS transitions).

    const AI_PACE_MS = 600 // visual pacing between AI actions

    try {
    await delay(AI_PACE_MS)

    if (!state.value) { isAIThinking.value = false; return }
    const logBefore = state.value.actionLog.length
    aiTurnLogStart.value = logBefore

    // AI aktywuje oczekującą łaskę boga (jeśli jest z poprzedniej rundy)
    try {
      const aiState = engine.getState()
      if (aiState.slavaData?.pendingFavor?.winnerSide === 'player2' &&
          aiState.slavaData.pendingFavor.wonOnRound < aiState.roundNumber) {
        state.value = engine.aiActivateFavor()
        await delay(AI_PACE_MS)
      }
    } catch (e) {
      if (import.meta.dev) console.warn('[gameStore] AI activateFavor error:', e)
    }

    let decisions: ReturnType<typeof aiPlayer.planTurn>
    try {
      decisions = aiPlayer.planTurn(engine.getState())
    } catch (e) {
      if (import.meta.dev) console.error('[gameStore] AI planTurn error:', e)
      decisions = [{ type: 'end_turn' as const }]
    }

    for (const decision of decisions) {
      if (!state.value || winner.value) break
      // If pending interaction for player — stop AI decisions, player must respond
      if (state.value.pendingInteraction?.respondingPlayer === 'player1') break
      // If pending interaction for AI — auto-resolve before continuing
      if (state.value.pendingInteraction?.respondingPlayer === 'player2') {
        autoResolveAIInteraction()
      }
      await delay(AI_PACE_MS)
      if (!state.value) break

      // Validate decision against CURRENT engine state (cards may have died since planning)
      if (!validateAIDecision(decision)) {
        if (import.meta.dev) console.info('[gameStore] Skipping stale AI decision:', decision.type, decision.cardInstanceId)
        continue
      }

      try {
        switch (decision.type) {
          case 'play_creature':
            if (decision.cardInstanceId && decision.targetLine !== undefined) {
              state.value = engine.aiPlayCreature(decision.cardInstanceId, decision.targetLine)
            }
            break
          case 'play_adventure':
            if (decision.cardInstanceId) {
              state.value = engine.aiPlayAdventure(decision.cardInstanceId, decision.targetInstanceId, decision.useEnhanced)
            }
            break
          case 'attack': {
            if (!decision.cardInstanceId || !decision.targetInstanceId) break
            if (engine.getCurrentPhase() === GamePhase.PLAY) {
              state.value = engine.aiAdvanceToCombat()
            }
            // Resolve combat IMMEDIATELY
            const newState = engine.aiAttack(decision.cardInstanceId, decision.targetInstanceId)
            const combatResult = engine.lastCombatResult

            // Reveal combat participants IMMEDIATELY so AI cards are visible during VFX
            if (state.value && combatResult) {
              revealCombatants(state.value, combatResult)
              state.value = { ...state.value }
            }

            // Emit VFX events from combat result
            emitCombatVFX(vfx, combatResult, state)
            engine.lastCombatResult = null

            // WAIT for VFX to play before updating state (removes dead cards from DOM)
            const vfxMs = getCombatVFXDuration(combatResult)
            if (vfxMs > 0) await delay(vfxMs)

            // Apply state
            state.value = newState
            break
          }
          case 'activate_effect':
            if (decision.cardInstanceId) {
              state.value = engine.aiActivateEffect(decision.cardInstanceId, decision.targetInstanceId)
            }
            break
          case 'change_position':
            if (decision.cardInstanceId && decision.targetPosition) {
              state.value = engine.aiChangePosition(decision.cardInstanceId, decision.targetPosition)
            }
            break
          case 'invoke_god':
            if (decision.godId !== undefined && decision.bidAmount !== undefined) {
              state.value = engine.aiInvokeGod(decision.godId, decision.bidAmount)
            }
            break
          case 'end_turn':
            state.value = engine.aiEndTurn()
            break
        }
      } catch (e: any) {
        if (import.meta.dev) console.warn('[gameStore] AI decision error:', decision.type, e?.message)
      }

      // Auto-resolve ANY pending interaction for AI after each decision
      if (state.value?.pendingInteraction?.respondingPlayer === 'player2') {
        autoResolveAIInteraction()
      }
    }

    // Collect summary
    if (state.value) {
      const newEntries = state.value.actionLog.slice(logBefore)
      aiTurnSummary.value = newEntries
        .filter(e => ['play', 'death', 'effect'].includes(e.type))
        .map(e => e.message)
    }

    // pendingInteraction — auto-resolve if for AI, wait for player otherwise
    if (state.value?.pendingInteraction) {
      if (state.value.pendingInteraction.respondingPlayer === 'player2') {
        autoResolveAIInteraction()
      } else {
        // Player must respond — don't end turn, finally will reset isAIThinking
        return
      }
    }

    // AI łupienie — gdy wróg (gracz) nie ma istot na polu (od rundy 2, oba tryby)
    if (state.value && state.value.roundNumber >= 2 && !winner.value) {
      try { state.value = engine.aiPlunder() } catch { /* no plunder available */ }
    }

    // Force end if still AI's turn
    if (state.value && state.value.currentTurn !== mySide.value && !winner.value) {
      try { state.value = engine.aiEndTurn() } catch {
        try { state.value = engine.forcePlayerTurn() } catch {}
      }
    }

    playerTurnLogStart.value = state.value?.actionLog.length ?? 0

    } catch (err) {
      if (import.meta.dev) console.error('[gameStore] AI turn fatal error:', err)
      try { state.value = engine.aiEndTurn() } catch {
        try { state.value = engine.forcePlayerTurn() } catch {}
      }
    } finally {
      isAIThinking.value = false
    }
  }

  function dismissAISummary() {
    aiTurnSummary.value = []
  }

  /**
   * Gdy pendingInteraction ma respondingPlayer = AI, auto-rozwiąż za AI.
   * Zwraca true jeśli interakcja została rozwiązana.
   */
  function autoResolveAIInteraction(): boolean {
    const interaction = state.value?.pendingInteraction
    if (!interaction) return false
    if (interaction.respondingPlayer === mySide.value) return false

    let choice: string | undefined
    if (interaction.availableTargetIds?.length) {
      choice = interaction.availableTargetIds[0]
    } else if (interaction.availableChoices?.length) {
      choice = interaction.availableChoices[0]
    } else {
      choice = 'yes'
    }

    if (choice) {
      try {
        state.value = engine.resolvePendingInteraction(choice)
      } catch { /* silently ignore */ }
    }
    return true
  }

  // ===== HELPERS =====
  function getCreaturesOnField(side: PlayerSide, line: BattleLine): CardInstance[] {
    return state.value?.players[side].field.lines[line] ?? []
  }

  function getHand(): CardInstance[] {
    return state.value?.players[mySide.value].hand ?? []
  }

  function canPlayerAttack(attackerId: string, defenderId: string): boolean {
    if (!state.value) return false
    const attacker = findCardOnField(mySide.value, attackerId)
    const defender = findCardOnField(opponentSide.value, defenderId)
    if (!attacker || !defender) return false
    try {
      return canAttack(state.value, attacker, defender).valid
    } catch {
      return false
    }
  }

  function findCardOnField(side: PlayerSide, instanceId: string): CardInstance | null {
    if (!state.value) return null
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = state.value.players[side].field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
    return null
  }

  /** Check if card exists anywhere on a given side's field in the engine's current state */
  function cardExistsOnField(side: PlayerSide, instanceId: string): boolean {
    const gs = engine.getState()
    for (const line of Object.values(gs.players[side].field.lines)) {
      if ((line as CardInstance[]).some(c => c.instanceId === instanceId)) return true
    }
    return false
  }

  /** Validate AI decision against current engine state — skip stale references */
  function validateAIDecision(decision: import('../game-engine/AIPlayer').AIDecision): boolean {
    switch (decision.type) {
      case 'attack': {
        if (!decision.cardInstanceId || !decision.targetInstanceId) return false
        // Attacker must exist on AI side
        if (!cardExistsOnField('player2', decision.cardInstanceId)) return false
        // Target must exist on player side
        if (!cardExistsOnField('player1', decision.targetInstanceId)) return false
        return true
      }
      case 'play_creature':
      case 'play_adventure': {
        if (!decision.cardInstanceId) return false
        const gs = engine.getState()
        return gs.players.player2.hand.some(c => c.instanceId === decision.cardInstanceId)
      }
      case 'change_position':
      case 'activate_effect': {
        if (!decision.cardInstanceId) return false
        return cardExistsOnField('player2', decision.cardInstanceId)
      }
      case 'end_turn':
        return true
      default:
        return true
    }
  }

  /**
   * Safe state update: wraps assignment in try/catch so a Vue re-render crash
   * doesn't break the component tree. If the first render fails, retries via nextTick.
   */
  function safeUpdateState(newState: GameState) {
    try {
      state.value = newState
    } catch (e) {
      if (import.meta.dev) console.warn('[gameStore] Vue re-render error during state update, retrying via nextTick:', e)
      nextTick(() => {
        state.value = newState
      })
    }
    // Hipnoza Alkonosta — podświetl cele na polu zamiast modalu
    checkHypnosisMode(newState)
  }

  function checkHypnosisMode(gs: GameState) {
    const ui = useUIStore()
    const pi = gs.pendingInteraction
    if (pi?.type === 'alkonost_target' && pi.respondingPlayer === mySide.value) {
      ui.enterHypnosisPhase2(pi.attackerInstanceId!, pi.availableTargetIds ?? [])
    } else if (ui.mode === 'hypnosis' && ui.hypnosisPhase === 2) {
      ui.clearHypnosis()
    }
  }

  /**
   * Sprawdza czy gracz ma jeszcze dostępne ataki w tej turze.
   * Replikuje logikę z BattleLine.vue + canAttack z LineManager.
   */
  function hasRemainingAttacks(gs: GameState): boolean {
    const myCreatures = getAllCreaturesOnField(gs, mySide.value)
    const enemyCreatures = getAllCreaturesOnField(gs, opponentSide.value)
    if (enemyCreatures.length === 0) return false

    // Policz normalnych ataków zużytych (bez Kikimory)
    const normalAttacksUsed = myCreatures
      .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
      .filter(c => {
        if ((c.cardData as any).effectId === 'lesnica_double_attack') {
          return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
        }
        return c.hasAttackedThisTurn
      }).length
    const hasChlop = myCreatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
    const maxAttacks = hasChlop ? 2 : 1

    for (const card of myCreatures) {
      if (card.position !== CardPosition.ATTACK) continue
      if (card.cannotAttack) continue

      const effectId = (card.cardData as any).effectId
      const isLesnica = effectId === 'lesnica_double_attack'
      const attacksThisTurn = (card.metadata.attacksThisTurn as number) ?? 0
      if (isLesnica && attacksThisTurn >= 2) continue
      if (!isLesnica && card.hasAttackedThisTurn && !((card.metadata.freeAttacksLeft as number) > 0)) continue

      const isKikimora = effectId === 'kikimora_free_attack'
      if (!isKikimora && !((card.metadata.freeAttacksLeft as number) > 0) && normalAttacksUsed >= maxAttacks) continue

      // Czy ta karta ma przynajmniej 1 prawidłowy cel?
      const hasTarget = enemyCreatures.some(e => {
        try { return canAttack(gs, card, e).valid } catch { return false }
      })
      if (hasTarget) return true
    }
    return false
  }

  // ===== INFO BOX: śledzenie ważnych zdarzeń z logów =====
  let _lastLogLen = 0
  const infoPatterns: { pattern: RegExp; icon: string; type: 'effect' | 'info' | 'warning'; delay?: number; override?: string }[] = [
    { pattern: /Wykluwa się/i, icon: '🐉', type: 'effect' },
    { pattern: /Bałwan odchodzi.*łask/i, icon: '⛩', type: 'effect', delay: 800, override: 'Bogowie okazali swą łaskę. Dobierasz 3 karty!' },
    { pattern: /Likantropia.*absorb|wchłania/i, icon: '🐺', type: 'effect' },
    { pattern: /Przejmuje zdolnoś/i, icon: '🧙', type: 'effect' },
    { pattern: /trwale unieruchomion/i, icon: '⚡', type: 'warning' },
    { pattern: /przechwytuje zaklęcie|Przekierowuje zaklęcie/i, icon: '🛡', type: 'effect' },
    { pattern: /przeskakuje do|Teleportacja/i, icon: '✨', type: 'effect' },
    { pattern: /Sobowtór.*kopiuje/i, icon: '👤', type: 'effect' },
    { pattern: /Strela.*przechwyc/i, icon: '⚡', type: 'effect' },
  ]

  // Banner patterns — important events shown as full-screen banners
  const bannerPatterns: { pattern: RegExp; text?: string; sub?: (msg: string) => string; type: 'effect' | 'steal' | 'death' | 'season'; duration?: number; delay?: number }[] = [
    { pattern: /ukradł kartę/i, text: 'Kradzież!', sub: (msg) => msg, type: 'steal', duration: 2000 },
    { pattern: /ŁUPIENIE/i, text: 'Łupienie!', sub: (msg) => msg, type: 'steal', duration: 2000 },
    { pattern: /Wskrze(sza|szony|szenie)/i, text: 'Wskrzeszenie!', sub: (msg) => msg, type: 'effect', duration: 2000 },
    { pattern: /Paraliż.*całe pole|masowy paraliż/i, text: 'Paraliż!', sub: (msg) => msg, type: 'effect', duration: 1800 },
    { pattern: /zabija najsłabsz/i, text: 'Egzekucja!', sub: (msg) => msg, type: 'death', duration: 1800 },
  ]

  // Watch turn change → show info boxes about pending favor / claimable holiday
  watch(() => state.value?.currentTurn, (turn, prevTurn) => {
    if (turn !== mySide.value || prevTurn === undefined) return
    const s = state.value
    if (!s || s.gameMode !== 'slava' || !s.slavaData) return
    const ui = useUIStore()

    // Pending favor notification
    const favor = s.slavaData.pendingFavor
    if (favor) {
      if (favor.winnerSide === mySide.value) {
        if (favor.wonOnRound < s.roundNumber) {
          ui.showInfoBox(`Łaska ${favor.godName} gotowa! Otwórz Panteon i Złóż Ofiarę.`, '⛩', 'info')
        } else {
          ui.showInfoBox(`Wygrałeś licytację o ${favor.godName}! Aktywacja od następnej rundy.`, '⛩', 'info')
        }
      } else {
        // AI wygrał licytację — powiadom gracza
        if (favor.wonOnRound < s.roundNumber) {
          ui.showInfoBox(`Przeciwnik złoży ofiarę ${favor.godName} w tej rundzie!`, '⚠', 'warning')
        } else {
          ui.showInfoBox(`Przeciwnik wygrał licytację o ${favor.godName} (${favor.cost} PS)!`, '⚠', 'warning')
        }
      }
    }

    // Claimable holiday notification
    const holiday = s.slavaData.holiday
    if (holiday && holiday.claimable?.player1 && !holiday.completed.player1) {
      ui.showInfoBox(`Warunki ${holiday.name} spełnione! Otwórz Panteon i Świętuj!`, '🎉', 'info')
    }
  })

  // Watch actionLog LENGTH only (not deep state!) to trigger info boxes and event flashes
  watch(() => state.value?.actionLog.length ?? 0, (newLen) => {
    const s = state.value
    if (!s || newLen <= _lastLogLen) {
      _lastLogLen = newLen
      return
    }
    const ui = useUIStore()
    const newEntries = s.actionLog.slice(_lastLogLen)
    _lastLogLen = newLen

    for (const entry of newEntries) {
      if (entry.type !== 'effect') continue
      for (const p of infoPatterns) {
        if (p.pattern.test(entry.message)) {
          const msg = p.override ?? (entry.message.length > 80 ? entry.message.slice(0, 77) + '...' : entry.message)
          if (p.delay) {
            setTimeout(() => ui.showInfoBox(msg, p.icon, p.type), p.delay)
          } else {
            ui.showInfoBox(msg, p.icon, p.type)
          }
          break
        }
      }

      // Banner patterns — big centered announcements
      for (const bp of bannerPatterns) {
        if (bp.pattern.test(entry.message)) {
          const text = bp.text ?? entry.message
          const sub = bp.sub ? bp.sub(entry.message) : ''
          const show = () => ui.showBanner(text, bp.type, bp.duration ?? 1800, sub)
          if (bp.delay) {
            setTimeout(show, bp.delay)
          } else {
            show()
          }
          break
        }
      }

      // Flash event card chips when their effect triggers
      const activeEvents = s.activeEvents ?? []
      for (const ev of activeEvents) {
        if (entry.message.includes(ev.cardData.name)) {
          ui.flashEventCard(ev.instanceId)
          break
        }
      }
    }
  })

  // ===== TURN TIMER =====
  // Start/stop timer when turn changes
  watch(currentTurn, (turn) => {
    const ui = useUIStore()
    if (!gameStarted.value || winner.value || isArenaMode.value) {
      ui.stopTurnTimer()
      return
    }
    const isMy = turn === mySide.value
    if (isMy && !isAIThinking.value) {
      ui.startTurnTimer()
    } else {
      ui.stopTurnTimer()
    }
  })

  // Handle timeout — deduct 1 glory, end turn
  watch(() => useUIStore().turnTimedOut, (timedOut) => {
    if (!timedOut) return
    if (!state.value || winner.value) return
    const ui = useUIStore()
    ui.turnTimedOut = false // reset flag

    // Deduct 1 glory from current player (clone to trigger shallowRef reactivity)
    const side = mySide.value
    if (state.value.players[side].glory > 0) {
      const s = { ...state.value }
      s.players = { ...s.players }
      s.players[side] = { ...s.players[side], glory: s.players[side].glory - 1 }
      s.actionLog = [...s.actionLog, {
        type: 'glory' as const,
        message: `${side === 'player1' ? 'Gracz' : 'AI'} traci 1 PS — CZAS MINĄŁ!`,
        turn: s.turnNumber,
        round: s.roundNumber,
        phase: s.currentPhase,
      }]
      state.value = s
    }

    // Force end turn
    try {
      state.value = engine.playerEndTurn()
      if (state.value?.players[state.value.currentTurn].isAI && !winner.value) {
        runAITurn()
      }
    } catch (e: any) {
      if (import.meta.dev) console.error('[gameStore] timeout endTurn error:', e)
    }
  })

  return {
    // state
    state,
    isAIThinking,
    gameStarted,
    aiTurnSummary,
    playerTurnSummary,
    isArenaMode,
    arenaFocusedName,
    selectedDifficulty,
    selectedDomains,
    // computed
    player,
    ai,
    currentTurn,
    currentPhase,
    winner,
    actionLog,
    roundNumber,
    season,
    isPlayerTurn,
    fieldThreats,
    playerCurrentLogs,
    aiCurrentLogs,
    // actions
    startGame,
    startAlphaGame,
    startSlavaGame,
    setupArenaMode,
    setDifficulty,
    setDomains,
    playCreature,
    playAdventure,
    attack,
    resolvePendingInteraction,
    injectPendingInteraction,
    changePosition,
    moveCreatureLine,
    requestActivateEffect,
    activateCreatureEffect,
    advancePhase,
    endTurn,
    drawCard,
    confirmOnPlay,
    skipOnPlay,
    surrender,
    dismissAISummary,
    dismissPlayerSummary,
    invokeGod,
    activateFavor,
    playerClaimHoliday,
    plunder,
    // multiplayer
    isMultiplayerMode,
    mySide,
    opponentSide,
    receiveMultiplayerState,
    startMultiplayer,
    setMultiplayerSender,
    // computed (slava)
    gameMode,
    slavaData,
    playerGlory,
    aiGlory,
    // helpers
    getCreaturesOnField,
    getHand,
    canPlayerAttack,
    findCardOnField,
  }
})

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
