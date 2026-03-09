/**
 * GSAP Nuxt plugin — client-only.
 * Registers GSAP globally so it's available across all components.
 */
import gsap from 'gsap'

export default defineNuxtPlugin(() => {
  // GSAP defaults for the project
  gsap.defaults({
    ease: 'power2.out',
    duration: 0.4,
  })

  // Provide gsap instance globally if needed
  return {
    provide: {
      gsap,
    },
  }
})
