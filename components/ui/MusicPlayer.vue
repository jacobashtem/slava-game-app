<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

// Dynamic import of song files
const songModules = import.meta.glob('../../assets/songs/*.mp3', { eager: true, query: '?url', import: 'default' })
const tracks: { url: string; name: string }[] = []
for (const [path, url] of Object.entries(songModules)) {
  const match = path.match(/song(\d+)\.mp3$/)
  if (match) {
    tracks.push({ url: url as string, name: `Ścieżka ${match[1]}` })
  }
}
// Sort by number
tracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

const audio = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTrack = ref(0)
const volume = ref(0.3)
const expanded = ref(false)
const progress = ref(0)

function play() {
  if (!audio.value) return
  audio.value.play().catch(() => {})
  isPlaying.value = true
}

function pause() {
  audio.value?.pause()
  isPlaying.value = false
}

function toggle() {
  isPlaying.value ? pause() : play()
}

function next() {
  currentTrack.value = (currentTrack.value + 1) % tracks.length
  if (isPlaying.value) {
    setTimeout(() => play(), 50)
  }
}

function prev() {
  currentTrack.value = (currentTrack.value - 1 + tracks.length) % tracks.length
  if (isPlaying.value) {
    setTimeout(() => play(), 50)
  }
}

function onEnded() {
  next()
}

function updateProgress() {
  if (!audio.value) return
  const dur = audio.value.duration
  if (dur && dur > 0) {
    progress.value = audio.value.currentTime / dur
  }
}

watch(volume, (v) => {
  if (audio.value) audio.value.volume = v
})

watch(currentTrack, () => {
  progress.value = 0
})

onMounted(() => {
  if (audio.value) {
    audio.value.volume = volume.value
  }
})

const currentSrc = computed(() => tracks[currentTrack.value]?.url ?? '')
const currentName = computed(() => tracks[currentTrack.value]?.name ?? '')
</script>

<template>
  <div :class="['music-player', { expanded }]">
    <!-- Collapsed: just a small icon -->
    <button class="mp-toggle" @click="expanded = !expanded" :title="expanded ? 'Ukryj' : 'Muzyka'">
      🎵
    </button>

    <template v-if="expanded">
      <div class="mp-controls">
        <button class="mp-btn" @click="prev" title="Poprzednia">⏮</button>
        <button class="mp-btn mp-play" @click="toggle" :title="isPlaying ? 'Pauza' : 'Graj'">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="mp-btn" @click="next" title="Następna">⏭</button>
      </div>
      <div class="mp-track-name">{{ currentName }}</div>
      <div class="mp-progress-bar">
        <div class="mp-progress-fill" :style="{ width: `${progress * 100}%` }" />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        v-model.number="volume"
        class="mp-volume"
        title="Głośność"
      />
    </template>

    <audio
      ref="audio"
      :src="currentSrc"
      preload="auto"
      @ended="onEnded"
      @timeupdate="updateProgress"
    />
  </div>
</template>

<style scoped>
.music-player {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px 6px;
  backdrop-filter: blur(4px);
  transition: all 0.2s ease;
}

.music-player.expanded {
  gap: 8px;
  padding: 4px 10px;
}

.mp-toggle {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.mp-toggle:hover { opacity: 1; }

.mp-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.mp-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 3px;
  line-height: 1;
  transition: color 0.15s;
}
.mp-btn:hover { color: #e2e8f0; }

.mp-play {
  font-size: 13px;
  color: #a78bfa;
}
.mp-play:hover { color: #c4b5fd; }

.mp-track-name {
  font-size: 9px;
  color: #64748b;
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mp-progress-bar {
  width: 40px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.mp-progress-fill {
  height: 100%;
  background: #a78bfa;
  border-radius: 2px;
  transition: width 0.3s linear;
}

.mp-volume {
  width: 40px;
  height: 3px;
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.mp-volume::-webkit-slider-thumb {
  appearance: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a78bfa;
  cursor: pointer;
}

.mp-volume::-moz-range-thumb {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a78bfa;
  border: none;
  cursor: pointer;
}
</style>
