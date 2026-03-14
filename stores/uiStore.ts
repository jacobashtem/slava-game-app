/**
 * uiStore — stan UI: zaznaczone karty, tryb akcji, modale.
 * VFX state removed — will be handled by VFXOrchestrator (P3).
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type UIMode = 'idle' | 'placing' | 'attacking' | 'moving' | 'hypnosis' | 'effect_target'

export const useUIStore = defineStore('ui', () => {
  // Zaznaczona karta (instanceId)
  const selectedCardId = ref<string | null>(null)
  // Tryb UI
  const mode = ref<UIMode>('idle')
  // Karta aktualnie atakująca
  const attackingCardId = ref<string | null>(null)
  // Podświetlone linie (valid drop targets)
  const highlightedLines = ref<Set<string>>(new Set())
  // Podświetlone wrogie karty (valid attack targets)
  const validAttackTargets = ref<Set<string>>(new Set())
  // Modal końca gry
  const showGameOver = ref(false)
  // Tooltip
  const tooltipCardId = ref<string | null>(null)
  // Graveyard viewer
  const graveyardViewerSide = ref<'player1' | 'player2' | null>(null)
  // Play limit toast
  const playLimitToast = ref<string | null>(null)
  let _toastTimer: ReturnType<typeof setTimeout> | null = null
  // Przygoda czekająca na wybór celu istoty
  const pendingArtifactId = ref<string | null>(null)
  const pendingAdventureEnhanced = ref(false)
  const pendingAdventureTargetType = ref<'ally' | 'enemy' | 'any' | null>(null)
  // Tryb ulepszenia
  const isEnhancedMode = ref(false)
  // Potwierdzenie poddania gry
  const confirmingSurrender = ref(false)
  // Potwierdzenie płatnej aktywacji zdolności
  const pendingActivation = ref<{
    cardInstanceId: string
    cost: number
    cardName: string
    effectName: string
    requiresTarget?: boolean
    availableTargetIds?: string[]
  } | null>(null)
  // Karta wystawiana na pole wroga
  const placingOnEnemyField = ref(false)
  // Info-box notifications
  const infoBoxes = ref<{ id: number; text: string; icon: string; type: 'info' | 'effect' | 'warning' }[]>([])
  let _infoId = 0
  // Flash na aktywnej karcie przygody
  const flashingEventId = ref<string | null>(null)
  // Combat overlay flashes (kontratak / odporny)
  const counterAttackCardId = ref<string | null>(null)
  const blockCardId = ref<string | null>(null)
  // Card hit-shake (damage received visual feedback)
  const shakeCardId = ref<string | null>(null)
  // Hipnoza Alkonosta — podświetlenie celów na polu
  const hypnosisTargets = ref<Set<string>>(new Set())
  const hypnosisAttackerId = ref<string | null>(null)
  const hypnosisSourceId = ref<string | null>(null) // Alkonost instanceId (faza 1)
  const hypnosisPhase = ref<1 | 2>(1)
  // Generyczny wybór celu zdolności na polu (zamiast modala)
  const effectTargetSourceId = ref<string | null>(null)
  const effectTargetIds = ref<Set<string>>(new Set())
  // Mobile drawer
  const mobileDrawerOpen = ref(false)
  // Turn timer (2-minute countdown)
  const turnTimeLeft = ref(120) // seconds remaining
  let _turnTimerInterval: ReturnType<typeof setInterval> | null = null
  const turnTimerActive = ref(false)
  const turnTimedOut = ref(false)
  // Track UI flash/shake timeouts for cleanup on resetAll
  const _uiTimeouts: ReturnType<typeof setTimeout>[] = []

  // ===== COMPUTED =====
  const isSelectingTarget = computed(() => mode.value === 'attacking' && attackingCardId.value !== null)
  const isPlacingCard = computed(() => mode.value === 'placing' && selectedCardId.value !== null)
  const isMovingCard = computed(() => mode.value === 'moving' && selectedCardId.value !== null)

  // ===== ACTIONS =====

  function selectCardFromHand(instanceId: string) {
    if (selectedCardId.value === instanceId) {
      clearSelection()
      return
    }
    selectedCardId.value = instanceId
    attackingCardId.value = null
    mode.value = 'placing'
  }

  function selectAttacker(instanceId: string) {
    if (attackingCardId.value === instanceId) {
      clearSelection()
      return
    }
    attackingCardId.value = instanceId
    selectedCardId.value = null
    mode.value = 'attacking'
  }

  function setValidAttackTargets(targetIds: string[]) {
    validAttackTargets.value = new Set(targetIds)
  }

  function setHighlightedLines(lineKeys: string[]) {
    highlightedLines.value = new Set(lineKeys)
  }

  function enterHypnosisPhase1(sourceId: string, enemyTargetIds: string[]) {
    clearSelection()
    mode.value = 'hypnosis'
    hypnosisPhase.value = 1
    hypnosisSourceId.value = sourceId
    hypnosisAttackerId.value = null
    hypnosisTargets.value = new Set(enemyTargetIds)
  }

  function enterHypnosisPhase2(attackerId: string, victimIds: string[]) {
    mode.value = 'hypnosis'
    hypnosisPhase.value = 2
    hypnosisAttackerId.value = attackerId
    hypnosisTargets.value = new Set(victimIds)
  }

  function clearHypnosis() {
    hypnosisTargets.value = new Set()
    hypnosisAttackerId.value = null
    hypnosisSourceId.value = null
    hypnosisPhase.value = 1
    if (mode.value === 'hypnosis') mode.value = 'idle'
  }

  function enterEffectTargetMode(sourceId: string, targetIds: string[]) {
    clearSelection()
    mode.value = 'effect_target'
    effectTargetSourceId.value = sourceId
    effectTargetIds.value = new Set(targetIds)
  }

  function clearEffectTarget() {
    effectTargetSourceId.value = null
    effectTargetIds.value = new Set()
    if (mode.value === 'effect_target') mode.value = 'idle'
  }

  function clearSelection() {
    selectedCardId.value = null
    attackingCardId.value = null
    mode.value = 'idle'
    validAttackTargets.value = new Set()
    highlightedLines.value = new Set()
    placingOnEnemyField.value = false
    clearEffectTarget()
    clearHypnosis()
  }

  /** Pełny reset UI — wywoływany przy starcie nowej gry */
  function resetAll() {
    clearSelection()
    stopTurnTimer()
    turnTimedOut.value = false
    turnTimeLeft.value = 120
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null }
    _uiTimeouts.forEach(clearTimeout)
    _uiTimeouts.length = 0
    playLimitToast.value = null
    showGameOver.value = false
    tooltipCardId.value = null
    graveyardViewerSide.value = null
    isEnhancedMode.value = false
    confirmingSurrender.value = false
    pendingActivation.value = null
    pendingArtifactId.value = null
    pendingAdventureEnhanced.value = false
    pendingAdventureTargetType.value = null
    flashingEventId.value = null
    counterAttackCardId.value = null
    blockCardId.value = null
    shakeCardId.value = null
    infoBoxes.value = []
    mobileDrawerOpen.value = false
  }

  function showTooltip(instanceId: string) {
    tooltipCardId.value = instanceId
  }

  function hideTooltip() {
    tooltipCardId.value = null
  }

  function openGameOver() {
    showGameOver.value = true
    clearSelection()
  }

  function openGraveyardViewer(side: 'player1' | 'player2') {
    graveyardViewerSide.value = side
  }

  function closeGraveyardViewer() {
    graveyardViewerSide.value = null
  }

  function showPlayLimitToast(message: string) {
    if (_toastTimer) clearTimeout(_toastTimer)
    playLimitToast.value = message
    _toastTimer = setTimeout(() => { playLimitToast.value = null }, 2200)
  }

  function selectFieldCardForMove(instanceId: string) {
    if (selectedCardId.value === instanceId) {
      clearSelection()
      return
    }
    selectedCardId.value = instanceId
    attackingCardId.value = null
    mode.value = 'moving'
  }

  function setPendingArtifact(instanceId: string, targetType: 'ally' | 'enemy' | 'any' = 'ally', enhanced = false) {
    pendingArtifactId.value = instanceId
    pendingAdventureTargetType.value = targetType
    pendingAdventureEnhanced.value = enhanced
    selectedCardId.value = instanceId
    mode.value = 'placing'
  }

  function clearPendingArtifact() {
    pendingArtifactId.value = null
    pendingAdventureTargetType.value = null
    pendingAdventureEnhanced.value = false
    clearSelection()
  }

  function flashEventCard(instanceId: string) {
    flashingEventId.value = instanceId
    _uiTimeouts.push(setTimeout(() => {
      if (flashingEventId.value === instanceId) flashingEventId.value = null
    }, 1200))
  }

  function flashCounterAttack(instanceId: string) {
    counterAttackCardId.value = instanceId
    _uiTimeouts.push(setTimeout(() => {
      if (counterAttackCardId.value === instanceId) counterAttackCardId.value = null
    }, 2400))
  }

  function flashBlock(instanceId: string) {
    blockCardId.value = instanceId
    _uiTimeouts.push(setTimeout(() => {
      if (blockCardId.value === instanceId) blockCardId.value = null
    }, 1800))
  }

  function shakeCard(instanceId: string) {
    shakeCardId.value = instanceId
    _uiTimeouts.push(setTimeout(() => {
      if (shakeCardId.value === instanceId) shakeCardId.value = null
    }, 800))
  }

  function showInfoBox(text: string, icon = '📜', type: 'info' | 'effect' | 'warning' = 'effect') {
    const id = ++_infoId
    infoBoxes.value.push({ id, text, icon, type })
    _uiTimeouts.push(setTimeout(() => {
      infoBoxes.value = infoBoxes.value.filter(b => b.id !== id)
    }, 3500))
  }

  function startTurnTimer() {
    stopTurnTimer()
    turnTimeLeft.value = 120
    turnTimedOut.value = false
    turnTimerActive.value = true
    _turnTimerInterval = setInterval(() => {
      if (turnTimeLeft.value > 0) {
        turnTimeLeft.value--
      }
      if (turnTimeLeft.value <= 0) {
        stopTurnTimer()
        turnTimedOut.value = true
      }
    }, 1000)
  }

  function stopTurnTimer() {
    if (_turnTimerInterval) {
      clearInterval(_turnTimerInterval)
      _turnTimerInterval = null
    }
    turnTimerActive.value = false
  }

  function toggleEnhancedMode() {
    isEnhancedMode.value = !isEnhancedMode.value
    if (isEnhancedMode.value) {
      clearSelection()
    }
  }

  function exitEnhancedMode() {
    isEnhancedMode.value = false
  }

  return {
    selectedCardId,
    mode,
    attackingCardId,
    highlightedLines,
    validAttackTargets,
    showGameOver,
    tooltipCardId,
    graveyardViewerSide,
    playLimitToast,
    pendingArtifactId,
    pendingAdventureEnhanced,
    pendingAdventureTargetType,
    isEnhancedMode,
    confirmingSurrender,
    pendingActivation,
    placingOnEnemyField,
    infoBoxes,
    showInfoBox,
    flashingEventId,
    flashEventCard,
    counterAttackCardId,
    blockCardId,
    shakeCardId,
    flashCounterAttack,
    flashBlock,
    shakeCard,
    hypnosisTargets,
    hypnosisAttackerId,
    hypnosisSourceId,
    hypnosisPhase,
    enterHypnosisPhase1,
    enterHypnosisPhase2,
    clearHypnosis,
    effectTargetSourceId,
    effectTargetIds,
    enterEffectTargetMode,
    clearEffectTarget,
    mobileDrawerOpen,
    turnTimeLeft,
    turnTimerActive,
    turnTimedOut,
    startTurnTimer,
    stopTurnTimer,
    isSelectingTarget,
    isPlacingCard,
    isMovingCard,
    selectCardFromHand,
    selectAttacker,
    setValidAttackTargets,
    setHighlightedLines,
    clearSelection,
    resetAll,
    showTooltip,
    hideTooltip,
    openGameOver,
    openGraveyardViewer,
    closeGraveyardViewer,
    showPlayLimitToast,
    setPendingArtifact,
    clearPendingArtifact,
    selectFieldCardForMove,
    toggleEnhancedMode,
    exitEnhancedMode,
  }
})
