/**
 * useNarrator — AI narrator reacts to game events with Slavic-themed commentary.
 *
 * Watches actionLog for meaningful events (deaths, big damage, combos, seasons)
 * and feeds contextual lines into a reactive stream consumed by GameChat.
 *
 * NOT a log mirror — the narrator provides color commentary, not factual reporting.
 * Debounced: max 1 message per 4 seconds to avoid spam.
 */

import { ref, watch, readonly } from 'vue'
import { useGameStore } from '../stores/gameStore'
import type { LogEntry } from '../game-engine/types'

// ===== NARRATOR LINES BY CATEGORY =====

interface NarratorLines {
  death: string[]
  bigDamage: string[]    // damage > 5
  combo: string[]        // 2+ kills in one turn
  seasonChange: string[]
  cardPlayed: string[]
  counterattack: string[]
  effectTrigger: string[]
  generic: string[]
}

const LINES: Record<string, NarratorLines> = {
  easy: {
    death: [
      'Oj… ktoś upadł. Domowik schował się za garnkiem.',
      'Nie żyje! Domowik prawie spadł z pieca ze strachu.',
      'A to dopiero! Ktoś poszedł do Nawii…',
    ],
    bigDamage: [
      'Auć! To musiało boleć nawet Domowika.',
      'Ojejku, ale uderzenie!',
      'Domowik zerka zza pieca… co za cios!',
    ],
    combo: [
      'Dwa trupy?! Domowik się chowa!',
      'Masakra! Domowik nigdy czegoś takiego nie widział!',
    ],
    seasonChange: [
      'Hmm, wiatr się zmienia… czujesz?',
      'Nowa pora roku! Domowik lubi zmiany.',
    ],
    cardPlayed: [
      'O, nowa karta na polu!',
      'Ciekawy ruch, ciekawy…',
      'Domowik przygląda się z ciekawością.',
    ],
    counterattack: [
      'Kontra! Domowik aż podskoczył!',
      'Odgryzł się! Tak trzymać!',
    ],
    effectTrigger: [
      'O! Zadziałała zdolność! Magia!',
      'Domowik czuje magiczną moc…',
    ],
    generic: [
      'Domowik obserwuje w ciszy…',
      '*trzask ognia na kominku*',
    ],
  },
  medium: {
    death: [
      'Dusza odchodzi do Nawii. Tak musiało być.',
      'Śmierć na polu bitwy. Bogowie przyjmują ofiarę.',
      'Kolejny wojownik pada. Żerca odmawia modlitwę.',
    ],
    bigDamage: [
      'Potężne uderzenie! Perun byłby dumny.',
      'Cios godny bohaterów.',
      'Żerca widzi krew na ostrzu. Potężne.',
    ],
    combo: [
      'Podwójna ofiara! Bogowie są łaskawi.',
      'Dwa ciosy śmierci — rzeź na polu bitwy.',
    ],
    seasonChange: [
      'Koło roku obraca się dalej…',
      'Nowa pora. Nowe moce budzą się w ziemi.',
    ],
    cardPlayed: [
      'Nowy wojownik wkracza na pole.',
      'Żerca kiwa głową — dobry wybór.',
    ],
    counterattack: [
      'Kontratak! Ostrze za ostrze.',
      'Nie dał się bezbronnie uderzyć.',
    ],
    effectTrigger: [
      'Starożytna moc się budzi.',
      'Żerca czuje falę energii.',
    ],
    generic: [
      'Żerca obserwuje w milczeniu.',
      'Ogień trzaska. Bitwa trwa.',
    ],
  },
  hard: {
    death: [
      'Kolejna dusza dla mojego królestwa.',
      'Śmierć jest muzyka Welesa.',
      'Nawiowie witają nowego gościa. Nie wrócisz.',
    ],
    bigDamage: [
      'Ból. Cierpienie. Weles się delektuje.',
      'Tyle krwi… pyszne.',
      'Oho, ktoś tu naprawdę ucierpiał.',
    ],
    combo: [
      'Dwie dusze naraz! Jestem hojny dziś.',
      'Podwójna żniwa. Nawia się cieszy.',
    ],
    seasonChange: [
      'Pora roku się zmienia, ale ciemność zostaje.',
      'Zima, lato — w zaświatach zawsze mrok.',
    ],
    cardPlayed: [
      'Kolejne mięso na rzeź.',
      'Weles patrzy na twoich wojowników jak na owce.',
    ],
    counterattack: [
      'Ha! Ktoś ma jeszcze siłę walczyć.',
      'Kontra. Ciekawe, ile jeszcze wytrzymasz.',
    ],
    effectTrigger: [
      'Magiczna sztuczka? Weles zna ich tysiące.',
      'Moc… ale czy wystarczająca?',
    ],
    generic: [
      'Weles czeka cierpliwie. Jak zawsze.',
      '*echo śmiechu z głębin Nawii*',
    ],
  },
}

