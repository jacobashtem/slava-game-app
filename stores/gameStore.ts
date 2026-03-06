/**
 * gameStore — Pinia bridge między GameEngine a Vue UI.
 * Trzyma reaktywny stan gry i eksponuje akcje dla komponentów.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { GameEngine } from '../game-engine/GameEngine'
import { AIPlayer } from '../game-engine/AIPlayer'
import type { GameState, CardInstance, LogEntry } from '../game-engine/types'
import { GamePhase, BattleLine, CardPosition } from '../game-engine/constants'
import { canAttack } from '../game-engine/LineManager'
import { getEffect } from '../game-engine/EffectRegistry'
import type { PlayerSide } from '../game-engine/types'
import { useUIStore } from './uiStore'

const AI_DELAY_MS = 900

export const useGameStore = defineStore('game', () => {
  // ===== STATE =====
  const engine = new GameEngine()
  const aiPlayer = new AIPlayer('player2', 'medium')

  const state = ref<GameState | null>(null)
  const isAIThinking = ref(false)
  const gameStarted = ref(false)
  const aiTurnSummary = ref<string[]>([])
  const isArenaMode = ref(false)
  const arenaFocusedName = ref('')

  // ===== COMPUTED =====
  const player = computed(() => state.value?.players.player1 ?? null)
  const ai = computed(() => state.value?.players.player2 ?? null)
  const currentTurn = computed(() => state.value?.currentTurn ?? 'player1')
  const currentPhase = computed(() => state.value?.currentPhase ?? GamePhase.START)
  const winner = computed(() => state.value?.winner ?? null)
  const actionLog = computed(() => state.value?.actionLog ?? [])
  const roundNumber = computed(() => state.value?.roundNumber ?? 1)
  const isPlayerTurn = computed(() => currentTurn.value === 'player1' && !isAIThinking.value)

  // ===== SETUP =====
  function startGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    engine.onStateChanged((newState) => {
      state.value = newState
    })

    state.value = engine.startGame('gold')
    gameStarted.value = true

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    }
  }

  function setupArenaMode(freshState: GameState, focusedName = '') {
    isArenaMode.value = true
    arenaFocusedName.value = focusedName
    engine.onStateChanged((newState) => {
      state.value = newState
    })
    state.value = engine.setupArena(freshState)
    gameStarted.value = true
  }

  function startAlphaGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    engine.onStateChanged((newState) => {
      state.value = newState
    })

    state.value = engine.startAlphaGame()
    gameStarted.value = true

    if (state.value.players[state.value.currentTurn].isAI) {
      runAITurn()
    }
  }

  // ===== AKCJE GRACZA =====
  function playCreature(cardInstanceId: string, line: BattleLine) {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerPlayCreature(cardInstanceId, line)
    } catch (e: any) {
      console.warn('[gameStore] playCreature:', e.message)
      const ui = useUIStore()
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
    try {
      state.value = engine.playerPlayAdventure(cardInstanceId, targetInstanceId, useEnhanced)
    } catch (e: any) {
      console.warn('[gameStore] playAdventure:', e.message)
    }
  }

  async function attack(attackerInstanceId: string, defenderInstanceId: string) {
    if (!isPlayerTurn.value) return
    const ui = useUIStore()

    // Jeśli cel jest ukrytą kartą AI, krótko ujawnij przed atakiem
    const defender = findCardOnField('player2', defenderInstanceId)
    if (defender && !defender.isRevealed) {
      ui.revealingCardId = defenderInstanceId
      await delay(500)
      ui.revealingCardId = null
    }

    // Animacja ataku: napastnik miga, obrońca podświetlony
    ui.triggerAttackAnimation(attackerInstanceId, defenderInstanceId)
    await delay(600)

    try {
      const prevEnemyGrave = state.value?.players.player2.graveyard.length ?? 0
      const prevPlayerGrave = state.value?.players.player1.graveyard.length ?? 0

      const logLenBefore = state.value?.actionLog.length ?? 0
      const newState = engine.playerAttack(attackerInstanceId, defenderInstanceId)

      // Kontratak — sprawdź nowe wpisy loga czy obrońca kontratakował
      const newEntries = newState.actionLog.slice(logLenBefore)
      const hasCounter = newEntries.some(e => e.message.includes('kontratakuje'))
      if (hasCounter) {
        ui.counterAttackCardId = defenderInstanceId
        await delay(500)
        ui.counterAttackCardId = null
      }

      // Animacja śmierci jeśli ktoś zginął
      const enemyDied = newState.players.player2.graveyard.length > prevEnemyGrave
      const playerDied = newState.players.player1.graveyard.length > prevPlayerGrave
      if (enemyDied) ui.triggerDeathAnimation(defenderInstanceId)
      if (playerDied) ui.triggerDeathAnimation(attackerInstanceId)

      if (enemyDied || playerDied) await delay(700)

      state.value = newState
    } catch (e: any) {
      console.warn('[gameStore] attack:', e.message)
    }
  }

  function changePosition(cardInstanceId: string, position: CardPosition) {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerChangePosition(cardInstanceId, position)
    } catch (e: any) {
      console.warn('[gameStore] changePosition:', e.message)
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
      state.value = engine.playerActivateEffect(cardInstanceId, targetInstanceId)
    } catch (e: any) {
      console.warn('[gameStore] activateCreatureEffect:', e.message)
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można aktywować zdolności.')
    }
  }

  function confirmOnPlay() {
    try {
      state.value = engine.confirmOnPlay()
    } catch (e: any) {
      console.warn('[gameStore] confirmOnPlay:', e.message)
    }
  }

  function skipOnPlay() {
    try {
      state.value = engine.skipOnPlay()
    } catch (e: any) {
      console.warn('[gameStore] skipOnPlay:', e.message)
    }
  }

  function surrender() {
    try {
      state.value = engine.surrender('player1')
      const ui = useUIStore()
      ui.openGameOver()
    } catch (e: any) {
      console.warn('[gameStore] surrender:', e.message)
    }
  }

  function drawCard() {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerDrawCard()
    } catch (e: any) {
      console.warn('[gameStore] drawCard:', e.message)
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można dobrać karty.')
    }
  }

  function moveCreatureLine(cardInstanceId: string, targetLine: BattleLine) {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerMoveCreatureLine(cardInstanceId, targetLine)
    } catch (e: any) {
      console.warn('[gameStore] moveCreatureLine:', e.message)
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
      console.warn('[gameStore] advancePhase:', e.message)
    }
  }

  function endTurn() {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerEndTurn()
      if (state.value?.players[state.value.currentTurn].isAI && !winner.value) {
        runAITurn()
      }
    } catch (e: any) {
      console.warn('[gameStore] endTurn:', e.message)
    }
  }

  // ===== AI TURN =====
  async function runAITurn() {
    if (!state.value || winner.value) return
    isAIThinking.value = true
    aiTurnSummary.value = []

    // Arena mode: AI instantly ends its turn (just draw phase, no actions)
    if (isArenaMode.value) {
      await delay(200)
      state.value = engine.aiEndTurn()
      isAIThinking.value = false
      return
    }

    await delay(AI_DELAY_MS)

    const logBefore = state.value.actionLog.length
    const decisions = aiPlayer.planTurn(engine.getState())

    for (const decision of decisions) {
      if (winner.value) break
      await delay(AI_DELAY_MS)

      try {
        switch (decision.type) {
          case 'play_creature':
            if (decision.cardInstanceId && decision.targetLine !== undefined) {
              state.value = engine.aiPlayCreature(decision.cardInstanceId, decision.targetLine)
            }
            break
          case 'play_adventure':
            if (decision.cardInstanceId) {
              state.value = engine.aiPlayAdventure(decision.cardInstanceId, decision.targetInstanceId)
            }
            break
          case 'attack':
            if (decision.cardInstanceId && decision.targetInstanceId) {
              if (engine.getCurrentPhase() === GamePhase.PLAY) {
                state.value = engine.aiAdvanceToCombat()
                await delay(400)
              }
              {
                const ui = useUIStore()
                ui.triggerAttackAnimation(decision.cardInstanceId, decision.targetInstanceId)
                await delay(600)

                const prevP2Grave = state.value?.players.player2.graveyard.length ?? 0
                const prevP1Grave = state.value?.players.player1.graveyard.length ?? 0

                const newState = engine.aiAttack(decision.cardInstanceId, decision.targetInstanceId)

                const aiDied = newState.players.player2.graveyard.length > prevP2Grave
                const playerDied = newState.players.player1.graveyard.length > prevP1Grave
                if (aiDied) ui.triggerDeathAnimation(decision.cardInstanceId)
                if (playerDied) ui.triggerDeathAnimation(decision.targetInstanceId)

                if (aiDied || playerDied) await delay(700)

                state.value = newState
              }
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
        console.warn('[gameStore] AI decision error:', e.message)
      }
    }

    // Collect summary from AI actions logged during this turn
    if (state.value) {
      const newEntries = state.value.actionLog.slice(logBefore)
      const relevant = newEntries
        .filter(e => ['play', 'death', 'effect'].includes(e.type))
        .map(e => e.message)
      aiTurnSummary.value = relevant
    }

    isAIThinking.value = false
  }

  function dismissAISummary() {
    aiTurnSummary.value = []
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

  return {
    // state
    state,
    isAIThinking,
    gameStarted,
    aiTurnSummary,
    isArenaMode,
    arenaFocusedName,
    // computed
    player,
    ai,
    currentTurn,
    currentPhase,
    winner,
    actionLog,
    roundNumber,
    isPlayerTurn,
    // actions
    startGame,
    startAlphaGame,
    setupArenaMode,
    playCreature,
    playAdventure,
    attack,
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
