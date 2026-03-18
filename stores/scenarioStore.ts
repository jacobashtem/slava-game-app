/**
 * scenarioStore — koordynuje kampanie (scenario lifecycle).
 * Fazy: narrative → combat → rewards → next encounter.
 */

import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch } from 'vue'
import { ScenarioEngine } from '../game-engine/ScenarioEngine'
import { NOC_KUPALY } from '../game-engine/scenarios/noc-kupaly'
import type { NarrativeLine, EncounterReward, SpecialRule } from '../game-engine/scenarios/types'
import type { GameState, CardInstance, CreatureCardData } from '../game-engine/types'
import { BattleLine } from '../game-engine/constants'
import { getAllCreaturesOnField } from '../game-engine/GameStateUtils'
import { useGameStore } from './gameStore'

const SCENARIOS: Record<string, () => ScenarioEngine> = {
  noc_kupaly: () => new ScenarioEngine(NOC_KUPALY),
}

export const useScenarioStore = defineStore('scenario', () => {
  const engine = shallowRef<ScenarioEngine | null>(null)
  const isScenarioMode = ref(false)
  const phase = ref<'narrative' | 'combat' | 'rewards' | 'complete'>('narrative')
  const narrative = ref<NarrativeLine[]>([])
  const encounterIdx = ref(0)
  const encounterCount = ref(0)
  const encounterTitle = ref('')
  const survivalRounds = ref(0)
  const survivalTarget = ref(0)
  const encounterResult = ref<'player_win' | 'player_lose' | null>(null)

  // Reward state for player choice (e.g. buff target, graveyard recovery)
  const pendingRewardChoice = ref<{
    type: 'buff_creature' | 'recover_graveyard'
    stat?: 'atk' | 'def'
    value?: number
    candidates: { instanceId: string; name: string }[]
  } | null>(null)

  const currentRewards = computed(() => {
    if (!engine.value) return []
    return engine.value.currentEncounter.rewards
  })

  // Survival HUD
  const isSurvivalEncounter = computed(() => {
    return engine.value?.currentEncounter.winCondition === 'survive'
  })

  // ===== START SCENARIO =====
  function startScenario(scenarioId: string) {
    const factory = SCENARIOS[scenarioId]
    if (!factory) throw new Error(`Unknown scenario: ${scenarioId}`)

    engine.value = factory()
    isScenarioMode.value = true
    encounterCount.value = engine.value.encounterCount
    encounterResult.value = null
    pendingRewardChoice.value = null

    const result = engine.value.startScenario()
    narrative.value = result.narrative
    encounterIdx.value = result.encounterIndex
    encounterTitle.value = engine.value.currentEncounter.title
    phase.value = 'narrative'
    survivalRounds.value = 0
    survivalTarget.value = 0
  }

  // ===== DISMISS NARRATIVE → start combat =====
  function dismissNarrative() {
    if (!engine.value) return

    if (phase.value === 'narrative' && encounterResult.value === null) {
      // Start combat for current encounter
      const freshState = engine.value.setupCurrentEncounter()
      const game = useGameStore()
      game.setupArenaMode(freshState, `Scenariusz: ${encounterTitle.value}`)
      phase.value = 'combat'

      // Survival tracking
      const survivalRule = engine.value.getSpecialRules().find(r => r.type === 'survival')
      if (survivalRule) {
        survivalTarget.value = survivalRule.survivalRounds ?? 4
        survivalRounds.value = 0
      }
    } else if (phase.value === 'narrative' && encounterResult.value === 'player_win') {
      // Post-outro: check for transition scene
      const transition = engine.value.getTransitionScene()
      if (transition && !_transitionShown.value) {
        _transitionShown.value = true
        narrative.value = transition
        return
      }

      // Check rewards
      const rewards = engine.value.currentEncounter.rewards
      if (rewards.length > 0 && rewards.some(r => r.type !== 'narrative_only')) {
        phase.value = 'rewards'
        checkRewardChoices()
      } else {
        advanceToNextEncounter()
      }
    } else if (phase.value === 'complete') {
      // End of campaign — navigate away (handled by page)
    }
  }

  // Internal flag: whether transition scene after current encounter was shown
  const _transitionShown = ref(false)

  // ===== SHOW OUTRO AFTER WIN =====
  function showOutro() {
    if (!engine.value) return
    _transitionShown.value = false
    encounterResult.value = 'player_win'
    narrative.value = engine.value.getOutroNarrative()
    phase.value = 'narrative'
  }

  // ===== APPLY REWARDS AND CONTINUE =====
  function applyRewardsAndContinue(graveyardChoice?: string) {
    if (!engine.value) return
    const game = useGameStore()
    if (!game.state) return

    // Apply rewards to game state
    engine.value.applyRewards(game.state, graveyardChoice)

    advanceToNextEncounter()
  }

  /** Player chose a creature for buff reward. */
  function applyBuffRewardChoice(targetInstanceId: string) {
    if (!engine.value || !pendingRewardChoice.value) return
    const game = useGameStore()
    if (!game.state) return

    const { stat, value } = pendingRewardChoice.value
    engine.value.applyBuffChoice(game.state, targetInstanceId, stat ?? 'def', value ?? 2)
    pendingRewardChoice.value = null

    // Continue to next step
    applyRewardsAndContinue()
  }

  /** Player chose a graveyard card to recover. */
  function applyGraveyardRecoveryChoice(instanceId: string) {
    if (!engine.value) return
    pendingRewardChoice.value = null
    applyRewardsAndContinue(instanceId)
  }

  function advanceToNextEncounter() {
    if (!engine.value) return
    const game = useGameStore()
    if (game.state) {
      engine.value.snapshotPlayerState(game.state)
    }

    const next = engine.value.nextEncounter()
    if (!next) {
      // Campaign complete — show epilog
      narrative.value = engine.value.getEpilogNarrative()
      phase.value = 'complete'
      encounterResult.value = null
      return
    }

    encounterIdx.value = next.encounterIndex
    encounterTitle.value = engine.value.currentEncounter.title
    narrative.value = next.narrative
    phase.value = 'narrative'
    encounterResult.value = null
    pendingRewardChoice.value = null
    survivalRounds.value = 0
  }

  // ===== CHECK WIN CONDITION (called by watcher) =====
  function checkWinCondition() {
    if (!engine.value || !isScenarioMode.value || phase.value !== 'combat') return
    const game = useGameStore()
    if (!game.state) return

    const result = engine.value.checkEncounterWin(game.state, game.state.roundNumber)
    if (result === 'player_win') {
      showOutro()
    } else if (result === 'player_lose') {
      encounterResult.value = 'player_lose'
      // Let the player see the lose state, then offer restart
    }
  }

  // ===== SPECIAL RULES PROCESSING =====

  /** Process Leszy immunity (enc7): restore DEF after attack if guards alive. */
  function processLeszyImmunity(state: GameState): boolean {
    if (!engine.value) return false
    if (!engine.value.shouldLeszyBeImmune(state)) return false

    const enemyField = getAllCreaturesOnField(state, 'player2')
    const leszy = enemyField.find(c =>
      (c.cardData as CreatureCardData).effectId === 'leszy_post_attack_defend',
    )
    if (!leszy) return false

    // Restore Leszy DEF to max if damaged
    if (leszy.currentStats.defense < leszy.currentStats.maxDefense) {
      leszy.currentStats.defense = leszy.currentStats.maxDefense
      return true // immunity triggered
    }
    return false
  }

  /** Process spawn/respawn rules at turn start (enc6). */
  function processTurnStartRules(state: GameState): boolean {
    if (!engine.value) return false
    let changed = false

    // Spawn Pies-upior if below max
    if (engine.value.hasRule('spawn_per_turn') && engine.value.canSpawnPiesUpior(state)) {
      const pies = engine.value.createPiesUpior()
      pies.roundEnteredPlay = state.roundNumber
      state.players.player2.field.lines[BattleLine.FRONT].push(pies)
      changed = true
    }

    // Respawn Dziki Mysliwy from graveyard
    if (engine.value.hasRule('respawn')) {
      const respawnRule = engine.value.getSpecialRules().find(r => r.type === 'respawn')
      if (respawnRule?.targetEffectId) {
        const enemyField = getAllCreaturesOnField(state, 'player2')
        const targetOnField = enemyField.some(c =>
          (c.cardData as CreatureCardData).effectId === respawnRule.targetEffectId,
        )
        if (!targetOnField) {
          // Find in graveyard
          const gIdx = state.players.player2.graveyard.findIndex(c =>
            (c.cardData as CreatureCardData).effectId === respawnRule.targetEffectId,
          )
          if (gIdx !== -1) {
            const card = state.players.player2.graveyard.splice(gIdx, 1)[0]!
            // Restore to full stats
            card.currentStats.defense = card.currentStats.maxDefense
            card.currentStats.attack = card.currentStats.maxAttack
            card.line = BattleLine.FRONT
            card.position = 'attack' as any
            card.isRevealed = true
            card.hasAttackedThisTurn = false
            card.activeEffects = []
            card.roundEnteredPlay = state.roundNumber
            state.players.player2.field.lines[BattleLine.FRONT].push(card)
            changed = true
          }
        }
      }
    }

    // Update survival round counter
    if (engine.value.hasRule('survival')) {
      survivalRounds.value = state.roundNumber
    }

    return changed
  }

  // ===== HELPERS =====

  function checkRewardChoices() {
    if (!engine.value) return
    const game = useGameStore()
    if (!game.state) return
    const rewards = engine.value.currentEncounter.rewards

    // Check for buff choice
    const buffReward = rewards.find(r => r.type === 'buff_creature' && !r.target)
    if (buffReward) {
      const fieldCreatures = getAllCreaturesOnField(game.state, 'player1')
      const handCreatures = game.state.players.player1.hand.filter(c => c.cardData.cardType === 'creature')
      const candidates = [...fieldCreatures, ...handCreatures].map(c => ({
        instanceId: c.instanceId,
        name: c.metadata.heroName as string || c.cardData.name,
      }))
      pendingRewardChoice.value = {
        type: 'buff_creature',
        stat: buffReward.stat,
        value: buffReward.value,
        candidates,
      }
      return
    }

    // Check for graveyard recovery
    const recoveryReward = rewards.find(r => r.type === 'recover_graveyard')
    if (recoveryReward && game.state.players.player1.graveyard.length > 0) {
      const candidates = game.state.players.player1.graveyard.map(c => ({
        instanceId: c.instanceId,
        name: c.metadata.heroName as string || c.cardData.name,
      }))
      pendingRewardChoice.value = {
        type: 'recover_graveyard',
        candidates,
      }
      return
    }

    // No choice needed — auto-apply
    applyRewardsAndContinue()
  }

  function reset() {
    engine.value = null
    isScenarioMode.value = false
    phase.value = 'narrative'
    narrative.value = []
    encounterIdx.value = 0
    encounterCount.value = 0
    encounterTitle.value = ''
    survivalRounds.value = 0
    survivalTarget.value = 0
    encounterResult.value = null
    pendingRewardChoice.value = null
  }

  /** Restart current encounter after loss. */
  function restartEncounter() {
    if (!engine.value) return
    encounterResult.value = null
    narrative.value = engine.value.currentEncounter.narrativeIntro
    phase.value = 'narrative'
  }

  return {
    // State
    engine,
    isScenarioMode,
    phase,
    narrative,
    encounterIdx,
    encounterCount,
    encounterTitle,
    encounterResult,
    survivalRounds,
    survivalTarget,
    isSurvivalEncounter,
    currentRewards,
    pendingRewardChoice,
    // Actions
    startScenario,
    dismissNarrative,
    applyRewardsAndContinue,
    applyBuffRewardChoice,
    applyGraveyardRecoveryChoice,
    checkWinCondition,
    processLeszyImmunity,
    processTurnStartRules,
    restartEncounter,
    reset,
  }
})
