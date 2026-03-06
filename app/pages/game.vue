<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from '../../stores/gameStore'

definePageMeta({ ssr: false })

const game = useGameStore()

onMounted(() => {
  if (!game.gameStarted) {
    navigateTo('/')
  }
})
</script>

<template>
  <GameBoard />
</template>
