<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore } from '../../stores/gameStore'

const game = useGameStore()

const interaction = computed(() => game.state?.pendingInteraction ?? null)
const show = computed(() => !!interaction.value)

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
const title = computed(() => {
  const t = interaction.value?.type
  if (t === 'alkonost_target') return 'Hipnoza Alkonosta'
  if (t === 'chowaniec_intercept') return 'Chowaniec — Przejąć atak?'
  if (t === 'kresnik_buff') return 'Kresnik — Wybierz premię'
  if (t === 'baba_domain') return 'Baba — Wybierz domenę'
  if (t === 'cmentarna_baba_resurrect') return 'Cmentarna Baba — Wskrzeszenie'
  if (t === 'inkluz_recipient') return 'Inkluz — Komu dać premię?'
  if (t === 'wielkolud_counter') return 'Wielkolud — Kontratak'
  if (t === 'liczyrzepa_type') return 'Liczyrzepa — Typ ataku'
  if (t === 'on_play_target') return `${(sourceCard.value?.cardData as any)?.name ?? 'Karta'} — Wybierz cel`
  if (t === 'brzegina_shield') return 'Brzegina — Tarcza ochronna'
  if (t === 'kosciej_resurrect') return 'Kościej — Wskrzeszenie'
  return 'Wybierz'
})

const description = computed(() => {
  const t = interaction.value?.type
  const atk = attackerCard.value
  const src = sourceCard.value
  if (t === 'alkonost_target') {
    return `${(atk?.cardData as any)?.name ?? 'Atakujący'} musi zaatakować sojusznika ${(src?.cardData as any)?.name ?? 'Alkonosta'}. Kliknij cel.`
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
  if (t === 'on_play_target') return `Wybierz cel efektu ${(sourceCard.value?.cardData as any)?.name ?? 'karty'}.`
  if (t === 'brzegina_shield') {
    const cost = (interaction.value?.metadata?.cost as number) ?? 1
    const targetName = (() => {
      const tId = interaction.value?.targetInstanceId
      if (!tId) return 'sojusznika'
      const tc = findCard(tId)
      return (tc?.cardData as any)?.name ?? 'sojusznika'
    })()
    return `Brzegina może ochronić ${targetName} przed obrażeniami. Koszt: ${cost === 0 ? 'GRATIS (pierwsze użycie)' : `${cost} ZŁ`}.`
  }
  if (t === 'kosciej_resurrect') return 'Kościej zginął od Wręcz — jego serce wciąż bije! Wydaj 1 ZŁ, by wskrzesić go na L1.'
  return 'Wybierz opcję.'
})

function pickTarget(choice: string) {
  game.resolvePendingInteraction(choice)
}
</script>

<template>
  <Transition name="pi-fade">
    <div v-if="show" class="pi-overlay">
      <div class="pi-box">

        <!-- Header -->
        <div class="pi-header">
          <Icon icon="game-icons:magic-swirl" class="pi-header-icon" />
          <span class="pi-title">{{ title }}</span>
        </div>

        <!-- Kontekst Alkonost: kto atakuje → kogo wybieramy -->
        <div v-if="interaction?.type === 'alkonost_target'" class="pi-context">
          <div class="pi-ctx-slot">
            <span class="pi-ctx-label">Zmuszony do ataku</span>
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
          class="pi-targets"
        >
          <button
            v-for="card in availableTargets"
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
          <p v-if="availableTargets.length === 0" class="pi-empty">Brak dostępnych celów.</p>
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
            <Icon icon="game-icons:shield" /> {{ (interaction?.metadata?.cost as number) === 0 ? 'Tak, osłoń (gratis)' : `Tak, osłoń (-${interaction?.metadata?.cost} ZŁ)` }}
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Nie, przepuść atak
          </button>
        </div>

        <!-- Kościej: Wskrzeszenie za ZŁ -->
        <div
          v-if="interaction?.type === 'kosciej_resurrect'"
          class="pi-yn"
        >
          <button class="pi-yn-yes" @click="pickTarget('yes')">
            <Icon icon="game-icons:skull-crossed-bones" /> Wskrześ za 1 ZŁ
          </button>
          <button class="pi-yn-no" @click="pickTarget('no')">
            <Icon icon="game-icons:cancel" /> Niech odejdzie
          </button>
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
  backdrop-filter: blur(3px);
}

.pi-box {
  background: #0f172a;
  border: 1.5px solid #7c3aed;
  border-radius: 14px;
  padding: 28px 32px;
  min-width: 340px;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.3), 0 20px 40px rgba(0,0,0,0.6);
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

/* Target card buttons */
.pi-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
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
</style>
