/**
 * GameEngine — główna klasa orkiestrująca grę.
 * Łączy: TurnManager, CombatResolver, LineManager, DeckBuilder.
 * Store Pinia jest tylko adapterem który wywołuje metody tego silnika.
 */

import type { GameState, LogEntry, CardInstance } from './types'
import { GamePhase, BattleLine, CardPosition } from './constants'
import type { PlayerSide } from './types'
import { createInitialGameState, cloneGameState, addLog } from './GameStateUtils'
import { CardFactory } from './CardFactory'
import { buildRandomDeck, drawCards } from './DeckBuilder'
import { checkWinCondition, getAllCreaturesOnField, canAttack } from './LineManager'
import {
  processStartPhase,
  processDrawPhase,
  processEndPhase,
  playCreature,
  playAdventure,
  performAttack,
  changePosition,
  moveCreatureLine,
  activateCreatureEffect,
  drawCardManually,
} from './TurnManager'
import { GOLD_EDITION_RULES, EffectTrigger } from './constants'
import { buildAlphaDeck } from './DeckBuilder'
import { getEffect } from './EffectRegistry'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

export class GameEngine {
  private state: GameState
  private factory: CardFactory
  private onStateChange?: (state: GameState) => void
  private onLogEntry?: (entry: LogEntry) => void
  private arenaMode = false

  constructor() {
    this.factory = new CardFactory()
    this.factory.loadCreatures(istotypData as any)
    this.factory.loadAdventures(przygodyData as any)
    this.state = createInitialGameState('gold')
  }

  // ===== SETUP =====

