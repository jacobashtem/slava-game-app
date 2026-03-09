/**
 * useAudio — Howler.js audio manager for SFX and BGM.
 *
 * Currently provides the SAME interface as useSFX (drop-in replacement)
 * but uses Howler for: auto-unlock on user interaction, master volume,
 * fade in/out, and audio sprite support.
 *
 * When audio sample files are provided (public/audio/sfx-sprite.mp3),
 * switch `USE_SPRITES = true` to use real samples instead of synthesis.
 *
 * Usage:
 *   const { sfxAttackMelee, setVolume } = useAudio()
 *   sfxAttackMelee()
 */
import { Howl, Howler } from 'howler'

// ===== CONFIG =====
const USE_SPRITES = false // Set to true when audio sprite file is ready
const SPRITE_SRC = '/audio/sfx-sprite.mp3'

// Audio sprite timing map — fill in when creating the sprite sheet
// Format: [startMs, durationMs]
const SPRITE_MAP: Record<string, [number, number]> = {
  cardPlay:       [0, 200],
  draw:           [200, 150],
  phase:          [350, 200],
  gold:           [550, 150],
  gameOver:       [700, 600],
  attack:         [1300, 300],
  hit:            [1600, 200],
  death:          [1800, 500],
  attackMelee:    [2300, 400],
  attackElemental:[2700, 500],
  attackMagic:    [3200, 600],
  attackRanged:   [3800, 350],
  hitMelee:       [4150, 300],
  hitElemental:   [4450, 350],
  hitMagic:       [4800, 300],
  hitRanged:      [5100, 250],
  counterattack:  [5350, 350],
  immune:         [5700, 300],
  activate:       [6000, 250],
  seasonChange:   [6250, 600],
  adventure:      [6850, 300],
  victory:        [7150, 1000],
  defeat:         [8150, 800],
}

let _spriteHowl: Howl | null = null
let _sfxEnabled = true

// ===== SPRITE PLAYER =====
function initSprites() {
  if (_spriteHowl) return
  _spriteHowl = new Howl({
    src: [SPRITE_SRC],
    sprite: SPRITE_MAP,
    volume: 0.5,
    preload: true,
  })
}

function playSprite(name: string) {
  if (!_sfxEnabled) return
  if (!_spriteHowl) initSprites()
  _spriteHowl?.play(name)
}

// ===== WEB AUDIO SYNTHESIS (fallback) =====
// Kept from useSFX.ts — used when USE_SPRITES = false
let _ctx: AudioContext | null = null
let _masterGain: GainNode | null = null

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
function getMaster(): GainNode { getCtx(); return _masterGain! }

function playTone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx(); const t = ctx.currentTime + delay
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.type = type; osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g); g.connect(getMaster()); osc.start(t); osc.stop(t + dur)
  } catch { /* no audio */ }
}

function playFreqSweep(sf: number, ef: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx(); const t = ctx.currentTime + delay
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.type = type; osc.frequency.setValueAtTime(sf, t); osc.frequency.exponentialRampToValueAtTime(ef, t + dur)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g); g.connect(getMaster()); osc.start(t); osc.stop(t + dur)
  } catch { /* no audio */ }
}

function playNoise(dur: number, vol = 0.08, delay = 0, hp = 0, lp = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx(); const t = ctx.currentTime + delay
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5)
    const src = ctx.createBufferSource(); src.buffer = buf
    let node: AudioNode = src
    if (hp > 0) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f }
    if (lp > 0) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f }
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); node.connect(g); g.connect(getMaster()); src.start(t)
  } catch { /* no audio */ }
}

function playMetallic(freq: number, dur: number, vol = 0.1, delay = 0) {
  if (!_sfxEnabled) return
  try {
    const ctx = getCtx(); const t = ctx.currentTime + delay
    const freqs = [freq, freq * 2.76, freq * 4.53, freq * 6.21]
    const vols = [vol, vol * 0.4, vol * 0.2, vol * 0.1]
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.type = 'sine'; osc.frequency.setValueAtTime(freqs[i]!, t)
      g.gain.setValueAtTime(vols[i]!, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * (1 - i * 0.15))
      osc.connect(g); g.connect(getMaster()); osc.start(t); osc.stop(t + dur)
    }
  } catch { /* no audio */ }
}

