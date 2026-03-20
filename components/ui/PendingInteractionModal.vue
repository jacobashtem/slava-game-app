<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

// Creature portraits (same glob as CreatureCard.vue)
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.webp', { eager: true, import: 'default' })
const creatureImgs: Record<number, string> = {}
for (const [path, url] of Object.entries(_creatureImgModules)) {
  const match = path.match(/(\d+)\.webp$/)
  if (match?.[1]) creatureImgs[parseInt(match[1])] = url as string
}

// Attack type / domain / flying icons (same as CreatureCard.vue)
import attackTypeImg1 from '~/assets/cards/attackType1.svg'  // Elemental
import attackTypeImg2 from '~/assets/cards/attackType2.svg'  // Magic
import attackTypeImg3 from '~/assets/cards/attackType3.svg'  // Ranged
import domainImg1 from '~/assets/cards/domain-1.svg'
import domainImg2 from '~/assets/cards/domain-2.svg'
import domainImg3 from '~/assets/cards/domain-3.svg'
import domainImg4 from '~/assets/cards/domain-4.svg'

const attackTypeImgs: Record<number, string> = {}
const attackTypeIcons: Record<number, string> = { 0: 'game-icons:battle-axe', 1: 'bi:fire', 2: 'fa6-solid:wand-sparkles', 3: 'boxicons:bow-filled' }
const attackTypeNames: Record<number, string> = { 0: 'Wręcz', 1: 'Żywioł', 2: 'Magia', 3: 'Dystans' }
const domainImgs: Record<number, string> = { 1: domainImg1, 2: domainImg2, 3: domainImg3, 4: domainImg4 }

const game = useGameStore()

const interaction = computed(() => game.state?.pendingInteraction ?? null)
// Hipnoza Alkonosta i Rodzanice faza 2 są obsługiwane przez podświetlenie na polu, nie przez modal
const show = computed(() => !!interaction.value && interaction.value.type !== 'alkonost_target' && interaction.value.type !== 'rodzanice_choose_recipient')

// Dragon hatch data (from pending interaction metadata)
const dragonChoices = computed(() => {
  if (interaction.value?.type !== 'smocze_jajo_hatch') return []
  return (interaction.value.metadata?.dragons as any[]) ?? []
})
const targetSearch = ref('')
const kresnikSearch = ref('')
const czartSlider = ref(1)
// Reset szukajki gdy zmieni się interakcja
watch(interaction, (v) => {
  targetSearch.value = ''
  kresnikSearch.value = ''
  if (v?.type === 'czart_shift') {
    czartSlider.value = Math.floor(((v.metadata?.maxDef as number) ?? 2) / 2)
  }
})

const filteredKresnikChoices = computed(() => {
  const choices = interaction.value?.availableChoices ?? []
  if (!kresnikSearch.value) return choices
  const q = kresnikSearch.value.toLowerCase()
  return choices.filter(raw => {
    const parts = raw.split('|')
    return (parts[1]?.toLowerCase().includes(q)) || (parts[2]?.toLowerCase().includes(q))
  })
})

// Wyszukaj kartę po instanceId na polach, rękach i cmentarzach obu graczy
function findCard(instanceId: string) {
  const state = game.state
  if (!state) return null
  for (const side of ['player1', 'player2'] as const) {
    for (const line of Object.values(state.players[side].field.lines)) {
      const found = (line as any[]).find((c: any) => c.instanceId === instanceId)
      if (found) return found
    }
    const inHand = state.players[side].hand.find((c: any) => c.instanceId === instanceId)
    if (inHand) return inHand
    const inGrave = state.players[side].graveyard.find((c: any) => c.instanceId === instanceId)
    if (inGrave) return inGrave
  }
  return null
}

const sourceCard = computed(() => interaction.value ? findCard(interaction.value.sourceInstanceId) : null)
const attackerCard = computed(() => interaction.value?.attackerInstanceId ? findCard(interaction.value.attackerInstanceId) : null)

const availableTargets = computed(() => {
  const ids = interaction.value?.availableTargetIds ?? []
  return ids.map(id => findCard(id)).filter(Boolean)
})

const filteredTargets = computed(() => {
  const q = targetSearch.value.trim().toLowerCase()
  if (!q) return availableTargets.value
  return availableTargets.value.filter((c: any) =>
    c.cardData?.name?.toLowerCase().includes(q)
  )
})

const showTargetSearch = computed(() => availableTargets.value.length >= 5)

const domainColors: Record<number, string> = {
  1: '#60a5fa',
  2: '#4ade80',
  3: '#a78bfa',
  4: '#f87171',
}

function cardDomainColor(card: any) {
  return domainColors[(card?.cardData as any)?.domain as number] ?? '#94a3b8'
}

