/**
 * useSFX — Rich synthesized sound effects for game actions.
 * Uses Web Audio API exclusively — no external audio files needed.
 * Attack-type-specific sounds: melee (sword), elemental (fire/water), magic (mystical), ranged (arrow).
 */

let _ctx: AudioContext | null = null
let _masterGain: GainNode | null = null
let _sfxEnabled = true

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext()
    _masterGain = _ctx.createGain()
    _masterGain.gain.value = 0.5
    _masterGain.connect(_ctx.destination)
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function getMaster(): GainNode {
  getCtx()
  return _masterGain!
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, delay = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx()
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(gain)
    gain.connect(getMaster())
    osc.start(t)
    osc.stop(t + duration)
  } catch {
    // Audio not available
  }
}

function playFreqSweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType = 'sine', volume = 0.12, delay = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx()
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(startFreq, t)
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(gain)
    gain.connect(getMaster())
    osc.start(t)
    osc.stop(t + duration)
  } catch {
    // Audio not available
  }
}

function playNoise(duration: number, volume = 0.08, delay = 0, highpass = 0, lowpass = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx()
    const t = ctx.currentTime + delay
    const bufferSize = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    let node: AudioNode = source

    if (highpass > 0) {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = highpass
      node.connect(hp)
      node = hp
    }
    if (lowpass > 0) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = lowpass
      node.connect(lp)
      node = lp
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, t)
    node.connect(gain)
    gain.connect(getMaster())
    source.start(t)
  } catch {
    // Audio not available
  }
}

// Metallic clang — sword/shield impact
function playMetallic(freq: number, duration: number, volume = 0.1, delay = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx()
    const t = ctx.currentTime + delay
    // Fundamental + inharmonic overtones for metallic timbre
    const freqs = [freq, freq * 2.76, freq * 4.53, freq * 6.21]
    const vols = [volume, volume * 0.4, volume * 0.2, volume * 0.1]
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freqs[i]!, t)
      gain.gain.setValueAtTime(vols[i]!, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration * (1 - i * 0.15))
      osc.connect(gain)
      gain.connect(getMaster())
      osc.start(t)
      osc.stop(t + duration)
    }
  } catch {
    // Audio not available
  }
}

