<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { useTutorial } from '../../composables/useTutorial'

definePageMeta({ ssr: false })

const game = useGameStore()
const tutorial = useTutorial()

const gameReady = ref(false)
const loadingDone = ref(false)

onMounted(async () => {
  // Start tutorial game
  game.startTutorial()

  // Prefetch WebGPU (same as game.vue)
  const minDelay = new Promise(r => setTimeout(r, 3500))
  const modules = Promise.all([
    import('three/webgpu').catch(() => {}),
    import('three/tsl').catch(() => {}),
  ])
  await Promise.all([minDelay, modules])
  gameReady.value = true
})

// Start tutorial steps after loading screen completes
watch(() => loadingDone.value, (done) => {
  if (done) tutorial.startTutorial()
})
</script>

<template>
  <GameBoard />
  <GameLoadingScreen :ready="gameReady" @complete="loadingDone = true" />
</template>
