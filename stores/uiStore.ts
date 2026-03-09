/**
 * uiStore — stan UI: zaznaczone karty, tryb akcji, animacje, modale.
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'

export type UIMode = 'idle' | 'placing' | 'attacking' | 'moving'

export const useUIStore = defineStore('ui', () => {
  // Zaznaczona karta (instanceId)
  const selectedCardId = ref<string | null>(null)
  // Tryb UI
  const mode = ref<UIMode>('idle')
  // Karta aktualnie atakująca
  const attackingCardId = ref<string | null>(null)
  // Animacje — karta która właśnie atakuje / dostaje cios
  const animatingAttack = ref<string | null>(null)
  const animatingHit = ref<string | null>(null)
  const animatingDeath = ref<Set<string>>(new Set())
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
  // Karta tymczasowo ujawniona przed atakiem (hidden card reveal)
  const revealingCardId = ref<string | null>(null)
  // Karta aktualnie kontratakvująca (ikona tarczy)
  const counterAttackCardId = ref<string | null>(null)
  // Floating damage numbers: instanceId → kwota obrażeń
  const hitAmounts = reactive<Record<string, number>>({})
  // Przygoda czekająca na wybór celu istoty (artefakt LUB zdarzenie z targetem)
  const pendingArtifactId = ref<string | null>(null)
  const pendingAdventureEnhanced = ref(false)
  // Typ celu przygody: 'ally' = własna istota, 'enemy' = wroga, 'any' = dowolna, 'field' = dowolna na polu
  const pendingAdventureTargetType = ref<'ally' | 'enemy' | 'any' | null>(null)
  // Tryb ulepszenia: kliknięto monety → kolejna karta przygody zagrana jako enhanced
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

  // Karta wystawiana na pole wroga (Wieszczy, Bieda)
  const placingOnEnemyField = ref(false)

  // Info-box notifications (ważne zdarzenia gry)
  const infoBoxes = ref<{ id: number; text: string; icon: string; type: 'info' | 'effect' | 'warning' }[]>([])
  let _infoId = 0

  // Flash na aktywnej karcie przygody (event chip glow)
  const flashingEventId = ref<string | null>(null)

  // ===== COMPUTED =====
  const isSelectingTarget = computed(() => mode.value === 'attacking' && attackingCardId.value !== null)
  const isPlacingCard = computed(() => mode.value === 'placing' && selectedCardId.value !== null)
  const isMovingCard = computed(() => mode.value === 'moving' && selectedCardId.value !== null)

  // ===== ACTIONS =====

  function selectCardFromHand(instanceId: string) {
    if (selectedCardId.value === instanceId) {
      // Kliknięto tę samą → odznacz
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

  function clearSelection() {
    selectedCardId.value = null
    attackingCardId.value = null
    mode.value = 'idle'
    validAttackTargets.value = new Set()
    highlightedLines.value = new Set()
    placingOnEnemyField.value = false
  }

  function triggerAttackAnimation(attackerId: string, defenderId: string) {
    animatingAttack.value = attackerId
    animatingHit.value = defenderId
    setTimeout(() => {
      animatingAttack.value = null
      animatingHit.value = null
    }, 900)
  }

  function triggerDeathAnimation(instanceId: string) {
    animatingDeath.value = new Set([...animatingDeath.value, instanceId])
    setTimeout(() => {
      animatingDeath.value.delete(instanceId)
    }, 750)
  }

  function triggerDamageNumber(instanceId: string, amount: number) {
    hitAmounts[instanceId] = amount
    setTimeout(() => {
      delete hitAmounts[instanceId]
    }, 1600)
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
    setTimeout(() => {
      if (flashingEventId.value === instanceId) flashingEventId.value = null
    }, 1200)
  }

  function showInfoBox(text: string, icon = '📜', type: 'info' | 'effect' | 'warning' = 'effect') {
    const id = ++_infoId
    infoBoxes.value.push({ id, text, icon, type })
    setTimeout(() => {
      infoBoxes.value = infoBoxes.value.filter(b => b.id !== id)
    }, 3500)
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
    animatingAttack,
    animatingHit,
    animatingDeath,
    revealingCardId,
    counterAttackCardId,
    hitAmounts,
    triggerDamageNumber,
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
    isSelectingTarget,
    isPlacingCard,
    isMovingCard,
    selectCardFromHand,
    selectAttacker,
    setValidAttackTargets,
    setHighlightedLines,
    clearSelection,
    triggerAttackAnimation,
    triggerDeathAnimation,
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