// ===== EXPORTED COMPOSABLE =====
export function useAudio() {
  // Each function: if sprites available, use Howler; otherwise, synthesize

  const sfxCardPlay       = () => USE_SPRITES ? playSprite('cardPlay')       : (playTone(520, 0.15, 'triangle', 0.12), setTimeout(() => playTone(660, 0.1, 'sine', 0.06), 60))
  const sfxDraw           = () => USE_SPRITES ? playSprite('draw')           : (playTone(800, 0.08, 'triangle', 0.06), playTone(1000, 0.06, 'triangle', 0.04, 0.04))
  const sfxPhase          = () => USE_SPRITES ? playSprite('phase')          : (playTone(880, 0.12, 'sine', 0.08), playTone(1100, 0.1, 'sine', 0.06, 0.08))
  const sfxGold           = () => USE_SPRITES ? playSprite('gold')           : (playTone(2400, 0.08, 'sine', 0.07), playTone(3200, 0.06, 'sine', 0.05, 0.05))
  const sfxGameOver       = () => USE_SPRITES ? playSprite('gameOver')       : (playTone(523, 0.3, 'triangle', 0.12), playTone(659, 0.3, 'triangle', 0.12, 0.2), playTone(784, 0.4, 'triangle', 0.15, 0.4))
  const sfxAttack         = () => USE_SPRITES ? playSprite('attack')         : (playNoise(0.12, 0.1), playTone(180, 0.2, 'sawtooth', 0.1, 0.05))
  const sfxHit            = () => USE_SPRITES ? playSprite('hit')            : (playTone(120, 0.15, 'square', 0.08), playNoise(0.08, 0.06))
  const sfxDeath          = () => USE_SPRITES ? playSprite('death')          : (playTone(440, 0.3, 'sine', 0.1), playTone(220, 0.4, 'sine', 0.08, 0.1), playTone(110, 0.5, 'sine', 0.05, 0.25))

  function sfxAttackMelee() {
    if (USE_SPRITES) return playSprite('attackMelee')
    playMetallic(800, 0.25, 0.14); playNoise(0.06, 0.12, 0, 2000)
    playMetallic(1200, 0.15, 0.08, 0.05); playTone(100, 0.2, 'sawtooth', 0.06, 0.02)
  }
  function sfxAttackElemental() {
    if (USE_SPRITES) return playSprite('attackElemental')
    playFreqSweep(200, 1600, 0.35, 'sawtooth', 0.1); playNoise(0.3, 0.1, 0, 800, 3000)
    for (let i = 0; i < 5; i++) playTone(600 + Math.random() * 400, 0.03, 'square', 0.04, 0.05 + Math.random() * 0.25)
    playTone(150, 0.4, 'sawtooth', 0.05)
  }
  function sfxAttackMagic() {
    if (USE_SPRITES) return playSprite('attackMagic')
    ;[660, 880, 1320, 1760].forEach((f, i) => playTone(f, 0.5 - i * 0.08, 'sine', 0.06 - i * 0.01, i * 0.04))
    playFreqSweep(2000, 400, 0.6, 'sine', 0.04, 0.1); playTone(165, 0.5, 'triangle', 0.05)
  }
  function sfxAttackRanged() {
    if (USE_SPRITES) return playSprite('attackRanged')
    playFreqSweep(3000, 800, 0.2, 'sine', 0.08); playNoise(0.15, 0.06, 0, 3000)
    playTone(100, 0.15, 'square', 0.08, 0.18); playNoise(0.05, 0.08, 0.18)
  }

  function sfxHitMelee()     { USE_SPRITES ? playSprite('hitMelee')     : (playMetallic(500, 0.2, 0.1), playTone(80, 0.2, 'square', 0.1), playNoise(0.1, 0.08)) }
  function sfxHitElemental() {
    if (USE_SPRITES) return playSprite('hitElemental')
    playNoise(0.25, 0.1, 0, 1000, 4000); playTone(200, 0.2, 'sawtooth', 0.06)
    for (let i = 0; i < 3; i++) playTone(800 + Math.random() * 600, 0.02, 'square', 0.04, i * 0.06)
  }
  function sfxHitMagic()     { USE_SPRITES ? playSprite('hitMagic')     : (playTone(880, 0.15, 'sine', 0.08), playTone(1320, 0.12, 'sine', 0.06, 0.03), playFreqSweep(1760, 220, 0.3, 'triangle', 0.05, 0.05), playNoise(0.08, 0.04, 0.02, 2000)) }
  function sfxHitRanged()    { USE_SPRITES ? playSprite('hitRanged')    : (playTone(90, 0.12, 'square', 0.1), playNoise(0.06, 0.1, 0, 0, 1500), playTone(300, 0.08, 'triangle', 0.04, 0.04)) }

  function sfxCounterattack(){ USE_SPRITES ? playSprite('counterattack'): (playMetallic(1000, 0.2, 0.1), playTone(300, 0.15, 'sawtooth', 0.06, 0.05), playMetallic(600, 0.15, 0.06, 0.08)) }
  function sfxImmune()       { USE_SPRITES ? playSprite('immune')       : (playTone(200, 0.15, 'triangle', 0.08), playMetallic(1500, 0.25, 0.06, 0.05), playNoise(0.05, 0.04, 0.03)) }
  function sfxActivate()     { USE_SPRITES ? playSprite('activate')     : (playTone(440, 0.1, 'sine', 0.08), playTone(880, 0.15, 'sine', 0.1, 0.05), playTone(1760, 0.1, 'triangle', 0.06, 0.1)) }
  function sfxSeasonChange() { USE_SPRITES ? playSprite('seasonChange') : (playTone(130, 0.6, 'sawtooth', 0.08), playTone(196, 0.5, 'triangle', 0.06, 0.15), playTone(260, 0.4, 'sine', 0.05, 0.3)) }
  function sfxAdventure()    { USE_SPRITES ? playSprite('adventure')    : (playNoise(0.15, 0.06, 0, 500, 2000), playTone(400, 0.12, 'triangle', 0.06, 0.05), playTone(600, 0.1, 'sine', 0.04, 0.1)) }

  function sfxVictory() {
    if (USE_SPRITES) return playSprite('victory')
    ;[262, 330, 392, 523].forEach((f, i) => playTone(f, 0.8 - i * 0.1, 'triangle', 0.12, i * 0.15))
    playTone(523, 0.6, 'sine', 0.08, 0.6); playTone(659, 0.5, 'sine', 0.06, 0.7)
  }
  function sfxDefeat() {
    if (USE_SPRITES) return playSprite('defeat')
    playTone(392, 0.4, 'sine', 0.1); playTone(330, 0.4, 'sine', 0.08, 0.2)
    playTone(262, 0.5, 'triangle', 0.06, 0.4); playTone(196, 0.6, 'sine', 0.05, 0.6)
  }

  function setSFXEnabled(enabled: boolean) { _sfxEnabled = enabled }
  function setVolume(vol: number) {
    const v = Math.max(0, Math.min(1, vol))
    if (_masterGain) _masterGain.gain.value = v
    Howler.volume(v)
  }

  return {
    sfxCardPlay, sfxDraw, sfxPhase, sfxGold, sfxGameOver,
    sfxAttack, sfxHit, sfxDeath,
    sfxAttackMelee, sfxAttackElemental, sfxAttackMagic, sfxAttackRanged,
    sfxHitMelee, sfxHitElemental, sfxHitMagic, sfxHitRanged,
    sfxCounterattack, sfxImmune, sfxActivate, sfxSeasonChange, sfxAdventure,
    sfxVictory, sfxDefeat,
    setSFXEnabled, setVolume,
  }
}
