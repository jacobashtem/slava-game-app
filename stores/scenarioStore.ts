/**
 * scenarioStore — koordynuje kampanie (scenario lifecycle).
 * Fazy: narrative → combat → rewards → complete.
 *
 * V2 — trigger/action system, narrative interruptions, save/load, themes.
 */

import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { ScenarioEngine } from '../game-engine/ScenarioEngine'
import { NOC_KUPALY } from '../game-engine/scenarios/noc-kupaly'
import type {
  NarrativeLine, EncounterReward, BattlefieldTheme,
  NamedCharacter, CampaignSaveState, ScenarioDefinition,
  TriggerEvent,
} from '../game-engine/scenarios/types'
import type { GameState, CardInstance, CreatureCardData } from '../game-engine/types'
import { BattleLine } from '../game-engine/constants'
import { getAllCreaturesOnField } from '../game-engine/GameStateUtils'
import type { TriggerEventData } from '../game-engine/scenarios/TriggerProcessor'
import { useGameStore } from './gameStore'

// ===== SCENARIO REGISTRY =====

const SCENARIO_DEFS: Record<string, ScenarioDefinition> = {
  noc_kupaly: NOC_KUPALY,
}

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

  // Reward choice state
  const pendingRewardChoice = ref<{
    type: 'buff_creature' | 'recover_graveyard'
    stat?: 'atk' | 'def'
    value?: number
    candidates: { instanceId: string; name: string }[]
  } | null>(null)

  // Narrative interruption queue (mid-combat dialogue)
  const narrativeInterruption = ref<NarrativeLine[] | null>(null)
  const _narrativeQueue = ref<NarrativeLine[][]>([])
  const _pauseCombatDuringNarrative = ref(false)

  // Narrative dismissal promise (for pausing AI turns)
  let _narrativeDismissResolve: (() => void) | null = null

  // Battlefield theme
  const currentTheme = computed<BattlefieldTheme | null>(() => {
    return engine.value?.getTheme() ?? null
  })

  // Named characters
  const characters = computed<NamedCharacter[]>(() => {
    return engine.value?.getCharacters() ?? []
  })

  const currentRewards = computed(() => {
    if (!engine.value) return []
    return engine.value.currentEncounter.rewards
  })

  const isSurvivalEncounter = computed(() => {
    if (!engine.value) return false
    const wc = engine.value.getEffectiveWinCondition()
    return wc.type === 'survive'
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
    narrativeInterruption.value = null
    _narrativeQueue.value = []

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
      const freshState = engine.value.setupCurrentEncounter()
      const game = useGameStore()
      game.setupArenaMode(freshState, `Scenariusz: ${encounterTitle.value}`)
      phase.value = 'combat'

      // Survival tracking
      const wc = engine.value.getEffectiveWinCondition()
      if (wc.type === 'survive' && wc.survivalRounds) {
        survivalTarget.value = wc.survivalRounds
        survivalRounds.value = 0
      }

      // Fire on_encounter_start triggers
      if (game.state) {
        processGameEvent('on_encounter_start')
      }
    } else if (phase.value === 'narrative' && encounterResult.value === 'player_win') {
      const transition = engine.value.getTransitionScene()
      if (transition && !_transitionShown.value) {
        _transitionShown.value = true
        narrative.value = transition
        return
      }

      const rewards = engine.value.currentEncounter.rewards
      if (rewards.length > 0 && rewards.some(r => r.type !== 'narrative_only')) {
        phase.value = 'rewards'
        checkRewardChoices()
      } else {
        advanceToNextEncounter()
      }
    } else if (phase.value === 'complete') {
      // End of campaign — handled by page
    }
  }

  const _transitionShown = ref(false)

  // ===== NARRATIVE INTERRUPTION (mid-combat) =====

  /** Dismiss a mid-combat narrative interruption. Resumes combat. */
  function dismissInterruption() {
    narrativeInterruption.value = null
    _pauseCombatDuringNarrative.value = false

    // Resolve AI pause promise
    if (_narrativeDismissResolve) {
      _narrativeDismissResolve()
      _narrativeDismissResolve = null
    }

    // Show next queued narrative
    if (_narrativeQueue.value.length > 0) {
      narrativeInterruption.value = _narrativeQueue.value.shift()!
    }
  }

  /**
   * Returns a promise that resolves when the current narrative interruption is dismissed.
   * Used by gameStore to pause AI turns during mid-combat dialogue.
   */
  function waitForNarrativeDismissal(): Promise<void> {
    if (!narrativeInterruption.value) return Promise.resolve()
    return new Promise(resolve => {
      _narrativeDismissResolve = resolve
    })
  }

  // ===== UNIFIED EVENT PROCESSING =====

  /**
   * Process a game event through the trigger system.
   * Called by gameStore after combat actions, round changes, kills, etc.
   */
  function processGameEvent(event: TriggerEvent, data?: TriggerEventData) {
    if (!engine.value || !isScenarioMode.value || phase.value !== 'combat') return
    const game = useGameStore()
    if (!game.state) return

    const result = engine.value.processGameEvent(event, game.state, data)

    // Apply immunity changes
    if (result.immunityChanges.size > 0) {
      // Immunity is handled via DEF restoration in ActionExecutor
    }

    // Handle narrative interruptions
    if (result.narratives.length > 0) {
      if (!narrativeInterruption.value) {
        narrativeInterruption.value = result.narratives[0]!
        _pauseCombatDuringNarrative.value = result.pauseCombat[0] ?? true
        // Queue remaining
        for (let i = 1; i < result.narratives.length; i++) {
          _narrativeQueue.value.push(result.narratives[i]!)
        }
      } else {
        // Already showing one — queue all
        _narrativeQueue.value.push(...result.narratives)
      }
    }

    // Handle encounter end from trigger rules
    if (result.encounterEnded) {
      if (result.encounterEnded === 'player_win') showOutro()
      else encounterResult.value = 'player_lose'
      return
    }

    // Force reactivity if state was mutated
    if (result.stateChanged) {
      game.forceStateUpdate()
    }

    // Update survival round counter
    if (event === 'on_round_start' && data?.roundNumber) {
      const wc = engine.value.getEffectiveWinCondition()
      if (wc.type === 'survive') {
        survivalRounds.value = data.roundNumber
      }
    }

    // Check win condition after processing
    checkWinCondition()
  }

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

    engine.value.applyRewards(game.state, graveyardChoice)
    advanceToNextEncounter()
  }

  function applyBuffRewardChoice(targetInstanceId: string) {
    if (!engine.value || !pendingRewardChoice.value) return
    const game = useGameStore()
    if (!game.state) return

    const { stat, value } = pendingRewardChoice.value
    engine.value.applyBuffChoice(game.state, targetInstanceId, stat ?? 'def', value ?? 2)
    pendingRewardChoice.value = null
    applyRewardsAndContinue()
  }

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

    // Auto-save after each encounter
    saveCampaign()

    const next = engine.value.nextEncounter()
    if (!next) {
      narrative.value = engine.value.getEpilogNarrative()
      phase.value = 'complete'
      encounterResult.value = null
      clearSave(engine.value.scenario.id)
      return
    }

    encounterIdx.value = next.encounterIndex
    encounterTitle.value = engine.value.currentEncounter.title
    narrative.value = next.narrative
    phase.value = 'narrative'
    encounterResult.value = null
    pendingRewardChoice.value = null
    narrativeInterruption.value = null
    _narrativeQueue.value = []
    survivalRounds.value = 0
  }

  // ===== CHECK WIN CONDITION =====

  function checkWinCondition() {
    if (!engine.value || !isScenarioMode.value || phase.value !== 'combat') return
    const game = useGameStore()
    if (!game.state) return

    const result = engine.value.checkEncounterWin(game.state, game.state.roundNumber)
    if (result === 'player_win') {
      showOutro()
    } else if (result === 'player_lose') {
      encounterResult.value = 'player_lose'
    }
  }

  // ===== SAVE / LOAD =====

  function saveCampaign(): void {
    if (!engine.value) return
    const save = engine.value.serializeState()
    try {
      localStorage.setItem(`slava_campaign_${save.scenarioId}`, JSON.stringify(save))
    } catch {
      // localStorage full or unavailable — silent fail
    }
  }

  function loadCampaign(scenarioId: string): boolean {
    const raw = localStorage.getItem(`slava_campaign_${scenarioId}`)
    if (!raw) return false

    try {
      const save: CampaignSaveState = JSON.parse(raw)
      const scenarioDef = SCENARIO_DEFS[scenarioId]
      if (!scenarioDef) return false

      engine.value = ScenarioEngine.fromSave(save, scenarioDef)
      isScenarioMode.value = true
      encounterCount.value = engine.value.encounterCount
      encounterIdx.value = save.encounterIndex
      encounterTitle.value = engine.value.currentEncounter.title
      phase.value = 'narrative'
      narrative.value = engine.value.currentEncounter.narrativeIntro
      encounterResult.value = null
      pendingRewardChoice.value = null
      narrativeInterruption.value = null
      _narrativeQueue.value = []
      survivalRounds.value = 0
      return true
    } catch {
      return false
    }
  }

  function hasSave(scenarioId: string): boolean {
    return localStorage.getItem(`slava_campaign_${scenarioId}`) !== null
  }

  function clearSave(scenarioId: string): void {
    localStorage.removeItem(`slava_campaign_${scenarioId}`)
  }

  // ===== HELPERS =====

  function checkRewardChoices() {
    if (!engine.value) return
    const game = useGameStore()
    if (!game.state) return
    const rewards = engine.value.currentEncounter.rewards

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
    narrativeInterruption.value = null
    _narrativeQueue.value = []
    _pauseCombatDuringNarrative.value = false
  }

  function restartEncounter() {
    if (!engine.value) return
    encounterResult.value = null
    narrativeInterruption.value = null
    _narrativeQueue.value = []
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
    narrativeInterruption,
    currentTheme,
    characters,
    // Actions
    startScenario,
    dismissNarrative,
    dismissInterruption,
    waitForNarrativeDismissal,
    processGameEvent,
    applyRewardsAndContinue,
    applyBuffRewardChoice,
    applyGraveyardRecoveryChoice,
    checkWinCondition,
    restartEncounter,
    reset,
    // Save/Load
    saveCampaign,
    loadCampaign,
    hasSave,
    clearSave,
  }
})