// ===== COMPOSABLE =====

/** Reactive stream of narrator messages */
const narratorMessages = ref<string[]>([])

/** Track last processed log index */
let lastLogIndex = 0
let lastNarratorTime = 0
let pendingQueue: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let deathsThisTurn = 0
let initialized = false

const DEBOUNCE_MS = 4000 // min time between narrator messages
const FLUSH_DELAY = 800  // delay before flushing queued message

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function categorizeEntry(entry: LogEntry): keyof NarratorLines | null {
  const msg = entry.message.toLowerCase()

  if (entry.type === 'death') return 'death'
  if (entry.type === 'damage' && msg.match(/\d+/) && parseInt(msg.match(/\d+/)?.[0] ?? '0') >= 5) return 'bigDamage'
  if (entry.type === 'system' && (msg.includes('pora roku') || msg.includes('runda') || msg.includes('sezon'))) return 'seasonChange'
  if (entry.type === 'attack' && msg.includes('kontr')) return 'counterattack'
  if (entry.type === 'effect') return 'effectTrigger'
  if (entry.type === 'play') return 'cardPlayed'

  return null
}

function queueNarration(text: string) {
  const now = Date.now()
  if (now - lastNarratorTime < DEBOUNCE_MS) {
    // Queue for later — only keep latest
    pendingQueue = [text]
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        if (pendingQueue.length > 0) {
          const msg = pendingQueue.shift()!
          lastNarratorTime = Date.now()
          narratorMessages.value = [...narratorMessages.value, msg]
        }
      }, DEBOUNCE_MS - (now - lastNarratorTime) + FLUSH_DELAY)
    }
    return
  }

  lastNarratorTime = now
  narratorMessages.value = [...narratorMessages.value, text]
}

function processNewEntries(entries: LogEntry[], difficulty: string) {
  const lines = LINES[difficulty] ?? LINES.medium!

  // Track deaths for combo detection
  let newDeaths = 0

  for (const entry of entries) {
    if (entry.type === 'death') newDeaths++

    const category = categorizeEntry(entry)
    if (!category) continue

    // Skip card played — too spammy, only narrate ~30% of the time
    if (category === 'cardPlayed' && Math.random() > 0.3) continue
    // Skip effect triggers — only ~25%
    if (category === 'effectTrigger' && Math.random() > 0.25) continue

    const pool = lines[category]
    if (pool.length > 0) {
      queueNarration(pick(pool))
    }
  }

  // Combo detection: 2+ deaths in recent entries
  deathsThisTurn += newDeaths
  if (deathsThisTurn >= 2 && lines.combo.length > 0) {
    queueNarration(pick(lines.combo))
    deathsThisTurn = 0
  }
}

export function useNarrator() {
  if (!initialized) {
    initialized = true

    const game = useGameStore()

    // Reset on new game
    watch(() => game.gameStarted, (started) => {
      if (started) {
        lastLogIndex = game.actionLog?.length ?? 0
        deathsThisTurn = 0
        pendingQueue = []
        narratorMessages.value = []
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      }
    })

    // Watch for new log entries
    watch(() => game.actionLog?.length ?? 0, (newLen) => {
      if (newLen <= lastLogIndex) { lastLogIndex = newLen; return }
      const log = game.actionLog ?? []
      const newEntries = log.slice(lastLogIndex)
      lastLogIndex = newLen
      processNewEntries(newEntries, game.selectedDifficulty)
    })

    // Reset death counter on turn change
    watch(() => game.state?.turnNumber, () => {
      deathsThisTurn = 0
    })
  }

  return {
    /** Reactive array of narrator commentary (newest last) */
    messages: readonly(narratorMessages),
  }
}
