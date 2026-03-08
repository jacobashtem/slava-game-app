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

const AI_DELAY_MS = 1300

export const useGameStore = defineStore('game', () => {
  // ===== STATE =====
  const engine = new GameEngine()
  const aiPlayer = new AIPlayer('player2', 'medium')

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
  const isPlayerTurn = computed(() => currentTurn.value === 'player1' && !isAIThinking.value)
  const playerCurrentLogs = computed(() => (state.value?.actionLog ?? []).slice(playerTurnLogStart.value).slice(-6))
  const aiCurrentLogs = computed(() => (state.value?.actionLog ?? []).slice(aiTurnLogStart.value).slice(-6))

  // ===== SETUP =====
  function startGame() {
    isArenaMode.value = false
    arenaFocusedName.value = ''
    // NIE rejestrujemy onStateChanged — state.value ustawiamy ręcznie po każdej akcji
    // żeby animacje (damage numbers, tarcza) miały czas się wyświetlić przed zmianą stanu
    state.value = engine.startGame('gold')
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
    state.value = engine.startAlphaGame()
    gameStarted.value = true
    playerTurnLogStart.value = state.value.actionLog.length

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
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można zagrać karty przygody.')
    }
  }

  async function attack(attackerInstanceId: string, defenderInstanceId: string) {
    if (!isPlayerTurn.value) return
    const ui = useUIStore()

    // Jeśli cel jest ukrytą kartą AI, krótko ujawnij przed atakiem
    const defender = findCardOnField('player2', defenderInstanceId)
    const wasHidden = defender && !defender.isRevealed
    if (wasHidden) {
      ui.revealingCardId = defenderInstanceId
      await delay(500)
      // NIE czyścimy tutaj — karta pozostaje widoczna przez całą animację ataku
    }

    // Animacja ataku: napastnik miga, obrońca podświetlony
    ui.triggerAttackAnimation(attackerInstanceId, defenderInstanceId)
    await delay(900)

    try {
      const prevEnemyGrave = state.value?.players.player2.graveyard.length ?? 0
      const prevPlayerGrave = state.value?.players.player1.graveyard.length ?? 0

      // Zapamiętaj DEF przed atakiem do damage numbers
      const defDefBefore = findCardOnField('player2', defenderInstanceId)?.currentStats.defense ?? 0
      const atkDefBefore = findCardOnField('player1', attackerInstanceId)?.currentStats.defense ?? 0

      const newState = engine.playerAttack(attackerInstanceId, defenderInstanceId)

      // Floating damage numbers
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
      if (dmgToAttacker > 0) ui.triggerDamageNumber(attackerInstanceId, dmgToAttacker)

      // Kontratak — DEF atakującego spadła = kontratak nastąpił
      if (dmgToAttacker > 0) {
        console.log('[KONTRATAK] gracz atakuje, obrońca kontratakuje:', defenderInstanceId, 'dmgToAttacker:', dmgToAttacker)
        ui.counterAttackCardId = defenderInstanceId
        await delay(1000)
        ui.counterAttackCardId = null
      }

      // Animacja śmierci jeśli ktoś zginął
      const enemyDied = newState.players.player2.graveyard.length > prevEnemyGrave
      const playerDied = newState.players.player1.graveyard.length > prevPlayerGrave
      if (enemyDied) ui.triggerDeathAnimation(defenderInstanceId)
      if (playerDied) ui.triggerDeathAnimation(attackerInstanceId)

      if (enemyDied || playerDied) await delay(1100)

      state.value = newState
      // Dopiero tutaj — state.value ma isRevealed=true, więc karta nie zniknie
      if (wasHidden) ui.revealingCardId = null

      // pendingInteraction: silnik czeka na decyzję gracza (np. Alkonost hipnoza)
      // UI odczyta state.value.pendingInteraction i pokaże modal
    } catch (e: any) {
      console.warn('[gameStore] attack:', e.message)
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
    } catch (e: any) {
      console.warn('[gameStore] resolvePendingInteraction:', e.message)
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
      console.warn('[gameStore] endTurn:', e.message)
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
      state.value = engine.aiEndTurn()
      isAIThinking.value = false
      return
    }

    await delay(AI_DELAY_MS)

    const logBefore = state.value.actionLog.length
    aiTurnLogStart.value = logBefore
    const decisions = aiPlayer.planTurn(engine.getState())

    for (const decision of decisions) {
      if (winner.value) break
      // Pauza tury AI gdy gracz musi podjąć decyzję (np. Strela, Chowaniec)
      if (state.value?.pendingInteraction) break
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
                await delay(900)

                const prevP2Grave = state.value?.players.player2.graveyard.length ?? 0
                const prevP1Grave = state.value?.players.player1.graveyard.length ?? 0

                // Damage numbers dla ataku AI
                const aiTgtDefBefore = (() => {
                  for (const line of Object.values(state.value?.players.player1.field.lines ?? {})) {
                    const found = (line as any[]).find((c: any) => c.instanceId === decision.targetInstanceId)
                    if (found) return found.currentStats.defense
                  }
                  return 0
                })()
                const aiAtkDefBefore = (() => {
                  for (const line of Object.values(state.value?.players.player2.field.lines ?? {})) {
                    const found = (line as any[]).find((c: any) => c.instanceId === decision.cardInstanceId)
                    if (found) return found.currentStats.defense
                  }
                  return 0
                })()

                const newState = engine.aiAttack(decision.cardInstanceId, decision.targetInstanceId)

                const aiTgtDefAfter = (() => {
                  for (const line of Object.values(newState.players.player1.field.lines)) {
                    const found = (line as any[]).find((c: any) => c.instanceId === decision.targetInstanceId)
                    if (found) return found.currentStats.defense
                  }
                  return 0
                })()
                const aiAtkDefAfter = (() => {
                  for (const line of Object.values(newState.players.player2.field.lines)) {
                    const found = (line as any[]).find((c: any) => c.instanceId === decision.cardInstanceId)
                    if (found) return found.currentStats.defense
                  }
                  return 0
                })()
                const dmgToTgt = Math.max(0, aiTgtDefBefore - aiTgtDefAfter)
                const dmgToAi = Math.max(0, aiAtkDefBefore - aiAtkDefAfter)
                if (dmgToTgt > 0) ui.triggerDamageNumber(decision.targetInstanceId, dmgToTgt)
                if (dmgToAi > 0) ui.triggerDamageNumber(decision.cardInstanceId, dmgToAi)

                // Kontratak gracza — DEF atakującego AI spadła = gracz kontratakował
                if (dmgToAi > 0) {
                  console.log('[KONTRATAK] AI atakuje, gracz kontratakuje:', decision.targetInstanceId, 'dmgToAi:', dmgToAi)
                  ui.counterAttackCardId = decision.targetInstanceId
                  await delay(1000)
                  ui.counterAttackCardId = null
                }

                const aiDied = newState.players.player2.graveyard.length > prevP2Grave
                const playerDied = newState.players.player1.graveyard.length > prevP1Grave
                if (aiDied) ui.triggerDeathAnimation(decision.cardInstanceId)
                if (playerDied) ui.triggerDeathAnimation(decision.targetInstanceId)

                if (aiDied || playerDied) await delay(1100)

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
        // "Nie znaleziono kart" = cel zginął wcześniej w tej turze — normalne
        if (!e.message?.includes('Nie znaleziono kart') && !e.message?.includes('jeden atak')) {
          console.warn('[gameStore] AI decision error:', e.message)
        }
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

    // Jeśli tура przerwała się przez pendingInteraction — NIE kończymy, czekamy na gracza
    if (state.value?.pendingInteraction) {
      isAIThinking.value = false
      return
    }

    isAIThinking.value = false
    // Resetuj start tury gracza — teraz zaczyna gracz
    playerTurnLogStart.value = state.value?.actionLog.length ?? 0
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
    playerTurnSummary,
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
    playerCurrentLogs,
    aiCurrentLogs,
    // actions
    startGame,
    startAlphaGame,
    setupArenaMode,
    playCreature,
    playAdventure,
    attack,
    resolvePendingInteraction,
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
