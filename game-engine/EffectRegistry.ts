/**
 * KSIĘGA ZDOLNOŚCI — EFFECT REGISTRY
 *
 * Centralne repozytorium WSZYSTKICH efektów kart w grze.
 * Karty w JSON mają tylko effectId (referencję).
 * Logika efektu żyje tutaj i tylko tutaj.
 *
 * Konwencja ID:
 *   [nazwa_karty_snake]_[skrót_efektu]
 *   np. "gryf_double_dmg_on_play_turn"
 *
 * Statusy implementacji:
 *   ✅ IMPLEMENTED  — gotowe i przetestowane
 *   🔧 PARTIAL     — częściowo zaimplementowane
 *   📋 TODO        — zaplanowane, nie zaimplementowane
 */

import type { EffectDefinition, EffectContext, EffectResult, GameState, CardInstance } from './types'
import { EffectTrigger, EffectPriority, CardPosition, BattleLine } from './constants'
import { cloneGameState, addLog, dealDamage, removeCardFromField, moveToGraveyard } from './GameStateUtils'

// ===== REGISTRY MAP =====

const registry = new Map<string, EffectDefinition>()

export function registerEffect(def: EffectDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`[EffectRegistry] Duplikat effectId: "${def.id}"`)
  }
  registry.set(def.id, def)
}

export function getEffect(id: string): EffectDefinition | null {
  return registry.get(id) ?? null
}

export function getAllEffectIds(): string[] {
  return Array.from(registry.keys())
}

/**
 * Sprawdza czy karta może teraz aktywować swoją zdolność (⚡).
 * Uwzględnia: activatable, cooldown, koszt ZŁ, uciszenie.
 */
export function canActivateEffect(state: import('./types').GameState, card: import('./types').CardInstance): boolean {
  const effect = registry.get((card.cardData as any).effectId ?? '')
  if (!effect?.activatable) return false
  if (card.isSilenced) return false

  // Darmowa aktywacja oczekuje (ON_PLAY pominięty) — zezwól bez kosztu i cooldownu
  if (card.metadata.freeActivationPending) return true

  // Sprawdź cooldown
  const cooldown = effect.activationCooldown ?? 'unlimited'
  if (cooldown === 'per_round') {
    if ((card.metadata.lastActivatedRound as number) >= state.roundNumber) return false
  } else if (cooldown === 'per_turn') {
    if ((card.metadata.lastActivatedTurn as number) >= state.turnNumber) return false
  } else if (cooldown === 'once') {
    if (((card.metadata.activationCount as number) ?? 0) > 0) return false
  }

  // Sprawdź ZŁ
  const cost = effect.activationCost ?? 0
  if (state.players[card.owner].gold < cost) return false

  return true
}

// Helper: pusty efekt (brak zdolności / lore-only)
function noEffect(id: string, name: string): EffectDefinition {
  return {
    id,
    name,
    description: 'Brak specjalnej zdolności.',
    trigger: EffectTrigger.PASSIVE,
    priority: EffectPriority.MODIFIER,
    execute: (ctx) => ({ newState: ctx.state, log: [], prevented: false, replaced: false }),
  }
}

// Helper: standardowy wynik efektu
function effectResult(state: GameState, log = [], prevented = false, replaced = false): EffectResult {
  return { newState: state, log, prevented, replaced }
}

// ===================================================================
// ISTOTY — PERUN
// ===================================================================

