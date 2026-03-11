<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { useMultiplayer } from '../../composables/useMultiplayer'
import { useRoute } from 'vue-router'
import type { ClientMessage } from '../../server/utils/RoomManager'

definePageMeta({ ssr: false })

const game = useGameStore()
const route = useRoute()
const isMultiplayer = route.query.mode === 'multiplayer'

// In multiplayer mode, pipe WS state into gameStore and wire up action sender
if (isMultiplayer) {
  const mp = useMultiplayer()

  // State: WS → gameStore
  watch(() => mp.gameState.value, (newState) => {
    if (newState) {
      game.receiveMultiplayerState(newState)
    }
  }, { immediate: true })

  // Actions: gameStore → WS
  game.setMultiplayerSender((msg) => {
    // useMultiplayer exposes typed action methods, but we can also use the
    // generic sendMessage pattern via the composable's underlying WS
    const mp2 = useMultiplayer()
    const action = msg as ClientMessage
    // Route through the appropriate typed method
    switch (action.type) {
      case 'play_creature': mp2.playCreature(action.cardInstanceId, action.targetLine, action.slotIndex); break
      case 'play_adventure': mp2.playAdventure(action.cardInstanceId, action.targetInstanceId, action.useEnhanced); break
      case 'attack': mp2.attack(action.attackerInstanceId, action.defenderInstanceId); break
      case 'change_position': mp2.changePosition(action.cardInstanceId, action.newPosition); break
      case 'move_creature_line': mp2.moveCreatureLine(action.cardInstanceId, action.targetLine, action.slotIndex); break
      case 'activate_effect': mp2.activateEffect(action.cardInstanceId, action.targetInstanceId); break
      case 'draw_card': mp2.drawCard(); break
      case 'advance_phase': mp2.advancePhase(); break
      case 'end_turn': mp2.endTurn(); break
      case 'confirm_on_play': mp2.confirmOnPlay(); break
      case 'skip_on_play': mp2.skipOnPlay(); break
      case 'resolve_interaction': mp2.resolveInteraction(action.choice); break
      case 'surrender': mp2.surrender(); break
      case 'invoke_god': mp2.invokeGod(action.godId, action.bid); break
      case 'activate_favor': mp2.activateFavor(action.targetInstanceId); break
      case 'claim_holiday': mp2.claimHoliday(); break
      case 'plunder': mp2.plunder(); break
    }
  })

  onUnmounted(() => {
    game.setMultiplayerSender(null)
  })
}

onMounted(() => {
  if (!game.gameStarted && !isMultiplayer) {
    navigateTo('/')
  }
})
</script>

<template>
  <GameBoard />
</template>