export function useSFX() {
  // ===== UI SOUNDS (light, non-intrusive) =====

  function sfxCardPlay() {
    playTone(520, 0.15, 'triangle', 0.12)
    setTimeout(() => playTone(660, 0.1, 'sine', 0.06), 60)
  }

  function sfxDraw() {
    playTone(800, 0.08, 'triangle', 0.06)
    playTone(1000, 0.06, 'triangle', 0.04, 0.04)
  }

  function sfxPhase() {
    playTone(880, 0.12, 'sine', 0.08)
    playTone(1100, 0.1, 'sine', 0.06, 0.08)
  }

  function sfxGold() {
    playTone(2400, 0.08, 'sine', 0.07)
    playTone(3200, 0.06, 'sine', 0.05, 0.05)
  }

  function sfxGameOver() {
    playTone(523, 0.3, 'triangle', 0.12)
    playTone(659, 0.3, 'triangle', 0.12, 0.2)
    playTone(784, 0.4, 'triangle', 0.15, 0.4)
  }

  // ===== GENERIC ATTACK/HIT/DEATH (fallback) =====

  function sfxAttack() {
    playNoise(0.12, 0.1)
    playTone(180, 0.2, 'sawtooth', 0.1, 0.05)
  }

  function sfxHit() {
    playTone(120, 0.15, 'square', 0.08)
    playNoise(0.08, 0.06)
  }

  function sfxDeath() {
    playTone(440, 0.3, 'sine', 0.1)
    playTone(220, 0.4, 'sine', 0.08, 0.1)
    playTone(110, 0.5, 'sine', 0.05, 0.25)
  }

  // ===== ATTACK TYPE SPECIFIC =====

  /** Melee — sword clash: metallic clang + short noise burst */
  function sfxAttackMelee() {
    playMetallic(800, 0.25, 0.14)
    playNoise(0.06, 0.12, 0, 2000)   // short sharp burst
    playMetallic(1200, 0.15, 0.08, 0.05) // secondary ring
    playTone(100, 0.2, 'sawtooth', 0.06, 0.02)  // weight/impact
  }

  /** Elemental — fire whoosh: filtered noise sweep + crackling */
  function sfxAttackElemental() {
    playFreqSweep(200, 1600, 0.35, 'sawtooth', 0.1)
    playNoise(0.3, 0.1, 0, 800, 3000)  // whoosh
    // crackling pops
    for (let i = 0; i < 5; i++) {
      const d = 0.05 + Math.random() * 0.25
      playTone(600 + Math.random() * 400, 0.03, 'square', 0.04, d)
    }
    playTone(150, 0.4, 'sawtooth', 0.05) // rumble
  }

  /** Magic — mystical chime: multi-harmonic shimmer + ethereal sweep */
  function sfxAttackMagic() {
    // Shimmering harmonics
    const notes = [660, 880, 1320, 1760]
    notes.forEach((f, i) => {
      playTone(f, 0.5 - i * 0.08, 'sine', 0.06 - i * 0.01, i * 0.04)
    })
    // Ethereal descending sweep
    playFreqSweep(2000, 400, 0.6, 'sine', 0.04, 0.1)
    // Mysterious low hum
    playTone(165, 0.5, 'triangle', 0.05)
  }

  /** Ranged — arrow whistle: descending high pitch + thud impact */
  function sfxAttackRanged() {
    playFreqSweep(3000, 800, 0.2, 'sine', 0.08)
    playNoise(0.15, 0.06, 0, 3000) // air whistle
    // Impact thud
    playTone(100, 0.15, 'square', 0.08, 0.18)
    playNoise(0.05, 0.08, 0.18) // thunk
  }

  // ===== HIT TYPE SPECIFIC =====

  /** Melee hit — heavy impact, armor clang */
  function sfxHitMelee() {
    playMetallic(500, 0.2, 0.1)
    playTone(80, 0.2, 'square', 0.1)
    playNoise(0.1, 0.08)
  }

  /** Elemental hit — sizzle/burn */
  function sfxHitElemental() {
    playNoise(0.25, 0.1, 0, 1000, 4000) // sizzle
    playTone(200, 0.2, 'sawtooth', 0.06)
    // Crackle
    for (let i = 0; i < 3; i++) {
      playTone(800 + Math.random() * 600, 0.02, 'square', 0.04, i * 0.06)
    }
  }

  /** Magic hit — arcane burst */
  function sfxHitMagic() {
    playTone(880, 0.15, 'sine', 0.08)
    playTone(1320, 0.12, 'sine', 0.06, 0.03)
    playFreqSweep(1760, 220, 0.3, 'triangle', 0.05, 0.05)
    playNoise(0.08, 0.04, 0.02, 2000)
  }

  /** Ranged hit — arrow thunk into body */
  function sfxHitRanged() {
    playTone(90, 0.12, 'square', 0.1)
    playNoise(0.06, 0.1, 0, 0, 1500) // dull thud
    playTone(300, 0.08, 'triangle', 0.04, 0.04)
  }

  // ===== SPECIAL SOUNDS =====

  /** Kontratak — shield ring + counterforce */
  function sfxCounterattack() {
    playMetallic(1000, 0.2, 0.1)
    playTone(300, 0.15, 'sawtooth', 0.06, 0.05)
    playMetallic(600, 0.15, 0.06, 0.08)
  }

  /** Immune / Odporny — dull thud + deflection ring */
  function sfxImmune() {
    playTone(200, 0.15, 'triangle', 0.08)
    playMetallic(1500, 0.25, 0.06, 0.05)
    playNoise(0.05, 0.04, 0.03)
  }

  /** Ability activation — magical zap */
  function sfxActivate() {
    playTone(440, 0.1, 'sine', 0.08)
    playTone(880, 0.15, 'sine', 0.1, 0.05)
    playTone(1760, 0.1, 'triangle', 0.06, 0.1)
  }

  /** Season change — deep horn */
  function sfxSeasonChange() {
    playTone(130, 0.6, 'sawtooth', 0.08)
    playTone(196, 0.5, 'triangle', 0.06, 0.15)
    playTone(260, 0.4, 'sine', 0.05, 0.3)
  }

  /** Adventure card played — scroll unfurl */
  function sfxAdventure() {
    playNoise(0.15, 0.06, 0, 500, 2000) // paper rustle
    playTone(400, 0.12, 'triangle', 0.06, 0.05)
    playTone(600, 0.1, 'sine', 0.04, 0.1)
  }

  /** Victory fanfare — triumphant chord */
  function sfxVictory() {
    const notes = [262, 330, 392, 523]
    notes.forEach((f, i) => {
      playTone(f, 0.8 - i * 0.1, 'triangle', 0.12, i * 0.15)
    })
    playTone(523, 0.6, 'sine', 0.08, 0.6)
    playTone(659, 0.5, 'sine', 0.06, 0.7)
  }

  /** Defeat — somber descend */
  function sfxDefeat() {
    playTone(392, 0.4, 'sine', 0.1)
    playTone(330, 0.4, 'sine', 0.08, 0.2)
    playTone(262, 0.5, 'triangle', 0.06, 0.4)
    playTone(196, 0.6, 'sine', 0.05, 0.6)
  }

  /** Toggle SFX on/off */
  function setSFXEnabled(enabled: boolean) {
    _sfxEnabled = enabled
  }

  /** Set master volume (0-1) */
  function setVolume(vol: number) {
    if (_masterGain) _masterGain.gain.value = Math.max(0, Math.min(1, vol))
  }

  return {
    // UI
    sfxCardPlay,
    sfxDraw,
    sfxPhase,
    sfxGold,
    sfxGameOver,
    // Generic combat
    sfxAttack,
    sfxHit,
    sfxDeath,
    // Attack type specific
    sfxAttackMelee,
    sfxAttackElemental,
    sfxAttackMagic,
    sfxAttackRanged,
    // Hit type specific
    sfxHitMelee,
    sfxHitElemental,
    sfxHitMagic,
    sfxHitRanged,
    // Special
    sfxCounterattack,
    sfxImmune,
    sfxActivate,
    sfxSeasonChange,
    sfxAdventure,
    sfxVictory,
    sfxDefeat,
    // Controls
    setSFXEnabled,
    setVolume,
  }
}