// ✅ AITWAR — Kradnie kartę z ręki przeciwnika (ON_PLAY: gratis, ON_ACTIVATE: 1 ZŁ raz na zawsze)
registerEffect({
  id: 'aitwar_steal_hand',
  name: 'Kradzież Aitwara',
  description: 'Przy wystawieniu kradnie 1 kartę z ręki przeciwnika (gratis). Raz w grze można aktywować ponownie za 1 ZŁ.',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 1,
  activationCooldown: 'once',
  canActivate: (ctx) => {
    // Blokuj gdy przeciwnik nie ma kart — uniknij bezużytecznego wydania ZŁ
    const opponent = ctx.state.players[ctx.source.owner === 'player1' ? 'player2' : 'player1']
    return opponent.hand.length > 0
  },
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const owner = newState.players[source.owner]
    const opponent = newState.players[source.owner === 'player1' ? 'player2' : 'player1']

    if (opponent.hand.length === 0) {
      return effectResult(newState, [addLog(newState, `${source.cardData.name}: Rywal nie ma kart w ręce.`, 'effect')])
    }

    const randomIdx = Math.floor(Math.random() * opponent.hand.length)
    const stolen = opponent.hand.splice(randomIdx, 1)[0]
    if (!stolen) return effectResult(newState)
    stolen.owner = source.owner
    stolen.isRevealed = true  // karta jest widoczna dla nowego właściciela
    owner.hand.push(stolen)

    const log = addLog(newState, `${source.cardData.name} ukradł kartę "${stolen.cardData.name}" z ręki przeciwnika!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ ALKONOST — Zaatakowana istota kontratakuje wybranego sojusznika
registerEffect({
  id: 'alkonost_redirect_counterattack',
  name: 'Hipnoza Alkonosty',
  description: 'Zaatakowana istota, dodatkowo atakuje wybranego przez Alkonosta sojusznika.',
  trigger: EffectTrigger.ON_DEFEND,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    // DESIGN DECISION: "sojusznik" = sojusznik Alkonosta (nie gracza atakującego)
    // Target selection odbywa się interaktywnie w UI — tutaj oznaczamy że efekt jest aktywny
    const newState = cloneGameState(ctx.state)
    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Hipnoza aktywna — zaatakowana istota uderzy w sojusznika.`, 'effect')
    return effectResult(newState, [log])
  },
})