// Tytuł i opis w zależności od typu
// Auction bid state
const auctionBidAmount = ref(1)
const auctionMeta = computed(() => {
  const meta = interaction.value?.metadata
  if (!meta) return null
  return {
    godName: meta.godName as string ?? 'Bóg',
    godId: meta.godId as number ?? 0,
    godPower: ({
      1: 'Wskrzesza twoją istotę z cmentarza',
      2: '15 obrażeń rozdzielonych na wrogów',
      3: 'Perunowcy wroga muszą być w Obronie',
      4: 'Leczy wszystkich sojuszników do pełna',
      5: 'Dobierz 3 karty + darmowe wystawienie',
      6: '10 obrażeń istoty Welesa (ignoruje odporności)',
      7: 'Odtwarza kartę przygody z cmentarza',
      8: 'Zamienia premie dwóch sojuszników',
    } as Record<number, string>)[meta.godId as number] ?? '',
    currentBid: meta.currentBid as number ?? 1,
    currentBidder: meta.currentBidder as string ?? 'AI',
  }
})

watch(() => auctionMeta.value?.currentBid, (newBid) => {
  if (newBid != null) auctionBidAmount.value = newBid + 1
})

const playerGlory = computed(() => {
  const state = game.state
  if (!state) return 0
  return state.players.player1.glory ?? 0
})

const title = computed(() => {
  const t = interaction.value?.type
  if (t === 'auction_bid') return 'Licytacja — Łaska Boga'
  if (t === 'alkonost_target') return 'Hipnoza Alkonosta'
  if (t === 'chowaniec_intercept') return 'Chowaniec — Czujność'
  if (t === 'kresnik_buff') return 'Kresnik — Wybierz zdolność'
  if (t === 'baba_domain') return 'Baba — Wybierz domenę'
  if (t === 'cmentarna_baba_resurrect') return 'Cmentarna Baba — Wskrzeszenie'
  if (t === 'inkluz_recipient') return 'Inkluz — Komu dać premię?'
  if (t === 'wielkolud_counter') return 'Wielkolud — Kontratak'
  if (t === 'liczyrzepa_type') return 'Liczyrzepa — Typ ataku'
  if (t === 'smocze_jajo_hatch') return 'Smocze Jajo — Wyklucie!'
  if (t === 'on_play_target') return `${(sourceCard.value?.cardData as any)?.name ?? 'Karta'} — Wybierz cel`
  if (t === 'brzegina_shield') return 'Brzegina — Czujność'
  if (t === 'kosciej_resurrect') return 'Kościej — Wskrzeszenie'
  if (t === 'dziewiatko_poison') return 'Dziewiątko — Trucizna'
  if (t === 'czart_shift') return 'Czart — Przemiana'
  if (t === 'dziwolzona_swap') return 'Dziwożona — Wymiana'
  if (t === 'najemnik_bribe') return 'Najemnik — Przekupstwo'
  if (t === 'lamia_death_choice') return 'Lamia — Skarby Śmierci'
  if (t === 'smierc_save') return 'Śmierć — Ratunek'
  return 'Wybierz'
})

