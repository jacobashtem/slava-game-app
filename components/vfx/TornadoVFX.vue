<script lang="ts">
/**
 * TornadoVFX — 3D tornado effect using TresJS + custom GLSL shaders.
 * Ported from Three.js WebGPU TSL example to standard WebGL.
 *
 * Uses CylinderGeometry with:
 *   - Vertex shader: parabolic deformation + sine turbulence (tornado shape)
 *   - Fragment shader: procedural noise for fire/smoke appearance
 *   - Two layers: emissive (bright orange) + dark (silhouette depth)
 *
 * Usage:
 *   <TornadoVFX :active="true" :color="'#ff8b4d'" />
 */
import { defineComponent, h, ref, watch, onUnmounted, type PropType } from 'vue'
import { TresCanvas, useLoop } from '@tresjs/core'
import {
  CylinderGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Color,
  DoubleSide,
  AdditiveBlending,
  NormalBlending,
  Mesh,
  Group,
} from 'three'

// ---------------------------------------------------------------------------
// GLSL — shared noise function
// ---------------------------------------------------------------------------

const noiseGLSL = /* glsl */ `
  // Improved value noise with better hash + FBM for organic look
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic smoothstep
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  // FBM (Fractional Brownian Motion) — 3 octaves for richer texture
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 3; i++) {
      v += a * noise2D(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }
`

// ---------------------------------------------------------------------------
// Tornado cylinder shaders
// ---------------------------------------------------------------------------

const tornadoVert = /* glsl */ `
  uniform float uTime;
  uniform float uParabolStr;
  uniform float uParabolOff;
  uniform float uParabolAmp;
  varying vec2 vUv;

  void main() {
    vUv = uv;

    // Twisted parabolic cylinder
    float angle = atan(position.z, position.x);
    float elevation = position.y;

    // Parabolic radius
    float r = uParabolStr * pow(elevation - uParabolOff, 2.0) + uParabolAmp;

    // Turbulence
    r += sin(elevation * 20.0 - uTime * 4.0 + angle * 2.0) * 0.05;

    vec3 pos = vec3(
      cos(angle) * r,
      elevation,
      sin(angle) * r
    );

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const emissiveFrag = /* glsl */ `
  ${noiseGLSL}
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float t = uTime * 0.2;

    // Noise layer 1 — slow swirl with skew (FBM for richness)
    vec2 n1uv = vUv + vec2(t, -t);
    n1uv.x += n1uv.y * -1.0; // skew
    n1uv *= vec2(2.0, 0.25);
    float n1 = smoothstep(0.35, 0.7, fbm(n1uv * 4.0));

    // Noise layer 2 — finer detail, faster
    vec2 n2uv = vUv + vec2(t * 0.5, -t);
    n2uv.x += n2uv.y * -1.0;
    n2uv *= vec2(5.0, 1.0);
    float n2 = smoothstep(0.35, 0.7, fbm(n2uv * 3.0));

    // Vertical fade (bottom tight, top wider)
    float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.5, vUv.y);

    float effect = n1 * n2 * fade;
    float alpha = smoothstep(0.0, 0.08, effect);

    // Color: bright at edges, white-hot at core
    float luminance = dot(uColor, vec3(0.299, 0.587, 0.114));
    vec3 col = uColor * 1.3 / max(luminance, 0.01);
    // Add white-hot spots where effect is strongest
    col = mix(col, vec3(2.0, 1.8, 1.2), smoothstep(0.3, 0.7, effect));

    gl_FragColor = vec4(col, alpha);
  }
`

const darkFrag = /* glsl */ `
  ${noiseGLSL}
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float t = uTime * 0.2 + 123.4;

    vec2 n1uv = vUv + vec2(t, -t);
    n1uv.x += n1uv.y * -1.0;
    n1uv *= vec2(2.0, 0.25);
    float n1 = smoothstep(0.35, 0.7, fbm(n1uv * 4.0));

    vec2 n2uv = vUv + vec2(t * 0.5, -t);
    n2uv.x += n2uv.y * -1.0;
    n2uv *= vec2(5.0, 1.0);
    float n2 = smoothstep(0.35, 0.7, fbm(n2uv * 3.0));

    float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    float effect = n1 * n2 * fade;
    float alpha = smoothstep(0.0, 0.01, effect);

    gl_FragColor = vec4(vec3(0.0), alpha * 0.85);
  }
