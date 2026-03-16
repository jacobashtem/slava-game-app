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
  game.startTutorial()

  const minDelay = new Promise(r => setTimeout(r, 3500))
  const modules = Promise.all([
    import('three/webgpu').catch(() => {}),
    import('three/tsl').catch(() => {}),
  ])
  await Promise.all([minDelay, modules])
  gameReady.value = true
})

watch(() => loadingDone.value, (done) => {
  if (done) tutorial.startTutorial()
})
</script>

<template>
  <GameBoard />
  <TutorialOverlay />
  <GameLoadingScreen :ready="gameReady" @complete="loadingDone = true" />
</template>
