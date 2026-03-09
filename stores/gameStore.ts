/**
 * gameStore — Pinia bridge między GameEngine a Vue UI.
 * Trzyma reaktywny stan gry i eksponuje akcje dla komponentów.
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { GameEngine } from '../game-engine/GameEngine'
import { AIPlayer } from '../game-engine/AIPlayer'
import type { AIDifficulty } from '../game-engine/AIPlayer'
import type { GameState, CardInstance, LogEntry } from '../game-engine/types'
import { GamePhase, BattleLine, CardPosition } from '../game-engine/constants'
import { canAttack, getAllCreaturesOnField } from '../game-engine/LineManager'
import { getEffect } from '../game-engine/EffectRegistry'
import type { PlayerSide } from '../game-engine/types'
import { useUIStore } from './uiStore'

const AI_DELAY_MS = 1300

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
  const aiCurrentLogs = computed(() => (state.value?.actionLog ?? []).slice(aiTurnLogStart.value).slice(-6))

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
  function playCreature(cardInstanceId: string, line: BattleLine) {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerPlayCreature(cardInstanceId, line)
    } catch (e: any) {
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

    // Typ ataku napastnika → VFX/SFX
    const attacker = findCardOnField('player1', attackerInstanceId)
    ui.animatingAttackType = attacker ? ((attacker.cardData as any).attackType ?? null) : null

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

      // ODPORNY flash — atak zadał 0 obrażeń, pokaż przed kontratakiem
      if (dmgToDefender === 0) {
        ui.triggerImmuneFlash(defenderInstanceId)
        await delay(1000)
      }

      // Kontratak — DEF atakującego spadła = kontratak nastąpił
      if (dmgToAttacker > 0) {
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

      // pendingInteraction: silnik czeka na decyzję — jeśli AI responduje, auto-rozwiąż
      if (newState.pendingInteraction?.respondingPlayer === 'player2') {
        await autoResolveAIInteraction()
      }

      // Auto-end turn po udanym ataku (chyba że jest pendingInteraction lub gracz ma jeszcze ataki)
      if (!state.value?.pendingInteraction && !winner.value) {
        const hasMoreAttacks = hasRemainingAttacks(newState)
        if (!hasMoreAttacks) {
          await delay(400)
          endTurn()
        }
      }
    } catch (e: any) {
      ui.showPlayLimitToast(e.message ?? 'Nie można zaatakować.')
      // Cleanup reveal state on error
      if (wasHidden) ui.revealingCardId = null
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
      state.value = engine.playerChangePosition(cardInstanceId, position)
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
      state.value = engine.playerActivateEffect(cardInstanceId, targetInstanceId)
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
      state.value = engine.playerDrawCard()
    } catch (e: any) {
      const ui = useUIStore()
      ui.showPlayLimitToast(e.message ?? 'Nie można dobrać karty.')
    }
  }

  function moveCreatureLine(cardInstanceId: string, targetLine: BattleLine) {
    if (!isPlayerTurn.value) return
    try {
      state.value = engine.playerMoveCreatureLine(cardInstanceId, targetLine)
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
      state.value = engine.aiEndTurn()
      isAIThinking.value = false
      return
    }

    // Safety timeout — if AI turn takes more than 15 seconds, force end it
    const aiTimeout = setTimeout(() => {
      if (isAIThinking.value) {
        console.warn('[gameStore] AI turn timeout — forcing end')
        try {
          state.value = engine.aiEndTurn()
        } catch {
          // aiEndTurn failed — force recovery to player turn
          state.value = engine.forcePlayerTurn()
        }
        isAIThinking.value = false
        playerTurnLogStart.value = state.value?.actionLog.length ?? 0
      }
    }, 15000)

    await delay(AI_DELAY_MS)

    if (!state.value) { isAIThinking.value = false; clearTimeout(aiTimeout); return }
    const logBefore = state.value.actionLog.length
    aiTurnLogStart.value = logBefore
    const decisions = aiPlayer.planTurn(engine.getState())

    for (const decision of decisions) {
      if (!state.value || winner.value) break
      // Pauza tury AI gdy gracz musi podjąć decyzję (np. Strela, Chowaniec)
      if (state.value.pendingInteraction) break
      await delay(AI_DELAY_MS)
      if (!state.value) break

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
          case 'attack':
            if (decision.cardInstanceId && decision.targetInstanceId) {
              if (engine.getCurrentPhase() === GamePhase.PLAY) {
                state.value = engine.aiAdvanceToCombat()
                await delay(400)
              }
              {
                const ui = useUIStore()

                // Before AI attack animation:
                // 1. Reveal the attacker card if hidden
                const aiAttacker = findCardOnField('player2', decision.cardInstanceId)
                const wasAttackerHidden = aiAttacker && !aiAttacker.isRevealed
                if (wasAttackerHidden) {
                  ui.revealingCardId = decision.cardInstanceId
                  await delay(600)
                }

                // 2. Ensure card is visually in ATTACK position before animation
                const aiAttackerNow = findCardOnField('player2', decision.cardInstanceId)
                if (aiAttackerNow && aiAttackerNow.position !== CardPosition.ATTACK) {
                  try {
                    state.value = engine.aiChangePosition(decision.cardInstanceId, CardPosition.ATTACK)
                    await delay(400)
                  } catch {}
                }

                // 3. Attack type → VFX/SFX
                const aiAtkCard = findCardOnField('player2', decision.cardInstanceId)
                ui.animatingAttackType = aiAtkCard ? ((aiAtkCard.cardData as any).attackType ?? null) : null

                // 3b. Attack animation
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

                // ODPORNY flash — AI atak zadał 0 obrażeń
                if (dmgToTgt === 0) {
                  ui.triggerImmuneFlash(decision.targetInstanceId)
                  await delay(1000)
                }

                // Kontratak gracza — DEF atakującego AI spadła = gracz kontratakował
                if (dmgToAi > 0) {
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

                // Auto-rozwiąż interakcje AI (np. Alkonost AI)
                if (state.value?.pendingInteraction?.respondingPlayer === 'player2') {
                  await autoResolveAIInteraction()
                }
              }
            }
            break
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
        // "Nie znaleziono kart" = cel zginął wcześniej w tej turze — normalne
        // Silently ignore expected AI errors (targets died mid-turn, attack limits)
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

    clearTimeout(aiTimeout)

    // Jeśli tура przerwała się przez pendingInteraction — NIE kończymy, czekamy na gracza
    if (state.value?.pendingInteraction) {
      isAIThinking.value = false
      return
    }

    // Safety: jeśli tura nadal należy do AI (end_turn nie wykonane), wymuś zakończenie
    if (state.value && state.value.currentTurn !== 'player1' && !winner.value) {
      try {
        state.value = engine.aiEndTurn()
      } catch {
        state.value = engine.forcePlayerTurn()
      }
    }

    isAIThinking.value = false
    // Resetuj start tury gracza — teraz zaczyna gracz
    playerTurnLogStart.value = state.value?.actionLog.length ?? 0
  }

  function dismissAISummary() {
    aiTurnSummary.value = []
  }

  /**
   * Gdy pendingInteraction ma respondingPlayer = AI, auto-rozwiąż za AI.
   * Zwraca true jeśli interakcja została rozwiązana.
   */
  async function autoResolveAIInteraction(): Promise<boolean> {
    const interaction = state.value?.pendingInteraction
    if (!interaction) return false
    if (interaction.respondingPlayer === 'player1') return false // gracz decyduje

    await delay(600)

    // AI wybiera: pierwszy dostępny cel / pierwszą opcję
    let choice: string | undefined

    if (interaction.availableTargetIds?.length) {
      // AI: wybierz cel z najwyższym threat score (lub losowo)
      choice = interaction.availableTargetIds[0]
    } else if (interaction.availableChoices?.length) {
      choice = interaction.availableChoices[0]
    } else {
      // Tak/Nie: AI zawsze mówi 'yes' (np. Chowaniec/Brzegina)
      choice = 'yes'
    }

    if (choice) {
      try {
        state.value = engine.resolvePendingInteraction(choice)
      } catch (e: any) {
        // silently ignore AI auto-resolve errors
      }
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