`

// ---------------------------------------------------------------------------
// Floor shader (radial swirl at base)
// ---------------------------------------------------------------------------

const floorVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const floorFrag = /* glsl */ `
  ${noiseGLSL}
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float t = uTime * 0.2;
    vec2 centered = vUv - 0.5;
    float dist = length(centered);
    float angle = atan(centered.y, centered.x);

    // Radial UV
    vec2 rUv = vec2((angle + 3.14159) / 6.28318, dist);
    rUv *= vec2(0.5, 0.5);
    rUv.x += t;
    rUv.y += t;
    rUv.x += rUv.y * -1.0;
    rUv *= vec2(4.0, 1.0);
    float n1 = smoothstep(0.35, 0.7, fbm(rUv * 3.0));

    vec2 rUv2 = vec2((angle + 3.14159) / 6.28318, dist);
    rUv2 *= vec2(2.0, 8.0);
    rUv2.x += t * 2.0;
    rUv2.y += t * 8.0;
    rUv2.x += rUv2.y * -0.25;
    rUv2 *= vec2(2.0, 0.25);
    float n2 = smoothstep(0.35, 0.7, fbm(rUv2 * 3.0));

    // Outer ring fade
    float outerFade = smoothstep(0.5, 0.1, dist) * smoothstep(0.0, 0.15, dist);

    float effect = n1 * n2 * outerFade;
    float alpha = smoothstep(0.0, 0.01, effect);
    vec3 col = uColor * step(0.2, effect) * 3.0;

    gl_FragColor = vec4(col, alpha * 0.7);
  }
`

// ---------------------------------------------------------------------------
// TornadoScene — inner component
// ---------------------------------------------------------------------------
const TornadoScene = defineComponent({
  name: 'TornadoScene',
  props: {
    active: { type: Boolean, required: true },
    color: { type: String, default: '#ff8b4d' },
  },
  setup(props) {
    const colorVec = new Color(props.color)

    // Cylinder geometry: open-ended
    const cylGeom = new CylinderGeometry(1, 1, 1, 20, 20, true)
    cylGeom.translate(0, 0.5, 0)

    // Emissive layer
    const emissiveMat = new ShaderMaterial({
      vertexShader: tornadoVert,
      fragmentShader: emissiveFrag,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: colorVec.clone() },
        uParabolStr: { value: 1.0 },
        uParabolOff: { value: 0.3 },
        uParabolAmp: { value: 0.15 },
      },
      transparent: true,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    // Dark layer (slightly larger)
    const darkMat = new ShaderMaterial({
      vertexShader: tornadoVert,
      fragmentShader: darkFrag,
      uniforms: {
        uTime: { value: 0 },
        uParabolStr: { value: 1.0 },
        uParabolOff: { value: 0.3 },
        uParabolAmp: { value: 0.2 },
      },
      transparent: true,
      side: DoubleSide,
      blending: NormalBlending,
      depthWrite: false,
    })

    // Floor swirl
    const floorGeom = new PlaneGeometry(2, 2)
    const floorMat = new ShaderMaterial({
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: colorVec.clone() },
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    const emissiveMesh = new Mesh(cylGeom, emissiveMat)
    const darkMesh = new Mesh(cylGeom.clone(), darkMat)
    const floorMesh = new Mesh(floorGeom, floorMat)
    floorMesh.rotation.x = -Math.PI * 0.5

    const group = new Group()
    group.add(darkMesh)
    group.add(emissiveMesh)
    group.add(floorMesh)

    // Animation loop
    let elapsed = 0
    const { onBeforeRender } = useLoop()
    onBeforeRender(({ delta }) => {
      elapsed += delta
      emissiveMat.uniforms.uTime!.value = elapsed
      darkMat.uniforms.uTime!.value = elapsed
      floorMat.uniforms.uTime!.value = elapsed
    })

    onUnmounted(() => {
      cylGeom.dispose()
      floorGeom.dispose()
      emissiveMat.dispose()
      darkMat.dispose()
      floorMat.dispose()
    })

    return { group }
  },
  render() {
    return h('primitive', { object: this.group })
  },
})

// ---------------------------------------------------------------------------
// TornadoVFX — outer wrapper
// ---------------------------------------------------------------------------
export default defineComponent({
  name: 'TornadoVFX',
  components: { TresCanvas, TornadoScene },
  props: {
    active: { type: Boolean as PropType<boolean>, default: true },
    color: { type: String, default: '#ff8b4d' },
  },
  setup(props) {
    return { props }
  },
})
</script>

<template>
  <div v-if="active" class="tornado-vfx-wrapper">
    <ClientOnly>
      <TresCanvas
        :alpha="true"
        :antialias="true"
        :stencil="false"
        power-preference="low-power"
        :clear-color="0x000000"
        style="width: 100%; height: 100%;"
      >
        <TresPerspectiveCamera :position="[1, 0.8, 2.5]" :look-at="[0, 0.4, 0]" :fov="35" />
        <TornadoScene :active="props.active" :color="props.color" />
      </TresCanvas>
    </ClientOnly>
  </div>
</template>

<style scoped>
.tornado-vfx-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
  overflow: hidden;
  border-radius: 8px;
}
</style>
