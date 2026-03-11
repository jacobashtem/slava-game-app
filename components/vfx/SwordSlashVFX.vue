<script lang="ts">
/**
 * SwordSlashVFX — glowing energy slash arc using TresJS + custom GLSL shader.
 *
 * Code-first: no external textures. Uses TorusGeometry deformed into a jagged
 * arc with emission glow. GSAP timeline: flash-in → bright pulse → fade-out (~0.5s).
 *
 * Usage:
 *   <SwordSlashVFX :active="true" @complete="onDone" />
 *
 * Place inside a position:relative container (e.g. VFX demo panel).
 */
import { defineComponent, h, ref, watch, onUnmounted, type PropType } from 'vue'
import { TresCanvas, useLoop } from '@tresjs/core'
import {
  TorusGeometry,
  ShaderMaterial,
  Color,
  DoubleSide,
  AdditiveBlending,
  Mesh,
} from 'three'
import gsap from 'gsap'

// ---------------------------------------------------------------------------
// GLSL Shaders — code-first, no textures
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  varying vec2 vUv;
  varying float vNoise;

  // Simple pseudo-noise for jagged edge
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Add jagged displacement along the normal for a rough slash edge
    float n = noise(pos.x * 8.0 + uTime * 3.0) * 0.15
            + noise(pos.y * 12.0 - uTime * 5.0) * 0.1;
    pos += normal * n;
    vNoise = n;

    // Apply scale from GSAP
    pos *= uScale;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFlash;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vNoise;

  void main() {
    // Gradient along the arc: bright center, fading edges
    float edgeFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

    // Emission intensity — boosted by flash uniform during the bright pulse
    float emission = edgeFade * (1.0 + uFlash * 4.0);

    // Color: white-hot center → colored edges
    vec3 col = mix(uColor, vec3(1.0), uFlash * 0.6 + edgeFade * 0.3);

    // Add noise-based shimmer
    col += vNoise * 0.5;

    gl_FragColor = vec4(col * emission, edgeFade * uOpacity);
  }
`

// ---------------------------------------------------------------------------
// SlashScene — inner component (must live inside <TresCanvas>)
// ---------------------------------------------------------------------------
const SlashScene = defineComponent({
  name: 'SlashScene',
  props: {
    active: { type: Boolean, required: true },
    color: { type: String, default: '#fbbf24' },
  },
  emits: ['complete'],
  setup(props, { emit }) {
    // Geometry: partial torus (arc) — 120° sweep, thin cross-section
    const geometry = new TorusGeometry(1.2, 0.08, 8, 32, Math.PI * 0.65)

    // Shader material
    const uniforms = {
      uTime: { value: 0 },
      uScale: { value: 0.01 },
      uOpacity: { value: 0 },
      uFlash: { value: 0 },
      uColor: { value: new Color(props.color) },
    }

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    })

    const mesh = new Mesh(geometry, material)
    // Rotate to diagonal slash angle
    mesh.rotation.z = Math.PI * 0.2

    // Animation loop — update time uniform
    let elapsed = 0
    const { onBeforeRender } = useLoop()
    onBeforeRender(({ delta }) => {
      elapsed += delta
      uniforms.uTime.value = elapsed
    })

    // GSAP timeline triggered when active
    let tl: gsap.core.Timeline | null = null

    function playSlash() {
      if (tl) tl.kill()
      tl = gsap.timeline({
        onComplete: () => emit('complete'),
      })

      tl.set(uniforms.uScale, { value: 0.01 })
        .set(uniforms.uOpacity, { value: 0 })
        .set(uniforms.uFlash, { value: 0 })
        // Phase 1: Flash in (0.08s)
        .to(uniforms.uScale, { value: 1.0, duration: 0.08, ease: 'power3.out' })
        .to(uniforms.uOpacity, { value: 1.0, duration: 0.06, ease: 'power2.out' }, '<')
        .to(uniforms.uFlash, { value: 1.0, duration: 0.06, ease: 'power2.out' }, '<')
        // Phase 2: Bright hold (0.12s)
        .to(uniforms.uFlash, { value: 0.3, duration: 0.12, ease: 'power1.inOut' })
        // Phase 3: Fade out (0.3s)
        .to(uniforms.uOpacity, { value: 0, duration: 0.3, ease: 'power2.in' })
        .to(uniforms.uScale, { value: 1.3, duration: 0.3, ease: 'power1.out' }, '<')
    }

    watch(() => props.active, (val) => {
      if (val) playSlash()
    }, { immediate: true })

    onUnmounted(() => {
      if (tl) tl.kill()
      geometry.dispose()
      material.dispose()
    })

    return { mesh }
  },
  render() {
    return h('primitive', { object: this.mesh })
  },
})

// ---------------------------------------------------------------------------
// SwordSlashVFX — outer wrapper
// ---------------------------------------------------------------------------
export default defineComponent({
  name: 'SwordSlashVFX',
  components: { TresCanvas, SlashScene },
  props: {
    active: { type: Boolean as PropType<boolean>, default: false },
    color: { type: String, default: '#fbbf24' },
  },
  emits: ['complete'],
  setup(props, { emit }) {
    const isActive = ref(props.active)
    watch(() => props.active, (v) => { isActive.value = v })

    function onComplete() {
      isActive.value = false
      emit('complete')
    }

    return { isActive, onComplete, props }
  },
})
</script>

<template>
  <div v-if="isActive" class="sword-slash-wrapper">
    <ClientOnly>
      <TresCanvas
        :alpha="true"
        :antialias="true"
        :stencil="false"
        :depth="true"
        power-preference="low-power"
        :clear-color="0x000000"
        style="width: 100%; height: 100%;"
      >
        <TresPerspectiveCamera :position="[0, 0, 3]" :fov="50" />
        <SlashScene :active="isActive" :color="props.color" @complete="onComplete" />
      </TresCanvas>
    </ClientOnly>
  </div>
</template>

<style scoped>
.sword-slash-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
  overflow: hidden;
}
</style>
