<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

// Creature portraits (same glob as CreatureCard.vue)
const _creatureImgModules = import.meta.glob('../../assets/cards/creature/*.png', { eager: true, import: 'default' })
const creatureImgs: Record<number, string> = {}
for (const [path, url] of Object.entries(_creatureImgModules)) {
  const match = path.match(/(\d+)\.png$/)
  if (match?.[1]) creatureImgs[parseInt(match[1])] = url as string
}

// Attack type / domain / flying icons (same as CreatureCard.vue)
import attackTypeImg1 from '~/assets/cards/attackType1.png'  // Elemental
import attackTypeImg2 from '~/assets/cards/attackType2.png'  // Magic
import attackTypeImg3 from '~/assets/cards/attackType3.png'  // Ranged
import flyingImg from '~/assets/cards/isFlying.png'
import domainImg1 from '~/assets/cards/domain-1.png'
import domainImg2 from '~/assets/cards/domain-2.png'
import domainImg3 from '~/assets/cards/domain-3.png'
import domainImg4 from '~/assets/cards/domain-4.png'

const attackTypeImgs: Record<number, string> = { 1: attackTypeImg1, 2: attackTypeImg2, 3: attackTypeImg3 }
const attackTypeIcons: Record<number, string> = { 0: 'game-icons:crossed-swords', 1: 'game-icons:fire-dash', 2: 'game-icons:magic-swirl', 3: 'game-icons:arrow-flights' }
const attackTypeNames: Record<number, string> = { 0: 'Wręcz', 1: 'Żywioł', 2: 'Magia', 3: 'Dystans' }
const domainImgs: Record<number, string> = { 1: domainImg1, 2: domainImg2, 3: domainImg3, 4: domainImg4 }

const game = useGameStore()

const interaction = computed(() => game.state?.pendingInteraction ?? null)
// Hipnoza Alkonosta jest obsługiwana przez podświetlenie na polu, nie przez modal
const show = computed(() => !!interaction.value && interaction.value.type !== 'alkonost_target')

// Dragon hatch data (from pending interaction metadata)
const dragonChoices = computed(() => {
  if (interaction.value?.type !== 'smocze_jajo_hatch') return []
  return (interaction.value.metadata?.dragons as any[]) ?? []
})
const targetSearch = ref('')
// Reset szukajki gdy zmieni się interakcja
watch(interaction, () => { targetSearch.value = '' })

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
  if (t === 'chowaniec_intercept') return 'Chowaniec — Przejąć atak?'
  if (t === 'kresnik_buff') return 'Kresnik — Wybierz premię'
  if (t === 'baba_domain') return 'Baba — Wybierz domenę'
  if (t === 'cmentarna_baba_resurrect') return 'Cmentarna Baba — Wskrzeszenie'
  if (t === 'inkluz_recipient') return 'Inkluz — Komu dać premię?'
  if (t === 'wielkolud_counter') return 'Wielkolud — Kontratak'
  if (t === 'liczyrzepa_type') return 'Liczyrzepa — Typ ataku'
  if (t === 'smocze_jajo_hatch') return 'Smocze Jajo — Wyklucie!'
  if (t === 'on_play_target') return `${(sourceCard.value?.cardData as any)?.name ?? 'Karta'} — Wybierz cel`
  if (t === 'brzegina_shield') return 'Brzegina — Tarcza ochronna'
  if (t === 'kosciej_resurrect') return 'Kościej — Wskrzeszenie'
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
  if (t === 'chowaniec_intercept') return 'Chowaniec może przejąć atak na sojusznika. Czy interweniować?'
  if (t === 'kresnik_buff') return 'Wybierz jedną premię dla Kresnika (trwałą na całą grę).'
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

        <!-- Header -->
        <div class="pi-header">
          <Icon icon="game-icons:magic-swirl" class="pi-header-icon" />
          <span class="pi-title">{{ title }}</span>
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

        <!-- Wybór stringowy (kresnik_buff, baba_domain, liczyrzepa_type) -->
        <div
          v-if="['kresnik_buff', 'baba_domain', 'liczyrzepa_type'].includes(interaction?.type ?? '') && interaction?.availableChoices"
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
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:check-mark" /> Tak, przejmij
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Nie, pomiń
          </button>
        </div>

        <!-- Brzegina: Tak / Nie z kosztami -->
        <div
          v-if="interaction?.type === 'brzegina_shield'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:shield" /> {{ (interaction?.metadata?.cost as number) === 0 ? 'Tak, osłoń (gratis)' : `Tak, osłoń (-${interaction?.metadata?.cost} PS)` }}
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Nie, przepuść atak
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
                    <img v-if="dragon.isFlying" :src="flyingImg" class="pi-dragon-fly-icon" title="Lot" />
                  </span>
                </div>
              </div>
              <!-- Stats bar (CardTooltip style) -->
              <div class="pi-dragon-stats-bar">
                <div class="pi-dragon-stat pi-dragon-stat-atk">
                  <img v-if="attackTypeImgs[dragon.attackType]" :src="attackTypeImgs[dragon.attackType]" class="pi-dragon-stat-img" />
                  <Icon v-else :icon="attackTypeIcons[dragon.attackType] ?? 'game-icons:crossed-swords'" class="pi-dragon-stat-svg" />
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
.pi-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.pi-box {
  background: #0f172a;
  border: 1.5px solid #7c3aed;
  border-radius: 14px;
  padding: 28px 32px;
  min-width: 340px;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.3), 0 20px 40px rgba(0,0,0,0.6);
}

.pi-box-wide {
  max-width: 900px;
  width: 90vw;
}