  startAlphaGame(): GameState {
    this.arenaMode = false
    this.state = createInitialGameState('gold')

    const deck1 = buildAlphaDeck(this.factory, 'player1')
    const deck2 = buildAlphaDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    drawCards(this.state.players.player1, GOLD_EDITION_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, GOLD_EDITION_RULES.STARTING_HAND)

    this.state.players.player1.gold = GOLD_EDITION_RULES.STARTING_GOLD
    this.state.players.player2.gold = GOLD_EDITION_RULES.STARTING_GOLD

    const startLog = addLog(this.state, 'Gra Alpha rozpoczęta! Tylko sprawdzone karty.', 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  startGame(gameMode: 'gold' | 'slava' = 'gold'): GameState {
    this.arenaMode = false
    this.state = createInitialGameState(gameMode)

    // Zbuduj talie
    const deck1 = buildRandomDeck(this.factory, 'player1')
    const deck2 = buildRandomDeck(this.factory, 'player2')

    this.state.players.player1.deck = deck1
    this.state.players.player2.deck = deck2

    // Dobierz karty startowe
    drawCards(this.state.players.player1, GOLD_EDITION_RULES.STARTING_HAND)
    drawCards(this.state.players.player2, GOLD_EDITION_RULES.STARTING_HAND)

    this.state.players.player1.gold = GOLD_EDITION_RULES.STARTING_GOLD
    this.state.players.player2.gold = GOLD_EDITION_RULES.STARTING_GOLD

    const startLog = addLog(this.state, 'Gra rozpoczęta! Tryb: ' + gameMode, 'system')
    this.state.actionLog.push(startLog)
    this.onLogEntry?.(startLog)

    // Zaczyna faza START dla player1
    this.state = this.runStartPhase(this.state)

    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  // ===== ARENA =====

  /**
   * Załaduj dowolny customowy GameState (dla trybu Arena/playground).
   */
  setupArena(customState: GameState): GameState {
    this.arenaMode = true
    this.state = cloneGameState(customState)
    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  // ===== AKCJE GRACZA =====

  /**
   * Gracz wystawia istotę z ręki na pole.
   */
  playerPlayCreature(cardInstanceId: string, targetLine: BattleLine): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.PLAY)

    const { newState, log } = playCreature(this.state, cardInstanceId, targetLine)
    this.applyStateAndLog(newState, log)

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz gra kartę przygody.
   */
  playerPlayAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.PLAY)

    const { newState, log } = playAdventure(this.state, cardInstanceId, targetInstanceId, useEnhanced)
    this.applyStateAndLog(newState, log)

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz wykonuje atak.
   */
  playerAttack(attackerInstanceId: string, defenderInstanceId: string): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.COMBAT)

    // Limit: atak na turę (z wyjątkami dla Kikimory i Leśnicy)
    const p1Creatures = getAllCreaturesOnField(this.state, 'player1')

    // Przyjaźń+: istota z freeAttacksLeft może atakować poza limitem
    const attacker = p1Creatures.find(c => c.instanceId === attackerInstanceId)
    const hasFreeAttack = attacker && ((attacker.metadata.freeAttacksLeft as number) ?? 0) > 0

    if (!hasFreeAttack) {
      // Kikimora: jej atak nie zajmuje slotu atakowego (aura "darmowy atak")
      const normalAttacksUsed = p1Creatures
        .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
        .filter(c => {
          // Leśnica może atakować 2 razy — liczy tylko jeśli wyczerpała oba sloty
          if ((c.cardData as any).effectId === 'lesnica_double_attack') {
            return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
          }
          return c.hasAttackedThisTurn
        }).length
      // Chłop: AURA daje +1 dodatkowy slot ataku
      const hasChlop = p1Creatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
      const maxAttacks = hasChlop ? 2 : 1
      if (normalAttacksUsed >= maxAttacks) {
        throw new Error('Możesz wykonać tylko jeden atak na turę.')
      }
    }

    // Liczyrzepa: gracz musi wybrać typ ataku PRZED wykonaniem ataku
    const attackerCard = p1Creatures.find(c => c.instanceId === attackerInstanceId)
    if (attackerCard && (attackerCard.cardData as any).effectId === 'liczyrzepa_choose_type') {
      const pendingState = cloneGameState(this.state)
      pendingState.pendingInteraction = {
        type: 'liczyrzepa_type',
        sourceInstanceId: attackerInstanceId,
        respondingPlayer: 'player1',
        availableChoices: ['Wręcz', 'Żywioł', 'Magia', 'Dystans'],
        targetInstanceId: defenderInstanceId,
      }
      addLog(pendingState, `${attackerCard.cardData.name}: Wybierz typ ataku przed uderzeniem!`, 'effect')
      this.applyStateAndLog(pendingState, [])
      return cloneGameState(this.state)
    }

    const { newState, log } = performAttack(this.state, attackerInstanceId, defenderInstanceId)
    this.applyStateAndLog(newState, log)

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz zmienia pozycję karty (Atak/Obrona).
   */
  playerChangePosition(cardInstanceId: string, newPos: CardPosition): GameState {
    this.assertPlayerTurn()

    const { newState, log } = changePosition(this.state, cardInstanceId, newPos)
    this.applyStateAndLog(newState, log)

    return cloneGameState(this.state)
  }

  /**
   * Gracz przesuwa istotę między liniami.
   */
  playerMoveCreatureLine(cardInstanceId: string, targetLine: BattleLine): GameState {
    this.assertPlayerTurn()

    const { newState, log } = moveCreatureLine(this.state, cardInstanceId, targetLine)
    this.applyStateAndLog(newState, log)

    return cloneGameState(this.state)
  }

  /**
   * Gracz przechodzi do następnej fazy.
   */
  /**
   * Gracz aktywuje zdolność istoty (kliknięcie ⚡).
   */
  playerActivateEffect(cardInstanceId: string, targetInstanceId?: string): GameState {
    this.assertPlayerTurn()
    const { newState, log } = activateCreatureEffect(this.state, cardInstanceId, targetInstanceId)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz potwierdza wykonanie efektu ON_PLAY przy wystawieniu (gratis).
   */
  confirmOnPlay(): GameState {
    const cardId = this.state.awaitingOnPlayConfirmation
    if (!cardId) return cloneGameState(this.state)

    const newState = cloneGameState(this.state)
    newState.awaitingOnPlayConfirmation = null

    const card = getAllCreaturesOnField(newState, 'player1').find(c => c.instanceId === cardId)
      ?? getAllCreaturesOnField(newState, 'player2').find(c => c.instanceId === cardId)
    if (!card) return cloneGameState(this.state)

    const effect = getEffect((card.cardData as any).effectId)
    if (!effect) return cloneGameState(this.state)

    try {
      const result = effect.execute({ state: newState, source: card, trigger: EffectTrigger.ON_PLAY })
      this.applyStateAndLog(result.newState, result.log)
    } catch (err) {
      console.warn('[GameEngine] confirmOnPlay error:', err)
      this.state = newState
    }

    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz rezygnuje z efektu ON_PLAY (klika NIE).
   * Jeśli karta ma też zdolność activatable, zaznacza freeActivationPending,
   * żeby gracz mógł skorzystać z darmowej aktywacji później (przycisk ⚡).
   */
  skipOnPlay(): GameState {
    const cardId = this.state.awaitingOnPlayConfirmation
    const newState = cloneGameState(this.state)
    newState.awaitingOnPlayConfirmation = null

    if (cardId) {
      const card = getAllCreaturesOnField(newState, 'player1').find(c => c.instanceId === cardId)
        ?? getAllCreaturesOnField(newState, 'player2').find(c => c.instanceId === cardId)
      const effect = card ? getEffect((card.cardData as any).effectId) : null
      if (card && effect?.activatable) {
        card.metadata.freeActivationPending = true
      }
    }

    this.applyStateAndLog(newState, [addLog(newState, 'Efekt przy wystawieniu pominięty.', 'system')])
    return cloneGameState(this.state)
  }

  /**
   * Gracz poddaje grę.
   */
  surrender(side: 'player1' | 'player2'): GameState {
    const newState = cloneGameState(this.state)
    newState.winner = side === 'player1' ? 'player2' : 'player1'
    const log = [addLog(newState, `${side} poddaje grę!`, 'system')]
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  /**
   * Gracz ręcznie dobiera kartę podczas fazy PLAY (do 5 kart na ręce).
   */
  playerDrawCard(): GameState {
    this.assertPlayerTurn()
    this.assertPhase(GamePhase.PLAY)
    const { newState, log } = drawCardManually(this.state)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  playerAdvancePhase(): GameState {
    this.assertPlayerTurn()

    const currentPhase = this.state.currentPhase

    if (currentPhase === GamePhase.PLAY) {
      // PLAY → COMBAT
      let newState = cloneGameState(this.state)
      newState.currentPhase = GamePhase.COMBAT
      const log = [addLog(newState, 'Faza walki!', 'system')]
      this.applyStateAndLog(newState, log)
    } else if (currentPhase === GamePhase.COMBAT) {
      // COMBAT → END
      this.playerEndTurn()
    }

    return cloneGameState(this.state)
  }

  /**
   * Gracz kończy turę.
   */
  playerEndTurn(): GameState {
    this.assertPlayerTurn()

    const { newState, log } = processEndPhase(this.state)
    this.applyStateAndLog(newState, log)

    // Uruchom START + DRAW dla AI (lub następnej tury gracza)
    this.state = this.runStartPhase(this.state)
    this.notifyStateChange()

    // Jeśli to tura AI, uruchom AI
    if (this.state.players[this.state.currentTurn].isAI) {
      // AI jest wyzwalane asynchronicznie przez store
      return cloneGameState(this.state)
    }

    return cloneGameState(this.state)
  }

  // ===== AI EXECUTION (bez sprawdzania kolejki gracza) =====

  aiPlayCreature(cardInstanceId: string, targetLine: BattleLine, skipStrelaCheck = false): GameState {
    this.assertPhase(GamePhase.PLAY)

    // Strela: jeśli gracz ma Strelę w ręce, może ją zagrać jako przerwanie
    if (!skipStrelaCheck) {
      const strelaCard = this.state.players.player1.hand.find(
        c => (c.cardData as any).effectId === 'strela_flash_counter'
      )
      if (strelaCard) {
        const pendingState = cloneGameState(this.state)
        pendingState.pendingInteraction = {
          type: 'strela_intercept',
          sourceInstanceId: strelaCard.instanceId,
          respondingPlayer: 'player1',
          metadata: { aiCardInstanceId: cardInstanceId, aiTargetLine: targetLine, aiCardType: 'creature' },
        }
        addLog(pendingState, `AI zagrywa kartę! Strela jest w twojej ręce — czy chcesz przerwać?`, 'effect')
        this.applyStateAndLog(pendingState, [])
        return cloneGameState(this.state)
      }
    }

    const { newState, log } = playCreature(this.state, cardInstanceId, targetLine)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  aiPlayAdventure(cardInstanceId: string, targetInstanceId?: string, useEnhanced = false, skipStrelaCheck = false): GameState {
    this.assertPhase(GamePhase.PLAY)

    if (!skipStrelaCheck) {
      const strelaCard = this.state.players.player1.hand.find(
        c => (c.cardData as any).effectId === 'strela_flash_counter'
      )
      if (strelaCard) {
        const pendingState = cloneGameState(this.state)
        pendingState.pendingInteraction = {
          type: 'strela_intercept',
          sourceInstanceId: strelaCard.instanceId,
          respondingPlayer: 'player1',
          metadata: { aiCardInstanceId: cardInstanceId, aiTargetInstanceId: targetInstanceId, aiCardType: 'adventure', aiUseEnhanced: useEnhanced },
        }
        addLog(pendingState, `AI zagrywa kartę! Strela jest w twojej ręce — czy chcesz przerwać?`, 'effect')
        this.applyStateAndLog(pendingState, [])
        return cloneGameState(this.state)
      }
    }

    const { newState, log } = playAdventure(this.state, cardInstanceId, targetInstanceId, useEnhanced)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  aiAdvanceToCombat(): GameState {
    if (this.state.currentPhase === GamePhase.PLAY) {
      const newState = cloneGameState(this.state)
      newState.currentPhase = GamePhase.COMBAT
      const log = [addLog(newState, 'Faza walki!', 'system')]
      this.applyStateAndLog(newState, log)
    }
    return cloneGameState(this.state)
  }

  aiAttack(attackerInstanceId: string, defenderInstanceId: string): GameState {
    this.assertPhase(GamePhase.COMBAT)
    // Limit: AI może wykonać tylko jeden atak na turę (symetrycznie z graczem)
    const p2Creatures = getAllCreaturesOnField(this.state, 'player2')
    const aiNormalAttacksUsed = p2Creatures
      .filter(c => (c.cardData as any).effectId !== 'kikimora_free_attack')
      .filter(c => {
        if ((c.cardData as any).effectId === 'lesnica_double_attack') {
          return ((c.metadata.attacksThisTurn as number) ?? 0) >= 2
        }
        return c.hasAttackedThisTurn
      }).length
    const aiHasChlop = p2Creatures.some(c => (c.cardData as any).effectId === 'chlop_extra_attack')
    if (aiNormalAttacksUsed >= (aiHasChlop ? 2 : 1)) {
      throw new Error('AI może wykonać tylko jeden atak na turę.')
    }
    const { newState, log } = performAttack(this.state, attackerInstanceId, defenderInstanceId)
    this.applyStateAndLog(newState, log)
    this.checkWinAndNotify()
    return cloneGameState(this.state)
  }

  aiChangePosition(cardInstanceId: string, newPos: CardPosition): GameState {
    const { newState, log } = changePosition(this.state, cardInstanceId, newPos)
    this.applyStateAndLog(newState, log)
    return cloneGameState(this.state)
  }

  aiEndTurn(): GameState {
    const { newState, log } = processEndPhase(this.state)
    this.applyStateAndLog(newState, log)
    this.state = this.runStartPhase(this.state)
    this.notifyStateChange()
    return cloneGameState(this.state)
  }

  // ===== PENDING INTERACTION RESOLVER =====

  /**
   * Rozwiązuje oczekującą interakcję gracza (np. Alkonost hipnoza, Kresnik wybór buffy).
   * `choice` — instanceId karty lub string z opcją (zależnie od typu interakcji).
   */
  resolvePendingInteraction(choice: string): GameState {
    const interaction = this.state.pendingInteraction
    if (!interaction) throw new Error('[GameEngine] Brak oczekującej interakcji.')

    const newState = cloneGameState(this.state)
    delete newState.pendingInteraction

    // Chowaniec: przejmij atak (tak) lub przepuść (nie)
    if (interaction.type === 'chowaniec_intercept') {
      const attackerId = interaction.attackerInstanceId!
      const originalTargetId = interaction.targetInstanceId!
      const chowaniecId = interaction.sourceInstanceId
      const actualTargetId = choice === 'yes' ? chowaniecId : originalTargetId
      const { newState: afterAtk, log: atkLog } = performAttack(newState, attackerId, actualTargetId, { skipChowaniecCheck: true })
      this.applyStateAndLog(afterAtk, atkLog)
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    if (interaction.type === 'alkonost_target') {
      const attackerInstanceId = interaction.attackerInstanceId!
      const targetInstanceId = choice

      // Atakujący już użył hasAttackedThisTurn — chwilowo zresetuj żeby resolveAttack przeszedł
      const fields = [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT] as const
      for (const side of ['player1', 'player2'] as PlayerSide[]) {
        for (const line of fields) {
          const card = newState.players[side].field.lines[line].find(c => c.instanceId === attackerInstanceId)
          if (card) card.hasAttackedThisTurn = false
        }
      }

      const { newState: afterForced, log } = performAttack(newState, attackerInstanceId, targetInstanceId)
      // Po wymuszonym ataku: przywróć hasAttackedThisTurn = true (to był dodatkowy atak, nie normalny slot)
      for (const side of ['player1', 'player2'] as PlayerSide[]) {
        for (const line of fields) {
          const card = afterForced.players[side].field.lines[line].find(c => c.instanceId === attackerInstanceId)
          if (card) card.hasAttackedThisTurn = true
        }
      }
      this.applyStateAndLog(afterForced, log)
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Kresnik: zastosuj wybraną premię przez ponowne wywołanie efektu z metadata
    if (interaction.type === 'kresnik_buff') {
      const effect = getEffect('kresnik_choose_buff')
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (effect && sourceCard) {
        const result = effect.execute({
          state: newState,
          source: sourceCard,
          trigger: EffectTrigger.ON_PLAY,
          metadata: { kresnikBuff: choice },
        })
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Baba: zastosuj wybraną domenę
    if (interaction.type === 'baba_domain') {
      const effect = getEffect('baba_bonus_vs_type')
      const sourceCard = this.findCardInState(newState, interaction.sourceInstanceId)
      if (effect && sourceCard) {
        const result = effect.execute({
          state: newState,
          source: sourceCard,
          trigger: EffectTrigger.ON_PLAY,
          metadata: { babaDomain: choice },
        })
        this.applyStateAndLog(result.newState, result.log)
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Cmentarna Baba: wskrzesz wybranego Nieumarłego z cmentarza
    if (interaction.type === 'cmentarna_baba_resurrect') {
      const ownerSide = interaction.respondingPlayer
      const owner = newState.players[ownerSide]
      const gravIdx = owner.graveyard.findIndex(c => c.instanceId === choice)
      if (gravIdx !== -1) {
        const toResurrect = owner.graveyard.splice(gravIdx, 1)[0]
        toResurrect.currentStats.defense = (toResurrect.cardData as any).stats.defense
        toResurrect.line = BattleLine.FRONT
        toResurrect.turnsInPlay = 0
        owner.field.lines[BattleLine.FRONT].push(toResurrect)
        const log = addLog(newState, `Cmentarna Baba: Wskrzesza ${toResurrect.cardData.name} z cmentarza!`, 'effect')
        this.applyStateAndLog(newState, [log])
      } else {
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Wielkolud: kontratakuje wybranego wroga
    if (interaction.type === 'wielkolud_counter') {
      const wielkolud = this.findCardInState(newState, interaction.sourceInstanceId)
      const chosen = this.findCardInState(newState, choice)
      if (wielkolud && chosen) {
        const damage = wielkolud.currentStats.attack
        chosen.currentStats.defense -= damage
        const log = addLog(newState,
          `${wielkolud.cardData.name}: Kontratakuje ${chosen.cardData.name} za ${damage} obrażeń!`,
          'effect'
        )
        // Usuń martwe jednostki
        for (const side of ['player1', 'player2'] as PlayerSide[]) {
          for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
            const dead = newState.players[side].field.lines[line].filter(c => c.currentStats.defense <= 0)
            for (const dc of dead) {
              newState.players[side].field.lines[line] = newState.players[side].field.lines[line].filter(c => c.instanceId !== dc.instanceId)
              newState.players[side].graveyard.push(dc)
              addLog(newState, `${dc.cardData.name} ginie od kontrataku Wielkoluda!`, 'combat')
            }
          }
        }
        this.applyStateAndLog(newState, [log])
      } else {
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Inkluz: przekaż skradzioną premię wybranemu sojusznikowi
    if (interaction.type === 'inkluz_recipient') {
      const stolenRaw = interaction.metadata?.stolenEffect as string | undefined
      const recipient = this.findCardInState(newState, choice)
      if (stolenRaw && recipient) {
        try {
          const stolen = JSON.parse(stolenRaw)
          recipient.activeEffects.push(stolen)
          const log = addLog(newState,
            `Inkluz: Przekazuje premię "${stolen.effectId}" do ${recipient.cardData.name}!`,
            'effect'
          )
          this.applyStateAndLog(newState, [log])
        } catch {
          this.applyStateAndLog(newState, [])
        }
      } else {
        this.applyStateAndLog(newState, [])
      }
      return cloneGameState(this.state)
    }

    // Liczyrzepa: ustaw wybrany typ i wykonaj właściwy atak
    if (interaction.type === 'liczyrzepa_type') {
      const card = this.findCardInState(newState, interaction.sourceInstanceId)
      const targetId = interaction.targetInstanceId
      if (card && targetId) {
        const typeMap: Record<string, number> = {
          'Wręcz': 0, 'Żywioł': 1, 'Magia': 2, 'Dystans': 3,
        }
        card.metadata.licyzrepaAttackTypeChosen = typeMap[choice] ?? 0
        const { newState: afterAtk, log: atkLog } = performAttack(newState, card.instanceId, targetId)
        // Wyczyść tymczasowy typ po ataku
        for (const side of ['player1', 'player2'] as PlayerSide[]) {
          for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
            const found = afterAtk.players[side].field.lines[line].find(c => c.instanceId === card.instanceId)
            if (found) delete found.metadata.licyzrepaAttackTypeChosen
          }
        }
        this.applyStateAndLog(afterAtk, atkLog)
      } else {
        this.applyStateAndLog(newState, [])
      }
      this.checkWinAndNotify()
      return cloneGameState(this.state)
    }

    // Strela: przerwanie AI zagrania karty
    if (interaction.type === 'strela_intercept') {
      const strelaId = interaction.sourceInstanceId
      const meta = interaction.metadata ?? {}

      if (choice === 'yes') {
        // Zagraj Strelę z ręki gracza (darmowo, na Linię 1)
        const strelaInHand = newState.players.player1.hand.find(c => c.instanceId === strelaId)
        if (strelaInHand) {
          newState.players.player1.hand = newState.players.player1.hand.filter(c => c.instanceId !== strelaId)
          strelaInHand.line = BattleLine.FRONT
          newState.players.player1.field.lines[BattleLine.FRONT].push(strelaInHand)

          // AI's karta wraca na spód talii
          const aiCardId = meta.aiCardInstanceId as string
          const aiCard = newState.players.player2.hand.find(c => c.instanceId === aiCardId)
          if (aiCard) {
            newState.players.player2.hand = newState.players.player2.hand.filter(c => c.instanceId !== aiCardId)
            newState.players.player2.deck.push(aiCard)
            addLog(newState, `Strela! Wchodzi na pole — karta AI "${aiCard.cardData.name}" trafia na spód talii.`, 'effect')
          } else {
            addLog(newState, `Strela! Wchodzi na pole z ręki.`, 'effect')
          }
        }
        this.applyStateAndLog(newState, [])
        this.checkWinAndNotify()
        return cloneGameState(this.state)
      } else {
        // Gracz rezygnuje — AI zagrywa kartę normalnie (z pominięciem sprawdzenia Streli)
        this.applyStateAndLog(newState, [])
        if (meta.aiCardType === 'creature') {
          return this.aiPlayCreature(meta.aiCardInstanceId as string, meta.aiTargetLine as BattleLine, true)
        } else {
          return this.aiPlayAdventure(meta.aiCardInstanceId as string, meta.aiTargetInstanceId as string | undefined, !!meta.aiUseEnhanced, true)
        }
      }
    }

    // Pozostałe typy — fallback
    this.applyStateAndLog(newState, [])
    return cloneGameState(this.state)
  }

  private findCardInState(state: GameState, instanceId: string) {
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
        const found = state.players[side].field.lines[line].find(c => c.instanceId === instanceId)
        if (found) return found
      }
    }
    return null
  }

  // ===== ODCZYT STANU =====

  getState(): GameState {
    return cloneGameState(this.state)
  }

  getCurrentPhase(): GamePhase {
    return this.state.currentPhase
  }

  getCurrentTurn(): PlayerSide {
    return this.state.currentTurn
  }

  getLegalAttackTargets(attackerInstanceId: string): CardInstance[] {
    const defenderSide: PlayerSide = this.state.currentTurn === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(this.state, defenderSide)
    const attacker = this.findAttacker(attackerInstanceId)
    if (!attacker) return []
    return enemies.filter((e: CardInstance) => canAttack(this.state, attacker, e).valid)
  }

  // ===== CALLBACKS =====

  onStateChanged(callback: (state: GameState) => void): void {
    this.onStateChange = callback
  }

  onLog(callback: (entry: LogEntry) => void): void {
    this.onLogEntry = callback
  }

  // ===== INTERNALS =====

  private runStartPhase(state: GameState): GameState {
    let s = state

    const { newState: afterStart, log: startLog } = processStartPhase(s)
    s = afterStart
    this.pushLogs(startLog)

    const { newState: afterDraw, log: drawLog } = processDrawPhase(s)
    s = afterDraw
    this.pushLogs(drawLog)

    return s
  }

  private applyStateAndLog(newState: GameState, log: LogEntry[]): void {
    this.state = newState
    this.pushLogs(log)
    this.notifyStateChange()
  }

  private pushLogs(logs: LogEntry[]): void {
    for (const entry of logs) {
      this.state.actionLog.push(entry)
      this.onLogEntry?.(entry)
    }
  }

  private notifyStateChange(): void {
    this.onStateChange?.(cloneGameState(this.state))
  }

  private checkWinAndNotify(): void {
    if (this.arenaMode) return
    const winner = checkWinCondition(this.state)
    if (winner) {
      this.state.winner = winner
      const log = addLog(this.state, `KONIEC GRY! Wygrywa: ${winner}!`, 'system')
      this.state.actionLog.push(log)
      this.onLogEntry?.(log)
      this.notifyStateChange()
    }
  }

  private assertPlayerTurn(): void {
    const current = this.state.players[this.state.currentTurn]
    if (current.isAI) {
      throw new Error(`[GameEngine] To tura AI, nie gracza.`)
    }
  }

  private assertPhase(expected: GamePhase): void {
    if (this.state.currentPhase !== expected) {
      throw new Error(`[GameEngine] Oczekiwana faza ${expected}, jest ${this.state.currentPhase}.`)
    }
  }

  private findAttacker(instanceId: string): CardInstance | null {
    const player = this.state.players[this.state.currentTurn]
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = player.field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
    return null
  }
}

// Singleton do użycia w testach
export const gameEngine = new GameEngine()
