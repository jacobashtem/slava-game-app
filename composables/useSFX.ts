/**
 * useSFX — Simple sound effects for game actions.
 * Uses Web Audio API to generate short synthesized sounds (no external files needed).
 */

let _ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext()
  }
  return _ctx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = volume
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {
    // Audio not available (SSR, permissions, etc.)
  }
}

function playNoise(duration: number, volume = 0.08) {
  try {
    const ctx = getCtx()
    const bufferSize = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start()
  } catch {
    // Audio not available
  }
}

export function useSFX() {
  function sfxCardPlay() {
    // Soft pluck sound
    playTone(520, 0.15, 'triangle', 0.12)
    setTimeout(() => playTone(660, 0.1, 'sine', 0.06), 60)
  }

  function sfxAttack() {
    // Swoosh + impact
    playNoise(0.12, 0.1)
    setTimeout(() => playTone(180, 0.2, 'sawtooth', 0.1), 50)
  }

  function sfxHit() {
    // Impact thud
    playTone(120, 0.15, 'square', 0.08)
    playNoise(0.08, 0.06)
  }

  function sfxDeath() {
    // Descending tone
    playTone(440, 0.3, 'sine', 0.1)
    setTimeout(() => playTone(220, 0.4, 'sine', 0.08), 100)
    setTimeout(() => playTone(110, 0.5, 'sine', 0.05), 250)
  }

  function sfxDraw() {
    // Card slide
    playTone(800, 0.08, 'triangle', 0.06)
    setTimeout(() => playTone(1000, 0.06, 'triangle', 0.04), 40)
  }

  function sfxPhase() {
    // Short chime
    playTone(880, 0.12, 'sine', 0.08)
    setTimeout(() => playTone(1100, 0.1, 'sine', 0.06), 80)
  }

  function sfxGold() {
    // Coin clink
    playTone(2400, 0.08, 'sine', 0.07)
    setTimeout(() => playTone(3200, 0.06, 'sine', 0.05), 50)
  }

  function sfxGameOver() {
    // Fanfare
    playTone(523, 0.3, 'triangle', 0.12)
    setTimeout(() => playTone(659, 0.3, 'triangle', 0.12), 200)
    setTimeout(() => playTone(784, 0.4, 'triangle', 0.15), 400)
  }

  return {
    sfxCardPlay,
    sfxAttack,
    sfxHit,
    sfxDeath,
    sfxDraw,
    sfxPhase,
    sfxGold,
    sfxGameOver,
  }
}