const description = computed(() => {
  const t = interaction.value?.type
  const atk = attackerCard.value
  const src = sourceCard.value
  if (t === 'auction_bid') {
    const a = auctionMeta.value
    if (!a) return ''
    return `AI przebija licytację o moc ${a.godName}. Aktualna stawka: ${a.currentBid} PS. Przebij lub zrezygnuj.`
  }
  if (t === 'alkonost_target') {
    return `Hipnoza! ${(atk?.cardData as any)?.name ?? 'Wroga istota'} jest zmuszona zaatakować jednego ze swoich sojuszników. Wybierz cel.`
  }
  if (t === 'chowaniec_intercept') return 'Przejąć atak wymierzony w sojusznika?'
  if (t === 'kresnik_buff') return 'Wybierz zdolność dowolnej istoty — Kresnik ją zyskuje na stałe.'
  if (t === 'baba_domain') return 'Wybierz domenę chronioną — Baba zyska +4 ATK vs wszystkich POZOSTAŁYCH.'
  if (t === 'cmentarna_baba_resurrect') return 'Wybierz Nieumarłego z cmentarza do wskrzeszenia w Linii 1.'
  if (t === 'inkluz_recipient') {
    const stolenRaw = interaction.value?.metadata?.stolenEffect as string | undefined
    let stolenName = 'premię'
    if (stolenRaw) {
      try { stolenName = `"${JSON.parse(stolenRaw).effectId}"` } catch {}
    }
    return `Inkluz ukradł ${stolenName}. Wybierz sojusznika który ją dostanie.`
  }
  if (t === 'wielkolud_counter') return 'Wielkolud kontratakuje! Wybierz wroga w zasięgu.'
  if (t === 'liczyrzepa_type') return 'Wybierz typ ataku Liczyrepy przed uderzeniem.'
  if (t === 'smocze_jajo_hatch') {
    return 'Jajo pęka! Wybierz smoka, który się z niego wykluję.'
  }
  if (t === 'on_play_target') {
    const effectId = (sourceCard.value?.cardData as any)?.effectId
    if (effectId === 'alkonost_redirect_counterattack') {
      return 'Wybierz wrogą istotę do zhipnotyzowania.'
    }
    return `Wybierz cel efektu ${(sourceCard.value?.cardData as any)?.name ?? 'karty'}.`
  }
  if (t === 'brzegina_shield') {
    const cost = (interaction.value?.metadata?.cost as number) ?? 1
    const targetName = (() => {
      const tId = interaction.value?.targetInstanceId
      if (!tId) return 'sojusznika'
      const tc = findCard(tId)
      return (tc?.cardData as any)?.name ?? 'sojusznika'
    })()
    return `Brzegina może ochronić ${targetName} przed obrażeniami. Koszt: ${cost === 0 ? 'GRATIS (pierwsze użycie)' : `${cost} PS`}.`
  }
  if (t === 'kosciej_resurrect') return 'Kościej zginął od Wręcz — jego serce wciąż bije! Wydaj 1 PS, by wskrzesić go na L1.'
  if (t === 'dziewiatko_poison') return 'Dziewiątko otruło wroga! Wybierz efekt trucizny.'
  if (t === 'czart_shift') {
    const maxDef = (interaction.value?.metadata?.maxDef as number) ?? 1
    return `Ile DEF przerzucić na ATK? (max ${maxDef}, przerzucenie całości = ostatni atak)`
  }
  if (t === 'dziwolzona_swap') return 'Dziwożona zabiła wroga! Wybierz kartę z ręki do oddania wrogowi.'
  if (t === 'najemnik_bribe') return 'Najemnik wroga czeka na łapówkę! Zapłać 1 PS, by przejąć go na swoją stronę.'
  if (t === 'lamia_death_choice') return 'Lamia ginie — z jej ciała wytryskują skarby! Wybierz nagrodę.'
  if (t === 'smierc_save') {
    const deadName = (interaction.value?.metadata?.deadCardName as string) ?? 'istota'
    return `${deadName} ginie! Śmierć może ją uratować za 1 PS — wraca do talii.`
  }
  return 'Wybierz opcję.'
})

function pickTarget(choice: string) {
  game.resolvePendingInteraction(choice)
}
</script>

