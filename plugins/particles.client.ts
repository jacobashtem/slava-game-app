/**
 * tsParticles Nuxt plugin — client-only.
 * Initializes the slim engine (covers 90% of presets: move, opacity, color, size, rotate).
 */
import Particles from '@tsparticles/vue3'
import { loadSlim } from '@tsparticles/slim'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Particles, {
    init: async (engine: any) => {
      await loadSlim(engine)
    },
  })
})