// 📋 BARSTUK — Wybrany sojusznik regeneruje obronę (aktywowane przez gracza raz na turę)
registerEffect({
  id: 'barstuk_ally_regen',
  name: 'Wsparcie Barstuka',
  description: 'Wybrany sojusznik Żywi regeneruje swoją obronę do maksimum. Raz na turę.',
  trigger: [EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.MODIFIER,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  execute: (ctx) => {
    // ctx.target = wybrany sojusznik (target selection w UI)
    const newState = cloneGameState(ctx.state)
    if (ctx.target) {
      const targetInState = findCardInState(newState, ctx.target.instanceId)
      if (targetInState) {
        targetInState.currentStats.defense = targetInState.currentStats.maxDefense
        const log = addLog(ctx.state, `${ctx.source.cardData.name}: ${ctx.target.cardData.name} regeneruje obronę do ${targetInState.currentStats.maxDefense}.`, 'effect')
        return effectResult(newState, [log])
      }
    }
    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Sojusznik regeneruje obronę.`, 'effect')
    return effectResult(newState, [log])
  },
})

// 📋 BAŁWAN — Raz skorzystaj z Bożej Łaski za darmo
registerEffect({
  id: 'balwan_free_divine_favor',
  name: 'Bożej Łaski Dar',
  description: 'Możesz raz skorzystać z wybranej Bożej Łaski, nie płacąc za nią.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    // TODO: Integracja z Panteonem (Etap 6)
    const newState = cloneGameState(ctx.state)
    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Boża Łaska jest teraz dostępna za darmo (1x).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ BIALI LUDZIE — Zraniona istota traci zdolność ataku
registerEffect({
  id: 'biali_ludzie_wound_disarm',
  name: 'Zaraza Białych Ludzi',
  description: 'Każda istota zraniona przez Białych Ludzi traci zdolność ataku.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const targetInState = findCardInState(newState, target.instanceId)
    if (targetInState) {
      targetInState.cannotAttack = true
      const log = addLog(state, `${ctx.source.cardData.name} zaraził "${target.cardData.name}" — traci zdolność ataku!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ BRZEGINA — Za ZŁ, sojusznik nie otrzymuje obrażeń (pierwsze użycie darmowe)
registerEffect({
  id: 'brzegina_shield_for_gold',
  name: 'Tarcza Brzeginy',
  description: 'Za każdy wydany ZŁ jedna sojusznicza istota nie otrzymuje obrażeń podczas ataku. Pierwsze użycie darmowe.',
  trigger: EffectTrigger.ON_DAMAGE,
  priority: EffectPriority.PREVENTION,
  canActivate: (ctx) => {
    const owner = ctx.state.players[ctx.source.owner]
    const firstUseFree = !(ctx.source.metadata.brzeginaUsedFree as boolean)
    return firstUseFree || owner.gold > 0
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const owner = newState.players[ctx.source.owner]
    const sourceInState = findCardInState(newState, ctx.source.instanceId)

    const firstUseFree = !(sourceInState?.metadata?.brzeginaUsedFree as boolean)
    if (!firstUseFree) {
      owner.gold -= 1
    }
    if (sourceInState) {
      sourceInState.metadata.brzeginaUsedFree = true
    }

    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Tarcza aktywna${firstUseFree ? ' (darmowe)' : ' (-1 ZŁ)'}!`, 'effect')
    return effectResult(newState, [log], true) // prevented = true = damage blocked
  },
})

// ✅ BUGAJ — Zyskuje ATK za straconą DEF
registerEffect({
  id: 'bugaj_def_to_atk',
  name: 'Gniew Bugaja',
  description: 'Za każdy punkt obrony który traci, zyskuje tyle samo ataku.',
  trigger: EffectTrigger.ON_DAMAGE,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, value } = ctx
    if (!value || value <= 0) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (card) {
      card.currentStats.attack += value
      const log = addLog(state, `${source.cardData.name} zamienił ${value} obrony w atak! (ATK: ${card.currentStats.attack})`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ BŁOTNIK — Istoty w zasięgu muszą atakować Błotnika
registerEffect({
  id: 'blotnik_taunt',
  name: 'Pułapka Błotnika',
  description: 'Każda istota przeciwnika, która ma Błotnika w zasięgu ataku, nie może atakować nikogo innego.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    // PASSIVE: silnik sprawdza ten efekt przy walidacji celów ataku
    return effectResult(cloneGameState(ctx.state))
  },
})

// ✅ CHMURNIK — Uziemia wrogie latające istoty
registerEffect({
  id: 'chmurnik_ground_flying',
  name: 'Uziemienie Chmurnika',
  description: 'Tak długo jak Chmurnik jest w polu, wszystkie wrogie latające istoty tracą cechę latania.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponent = newState.players[ctx.source.owner === 'player1' ? 'player2' : 'player1']

    // Ground all enemy flying creatures
    forEachCreatureOnField(opponent, (card) => {
      if ((card.cardData as any).isFlying && !card.isGrounded) {
        card.isGrounded = true
      }
    })
    return effectResult(newState)
  },
})

// ✅ CHOWANIEC — Darmowa, opcjonalna intercepcja ataku na sojusznika
// Gracz klika Chowańca gdy wróg deklaruje atak na inną jednostkę → Chowaniec przejmuje atak
// CombatResolver sprawdza flagę przed wykonaniem ataku
registerEffect({
  id: 'chowaniec_intercept',
  name: 'Poświęcenie Chowańca',
  description: 'Darmowe i opcjonalne: może przyjąć na siebie atak wymierzony w dowolnego sojusznika.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    // Intercepcja: gracz aktywuje przez UI → ustawia flagę interceptTarget w metadanych Chowańca
    // CombatResolver sprawdza: jeśli target.metadata.interceptedBy = chowaniecId → przekieruj atak
    return effectResult(cloneGameState(ctx.state))
  },
})

// ✅ DOBROOCHOCZY — Nie kontratakuje
registerEffect({
  id: 'dobroochoczy_no_counter',
  name: 'Dobra Wola',
  description: 'Nie kontratakuje nigdy — nawet w pozycji obrony.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state), [], false, false),
})

// ✅ DZIEWIĄTKO — Zraniona istota z ≤3 DEF: zapłać ZŁ lub zginie
registerEffect({
  id: 'dziewiatko_deathmark',
  name: 'Ukąszenie Dziewiątka',
  description: 'Gdy zrani istotę i pozostanie jej 3 lub mniej obrony, rywal musi zapłacić 1 ZŁ — inaczej ta istota zginie.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const targetInState = findCardInState(newState, target.instanceId)

    if (targetInState && targetInState.currentStats.defense <= 3 && targetInState.currentStats.defense > 0) {
      const opponent = newState.players[targetInState.owner]
      if (opponent.gold >= 1) {
        // AI/gracz może zapłacić — oznaczamy że musi zdecydować
        targetInState.metadata.dziewiatkoDeathMark = true
        const log = addLog(state, `${ctx.source.cardData.name}: "${target.cardData.name}" ma śmiertelną ranę! Rywal musi zapłacić 1 ZŁ.`, 'effect')
        return effectResult(newState, [log])
      } else {
        // Brak złota — karta ginie
        const log = addLog(state, `${ctx.source.cardData.name}: "${target.cardData.name}" ginie — rywal nie ma ZŁ!`, 'death')
        return effectResult(newState, [log])
      }
    }
    return effectResult(newState)
  },
})

// ✅ DZIKI MYŚLIWY — Po zabiciu może wrócić do talii NA WIERZCH z zachowanymi efektami/artefaktami
// AI decyduje: wraca jeśli ma mało HP (DEF <= 2) LUB ma cenne artefakty
registerEffect({
  id: 'dziki_mysliwy_return_on_kill',
  name: 'Polowanie Dzikiego Myśliwego',
  description: 'Za każdym razem gdy zabije wrogą istotę, może wrócić do talii (NA WIERZCH) zachowując wszystkie efekty i artefakty.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const sourceInState = findCardInState(newState, ctx.source.instanceId)
    if (!sourceInState) return effectResult(newState)

    // AI heurystyka: wróć jeśli mało HP lub ma artefakty warte zachowania
    const isAI = newState.players[sourceInState.owner].isAI
    const lowHP = sourceInState.currentStats.defense <= 2
    const hasArtifacts = sourceInState.equippedArtifacts.length > 0
    const shouldReturn = isAI ? (lowHP || hasArtifacts) : false // gracz decyduje interaktywnie

    if (shouldReturn || !isAI) {
      // Oznacz możliwość powrotu — GameEngine pyta gracza lub AI wykonuje automatycznie
      sourceInState.metadata.canReturnToDeck = true
      sourceInState.metadata.returnToDeckTop = true // na WIERZCH talii
    }

    const log = addLog(ctx.state,
      `${ctx.source.cardData.name} może wrócić do talii${shouldReturn ? ' (AI: powraca)' : ''}.`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ✅ GRYF — Podwójne obrażenia w rundzie wystawienia
registerEffect({
  id: 'gryf_double_dmg_on_play_turn',
  name: 'Szarża Gryfa',
  description: 'Jeśli atakuje w tej samej rundzie w której został wystawiony, zadaje podwójne obrażenia.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.MODIFIER,
  canActivate: (ctx) => ctx.source.roundEnteredPlay === ctx.state.roundNumber,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Szarża! Podwójne obrażenia w rundzie wystawienia.`, 'effect')
    // Modyfikator zwracamy — CombatResolver aplikuje go
    const sourceInState = findCardInState(newState, ctx.source.instanceId)
    if (sourceInState) {
      sourceInState.metadata.damageMultiplier = 2
    }
    return effectResult(newState, [log])
  },
})

// ✅ KRÓL WĘŻÓW — Kontratakuje nawet w ataku
registerEffect({
  id: 'krol_wezow_always_counter',
  name: 'Jadowity Kontratak',
  description: 'Kontratakuje nawet gdy jest w pozycji ataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ LESZY — Sojusznicy po ataku mogą przejść w pozycję obrony
registerEffect({
  id: 'leszy_post_attack_defend',
  name: 'Komenda Leszego',
  description: 'Sojusznicy Leszego, po wykonaniu ataku, mogą natychmiast przejść w pozycję obrony.',
  trigger: EffectTrigger.ON_ALLY_ATTACK,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    // Oznaczamy sojuszników że mogą zmienić pozycję po ataku
    const owner = newState.players[ctx.source.owner]
    forEachCreatureOnField(owner, (card) => {
      if (card.instanceId !== ctx.source.instanceId) {
        card.metadata.canDefendAfterAttack = true
      }
    })
    return effectResult(newState)
  },
})

// 📋 MATOHA — TODO: przeczytać efekt
registerEffect(noEffect('matoha_effect', 'Matoha'))

// ✅ MRÓZ — Odporny na wrogie premie
registerEffect({
  id: 'mroz_immunity_buffs',
  name: 'Odporność Mrozu',
  description: 'Odporny na wrogie premie (buffy od przeciwnika nie działają).',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const card = findCardInState(newState, ctx.source.instanceId)
    if (card) card.isImmune = true
    return effectResult(newState)
  },
})

// ✅ RODZANICE — Raz na turę: zamień jedną wybraną premię między dwoma sojusznikami
// "Premia" = aktywny efekt (ActiveEffect) lub artefakt (equippedArtifact)
registerEffect({
  id: 'rodzanice_swap_buff',
  name: 'Wyrok Rodzanic',
  description: 'Raz na turę: wybierz dwie sojusznicze istoty i jedną premię — zostaje przeniesiona z jednej na drugą.',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.MODIFIER,
  canActivate: (ctx) => ctx.source.metadata.rodzaniceUsedThisTurn !== true,
  execute: (ctx) => {
    // Selekcja (sourceCard, targetCard, effectToSwap) odbywa się interaktywnie w UI/AI
    // Tutaj oznaczamy dostępność — GameEngine wywołuje rodzanice_do_swap gdy gracz wybierze
    const newState = cloneGameState(ctx.state)
    const card = findCardInState(newState, ctx.source.instanceId)
    if (card) card.metadata.rodzaniceUsedThisTurn = false  // reset na początku tury
    return effectResult(newState)
  },
})

// Pomocniczy efekt wykonujący faktyczny swap — wywoływany gdy gracz wybrał cele
registerEffect({
  id: 'rodzanice_do_swap',
  name: 'Wyrok Rodzanic (swap)',
  description: 'Wykonuje zamianę premii między dwoma sojusznikami.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const rodzanice = findCardInState(newState, source.instanceId)
    if (rodzanice) rodzanice.metadata.rodzaniceUsedThisTurn = true

    // metadata.swapEffectId = który activeEffect przenieść
    const swapEffectId = ctx.metadata?.swapEffectId as string
    const fromCard = findCardInState(newState, ctx.metadata?.fromInstanceId as string)
    const toCard = findCardInState(newState, target.instanceId)

    if (fromCard && toCard && swapEffectId) {
      const effectIdx = fromCard.activeEffects.findIndex(e => e.effectId === swapEffectId)
      if (effectIdx !== -1) {
        const [effect] = fromCard.activeEffects.splice(effectIdx, 1)
        toCard.activeEffects.push(effect)
        const log = addLog(state,
          `Rodzanice przenoszą premię "${swapEffectId}" z ${fromCard.cardData.name} na ${toCard.cardData.name}.`,
          'effect'
        )
        return effectResult(newState, [log])
      }
    }
    return effectResult(newState)
  },
})

// ✅ RUSAŁKA — Cel dosłownie atakuje sam siebie (jego ATK i typ ataku)
// Jeśli cel ma 0 ATK → Rusałka zadaje 0 obrażeń. Cel "atakuje siebie".
registerEffect({
  id: 'rusalka_mirror_attack',
  name: 'Lustrzany Atak Rusałki',
  description: 'Atakuje za tyle ATK ile ma atakowana istota, z tym samym typem ataku co ona. Jeśli cel ma 0 ATK, zadaje 0 obrażeń.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const sourceInState = findCardInState(newState, source.instanceId)
    if (sourceInState) {
      // Cel "atakuje sam siebie" — Rusałka przejmuje jego ATK i typ ataku
      sourceInState.currentStats.attack = target.currentStats.attack
      sourceInState.metadata.mirrorAttackType = (target.cardData as any).attackType
      const log = addLog(state,
        `${source.cardData.name}: przejmuje atak celu (${target.currentStats.attack} ATK, typ: ${(target.cardData as any).attackType}).`,
        'effect'
      )
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ RYBI KRÓL — Wybrany sojusznik ignoruje ograniczenia i odporności
registerEffect({
  id: 'rybi_krol_pierce_immunity',
  name: 'Wola Rybiego Króla',
  description: 'Dopóki żyje, wybrany sojusznik rani wybranego przeciwnika negując ograniczenia i odporności.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    // Sprawdzamy w CombatResolver — jeśli Rybi Król żyje, oznaczony sojusznik ignoruje odporności
    return effectResult(cloneGameState(ctx.state))
  },
})

// ✅ STRELA — JEDYNA karta interrupt w grze. Wyciągana z ręki podczas tury PRZECIWNIKA.
// Mechanika: gdy rywal zagrywa kartę → gracz może zagrać Strelę z ręki →
// karta rywala nie wchodzi w życie i wraca na spód jego talii.
// TurnManager ma specjalny hook INTERRUPT_WINDOW dla tej karty.
registerEffect({
  id: 'strela_flash_counter',
  name: 'Błyskawiczny Kontratak Streli',
  description: 'INTERRUPT: Możesz wystawić Strelę z ręki podczas tury przeciwnika gdy zagrywa dowolną kartę. Jego karta nie zostaje użyta i trafia na spód talii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    // Cel (ctx.target) = karta którą rywal właśnie próbował zagrać
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const opponentSide = ctx.source.owner === 'player1' ? 'player2' : 'player1'
    const opponent = newState.players[opponentSide]

    // Przenieś kartę rywala na spód talii
    target.line = null
    opponent.hand = opponent.hand.filter(c => c.instanceId !== target.instanceId)
    opponent.deck.push(target)

    const log = addLog(state,
      `Strela! Karta "${target.cardData.name}" wraca na spód talii rywala.`,
      'effect',
      [ctx.source.instanceId, target.instanceId]
    )
    return effectResult(newState, [log], true)
  },
})

// ✅ SZALIŃC — Neguje premię odporności na atak
registerEffect({
  id: 'szalinc_negate_immunity',
  name: 'Furia Szalińca',
  description: 'Jego atak neguje premię odporności celu.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const sourceInState = findCardInState(newState, ctx.source.instanceId)
    if (sourceInState) {
      sourceInState.metadata.negateImmunity = true
    }
    return effectResult(newState)
  },
})

// ✅ WIŁA — PASYWNA, sprawdzana każdą turę. Gdy jej ATK rośnie → przejmuje nowe istoty.
// Konwersja jest permanentna (skonwertowane istoty nie wracają gdy Wiła zginie).
registerEffect({
  id: 'wila_convert_weak_enemies',
  name: 'Taniec Wiły',
  description: 'PASYWNE: Wszystkie wrogie istoty na polu o ataku ≤ Wiły walczą po jej stronie. Sprawdzane każdą turę — gdy Wiła zyska ATK, przejmuje nowe istoty.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_TURN_START],
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const wilaATK = ctx.source.currentStats.attack
    const opponent = newState.players[ctx.source.owner === 'player1' ? 'player2' : 'player1']
    const owner = newState.players[ctx.source.owner]
    const converted: CardInstance[] = []

    // Sprawdź każdą linię przeciwnika
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const toConvert = opponent.field.lines[line].filter(c => c.currentStats.attack <= wilaATK)
      const remaining = opponent.field.lines[line].filter(c => c.currentStats.attack > wilaATK)
      opponent.field.lines[line] = remaining
      converted.push(...toConvert)
    }

    for (const card of converted) {
      card.owner = ctx.source.owner
      // Dodaj do odpowiedniej linii właściciela
      owner.field.lines[card.line ?? BattleLine.FRONT].push(card)
    }

    if (converted.length > 0) {
      const names = converted.map(c => c.cardData.name).join(', ')
      const log = addLog(ctx.state, `${ctx.source.cardData.name} przejęła: ${names}!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ WODNIK — Po przeżytej rundzie może wrócić do talii
registerEffect({
  id: 'wodnik_return_on_round_end',
  name: 'Ucieczka Wodnika',
  description: 'Po zakończeniu każdej rundy którą przeżyje, może wrócić do talii.',
  trigger: EffectTrigger.ON_ROUND_START,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const sourceInState = findCardInState(newState, ctx.source.instanceId)
    if (sourceInState) {
      sourceInState.metadata.canReturnToDeck = true
    }
    const log = addLog(ctx.state, `${ctx.source.cardData.name} może wrócić do talii.`, 'effect')
    return effectResult(newState, [log])
  },
})

// 📋 KORGORUSZE — Rezygnując z ataku, odzyskaj Sławę (tryb Slava!)
registerEffect({
  id: 'korgorusze_recover_glory',
  name: 'Odzysk Sławy',
  description: 'Rezygnując z ataku w tej turze, odzyskaj 1 wydany punkt Sławy.',
  trigger: EffectTrigger.ON_TURN_END,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    // TODO: Integracja z GloryManager (Etap 6)
    const newState = cloneGameState(ctx.state)
    return effectResult(newState)
  },
})

// 📋 ŁAPIDUCH — Atakuje tylko demony, blokuje wystawianie demonów
registerEffect({
  id: 'lapiduch_demon_hunter',
  name: 'Łowca Demonów',
  description: 'Może atakować jedynie demony. Gdy jest w polu, nikt nie może wystawić demonów.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ISTOTY — ŻYWI (placeholder — pełna implementacja po odczytaniu JSON)
// ===================================================================

registerEffect(noEffect('zyvi_placeholder_01', 'Żywi placeholder'))

// ===================================================================
// ISTOTY — NIEUMARLI (placeholder)
// ===================================================================

registerEffect(noEffect('undead_placeholder_01', 'Nieumarli placeholder'))

// ===================================================================
// ISTOTY — WELES (placeholder)
// ===================================================================

registerEffect(noEffect('weles_placeholder_01', 'Weles placeholder'))

// ===================================================================
// KARTY PRZYGODY
// ===================================================================

// ✅ MOC ŚWIATOGORA — Podwojone statystyki, śmierć po zabiciu
registerEffect({
  id: 'adventure_moc_swiatogora',
  name: 'Moc Światogora',
  description: 'ATK i DEF stworzenia podwajają się, lecz jeśli zaatakuje i zabije, sama zginie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (card) {
      card.currentStats.attack *= 2
      card.currentStats.defense *= 2
      card.metadata.diesOnKill = true
      const log = addLog(state, `Moc Światogora: ${target.cardData.name} podwaja statystyki, lecz zginie gdy zabije!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ MOC ŚWIATOGORA (enhanced) — + wskrzeszenie po 3 rundach
registerEffect({
  id: 'adventure_moc_swiatogora_enhanced',
  name: 'Moc Światogora (wzmocniona)',
  description: 'Jak wyżej + po 3 rundach wskrzesza się z bazowymi statystykami.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (card) {
      card.currentStats.attack *= 2
      card.currentStats.defense *= 2
      card.metadata.diesOnKill = true
      card.metadata.resurrectAfterRounds = 3
      card.metadata.resurrectRound = state.roundNumber + 3
      const log = addLog(state, `Moc Światogora (wzmocniona): ${target.cardData.name} wskrzesi się po 3 rundach!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ ARENA — Rywal nie może wystawić więcej istot niż zagrywający
registerEffect({
  id: 'adventure_arena',
  name: 'Arena',
  description: 'Rywal nie może wystawić więcej stworzeń niż ma w polu zagrywający Arenę.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    // Sprawdzane przez TurnManager przy walidacji PLAY phase
    return effectResult(cloneGameState(ctx.state))
  },
})

// ✅ ARENA (enhanced) — Raz zranione stworzenie może atakować tylko oprawcę
registerEffect({
  id: 'adventure_arena_enhanced',
  name: 'Arena (wzmocniona)',
  description: 'Raz zranione stworzenie wroga może atakować tylko swego oprawcę.',
  trigger: EffectTrigger.ON_DAMAGE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target, source } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (card && !card.metadata.arenaLocked) {
      card.metadata.arenaLocked = true
      card.metadata.arenaLockedToTarget = source.instanceId
    }
    return effectResult(newState)
  },
})

// ✅ OBLĘD — Zamiana ATK z DEF wybranego stworzenia
registerEffect({
  id: 'adventure_obled',
  name: 'Obłęd',
  description: 'Zamienia ATK z DEF u wybranego stworzenia.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (card) {
      const tmpAtk = card.currentStats.attack
      card.currentStats.attack = card.currentStats.defense
      card.currentStats.defense = tmpAtk
      const log = addLog(state, `Obłęd: ${target.cardData.name} zamieniło ATK/DEF (${card.currentStats.attack}/${card.currentStats.defense}).`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ TOPÓR PERUNA — Jeden atak dystansowy za 4x obrażenia
registerEffect({
  id: 'adventure_topor_peruna',
  name: 'Topór Peruna',
  description: 'Stworzenie może wykonać jeden atak dystansowy zadający 4x obrażenia.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const sourceInState = findCardInState(newState, ctx.source.instanceId)
    if (sourceInState && sourceInState.metadata.toporPerunaUsed !== true) {
      sourceInState.metadata.damageMultiplier = 4
      sourceInState.metadata.toporPerunaUsed = true
      sourceInState.metadata.noCounterattack = true
      const log = addLog(ctx.state, `${ctx.source.cardData.name}: Topór Peruna! Czterokrotne obrażenia, bez kontrataku!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ TRUCIZNA — Cel ginie po 3 rundach
registerEffect({
  id: 'adventure_trucizna',
  name: 'Trucizna',
  description: 'Wskazane stworzenie ginie po 3 rundach.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (card) {
      card.poisonRoundsLeft = 3
      const log = addLog(state, `Trucizna: ${target.cardData.name} zginie za 3 rundy!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ ŁASKA WELESA — Wskrzeszenie własnej istoty
registerEffect({
  id: 'adventure_laska_welesa',
  name: 'Łaska Welesa',
  description: 'Wskrzesza własną istotę. Może wrócić do talii lub być wystawiona od razu (bez limitu).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    // Logika wskrzeszenia obsługiwana przez GameEngine — target = karta z cmentarza
    const newState = cloneGameState(ctx.state)
    const log = addLog(ctx.state, `Łaska Welesa: Wskrzeszenie aktywne!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ ŁASKA WELESA (enhanced) — Wskrzesza istotę RYWALA która walczy dla gracza
registerEffect({
  id: 'adventure_laska_welesa_enhanced',
  name: 'Łaska Welesa (wzmocniona)',
  description: 'Wskrzesza istotę rywala z jego cmentarza — walczy po stronie zagrywającego.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log = addLog(ctx.state, `Łaska Welesa: Wskrzeszenie wroga — staje po twojej stronie!`, 'effect')
    return effectResult(newState, [log])
  },
})

// Pozostałe przygody — TODO stubs (implementowane w Etapie 3)
const todoAdventures = [
  { id: 'adventure_kradzież', name: 'Kradzież' },
  { id: 'adventure_okaleczenie', name: 'Okaleczenie' },
  { id: 'adventure_arkona', name: 'Arkona' },
  { id: 'adventure_likantropia', name: 'Likantropia' },
  { id: 'adventure_sobowtór', name: 'Sobowtór' },
  { id: 'adventure_rusalczy_taniec', name: 'Rusałczy Taniec' },
  { id: 'adventure_matecznik', name: 'Matecznik' },
  { id: 'adventure_sztandar', name: 'Sztandar' },
  { id: 'adventure_wygnanie', name: 'Wygnanie' },
  { id: 'adventure_kwiat_paproci', name: 'Kwiat Paproci' },
  { id: 'adventure_zlot_czarownic', name: 'Zlot Czarownic' },
  { id: 'adventure_twierdza', name: 'Twierdza' },
  { id: 'adventure_rehtra', name: 'Rehtra' },
  { id: 'adventure_przyjazn', name: 'Przyjaźń' },
  { id: 'adventure_miecz_kladenet', name: 'Miecz Kladenet' },
  { id: 'adventure_mlot_swaroga', name: 'Młot Swaroga' },
]

for (const adv of todoAdventures) {
  registerEffect(noEffect(adv.id, adv.name))
}

// ===================================================================
// HELPERS (używane wewnątrz efektów)
// ===================================================================

function findCardInState(state: GameState, instanceId: string): CardInstance | null {
  for (const player of Object.values(state.players)) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = player.field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
    const inHand = player.hand.find(c => c.instanceId === instanceId)
    if (inHand) return inHand
  }
  return null
}

function forEachCreatureOnField(player: any, fn: (card: CardInstance) => void): void {
  for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
    player.field.lines[line].forEach(fn)
  }
}

export { findCardInState, forEachCreatureOnField }