.pi-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.pi-header-icon {
  font-size: 22px;
  color: #a78bfa;
}

.pi-title {
  font-size: 17px;
  font-weight: 700;
  color: #c4b5fd;
  letter-spacing: 0.02em;
}

/* Context row */
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
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.pi-mini-card {
  border: 2px solid #475569;
  border-radius: 8px;
  padding: 8px 14px;
  background: #1e293b;
  min-width: 88px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.pi-mini-unknown {
  border-color: #7c3aed;
  opacity: 0.55;
}

.pi-unknown-icon {
  font-size: 18px;
  color: #7c3aed;
}

.pi-mini-name {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.pi-mini-stats {
  font-size: 11px;
  color: #94a3b8;
}

.pi-arrow {
  font-size: 28px;
  color: #f87171;
}

.pi-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  text-align: center;
  line-height: 1.6;
}

/* Target card section */
.pi-targets-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.pi-search {
  width: 100%;
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
.pi-search::placeholder { color: #475569; }
.pi-search:focus { border-color: #7c3aed; }

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
  background: #1e293b;
  border: 2px solid var(--domain-color, #475569);
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 90px;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}

.pi-target-btn:hover {
  background: color-mix(in srgb, var(--domain-color) 15%, #1e293b);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.pi-t-name {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}

.pi-t-stats {
  font-size: 11px;
  color: #94a3b8;
}

.pi-empty {
  color: #475569;
  font-size: 13px;
  font-style: italic;
}

/* String choice buttons */
.pi-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.pi-choice-btn {
  background: #1e293b;
  border: 2px solid #7c3aed;
  border-radius: 8px;
  padding: 10px 22px;
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.pi-choice-btn:hover {
  background: #2d1f5a;
  transform: translateY(-2px);
}

/* Y / N */
.pi-yn {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.pi-yn-yes,
.pi-yn-no {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 28px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.pi-yn-yes {
  background: linear-gradient(135deg, #059669, #10b981);
  color: #fff;
}

.pi-yn-no {
  background: linear-gradient(135deg, #b91c1c, #ef4444);
  color: #fff;
}

.pi-yn-yes:hover,
.pi-yn-no:hover {
  opacity: 0.85;
  transform: translateY(-1px);
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
  border-radius: 10px;
  background: rgba(200, 168, 78, 0.06);
  border: 1px solid rgba(200, 168, 78, 0.15);
}

.pi-auction-portrait {
  width: 56px;
  height: 72px;
  border-radius: 6px;
  border: 1px solid rgba(200, 168, 78, 0.3);
  object-fit: cover;
}

.pi-auction-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pi-auction-god-name {
  font-family: Georgia, serif;
  font-size: 18px;
  font-weight: 800;
  color: #c8a84e;
}

.pi-auction-power-desc {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.7);
  font-style: italic;
  line-height: 1.3;
  margin-top: 2px;
}

.pi-auction-bid-info {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.pi-auction-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

.pi-auction-amount {
  font-family: Georgia, serif;
  font-size: 18px;
  font-weight: 900;
  color: #fca5a5;
  margin-left: 6px;
}

.pi-auction-glory {
  font-family: Georgia, serif;
  font-size: 18px;
  font-weight: 900;
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
  border-radius: 5px;
  border: 1px solid rgba(200, 168, 78, 0.25);
  background: rgba(200, 168, 78, 0.08);
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
  font-family: Georgia, serif;
  font-size: 24px;
  font-weight: 900;
  color: #fbbf24;
  min-width: 36px;
  text-align: center;
}

.pi-auction-bid-unit {
  font-size: 10px;
  font-weight: 800;
  color: rgba(200, 168, 78, 0.5);
  letter-spacing: 0.08em;
}

.pi-yn-yes:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none !important;
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
  border: 1.5px solid rgba(251, 191, 36, 0.12);
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  text-align: left;
  overflow: hidden;
  background: #0a0406;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}

.pi-dragon-tile:hover {
  border-color: rgba(251, 191, 36, 0.6);
  transform: translateY(-2px) scale(1.015);
  box-shadow:
    0 0 20px rgba(251, 191, 36, 0.12),
    0 8px 24px rgba(0, 0, 0, 0.5);
}

/* Art section — portrait with vignette */
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
    radial-gradient(ellipse at center, transparent 30%, rgba(10, 4, 6, 0.7) 100%),
    linear-gradient(to bottom, transparent 40%, #0a0406 100%);
  pointer-events: none;
}

/* Top bar over portrait: domain left, name center, flying right */
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
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.95), 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 20px rgba(251, 191, 36, 0.15);
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

/* Stats bar — matches CardTooltip .pv-stat style */
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
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.45);
}

.pi-dragon-stat-atk {
  border: 1.5px solid rgba(251, 146, 60, 0.2);
}

.pi-dragon-stat-def {
  border: 1.5px solid rgba(96, 165, 250, 0.2);
}

.pi-dragon-stat-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.pi-dragon-stat-svg {
  font-size: 18px;
}

.pi-dragon-stat-atk .pi-dragon-stat-svg {
  color: #fb923c;
}

.pi-dragon-shield-icon {
  color: #60a5fa;
}

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

/* Ability description with trigger label */
.pi-dragon-ability {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 10px 8px;
  background: #0a0406;
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
  color: rgba(148, 163, 184, 0.7);
  font-style: italic;
}

/* Transition */
.pi-fade-enter-active,
.pi-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.pi-fade-enter-from,
.pi-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

/* ====== MOBILE ====== */
@media (max-width: 767px) {
  .pi-box {
    max-width: 92vw;
    max-height: 80vh;
    overflow-y: auto;
  }
}
</style>
