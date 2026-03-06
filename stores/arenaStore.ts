/**
 * arenaStore — plac testowy dla pojedynczych kart.
 * Gracz wybiera kartę autocomplete → dostaje preset scenariusz → testuje efekt.
 * AI nie wykonuje tury; po endTurn gracz od razu wraca do swojej tury.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreatureCardData, AdventureCardData } from '../game-engine/types'
import { GamePhase, BattleLine } from '../game-engine/constants'
import {
  CardFactory,
  createCreatureInstance,
  createAdventureInstance,
} from '../game-engine/CardFactory'
import { createInitialGameState } from '../game-engine/GameStateUtils'
import { ALPHA_CREATURE_EFFECT_IDS } from '../game-engine/DeckBuilder'
import { useGameStore } from './gameStore'

import istotypData from '../data/Slava_Vol2_Istoty.json'
import przygodyData from '../data/Slava_Vol2_KartyPrzygody.json'

// Singleton factory dla katalogu kart
const _factory = new CardFactory()
_factory.loadCreatures(istotypData as any)
_factory.loadAdventures(przygodyData as any)

export interface ArenaCardEntry {
  id: number
  name: string
  cardType: 'creature' | 'adventure'
  effectId: string
  effectDescription: string
  data: CreatureCardData | AdventureCardData
}

export const useArenaStore = defineStore('arena', () => {
  // ===== KATALOG KART =====
  const catalog: ArenaCardEntry[] = [
    ..._factory.getAllCreatures().map(c => ({
      id: c.id,
      name: c.name,
      cardType: 'creature' as const,
      effectId: c.effectId,
      effectDescription: c.effectDescription,
      data: c,
    })),
    ..._factory.getAllAdventures().map(a => ({
      id: a.id,
      name: a.name,
      cardType: 'adventure' as const,
      effectId: a.effectId,
      effectDescription: a.effectDescription,
      data: a,
    })),
  ]

  const focusedEntry = ref<ArenaCardEntry | null>(null)
  const isReady = ref(false)

  // ===== SETUP SCENARIUSZA =====
  function setupScenario(entry: ArenaCardEntry) {
    const game = useGameStore()
    focusedEntry.value = entry

    const freshState = createInitialGameState('gold')
    freshState.currentPhase = GamePhase.PLAY
    freshState.players.player1.gold = 5
    freshState.players.player2.gold = 5
    freshState.roundNumber = 1
    freshState.turnNumber = 1

    const allCreatures = _factory.getAllCreatures()

    // Testowana karta w ręce gracza
    const selectedInstance = entry.cardType === 'creature'
      ? createCreatureInstance(entry.data as CreatureCardData, 'player1')
      : createAdventureInstance(entry.data as AdventureCardData, 'player1')
    selectedInstance.isRevealed = true
    freshState.players.player1.hand.push(selectedInstance)

    // Dodatkowe karty na rękę gracza: 3 inne istoty z alpha
    const HAND_EXTRAS = ['blotnik_taunt', 'rusalka_mirror_attack', 'alkonost_redirect_counterattack', 'chowaniec_intercept']
    const extras = allCreatures
      .filter(c => ALPHA_CREATURE_EFFECT_IDS.has(c.effectId) && c.effectId !== entry.effectId)
      .filter(c => HAND_EXTRAS.includes(c.effectId))
    for (const extraData of extras.slice(0, 3)) {
      const extra = createCreatureInstance(extraData, 'player1')
      extra.isRevealed = true
      freshState.players.player1.hand.push(extra)
    }

    // Jedna karta przygody z alpha na rękę
    const alphaAdventures = _factory.getAllAdventures().filter(a =>
      ['adventure_trucizna', 'adventure_moc_swiatogora', 'adventure_topor_peruna'].includes(a.effectId)
    )
    if (alphaAdventures.length > 0) {
      const advCard = createAdventureInstance(alphaAdventures[0], 'player1')
      advCard.isRevealed = true
      freshState.players.player1.hand.push(advCard)
    }

    // Sojusznik gracza w L1
    const allyData = allCreatures.find(c => c.effectId === 'dobroochoczy_no_counter') ?? allCreatures[9]
    if (allyData) {
      const ally = createCreatureInstance(allyData, 'player1')
      ally.line = BattleLine.FRONT
      ally.isRevealed = true
      ally.roundEnteredPlay = 1
      ally.turnsInPlay = 1
      freshState.players.player1.field.lines[BattleLine.FRONT].push(ally)
    }

    // Wróg L1 (Bugaj)
    const e1Data = allCreatures.find(c => c.effectId === 'bugaj_def_to_atk') ?? allCreatures[5]
    if (e1Data) {
      const e1 = createCreatureInstance(e1Data, 'player2')
      e1.line = BattleLine.FRONT; e1.isRevealed = true
      e1.roundEnteredPlay = 1; e1.turnsInPlay = 1
      freshState.players.player2.field.lines[BattleLine.FRONT].push(e1)
    }

    // Wróg L2 (Leszy)
    const e2Data = allCreatures.find(c => c.effectId === 'leszy_post_attack_defend') ?? allCreatures[11]
    if (e2Data) {
      const e2 = createCreatureInstance(e2Data, 'player2')
      e2.line = BattleLine.RANGED; e2.isRevealed = true
      e2.roundEnteredPlay = 1; e2.turnsInPlay = 1
      freshState.players.player2.field.lines[BattleLine.RANGED].push(e2)
    }

    // Wróg L3 (Gryf)
    const e3Data = allCreatures.find(c => c.effectId === 'gryf_double_dmg_on_play_turn') ?? allCreatures[12]
    if (e3Data) {
      const e3 = createCreatureInstance(e3Data, 'player2')
      e3.line = BattleLine.SUPPORT; e3.isRevealed = true
      e3.roundEnteredPlay = 1; e3.turnsInPlay = 1
      freshState.players.player2.field.lines[BattleLine.SUPPORT].push(e3)
    }

    // AI ma 5 kart na ręce (żeby Aitwar i podobne efekty miały co kraść)
    const aiHandCandidates = allCreatures.filter(c =>
      ALPHA_CREATURE_EFFECT_IDS.has(c.effectId) &&
      !['bugaj_def_to_atk', 'leszy_post_attack_defend', 'gryf_double_dmg_on_play_turn'].includes(c.effectId)
    )
    for (const aiData of aiHandCandidates.slice(0, 5)) {
      const aiCard = createCreatureInstance(aiData, 'player2')
      aiCard.isRevealed = false
      freshState.players.player2.hand.push(aiCard)
    }

    game.setupArenaMode(freshState, entry.name)
    isReady.value = true
  }

  function reset() {
    if (focusedEntry.value) setupScenario(focusedEntry.value)
  }

  return {
    catalog,
    focusedEntry,
    isReady,
    setupScenario,
    reset,
  }
})