<template>
  <Transition name="pi-fade">
    <div v-if="show" class="pi-overlay">
      <div class="pi-box" :class="{ 'pi-box-wide': interaction?.type === 'smocze_jajo_hatch' }">

        <!-- Header — Slavic ornamental -->
        <div class="pi-header">
          <div class="pi-ornament-line" />
          <div class="pi-title-row">
            <Icon icon="game-icons:magic-swirl" class="pi-header-icon" />
            <span class="pi-title">{{ title }}</span>
          </div>
          <div class="pi-ornament-line" />
        </div>

        <!-- Kontekst Alkonost: kto atakuje → kogo wybieramy -->
        <div v-if="interaction?.type === 'alkonost_target'" class="pi-context">
          <div class="pi-ctx-slot">
            <span class="pi-ctx-label">Zhipnotyzowany</span>
            <div class="pi-mini-card" :style="{ borderColor: cardDomainColor(attackerCard) }">
              <span class="pi-mini-name">{{ (attackerCard?.cardData as any)?.name ?? '?' }}</span>
              <span class="pi-mini-stats">
                {{ attackerCard?.currentStats.attack ?? '?' }}/{{ attackerCard?.currentStats.defense ?? '?' }}
              </span>
            </div>
          </div>
          <Icon icon="game-icons:arrow-dunk" class="pi-arrow" />
          <div class="pi-ctx-slot">
            <span class="pi-ctx-label">Wybierz cel poniżej</span>
            <div class="pi-mini-card pi-mini-unknown">
              <Icon icon="game-icons:perspective-dice-six" class="pi-unknown-icon" />
              <span class="pi-mini-name">?</span>
            </div>
          </div>
        </div>

        <!-- Opis -->
        <p class="pi-desc">{{ description }}</p>

        <!-- Wybór z listy kart (alkonost, wielkolud, inkluz, cmentarna baba) -->
        <div
          v-if="['alkonost_target', 'wielkolud_counter', 'inkluz_recipient', 'cmentarna_baba_resurrect', 'on_play_target'].includes(interaction?.type ?? '')"
          class="pi-targets-wrap"
        >
          <input
            v-if="showTargetSearch"
            v-model="targetSearch"
            class="pi-search"
            placeholder="Szukaj karty..."
            autofocus
          />
          <div class="pi-targets">
            <button
              v-for="card in filteredTargets"
              :key="(card as any).instanceId"
              class="pi-target-btn"
              :style="{ '--domain-color': cardDomainColor(card) }"
              @click="pickTarget((card as any).instanceId)"
            >
              <span class="pi-t-name">{{ ((card as any).cardData as any)?.name }}</span>
              <span class="pi-t-stats">
                ⚔ {{ (card as any).currentStats.attack }}
                &nbsp;
                🛡 {{ (card as any).currentStats.defense }}
              </span>
            </button>
          </div>
          <p v-if="availableTargets.length === 0" class="pi-empty">Brak dostępnych celów.</p>
          <p v-else-if="filteredTargets.length === 0" class="pi-empty">Brak wyników dla "{{ targetSearch }}"</p>
        </div>

        <!-- Kresnik: lista zdolności z szukajką -->
        <div v-if="interaction?.type === 'kresnik_buff' && interaction?.availableChoices" class="pi-kresnik">
          <input
            v-model="kresnikSearch"
            class="pi-search"
            type="text"
            placeholder="Szukaj zdolności..."
          />
          <div class="pi-kresnik-list">
            <button
              v-for="raw in filteredKresnikChoices"
              :key="raw"
              class="pi-kresnik-btn"
              @click="pickTarget(raw)"
            >
              <span class="pi-kresnik-name">{{ raw.split('|')[1] }}</span>
              <span class="pi-kresnik-desc">{{ raw.split('|')[2] }}</span>
            </button>
          </div>
        </div>

        <!-- Wybór stringowy (baba_domain, liczyrzepa_type) -->
        <div
          v-if="['baba_domain', 'liczyrzepa_type'].includes(interaction?.type ?? '') && interaction?.availableChoices"
          class="pi-choices"
        >
          <button
            v-for="choice in interaction.availableChoices"
            :key="choice"
            class="pi-choice-btn"
            @click="pickTarget(choice)"
          >
            {{ choice }}
          </button>
        </div>

        <!-- Tak / Nie (chowaniec, strela) -->
        <div
          v-if="['chowaniec_intercept', 'strela_intercept'].includes(interaction?.type ?? '')"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('yes')">Tak</button>
          <button class="pi-yn-no" @click="pickTarget('no')">Nie</button>
        </div>

        <!-- Dziewiątko: Trucizna / Paraliż -->
        <div
          v-if="interaction?.type === 'dziewiatko_poison'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('trucizna')" style="background: rgba(132, 204, 22, 0.15); border-color: rgba(132, 204, 22, 0.5); color: #a3e635;">
            <Icon icon="mdi:bottle-tonic" /> Trucizna (-3 DEF/turę)
          </button>
          <button class="pi-yn-no" @click="pickTarget('paraliz')" style="background: rgba(148, 163, 184, 0.15); border-color: rgba(148, 163, 184, 0.5); color: #94a3b8;">
            <Icon icon="game-icons:frozen-body" /> Paraliż (3 tury)
          </button>
        </div>

        <!-- Brzegina: Tak / Nie z kosztami -->
        <div
          v-if="interaction?.type === 'brzegina_shield'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:shield" /> {{ (interaction?.metadata?.cost as number) === 0 ? 'Tak, osłoń' : `Tak, osłoń (-${interaction?.metadata?.cost} PS)` }}
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Nie, przepuść atak
          </button>
        </div>

        <!-- Czart: Suwak DEF→ATK -->
        <div v-if="interaction?.type === 'czart_shift'" class="pi-czart">
          <div class="pi-czart-preview">
            <span class="pi-czart-stat">ATK: {{ (interaction.metadata?.currentAtk as number ?? 0) + czartSlider }}</span>
            <span class="pi-czart-stat">DEF: {{ (interaction.metadata?.maxDef as number ?? 0) - czartSlider }}</span>
            <span v-if="czartSlider >= (interaction.metadata?.maxDef as number ?? 0)" class="pi-czart-warn">OSTATNI ATAK!</span>
          </div>
          <input
            v-model.number="czartSlider"
            type="range"
            :min="1"
            :max="interaction.metadata?.maxDef as number ?? 1"
            class="pi-czart-slider"
          />
          <div class="pi-czart-labels">
            <span>1</span>
            <span>{{ interaction.metadata?.maxDef }}</span>
          </div>
          <button class="pi-yn-yes" @click="pickTarget(String(czartSlider))">
            <Icon icon="game-icons:fire-dash" /> Przerzuć {{ czartSlider }} DEF
          </button>
        </div>

        <!-- Dziwożona: Wybierz kartę z ręki -->
        <div v-if="interaction?.type === 'dziwolzona_swap' && interaction?.availableTargetIds" class="pi-targets">
          <div class="pi-target-grid">
            <button
              v-for="card in availableTargets"
              :key="card?.instanceId"
              class="pi-target-card"
              @click="pickTarget(card?.instanceId ?? '')"
            >
              <span class="pi-target-name">{{ (card?.cardData as any)?.name }}</span>
              <span class="pi-target-stats">{{ card?.currentStats.attack }}/{{ card?.currentStats.defense }}</span>
            </button>
          </div>
        </div>

        <!-- Najemnik: Przekup za PS -->
        <div v-if="interaction?.type === 'najemnik_bribe'" class="pi-yn">
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:two-coins" /> Przekup za 1 PS
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Nie kupuję
          </button>
        </div>

        <!-- Śmierć: Uratować za PS? -->
        <div
          v-if="interaction?.type === 'smierc_save'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:angel-wings" /> Uratuj za 1 PS
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:skull-crossed-bones" /> Niech odejdzie
          </button>
        </div>

        <!-- Lamia: Wybór nagrody po śmierci -->
        <div
          v-if="interaction?.type === 'lamia_death_choice'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('glory')">
            <Icon icon="game-icons:two-coins" /> +1 Punkt Sławy
          </button>
          <button class="pi-yn-no" @click="pickTarget('cards')">
            <Icon icon="game-icons:card-draw" /> Dobierz 5 kart
          </button>
        </div>

        <!-- Kościej: Wskrzeszenie za PS -->
        <div
          v-if="interaction?.type === 'kosciej_resurrect'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:skull-crossed-bones" /> Wskrześ za 1 PS
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Niech odejdzie
          </button>
        </div>

        <!-- SMOCZE JAJO: Wybór smoka do wyklucia -->
        <div v-if="interaction?.type === 'smocze_jajo_hatch'" class="pi-dragons">
          <div class="pi-dragon-grid">
            <button
              v-for="dragon in dragonChoices"
              :key="dragon.choiceId"
              class="pi-dragon-tile"
              @click="pickTarget(dragon.choiceId)"
            >
              <!-- Creature portrait background -->
              <div class="pi-dragon-art">
                <img
                  :src="creatureImgs[dragon.cardId] ?? creatureImgs[117]"
                  class="pi-dragon-portrait"
                  aria-hidden="true"
                />
                <div class="pi-dragon-vignette" />
                <!-- Top bar: icons left, name center, icons right -->
                <div class="pi-dragon-top">
                  <span class="pi-dragon-badges-left">
                    <img v-if="domainImgs[dragon.domain]" :src="domainImgs[dragon.domain]" class="pi-dragon-domain-icon" />
                  </span>
                  <span class="pi-dragon-name">{{ dragon.name }}</span>
                  <span class="pi-dragon-badges-right">
                    <Icon v-if="dragon.isFlying" icon="game-icons:liberty-wing" class="pi-dragon-fly-icon" style="color: #ffffff; font-size: 16px;" title="Lot" />
                  </span>
                </div>
              </div>
              <!-- Stats bar (CardTooltip style) -->
              <div class="pi-dragon-stats-bar">
                <div class="pi-dragon-stat pi-dragon-stat-atk">
                  <img v-if="attackTypeImgs[dragon.attackType]" :src="attackTypeImgs[dragon.attackType]" class="pi-dragon-stat-img" />
                  <Icon v-else :icon="attackTypeIcons[dragon.attackType] ?? 'game-icons:battle-axe'" class="pi-dragon-stat-svg" />
                  <span class="pi-dragon-stat-num">{{ dragon.atk }}</span>
                </div>
                <div class="pi-dragon-stat pi-dragon-stat-def">
                  <Icon icon="game-icons:shield" class="pi-dragon-stat-svg pi-dragon-shield-icon" />
                  <span class="pi-dragon-stat-num">{{ dragon.def }}</span>
                </div>
              </div>
              <!-- Ability description with trigger label -->
              <div class="pi-dragon-ability">
                <span v-if="dragon.triggerLabel" class="pi-dragon-trigger">{{ dragon.triggerLabel }}</span>
                <span class="pi-dragon-desc">{{ dragon.desc }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- AUKCJA: Licytacja boga (tryb Sława!) -->
        <div v-if="interaction?.type === 'auction_bid' && auctionMeta" class="pi-auction">
          <div class="pi-auction-god">
            <img
              v-if="auctionMeta.godId"
              :src="`/images/gods/${['','weles','swarozyc','marzanna','jarylo','mokosz','perun','swarog','rod'][auctionMeta.godId] ?? 'weles'}.svg`"
              class="pi-auction-portrait"
              :alt="auctionMeta.godName"
            />
            <div class="pi-auction-info">
              <div class="pi-auction-god-name">{{ auctionMeta.godName }}</div>
              <div class="pi-auction-power-desc">{{ auctionMeta.godPower }}</div>
            </div>
          </div>

          <div class="pi-auction-bid-info">
            <div class="pi-auction-current">
              <span class="pi-auction-label">Stawka AI:</span>
              <span class="pi-auction-amount">{{ auctionMeta.currentBid }} PS</span>
            </div>
            <div class="pi-auction-yours">
              <span class="pi-auction-label">Twoje PS:</span>
              <span class="pi-auction-glory">{{ playerGlory }}</span>
            </div>
          </div>

          <div class="pi-auction-controls">
            <div class="pi-auction-bid-row">
              <span class="pi-auction-label">Twoja stawka:</span>
              <button class="pi-auction-adj" @click="auctionBidAmount = Math.max(auctionMeta.currentBid + 1, auctionBidAmount - 1)">
                <Icon icon="game-icons:plain-arrow" style="transform: rotate(180deg); font-size: 10px;" />
              </button>
              <span class="pi-auction-bid-val">{{ auctionBidAmount }}</span>
              <span class="pi-auction-bid-unit">PS</span>
              <button class="pi-auction-adj" @click="auctionBidAmount = Math.min(playerGlory, auctionBidAmount + 1)">
                <Icon icon="game-icons:plain-arrow" style="font-size: 10px;" />
              </button>
            </div>
          </div>

          <div class="pi-yn">
            <button
              class="pi-yn-yes"
              :disabled="auctionBidAmount > playerGlory || auctionBidAmount <= auctionMeta.currentBid"
              @click="pickTarget(String(auctionBidAmount))"
            >
              <Icon icon="game-icons:laurel-crown" /> Przebij ({{ auctionBidAmount }} PS)
            </button>
            <button class="pi-yn-no" @click="pickTarget('pass')">
              <Icon icon="game-icons:cancel" /> Zrezygnuj
            </button>
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   SLAVIC MODAL — ciemne drewno, złoto, ornamentyka runowa
   ═══════════════════════════════════════════════════════════════ */

.pi-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(10, 6, 2, 0.82) 0%, rgba(0, 0, 0, 0.92) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.pi-box {
  position: relative;
  background:
    linear-gradient(168deg, rgba(14, 12, 18, 0.97) 0%, rgba(8, 6, 12, 0.98) 100%);
  border: 1.5px solid rgba(200, 168, 78, 0.35);
  border-radius: 4px;
  padding: 24px 28px;
  min-width: 340px;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow:
    0 0 50px rgba(200, 168, 78, 0.08),
    0 0 100px rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(200, 168, 78, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.5);
}

/* Corner ornaments */
.pi-box::before,
.pi-box::after {
  content: '◆';
  position: absolute;
  color: rgba(200, 168, 78, 0.4);
  font-size: 8px;
  line-height: 1;
}
.pi-box::before { top: 6px; left: 8px; }
.pi-box::after { top: 6px; right: 8px; }

.pi-box-wide {
  max-width: 900px;
  width: 90vw;
}

/* ===== HEADER — ornamental ===== */
.pi-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.pi-ornament-line {
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(200, 168, 78, 0.5) 30%, rgba(200, 168, 78, 0.5) 70%, transparent 100%);
}

