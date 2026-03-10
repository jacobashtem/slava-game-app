/**
 * uiStore — stan UI: zaznaczone karty, tryb akcji, animacje, modale.
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive, nextTick } from 'vue'

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
  // Typ ataku aktualnie animowanego (do VFX i SFX)
  const animatingAttackType = ref<number | null>(null) // AttackType enum: 0=MELEE,1=ELEM,2=MAGIC,3=RANGED
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

  // Mobile: drawer panel (deck/graveyard/gold info)
  const mobileDrawerOpen = ref(false)

  // ===== VFX SYSTEM =====

  // Drain particles: cząsteczki lecące od jednej karty do drugiej
  // { from: instanceId, to: instanceId, color: 'red'|'purple'|'green'|'gold', count?: number }
  const drainVFX = ref<{ from: string; to: string; color: string; label?: string } | null>(null)

  function triggerDrainVFX(from: string, to: string, color = 'red', label?: string) {
    drainVFX.value = { from, to, color, label }
    setTimeout(() => { nextTick(() => { drainVFX.value = null }) }, 1200)
  }

  // AoE wave: radialny/liniowy puls od pozycji karty
  // { sourceId: instanceId, color, shape: 'radial'|'line' }
  const aoeWaveVFX = ref<{ sourceId: string; color: string; shape: 'radial' | 'line' } | null>(null)

  function triggerAoEWave(sourceId: string, color = 'rgba(220,38,38,0.4)', shape: 'radial' | 'line' = 'radial') {
    aoeWaveVFX.value = { sourceId, color, shape }
    setTimeout(() => { nextTick(() => { aoeWaveVFX.value = null }) }, 1200)
  }

  // Status VFX flash: krótkie podświetlenie statusu na karcie (paraliz, choroba, etc.)
  const statusFlashId = ref<string | null>(null)
  const statusFlashType = ref<string | null>(null) // 'paralyze' | 'disease' | 'curse' | 'petrify'

  function triggerStatusFlash(instanceId: string, type: string) {
    statusFlashId.value = instanceId
    statusFlashType.value = type
    setTimeout(() => { nextTick(() => { statusFlashId.value = null; statusFlashType.value = null }) }, 1000)
  }

  // Egg hatch VFX: crack + burst when Smocze Jajo hatches
  const eggHatchVFX = ref<{ sourceId: string } | null>(null)

  function triggerEggHatch(sourceId: string) {
    eggHatchVFX.value = { sourceId }
    setTimeout(() => { nextTick(() => { eggHatchVFX.value = null }) }, 2000)
  }

  // Homen zombify VFX: card rises from death as Homen
  const zombifyVFX = ref<{ cardId: string } | null>(null)

  function triggerZombify(cardId: string) {
    zombifyVFX.value = { cardId }
    setTimeout(() => { nextTick(() => { zombifyVFX.value = null }) }, 1500)
  }

  // Conversion slide VFX: card slides from one side to another (Wiła, Mara)
  const conversionVFX = ref<{ cardId: string; color: string; label?: string } | null>(null)

  function triggerConversion(cardId: string, color = 'purple', label?: string) {
    conversionVFX.value = { cardId, color, label }
    setTimeout(() => { nextTick(() => { conversionVFX.value = null }) }, 1200)
  }

  // Gorynych merge VFX: dragon cards pulled into Gorynych
  const gorynychMergeVFX = ref<{ targetId: string; sourceIds: string[] } | null>(null)

  function triggerGorynychMerge(targetId: string, sourceIds: string[]) {
    gorynychMergeVFX.value = { targetId, sourceIds }
    setTimeout(() => { nextTick(() => { gorynychMergeVFX.value = null }) }, 1500)
  }

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
      nextTick(() => {
        animatingAttack.value = null
        animatingHit.value = null
        // Don't clear animatingAttackType here — it's managed by gameStore attack flow
        // Clearing it here causes race conditions (e.g. melee VFX flashing during magic)
      })
    }, 1400)
  }

  function triggerDeathAnimation(instanceId: string) {
    animatingDeath.value = new Set([...animatingDeath.value, instanceId])
    setTimeout(() => {
      nextTick(() => {
        animatingDeath.value.delete(instanceId)
      })
    }, 1400)
  }

  function triggerDamageNumber(instanceId: string, amount: number) {
    hitAmounts[instanceId] = amount
    setTimeout(() => {
      // Wrap in nextTick to avoid triggering reactive update mid-VDOM patch.
      // Direct delete inside setTimeout can race with other reactive updates,
      // causing 'insertBefore null' or 'emitsOptions null' in BattleLine.
      nextTick(() => {
        delete hitAmounts[instanceId]
      })
    }, 2400)
  }

  // "ODPORNY" flash when attack deals 0 damage (soft-fail: flying, immunity, etc.)
  const immuneCardId = ref<string | null>(null)
  function triggerImmuneFlash(instanceId: string) {
    immuneCardId.value = instanceId
    setTimeout(() => { nextTick(() => { immuneCardId.value = null }) }, 1200)
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
    _toastTimer = setTimeout(() => { nextTick(() => { playLimitToast.value = null }) }, 2200)
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
      nextTick(() => {
        if (flashingEventId.value === instanceId) flashingEventId.value = null
      })
    }, 1200)
  }

  function showInfoBox(text: string, icon = '📜', type: 'info' | 'effect' | 'warning' = 'effect') {
    const id = ++_infoId
    infoBoxes.value.push({ id, text, icon, type })
    setTimeout(() => {
      nextTick(() => {
        infoBoxes.value = infoBoxes.value.filter(b => b.id !== id)
      })
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
    animatingAttackType,
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
    mobileDrawerOpen,
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
    immuneCardId,
    triggerImmuneFlash,
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
    // VFX system
    drainVFX,
    triggerDrainVFX,
    aoeWaveVFX,
    triggerAoEWave,
    statusFlashId,
    statusFlashType,
    triggerStatusFlash,
    eggHatchVFX,
    triggerEggHatch,
    zombifyVFX,
    triggerZombify,
    conversionVFX,
    triggerConversion,
    gorynychMergeVFX,
    triggerGorynychMerge,
  }
})
