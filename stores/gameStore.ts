/**
 * gameStore — Pinia bridge między GameEngine a Vue UI.
 * Trzyma reaktywny stan gry i eksponuje akcje dla komponentów.
 */

import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import { GameEngine } from '../game-engine/GameEngine'
import { AIPlayer } from '../game-engine/AIPlayer'
import type { AIDifficulty } from '../game-engine/AIPlayer'
import type { GameState, CardInstance, LogEntry } from '../game-engine/types'
import { GamePhase, BattleLine, CardPosition } from '../game-engine/constants'
import { canAttack, getAllCreaturesOnField } from '../game-engine/LineManager'
import { getEffect } from '../game-engine/EffectRegistry'
import type { PlayerSide } from '../game-engine/types'
import { useUIStore } from './uiStore'

export const useGameStore = defineStore('game', () => {
  // ===== STATE =====
  const engine = new GameEngine()
  let aiPlayer = new AIPlayer('player2', 'medium')
  const selectedDifficulty = ref<AIDifficulty>('medium')
  const selectedDomains = ref<number[]>([]) // empty = all domains

  const state = ref<GameState | null>(null)
  const isAIThinking = ref(false)
  const gameStarted = ref(false)
  const aiTurnSummary = ref<string[]>([])
  const playerTurnSummary = ref<string[]>([])
  const isArenaMode = ref(false)
  const arenaFocusedName = ref('')
  const playerTurnLogStart = ref(0)
  const aiTurnLogStart = ref(0)
  // ===== COMPUTED =====
  const player = computed(() => state.value?.players.player1 ?? null)
  const ai = computed(() => state.value?.players.player2 ?? null)
  const currentTurn = computed(() => state.value?.currentTurn ?? 'player1')
  const currentPhase = computed(() => state.value?.currentPhase ?? GamePhase.START)
  const winner = computed(() => state.value?.winner ?? null)
  const actionLog = computed(() => state.value?.actionLog ?? [])
  const roundNumber = computed(() => state.value?.roundNumber ?? 1)
  const season = computed<'spring' | 'summer' | 'autumn' | 'winter'>(() => {
    // Sława: sezon z slavaData (4 rundy/porę, start Zima)
    if (state.value?.gameMode === 'slava' && state.value.slavaData) {
      const seasonMap = ['winter', 'spring', 'summer', 'autumn'] as const
      return seasonMap[state.value.slavaData.currentSeason] ?? 'winter'
    }
    // Gold Edition: 3 rundy/porę
    const r = roundNumber.value
    if (r <= 3) return 'spring'
    if (r <= 6) return 'summer'
    if (r <= 9) return 'autumn'
    return 'winter'
  })
  const gameMode = computed(() => state.value?.gameMode ?? 'gold')
  const slavaData = computed(() => state.value?.slavaData ?? null)
  const playerGlory = computed(() => state.value?.players.player1.glory ?? 0)
  const aiGlory = computed(() => state.value?.players.player2.glory ?? 0)
  const isPlayerTurn = computed(() => currentTurn.value === 'player1' && !isAIThinking.value)
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
    aiPlayer = new AIPlayer('player2', selectedDifficulty.value)
    const domainFilter = selectedDomains.value.length > 0 ? selectedDomains.value : undefined
    state.value = engine.startGame('gold', domainFilter)
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
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
    aiPlayer = new AIPlayer('player2', selectedDifficulty.value)
    const domainFilter = selectedDomains.value.length > 0 ? selectedDomains.value : undefined
    state.value = engine.startAlphaGame(domainFilter)
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    }
  }

  function startSlavaGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    aiPlayer = new AIPlayer('player2', selectedDifficulty.value)
    const domainFilter = selectedDomains.value.length > 0 ? selectedDomains.value : undefined
    state.value = engine.startSlavaGame(domainFilter)
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    }
  }

  // ===== SLAVA: INVOKE GOD =====
  function invokeGod(godId: number, enhanced: boolean, bid: number) {
    if (!state.value) return
    try {
      state.value = engine.playerInvokeGod(godId, enhanced, bid)
    } catch (err) {
      console.warn('[gameStore] invokeGod error:', err)
    }
  }

  // ===== AKCJE GRACZA =====
  function playCreature(cardInstanceId: string, line: BattleLine, slotIndex?: number) {
    console.log('[gameStore] playCreature called', { cardInstanceId, line, slotIndex, isPlayerTurn: isPlayerTurn.value, currentPhase: currentPhase.value })
    if (!isPlayerTurn.value) {
      console.warn('[gameStore] playCreature BLOCKED: not player turn', { currentTurn: currentTurn.value, isAIThinking: isAIThinking.value })
      return
    }
    const ui = useUIStore()
    try {
      const newState = engine.playerPlayCreature(cardInstanceId, line, slotIndex)
      console.log('[gameStore] playCreature SUCCESS — card placed at line', line, 'slot', slotIndex,
        'cards in line after:', newState.players.player1.field.lines[line].map((c: any) => c.cardData.name))
      ui.clearSelection()
      // Apply state in nextTick to avoid Vue re-render collision
      // (synchronous assignment can crash mid-render, breaking the component tree)
      safeUpdateState(newState)
    } catch (e: any) {
      console.error('[gameStore] playCreature ERROR:', e.message)
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
    const ui = useUIStore()

    try {
      // Capture pre-combat state for damage numbers
      const prevEnemyGrave = state.value?.players.player2.graveyard.length ?? 0
      const prevPlayerGrave = state.value?.players.player1.graveyard.length ?? 0
      const defDefBefore = findCardOnField('player2', defenderInstanceId)?.currentStats.defense ?? 0
      const atkDefBefore = findCardOnField('player1', attackerInstanceId)?.currentStats.defense ?? 0

      // Attack type for VFX
      const attacker = findCardOnField('player1', attackerInstanceId)
      ui.animatingAttackType = attacker ? ((attacker.cardData as any).attackType ?? null) : null

      // Resolve combat — SYNCHRONOUS, no delays
      const newState = engine.playerAttack(attackerInstanceId, defenderInstanceId)

      // Trigger visual effects (non-blocking — watchers/CSS handle animation)
      ui.triggerAttackAnimation(attackerInstanceId, defenderInstanceId)

      // Damage numbers
      const findInState = (side: 'player1' | 'player2', id: string) => {
        for (const line of Object.values(newState.players[side].field.lines)) {
          const found = (line as any[]).find((c: any) => c.instanceId === id)
          if (found) return found
        }
        return null
      }
      const defDefAfter = findInState('player2', defenderInstanceId)?.currentStats.defense ?? 0
      const atkDefAfter = findInState('player1', attackerInstanceId)?.currentStats.defense ?? 0
      const dmgToDefender = Math.max(0, defDefBefore - defDefAfter)
      const dmgToAttacker = Math.max(0, atkDefBefore - atkDefAfter)
      if (dmgToDefender > 0) ui.triggerDamageNumber(defenderInstanceId, dmgToDefender)
      if (dmgToDefender === 0) ui.triggerImmuneFlash(defenderInstanceId)
      if (dmgToAttacker > 0) {
        ui.triggerDamageNumber(attackerInstanceId, dmgToAttacker)
        ui.counterAttackCardId = defenderInstanceId
      }

      // Death animations
      const enemyDied = newState.players.player2.graveyard.length > prevEnemyGrave
      const playerDied = newState.players.player1.graveyard.length > prevPlayerGrave
      if (enemyDied) ui.triggerDeathAnimation(defenderInstanceId)
      if (playerDied) ui.triggerDeathAnimation(attackerInstanceId)

      // Apply state safely
      safeUpdateState(newState)

      // Auto-resolve AI interaction
      if (newState.pendingInteraction?.respondingPlayer === 'player2') {
        autoResolveAIInteraction()
      }

      // Auto-end turn if no more attacks
      if (!state.value?.pendingInteraction && !winner.value) {
        if (!hasRemainingAttacks(newState)) {
          endTurn()
        }
      }
    } catch (e: any) {
      ui.showPlayLimitToast(e.message ?? 'Nie można zaatakować.')
    } finally {
      // Cleanup VFX state after a short delay (let animations play)
      setTimeout(() => {
        nextTick(() => {
          ui.animatingAttackType = null
          ui.counterAttackCardId = null
        })
      }, 1500)
    }
  }

  /**
   * Rozwiązuje oczekującą interakcję gracza.
   * `choice` — instanceId karty lub string z opcją.
   */
  async function resolvePendingInteraction(choice: string) {
    const ui = useUIStore()
    try {
      const prevGrave1 = state.value?.players.player1.graveyard.length ?? 0
      const prevGrave2 = state.value?.players.player2.graveyard.length ?? 0
      const newState = engine.resolvePendingInteraction(choice)
      state.value = newState
      // Animacje śmierci jeśli ktoś zginął (np. sojusznik trafiony przez Alkonosta)
      const died1 = newState.players.player1.graveyard.length > prevGrave1
      const died2 = newState.players.player2.graveyard.length > prevGrave2
      if (died1 || died2) await delay(600)
      // Jeśli nadal tura AI i brak nowej interakcji — wznów turę AI
      if (state.value && state.value.players[state.value.currentTurn].isAI && !winner.value && !state.value.pendingInteraction) {
        runAITurn()
      }
      // Auto-end turn po interakcji bojowej (Brzegina/Kościej) — gracz w fazie COMBAT
      else if (state.value && state.value.currentTurn === 'player1' && state.value.currentPhase === GamePhase.COMBAT && !state.value.pendingInteraction && !winner.value) {
        await delay(400)
        endTurn()
      }
    } catch (e: any) {
    }
  }

  function changePosition(cardInstanceId: string, position: CardPosition) {
    if (!isPlayerTurn.value) return
    try {
      safeUpdateState(engine.playerChangePosition(cardInstanceId, position))
    } catch (e: any) {
      // silently ignore position change errors
    }
  }

  function requestActivateEffect(cardInstanceId: string) {
    if (!isPlayerTurn.value) return
    const card = findCardOnField('player1', cardInstanceId)
    if (!card) return

    // Darmowa aktywacja oczekująca (ON_PLAY pominięty) — wykonaj bez opłaty
    if (card.metadata.freeActivationPending) {
      activateCreatureEffect(cardInstanceId)
      return
    }

    const effect = getEffect((card.cardData as any).effectId)
    const cost = effect?.activationCost ?? 0

    // Zdolność wymaga celu → pendingInteraction z listą celów
    if (effect?.activationRequiresTarget) {
      if (!state.value) return
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
        const ui = useUIStore()
        ui.showPlayLimitToast('Brak dostępnych celów dla tej zdolności.')
        return
      }
      // Jeśli jest koszt, najpierw potwierdź koszt
      if (cost > 0) {
        const ui = useUIStore()
        ui.pendingActivation = {
          cardInstanceId,
          cost,
          cardName: card.cardData.name,
          effectName: effect?.name ?? '',
          requiresTarget: true,
          availableTargetIds: allTargets,
        }
      } else {
        // Darmowa + wymaga cel → od razu pendingInteraction (przez engine żeby sync)
        state.value = engine.injectPendingInteraction({
          type: 'on_play_target' as const,
          sourceInstanceId: cardInstanceId,
          respondingPlayer: 'player1',
          availableTargetIds: allTargets,
          metadata: { isActivation: true },
        })
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
    try {
      safeUpdateState(engine.playerActivateEffect(cardInstanceId, targetInstanceId))
    } catch (e: any) {
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można aktywować zdolności.')
    }
  }

  function confirmOnPlay() {
    try {
      state.value = engine.confirmOnPlay()
    } catch (e: any) {
    }
  }

  function skipOnPlay() {
    try {
      state.value = engine.skipOnPlay()
    } catch (e: any) {
    }
  }

  function surrender() {
    try {
      state.value = engine.surrender('player1')
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
    try {
      safeUpdateState(engine.playerDrawCard())
    } catch (e: any) {
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można dobrać karty.')
    }
  }

  function moveCreatureLine(cardInstanceId: string, targetLine: BattleLine, slotIndex?: number) {
    if (!isPlayerTurn.value) return
    try {
      safeUpdateState(engine.playerMoveCreatureLine(cardInstanceId, targetLine, slotIndex))
    } catch (e: any) {
    }
  }

  function advancePhase() {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerAdvancePhase()
      // Po zakończeniu tury gracza uruchom AI
      if (state.value?.players[state.value.currentTurn].isAI && !winner.value) {
        runAITurn()
      }
    } catch (e: any) {
    }
  }

  function endTurn() {
    if (!isPlayerTurn.value) return
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

    // Arena mode: AI instantly ends its turn (just draw phase, no actions)
    if (isArenaMode.value) {
      await delay(200)
      try { state.value = engine.aiEndTurn() } catch { try { state.value = engine.forcePlayerTurn() } catch {} }
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

    let decisions: ReturnType<typeof aiPlayer.planTurn>
    try {
      decisions = aiPlayer.planTurn(engine.getState())
    } catch (e) {
      console.error('[gameStore] AI planTurn error:', e)
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
        console.info('[gameStore] Skipping stale AI decision:', decision.type, decision.cardInstanceId)
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
            const ui = useUIStore()

            // Capture DEF before attack for damage numbers
            const tgtDefBefore = (() => {
              for (const line of Object.values(state.value?.players.player1.field.lines ?? {}))
                for (const c of line as any[]) if (c.instanceId === decision.targetInstanceId) return c.currentStats.defense
              return 0
            })()
            const atkDefBefore = (() => {
              for (const line of Object.values(state.value?.players.player2.field.lines ?? {}))
                for (const c of line as any[]) if (c.instanceId === decision.cardInstanceId) return c.currentStats.defense
              return 0
            })()
            const prevP2Grave = state.value?.players.player2.graveyard.length ?? 0
            const prevP1Grave = state.value?.players.player1.graveyard.length ?? 0

            // Attack type for VFX
            const aiAtkCard = findCardOnField('player2', decision.cardInstanceId)
            ui.animatingAttackType = aiAtkCard ? ((aiAtkCard.cardData as any).attackType ?? null) : null

            // Resolve combat IMMEDIATELY
            const newState = engine.aiAttack(decision.cardInstanceId, decision.targetInstanceId)

            // Trigger non-blocking VFX
            ui.triggerAttackAnimation(decision.cardInstanceId, decision.targetInstanceId)

            // Damage numbers
            const tgtDefAfter = (() => {
              for (const line of Object.values(newState.players.player1.field.lines))
                for (const c of line as any[]) if (c.instanceId === decision.targetInstanceId) return c.currentStats.defense
              return 0
            })()
            const atkDefAfter = (() => {
              for (const line of Object.values(newState.players.player2.field.lines))
                for (const c of line as any[]) if (c.instanceId === decision.cardInstanceId) return c.currentStats.defense
              return 0
            })()
            const dmgToTgt = Math.max(0, tgtDefBefore - tgtDefAfter)
            const dmgToAi = Math.max(0, atkDefBefore - atkDefAfter)
            if (dmgToTgt > 0) ui.triggerDamageNumber(decision.targetInstanceId, dmgToTgt)
            if (dmgToTgt === 0) ui.triggerImmuneFlash(decision.targetInstanceId)
            if (dmgToAi > 0) {
              ui.triggerDamageNumber(decision.cardInstanceId, dmgToAi)
              ui.counterAttackCardId = decision.targetInstanceId
            }

            // Death animations
            const aiDied = newState.players.player2.graveyard.length > prevP2Grave
            const playerDied = newState.players.player1.graveyard.length > prevP1Grave
            if (aiDied) ui.triggerDeathAnimation(decision.cardInstanceId)
            if (playerDied) ui.triggerDeathAnimation(decision.targetInstanceId)

            // Apply state IMMEDIATELY
            state.value = newState

            // Cleanup VFX after animation (non-blocking)
            setTimeout(() => { nextTick(() => { ui.animatingAttackType = null; ui.counterAttackCardId = null }) }, 1500)
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
          case 'end_turn':
            state.value = engine.aiEndTurn()
            break
        }
      } catch (e: any) {
        console.warn('[gameStore] AI decision error:', decision.type, e?.message)
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

    // Force end if still AI's turn
    if (state.value && state.value.currentTurn !== 'player1' && !winner.value) {
      try { state.value = engine.aiEndTurn() } catch {
        try { state.value = engine.forcePlayerTurn() } catch {}
      }
    }

    playerTurnLogStart.value = state.value?.actionLog.length ?? 0

    } catch (err) {
      console.error('[gameStore] AI turn fatal error:', err)
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
    if (interaction.respondingPlayer === 'player1') return false

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
    return state.value?.players.player1.hand ?? []
  }

  function canPlayerAttack(attackerId: string, defenderId: string): boolean {
    if (!state.value) return false
    const attacker = findCardOnField('player1', attackerId)
    const defender = findCardOnField('player2', defenderId)
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
      console.warn('[gameStore] Vue re-render error during state update, retrying via nextTick:', e)
      nextTick(() => {
        state.value = newState
      })
    }
  }

  /**
   * Sprawdza czy gracz ma jeszcze dostępne ataki w tej turze.
   * Replikuje logikę z BattleLine.vue + canAttack z LineManager.
   */
  function hasRemainingAttacks(gs: GameState): boolean {
    const p1Creatures = getAllCreaturesOnField(gs, 'player1')
    const p2Creatures = getAllCreaturesOnField(gs, 'player2')
    if (p2Creatures.length === 0) return false

    // Policz normalnych ataków zużytych (bez Kikimory)
    const normalAttacksUsed = p1Creatures
      .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
      .filter(c => {
        if ((c.cardData as any).effectId === 'lesnica_double_attack') {
          return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
        }
        return c.hasAttackedThisTurn
      }).length
    const hasChlop = p1Creatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
    const maxAttacks = hasChlop ? 2 : 1

    for (const card of p1Creatures) {
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
      const hasTarget = p2Creatures.some(e => {
        try { return canAttack(gs, card, e).valid } catch { return false }
      })
      if (hasTarget) return true
    }
    return false
  }

  // ===== INFO BOX: śledzenie ważnych zdarzeń z logów =====
  let _lastLogLen = 0
  const infoPatterns: { pattern: RegExp; icon: string; type: 'effect' | 'info' | 'warning' }[] = [
    { pattern: /Kluwa się.*dobiera (\d+) kart/i, icon: '🥚', type: 'effect' },
    { pattern: /Likantropia.*absorb|wchłania/i, icon: '🐺', type: 'effect' },
    { pattern: /Wskrze(sza|szony|szenie)/i, icon: '💀', type: 'effect' },
    { pattern: /Przejmuje zdolnoś/i, icon: '🧙', type: 'effect' },
    { pattern: /trwale unieruchomion/i, icon: '⚡', type: 'warning' },
    { pattern: /Złoto.*zrabowane|Kradnie.*złot/i, icon: '💰', type: 'warning' },
    { pattern: /Nowy sezon:/i, icon: '🌿', type: 'info' },
    { pattern: /przechwytuje zaklęcie|Przekierowuje zaklęcie/i, icon: '🛡', type: 'effect' },
    { pattern: /Paraliż.*całe pole|masowy paraliż/i, icon: '⚡', type: 'warning' },
    { pattern: /zabija najsłabsz/i, icon: '☠', type: 'warning' },
    { pattern: /przeskakuje do|Teleportacja/i, icon: '✨', type: 'effect' },
    { pattern: /Sobowtór.*kopiuje/i, icon: '👤', type: 'effect' },
    { pattern: /Strela.*przechwyc/i, icon: '⚡', type: 'effect' },
  ]

  watch(state, (s) => {
    if (!s) return
    const log = s.actionLog
    if (log.length <= _lastLogLen) {
      _lastLogLen = log.length
      return
    }
    const ui = useUIStore()
    const newEntries = log.slice(_lastLogLen)
    _lastLogLen = log.length

    for (const entry of newEntries) {
      if (entry.type !== 'effect') continue
      for (const p of infoPatterns) {
        if (p.pattern.test(entry.message)) {
          const msg = entry.message.length > 80 ? entry.message.slice(0, 77) + '...' : entry.message
          ui.showInfoBox(msg, p.icon, p.type)
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
  }, { deep: true })

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