.pi-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pi-header-icon {
  font-size: 24px;
  color: #c8a84e;
  filter: drop-shadow(0 0 4px rgba(200, 168, 78, 0.3));
}

.pi-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 24px;
  font-weight: 500;
  color: #e8d5a3;
  letter-spacing: 0.06em;
  text-shadow: 0 0 12px rgba(200, 168, 78, 0.2);
}

/* ===== CONTEXT ROW (Alkonost) ===== */
.pi-context {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.pi-ctx-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.pi-ctx-label {
  font-size: 9px;
  color: rgba(200, 168, 78, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.pi-mini-card {
  border: 1.5px solid rgba(200, 168, 78, 0.2);
  border-radius: 4px;
  padding: 8px 14px;
  background: rgba(12, 10, 18, 0.8);
  min-width: 88px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.pi-mini-unknown {
  border-color: rgba(200, 168, 78, 0.15);
  opacity: 0.5;
}

.pi-unknown-icon {
  font-size: 18px;
  color: rgba(200, 168, 78, 0.4);
}

.pi-mini-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 12px;
  font-weight: 500;
  color: #d4c4a0;
}

.pi-mini-stats {
  font-size: 11px;
  color: rgba(200, 168, 78, 0.5);
}

.pi-arrow {
  font-size: 24px;
  color: #c8a84e;
  opacity: 0.6;
}

/* ===== DESCRIPTION ===== */
.pi-desc {
  font-size: 16px;
  color: #a09480;
  margin: 0;
  text-align: center;
  line-height: 1.7;
  font-style: italic;
}

/* ===== TARGET CARD SELECTION ===== */
.pi-targets-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.pi-search {
  width: 100%;
  padding: 8px 12px;
  border-radius: 3px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  background: rgba(10, 8, 16, 0.8);
  color: #d4c4a0;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}
.pi-search::placeholder { color: rgba(200, 168, 78, 0.3); }
.pi-search:focus { border-color: rgba(200, 168, 78, 0.5); }

.pi-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-height: 240px;
  overflow-y: auto;
  width: 100%;
}

.pi-target-btn {
  background: rgba(12, 10, 18, 0.9);
  border: 1.5px solid color-mix(in srgb, var(--domain-color, #c8a84e) 40%, rgba(200, 168, 78, 0.2));
  border-radius: 4px;
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 90px;
  transition: background 0.15s, transform 0.1s, box-shadow 0.2s, border-color 0.2s;
}

.pi-target-btn:hover {
  background: rgba(200, 168, 78, 0.08);
  border-color: rgba(200, 168, 78, 0.6);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(200, 168, 78, 0.1), 0 8px 16px rgba(0,0,0,0.4);
}

.pi-t-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 15px;
  font-weight: 500;
  color: #d4c4a0;
}

.pi-t-stats {
  font-size: 13px;
  color: rgba(200, 168, 78, 0.5);
}

.pi-empty {
  color: rgba(200, 168, 78, 0.3);
  font-size: 13px;
  font-style: italic;
}

/* ===== STRING CHOICES ===== */
.pi-czart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.pi-czart-preview {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 16px;
  font-weight: 700;
}
.pi-czart-stat { color: #c8a84e; }
.pi-czart-warn { color: #ef4444; font-size: 12px; animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }
.pi-czart-slider {
  width: 100%;
  accent-color: #c8a84e;
  cursor: pointer;
}
.pi-czart-labels {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 10px;
  color: rgba(148, 130, 100, 0.5);
}

.pi-kresnik {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-height: 320px;
}
.pi-kresnik .pi-search {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.2);
  background: rgba(0, 0, 0, 0.3);
  color: #e8dcc8;
  font-size: 12px;
  outline: none;
}
.pi-kresnik .pi-search:focus { border-color: rgba(200, 168, 78, 0.5); }
.pi-kresnik-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  max-height: 260px;
  scrollbar-width: thin;
}
.pi-kresnik-btn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.08);
  background: rgba(200, 168, 78, 0.03);
  color: #e8dcc8;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.pi-kresnik-btn:hover {
  background: rgba(200, 168, 78, 0.1);
  border-color: rgba(200, 168, 78, 0.3);
}
.pi-kresnik-name {
  font-weight: 600;
  font-size: 12px;
  color: #c8a84e;
}
.pi-kresnik-desc {
  font-size: 10px;
  color: rgba(148, 130, 100, 0.6);
  line-height: 1.3;
}

.pi-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.pi-choice-btn {
  background: rgba(200, 168, 78, 0.06);
  border: 1.5px solid rgba(200, 168, 78, 0.3);
  border-radius: 4px;
  padding: 14px 30px;
  color: #e8d5a3;
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, border-color 0.2s;
}

.pi-choice-btn:hover {
  background: rgba(200, 168, 78, 0.14);
  border-color: rgba(200, 168, 78, 0.6);
  transform: translateY(-2px);
}

/* ===== YES / NO BUTTONS ===== */
.pi-yn {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.pi-yn-yes,
.pi-yn-no {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 36px;
  border: 1.5px solid transparent;
  border-radius: 4px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s, box-shadow 0.2s;
  letter-spacing: 0.03em;
}

.pi-yn-yes {
  background: rgba(34, 120, 60, 0.35);
  border-color: rgba(74, 222, 128, 0.4);
  color: #86efac;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.08);
}

.pi-yn-no {
  background: rgba(120, 30, 30, 0.35);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fca5a5;
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.08);
}

.pi-yn-yes:hover {
  background: rgba(34, 120, 60, 0.5);
  border-color: rgba(74, 222, 128, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.15);
}

.pi-yn-no:hover {
  background: rgba(120, 30, 30, 0.5);
  border-color: rgba(248, 113, 113, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 0 20px rgba(248, 113, 113, 0.15);
}

.pi-yn-yes:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* ===== AUCTION ===== */
.pi-auction {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pi-auction-god {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: 4px;
  background: rgba(200, 168, 78, 0.04);
  border: 1px solid rgba(200, 168, 78, 0.15);
}

.pi-auction-portrait {
  width: 56px;
  height: 72px;
  border-radius: 4px;
  border: 1px solid rgba(200, 168, 78, 0.25);
  object-fit: cover;
}

.pi-auction-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pi-auction-god-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 500;
  color: #c8a84e;
  letter-spacing: 0.04em;
}

.pi-auction-power-desc {
  font-size: 10px;
  color: #a09480;
  font-style: italic;
  line-height: 1.3;
  margin-top: 2px;
}

.pi-auction-bid-info {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 4px;
  background: rgba(200, 168, 78, 0.03);
  border: 1px solid rgba(200, 168, 78, 0.08);
}

.pi-auction-label {
  font-size: 11px;
  color: rgba(200, 168, 78, 0.5);
  font-weight: 600;
}

.pi-auction-amount {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 700;
  color: #fca5a5;
  margin-left: 6px;
}

.pi-auction-glory {
  font-family: var(--font-display, Georgia, serif);
  font-size: 18px;
  font-weight: 700;
  color: #86efac;
  margin-left: 6px;
}

.pi-auction-controls {
  display: flex;
  justify-content: center;
}

.pi-auction-bid-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pi-auction-adj {
  width: 26px;
  height: 26px;
  border-radius: 3px;
  border: 1px solid rgba(200, 168, 78, 0.25);
  background: rgba(200, 168, 78, 0.06);
  color: #c8a84e;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.pi-auction-adj:hover {
  background: rgba(200, 168, 78, 0.18);
}

.pi-auction-bid-val {
  font-family: var(--font-display, Georgia, serif);
  font-size: 24px;
  font-weight: 700;
  color: #fbbf24;
  min-width: 36px;
  text-align: center;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.2);
}

.pi-auction-bid-unit {
  font-size: 10px;
  font-weight: 800;
  color: rgba(200, 168, 78, 0.45);
  letter-spacing: 0.08em;
}

/* ===== DRAGON HATCH ===== */
.pi-dragons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pi-dragon-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-height: 68vh;
  overflow-y: auto;
  padding-right: 4px;
}

.pi-dragon-tile {
  position: relative;
  border: 1.5px solid rgba(200, 168, 78, 0.12);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  text-align: left;
  overflow: hidden;
  background: rgba(10, 8, 16, 0.95);
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}

.pi-dragon-tile:hover {
  border-color: rgba(200, 168, 78, 0.6);
  transform: translateY(-2px) scale(1.015);
  box-shadow:
    0 0 24px rgba(200, 168, 78, 0.12),
    0 8px 24px rgba(0, 0, 0, 0.5);
}

.pi-dragon-art {
  position: relative;
  height: 90px;
  overflow: hidden;
  flex-shrink: 0;
}

.pi-dragon-portrait {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 15%;
  pointer-events: none;
}

.pi-dragon-vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center, transparent 30%, rgba(10, 8, 16, 0.7) 100%),
    linear-gradient(to bottom, transparent 40%, rgba(10, 8, 16, 1) 100%);
  pointer-events: none;
}

.pi-dragon-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 9px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
  z-index: 2;
}

.pi-dragon-badges-left,
.pi-dragon-badges-right {
  position: absolute;
  top: 7px;
  display: flex;
  align-items: center;
}
.pi-dragon-badges-left { left: 8px; }
.pi-dragon-badges-right { right: 8px; }

.pi-dragon-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 20px;
  font-weight: 500;
  color: #f0ede8;
  letter-spacing: 0.04em;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.95), 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 20px rgba(200, 168, 78, 0.15);
  line-height: 1.05;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pi-dragon-domain-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
}

.pi-dragon-fly-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
}

.pi-dragon-stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 5px 10px;
  background: rgba(0, 0, 0, 0.5);
}

.pi-dragon-stat {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
}

.pi-dragon-stat-atk { border: 1.5px solid rgba(251, 146, 60, 0.2); }
.pi-dragon-stat-def { border: 1.5px solid rgba(96, 165, 250, 0.2); }

.pi-dragon-stat-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.pi-dragon-stat-svg { font-size: 18px; }
.pi-dragon-stat-atk .pi-dragon-stat-svg { color: #fb923c; }
.pi-dragon-shield-icon { color: #60a5fa; }

.pi-dragon-stat-num {
  font-size: 20px;
  font-weight: 800;
  font-family: var(--font-display, Georgia, serif);
  line-height: 1;
}

.pi-dragon-stat-atk .pi-dragon-stat-num {
  color: #fb923c;
  text-shadow: 0 0 14px rgba(251, 146, 60, 0.3);
}

.pi-dragon-stat-def .pi-dragon-stat-num {
  color: #60a5fa;
  text-shadow: 0 0 14px rgba(96, 165, 250, 0.3);
}

.pi-dragon-ability {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 10px 8px;
  background: rgba(10, 8, 16, 0.95);
  line-height: 1.35;
}

.pi-dragon-trigger {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #c8a84e;
  background: rgba(200, 168, 78, 0.1);
  border: 1px solid rgba(200, 168, 78, 0.25);
  border-radius: 3px;
  padding: 1px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.pi-dragon-desc {
  font-size: 10px;
  color: #a09480;
  font-style: italic;
}

/* ===== TRANSITION ===== */
.pi-fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.pi-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.pi-fade-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}
.pi-fade-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .pi-box {
    max-width: 92vw;
    max-height: 80vh;
    overflow-y: auto;
    padding: 18px 16px;
  }
  .pi-title { font-size: 15px; }
  .pi-yn-yes, .pi-yn-no { padding: 8px 18px; font-size: 13px; }
}
</style>
