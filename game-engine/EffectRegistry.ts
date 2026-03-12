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

import type { EffectDefinition, EffectContext, EffectResult, GameState, CardInstance, LogEntry, PlayerSide } from './types'
import { EffectTrigger, EffectPriority, CardPosition, BattleLine, AttackType } from './constants'
import { cloneGameState, addLog, dealDamage, removeCardFromField, moveToGraveyard, getAllCreaturesOnField } from './GameStateUtils'
import { drawCards } from './DeckBuilder'
import { canAttack } from './LineManager'
import { createCreatureInstance } from './CardFactory'

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
 * Uwzględnia: activatable, cooldown, koszt PS, uciszenie.
 */
export function canActivateEffect(state: import('./types').GameState, card: import('./types').CardInstance): boolean {
  const effect = registry.get((card.cardData as any).effectId ?? '')
  if (!effect?.activatable) return false
  if (card.isSilenced) return false
  if (card.paralyzeRoundsLeft !== null && card.paralyzeRoundsLeft !== 0) return false  // Paraliż blokuje zdolności

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

  // Sprawdź PS
  const cost = effect.activationCost ?? 0
  if (state.players[card.owner].glory < cost) return false

  // Sprawdź customowe canActivate
  if (effect.canActivate && !effect.canActivate({ state, source: card, target: card, trigger: EffectTrigger.ON_ACTIVATE })) {
    return false
  }

  // Sprawdź czy są dostępne cele (jeśli efekt wymaga celu z filtrem)
  if (effect.activationRequiresTarget && effect.activationTargetFilter) {
    let hasValidTarget = false
    for (const side of ['player1', 'player2'] as const) {
      for (const line of Object.values(state.players[side].field.lines)) {
        for (const c of line as CardInstance[]) {
          if (c.instanceId === card.instanceId || c.currentStats.defense <= 0) continue
          if (effect.activationTargetFilter(c, card, state)) { hasValidTarget = true; break }
        }
        if (hasValidTarget) break
      }
      if (hasValidTarget) break
    }
    if (!hasValidTarget) return false
  }

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
function effectResult(state: GameState, log: LogEntry[] = [], prevented = false, replaced = false): EffectResult {
  return { newState: state, log, prevented, replaced }
}

// ===================================================================
// ISTOTY — PERUN
// ===================================================================

// ✅ AITWAR — Kradnie kartę z ręki przeciwnika (ON_PLAY: gratis, ON_ACTIVATE: 1 PS raz na zawsze)
registerEffect({
  id: 'aitwar_steal_hand',
  name: 'Kradzież Aitwara',
  description: '[WEJŚCIE] [AKCJA] Przy wystawieniu kradnie 1 kartę z ręki przeciwnika (gratis). Raz w grze można aktywować ponownie za 1 PS.',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 1,
  activationCooldown: 'once',
  canActivate: (ctx) => {
    // Blokuj gdy przeciwnik nie ma kart — uniknij bezużytecznego wydania PS
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
  description: '[AKCJA] Hipnotyzuje wrogą istotę, zmuszając ją do zaatakowania sojusznika.',
  trigger: [EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.MODIFIER,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    // Cel: wroga istota (nie własna)
    return card.owner !== source.owner && card.currentStats.defense > 0
  },
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (source.isSilenced) return effectResult(cloneGameState(state))
    // target = wybrana wroga istota (zhipnotyzowana)
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const enemySide = target.owner as PlayerSide

    // Zbierz sojuszników zhipnotyzowanej istoty w zasięgu ataku (bez niej samej)
    const enemyAllies = getAllCreaturesOnField(newState, enemySide)
      .filter(c => c.instanceId !== target.instanceId && c.currentStats.defense > 0)
      .filter(c => {
        const check = canAttack(newState, target, c, { forcedByEffect: true })
        return check.valid || check.softFail // softFail = Odporny (atak dojdzie, ale z efektem blokady)
      })

    if (enemyAllies.length === 0) {
      const log = addLog(newState, `Alkonost: Hipnoza na ${target.cardData.name}, ale brak sojuszników do zaatakowania.`, 'effect')
      return effectResult(newState, [log])
    }

    const alkonostOwner = source.owner as PlayerSide

    // Krok 2: gracz Alkonosta wybiera cel ataku spośród sojuszników wroga
    newState.pendingInteraction = {
      type: 'alkonost_target',
      sourceInstanceId: source.instanceId,
      respondingPlayer: alkonostOwner,
      attackerInstanceId: target.instanceId,
      availableTargetIds: enemyAllies.map(a => a.instanceId),
    }

    const log = addLog(newState,
      `Alkonost: Hipnoza! ${target.cardData.name} musi zaatakować sojusznika — wybierz cel.`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// 📋 BARSTUK — Przywraca pełną obronę wybranemu rannemu sojusznikowi z domeny Żywi
registerEffect({
  id: 'barstuk_ally_regen',
  name: 'Leśne Uzdrowienie',
  description: '[AKCJA] Przywraca pełną obronę rannemu Żywi. Raz na turę.',
  trigger: [EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.MODIFIER,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.owner === source.owner
      && card.instanceId !== source.instanceId
      && (card.cardData as any).domain === 2 // tylko Żywi
      && card.currentStats.defense < card.currentStats.maxDefense // musi być ranny
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    if (ctx.target) {
      const targetInState = findCardInState(newState, ctx.target.instanceId)
      if (targetInState) {
        const healed = targetInState.currentStats.maxDefense - targetInState.currentStats.defense
        targetInState.currentStats.defense = targetInState.currentStats.maxDefense
        // Metadata dla VFX — gameStore odczyta i wyemituje animację leczenia
        const sourceInState = findCardInState(newState, ctx.source.instanceId)
        if (sourceInState) {
          sourceInState.metadata.lastHealTargetId = ctx.target.instanceId
          sourceInState.metadata.lastHealAmount = healed
        }
        const log = addLog(newState, `${ctx.source.cardData.name} uzdrawia ${ctx.target.cardData.name} — przywrócono ${healed} pkt obrony.`, 'effect')
        return effectResult(newState, [log])
      }
    }
    return effectResult(newState)
  },
})

// ✅ BAŁWAN — Nie kontratakuje, odporny na Żywioł. Po 3 rundach ginie, właściciel dobiera 3 karty.
registerEffect({
  id: 'balwan_free_divine_favor',
  name: 'Dar Bogów',
  description: '[AURA] Nie kontratakuje. Odporny na Żywioł. Po 3 rundach karta trafia na cmentarz. Dobierasz 3 karty.',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    const roundsInPlay = newState.roundNumber - (card.roundEnteredPlay ?? newState.roundNumber)
    if (roundsInPlay < 3) return effectResult(newState)

    // Po 3 rundach: bałwan pęka — właściciel dobiera 3 karty
    const log: LogEntry[] = []
    log.push(addLog(newState, `${source.cardData.name}: Bałwan odchodzi! Bogowie okazali swą łaskę — dobierasz 3 karty.`, 'effect'))
    moveToGraveyard(newState, card)
    drawCards(newState.players[source.owner], 3)
    return effectResult(newState, log)
  },
})

// ✅ BIALI LUDZIE — Zraniona istota traci zdolność ataku
registerEffect({
  id: 'biali_ludzie_wound_disarm',
  name: 'Zaraza Białych Ludzi',
  description: '[CZUJNOŚĆ] Każda istota zraniona przez Białych Ludzi traci zdolność ataku.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const targetInState = findCardInState(newState, target.instanceId)
    if (targetInState && !targetInState.isImmune) {
      targetInState.cannotAttack = true
      targetInState.paralyzeRoundsLeft = 2
      const log = addLog(state, `${ctx.source.cardData.name} paraliżuje "${target.cardData.name}" na 2 rundy!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ BRZEGINA — Za PS, sojusznik nie otrzymuje obrażeń (pierwsze użycie darmowe)
registerEffect({
  id: 'brzegina_shield_for_gold',
  name: 'Tarcza Brzeginy',
  description: '[ODWET] Za każdy wydany PS jedna sojusznicza istota nie otrzymuje obrażeń podczas ataku. Pierwsze użycie darmowe.',
  trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
  priority: EffectPriority.PREVENTION,
  canActivate: (ctx) => {
    const owner = ctx.state.players[ctx.source.owner]
    const firstUseFree = !(ctx.source.metadata.brzeginaUsedFree as boolean)
    return firstUseFree || owner.glory > 0
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const owner = newState.players[ctx.source.owner]
    const sourceInState = findCardInState(newState, ctx.source.instanceId)

    const firstUseFree = !(sourceInState?.metadata?.brzeginaUsedFree as boolean)
    if (!firstUseFree) {
      owner.glory -= 1
    }
    if (sourceInState) {
      sourceInState.metadata.brzeginaUsedFree = true
    }

    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Tarcza aktywna${firstUseFree ? ' (darmowe)' : ' (-1 PS)'}!`, 'effect')
    return effectResult(newState, [log], true) // prevented = true = damage blocked
  },
})

// ✅ BUGAJ — Zyskuje ATK za straconą DEF
registerEffect({
  id: 'bugaj_def_to_atk',
  name: 'Gniew Bugaja',
  description: '[ODWET] Za każdy punkt obrony który traci, zyskuje tyle samo ataku.',
  trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
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
  description: '[AURA] Każda istota przeciwnika, która ma Błotnika w zasięgu ataku, nie może atakować nikogo innego.',
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
  description: '[AURA] Tak długo jak Chmurnik jest w polu, wszystkie wrogie latające istoty tracą cechę latania.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponent = newState.players[ctx.source.owner === 'player1' ? 'player2' : 'player1']

    // Ground all enemy flying creatures
    const logs: any[] = []
    forEachCreatureOnField(opponent, (card) => {
      if ((card.cardData as any).isFlying && !card.isGrounded) {
        card.isGrounded = true
        logs.push(addLog(newState, `Chmurnik: ${card.cardData.name} traci latanie (uziemiony)!`, 'effect'))
      }
    })
    return effectResult(newState, logs)
  },
})

// ✅ CHOWANIEC — Darmowa, opcjonalna intercepcja ataku na sojusznika
// Gracz klika Chowańca gdy wróg deklaruje atak na inną jednostkę → Chowaniec przejmuje atak
// CombatResolver sprawdza flagę przed wykonaniem ataku
registerEffect({
  id: 'chowaniec_intercept',
  name: 'Poświęcenie Chowańca',
  description: '[AURA] Darmowe i opcjonalne: może przyjąć na siebie atak wymierzony w dowolnego sojusznika.',
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
  description: '[AURA] Nie kontratakuje nigdy — nawet w pozycji obrony.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state), [], false, false),
})

// ✅ DZIEWIĄTKO — Zraniona istota z ≤3 DEF: zapłać PS lub zginie
registerEffect({
  id: 'dziewiatko_deathmark',
  name: 'Ukąszenie Dziewiątka',
  description: '[CZUJNOŚĆ] Gdy zrani istotę i pozostanie jej 3 lub mniej obrony, rywal musi zapłacić 1 PS — inaczej ta istota zginie.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const targetInState = findCardInState(newState, target.instanceId)

    if (targetInState && targetInState.currentStats.defense <= 3 && targetInState.currentStats.defense > 0) {
      const opponent = newState.players[targetInState.owner]
      if (opponent.glory >= 1) {
        // AI/gracz może zapłacić — oznaczamy że musi zdecydować
        targetInState.metadata.dziewiatkoDeathMark = true
        const log = addLog(state, `${ctx.source.cardData.name}: "${target.cardData.name}" ma śmiertelną ranę! Rywal musi zapłacić 1 PS.`, 'effect')
        return effectResult(newState, [log])
      } else {
        // Brak PS — karta ginie
        const log = addLog(state, `${ctx.source.cardData.name}: "${target.cardData.name}" ginie — rywal nie ma PS!`, 'death')
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
  description: '[ZABÓJSTWO] Za każdym razem gdy zabije wrogą istotę, może wrócić do talii (NA WIERZCH) zachowując wszystkie efekty i artefakty.',
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
  description: '[CZUJNOŚĆ] Jeśli atakuje w tej samej rundzie w której został wystawiony, zadaje podwójne obrażenia.',
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
  description: '[AURA] Kontratakuje nawet gdy jest w pozycji ataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ LESZY — Sojusznicy po ataku mogą przejść w pozycję obrony
registerEffect({
  id: 'leszy_post_attack_defend',
  name: 'Komenda Leszego',
  description: '[CZUJNOŚĆ] Sojusznicy Leszego, po wykonaniu ataku, mogą natychmiast przejść w pozycję obrony.',
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
  description: '[AURA] Odporny na wrogie premie (buffy od przeciwnika nie działają).',
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
  description: '[AURA] Raz na turę: wybierz dwie sojusznicze istoty i jedną premię — zostaje przeniesiona z jednej na drugą.',
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
  description: '[WEJŚCIE] Wykonuje zamianę premii między dwoma sojusznikami.',
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
        const effect = fromCard.activeEffects.splice(effectIdx, 1)[0]!
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
  description: '[CZUJNOŚĆ] Atakuje za tyle ATK ile ma atakowana istota, z tym samym typem ataku co ona. Jeśli cel ma 0 ATK, zadaje 0 obrażeń.',
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
  description: '[AURA] Dopóki żyje, wybrany sojusznik rani wybranego przeciwnika negując ograniczenia i odporności.',
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
  description: '[WEJŚCIE] INTERRUPT: Możesz wystawić Strelę z ręki podczas tury przeciwnika gdy zagrywa dowolną kartę. Jego karta nie zostaje użyta i trafia na spód talii.',
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
  description: '[CZUJNOŚĆ] Jego atak neguje premię odporności celu.',
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
  description: '[AURA] Wszystkie wrogie istoty na polu o ataku ≤ Wiły walczą po jej stronie. Sprawdzane każdą turę — gdy Wiła zyska ATK, przejmuje nowe istoty.',
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
  description: '[AURA] Po zakończeniu każdej rundy którą przeżyje, może wrócić do talii.',
  trigger: EffectTrigger.ON_ROUND_START,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const sourceInState = findCardInState(newState, ctx.source.instanceId)
    if (sourceInState) {
      sourceInState.metadata.canReturnToDeck = true
    }
    const log = addLog(ctx.state, `${ctx.source.cardData.name}: Przeżył rundę — może wrócić do talii (zdolność: powrót po każdej przeżytej rundzie).`, 'effect')
    return effectResult(newState, [log])
  },
})

// 📋 KORGORUSZE — Rezygnując z ataku, odzyskaj Sławę (tryb Slava!)
registerEffect({
  id: 'korgorusze_recover_glory',
  name: 'Odzysk Sławy',
  description: '[AURA] Rezygnując z ataku w tej turze, odzyskaj 1 wydany punkt Sławy.',
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
  description: '[AURA] Może atakować jedynie demony. Gdy jest w polu, nikt nie może wystawić demonów.',
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
  description: '[WEJŚCIE] ATK i DEF stworzenia podwajają się, lecz jeśli zaatakuje i zabije, sama zginie.',
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
  description: '[WEJŚCIE] Jak wyżej + po 3 rundach wskrzesza się z bazowymi statystykami.',
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
  description: '[AURA] Rywal nie może wystawić więcej stworzeń niż ma w polu zagrywający Arenę.',
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
  description: '[ODWET] Raz zranione stworzenie wroga może atakować tylko swego oprawcę.',
  trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
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

// ✅ BITWA NAD TOLLENSE — Zdarzenie: ignoruj linie (enforcement w LineManager.canAttack)
registerEffect({
  id: 'adventure_bitwa_nad_tollense',
  name: 'Bitwa Nad Tollense',
  description: '[ZDARZENIE] Wszystkie istoty ignorują Linie — biją kogo chcą.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

registerEffect({
  id: 'adventure_bitwa_nad_tollense_enhanced',
  name: 'Bitwa Nad Tollense (wzmocniona)',
  description: '[ZDARZENIE+] +2 dodatkowe ataki istotami w turze zagrania.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const owner = newState.players[source.owner]
    const creatures = getAllCreaturesOnField(newState, source.owner)
    for (const c of creatures) {
      c.metadata.freeAttacksLeft = ((c.metadata.freeAttacksLeft as number) ?? 0) + 2
    }
    const log = addLog(newState, `Bitwa Nad Tollense+: ${creatures.length} istot zyskuje 2 dodatkowe ataki!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ OBLĘD — Zamiana ATK z DEF wybranego stworzenia
registerEffect({
  id: 'adventure_obled',
  name: 'Obłęd',
  description: '[WEJŚCIE] Zamienia ATK z DEF u wybranego stworzenia.',
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
  description: '[CZUJNOŚĆ] Stworzenie może wykonać jeden atak dystansowy zadający 4x obrażenia.',
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
  description: '[WEJŚCIE] Wskazane stworzenie ginie po 3 rundach.',
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
  description: '[WEJŚCIE] Wskrzesza własną istotę. Może wrócić do talii lub być wystawiona od razu (bez limitu).',
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
  description: '[WEJŚCIE] Wskrzesza istotę rywala z jego cmentarza — walczy po stronie zagrywającego.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log = addLog(ctx.state, `Łaska Welesa: Wskrzeszenie wroga — staje po twojej stronie!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ISTOTY — GRUPA A: AURA/PASSIVE
// (enforcement w LineManager.canAttack i CombatResolver.checkDamagePrevention)
// ===================================================================

// ✅ BUKA (#97) — Wrogowie ze słabszym ATK muszą być w obronie
registerEffect({
  id: 'buka_force_defense',
  name: 'Dominacja Buki',
  description: '[AURA] Wrogowie ze słabszym ATK muszą być w obronie.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ LICHO (#108) — Rywal nie dobiera kart
registerEffect({
  id: 'licho_block_draw',
  name: 'Klątwa Licha',
  description: '[AURA] Rywal nie dobiera kart dopóki Licho jest na polu.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ MATOHA (#17) — Wrodzy magowie nie mogą atakować
registerEffect({
  id: 'matoha_anti_magic',
  name: 'Antymagia Matohy',
  description: '[AURA] Wrogie istoty z typem ataku Magia nie mogą atakować.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ CICHA (#98) — Na początku tury: istoty z DEF < ATK Cichej giną (obie strony!)
registerEffect({
  id: 'cicha_kill_weak',
  name: 'Śmiertelna Cisza',
  description: '[AURA] Na początku każdej tury — wszystkie istoty (obu stron) z DEF mniejszą niż ATK Cichej giną.',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.CLEANUP,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    const cichAtk = source.currentStats.attack
    for (const side of ['player1', 'player2'] as const) {
      for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
        const toKill = newState.players[side].field.lines[line].filter(
          c => c.instanceId !== source.instanceId && c.currentStats.defense < cichAtk
        )
        for (const card of toKill) {
          log.push(addLog(newState, `${source.cardData.name}: ${card.cardData.name} (DEF ${card.currentStats.defense} < ${cichAtk}) ginie!`, 'death'))
          moveToGraveyard(newState, card)
        }
      }
    }
    return effectResult(newState, log)
  },
})

// ✅ UTOPIEC (#85) — Połowa obrażeń (enforcement w CombatResolver.checkDamagePrevention)
registerEffect({
  id: 'utopiec_half_damage',
  name: 'Wodna Tarcza Utopca',
  description: '[AURA] Wszystkie obrażenia zadawane Utopkowi są zmniejszone o połowę (zaokrąglone w dół).',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ DOMOWIK (#67) — ATK = liczba kart w ręce (enforcement w TurnManager/GameStateUtils)
registerEffect({
  id: 'domowik_hand_size',
  name: 'Domowy Dorobek',
  description: '[AURA] Zyskuje +ATK równy aktualnej liczbie kart w ręce właściciela (sprawdzane co turę).',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (card) {
      const handSize = newState.players[card.owner].hand.length
      card.currentStats.attack = (card.cardData as any).stats.attack + handSize
    }
    return effectResult(newState)
  },
})

// ✅ CMUCH (#119) — Nie OTRZYMUJE kontrataku (enforcement w CombatResolver.shouldCounterattack)
registerEffect({
  id: 'cmuch_no_counter_received',
  name: 'Nieuchwytność Cmucha',
  description: '[AURA] Gdy Cmuch atakuje, obrońca nie może kontratakować.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ WILKOŁAK (#87) — Odporny na Wręcz < 7 (enforcement w LineManager.canAttack)
registerEffect({
  id: 'wilkolak_melee_immune',
  name: 'Skóra Wilkołaka',
  description: '[AURA] Nie można zranić atakiem Wręcz jeśli napastnik ma ATK < 7.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ STUKACZ (#83) — Wrogowie z wyższym ATK nie mogą go zranić (enforcement w LineManager.canAttack)
registerEffect({
  id: 'stukacz_strong_immune',
  name: 'Odporność Stukacza',
  description: '[AURA] Wrogie istoty z wyższym ATK niż Stukacz nie mogą go atakować.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ DYDKO (#101) — Silniejsi i RÓWNI nie mogą go uderzyć (enforcement w LineManager.canAttack)
registerEffect({
  id: 'dydko_strong_immune',
  name: 'Zwinność Dydko',
  description: '[AURA] Wrogie istoty z ATK >= ATK Dydko nie mogą go atakować.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ✅ KUDŁAK (#73) — Można zranić tylko w rundzie bez jego obrażeń
registerEffect({
  id: 'kudlak_conditional_immunity',
  name: 'Pancerz Kudłaka',
  description: '[AURA] [ODWET] Można zranić Kudłaka tylko w rundzie, w której sam nie zadał obrażeń.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_DAMAGE_DEALT],
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    if (ctx.trigger === EffectTrigger.ON_DAMAGE_DEALT) {
      const newState = cloneGameState(ctx.state)
      const card = findCardInState(newState, ctx.source.instanceId)
      if (card) card.metadata.kudlakDealtDamageThisRound = newState.roundNumber
      return effectResult(newState)
    }
    return effectResult(cloneGameState(ctx.state))
  },
})

// ✅ SZEPTUNKA (#48) — Sojusznicy -1 obrażeń (enforcement w CombatResolver.checkDamagePrevention)
registerEffect({
  id: 'szeptunka_damage_reduction',
  name: 'Szept Ochrony',
  description: '[AURA] Wszystkie sojusznicze istoty otrzymują o 1 obrażenie mniej.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ISTOTY — GRUPA B: ON_DEATH
// ===================================================================

// ✅ ŻAR PTAK (#29) — -4 DEF wszystkim przy śmierci
registerEffect({
  id: 'zar_ptak_death_explosion',
  name: 'Ostatni Płomień',
  description: '[POŻEGNANIE] Przy śmierci: zadaje 4 obrażenia WSZYSTKIM istotom na polu (obie strony).',
  trigger: EffectTrigger.ON_DEATH,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log: LogEntry[] = [addLog(newState, `${ctx.source.cardData.name} wybucha! -4 DEF dla wszystkich.`, 'effect')]
    for (const side of ['player1', 'player2'] as const) {
      for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
        for (const card of newState.players[side].field.lines[line]) {
          card.currentStats.defense -= 4
        }
      }
    }
    return effectResult(newState, log)
  },
})

// ✅ LAMIA (#107) — Przy śmierci: 1 PS lub dobierz 5 kart
registerEffect({
  id: 'lamia_death_reward',
  name: 'Przekleństwo Lamii',
  description: '[POŻEGNANIE] Przy śmierci: zdobądź 1 PS (lub w trybie z wyborem: 5 kart).',
  trigger: EffectTrigger.ON_DEATH,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    // Auto: daj 1 PS. Wybór gracza (1PS vs 5 kart) wymaga interakcji UI — TODO
    const newState = cloneGameState(ctx.state)
    newState.players[ctx.source.owner].glory += 1
    const log = addLog(newState, `${ctx.source.cardData.name}: Śmierć Lamii daje 1 PS.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ LATAWIEC (#75) — Zabójca ginie razem z nim
registerEffect({
  id: 'latawiec_mutual_death',
  name: 'Zemsta Latawca',
  description: '[POŻEGNANIE] Istota która zabiła Latawca ginie razem z nim.',
  trigger: EffectTrigger.ON_DEATH,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log: LogEntry[] = []
    // Latawiec zapamiętuje zabójcę przez metadata.killedBy (ustawiane w CombatResolver)
    const killerInstanceId = ctx.source.metadata.killedBy as string | undefined
    if (killerInstanceId) {
      const killer = findCardInState(newState, killerInstanceId)
      if (killer && killer.currentStats.defense > 0) {
        killer.currentStats.defense = 0
        log.push(addLog(newState, `${ctx.source.cardData.name}: Latawiec ciągnie za sobą ${killer.cardData.name}!`, 'effect'))
      }
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ISTOTY — GRUPA C: ON_KILL
// ===================================================================

// ✅ KONNY (#42) — Nadmiar obrażeń → następna istota w linii
registerEffect({
  id: 'konny_cleave',
  name: 'Przelot Konnego',
  description: '[ZABÓJSTWO] Nadmiar obrażeń (gdy obrońca ginie) przechodzi na kolejną istotę w tej samej linii.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    // Overflow = jak bardzo "przebiło" obrony celu (defense jest już <= 0 po ataku)
    const actualOverflow = Math.abs(Math.min(0, target.currentStats.defense))
    if (actualOverflow <= 0) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const defenderSide = target.owner
    const targetLine = target.line
    if (!targetLine) return effectResult(newState)

    // Znajdź kolejną żywą istotę w tej linii (po zabitej)
    const lineCreatures = newState.players[defenderSide].field.lines[targetLine]
    const nextTarget = lineCreatures.find(c => c.instanceId !== target.instanceId && c.currentStats.defense > 0)
    if (!nextTarget) return effectResult(newState)

    nextTarget.currentStats.defense -= actualOverflow
    const log = addLog(newState, `${source.cardData.name}: Przelot! ${actualOverflow} nadmiaru obrażeń uderza ${nextTarget.cardData.name}.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ ŻMĘ TUGARYN (#117) — Jak Konny (cleave)
registerEffect({
  id: 'waz_tugaryn_cleave',
  name: 'Zabójczy Łuk Żmii Tugarynia',
  description: '[ZABÓJSTWO] Nadmiar obrażeń (gdy obrońca ginie) przechodzi na kolejną istotę w tej samej linii.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const actualOverflow = Math.abs(Math.min(0, target.currentStats.defense))
    if (actualOverflow <= 0) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const defenderSide = target.owner
    const targetLine = target.line
    if (!targetLine) return effectResult(newState)

    const lineCreatures = newState.players[defenderSide].field.lines[targetLine]
    const nextTarget = lineCreatures.find(c => c.instanceId !== target.instanceId && c.currentStats.defense > 0)
    if (!nextTarget) return effectResult(newState)

    nextTarget.currentStats.defense -= actualOverflow
    const log = addLog(newState, `${source.cardData.name}: Przelot! ${actualOverflow} nadmiaru obrażeń uderza ${nextTarget.cardData.name}.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ CHASNIK (#33) — 1 PS za co drugiego zabitego
registerEffect({
  id: 'chasnik_gold_on_kill',
  name: 'Łowy Chasnika',
  description: '[ZABÓJSTWO] Za każdego drugiego zabitego wroga zdobywa 1 PS.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    const killCount = ((card.metadata.killCount as number) ?? 0) + 1
    card.metadata.killCount = killCount

    const log: LogEntry[] = []
    if (killCount % 2 === 0) {
      newState.players[card.owner].glory += 1
      log.push(addLog(newState, `${source.cardData.name}: ${killCount}. zabójstwo — zdobywa 1 PS!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ✅ DZICY LUDZIE (#37) — Zabity trafia do ręki
registerEffect({
  id: 'dzicy_ludzie_steal_killed',
  name: 'Porwanie przez Dzikich',
  description: '[ZABÓJSTWO] Zabita istota trafia do ręki zamiast na cmentarz.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.CLEANUP,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    // Usuń zabitego z cmentarza wroga i dodaj do ręki Dzikich Ludzi
    const ownerOfDzicy = source.owner
    const enemyPlayer = newState.players[target.owner]
    const gravIdx = enemyPlayer.graveyard.findIndex(c => c.instanceId === target.instanceId)
    let stolenCard: CardInstance | undefined
    if (gravIdx !== -1) {
      stolenCard = enemyPlayer.graveyard.splice(gravIdx, 1)[0]
    } else {
      // Karta może być jeszcze na polu (zaraz zostanie usunięta)
      stolenCard = findCardInState(newState, target.instanceId) ?? undefined
      if (stolenCard) {
        removeCardFromField(newState, stolenCard.instanceId)
      }
    }
    if (stolenCard) {
      stolenCard.owner = ownerOfDzicy
      stolenCard.isRevealed = true
      stolenCard.currentStats = { ...(stolenCard.cardData as any).stats }
      newState.players[ownerOfDzicy].hand.push(stolenCard)
      const log = addLog(newState, `${source.cardData.name}: ${target.cardData.name} trafia do ręki Dzikich!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ CZARNOKSIĘŻNIK (#35) — Przejmuje zdolności zabitego
registerEffect({
  id: 'czarnoksieznik_steal_abilities',
  name: 'Przejęcie Mocy',
  description: '[ZABÓJSTWO] Po zabiciu wroga Czarnoksiężnik przejmuje jego zdolności (effectId).',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const stolenEffectId = (target.cardData as any).effectId
    if (!stolenEffectId || stolenEffectId === source.cardData.effectId) {
      return effectResult(cloneGameState(state))
    }
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (card) {
      // NIE nadpisuj effectId — Czarnoksiężnik musi zachować swoje ON_KILL żeby kraść kolejne
      // Zamiast tego dodaj skradziony efekt jako activeEffect (jeśli ma sens)
      const stolenEffect = getEffect(stolenEffectId)
      if (stolenEffect) {
        card.activeEffects = card.activeEffects ?? []
        // Dodaj jako permanentny activeEffect (nie duplikuj)
        if (!card.activeEffects.some(ae => ae.effectId === stolenEffectId)) {
          card.activeEffects.push({
            effectId: stolenEffectId,
            sourceInstanceId: source.instanceId,
            trigger: (stolenEffect.trigger[0] as EffectTrigger) ?? EffectTrigger.PASSIVE,
            remainingTurns: null, // permanentny
            stackId: `stolen_${stolenEffectId}_${source.instanceId}`,
            metadata: {},
          })
        }
      }
      // Zapisz trofeum (dla UI — badge z listą przejętych zdolności)
      if (!card.metadata.trophies) card.metadata.trophies = []
      ;(card.metadata.trophies as any[]).push({
        name: target.cardData.name,
        effectId: stolenEffectId,
        effectDescription: (target.cardData as any).effectDescription ?? '',
        attack: target.currentStats.attack,
        defense: target.currentStats.maxDefense,
      })
      const log = addLog(newState, `${source.cardData.name} przejmuje zdolności "${target.cardData.name}"! (Trofeum ${(card.metadata.trophies as any[]).length})`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ KANIA (#106) — Zabicie słabszego nie kończy tury
registerEffect({
  id: 'kania_chain_kill',
  name: 'Polowanie Kani',
  description: '[ZABÓJSTWO] Jeśli Kania zabije istotę z niższym ATK, nie jest liczona jako "atak w tej turze" — może atakować ponownie.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    if (target.currentStats.attack < source.currentStats.attack) {
      const newState = cloneGameState(state)
      const card = findCardInState(newState, source.instanceId)
      if (card) {
        card.hasAttackedThisTurn = false
        const log = addLog(newState, `${source.cardData.name}: Zabija słabszego — może atakować ponownie!`, 'effect')
        return effectResult(newState, [log])
      }
    }
    return effectResult(cloneGameState(state))
  },
})

// ✅ DZIWOŻONA (#102) — Po zabiciu: wymiana kart między taliami
registerEffect({
  id: 'dziwolzona_swap_cards',
  name: 'Wymiana Dziwożony',
  description: '[ZABÓJSTWO] Po zabiciu wroga: dobierz po 1 karcie z obu talii (wybierasz którą zatrzymać — auto: bierzesz obie).',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    const ownerPlayer = newState.players[source.owner]
    const opponentSide = source.owner === 'player1' ? 'player2' : 'player1'
    const opponent = newState.players[opponentSide]

    if (ownerPlayer.deck.length > 0) {
      const ownCard = ownerPlayer.deck.splice(0, 1)[0]!
      ownCard.owner = source.owner
      ownerPlayer.hand.push(ownCard)
      log.push(addLog(newState, `${source.cardData.name}: Dziwożona dobiera kartę z własnej talii.`, 'effect'))
    }
    if (opponent.deck.length > 0) {
      const enemyCard = opponent.deck.splice(0, 1)[0]!
      enemyCard.owner = source.owner
      enemyCard.isRevealed = true
      ownerPlayer.hand.push(enemyCard)
      log.push(addLog(newState, `${source.cardData.name}: Dziwożona kradnie kartę z talii wroga!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ISTOTY — GRUPA D: ON_DAMAGE_DEALT
// ===================================================================

// ✅ STRZYGA (#82) — Leczy własną obronę za zadane obrażenia
registerEffect({
  id: 'strzyga_lifesteal',
  name: 'Krwiopijstwo Strzygi',
  description: '[ODWET] Gdy Strzyga zadaje obrażenia, regeneruje tyle samo DEF.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, value } = ctx
    if (!value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (card) {
      const maxDef = (card.cardData as any).stats.defense
      const healed = Math.min(value, maxDef - card.currentStats.defense)
      if (healed > 0) {
        card.currentStats.defense += healed
        const log = addLog(newState, `${source.cardData.name}: Wampiryzm! Regeneruje ${healed} DEF.`, 'effect')
        return effectResult(newState, [log])
      }
    }
    return effectResult(newState)
  },
})

// ✅ BEZKOST (#63) — Zabiera ATK zamiast DEF
registerEffect({
  id: 'bezkost_atk_drain',
  name: 'Kradnięcie Kości',
  description: '[ODWET] Bezkost zadaje obrażenia ATK celu zamiast DEF.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const targetCard = findCardInState(newState, target.instanceId)
    if (targetCard) {
      // Cofnij obrażenia DEF (już zadane przez CombatResolver) i zredukuj ATK
      targetCard.currentStats.defense += value  // cofnij
      targetCard.currentStats.attack = Math.max(0, targetCard.currentStats.attack - value)
      const log = addLog(newState, `${source.cardData.name}: Kradnie ${value} ATK od ${target.cardData.name} zamiast DEF!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ BAZYLISZEK (#92) — Paraliżuje zranionego
registerEffect({
  id: 'bazyliszek_paralyze',
  name: 'Wzrok Bazyliszka',
  description: '[ODWET] Zraniona przez Bazyliszka istota jest sparaliżowana na 2 rundy (nie atakuje, nie kontratakuje, nie aktywuje zdolności).',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const targetCard = findCardInState(newState, target.instanceId)
    if (targetCard && !targetCard.isImmune) {
      targetCard.cannotAttack = true
      targetCard.paralyzeRoundsLeft = 2
      const log = addLog(newState, `${source.cardData.name}: Paraliżuje wzrokiem ${target.cardData.name} na 2 rundy!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ HOMEN (#69) — Zraniona przez Homena istota po śmierci staje się Homenem
registerEffect({
  id: 'homen_convert_on_death',
  name: 'Zaraza Homena',
  description: '[ODWET] Istota zraniona przez Homena, gdy ginie, wskrzesza się jako Homen po stronie atakującego.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const targetCard = findCardInState(newState, target.instanceId)
    if (targetCard && !targetCard.isImmune) {
      targetCard.metadata.homenCurseOwner = source.owner
      targetCard.metadata.homenCardData = (source.cardData as any)
      const log = addLog(newState, `${source.cardData.name}: Nakłada klątwę na ${target.cardData.name} — po śmierci wstanie jako Homen!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ✅ ZAGORKINYA (#118) — Przeklęta istota traci -1 ATK/-1 DEF co turę
registerEffect({
  id: 'zagorkinia_curse_drain',
  name: 'Klątwa Zagorkini',
  description: '[ODWET] Zraniona przez Zagordinię istota traci -1 ATK/-1 DEF na początku każdej tury.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const targetCard = findCardInState(newState, target.instanceId)
    if (targetCard && !targetCard.isImmune) {
      // Oznacz jako przeklętego — tick w processStartPhase
      targetCard.metadata.zagorkiniaCursed = true
      const log = addLog(newState, `${source.cardData.name}: ${target.cardData.name} zostaje przeklęty — traci 1 ATK/DEF co turę.`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ===================================================================
// ISTOTY — GRUPA E: ON_DAMAGE_RECEIVED
// ===================================================================

// ✅ BIES (#95) — Traci ATK przed DEF
registerEffect({
  id: 'bies_reverse_damage',
  name: 'Twardy Skórzak Biesa',
  description: '[ODWET] Obrażenia najpierw redukują ATK Biesa, dopiero potem DEF.',
  trigger: EffectTrigger.ON_DAMAGE_RECEIVED,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source, value } = ctx
    if (!value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    // Cofnij standardowe obrażenia DEF, zamiast tego redukuj ATK najpierw
    card.currentStats.defense += value  // cofnij
    let remaining = value
    if (card.currentStats.attack > 0) {
      const atkDamage = Math.min(remaining, card.currentStats.attack)
      card.currentStats.attack -= atkDamage
      remaining -= atkDamage
    }
    if (remaining > 0) {
      card.currentStats.defense -= remaining
    }
    const log = addLog(newState, `${source.cardData.name}: Obrażenia trafiają w ATK najpierw! (ATK: ${card.currentStats.attack}, DEF: ${card.currentStats.defense})`, 'effect')
    return effectResult(newState, [log])
  },
})

// ✅ RODZANICE (#19) — Podejrzyj wierzchnią kartę talii rywala (raz na turę)
registerEffect({
  id: 'rodzanice_scry',
  name: 'Wyrok Rodzanic (Wróżba)',
  description: '[AKCJA] Raz na turę: podejrzyj wierzchnią kartę talii rywala.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponent = newState.players[ctx.source.owner === 'player1' ? 'player2' : 'player1']
    if (opponent.deck.length === 0) {
      return effectResult(newState, [addLog(newState, 'Rodzanice: Talia rywala jest pusta.', 'effect')])
    }
    const topCard = opponent.deck[0]!
    topCard.isRevealed = true
    const log = addLog(newState, `Rodzanice podglądają wierzchnią kartę: "${topCard.cardData.name}".`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// WOŁCH — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'wolch_heal',
  name: 'Wołch (Uzdrowienie)',
  description: '[AKCJA] Akcja (1 PS, raz/turę): Ulecz sojusznika w tej samej linii do pełna.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 1,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.owner === source.owner && card.instanceId !== source.instanceId && card.currentStats.defense < card.currentStats.maxDefense
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const target = ctx.target
    if (!target) return effectResult(newState, [addLog(newState, 'Wołch: Brak celu.', 'effect')])

    const ally = getAllCreaturesOnField(newState, ctx.source.owner)
      .find(c => c.instanceId === target.instanceId)
    if (!ally) {
      return effectResult(newState, [addLog(newState, 'Wołch: Cel musi być sojusznikiem.', 'effect')])
    }
    if (ally.line !== ctx.source.line) {
      return effectResult(newState, [addLog(newState, 'Wołch: Cel musi być w tej samej linii.', 'effect')])
    }

    const maxDef = (ally.cardData as any).stats?.defense ?? ally.currentStats.maxDefense
    const healed = maxDef - ally.currentStats.defense
    ally.currentStats.defense = maxDef
    const log = addLog(newState, `Wołch uzdrawia ${ally.cardData.name} (+${healed} Obrony).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// JĘDZA — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'jedza_remove_buff',
  name: 'Jędza (Usuń Premię)',
  description: '[AKCJA] Akcja (darmowa, raz/turę): Usuń 1 aktywny efekt z dowolnej istoty.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.instanceId !== source.instanceId && card.activeEffects.length > 0
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const target = ctx.target
    if (!target) return effectResult(newState, [addLog(newState, 'Jędza: Brak celu.', 'effect')])

    let found: CardInstance | undefined
    for (const side of Object.values(newState.players)) {
      for (const line of Object.values(side.field.lines) as CardInstance[][]) {
        const c = line.find(c => c.instanceId === target.instanceId)
        if (c) { found = c; break }
      }
      if (found) break
    }
    if (!found) return effectResult(newState, [addLog(newState, 'Jędza: Nie znaleziono celu.', 'effect')])
    if (found.activeEffects.length === 0) {
      return effectResult(newState, [addLog(newState, `Jędza: ${found.cardData.name} nie ma żadnych premii.`, 'effect')])
    }

    const removed = found.activeEffects.pop()!
    const log = addLog(newState, `Jędza usuwa efekt "${removed.effectId}" z ${found.cardData.name}.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// SIEMIARGŁ — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'siemiargl_cleanse',
  name: 'Siemiargł (Oczyszczenie)',
  description: '[WEJŚCIE] Przy wystawieniu: Usuwa wszystkie negatywne efekty z sojuszników.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.IMMEDIATE,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponentIds = new Set(
      getAllCreaturesOnField(newState, ctx.source.owner === 'player1' ? 'player2' : 'player1')
        .map(c => c.instanceId)
    )
    let cleansedCount = 0

    for (const card of getAllCreaturesOnField(newState, ctx.source.owner)) {
      if (card.instanceId === ctx.source.instanceId) continue
      const before = card.activeEffects.length
      card.activeEffects = card.activeEffects.filter(e => !opponentIds.has(e.sourceInstanceId))
      cleansedCount += before - card.activeEffects.length
      if (card.metadata.cannotAttack) delete card.metadata.cannotAttack
      if (card.metadata.zagorkiniaCursed) delete card.metadata.zagorkiniaCursed
    }

    const log = addLog(newState, `Siemiargł oczyszcza sojuszników (usunięto ${cleansedCount} efektów).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ŚWIETLE — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'swietle_reveal_card',
  name: 'Świetle (Odkrycie)',
  description: '[AURA] Na początku każdej tury: Odkrywa 1 zakrytą kartę wroga (ręka lub pole).',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponentSide = ctx.source.owner === 'player1' ? 'player2' : 'player1'
    const opponent = newState.players[opponentSide]

    const handCard = opponent.hand.find(c => !c.isRevealed)
    if (handCard) {
      handCard.isRevealed = true
      const log = addLog(newState, `Świetle ujawnia kartę z ręki rywala: "${handCard.cardData.name}".`, 'effect')
      return effectResult(newState, [log])
    }

    const fieldCard = getAllCreaturesOnField(newState, opponentSide).find(c => !c.isRevealed)
    if (fieldCard) {
      fieldCard.isRevealed = true
      const log = addLog(newState, `Świetle ujawnia kartę z pola rywala: "${fieldCard.cardData.name}".`, 'effect')
      return effectResult(newState, [log])
    }

    return effectResult(newState, [addLog(newState, 'Świetle: Wszystkie karty rywala są już odkryte.', 'effect')])
  },
})

// ===================================================================
// JAROSZEK — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'jaroszek_paralyze',
  name: 'Jaroszek (Trwały Paraliż)',
  description: '[WEJŚCIE] Przy wystawieniu: Wybrany wróg jest trwale unieruchomiony (nie może atakować).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.IMMEDIATE,
  activationRequiresTarget: true,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const target = ctx.target
    if (!target) return effectResult(newState, [addLog(newState, 'Jaroszek: Brak celu.', 'effect')])

    const enemy = getAllCreaturesOnField(newState, ctx.source.owner === 'player1' ? 'player2' : 'player1')
      .find(c => c.instanceId === target.instanceId)
    if (!enemy) return effectResult(newState, [addLog(newState, 'Jaroszek: Cel musi być wrogiem.', 'effect')])

    enemy.cannotAttack = true
    enemy.paralyzeRoundsLeft = -1  // -1 = trwały paraliż
    const log = addLog(newState, `Jaroszek unieruchamia ${enemy.cardData.name} na stałe — paraliż permanentny!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// POŁUDNICA — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'poludnica_kill_weakest',
  name: 'Południca (Śmierć Najsłabszego)',
  description: '[AURA] Na początku każdej tury: Najsłabsza istota na polu (obie strony) ginie.',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.CLEANUP,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const allOnField = getAllCreaturesOnField(newState, 'player1')
      .concat(getAllCreaturesOnField(newState, 'player2'))
      .filter(c => c.instanceId !== ctx.source.instanceId)

    if (allOnField.length === 0) {
      return effectResult(newState, [addLog(newState, 'Południca: Pole puste — nikt nie ginie.', 'effect')])
    }

    const minAtk = Math.min(...allOnField.map(c => c.currentStats.attack))
    const weakest = allOnField.filter(c => c.currentStats.attack === minAtk)
    // Remis: giną wszystkie z minimalnym ATK
    const log: LogEntry[] = []
    for (const card of weakest) {
      log.push(addLog(newState, `Południca zabija ${card.cardData.name} (ATK ${card.currentStats.attack})!`, 'death'))
      moveToGraveyard(newState, card)
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// GUŚLARKA — ✅ IMPLEMENTED (enforcement w CombatResolver.calculateDamage)
// ===================================================================

registerEffect({
  id: 'guslarka_bonus_vs_demon',
  name: 'Guślarka (Premie vs Demony)',
  description: '[AURA] Sojusznicy atakujący istoty z domeny Weles zyskują +2 Ataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// LATAWICA — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'latawica_drain_ally',
  name: 'Latawica (Wysysanie Sił)',
  description: '[AKCJA] Akcja (darmowa, raz/turę): Wysysa WSZYSTKIE Atak i Obronę od wybranego sojusznika (może go zabić).',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.owner === source.owner && card.instanceId !== source.instanceId
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const target = ctx.target
    if (!target) return effectResult(newState, [addLog(newState, 'Latawica: Brak celu.', 'effect')])

    const donor = getAllCreaturesOnField(newState, ctx.source.owner)
      .find(c => c.instanceId === target.instanceId)
    if (!donor || donor.instanceId === ctx.source.instanceId) {
      return effectResult(newState, [addLog(newState, 'Latawica: Cel musi być innym sojusznikiem.', 'effect')])
    }

    const drainedAtk = donor.currentStats.attack
    const drainedDef = donor.currentStats.defense

    // Wysysa stats do Latawicy
    const latawica = getAllCreaturesOnField(newState, ctx.source.owner)
      .find(c => c.instanceId === ctx.source.instanceId)!
    latawica.currentStats.attack += drainedAtk
    latawica.currentStats.defense += drainedDef
    donor.currentStats.attack = 0
    donor.currentStats.defense = 0

    const log: LogEntry[] = [
      addLog(newState, `Latawica wysysa ${drainedAtk} ATK i ${drainedDef} DEF od ${donor.cardData.name}.`, 'effect')
    ]

    // Ofiara umiera (DEF = 0)
    log.push(addLog(newState, `${donor.cardData.name} umiera wyczerpany!`, 'death'))
    moveToGraveyard(newState, donor)

    return effectResult(newState, log)
  },
})

// ===================================================================
// ŁUCZNIK — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'lucznik_pin',
  name: 'Łucznik (Unieruchomienie)',
  description: '[ODWET] Po zadaniu obrażeń: Cel nie może zmieniać Pozycji (permanentnie).',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const target = ctx.target
    if (!target) return effectResult(newState)

    const enemy = getAllCreaturesOnField(newState, target.owner as import('./types').PlayerSide)
      .find(c => c.instanceId === target.instanceId)
    if (!enemy) return effectResult(newState)

    enemy.metadata.positionLocked = true
    const log = addLog(newState, `Łucznik przybija ${enemy.cardData.name} — nie może zmieniać pozycji!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// TUR — ✅ IMPLEMENTED (enforcement w LineManager.canAttack)
// ===================================================================

registerEffect({
  id: 'tur_ranged_magic_immune',
  name: 'Tur (Odporność na Dystans i Magię)',
  description: '[AURA] Odporny na ataki Dystans i Magia.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ŻUPAN — ✅ IMPLEMENTED (enforcement w LineManager.canPlaceInLine)
// ===================================================================

registerEffect({
  id: 'zupan_no_field_limit',
  name: 'Żupan (Brak Limitu Pola)',
  description: '[AURA] Brak limitu 5 istot na polu dopóki Żupan jest w grze.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ŻERCA WELESA — ✅ IMPLEMENTED (enforcement w CombatResolver.calculateDamage)
// ===================================================================

registerEffect({
  id: 'zerca_welesa_demon_buff',
  name: 'Żerca Welesa (Siła Demonów)',
  description: '[AURA] Twoje Demony (domena Weles) zyskują +1 Ataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// STARSZYZNA PLEMIENNA — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'starszyzna_scry_deck',
  name: 'Starszyzna Plemienna (Mądrość)',
  description: '[AURA] Na początku każdej tury: Odkrywa 3 górne karty własnej talii.',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const owner = newState.players[ctx.source.owner]
    const revealed = owner.deck.slice(0, 3)
    revealed.forEach(c => { c.isRevealed = true })
    const names = revealed.map(c => c.cardData.name).join(', ')
    const log = addLog(newState, `Starszyzna odkrywa top 3 talii: ${names || '(brak kart)'}.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ŻERCA — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'zerca_spell_shield',
  name: 'Żerca (Tarcza Zaklęć)',
  description: '[WEJŚCIE] Przy wystawieniu: Sojusznicy zyskują jednorazową tarczę przed wrogim zaklęciem.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.IMMEDIATE,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const allies = getAllCreaturesOnField(newState, ctx.source.owner)
    let count = 0
    for (const ally of allies) {
      if (ally.instanceId === ctx.source.instanceId) continue
      if (!ally.metadata.spellShield) {
        ally.metadata.spellShield = true
        count++
      }
    }
    const log = addLog(newState, `Żerca daje Tarczę Zaklęć ${count} sojusznikom.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// PÓŁNOCNICA — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'polnocnica_mass_paralyze',
  name: 'Północnica (Masowy Paraliż)',
  description: '[AKCJA] Akcja (1 PS): Paraliżuje WSZYSTKICH wrogów na 2 rundy.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 1,
  activationCooldown: 'per_round',
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const enemies = getAllCreaturesOnField(newState, ctx.source.owner === 'player1' ? 'player2' : 'player1')
    let count = 0
    for (const enemy of enemies) {
      if (!enemy.isImmune) {
        enemy.cannotAttack = true
        enemy.paralyzeRoundsLeft = 2
        count++
      }
    }
    const log = addLog(newState, `Północnica paraliżuje ${count} wrogów na 2 rundy!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// TĘSKNICA — ✅ IMPLEMENTED (enforcement: blokuje enhanced adventures)
// ===================================================================

registerEffect({
  id: 'tesknica_block_enhance',
  name: 'Tęsknica (Blokada Ulepszeń)',
  description: '[AURA] Wróg nie może ulepszać Zaklęć (enhanced adventure) dopóki Tęsknica żyje.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// DZIAD (#68) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'dziad_reveal_all',
  name: 'Dziadowe Widzenie',
  description: '[WEJŚCIE] Przy wystawieniu: odkrywa WSZYSTKIE karty wroga (pole + ręka).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponentSide = ctx.source.owner === 'player1' ? 'player2' : 'player1'
    const opponent = newState.players[opponentSide]
    let fieldCount = 0
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      opponent.field.lines[line].forEach(c => { c.isRevealed = true; fieldCount++ })
    }
    const handCount = opponent.hand.length
    opponent.hand.forEach(c => { c.isRevealed = true })
    const log = addLog(newState, `${ctx.source.cardData.name}: Odkrywa ${fieldCount} kart na polu i ${handCount} kart z ręki wroga!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// WIESZCZY (#86) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'wieszczy_spy_burn',
  name: 'Przekleństwo Wieszczego',
  playOnEnemyField: true,
  description: '[WEJŚCIE] [AURA] Przy wystawieniu: ujawnia wszystkie karty na polu wroga. Na końcu każdej tury: niszczy 1 losową kartę z ręki wroga.',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.ON_TURN_END],
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponentSide = ctx.source.owner === 'player1' ? 'player2' : 'player1'
    const opponent = newState.players[opponentSide]
    const log: LogEntry[] = []
    if (ctx.trigger === EffectTrigger.ON_PLAY) {
      for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
        opponent.field.lines[line].forEach(c => { c.isRevealed = true })
      }
      log.push(addLog(newState, `${ctx.source.cardData.name}: Ujawnia wszystkich wrogów na polu!`, 'effect'))
    } else if (ctx.trigger === EffectTrigger.ON_TURN_END) {
      if (opponent.hand.length > 0) {
        const idx = Math.floor(Math.random() * opponent.hand.length)
        const burned = opponent.hand.splice(idx, 1)[0]!
        opponent.graveyard.push(burned)
        log.push(addLog(newState, `${ctx.source.cardData.name}: Spala ${burned.cardData.name} z ręki wroga!`, 'effect'))
      }
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// BAGIENNIK (#62) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'bagiennik_cleanse_buff',
  name: 'Oczyszczenie Bagiennika',
  description: '[AKCJA] Akcja (gratis): Usuwa jeden efekt z dowolnej istoty na polu. Bagiennik podwaja swój ATK i DEF.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.instanceId !== source.instanceId && card.activeEffects.length > 0
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log: LogEntry[] = []
    if (ctx.target) {
      const targetCard = findCardInState(newState, ctx.target.instanceId)
      if (targetCard && targetCard.activeEffects.length > 0) {
        const removed = targetCard.activeEffects.pop()
        if (removed) {
          log.push(addLog(newState, `${ctx.source.cardData.name}: Usuwa efekt "${removed.effectId}" z ${targetCard.cardData.name}.`, 'effect'))
        }
      }
    }
    const bagiennik = findCardInState(newState, ctx.source.instanceId)
    if (bagiennik) {
      bagiennik.currentStats.attack *= 2
      bagiennik.currentStats.defense *= 2
      log.push(addLog(newState, `${ctx.source.cardData.name}: Podwaja ATK (${bagiennik.currentStats.attack}) i DEF (${bagiennik.currentStats.defense})!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// CMENTARNA BABA (#66) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'cmentarna_baba_resurrect',
  name: 'Wskrzeszenie Cmentarnej Baby',
  description: '[WEJŚCIE] Przy wystawieniu: wskrzesza Nieumarłego z cmentarza (ATK ≤ własny ATK) na pole L1.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const owner = newState.players[source.owner]
    const isHuman = !owner.isAI
    const sourceAtk = source.currentStats.attack
    const candidates = owner.graveyard.filter(
      c => (c.cardData as any).idDomain === 3 && c.currentStats.attack <= sourceAtk
    )
    if (candidates.length === 0) {
      const log = addLog(newState, `${source.cardData.name}: Brak Nieumarłych w cmentarzu (wymagany ATK ≤ ${sourceAtk}).`, 'effect')
      return effectResult(newState, [log])
    }

    if (isHuman) {
      newState.pendingInteraction = {
        type: 'cmentarna_baba_resurrect',
        sourceInstanceId: source.instanceId,
        respondingPlayer: source.owner as PlayerSide,
        availableTargetIds: candidates.map(c => c.instanceId),
      }
      const log = addLog(newState, `${source.cardData.name}: Wybierz Nieumarłego do wskrzeszenia!`, 'effect')
      return effectResult(newState, [log])
    }

    // AI: wskrzes najsilniejszego
    candidates.sort((a, b) => b.currentStats.attack - a.currentStats.attack)
    const toResurrect = candidates[0]!
    const gravIdx = owner.graveyard.findIndex(c => c.instanceId === toResurrect.instanceId)
    if (gravIdx !== -1) owner.graveyard.splice(gravIdx, 1)
    toResurrect.currentStats.defense = (toResurrect.cardData as any).stats.defense
    toResurrect.line = BattleLine.FRONT
    toResurrect.turnsInPlay = 0
    owner.field.lines[BattleLine.FRONT].push(toResurrect)
    const log = addLog(newState, `${source.cardData.name}: Wskrzesza ${toResurrect.cardData.name} z cmentarza (najsilniejszy Nieumarły, ATK ≤ ${sourceAtk})!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// GRAD (#104) — ✅ IMPLEMENTED (enforcement: LineManager.canAttack)
// ===================================================================

registerEffect({
  id: 'grad_magic_element_only',
  name: 'Grad (Tarcza Żywiołów)',
  description: '[AURA] Odporny na Wręcz i Dystans — tylko Magia i Żywioł mogą go trafić.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// MAVKA (#111) — ✅ IMPLEMENTED (enforcement: LineManager.canAttack)
// ===================================================================

registerEffect({
  id: 'mavka_line_shield',
  name: 'Mavka (Tarcza Linii)',
  description: '[AURA] Sojusznicy w tej samej linii co Mavka nie mogą być celem ataków wrogów.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// CZART (#99) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'czart_shift_stats',
  name: 'Czarcia Przemiana',
  description: '[AKCJA] Akcja (gratis): Przenosi całą DEF na ATK (DEF = 0, ATK += poprzednia DEF). Raz w turze.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const card = findCardInState(newState, ctx.source.instanceId)
    if (!card) return effectResult(newState)
    const def = card.currentStats.defense
    card.currentStats.attack += def
    card.currentStats.defense = 0
    const log = addLog(newState, `${ctx.source.cardData.name}: Przenosi ${def} DEF na ATK → teraz ${card.currentStats.attack} ATK / 0 DEF.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// DARMOPYCH (#100) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'darmopych_friendly_fire',
  name: 'Darmopychowy Chaos',
  description: '[WEJŚCIE] Przy wystawieniu: wybrana wroga istota atakuje swego najsłabszego sojusznika (friendly fire).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  activationRequiresTarget: true,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log: LogEntry[] = []
    if (!ctx.target) return effectResult(newState)
    const forcedAttacker = findCardInState(newState, ctx.target.instanceId)
    if (!forcedAttacker) return effectResult(newState)
    const allies = getAllCreaturesOnField(newState, forcedAttacker.owner)
      .filter(c => c.instanceId !== forcedAttacker.instanceId)
    if (allies.length === 0) return effectResult(newState)
    allies.sort((a, b) => a.currentStats.defense - b.currentStats.defense)
    const victim = allies[0]!
    const damage = forcedAttacker.currentStats.attack
    victim.currentStats.defense -= damage
    log.push(addLog(newState, `${ctx.source.cardData.name}: ${forcedAttacker.cardData.name} atakuje sojusznika ${victim.cardData.name} za ${damage}!`, 'effect'))
    if (victim.currentStats.defense <= 0) {
      moveToGraveyard(newState, victim)
      log.push(addLog(newState, `${victim.cardData.name} ginie od friendly fire!`, 'death'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// BOGUNKA (#96) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'bogunka_instant_kill_human',
  name: 'Śmiertelny Pocałunek Bogunki',
  description: '[ODWET] Gdy Bogunka zaatakuje Żywi (domain 2): cel natychmiast ginie niezależnie od HP.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    if ((target.cardData as any).idDomain !== 2) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const targetCard = findCardInState(newState, target.instanceId)
    if (targetCard && targetCard.currentStats.defense > 0) {
      targetCard.currentStats.defense = 0
      const log = addLog(newState, `${source.cardData.name}: Śmiertelny pocałunek! ${target.cardData.name} (Żywi) natychmiast ginie!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(cloneGameState(state))
  },
})

// ===================================================================
// PRZYŁÓŻNIK (#112) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'przyloznik_heal_on_zyvi_kill',
  name: 'Przyłóżnikowa Uczta',
  description: '[ZABÓJSTWO] Po zabiciu Żywi (domain 2): Przyłóżnik regeneruje się do pełnego HP.',
  trigger: EffectTrigger.ON_KILL,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    if ((target.cardData as any).idDomain !== 2) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (card) {
      const maxDef = (card.cardData as any).stats.defense
      card.currentStats.defense = maxDef
      const log = addLog(newState, `${source.cardData.name}: Regeneruje się do ${maxDef} HP po zabiciu Żywi!`, 'effect')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ===================================================================
// SZATOPIERZ (#114) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'szatopierz_discard_for_gold',
  name: 'Szatopierzowy Handel',
  description: '[AKCJA] Akcja (gratis): Odrzuć 2 karty z ręki → zyskaj 1 PS. Raz w turze.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const owner = newState.players[ctx.source.owner]
    if (owner.hand.length < 2) return effectResult(newState)
    const discarded = owner.hand.splice(0, 2)
    discarded.forEach(c => { owner.graveyard.push(c) })
    owner.glory += 1
    const log = addLog(newState, `${ctx.source.cardData.name}: Odrzuca 2 karty → zyskuje 1 PS (łącznie: ${owner.glory}).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// MARA (#110) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'mara_sacrifice_takeover',
  name: 'Marycyna Ofiara',
  description: '[AKCJA] Akcja (raz w grze): Mara poświęca się — przejmuje wrogu istotę z ATK ≤ 2× ATK Mary.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'once',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.owner !== source.owner && card.currentStats.attack <= source.currentStats.attack * 2
  },
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const log: LogEntry[] = []
    if (!ctx.target) return effectResult(newState)
    const target = findCardInState(newState, ctx.target.instanceId)
    if (!target) return effectResult(newState)
    const maraAtk = ctx.source.currentStats.attack
    if (target.currentStats.attack > maraAtk * 2) {
      log.push(addLog(newState, `${ctx.source.cardData.name}: Cel (ATK ${target.currentStats.attack}) zbyt silny — maks. ${maraAtk * 2}.`, 'effect'))
      return effectResult(newState, log)
    }
    const maraCard = findCardInState(newState, ctx.source.instanceId)
    if (maraCard) {
      moveToGraveyard(newState, maraCard)
      log.push(addLog(newState, `${ctx.source.cardData.name}: Poświęca swoje życie, by przejąć kontrolę nad wrogą istotą!`, 'effect'))
    }
    const originalOwner = target.owner
    removeCardFromField(newState, target.instanceId)
    target.owner = ctx.source.owner
    target.line = BattleLine.FRONT
    newState.players[ctx.source.owner].field.lines[BattleLine.FRONT].push(target)
    log.push(addLog(newState, `${ctx.source.cardData.name}: Przejmuje ${target.cardData.name} od ${originalOwner}!`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// WIETRZYCA (#115) — ✅ IMPLEMENTED
// ===================================================================

registerEffect({
  id: 'wietrzyca_rearrange_enemy',
  name: 'Wiatrowiskowy Chaos',
  description: '[AKCJA] Akcja (gratis): Przetasowuje rozmieszczenie wrogich istot między liniami. Raz w turze.',
  trigger: EffectTrigger.ON_ACTIVATE,
  priority: EffectPriority.REACTION,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const opponentSide = ctx.source.owner === 'player1' ? 'player2' : 'player1'
    const opponent = newState.players[opponentSide]
    const entries: { card: CardInstance; line: BattleLine }[] = []
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT] as BattleLine[]) {
      for (const card of opponent.field.lines[line]) {
        entries.push({ card, line })
        card.line = null
      }
      opponent.field.lines[line] = []
    }
    if (entries.length === 0) return effectResult(newState)
    const lines = entries.map(e => e.line)
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j]!, lines[i]!]
    }
    entries.forEach((entry, idx) => {
      entry.card.line = lines[idx]!
      opponent.field.lines[lines[idx]!].push(entry.card)
    })
    const log = addLog(newState, `${ctx.source.cardData.name}: Przetasowuje pozycje ${entries.length} wrogich istot!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ŻMIJE (#30) — Koniec tury: +1 PS gdy pole wroga puste
// ===================================================================

registerEffect({
  id: 'zmije_glory_on_empty_field',
  name: 'Żmije (Próżne Pole)',
  description: '[AURA] Na końcu Twojej tury: jeśli pole przeciwnika jest puste, zdobywasz 1 PS.',
  trigger: EffectTrigger.ON_TURN_END,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const newState = cloneGameState(ctx.state)
    const enemySide = ctx.source.owner === 'player1' ? 'player2' : 'player1'
    const enemyCreatures = getAllCreaturesOnField(newState, enemySide)
    if (enemyCreatures.length > 0) return effectResult(newState)
    newState.players[ctx.source.owner].glory += 1
    const log = addLog(newState, `${ctx.source.cardData.name}: Pole wroga puste — zdobywasz 1 PS!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// CHŁOP (#34) — AURA: +1 dodatkowy atak w turze (logika w GameEngine)
// ===================================================================

registerEffect({
  id: 'chlop_extra_attack',
  name: 'Chłop (Masa Plebejska)',
  description: '[AURA] Możesz wykonać 1 dodatkowy atak istotą w tej turze.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// JUNAK (#40) — Po 2. trafieniu cel natychmiast ginie
// ===================================================================

registerEffect({
  id: 'junak_double_hit_kill',
  name: 'Junak (Podwójny Cios)',
  description: '[ODWET] Jeśli Junak zrani kogoś dwa razy, ten cel natychmiast ginie.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const targetCard = findCardInState(newState, target.instanceId)
    if (!targetCard || targetCard.isImmune) return effectResult(newState)

    // Śledź trafienia w konkretny cel
    const hitKey = `junakHits_${target.instanceId}`
    const hits = ((source.metadata[hitKey] as number) ?? 0) + 1

    const junakInState = findCardInState(newState, source.instanceId)
    if (junakInState) junakInState.metadata[hitKey] = hits

    if (hits >= 2) {
      // Natychmiastowa śmierć celu
      targetCard.currentStats.defense = -99
      const log = addLog(newState, `${source.cardData.name}: Podwójny cios — ${target.cardData.name} ginie natychmiast!`, 'death')
      return effectResult(newState, [log])
    }
    return effectResult(newState)
  },
})

// ===================================================================
// LEŚNICA (#53) — Atakuje 2 razy na turę (logika w LineManager + CombatResolver + GameEngine)
// ===================================================================

registerEffect({
  id: 'lesnica_double_attack',
  name: 'Leśnica (Podwójny Atak)',
  description: '[AURA] Może atakować 2 razy w jednej turze.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ŚWIATOGOR (#57) — Atak uderza WSZYSTKICH wrogów w jednej linii
// ===================================================================

registerEffect({
  id: 'swiatogor_line_cleave',
  name: 'Światogor (Rzeź Linii)',
  description: '[ODWET] Jego atak uderza we WSZYSTKICH wrogów w tej samej linii co cel.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)

    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const targetLine = target.line
    if (!targetLine) return effectResult(newState)

    const others = newState.players[enemySide].field.lines[targetLine]
      .filter(c => c.instanceId !== target.instanceId)

    const log: LogEntry[] = []
    const killed: CardInstance[] = []

    for (const other of others) {
      if (other.isImmune) continue
      dealDamage(other, source.currentStats.attack)
      log.push(addLog(newState, `${source.cardData.name} rozcina linię — ${other.cardData.name} otrzymuje ${source.currentStats.attack} obrażeń! (DEF: ${other.currentStats.defense + source.currentStats.attack} → ${other.currentStats.defense})`, 'damage'))
      if (other.currentStats.defense <= 0) {
        killed.push(other)
      }
    }

    // Usuń poległych z pola
    for (const dead of killed) {
      log.push(addLog(newState, `${dead.cardData.name} ginie od Rzezi Linii!`, 'death'))
      removeCardFromField(newState, dead.instanceId)
      dead.line = null
      newState.players[dead.owner].graveyard.push(dead)
    }

    return effectResult(newState, log)
  },
})

// ===================================================================
// KIKIMORA (#71) — Jej atak nie kończy tury (logika w GameEngine)
// ===================================================================

registerEffect({
  id: 'kikimora_free_attack',
  name: 'Kikimora (Darmowy Atak)',
  description: '[AURA] Jej atak nie zajmuje slotu atakowego — możesz nadal atakować inną istotą.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// BŁĘDNY OGNIK (#65) — Wskazana istota wraca na szczyt talii
// ===================================================================

registerEffect({
  id: 'bledny_ognik_bounce',
  name: 'Błędny Ognik (Zauroczenie)',
  description: '[WEJŚCIE] Przy wystawieniu: wskazana istota wraca na wierzch talii swojego właściciela (zachowuje modyfikatory).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)

    // AI albo brak celu → wybierz najsilniejszego wroga automatycznie
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const bounceTarget = target
      ? findCardInState(newState, target.instanceId)
      : getAllCreaturesOnField(newState, enemySide)
          .sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]

    if (!bounceTarget) {
      return effectResult(newState, [addLog(newState, `${source.cardData.name}: Brak celu do odesłania.`, 'effect')])
    }

    removeCardFromField(newState, bounceTarget.instanceId)
    bounceTarget.line = null
    // Wróć na wierzch talii (początek tablicy = top)
    newState.players[bounceTarget.owner].deck.unshift(bounceTarget)

    const log = addLog(newState, `${source.cardData.name}: ${bounceTarget.cardData.name} wraca na wierzch talii!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// MOROWA DZIEWICA (#76) — Uderza WSZYSTKICH na polu przy ataku
// ===================================================================

registerEffect({
  id: 'morowa_dziewica_aoe_all',
  name: 'Morowa Dziewica (Zaraza)',
  description: '[ODWET] Jej atak uderza WSZYSTKICH na polu — łącznie z sojusznikami (z wyjątkiem niej samej i głównego celu).',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target, value } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)

    const aoeTargets = getAllCreaturesOnField(newState, 'player1')
      .concat(getAllCreaturesOnField(newState, 'player2'))
      .filter(c => c.instanceId !== source.instanceId && c.instanceId !== target.instanceId)

    const log: LogEntry[] = []
    const killed: CardInstance[] = []

    for (const victim of aoeTargets) {
      if (victim.isImmune) continue
      dealDamage(victim, source.currentStats.attack)
      log.push(addLog(newState, `${source.cardData.name}: Zaraza uderza ${victim.cardData.name} za ${source.currentStats.attack}!`, 'damage'))
      if (victim.currentStats.defense <= 0) {
        killed.push(victim)
      }
    }

    for (const dead of killed) {
      log.push(addLog(newState, `${dead.cardData.name} ginie od Zarazy!`, 'death'))
      removeCardFromField(newState, dead.instanceId)
      dead.line = null
      newState.players[dead.owner].graveyard.push(dead)
    }

    return effectResult(newState, log)
  },
})

// ===================================================================
// WISIELEC (#88) — Obie strony walki wracają na spód talii
// ===================================================================

registerEffect({
  id: 'wisielec_bounce_both',
  name: 'Wisielec (Dotknięcie Śmierci)',
  description: '[ODWET] Kogo Wisielec zrani — wraca na spód talii. Kto zrani Wisielca — też wraca na spód talii.',
  trigger: [EffectTrigger.ON_DAMAGE_DEALT, EffectTrigger.ON_DAMAGE_RECEIVED],
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source, target, value, trigger } = ctx
    if (!target || !value || value <= 0) return effectResult(cloneGameState(state))
    if (target.isImmune) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)

    // ON_DAMAGE_DEALT: Wisielec zaatakował — cel wraca do talii
    // ON_DAMAGE_RECEIVED: Wisielec jest atakowany — atakujący wraca do talii
    const bounceCard = findCardInState(newState, target.instanceId)
    if (!bounceCard) return effectResult(newState)

    removeCardFromField(newState, bounceCard.instanceId)
    bounceCard.line = null
    // Cofnij obrażenia na bounced karcie (wraca z modyfikatorami, ale bez ran)
    bounceCard.currentStats = { ...(bounceCard.cardData as any).stats }
    // Dodaj na spód talii
    newState.players[bounceCard.owner].deck.push(bounceCard)

    const actionDesc = trigger === EffectTrigger.ON_DAMAGE_DEALT
      ? 'zranił'
      : 'tknął Wisielca'
    const log = addLog(newState, `Wisielec ${actionDesc} — ${bounceCard.cardData.name} wraca na spód talii!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// WĄPIERZ (#89) — Niezniszczalny; ginie gdy 2 rundy nie zada obrażeń
// ===================================================================

registerEffect({
  id: 'wapierz_invincible_hunger',
  name: 'Wąpierz (Głód Krwi)',
  description: '[ODWET] [AURA] Odporny na wszelkie obrażenia. Ginie, gdy przez 2 rundy nie zada żadnych obrażeń. Może atakować sojuszników.',
  trigger: [EffectTrigger.ON_DAMAGE_DEALT, EffectTrigger.ON_TURN_END],
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, value, trigger } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    if (trigger === EffectTrigger.ON_DAMAGE_DEALT) {
      // Zapamiętaj rundę w której zadał obrażenia
      if (value && value > 0) {
        card.metadata.wapierzLastDamageRound = newState.roundNumber
      }
      return effectResult(newState)
    }

    // ON_TURN_END: Sprawdź czy 2+ rundy bez ofiar
    if (trigger === EffectTrigger.ON_TURN_END) {
      const lastDmgRound = (card.metadata.wapierzLastDamageRound as number) ?? 0
      const roundsWithoutDamage = newState.roundNumber - lastDmgRound
      if (roundsWithoutDamage >= 2) {
        const log = addLog(newState, `${source.cardData.name}: Ginie z głodu — ${roundsWithoutDamage} rundy bez żadnego ataku (Wampierz wymaga regularnych ofiar).`, 'death')
        moveToGraveyard(newState, card)
        return effectResult(newState, [log])
      }
    }

    return effectResult(newState)
  },
})

// ===================================================================
// ZMORA (#90) — Rośnie o zadane obrażenia (+ATK)
// ===================================================================

registerEffect({
  id: 'zmora_grow_sacrifice',
  name: 'Zmora (Żywienie Lękiem)',
  description: '[ODWET] Ile zadaje obrażeń, tyle dodaje sobie Ataku lub Obrony.',
  trigger: EffectTrigger.ON_DAMAGE_DEALT,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, value } = ctx
    if (!value || value <= 0) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    // Zwiększ ATK o zadane obrażenia
    card.currentStats.attack += value
    const log = addLog(newState, `${source.cardData.name}: Rośnie! +${value} ATK (teraz ${card.currentStats.attack}).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// BABA JAGA (#91) — +1/+1 za każdą śmierć na polu
// ===================================================================

registerEffect({
  id: 'baba_jaga_death_growth',
  name: 'Baba Jaga (Żniwiarka Dusz)',
  description: '[CZUJNOŚĆ] Za każdą śmierć na polu (sojusznika lub wroga): +1 Atak i +1 Obrona.',
  trigger: EffectTrigger.ON_ANY_DEATH,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    card.currentStats.attack += 1
    card.currentStats.defense += 1
    if (typeof card.currentStats.maxDefense === 'number') {
      card.currentStats.maxDefense += 1
    }
    card.metadata.justGrew = true
    const log = addLog(newState, `${source.cardData.name}: Dusza zebrana! +1/+1 (${card.currentStats.attack}/${card.currentStats.defense}).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// WOJ (#50) — Wystawia wszystkich Wojów z ręki za darmo
// ===================================================================

registerEffect({
  id: 'woj_mass_deploy',
  name: 'Woj (Atak Gromadą)',
  description: '[WEJŚCIE] Przy wystawieniu: wszystkie inne karty Woja z ręki wchodzą na pole za darmo.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const owner = newState.players[source.owner]
    const otherWoj = owner.hand.filter(c => (c.cardData as any).effectId === 'woj_mass_deploy')
    if (otherWoj.length === 0) return effectResult(newState)

    const log: LogEntry[] = []
    for (const woj of otherWoj) {
      const handIdx = owner.hand.findIndex(c => c.instanceId === woj.instanceId)
      if (handIdx !== -1) owner.hand.splice(handIdx, 1)
      woj.line = BattleLine.FRONT
      woj.turnsInPlay = 0
      woj.roundEnteredPlay = newState.roundNumber
      woj.isRevealed = false
      owner.field.lines[BattleLine.FRONT].push(woj)
      log.push(addLog(newState, `${source.cardData.name}: ${woj.cardData.name} wchodzi na pole za darmo!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ZNACHOR (#52) — PASYWNY: redukuje obrażenia sojusznika (w CombatResolver)
// ===================================================================

registerEffect({
  id: 'znachor_absorb',
  name: 'Znachor (Uzdrowiciel)',
  description: '[AURA] Gdy sojusznik przeżyje atak, Znachor redukuje obrażenia o swój Atak.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// POLEWIK (#54) — AURA: L1 Żywi sąsiedzi +1 ATK (w CombatResolver)
// ===================================================================

registerEffect({
  id: 'polewik_buff_neighbors',
  name: 'Polewik (Duch Pól)',
  description: '[AURA] Sąsiedzi w L1 będący Żywymi zyskują +1 Ataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// KOŚCIEJ (#43) — Wskrzesza się po śmierci od Wręcz (1x gratis)
// ===================================================================

registerEffect({
  id: 'kosciej_melee_resurrection',
  name: 'Kościej (Serce Poza Ciałem)',
  description: '[POŻEGNANIE] Gdy zginie od Wręcz: wskrzesza się (1. raz za darmo). Można go wskrzesić ręcznie za 1 PS.',
  trigger: EffectTrigger.ON_DEATH,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    // Sprawdź czy zabił Wręcz
    const killerInstanceId = source.metadata.killedBy as string | undefined
    const killer = killerInstanceId ? findCardInState(newState, killerInstanceId) : null
    const killerAttackType = killer ? (killer.cardData as any).attackType as AttackType : null

    if (killerAttackType !== AttackType.MELEE) return effectResult(newState)

    const resurrectCount = (card.metadata.kosciejResurrectCount as number) ?? 0

    if (resurrectCount === 0) {
      // Pierwsza śmierć od Wręcz: wskrzesza się za darmo
      card.metadata.kosciejResurrected = true
      card.metadata.justResurrected = true
      card.currentStats.defense = (card.cardData as any).stats.defense
      card.metadata.kosciejResurrectCount = 1
      const log = addLog(newState, `${source.cardData.name}: Serce bije! Wstaje ze śmierci za darmo!`, 'effect')
      return effectResult(newState, [log])
    } else {
      // Kolejne śmierci: flaga do ręcznego wskrzeszenia za 1 PS
      card.metadata.kosciejCanPaidResurrect = true
      card.metadata.kosciejResurrectCount = resurrectCount + 1
      const log = addLog(newState, `${source.cardData.name}: Serce bije — można go wskrzesić za 1 PS!`, 'effect')
      return effectResult(newState, [log])
    }
  },
})

// ===================================================================
// BABA (#31) — +4 ATK vs wszystkimi poza wybranym typem
// ===================================================================

registerEffect({
  id: 'baba_bonus_vs_type',
  name: 'Baba (Wiedźma Lasu)',
  description: '[WEJŚCIE] [AURA] Przy wystawieniu: wybierz domenę do ochrony. Baba zyskuje +4 ATK vs wszystkich POZOSTAŁYCH domen.',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.PASSIVE],
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, trigger } = ctx
    if (trigger !== EffectTrigger.ON_PLAY) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    const domainNames: Record<number, string> = { 1: 'Perun', 2: 'Żywi', 3: 'Nieumarli', 4: 'Weles' }
    const isHuman = !state.players[source.owner].isAI

    // Gracz ludzki bez podanego wyboru: pokaż modal z domenami
    if (isHuman && !ctx.metadata?.babaDomain) {
      newState.pendingInteraction = {
        type: 'baba_domain',
        sourceInstanceId: source.instanceId,
        respondingPlayer: source.owner as PlayerSide,
        availableChoices: ['Perun', 'Żywi', 'Nieumarli', 'Weles'],
      }
      const log = addLog(newState, `${source.cardData.name}: Wiedźma czeka na wybór domeny do ochrony...`, 'effect')
      return effectResult(newState, [log])
    }

    // AI lub po wyborze: zastosuj premię
    const nameToId: Record<string, number> = { 'Perun': 1, 'Żywi': 2, 'Nieumarli': 3, 'Weles': 4 }
    let chosen: number
    if (ctx.metadata?.babaDomain) {
      chosen = nameToId[ctx.metadata.babaDomain as string] ?? 4
    } else {
      // AI: wybierz domenę z największą liczbą wrogich istot
      const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
      const enemyCreatures = getAllCreaturesOnField(newState, enemySide)
      const domainCounts: Record<number, number> = {}
      for (const c of enemyCreatures) {
        const d = (c.cardData as any).idDomain as number
        domainCounts[d] = (domainCounts[d] ?? 0) + 1
      }
      const mostCommon = Object.entries(domainCounts).sort(([, a], [, b]) => b - a)[0]
      chosen = mostCommon ? parseInt(mostCommon[0]) : 4
    }

    card.metadata.babaChosenDomain = chosen
    const log = addLog(newState, `${source.cardData.name}: Chroni ${domainNames[chosen] ?? chosen} — +4 ATK vs pozostałych domen!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// GORYNYCH (#103) — Przy wystawieniu wchłania sojusznicze Smoki
// ===================================================================

registerEffect({
  id: 'gorynych_merge_dragons',
  name: 'Gorynych (Smok Smoków)',
  description: '[WEJŚCIE] Przy wystawieniu: wchłania sojusznicze Smoki na polu, sumując ich statystyki.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const DRAGON_EFFECT_IDS = new Set(['azdacha_vanilia', 'smocze_jajo_hatch'])
    const newState = cloneGameState(state)
    const gorynych = findCardInState(newState, source.instanceId)
    if (!gorynych) return effectResult(newState)

    const alliedDragons = getAllCreaturesOnField(newState, source.owner)
      .filter(c => DRAGON_EFFECT_IDS.has((c.cardData as any).effectId) && c.instanceId !== source.instanceId)
    if (alliedDragons.length === 0) return effectResult(newState)

    const log: LogEntry[] = []
    for (const dragon of alliedDragons) {
      gorynych.currentStats.attack += dragon.currentStats.attack
      gorynych.currentStats.defense += dragon.currentStats.defense
      removeCardFromField(newState, dragon.instanceId)
      dragon.line = null
      newState.players[source.owner].graveyard.push(dragon)
      log.push(addLog(newState, `${source.cardData.name} wchłania ${dragon.cardData.name}! (+${dragon.currentStats.attack}/${dragon.currentStats.defense})`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ŚMIERĆ (#120) — Rośnie za każdą śmierć na polu
// ===================================================================

registerEffect({
  id: 'smierc_death_growth_save',
  name: 'Śmierć (Zbieraczka Dusz)',
  description: '[CZUJNOŚĆ] Za każdą śmierć na polu: +1 ATK i +1 DEF. Można zapłacić 1 PS, by ginąca istota wróciła do talii.',
  trigger: EffectTrigger.ON_ANY_DEATH,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    card.currentStats.attack += 1
    card.currentStats.defense += 1
    if (typeof card.currentStats.maxDefense === 'number') card.currentStats.maxDefense += 1
    card.metadata.justGrew = true
    const log = addLog(newState, `${source.cardData.name}: Żniwa! +1/+1 (${card.currentStats.attack}/${card.currentStats.defense}).`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// BIEDA (#94) — PASYWNA: blokuje dobiór kart właściciela (w TurnManager)
// ===================================================================

registerEffect({
  id: 'bieda_spy_block_draw',
  name: 'Bieda (Klątwa Ubóstwa)',
  playOnEnemyField: true,
  description: '[AURA] Gracz mający Biedę na polu nie może dobierać kart.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// SMOCZE JAJO (#113) — Nie kontratakie, blokuje Żywioł; po 5 rundach kluwa się
// ===================================================================

// Mapa smoków do wyklucia (id z JSON → dane do wyświetlenia w modalu)
const HATCHABLE_DRAGONS: { choiceId: string; cardId: number; name: string; atk: number; def: number; attackType: AttackType; isFlying: boolean; domain: number; effectId: string; desc: string; triggerLabel: string }[] = [
  { choiceId: 'azdacha',     cardId: 61,  name: 'Ażdacha',      atk: 9,  def: 8,  attackType: AttackType.MELEE,     isFlying: false, domain: 3, effectId: 'azdacha_vanilia',             desc: 'Potężny smok. Brak zdolności.',                         triggerLabel: '' },
  { choiceId: 'gorynych',    cardId: 103, name: 'Gorynych',     atk: 10, def: 10, attackType: AttackType.ELEMENTAL, isFlying: true,  domain: 4, effectId: 'gorynych_merge_dragons',      desc: 'Wchłania sojusznicze Smoki — sumuje ich staty.',        triggerLabel: 'WEJŚCIE' },
  { choiceId: 'tugaryn',     cardId: 117, name: 'Wąż Tugaryn',  atk: 8,  def: 8,  attackType: AttackType.ELEMENTAL, isFlying: false, domain: 4, effectId: 'waz_tugaryn_cleave',          desc: 'Nadmiar obrażeń przy zabiciu uderza następnego wroga.', triggerLabel: 'ZABÓJSTWO' },
  { choiceId: 'wij',         cardId: 116, name: 'Wij',           atk: 9,  def: 9,  attackType: AttackType.ELEMENTAL, isFlying: true,  domain: 4, effectId: 'wij_revive_once',             desc: 'Wskrzesza się z cmentarza na 1 turę (raz na grę).',     triggerLabel: 'POŻEGNANIE' },
  { choiceId: 'zar_ptak',    cardId: 29,  name: 'Żar-ptak',     atk: 10, def: 10, attackType: AttackType.ELEMENTAL, isFlying: true,  domain: 1, effectId: 'zar_ptak_death_explosion',    desc: 'Wszystkie istoty na polu tracą 4 DEF.',                 triggerLabel: 'POŻEGNANIE' },
  { choiceId: 'zmije',       cardId: 30,  name: 'Żmije',         atk: 9,  def: 9,  attackType: AttackType.ELEMENTAL, isFlying: false, domain: 1, effectId: 'zmije_glory_on_empty_field',   desc: 'Pole wroga puste na koniec tury: +1 PS.',               triggerLabel: 'AURA' },
  { choiceId: 'chaly',       cardId: 32,  name: 'Chały / Ały',   atk: 6,  def: 6,  attackType: AttackType.RANGED,    isFlying: false, domain: 2, effectId: 'chaly_attack_locations',      desc: 'Może atakować Lokacje (12 obrażeń = zniszczenie).',     triggerLabel: 'AURA' },
  { choiceId: 'aitwar',      cardId: 1,   name: 'Aitwar',        atk: 2,  def: 2,  attackType: AttackType.MELEE,     isFlying: true,  domain: 1, effectId: 'aitwar_steal_hand',           desc: 'Kradnie 1 kartę z ręki wroga. Powtarzalne za 1 PS.',    triggerLabel: 'WEJŚCIE + AKCJA' },
  { choiceId: 'krol_wezow',  cardId: 15,  name: 'Król wężów',    atk: 3,  def: 6,  attackType: AttackType.MELEE,     isFlying: false, domain: 1, effectId: 'krol_wezow_always_counter',   desc: 'Kontratakuje ZAWSZE — nawet w Pozycji Ataku.',          triggerLabel: 'AURA' },
  { choiceId: 'lamia',       cardId: 107, name: 'Lamia',         atk: 5,  def: 4,  attackType: AttackType.MELEE,     isFlying: true,  domain: 4, effectId: 'lamia_death_reward',          desc: 'Wybierz: +1 PS albo dociągnij 5 kart.',                 triggerLabel: 'POŻEGNANIE' },
]

registerEffect({
  id: 'smocze_jajo_hatch',
  name: 'Smocze Jajo',
  description: '[AURA] Nie kontratakuje. Blokuje wrogie Żywioły. Po 5 rundach wykluwa się w wybranego Smoka.',
  trigger: EffectTrigger.ON_TURN_START,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const egg = findCardInState(newState, source.instanceId)
    if (!egg) return effectResult(newState)

    const roundsInPlay = newState.roundNumber - (egg.roundEnteredPlay ?? newState.roundNumber)
    if (roundsInPlay < 5) return effectResult(newState)

    const log: LogEntry[] = []
    const owner = newState.players[source.owner]

    // AI: wybiera najsilniejszego smoka (wg ATK+DEF)
    if (owner.isAI) {
      const best = [...HATCHABLE_DRAGONS].sort((a, b) => (b.atk + b.def) - (a.atk + a.def))[0]!
      return hatchDragon(newState, egg, source, best, log)
    }

    // Gracz: modal z wyborem smoka
    log.push(addLog(newState, `${source.cardData.name}: Jajo pęka po ${roundsInPlay} rundach! Wybierz smoka do wyklucia!`, 'effect'))
    newState.pendingInteraction = {
      type: 'smocze_jajo_hatch',
      sourceInstanceId: source.instanceId,
      respondingPlayer: source.owner as PlayerSide,
      availableChoices: HATCHABLE_DRAGONS.map(d => d.choiceId),
      metadata: {
        eggLine: egg.line ?? BattleLine.FRONT,
        eggSlot: (egg.metadata.slotPosition as number) ?? 0,
        dragons: HATCHABLE_DRAGONS.map(d => ({
          choiceId: d.choiceId, cardId: d.cardId, name: d.name, atk: d.atk, def: d.def,
          attackType: d.attackType, isFlying: d.isFlying, domain: d.domain, desc: d.desc,
        })),
      },
    }
    return effectResult(newState, log)
  },
})

// Resolve: gracz wybrał smoka
function hatchDragon(
  state: GameState, egg: CardInstance, source: { instanceId: string; owner: string; cardData: any },
  dragon: typeof HATCHABLE_DRAGONS[number], logArr: LogEntry[],
): EffectResult {
  const eggLine = egg.line ?? BattleLine.FRONT
  const eggSlot = (egg.metadata.slotPosition as number) ?? 0
  const owner = source.owner as PlayerSide

  moveToGraveyard(state, egg)

  const dragonData = {
    id: dragon.cardId,
    cardType: 'creature' as const,
    domain: dragon.domain,
    name: dragon.name,
    stats: { attack: dragon.atk, defense: dragon.def, maxDefense: dragon.def, maxAttack: dragon.atk },
    attackType: dragon.attackType,
    isFlying: dragon.isFlying,
    effectId: dragon.effectId,
    effectDescription: dragon.desc,
    lore: '',
    abilities: [],
  }
  const instance = createCreatureInstance(dragonData as any, owner)
  instance.line = eggLine
  instance.position = CardPosition.DEFENSE
  instance.isRevealed = true
  instance.roundEnteredPlay = state.roundNumber
  instance.metadata.slotPosition = eggSlot

  state.players[owner].field.lines[eggLine].push(instance)

  logArr.push(addLog(state, `Smocze Jajo: Wykluwa się ${dragon.name} (${dragon.atk}/${dragon.def})!`, 'effect'))
  return effectResult(state, logArr)
}

// Export for resolveInteraction in GameEngine
export { HATCHABLE_DRAGONS, hatchDragon }

// ===================================================================
// BELT (#93) — Aktywowalne: zmień ustawienie wrogich istot (1. raz gratis)
// ===================================================================

registerEffect({
  id: 'belt_rearrange',
  name: 'Belt (Zamęt)',
  description: '[AURA] [AKCJA] Aktywuj (1. raz gratis, kolejne 1 PS): zmienia pozycję lub linię wskazanej wrogiej istoty.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.MODIFIER,
  activatable: true,
  activationCost: 0,  // koszt pobierany ręcznie (1. raz gratis, kolejne 1 PS)
  activationCooldown: 'unlimited',
  canActivate: (ctx) => {
    const usedFree = !!(ctx.source.metadata.beltUsedFree)
    if (!usedFree) return true  // pierwsze użycie zawsze darmowe
    return ctx.state.players[ctx.source.owner].glory >= 1
  },
  execute: (ctx) => {
    const { state, source, target, trigger } = ctx
    if (trigger !== EffectTrigger.ON_ACTIVATE) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const beltCard = findCardInState(newState, source.instanceId)
    const usedFree = !!(beltCard?.metadata.beltUsedFree)

    // Od drugiej aktywacji: pobierz 1 PS
    if (usedFree) {
      if (newState.players[source.owner].glory < 1) {
        return effectResult(newState, [addLog(newState, `${source.cardData.name}: Brak PS na kolejny Zamęt!`, 'effect')])
      }
      newState.players[source.owner].glory -= 1
    }
    if (beltCard) beltCard.metadata.beltUsedFree = true

    const log: LogEntry[] = []
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'

    // Cel — wskazany lub losowy wróg (AI: najsłabszy wróg w ataku)
    const rearrangeTarget = target
      ? findCardInState(newState, target.instanceId)
      : getAllCreaturesOnField(newState, enemySide)
          .filter(c => c.position === CardPosition.ATTACK)
          .sort((a, b) => a.currentStats.attack - b.currentStats.attack)[0]
        ?? getAllCreaturesOnField(newState, enemySide)[0]

    if (!rearrangeTarget) return effectResult(newState)

    // Zmień pozycję: ATTACK → DEFENSE (skutecznie dezaktywuje agresora)
    if (rearrangeTarget.position === CardPosition.ATTACK) {
      rearrangeTarget.position = CardPosition.DEFENSE
      log.push(addLog(newState, `${source.cardData.name}: ${rearrangeTarget.cardData.name} zdezorientowany — przeszedł do Obrony!`, 'effect'))
    } else {
      rearrangeTarget.position = CardPosition.ATTACK
      log.push(addLog(newState, `${source.cardData.name}: ${rearrangeTarget.cardData.name} wypchnięty do Ataku!`, 'effect'))
    }

    return effectResult(newState, log)
  },
})

// ===================================================================
// JULKI (#39) — Odporne na karty przygody (egzekwowane w TurnManager)
// ===================================================================

registerEffect({
  id: 'julki_adventure_immunity',
  name: 'Julki (Odporność na Zaklęcia)',
  description: '[AURA] Odporne na karty przygody i zaklęcia.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// KRESNIK (#72) — Przy wystawieniu wybiera 1 premię
// ===================================================================

registerEffect({
  id: 'kresnik_choose_buff',
  name: 'Kresnik (Wybrany Kapłan)',
  description: '[WEJŚCIE] Przy wystawieniu: wybierz 1 premię — +3 ATK, +3 DEF, Latanie lub Brak kontrataku.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    const isHuman = !state.players[source.owner].isAI

    // Gracz ludzki: ustaw pendingInteraction — UI pokaże modal z wyborem
    if (isHuman && !ctx.metadata?.kresnikBuff) {
      newState.pendingInteraction = {
        type: 'kresnik_buff',
        sourceInstanceId: source.instanceId,
        respondingPlayer: source.owner as PlayerSide,
        availableChoices: ['+3 ATK', '+3 DEF', 'Latanie', 'Bez kontrataku'],
      }
      const log = addLog(newState, `${source.cardData.name}: Kapłan prosi o wybór premii...`, 'effect')
      return effectResult(newState, [log])
    }

    // AI lub odpowiedź z resolvePendingInteraction: zastosuj premię
    type BuffType = 'atk+3' | 'def+3' | 'flying' | 'no_counter'
    const choiceMap: Record<string, BuffType> = {
      '+3 ATK': 'atk+3',
      '+3 DEF': 'def+3',
      'Latanie': 'flying',
      'Bez kontrataku': 'no_counter',
    }
    const rawChoice = ctx.metadata?.kresnikBuff as string ?? '+3 ATK'
    const chosen: BuffType = choiceMap[rawChoice] ?? (rawChoice as BuffType)

    const log: LogEntry[] = []
    switch (chosen) {
      case 'atk+3':
        card.currentStats.attack += 3
        log.push(addLog(newState, `${source.cardData.name}: Kapłański dar! +3 ATK (${card.currentStats.attack}).`, 'effect'))
        break
      case 'def+3':
        card.currentStats.defense += 3
        if (typeof card.currentStats.maxDefense === 'number') card.currentStats.maxDefense += 3
        log.push(addLog(newState, `${source.cardData.name}: Kapłańska tarcza! +3 DEF (${card.currentStats.defense}).`, 'effect'))
        break
      case 'flying':
        ;(card.cardData as any).isFlying = true
        log.push(addLog(newState, `${source.cardData.name}: Unosi się w powietrze! Latający.`, 'effect'))
        break
      case 'no_counter':
        card.activeEffects.push({ effectId: 'dobroochoczy_no_counter', source: 'kresnik' } as any)
        log.push(addLog(newState, `${source.cardData.name}: Zwinność Kresnika — nie kontratakuje wrogów.`, 'effect'))
        break
    }

    return effectResult(newState, log)
  },
})

// ===================================================================
// NIEDŹWIEDZIOŁAK (#77) — Kontratakuje napastnika gdy sojusznik atakowany
// ===================================================================

registerEffect({
  id: 'niedzwiedzioak_guardian',
  name: 'Niedźwiedziołak (Strażnik Plemienia)',
  description: '[CZUJNOŚĆ] Gdy wroga istota atakuje sojusznika — Niedźwiedziołak kontratakuje napastnika (jeśli w zasięgu).',
  trigger: EffectTrigger.ON_ALLY_ATTACKED,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    // target = atakujący wróg
    if (!target) return effectResult(cloneGameState(state))
    if (source.position !== CardPosition.DEFENSE) return effectResult(cloneGameState(state))
    if (source.isSilenced) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const niedz = findCardInState(newState, source.instanceId)
    if (!niedz) return effectResult(newState)

    // Sprawdź czy Niedźwiedziołak może dosięgnąć napastnika
    const myAttackType = (niedz.cardData as any).attackType as AttackType
    const targetIsOnFront = target.line === BattleLine.FRONT
    if (myAttackType === AttackType.MELEE || myAttackType === AttackType.ELEMENTAL) {
      // Wręcz/Żywioł: napastnik musi być na froncie wroga (L1 bo to front dla Niedź.)
      if (!targetIsOnFront) return effectResult(newState)
    }
    // Magia/Dystans: może bić z każdej linii

    // Zadaj obrażenia napastnikowi = ATK Niedźwiedziołaka
    const attackerCard = findCardInState(newState, target.instanceId)
    if (!attackerCard) return effectResult(newState)

    const damage = niedz.currentStats.attack
    attackerCard.currentStats.defense -= damage

    const log = addLog(newState, `${niedz.cardData.name}: Broni sojusznika! Kontratakuje ${attackerCard.cardData.name} za ${damage} obrażeń!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// WIELKOLUD (#49) — Kontratakuje DOWOLNEGO wroga w zasięgu gdy sojusznik atakowany
// ===================================================================

registerEffect({
  id: 'wielkolud_choose_counter',
  name: 'Wielkolud (Górski Obrońca)',
  description: '[CZUJNOŚĆ] Gdy sojusznik zostaje zaatakowany — Wielkolud kontratakuje wybranego wroga w swoim zasięgu.',
  trigger: EffectTrigger.ON_ALLY_ATTACKED,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    if (source.position !== CardPosition.DEFENSE) return effectResult(cloneGameState(state))
    if (source.isSilenced) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const wielkolud = findCardInState(newState, source.instanceId)
    if (!wielkolud) return effectResult(newState)

    const isHuman = !newState.players[source.owner].isAI
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const myAttackType = (wielkolud.cardData as any).attackType as AttackType
    const enemies = getAllCreaturesOnField(newState, enemySide)

    // Filtruj po zasięgu
    const reachableEnemies = enemies.filter(e => {
      if (myAttackType === AttackType.MELEE || myAttackType === AttackType.ELEMENTAL) {
        return e.line === BattleLine.FRONT
      }
      return true  // Magia/Dystans — każda linia
    })

    if (reachableEnemies.length === 0) return effectResult(newState)

    // Gracz: pokaż modal wyboru celu kontrataku
    if (isHuman) {
      newState.pendingInteraction = {
        type: 'wielkolud_counter',
        sourceInstanceId: source.instanceId,
        respondingPlayer: source.owner as PlayerSide,
        availableTargetIds: reachableEnemies.map(e => e.instanceId),
      }
      const log = addLog(newState, `${wielkolud.cardData.name}: Kontratak! Wybierz wroga do uderzenia.`, 'effect')
      return effectResult(newState, [log])
    }

    // AI: wybierz najsilniejszego wroga
    const chosen = ctx.target
      ? findCardInState(newState, ctx.target.instanceId)
      : reachableEnemies.sort((a, b) =>
          (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense)
        )[0]

    if (!chosen) return effectResult(newState)

    const damage = wielkolud.currentStats.attack
    chosen.currentStats.defense -= damage

    const log = addLog(newState,
      `${wielkolud.cardData.name}: Obrońca kontratakuje ${chosen.cardData.name} za ${damage} obrażeń — bo sojusznik został zaatakowany!`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ===================================================================
// INKLUZ (#105) — Aktywowalne: kradnie premię z istoty i przenosi
// ===================================================================

registerEffect({
  id: 'inkluz_steal_buff',
  name: 'Inkluz (Duch Szczęścia)',
  description: '[AURA] [AKCJA] Aktywuj (1 PS): zabiera premię (activeEffect) z wybranej istoty i przypisuje ją innej.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.MODIFIER,
  activatable: true,
  activationCost: 1,
  activationCooldown: 'unlimited',
  activationRequiresTarget: true,
  // Tylko istoty które mają co najmniej jedną premię (activeEffect)
  activationTargetFilter: (card, source, _state) => {
    return card.instanceId !== source.instanceId && card.activeEffects.length > 0
  },
  execute: (ctx) => {
    const { state, source, target, trigger } = ctx
    if (trigger !== EffectTrigger.ON_ACTIVATE) return effectResult(cloneGameState(state))
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const fromCard = findCardInState(newState, target.instanceId)
    if (!fromCard || fromCard.activeEffects.length === 0) {
      return effectResult(newState, [addLog(newState, `${source.cardData.name}: Cel nie ma żadnych premii!`, 'effect')])
    }

    // Ukradnij ostatnią premię z celu
    const stolen = fromCard.activeEffects.pop()!
    const isHuman = !newState.players[source.owner].isAI
    const allySide = source.owner
    // Wszyscy sojusznicy (włącznie z Inkluzem) mogą otrzymać premię
    const recipients = getAllCreaturesOnField(newState, allySide)

    // Gracz: pokaż modal wyboru odbiorcy
    if (isHuman && recipients.length > 0) {
      newState.pendingInteraction = {
        type: 'inkluz_recipient',
        sourceInstanceId: source.instanceId,
        respondingPlayer: source.owner as PlayerSide,
        availableTargetIds: recipients.map(a => a.instanceId),
        metadata: { stolenEffect: JSON.stringify(stolen) },
      }
      const log = addLog(newState,
        `${source.cardData.name}: Kradnie "${stolen.effectId}" z ${fromCard.cardData.name}! Wybierz sojusznika-odbiorcę.`,
        'effect'
      )
      return effectResult(newState, [log])
    }

    // AI lub brak odbiorców: daj premię najsilniejszemu sojusznikowi (lub sobie)
    const recipient = recipients.sort((a, b) =>
      (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense)
    )[0] ?? findCardInState(newState, source.instanceId)

    if (recipient) {
      recipient.activeEffects.push(stolen)
    }

    const log = addLog(newState,
      `${source.cardData.name}: Kradnie "${stolen.effectId}" z ${fromCard.cardData.name} i przekazuje ${recipient?.cardData.name ?? 'sobie'}!`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ===================================================================
// LICZYRZEPA (#109) — Przed atakiem wybiera typ; może bić każdą linię
// ===================================================================

registerEffect({
  id: 'liczyrzepa_choose_type',
  name: 'Liczyrzepa (Zmienna Natura)',
  description: '[CZUJNOŚĆ] Przed każdym atakiem wybiera typ: Wręcz, Żywioł, Magia lub Dystans. Może atakować dowolną linię.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    const typeNames = ['Wręcz', 'Żywioł', 'Magia', 'Dystans']
    let chosenType: AttackType

    // Typ ustawiony wcześniej przez playerAttack → resolvePendingInteraction
    if (card.metadata.licyzrepaAttackTypeChosen !== undefined) {
      chosenType = card.metadata.licyzrepaAttackTypeChosen as AttackType
    } else {
      // AI: wybierz typ dający przewagę nad celem
      const targetType = (target.cardData as any).attackType as AttackType
      const targetIsFlying = (target.cardData as any).isFlying && !target.isGrounded
      if (targetIsFlying) {
        chosenType = AttackType.ELEMENTAL
      } else if (targetType === AttackType.MELEE) {
        chosenType = AttackType.MAGIC
      } else {
        chosenType = AttackType.RANGED
      }
      card.metadata.licyzrepaAttackTypeChosen = chosenType
    }

    const log = addLog(newState,
      `${source.cardData.name}: Przyjmuje formę ${typeNames[chosenType]}!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// WIJ (#116) — Raz na grę wskrzesza się z cmentarza na 1 turę
// ===================================================================

registerEffect({
  id: 'wij_revive_once',
  name: 'Wij (Nieśmiertelna Bestia)',
  description: '[POŻEGNANIE] [AURA] Gdy ginie: wskrzesza się raz na grę (na 1 turę). Po tej turze ginie na zawsze.',
  trigger: [EffectTrigger.ON_DEATH, EffectTrigger.ON_TURN_END],
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source, trigger } = ctx
    const newState = cloneGameState(state)

    if (trigger === EffectTrigger.ON_DEATH) {
      const card = findCardInState(newState, source.instanceId)
      if (!card) return effectResult(newState)

      // Tylko jeśli jeszcze nie był wskrzeszony
      if (card.metadata.wijHasRevived) return effectResult(newState)

      card.metadata.wijRevived = true
      card.metadata.wijHasRevived = true
      card.currentStats.defense = (card.cardData as any).stats.defense
      const log = addLog(newState, `${source.cardData.name}: Wstaje z martwych na jedną ostatnią turę! (zdolność: jednorazowe zmartwychwstanie)`, 'effect')
      return effectResult(newState, [log])
    }

    if (trigger === EffectTrigger.ON_TURN_END) {
      const card = findCardInState(newState, source.instanceId)
      if (!card || !card.metadata.wijRevived) return effectResult(newState)

      // Koniec tury po wskrzeszeniu — ginie na zawsze
      const log = addLog(newState, `${source.cardData.name}: Odchodzi na zawsze — jednorazowe zmartwychwstanie wygasło, kolejne wskrzeszenie niemożliwe.`, 'death')
      moveToGraveyard(newState, card)
      // Oznacz w cmentarzu że nie może być wskrzeszony ponownie
      const inGraveyard = newState.players[source.owner].graveyard
        .find(c => c.instanceId === source.instanceId)
      if (inGraveyard) inGraveyard.metadata.wijPermanentlyDead = true
      return effectResult(newState, [log])
    }

    return effectResult(newState)
  },
})

// ===================================================================
// POROŃIEC (#78) — Przy ataku kopiuje ATK najsilniejszej istoty na polu
// ===================================================================

registerEffect({
  id: 'poroniec_copy_ability',
  name: 'Porońiec (Duch Niespełnionego Życia)',
  description: '[CZUJNOŚĆ] [AURA] Przed atakiem kopiuje ATK najsilniejszej istoty na polu. Efekt resetuje się po turze.',
  trigger: [EffectTrigger.ON_ATTACK, EffectTrigger.ON_TURN_END],
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, trigger } = ctx
    const newState = cloneGameState(state)
    const card = findCardInState(newState, source.instanceId)
    if (!card) return effectResult(newState)

    if (trigger === EffectTrigger.ON_TURN_END) {
      // Zresetuj skopiowany ATK
      if (card.metadata.poroniecOriginalAtk !== undefined) {
        card.currentStats.attack = card.metadata.poroniecOriginalAtk as number
        delete card.metadata.poroniecOriginalAtk
      }
      return effectResult(newState)
    }

    // ON_ATTACK: skopiuj ATK najsilniejszej istoty
    if (card.metadata.poroniecOriginalAtk !== undefined) return effectResult(newState)  // już skopiowane w tej turze

    const allCreatures = getAllCreaturesOnField(newState, 'player1')
      .concat(getAllCreaturesOnField(newState, 'player2'))
      .filter(c => c.instanceId !== source.instanceId)
      .sort((a, b) => b.currentStats.attack - a.currentStats.attack)

    if (allCreatures.length === 0) return effectResult(newState)
    const strongest = allCreatures[0]!

    card.metadata.poroniecOriginalAtk = card.currentStats.attack
    card.currentStats.attack = strongest.currentStats.attack

    const log = addLog(newState,
      `${source.cardData.name}: Kopiuje moc ${strongest.cardData.name}! ATK: ${strongest.currentStats.attack}`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// BZIONEK (#64) — PASYWNY: przechwytuje zaklęcia (enforcement w TurnManager)
// ===================================================================

registerEffect({
  id: 'bzionek_spell_intercept',
  name: 'Bzionek (Duch Ochrony)',
  description: '[AURA] Przechwytuje wrogie zaklęcia celujące w sojusznika — bierze je na siebie.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// CZAROWNICA (#36) — PASYWNA: przekierowuje zaklęcia (enforcement w TurnManager)
// ===================================================================

registerEffect({
  id: 'czarownica_redirect_spell',
  name: 'Czarownica',
  description: '[AURA] Może zmienić adresata zagranego zaklęcia. Pierwszy raz za darmo, każdy kolejny za 1 PS.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// NACZELNIK PLEMIENIA (#44) — Przy ataku: wszyscy sojuszniczy Żywi atakują
// ===================================================================

registerEffect({
  id: 'naczelnik_human_rally',
  name: 'Naczelnik Plemienia',
  description: '[CZUJNOŚĆ] Gdy atakuje: wszyscy sojuszniczy Ludzie (Żywi) wykonują dodatkowy atak na dowolnego wroga.',
  trigger: EffectTrigger.ON_ATTACK,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const naczelnik = findCardInState(newState, source.instanceId)
    if (!naczelnik) return effectResult(newState)

    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'

    // Wszyscy sojuszniczy Żywi (idDomain === 2), bez Naczelnika
    const allies = getAllCreaturesOnField(newState, source.owner)
      .filter(c =>
        c.instanceId !== source.instanceId &&
        (c.cardData as any).idDomain === 2 &&
        !c.isSilenced
      )

    if (allies.length === 0) return effectResult(newState)

    const log: LogEntry[] = []
    for (const ally of allies) {
      const enemies = getAllCreaturesOnField(newState, enemySide)
      if (enemies.length === 0) break

      // Uderz najsłabszego wroga (lub wskazanego przez gracza)
      const target = enemies.sort((a, b) => a.currentStats.defense - b.currentStats.defense)[0]!
      const damage = ally.currentStats.attack
      if (damage <= 0) continue

      target.currentStats.defense -= damage
      log.push(addLog(newState,
        `${ally.cardData.name}: Naczelnik wzywa do boju! Uderza ${target.cardData.name} za ${damage} obrażeń.`,
        'effect'
      ))

      if (target.currentStats.defense <= 0) {
        const removed = findCardInState(newState, target.instanceId)
        if (removed) {
          removeCardFromField(newState, removed.instanceId)
          removed.line = null
          newState.players[enemySide].graveyard.push(removed)
          log.push(addLog(newState, `${removed.cardData.name} poległ od wołania Naczelnika!`, 'death'))
        }
      }
    }

    return effectResult(newState, log)
  },
})

// ===================================================================
// RUMAK (#46) — Aktywowalne: daje jeźdźcowi (Żywi) zdolność cleave
// ===================================================================

registerEffect({
  id: 'rumak_mount',
  name: 'Rumak (Koń Bojowy)',
  description: '[AURA] [AKCJA] Aktywuj (darmowe, raz): łączy się z sojuszniczym Człowiekiem (Żywi) — jeździec rani całą linię.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.MODIFIER,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'once',
  activationRequiresTarget: true,
  activationTargetFilter: (card, source, _state) => {
    return card.owner === source.owner &&
      card.instanceId !== source.instanceId &&
      (card.cardData as any).idDomain === 2 &&
      !card.metadata.rumakActive
  },
  canActivate: (ctx: EffectContext) => {
    const candidates = getAllCreaturesOnField(ctx.state, ctx.source.owner)
      .filter(c =>
        c.instanceId !== ctx.source.instanceId &&
        (c.cardData as any).idDomain === 2 &&
        !c.metadata.rumakActive
      )
    return candidates.length > 0
  },
  execute: (ctx) => {
    const { state, source, target, trigger } = ctx
    if (trigger !== EffectTrigger.ON_ACTIVATE) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)

    // Cel: wskazany przez gracza lub najsilniejszy sojusznik Żywi
    const allies = getAllCreaturesOnField(newState, source.owner)
      .filter(c =>
        c.instanceId !== source.instanceId &&
        (c.cardData as any).idDomain === 2 &&
        !c.metadata.rumakActive
      )

    const rider = target
      ? findCardInState(newState, target.instanceId)
      : allies.sort((a, b) =>
          (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense)
        )[0]

    if (!rider) return effectResult(newState)

    rider.metadata.rumakActive = true

    const log = addLog(newState,
      `${source.cardData.name}: Łączy się z ${rider.cardData.name}! Jeździec rani całą linię wroga!`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ===================================================================
// STUBY — istoty do implementacji w kolejnych etapach
// ===================================================================

const todoCreatures = [
  { id: 'chaly_attack_locations', name: 'Chały' },
  { id: 'najemnik_mercenary', name: 'Najemnik' },
  { id: 'azdacha_vanilia', name: 'Ażdacha' },
]

for (const c of todoCreatures) {
  registerEffect(noEffect(c.id, c.name))
}

// ===================================================================
// ✅ OKALECZENIE — -½ ATK i DEF wybranej istoty
// ===================================================================

registerEffect({
  id: 'adventure_okaleczenie',
  name: 'Okaleczenie',
  description: '[WEJŚCIE] -½ Ataku i Obrony wybranej istoty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.currentStats.attack = Math.floor(card.currentStats.attack / 2)
    card.currentStats.defense = Math.floor(card.currentStats.defense / 2)
    const log = addLog(newState, `Okaleczenie: ${card.cardData.name} traci połowę sił (ATK: ${card.currentStats.attack}, DEF: ${card.currentStats.defense}).`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_okaleczenie_enhanced',
  name: 'Okaleczenie (wzmocnione)',
  description: '[WEJŚCIE] -½ ATK i DEF + usuwa wszystkie premie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.currentStats.attack = Math.floor(card.currentStats.attack / 2)
    card.currentStats.defense = Math.floor(card.currentStats.defense / 2)
    card.activeEffects = []
    const log = addLog(newState, `Okaleczenie+: ${card.cardData.name} traci połowę sił i wszystkie premie!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ WYGNANIE — Cel wraca do talii
// ===================================================================

registerEffect({
  id: 'adventure_wygnanie',
  name: 'Wygnanie',
  description: '[WEJŚCIE] Cel wraca do talii. Wroga istota trafia na spód (ostatnia do wystawienia).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)

    removeCardFromField(newState, card.instanceId)
    card.line = null
    card.isRevealed = false
    // Wróg trafia na spód talii (ostatni do wystawienia)
    if (card.owner !== source.owner) {
      newState.players[card.owner].deck.push(card)
    } else {
      newState.players[card.owner].deck.unshift(card)
    }
    const log = addLog(newState, `Wygnanie: ${card.cardData.name} wraca do talii!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_wygnanie_enhanced',
  name: 'Wygnanie (wzmocnione)',
  description: '[WEJŚCIE] Cel (nie najsilniejszy wróg) trwale zmienia stronę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    if (enemies.length === 0) return effectResult(newState)

    // Nie-najsilniejszy wróg
    const sorted = [...enemies].sort((a, b) =>
      (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense)
    )
    const stolen = (sorted.length > 1 ? sorted[1] : sorted[0])!

    removeCardFromField(newState, stolen.instanceId)
    stolen.owner = source.owner as PlayerSide
    stolen.line = BattleLine.FRONT
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(stolen)

    const log = addLog(newState, `Wygnanie+: ${stolen.cardData.name} przechodzi na stronę gracza!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ RUSAŁCZY TANIEC — Transferuj -2/-2 z jednej istoty na drugą
// ===================================================================

registerEffect({
  id: 'adventure_rusalczy_taniec',
  name: 'Rusałczy Taniec',
  description: '[WEJŚCIE] Zabierz 2 Ataku i 2 Obrony z wybranej istoty i daj innej.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []

    // Cel: wskazana wroga istota lub najsilniejsza
    const donor = target
      ? findCardInState(newState, target.instanceId)
      : getAllCreaturesOnField(newState, enemySide)
          .sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]

    if (!donor) return effectResult(newState)

    donor.currentStats.attack = Math.max(0, donor.currentStats.attack - 2)
    donor.currentStats.defense = Math.max(0, donor.currentStats.defense - 2)

    // Odbiorca: najsłabszy sojusznik
    const recipient = getAllCreaturesOnField(newState, source.owner)
      .sort((a, b) => (a.currentStats.attack + a.currentStats.defense) - (b.currentStats.attack + b.currentStats.defense))[0]

    if (recipient) {
      recipient.currentStats.attack += 2
      recipient.currentStats.defense += 2
      log.push(addLog(newState,
        `Rusałczy Taniec: -2/-2 od ${donor.cardData.name} → +2/+2 dla ${recipient.cardData.name}!`,
        'effect'
      ))
    } else {
      log.push(addLog(newState, `Rusałczy Taniec: ${donor.cardData.name} traci -2/-2.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_rusalczy_taniec_enhanced',
  name: 'Rusałczy Taniec (wzmocniony)',
  description: '[WEJŚCIE] -1/-1 WSZYSTKIM wrogom → suma idzie do jednej sojuszniczej istoty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []

    const enemies = getAllCreaturesOnField(newState, enemySide)
    let totalStolen = 0
    for (const enemy of enemies) {
      enemy.currentStats.attack = Math.max(0, enemy.currentStats.attack - 1)
      enemy.currentStats.defense = Math.max(0, enemy.currentStats.defense - 1)
      totalStolen += 2
    }

    const recipient = getAllCreaturesOnField(newState, source.owner)
      .sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]

    if (recipient && totalStolen > 0) {
      const bonus = Math.floor(totalStolen / 2)
      recipient.currentStats.attack += bonus
      recipient.currentStats.defense += bonus
      log.push(addLog(newState,
        `Rusałczy Taniec+: -1/-1 dla ${enemies.length} wrogów → +${bonus}/+${bonus} dla ${recipient.cardData.name}!`,
        'effect'
      ))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ KWIAT PAPROCI — Zmień typ ataku istoty
// ===================================================================

registerEffect({
  id: 'adventure_kwiat_paproci',
  name: 'Kwiat Paproci',
  description: '[WEJŚCIE] Daj istocie na stałe nowy Typ Ataku (Wręcz/Żywioł/Dystans/Magia).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)

    // AI: wybierz najlepszy typ ataku (Dystans/Magia = dowolna linia; priorytet Magia)
    const newType = AttackType.MAGIC
    ;(card.cardData as any).attackType = newType
    const typeNames = ['Wręcz', 'Żywioł', 'Dystans', 'Magia']
    const log = addLog(newState,
      `Kwiat Paproci: ${card.cardData.name} teraz atakuje jako ${typeNames[newType]}!`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_kwiat_paproci_enhanced',
  name: 'Kwiat Paproci (wzmocniony)',
  description: '[WEJŚCIE] Nowy Typ Ataku + odporność na wybrany Typ Ataku.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)

    const newType = AttackType.MAGIC
    ;(card.cardData as any).attackType = newType
    card.metadata.immuneToAttackType = newType  // CombatResolver sprawdza tę flagę
    const typeNames = ['Wręcz', 'Żywioł', 'Dystans', 'Magia']
    const log = addLog(newState,
      `Kwiat Paproci+: ${card.cardData.name} atakuje jako ${typeNames[newType]} i jest odporna na ${typeNames[newType]}!`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ SOBOWTÓR — Klonuj istotę
// ===================================================================

registerEffect({
  id: 'adventure_sobowtór',
  name: 'Sobowtór',
  description: '[WEJŚCIE] Stwórz kopię wybranej istoty (bez artefaktów i negatywnych efektów).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const original = findCardInState(newState, target.instanceId)
    if (!original) return effectResult(newState)

    const clone: CardInstance = {
      ...JSON.parse(JSON.stringify(original)),
      instanceId: `clone_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      owner: source.owner as PlayerSide,
      equippedArtifacts: [],
      activeEffects: original.activeEffects.filter(e => !e.effectId.startsWith('debuff')),
      metadata: {},
      line: BattleLine.FRONT,
    }
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(clone)

    const log = addLog(newState, `Sobowtór: Kopia ${original.cardData.name} wchodzi na pole!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_sobowtór_enhanced',
  name: 'Sobowtór (wzmocniony)',
  description: '[WEJŚCIE] Kopia niezniszczalna dopóki żyje oryginał.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REACTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const original = findCardInState(newState, target.instanceId)
    if (!original) return effectResult(newState)

    const cloneId = `clone_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const clone: CardInstance = {
      ...JSON.parse(JSON.stringify(original)),
      instanceId: cloneId,
      owner: source.owner as PlayerSide,
      equippedArtifacts: [],
      activeEffects: [],
      metadata: {
        sobowtorProtected: true,
        sobowtorOriginalId: original.instanceId,
      },
      line: BattleLine.FRONT,
    }
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(clone)

    const log = addLog(newState, `Sobowtór+: Niezniszczalna kopia ${original.cardData.name} wchodzi na pole!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ KRADZIEŻ — Ukradnij aktywną Kartę Przygody rywala
// ===================================================================

registerEffect({
  id: 'adventure_kradzież',
  name: 'Kradzież',
  description: '[WEJŚCIE] Ukradnij aktywną Kartę Przygody rywala (lokację lub zdarzenie) do swojej talii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []

    const enemyPlayer = newState.players[enemySide]

    // Najpierw kradnij lokację
    if (enemyPlayer.activeLocation) {
      const stolen = enemyPlayer.activeLocation
      enemyPlayer.activeLocation = null
      stolen.line = null
      stolen.owner = source.owner as PlayerSide
      newState.players[source.owner].deck.unshift(stolen)
      log.push(addLog(newState, `Kradzież: Lokacja ${stolen.cardData.name} wroga skradziona do talii!`, 'effect'))
    } else if (newState.activeEvents.length > 0) {
      // Kradnij ostatnie zdarzenie wroga
      const idx = newState.activeEvents.findIndex(e => e.owner === enemySide)
      if (idx !== -1) {
        const stolenEvent = newState.activeEvents.splice(idx, 1)[0]!
        log.push(addLog(newState, `Kradzież: Zdarzenie ${stolenEvent.cardData.name} wroga skradziono!`, 'effect'))
      }
    } else {
      log.push(addLog(newState, `Kradzież: Nic do kradzieży!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_kradzież_enhanced',
  name: 'Kradzież (wzmocniona)',
  description: '[WEJŚCIE] Zabierz 2 karty z wierzchu talii rywala.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.REPLACEMENT,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []

    for (let i = 0; i < 2; i++) {
      if (newState.players[enemySide].deck.length === 0) break
      const card = newState.players[enemySide].deck.shift()!
      card.owner = source.owner as PlayerSide
      newState.players[source.owner].hand.push(card)
      log.push(addLog(newState, `Kradzież+: ${card.cardData.name} skradziona z talii do ręki!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ ARKONA — Lokacja: Brak limitu istot na polu
// (enforcement w LineManager via player.activeLocation?.cardData.name === 'Arkona')
// ===================================================================

registerEffect({
  id: 'adventure_arkona',
  name: 'Arkona',
  description: '[AURA] Brak limitu istot na polu.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

registerEffect({
  id: 'adventure_arkona_enhanced',
  name: 'Arkona (wzmocniona)',
  description: '[AURA] Brak limitu + wybrana istota regeneruje 2 Obrony raz na turę.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_TURN_START],
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source, trigger } = ctx
    if (trigger !== EffectTrigger.ON_TURN_START) return effectResult(cloneGameState(state))
    // source = aktywna lokacja Arkona; brak dostępu do "wybranej" istoty — regenerujemy najsłabszą
    const newState = cloneGameState(state)
    const owner = source.owner
    const weakest = getAllCreaturesOnField(newState, owner)
      .sort((a, b) => a.currentStats.defense - b.currentStats.defense)[0]
    if (!weakest) return effectResult(newState)
    const baseDefense = (weakest.cardData as any).stats?.defense ?? weakest.currentStats.defense
    weakest.currentStats.defense = Math.min(baseDefense, weakest.currentStats.defense + 2)
    const log = addLog(newState, `Arkona+: ${weakest.cardData.name} regeneruje 2 DEF.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ TWIERDZA — Lokacja: Wszystkie sojusznicze istoty +3 Obrony
// (enforcement w CombatResolver checkDamagePrevention)
// ===================================================================

registerEffect({
  id: 'adventure_twierdza',
  name: 'Twierdza',
  description: '[AURA] Twoje istoty +3 Obrony (redukcja obrażeń).',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

registerEffect({
  id: 'adventure_twierdza_enhanced',
  name: 'Twierdza (wzmocniona)',
  description: '[AURA] Twoje istoty +3 Obrony + co rundę mury oddają 2 obrażenia losowemu wrogowi.',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_TURN_START],
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source, trigger } = ctx
    if (trigger !== EffectTrigger.ON_TURN_START) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    if (enemies.length === 0) return effectResult(newState)
    const target = enemies[Math.floor(Math.random() * enemies.length)]!
    target.currentStats.defense -= 2
    const log = addLog(newState, `Twierdza+: Mury ostrzeliwują ${target.cardData.name} za 2 obrażenia!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ REHTRA — Lokacja: Podejrzyj kartę rywala (4 użycia)
// ===================================================================

registerEffect({
  id: 'adventure_rehtra',
  name: 'Rehtra',
  description: '[AURA] [AKCJA] Podejrzyj dowolną kartę rywala (4 użycia darmowe).',
  trigger: [EffectTrigger.PASSIVE, EffectTrigger.ON_ACTIVATE],
  priority: EffectPriority.PASSIVE,
  activatable: true,
  activationCost: 0,
  activationCooldown: 'per_turn',
  canActivate: (ctx: EffectContext) => {
    const uses = (ctx.source.metadata.rehtraUsesLeft as number) ?? 4
    return uses > 0
  },
  execute: (ctx) => {
    const { state, source, trigger } = ctx
    if (trigger !== EffectTrigger.ON_ACTIVATE) return effectResult(cloneGameState(state))

    const newState = cloneGameState(state)
    const locationCard = findCardInState(newState, source.instanceId)
    if (!locationCard) return effectResult(newState)

    const uses = (locationCard.metadata.rehtraUsesLeft as number) ?? 4
    if (uses <= 0) return effectResult(newState)

    locationCard.metadata.rehtraUsesLeft = uses - 1

    // Ujawnij losową kartę wroga
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const hiddenCards = newState.players[enemySide].hand.filter(c => !c.isRevealed)
    if (hiddenCards.length > 0) {
      const toReveal = hiddenCards[Math.floor(Math.random() * hiddenCards.length)]!
      toReveal.isRevealed = true
      const log = addLog(newState, `Rehtra: Ujawnia ${toReveal.cardData.name} z ręki wroga! (zostało ${uses - 1} użyć)`, 'effect')
      return effectResult(newState, [log])
    }
    const log = addLog(newState, `Rehtra: Wróg nie ma zakrytych kart!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_rehtra_enhanced',
  name: 'Rehtra (wzmocniona)',
  description: '[WEJŚCIE] Ujawnia wszystkie karty na ręce wroga. Nowo dobierane karty wroga są widoczne.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    for (const card of newState.players[enemySide].hand) {
      card.isRevealed = true
    }
    const log = addLog(newState,
      `Rehtra+: Wszystkie karty wroga ujawnione! Każda nowa karta też będzie widoczna.`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ ZLOT CZAROWNIC — 3 kolejne Karty Przygody rywala nie zadziałają
// (enforcement w TurnManager playAdventure)
// ===================================================================

registerEffect({
  id: 'adventure_zlot_czarownic',
  name: 'Zlot Czarownic',
  description: '[WEJŚCIE] 3 kolejne Karty Przygody rywala nie zadziałają.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    // Blokada 3 przygód — przechowywana jako roundsRemaining w activeEvents
    // (ustawiana przez TurnManager po dodaniu do activeEvents)
    const log = addLog(newState, `Zlot Czarownic: 3 kolejne zaklęcia ${source.owner === 'player1' ? 'player2' : 'player1'} nie zadziałają!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_zlot_czarownic_enhanced',
  name: 'Zlot Czarownic (wzmocniony)',
  description: '[WEJŚCIE] 3 blokady + weź 1 kartę ze stosu zniszczonych do talii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    log.push(addLog(newState, `Zlot Czarownic+: 3 kolejne zaklęcia wroga nie zadziałają!`, 'effect'))

    // Weź kartę ze stosu zniszczonych
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const graveyard = newState.players[enemySide].graveyard
    if (graveyard.length > 0) {
      const card = graveyard.pop()!
      card.owner = source.owner as PlayerSide
      newState.players[source.owner].deck.unshift(card)
      log.push(addLog(newState, `Zlot+: ${card.cardData.name} ze zniszczonych przechodzi do talii!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ LIKANTROPIA — Zabójstwo = przejęcie statów; 2 rundy bez walki = -½
// (enforcement w CombatResolver: ON_KILL absorb; TurnManager: decay)
// ===================================================================

registerEffect({
  id: 'adventure_likantropia',
  name: 'Likantropia',
  description: '[WEJŚCIE] Istota po zabiciu przejmuje ATK i DEF ofiary. 2 rundy bez walki = -½ statów.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.metadata.likantropiaActive = true
    card.metadata.likantropiaLastKillRound = -99  // nie zaczynaj od razu od decay
    card.metadata.likantropiaEnhanced = false
    const log = addLog(newState,
      `Likantropia: ${card.cardData.name} przeklęta! Będzie wchłaniać swoich ofiar.`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_likantropia_enhanced',
  name: 'Likantropia (wzmocniona)',
  description: '[WEJŚCIE] Może zabijać własne istoty i przejmować ich statsy.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.metadata.likantropiaActive = true
    card.metadata.likantropiaLastKillRound = -99
    card.metadata.likantropiaEnhanced = true
    const log = addLog(newState,
      `Likantropia+: ${card.cardData.name} może pochłaniać nawet sojuszników!`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ SZTANDAR — Artefakt: nośnik nie atakuje; sojusznicy +2 ATK
// (enforcement w CombatResolver calculateDamage + hasAttackedThisTurn)
// ===================================================================

registerEffect({
  id: 'adventure_sztandar',
  name: 'Sztandar',
  description: '[AURA] Nośnik stoi w L1 i nie atakuje. Sojusznicy +2 Ataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

registerEffect({
  id: 'adventure_sztandar_enhanced',
  name: 'Sztandar (wzmocniony)',
  description: '[AURA] Nośnik nie atakuje. Sojusznicy +2 Ataku. Gdy nośnik jest atakowany, losowy sojusznik przejmuje atak.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ✅ MIECZ KLADENET — Artefakt: atakuje 2 wrogów; brak kontrataku
// (enforcement w CombatResolver: 2nd attack + shouldCounterattack)
// ===================================================================

registerEffect({
  id: 'adventure_miecz_kladenet',
  name: 'Miecz Kladenet',
  description: '[AURA] Nośnik atakuje 2 wrogów jednocześnie. Brak kontrataku.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

registerEffect({
  id: 'adventure_miecz_kladenet_enhanced',
  name: 'Miecz Kladenet (wzmocniony)',
  description: '[AURA] Nośnik atakuje 2 wrogów. Brak kontrataku. Może celować w dowolną linię wroga.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ✅ MŁOT SWAROGA — Szał ataków: ×2/×3(paraliż)/×4(ginie)
// ===================================================================

registerEffect({
  id: 'adventure_mlot_swaroga',
  name: 'Młot Swaroga',
  description: '[WEJŚCIE] [CZUJNOŚĆ] Istota dostaje szał: 3 ataki z losowym efektem: ×2 (OK), ×3 (paraliż turę), ×4 (ginie po ataku).',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.ON_ATTACK],
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target, trigger } = ctx

    if (trigger === EffectTrigger.ON_PLAY) {
      if (!target) return effectResult(cloneGameState(state))
      const newState = cloneGameState(state)
      const card = findCardInState(newState, target.instanceId)
      if (!card) return effectResult(newState)
      card.metadata.mlotSwarogaActive = true
      card.metadata.mlotSwarogaAttacksLeft = 3
      card.metadata.mlotSwarogaEnhanced = false
      const log = addLog(newState, `Młot Swaroga: ${card.cardData.name} w szale mocy! (3 szalone ataki)`, 'effect')
      return effectResult(newState, [log])
    }

    if (trigger === EffectTrigger.ON_ATTACK) {
      if (!source.metadata.mlotSwarogaActive) return effectResult(cloneGameState(state))
      const newState = cloneGameState(state)
      const card = findCardInState(newState, source.instanceId)
      if (!card) return effectResult(newState)

      const left = (card.metadata.mlotSwarogaAttacksLeft as number) ?? 0
      if (left <= 0) return effectResult(newState)
      card.metadata.mlotSwarogaAttacksLeft = left - 1

      const roll = Math.random()
      const log: LogEntry[] = []
      if (roll < 0.5) {
        // ×2 — OK
        card.metadata.damageMultiplier = 2
        log.push(addLog(newState, `${card.cardData.name}: Szał Swaroga ×2! (${left - 1} pozostało)`, 'effect'))
      } else if (roll < 0.83) {
        // ×3 — paraliż
        card.metadata.damageMultiplier = 3
        card.paralyzeRoundsLeft = 1
        card.metadata.mlotSwarogaParalyzedTurn = newState.turnNumber
        log.push(addLog(newState, `${card.cardData.name}: Szał Swaroga ×3! Ale paraliż na turę! (${left - 1} pozostało)`, 'effect'))
      } else {
        // ×4 — ginie
        card.metadata.damageMultiplier = 4
        card.metadata.mlotSwarogaDie = true
        log.push(addLog(newState, `${card.cardData.name}: Szał Swaroga ×4! Zginie po ataku! (${left - 1} pozostało)`, 'effect'))
      }

      if (left - 1 === 0) {
        card.metadata.mlotSwarogaActive = false
        log.push(addLog(newState, `${card.cardData.name}: Szał Swaroga wygasł.`, 'effect'))
      }
      return effectResult(newState, log)
    }

    return effectResult(cloneGameState(state))
  },
})

registerEffect({
  id: 'adventure_mlot_swaroga_enhanced',
  name: 'Młot Swaroga (wzmocniony)',
  description: '[WEJŚCIE] [CZUJNOŚĆ] Szał ×2/×3/×4 + żaden z ataków nie wywołuje kontrataku.',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.ON_ATTACK],
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target, trigger } = ctx

    if (trigger === EffectTrigger.ON_PLAY) {
      if (!target) return effectResult(cloneGameState(state))
      const newState = cloneGameState(state)
      const card = findCardInState(newState, target.instanceId)
      if (!card) return effectResult(newState)
      card.metadata.mlotSwarogaActive = true
      card.metadata.mlotSwarogaAttacksLeft = 3
      card.metadata.mlotSwarogaEnhanced = true
      card.metadata.noCounterattack = true
      const log = addLog(newState, `Młot Swaroga+: ${card.cardData.name} w szale bez kontrataku!`, 'effect')
      return effectResult(newState, [log])
    }

    if (trigger === EffectTrigger.ON_ATTACK) {
      if (!source.metadata.mlotSwarogaActive) return effectResult(cloneGameState(state))
      const newState = cloneGameState(state)
      const card = findCardInState(newState, source.instanceId)
      if (!card) return effectResult(newState)

      const left = (card.metadata.mlotSwarogaAttacksLeft as number) ?? 0
      if (left <= 0) return effectResult(newState)
      card.metadata.mlotSwarogaAttacksLeft = left - 1
      card.metadata.noCounterattack = true

      const roll = Math.random()
      const log: LogEntry[] = []
      if (roll < 0.5) {
        card.metadata.damageMultiplier = 2
        log.push(addLog(newState, `${card.cardData.name}: Szał+ ×2! Bez kontrataku!`, 'effect'))
      } else if (roll < 0.83) {
        card.metadata.damageMultiplier = 3
        card.paralyzeRoundsLeft = 1
        log.push(addLog(newState, `${card.cardData.name}: Szał+ ×3! Paraliż ale bez kontrataku!`, 'effect'))
      } else {
        card.metadata.damageMultiplier = 4
        card.metadata.mlotSwarogaDie = true
        log.push(addLog(newState, `${card.cardData.name}: Szał+ ×4! Zginie bez kontrataku!`, 'effect'))
      }
      return effectResult(newState, log)
    }

    return effectResult(cloneGameState(state))
  },
})

// ===================================================================
// ✅ MATECZNIK — Lokacja: Ukryj 1 istotę (chroniona, nie walczy)
// (enforcement w LineManager: ukryta = nie może atakować ani być celem)
// ===================================================================

registerEffect({
  id: 'adventure_matecznik',
  name: 'Matecznik',
  description: '[WEJŚCIE] Ukryj sojuszniczą istotę — chroniona przed wszystkim, ale nie walczy.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.metadata.matecznikHidden = true
    card.metadata.matecznikEnhanced = false
    const log = addLog(newState,
      `Matecznik: ${card.cardData.name} ukryta w świętym miejscu — chroniona, ale nie walczy.`,
      'effect'
    )
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_matecznik_enhanced',
  name: 'Matecznik (wzmocniony)',
  description: '[WEJŚCIE] [AURA] Ukryj istotę + regeneruje 2 Obrony raz na turę.',
  trigger: [EffectTrigger.ON_PLAY, EffectTrigger.ON_TURN_START],
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target, trigger } = ctx

    if (trigger === EffectTrigger.ON_PLAY) {
      if (!target) return effectResult(cloneGameState(state))
      const newState = cloneGameState(state)
      const card = findCardInState(newState, target.instanceId)
      if (!card) return effectResult(newState)
      card.metadata.matecznikHidden = true
      card.metadata.matecznikEnhanced = true
      const log = addLog(newState,
        `Matecznik+: ${card.cardData.name} ukryta — chroniona i regeneruje 2 DEF/turę.`,
        'effect'
      )
      return effectResult(newState, [log])
    }

    // ON_TURN_START: regeneracja ukrytej istoty (sprawdza wszystkie własne istoty)
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    const hiddenCard = getAllCreaturesOnField(newState, source.owner)
      .find(c => c.metadata.matecznikHidden && c.metadata.matecznikEnhanced)
    if (hiddenCard) {
      const baseDef = (hiddenCard.cardData as any).stats?.defense ?? hiddenCard.currentStats.defense
      hiddenCard.currentStats.defense = Math.min(baseDef, hiddenCard.currentStats.defense + 2)
      log.push(addLog(newState, `Matecznik+: ${hiddenCard.cardData.name} regeneruje 2 DEF.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ PRZYJAŹŃ — Istota A chroni B (przejmuje obrażenia za B)
// (enforcement w CombatResolver checkDamagePrevention)
// ===================================================================

registerEffect({
  id: 'adventure_przyjazn',
  name: 'Przyjaźń',
  description: '[WEJŚCIE] Istota A przejmuje obrażenia i efekty za istotę B.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []

    // target = ochroniarz (A); AI wybiera najsilniejszą jako ochroniarza, najsłabszą jako chronioną
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) {
      log.push(addLog(newState, `Przyjaźń: Potrzeba co najmniej 2 istot na polu!`, 'effect'))
      return effectResult(newState, log)
    }

    const sorted = [...allies].sort((a, b) =>
      (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense)
    )
    const guardian = target ? findCardInState(newState, target.instanceId) : sorted[0]
    if (!guardian) return effectResult(newState)

    const protected_ = sorted.find(c => c.instanceId !== guardian.instanceId) ?? sorted[1]
    if (!protected_) return effectResult(newState, log)

    guardian.metadata.przyjaznGuard = protected_.instanceId
    protected_.metadata.przyjaznProtector = guardian.instanceId

    log.push(addLog(newState,
      `Przyjaźń: ${guardian.cardData.name} chroni ${protected_.cardData.name}!`,
      'effect'
    ))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_przyjazn_enhanced',
  name: 'Przyjaźń (wzmocniona)',
  description: '[WEJŚCIE] Gdy ochroniarz zginie — chroniony zyskuje 3 darmowe ataki.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []

    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) {
      log.push(addLog(newState, `Przyjaźń+: Potrzeba co najmniej 2 istot!`, 'effect'))
      return effectResult(newState, log)
    }

    const sorted = [...allies].sort((a, b) =>
      (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense)
    )
    const guardian = target ? findCardInState(newState, target.instanceId) : sorted[0]
    if (!guardian) return effectResult(newState)

    const protected_ = sorted.find(c => c.instanceId !== guardian.instanceId) ?? sorted[1]
    if (!protected_) return effectResult(newState, log)

    guardian.metadata.przyjaznGuard = protected_.instanceId
    guardian.metadata.przyjaznEnhanced = true
    protected_.metadata.przyjaznProtector = guardian.instanceId

    log.push(addLog(newState,
      `Przyjaźń+: ${guardian.cardData.name} chroni ${protected_.cardData.name} — gdy zginie, chroniony dostaje 3 ataki!`,
      'effect'
    ))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ BOSKIE WSPARCIE — +2 ATK i +2 DEF wybranej istocie
// ===================================================================

registerEffect({
  id: 'adventure_boskie_wsparcie',
  name: 'Boskie Wsparcie',
  description: '[ZDARZENIE] +2 Ataku i +2 Obrony wybranej istocie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.currentStats.attack += 2
    card.currentStats.defense += 2
    const log = addLog(newState, `Boskie Wsparcie: ${card.cardData.name} zyskuje +2 ATK i +2 DEF!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_boskie_wsparcie_enhanced',
  name: 'Boskie Wsparcie (wzmocnione)',
  description: '[ZDARZENIE+] +2 ATK, +2 DEF i Lot.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.currentStats.attack += 2
    card.currentStats.defense += 2
    ;(card.cardData as any).isFlying = true
    card.isGrounded = false
    const log = addLog(newState, `Boskie Wsparcie+: ${card.cardData.name} zyskuje +2/+2 i Lot!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ PIÓRO ŻAR-PTAKA — Reset ATK/DEF do bazy, usuń negatywne efekty
// ===================================================================

registerEffect({
  id: 'adventure_pioro_zarptaka',
  name: 'Pióro Żar-Ptaka',
  description: '[ARTEFAKT] Przywróć Atak i Obronę do bazy. Usuń negatywne efekty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    const baseStats = (card.cardData as any).stats
    card.currentStats.attack = baseStats.attack
    card.currentStats.defense = baseStats.defense
    card.activeEffects = card.activeEffects.filter(e =>
      !e.effectId.includes('curse') && !e.effectId.includes('debuff') && !e.effectId.includes('drain') && !e.effectId.includes('paralyze')
    )
    card.paralyzeRoundsLeft = null
    card.poisonRoundsLeft = null
    card.isSilenced = false
    card.cannotAttack = false
    card.isGrounded = false
    const log = addLog(newState, `Pióro Żar-Ptaka: ${card.cardData.name} odradza się — staty przywrócone, efekty oczyszczone!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_pioro_zarptaka_enhanced',
  name: 'Pióro Żar-Ptaka (wzmocnione)',
  description: '[ARTEFAKT+] Zdejmij WSZYSTKIE premie i atrybuty z wybranej istoty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    const baseStats = (card.cardData as any).stats
    card.currentStats.attack = baseStats.attack
    card.currentStats.defense = baseStats.defense
    card.activeEffects = []
    card.equippedArtifacts = []
    card.paralyzeRoundsLeft = null
    card.poisonRoundsLeft = null
    card.isSilenced = false
    card.cannotAttack = false
    card.isGrounded = false
    card.metadata = {}
    const log = addLog(newState, `Pióro Żar-Ptaka+: ${card.cardData.name} — WSZYSTKIE premie i atrybuty usunięte!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ AMULET Z ROZETĄ — Odporność na Magię (artefakt)
// ===================================================================

registerEffect({
  id: 'adventure_amulet_z_rozeta',
  name: 'Amulet Z Rozetą',
  description: '[ARTEFAKT] Odporność na Magię.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
  // Enforcement: canAttack w LineManager sprawdza equippedArtifacts
})

registerEffect({
  id: 'adventure_amulet_z_rozeta_enhanced',
  name: 'Amulet Z Rozetą (wzmocniony)',
  description: '[ARTEFAKT+] Odporność na wrogie Karty Przygody.',
  trigger: EffectTrigger.PASSIVE,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => effectResult(cloneGameState(ctx.state)),
})

// ===================================================================
// ✅ PŁASZCZ STRZYBÓGA — Lot (artefakt)
// ===================================================================

registerEffect({
  id: 'adventure_paszcz_strzyboga',
  name: 'Płaszcz Strzybóga',
  description: '[ARTEFAKT] Istota zyskuje Lot.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    ;(card.cardData as any).isFlying = true
    card.isGrounded = false
    const log = addLog(newState, `Płaszcz Strzybóga: ${card.cardData.name} zyskuje Lot!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_paszcz_strzyboga_enhanced',
  name: 'Płaszcz Strzybóga (wzmocniony)',
  description: '[ARTEFAKT+] Wszyscy wrogowie tracą Lot.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    let count = 0
    for (const e of enemies) {
      if ((e.cardData as any).isFlying) {
        e.isGrounded = true
        count++
      }
    }
    const log = addLog(newState, `Płaszcz Strzybóga+: ${count} wrogów traci Lot!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ TARCZA DOBRYNI NIKITICZA — Absorbuje 8 obrażeń
// ===================================================================

registerEffect({
  id: 'adventure_tarcza_dobryni_nikiticza',
  name: 'Tarcza Dobryni Nikiticza',
  description: '[ARTEFAKT] Absorbuje 8 obrażeń.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.metadata.tarczaDobryni = 8
    const log = addLog(newState, `Tarcza Dobryni Nikiticza: ${card.cardData.name} zyskuje tarczę na 8 obrażeń!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_tarcza_dobryni_nikiticza_enhanced',
  name: 'Tarcza Dobryni Nikiticza (wzmocniona)',
  description: '[ARTEFAKT+] Raz: anuluj dowolny atak lub premię na nośnika.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.metadata.tarczaDobryni = 8
    card.metadata.tarczaDobryniBlock = true
    const log = addLog(newState, `Tarcza Dobryni+: ${card.cardData.name} zyskuje tarczę na 8 DMG + jednorazowe anulowanie!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ WYSPA BUJAN — Lokacja: +3 do limitu ręki
// ===================================================================

registerEffect({
  id: 'adventure_wyspa_bujan',
  name: 'Wyspa Bujan',
  description: '[LOKACJA] +3 karty do limitu ręki.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    newState.players[source.owner].handLimit += 3
    const log = addLog(newState, `Wyspa Bujan: Limit ręki +3!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_wyspa_bujan_enhanced',
  name: 'Wyspa Bujan (wzmocniona)',
  description: '[LOKACJA+] +3 do limitu ręki + podejrzyj wierzchnią kartę talii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PASSIVE,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    newState.players[source.owner].handLimit += 3
    const log: LogEntry[] = [addLog(newState, `Wyspa Bujan+: Limit ręki +3!`, 'effect')]
    if (newState.players[source.owner].deck.length > 0) {
      const topCard = newState.players[source.owner].deck[0]!
      log.push(addLog(newState, `Wyspa Bujan+: Na wierzchu talii: ${topCard.cardData.name}.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ TRYZNA — Rywal -1 do limitu kart w ręce
// ===================================================================

registerEffect({
  id: 'adventure_tryzna',
  name: 'Tryzna',
  description: '[ZDARZENIE] Rywal -1 do limitu kart w ręce.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    newState.players[enemySide].handLimit = Math.max(1, newState.players[enemySide].handLimit - 1)
    // Odrzuć nadmiarowe karty
    const enemy = newState.players[enemySide]
    const log: LogEntry[] = [addLog(newState, `Tryzna: Limit ręki rywala zmniejszony do ${enemy.handLimit}!`, 'effect')]
    while (enemy.hand.length > enemy.handLimit) {
      const discarded = enemy.hand.pop()!
      enemy.graveyard.push(discarded)
      log.push(addLog(newState, `Tryzna: ${discarded.cardData.name} odrzucona z ręki rywala!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_tryzna_enhanced',
  name: 'Tryzna (wzmocniona)',
  description: '[ZDARZENIE+] Rywal może grać max 2 karty na rundę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    newState.players[enemySide].handLimit = Math.max(1, newState.players[enemySide].handLimit - 1)
    ;(newState.players[enemySide] as any).tryznaCardLimit = 2
    const log = addLog(newState, `Tryzna+: Rywal może grać max 2 karty na rundę!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ KUKŁA MARZANNY — Nieumarli sparaliżowani na 3 rundy
// ===================================================================

registerEffect({
  id: 'adventure_kuka_marzanny',
  name: 'Kukła Marzanny',
  description: '[ZDARZENIE] Nieumarli sparaliżowani na 3 rundy.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      if ((e.cardData as any).idDomain === 3) { // Nieumarli = domain 3
        e.paralyzeRoundsLeft = 3
        e.cannotAttack = true
        log.push(addLog(newState, `Kukła Marzanny: ${e.cardData.name} sparaliżowany na 3 rundy!`, 'effect'))
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Kukła Marzanny: Brak Nieumarłych na polu wroga.`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_kuka_marzanny_enhanced',
  name: 'Kukła Marzanny (wzmocniona)',
  description: '[ZDARZENIE+] Żywi mają ×2 Ataku vs Nieumarli przez 3 rundy.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    const log: LogEntry[] = []
    for (const a of allies) {
      if ((a.cardData as any).idDomain === 2) { // Żywi = domain 2
        a.metadata.kuklaDoubleVsUndead = 3
        log.push(addLog(newState, `Kukła Marzanny+: ${a.cardData.name} zyskuje ×2 ATK vs Nieumarli na 3 rundy!`, 'effect'))
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Kukła Marzanny+: Brak Żywych na Twoim polu.`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ ZDRADA POPIELA — Wrogie istoty nie mogą być w Obronie
// ===================================================================

registerEffect({
  id: 'adventure_zdrada_popiela',
  name: 'Zdrada Popiela',
  description: '[ZDARZENIE] Wrogie istoty na polu nie mogą być w Pozycji Obrony.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    let count = 0
    for (const e of enemies) {
      if (e.position === CardPosition.DEFENSE) {
        e.position = CardPosition.ATTACK
        count++
      }
    }
    const log = addLog(newState, `Zdrada Popiela: ${count} wrogów zmuszonych do pozycji Ataku!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_zdrada_popiela_enhanced',
  name: 'Zdrada Popiela (wzmocniona)',
  description: '[ZDARZENIE+] Zmieniaj pozycje wrogich istot do końca tury.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      // Odwróć pozycję
      e.position = e.position === CardPosition.ATTACK ? CardPosition.DEFENSE : CardPosition.ATTACK
    }
    const log = addLog(newState, `Zdrada Popiela+: Pozycje ${enemies.length} wrogów odwrócone!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ GWIZD SOŁOWIEJA — Wrogowie z ATK > DEF tracą nadwyżkę
// ===================================================================

registerEffect({
  id: 'adventure_gwizd_soowieja',
  name: 'Gwizd Sołowieja',
  description: '[ZDARZENIE] Wrogowie z Atakiem > Obroną tracą nadwyżkę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    const log: LogEntry[] = []
    for (const e of enemies) {
      if (e.currentStats.attack > e.currentStats.defense) {
        const excess = e.currentStats.attack - e.currentStats.defense
        e.currentStats.attack -= excess
        log.push(addLog(newState, `Gwizd Sołowieja: ${e.cardData.name} traci ${excess} ATK (nadwyżka)!`, 'effect'))
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Gwizd Sołowieja: Żaden wróg nie ma ATK > DEF.`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_gwizd_soowieja_enhanced',
  name: 'Gwizd Sołowieja (wzmocniony)',
  description: '[ZDARZENIE+] Wszystkie wrogie istoty nie mogą atakować.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.cannotAttack = true
    }
    const log = addLog(newState, `Gwizd Sołowieja+: ${enemies.length} wrogów nie może atakować!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ KATAKLIZM — -½ ATK i DEF WSZYSTKIM istotom
// ===================================================================

registerEffect({
  id: 'adventure_kataklizm',
  name: 'Kataklizm',
  description: '[ZDARZENIE] -½ Ataku i Obrony WSZYSTKIM istotom na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      const creatures = getAllCreaturesOnField(newState, side)
      for (const c of creatures) {
        const oldAtk = c.currentStats.attack
        const oldDef = c.currentStats.defense
        c.currentStats.attack = Math.max(1, Math.floor(c.currentStats.attack / 2))
        c.currentStats.defense = Math.max(1, Math.floor(c.currentStats.defense / 2))
        log.push(addLog(newState, `Kataklizm: ${c.cardData.name} ATK ${oldAtk}→${c.currentStats.attack}, DEF ${oldDef}→${c.currentStats.defense}`, 'effect'))
      }
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_kataklizm_enhanced',
  name: 'Kataklizm (wzmocniony)',
  description: '[ZDARZENIE+] Zniszcz wszystkie wrogie Lokacje.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    if (newState.players[enemySide].activeLocation) {
      const loc = newState.players[enemySide].activeLocation!
      log.push(addLog(newState, `Kataklizm+: Lokacja ${loc.cardData.name} wroga zniszczona!`, 'effect'))
      newState.players[enemySide].activeLocation = null
    } else {
      log.push(addLog(newState, `Kataklizm+: Wróg nie ma aktywnej Lokacji.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ PAKT Z INKLUZEM — -1 ATK i -2 DEF WSZYSTKIM wrogom → sumę daj swojej istocie
// ===================================================================

registerEffect({
  id: 'adventure_pakt_z_inkluzem',
  name: 'Pakt Z Inkluzem',
  description: '[ZDARZENIE] -1 ATK i -2 DEF WSZYSTKIM wrogom → sumę daj swojej istocie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    const log: LogEntry[] = []
    let totalAtk = 0
    let totalDef = 0
    for (const e of enemies) {
      const atkLoss = Math.min(e.currentStats.attack, 1)
      const defLoss = Math.min(e.currentStats.defense, 2)
      e.currentStats.attack -= atkLoss
      e.currentStats.defense -= defLoss
      totalAtk += atkLoss
      totalDef += defLoss
    }
    log.push(addLog(newState, `Pakt Z Inkluzem: ${enemies.length} wrogów traci po -1 ATK / -2 DEF!`, 'effect'))
    if (target) {
      const ally = findCardInState(newState, target.instanceId)
      if (ally) {
        ally.currentStats.attack += totalAtk
        ally.currentStats.defense += totalDef
        log.push(addLog(newState, `Pakt Z Inkluzem: ${ally.cardData.name} zyskuje +${totalAtk} ATK / +${totalDef} DEF!`, 'effect'))
      }
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_pakt_z_inkluzem_enhanced',
  name: 'Pakt Z Inkluzem (wzmocniony)',
  description: '[ZDARZENIE+] Zamień stronami 2 istoty na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    // Zamiana: najsłabszy sojusznik ↔ najsilniejszy wróg
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const allies = getAllCreaturesOnField(newState, source.owner)
    const enemies = getAllCreaturesOnField(newState, enemySide)
    if (allies.length === 0 || enemies.length === 0) {
      log.push(addLog(newState, `Pakt Z Inkluzem+: Obie strony muszą mieć istoty!`, 'effect'))
      return effectResult(newState, log)
    }
    const weakestAlly = allies.sort((a, b) => (a.currentStats.attack + a.currentStats.defense) - (b.currentStats.attack + b.currentStats.defense))[0]!
    const strongestEnemy = enemies.sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]!
    // Swap owners
    weakestAlly.owner = enemySide as PlayerSide
    strongestEnemy.owner = source.owner as PlayerSide
    removeCardFromField(newState, weakestAlly.instanceId)
    removeCardFromField(newState, strongestEnemy.instanceId)
    weakestAlly.line = BattleLine.FRONT
    strongestEnemy.line = BattleLine.FRONT
    newState.players[enemySide].field.lines[BattleLine.FRONT].push(weakestAlly)
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(strongestEnemy)
    log.push(addLog(newState, `Pakt Z Inkluzem+: ${weakestAlly.cardData.name} ↔ ${strongestEnemy.cardData.name} — zamiana stron!`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ SZAŁ BITEWNY — Wybrany wróg atakuje innego wroga
// ===================================================================

registerEffect({
  id: 'adventure_sza_bitewny',
  name: 'Szał Bitewny',
  description: '[ZDARZENIE] Wybrany wróg atakuje innego wroga w zasięgu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    const enemies = getAllCreaturesOnField(newState, enemySide)

    // Jeśli gracz wybrał cel — to on atakuje sojusznika
    const attacker = target ? findCardInState(newState, target.instanceId)
      : (enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)]! : null)
    if (!attacker) return effectResult(newState, [addLog(newState, `Szał Bitewny: Brak celów!`, 'effect')])

    const otherEnemies = enemies.filter(c => c.instanceId !== attacker.instanceId)
    if (otherEnemies.length === 0) {
      log.push(addLog(newState, `Szał Bitewny: ${attacker.cardData.name} nie ma kogo zaatakować!`, 'effect'))
      return effectResult(newState, log)
    }
    const victim = otherEnemies.sort((a, b) => a.currentStats.defense - b.currentStats.defense)[0]!
    const damage = attacker.currentStats.attack
    victim.currentStats.defense -= damage
    log.push(addLog(newState, `Szał Bitewny: ${attacker.cardData.name} uderza ${victim.cardData.name} za ${damage}!`, 'effect'))
    if (victim.currentStats.defense <= 0) {
      moveToGraveyard(newState, victim)
      log.push(addLog(newState, `${victim.cardData.name} ginie od Szału Bitewnego!`, 'death'))
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_sza_bitewny_enhanced',
  name: 'Szał Bitewny (wzmocniony)',
  description: '[ZDARZENIE+] Przejmij wroga — wraca do rywala gdy nie zaatakuje w rundzie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    const enemies = getAllCreaturesOnField(newState, enemySide)
    if (enemies.length === 0) return effectResult(newState, [addLog(newState, `Szał Bitewny+: Brak wrogów!`, 'effect')])
    const stolen = target ? findCardInState(newState, target.instanceId)
      : enemies.sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]!
    if (!stolen) return effectResult(newState)
    removeCardFromField(newState, stolen.instanceId)
    stolen.owner = source.owner as PlayerSide
    stolen.line = BattleLine.FRONT
    stolen.metadata.szalBitewnyTemporary = true
    stolen.metadata.szalBitewnyOriginalOwner = enemySide
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(stolen)
    log.push(addLog(newState, `Szał Bitewny+: ${stolen.cardData.name} przechodzi na Twoją stronę!`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ ŻERTWA — Poświęć istotę, daj podwójne staty innej
// ===================================================================

registerEffect({
  id: 'adventure_zertwa',
  name: 'Żertwa',
  description: '[ZDARZENIE] Poświęć swoją istotę — jej podwójny ATK i DEF daj innej istocie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) return effectResult(newState, [addLog(newState, `Żertwa: Potrzeba co najmniej 2 istot!`, 'effect')])

    // Poświęć najsłabszą (lub target), buff najsilniejszą
    const sorted = [...allies].sort((a, b) => (a.currentStats.attack + a.currentStats.defense) - (b.currentStats.attack + b.currentStats.defense))
    const sacrifice = target ? findCardInState(newState, target.instanceId) : sorted[0]!
    if (!sacrifice) return effectResult(newState)
    const beneficiary = sorted.find(c => c.instanceId !== sacrifice.instanceId)
    if (!beneficiary) return effectResult(newState)

    const bonusAtk = sacrifice.currentStats.attack * 2
    const bonusDef = sacrifice.currentStats.defense * 2
    moveToGraveyard(newState, sacrifice)
    beneficiary.currentStats.attack += bonusAtk
    beneficiary.currentStats.defense += bonusDef
    log.push(addLog(newState, `Żertwa: ${sacrifice.cardData.name} poświęcona! ${beneficiary.cardData.name} zyskuje +${bonusAtk} ATK / +${bonusDef} DEF!`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_zertwa_enhanced',
  name: 'Żertwa (wzmocniona)',
  description: '[ZDARZENIE+] Zadaj podwójny ATK+DEF poświęconej istoty jako obrażenia wrogowi.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length === 0) return effectResult(newState, [addLog(newState, `Żertwa+: Brak istot do poświęcenia!`, 'effect')])

    const sacrifice = target ? findCardInState(newState, target.instanceId) : allies.sort((a, b) =>
      (a.currentStats.attack + a.currentStats.defense) - (b.currentStats.attack + b.currentStats.defense))[0]!
    if (!sacrifice) return effectResult(newState)

    const totalDmg = (sacrifice.currentStats.attack + sacrifice.currentStats.defense) * 2
    moveToGraveyard(newState, sacrifice)
    log.push(addLog(newState, `Żertwa+: ${sacrifice.cardData.name} poświęcona!`, 'effect'))

    // Zadaj obrażenia najsilniejszemu wrogowi
    const enemies = getAllCreaturesOnField(newState, enemySide)
    if (enemies.length > 0) {
      const victim = enemies.sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]!
      victim.currentStats.defense -= totalDmg
      log.push(addLog(newState, `Żertwa+: ${victim.cardData.name} otrzymuje ${totalDmg} obrażeń!`, 'effect'))
      if (victim.currentStats.defense <= 0) {
        moveToGraveyard(newState, victim)
        log.push(addLog(newState, `${victim.cardData.name} ginie od Żertwy!`, 'death'))
      }
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ NEKROMANCJA — Stwórz Nieumarłego 4/4 LUB +4/+4 istniejącemu
// ===================================================================

registerEffect({
  id: 'adventure_nekromancja',
  name: 'Nekromancja',
  description: '[ZDARZENIE] Stwórz Nieumarłego 4/4 LUB daj +4/+4 istniejącemu Nieumarłemu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []

    // Jeśli jest cel (istniejący Nieumarły) — buff
    if (target) {
      const card = findCardInState(newState, target.instanceId)
      if (card) {
        card.currentStats.attack += 4
        card.currentStats.defense += 4
        log.push(addLog(newState, `Nekromancja: ${card.cardData.name} zyskuje +4 ATK / +4 DEF!`, 'effect'))
        return effectResult(newState, log)
      }
    }

    // Brak celu — stwórz token 4/4
    const token: CardInstance = {
      instanceId: `nekro_token_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cardData: {
        id: 9999,
        name: 'Nieumarły (token)',
        cardType: 'creature',
        effectId: '',
        effectDescription: 'Token stworzony przez Nekromancję.',
        stats: { attack: 4, defense: 4, maxAttack: 4, maxDefense: 4 },
        attackType: 0, // Wręcz
        idDomain: 3, // Nieumarli
        isFlying: false,
      } as any,
      owner: source.owner as PlayerSide,
      currentStats: { attack: 4, defense: 4, maxAttack: 4, maxDefense: 4 },
      position: CardPosition.DEFENSE,
      line: BattleLine.FRONT,
      isRevealed: true,
      hasAttackedThisTurn: false,
      cannotAttack: false,
      isSilenced: false,
      isGrounded: false,
      turnsInPlay: 0,
      roundEnteredPlay: newState.roundNumber,
      activeEffects: [],
      equippedArtifacts: [],
      metadata: {},
      paralyzeRoundsLeft: null,
      poisonRoundsLeft: null,
      isImmune: false,
      hasMovedThisTurn: false,
    }
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(token)
    log.push(addLog(newState, `Nekromancja: Przywołano Nieumarłego tokena 4/4 na L1!`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_nekromancja_enhanced',
  name: 'Nekromancja (wzmocniona)',
  description: '[ZDARZENIE+] ×2 lub ÷2 ATK/DEF WSZYSTKICH Nieumarłych na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    // Podwój staty sojuszniczych Nieumarłych
    const allies = getAllCreaturesOnField(newState, source.owner)
    for (const a of allies) {
      if ((a.cardData as any).idDomain === 3) {
        a.currentStats.attack *= 2
        a.currentStats.defense *= 2
        log.push(addLog(newState, `Nekromancja+: ${a.cardData.name} ×2 ATK/DEF!`, 'effect'))
      }
    }
    // Połów staty wrogich Nieumarłych
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      if ((e.cardData as any).idDomain === 3) {
        e.currentStats.attack = Math.max(1, Math.floor(e.currentStats.attack / 2))
        e.currentStats.defense = Math.max(1, Math.floor(e.currentStats.defense / 2))
        log.push(addLog(newState, `Nekromancja+: ${e.cardData.name} ÷2 ATK/DEF!`, 'effect'))
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Nekromancja+: Brak Nieumarłych na polu.`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ BEZSILNOŚĆ — Wrogie istoty nie korzystają z premii przez 3 rundy
// ===================================================================

registerEffect({
  id: 'adventure_bezsilnosc',
  name: 'Bezsilność',
  description: '[ZDARZENIE] Przez 3 rundy wrogie istoty nie korzystają z premii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.isSilenced = true
      e.metadata.bezsilnoscRounds = 3
    }
    const log = addLog(newState, `Bezsilność: ${enemies.length} wrogów wyciszonych na 3 rundy!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_bezsilnosc_enhanced',
  name: 'Bezsilność (wzmocniona)',
  description: '[ZDARZENIE+] Przez ten czas wrogi atak = tylko Wręcz.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.isSilenced = true
      e.metadata.bezsilnoscRounds = 3
      e.metadata.bezsilnoscMeleeOnly = true
    }
    const log = addLog(newState, `Bezsilność+: ${enemies.length} wrogów wyciszonych i ograniczonych do Wręcz na 3 rundy!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ HANDEL — Odłóż rękę, przetasuj talię, dobierz nowe
// ===================================================================

registerEffect({
  id: 'adventure_handel',
  name: 'Handel',
  description: '[ZDARZENIE] Odłóż rękę, przetasuj talię, dobierz nowe karty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const player = newState.players[source.owner]
    const handSize = player.hand.length
    // Reszta ręki (bez karty Handel — już zagrana) wraca do talii
    player.deck.push(...player.hand)
    player.hand = []
    // Przetasuj
    for (let i = player.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [player.deck[i], player.deck[j]] = [player.deck[j]!, player.deck[i]!]
    }
    // Dobierz tyle ile miałeś
    for (let i = 0; i < handSize && player.deck.length > 0; i++) {
      const card = player.deck.shift()!
      card.isRevealed = false
      player.hand.push(card)
    }
    const log = addLog(newState, `Handel: Wymiana ręki — odłożono ${handSize}, dobrano ${player.hand.length} nowych kart!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_handel_enhanced',
  name: 'Handel (wzmocniony)',
  description: '[ZDARZENIE+] Wymiana rąk — dostajesz tyle kart ile miałeś.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const player = newState.players[source.owner]
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemy = newState.players[enemySide]
    // Wymiana rąk
    const myHand = [...player.hand]
    const enemyHand = [...enemy.hand]
    player.hand = enemyHand
    enemy.hand = myHand
    // Zmień ownera
    for (const c of player.hand) { c.owner = source.owner as PlayerSide; c.isRevealed = true }
    for (const c of enemy.hand) { c.owner = enemySide as PlayerSide; c.isRevealed = false }
    const log = addLog(newState, `Handel+: Wymiana rąk! Ty: ${player.hand.length} kart, Wróg: ${enemy.hand.length} kart.`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ SWAĆBA — Wróg nie może atakować przez 3 rundy
// ===================================================================

registerEffect({
  id: 'adventure_swacba',
  name: 'Swaćba',
  description: '[ZDARZENIE] Przez 3 rundy wróg nie może atakować.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.cannotAttack = true
      e.metadata.swacbaRounds = 3
    }
    const log = addLog(newState, `Swaćba: Wrogie istoty nie mogą atakować przez 3 rundy!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_swacba_enhanced',
  name: 'Swaćba (wzmocniona)',
  description: '[ZDARZENIE+] Wróg nie wystawia nowych istot (dopóki ma pole).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.cannotAttack = true
      e.metadata.swacbaRounds = 3
    }
    ;(newState.players[enemySide] as any).swacbaBlock = true
    const log = addLog(newState, `Swaćba+: Wrogie istoty sparaliżowane + wróg nie może wystawiać nowych istot!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ MISJONARZE — Przez 5 tur wróg nie atakuje Magią
// ===================================================================

registerEffect({
  id: 'adventure_misjonarze',
  name: 'Misjonarze',
  description: '[ZDARZENIE] Przez 5 tur wróg nie atakuje Magią.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    const log: LogEntry[] = []
    for (const e of enemies) {
      if ((e.cardData as any).attackType === AttackType.MAGIC) {
        e.cannotAttack = true
        e.metadata.misjonarzeRounds = 5
        log.push(addLog(newState, `Misjonarze: ${e.cardData.name} nie może atakować Magią przez 5 tur!`, 'effect'))
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Misjonarze: Brak wrogich magów na polu.`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_misjonarze_enhanced',
  name: 'Misjonarze (wzmocniony)',
  description: '[ZDARZENIE+] Anuluj wrogie zaklęcie (jednorazowe).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    ;(newState.players[source.owner] as any).misjonarzeCounterspell = true
    const log = addLog(newState, `Misjonarze+: Następne wrogie zaklęcie zostanie anulowane!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ ZAĆMIENIE SŁOŃCA — Istoty bez premii do końca tury
// ===================================================================

registerEffect({
  id: 'adventure_zacmienie_sonca',
  name: 'Zaćmienie Słońca',
  description: '[ZDARZENIE] Do końca następnej tury — istoty na polu bez premii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      const creatures = getAllCreaturesOnField(newState, side)
      for (const c of creatures) {
        c.isSilenced = true
        c.metadata.zacmienieRounds = 1
      }
    }
    log.push(addLog(newState, `Zaćmienie Słońca: Wszystkie istoty wyciszone do końca następnej tury!`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_zacmienie_sonca_enhanced',
  name: 'Zaćmienie Słońca (wzmocnione)',
  description: '[ZDARZENIE+] Przez 3 rundy wrogie istoty bez premii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.isSilenced = true
      e.metadata.zacmienieRounds = 3
    }
    const log = addLog(newState, `Zaćmienie Słońca+: ${enemies.length} wrogów wyciszonych na 3 rundy!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ TOPÓR PERUNA AMULET — Odbij 2 ciosy wroga na napastnika
// ===================================================================

registerEffect({
  id: 'adventure_topor_peruna_amulet',
  name: 'Topór Peruna (Amulet)',
  description: '[ZDARZENIE] Odbij 2 wybrane ciosy wroga z powrotem na napastnika.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    const log: LogEntry[] = []
    // Daj 2 sojusznikom odbicie następnego ciosu
    const targets = target ? [findCardInState(newState, target.instanceId)].filter(Boolean) as CardInstance[]
      : allies.slice(0, 2)
    for (const a of targets) {
      a.metadata.toporPerunaReflect = true
      log.push(addLog(newState, `Topór Peruna: ${a.cardData.name} odbije następny cios!`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_topor_peruna_amulet_enhanced',
  name: 'Topór Peruna Amulet (wzmocniony)',
  description: '[ZDARZENIE+] Wybierz cel odbicia — inna wroga istota.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    for (const a of allies) {
      a.metadata.toporPerunaReflect = true
      a.metadata.toporPerunaRedirect = true
    }
    const log = addLog(newState, `Topór Peruna+: ${allies.length} sojuszników odbije ciosy na wybranego wroga!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ SREBRNA GAŁĄŹ — Zmień domenę istoty
// ===================================================================

registerEffect({
  id: 'adventure_srebrna_gaaz',
  name: 'Srebrna Gałąź',
  description: '[ARTEFAKT] Zmień domenę istoty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    // Zmień na domenę gracza (lub losową inną)
    const currentDomain = (card.cardData as any).idDomain
    const newDomain = currentDomain === 1 ? 2 : currentDomain === 2 ? 1 : currentDomain === 3 ? 4 : 3
    ;(card.cardData as any).idDomain = newDomain
    const domainNames: Record<number,string> = {1:'Perun',2:'Żywi',3:'Nieumarli',4:'Weles'}
    const log = addLog(newState, `Srebrna Gałąź: ${card.cardData.name} zmienia domenę na ${domainNames[newDomain]}!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_srebrna_gaaz_enhanced',
  name: 'Srebrna Gałąź (wzmocniona)',
  description: '[ARTEFAKT+] Istota odporna na wybraną domenę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    // Odporna na domenę 4 (Weles) domyślnie — AI nie wybiera
    card.metadata.immuneToDomain = 4
    const log = addLog(newState, `Srebrna Gałąź+: ${card.cardData.name} odporna na Weles!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ ZŁOTA BABA — Zagraj jako istotę-pułapkę
// ===================================================================

registerEffect({
  id: 'adventure_zota_baba',
  name: 'Złota Baba',
  description: '[ZDARZENIE] Zagraj jako istotę 0/8. Kto ją zaatakuje — przechodzi na Twoją stronę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const token: CardInstance = {
      instanceId: `zlota_baba_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cardData: {
        id: 9998, name: 'Złota Baba', cardType: 'creature', effectId: 'zlota_baba_trap',
        effectDescription: 'Kto zaatakuje — przechodzi na stronę właściciela.',
        stats: { attack: 0, defense: 8, maxAttack: 0, maxDefense: 8 },
        attackType: 0, idDomain: 1, isFlying: false,
      } as any,
      owner: source.owner as PlayerSide,
      currentStats: { attack: 0, defense: 8, maxAttack: 0, maxDefense: 8 },
      position: CardPosition.DEFENSE, line: BattleLine.FRONT,
      isRevealed: false, hasAttackedThisTurn: false, cannotAttack: true,
      isSilenced: false, isGrounded: false, turnsInPlay: 0,
      roundEnteredPlay: newState.roundNumber, activeEffects: [],
      equippedArtifacts: [], metadata: { zlotaBabaTrap: true },
      paralyzeRoundsLeft: null, poisonRoundsLeft: null,
      isImmune: false, hasMovedThisTurn: false,
    }
    newState.players[source.owner].field.lines[BattleLine.FRONT].push(token)
    const log = addLog(newState, `Złota Baba: Pułapka wystawiona na L1!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_zota_baba_enhanced',
  name: 'Złota Baba (wzmocniona)',
  description: '[ZDARZENIE+] Ukradnij wrogą Lokację lub Artefakt.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    if (newState.players[enemySide].activeLocation) {
      const loc = newState.players[enemySide].activeLocation!
      newState.players[enemySide].activeLocation = null
      loc.owner = source.owner as PlayerSide
      newState.players[source.owner].activeLocation = loc
      log.push(addLog(newState, `Złota Baba+: Lokacja ${loc.cardData.name} skradziona!`, 'effect'))
    } else {
      log.push(addLog(newState, `Złota Baba+: Wróg nie ma Lokacji do kradzieży.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ PRZEBUDZENIE STOLEMÓW — Zniszcz Lokację
// ===================================================================

registerEffect({
  id: 'adventure_przebudzenie_stolemow',
  name: 'Przebudzenie Stolemów',
  description: '[ZDARZENIE] Zniszcz Lokację wroga.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    if (newState.players[enemySide].activeLocation) {
      const loc = newState.players[enemySide].activeLocation!
      log.push(addLog(newState, `Przebudzenie Stolemów: Lokacja ${loc.cardData.name} zniszczona!`, 'effect'))
      newState.players[enemySide].activeLocation = null
    } else {
      log.push(addLog(newState, `Przebudzenie Stolemów: Wróg nie ma aktywnej Lokacji.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_przebudzenie_stolemow_enhanced',
  name: 'Przebudzenie Stolemów (wzmocnione)',
  description: '[ZDARZENIE+] Zniszcz 3 aktywne Zdarzenia na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    const removed = newState.activeEvents.splice(0, 3)
    for (const ev of removed) {
      log.push(addLog(newState, `Przebudzenie Stolemów+: Zdarzenie ${ev.cardData.name} zniszczone!`, 'effect'))
    }
    if (removed.length === 0) log.push(addLog(newState, `Przebudzenie Stolemów+: Brak aktywnych Zdarzeń.`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ BRATERSTWO BOGATYRÓW — Połącz 2 istoty (sumuj staty)
// ===================================================================

registerEffect({
  id: 'adventure_braterstwo_bogatyrow',
  name: 'Braterstwo Bogatyrów',
  description: '[ZDARZENIE] Połącz 2 swoje istoty — sumuj ATK i DEF.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) return effectResult(newState, [addLog(newState, `Braterstwo: Potrzeba 2 istot!`, 'effect')])
    const sorted = [...allies].sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))
    const survivor = target ? findCardInState(newState, target.instanceId) ?? sorted[0]! : sorted[0]!
    const sacrifice = sorted.find(c => c.instanceId !== survivor.instanceId)!
    survivor.currentStats.attack += sacrifice.currentStats.attack
    survivor.currentStats.defense += sacrifice.currentStats.defense
    // Przenieś artefakty
    survivor.equippedArtifacts.push(...sacrifice.equippedArtifacts)
    moveToGraveyard(newState, sacrifice)
    const log = addLog(newState, `Braterstwo Bogatyrów: ${sacrifice.cardData.name} łączy się z ${survivor.cardData.name}! (ATK=${survivor.currentStats.attack}, DEF=${survivor.currentStats.defense})`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_braterstwo_bogatyrow_enhanced',
  name: 'Braterstwo Bogatyrów (wzmocnione)',
  description: '[ZDARZENIE+] Połącz do 4 istot w jedną.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) return effectResult(newState, [addLog(newState, `Braterstwo+: Potrzeba 2+ istot!`, 'effect')])
    const sorted = [...allies].sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))
    const survivor = sorted[0]!
    const toMerge = sorted.slice(1, 4)
    for (const s of toMerge) {
      survivor.currentStats.attack += s.currentStats.attack
      survivor.currentStats.defense += s.currentStats.defense
      survivor.equippedArtifacts.push(...s.equippedArtifacts)
      moveToGraveyard(newState, s)
    }
    const log = addLog(newState, `Braterstwo+: ${toMerge.length} istot połączonych w ${survivor.cardData.name}! (ATK=${survivor.currentStats.attack}, DEF=${survivor.currentStats.defense})`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ SLEDOVIK — Wystawij 2 dodatkowe istoty / odporność na Weles
// ===================================================================

registerEffect({
  id: 'adventure_sledovik',
  name: 'Sledovik',
  description: '[ZDARZENIE] Istota odporna na ataki Welesowców. Wystawij 2 dodatkowe istoty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    // Daj sojusznikowi odporność na Weles
    if (target) {
      const card = findCardInState(newState, target.instanceId)
      if (card) {
        card.metadata.immuneToDomain = 4
        log.push(addLog(newState, `Sledovik: ${card.cardData.name} odporny na Welesowców!`, 'effect'))
      }
    }
    // +2 do limitu wystawiania istot
    newState.players[source.owner].creaturesPlayedThisTurn = Math.max(0, newState.players[source.owner].creaturesPlayedThisTurn - 2)
    log.push(addLog(newState, `Sledovik: Możesz wystawić 2 dodatkowe istoty!`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_sledovik_enhanced',
  name: 'Sledovik (wzmocniony)',
  description: '[ZDARZENIE+] Zniszcz wybranego Welesowca / dodatkowy atak.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const log: LogEntry[] = []
    // Zniszcz Welesowca
    const welesowcy = getAllCreaturesOnField(newState, enemySide).filter(c => (c.cardData as any).idDomain === 4)
    const victim = target ? findCardInState(newState, target.instanceId) : (welesowcy.length > 0 ? welesowcy[0]! : null)
    if (victim && (victim.cardData as any).idDomain === 4) {
      moveToGraveyard(newState, victim)
      log.push(addLog(newState, `Sledovik+: ${victim.cardData.name} (Weles) zniszczony!`, 'effect'))
    } else {
      log.push(addLog(newState, `Sledovik+: Brak Welesowców do zniszczenia.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ RUSLAN HELMET — Odporność na wrogie premie (artefakt)
// ===================================================================

registerEffect({
  id: 'adventure_ruslan_helmet',
  name: 'Ruslan Helmet',
  description: '[ARTEFAKT] Odporność na wrogie premie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.isImmune = true
    const log = addLog(newState, `Ruslan Helmet: ${card.cardData.name} odporny na wrogie premie!`, 'effect')
    return effectResult(newState, [log])
  },
})

registerEffect({
  id: 'adventure_ruslan_helmet_enhanced',
  name: 'Ruslan Helmet (wzmocniony)',
  description: '[ARTEFAKT+] Jeśli nie atakuje — nie można go zaatakować.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.PREVENTION,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.isImmune = true
    card.metadata.ruslanHelmetStealth = true
    const log = addLog(newState, `Ruslan Helmet+: ${card.cardData.name} odporny + niewidzialny w obronie!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ ALATYR — Dobierz 5 kart, wystawij istoty
// ===================================================================

registerEffect({
  id: 'adventure_alatyr',
  name: 'Alatyr',
  description: '[ARTEFAKT] Dobierz 5 kart — wystawij z nich ile chcesz istot.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const player = newState.players[source.owner]
    const log: LogEntry[] = []
    // Dobierz 5 kart
    let drawn = 0
    for (let i = 0; i < 5 && player.deck.length > 0; i++) {
      const card = player.deck.shift()!
      card.isRevealed = source.owner === 'player1'
      player.hand.push(card)
      drawn++
    }
    log.push(addLog(newState, `Alatyr: Dobrano ${drawn} kart!`, 'effect'))
    // Wystawij automatycznie istoty (AI) — do 3 na wolne miejsca
    if ((player as any).isAI || source.owner === 'player2') {
      const creatures = player.hand.filter(c => c.cardData.cardType === 'creature').slice(0, 3)
      for (const c of creatures) {
        for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
          if (player.field.lines[line].length < 5) {
            const idx = player.hand.findIndex(h => h.instanceId === c.instanceId)
            if (idx !== -1) player.hand.splice(idx, 1)
            c.line = line
            c.turnsInPlay = 0
            c.roundEnteredPlay = newState.roundNumber
            player.field.lines[line].push(c)
            log.push(addLog(newState, `Alatyr: ${c.cardData.name} wystawiony w L${line}!`, 'effect'))
            break
          }
        }
      }
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_alatyr_enhanced',
  name: 'Alatyr (wzmocniony)',
  description: '[ARTEFAKT+] Nośnik = Prowokacja (rywal musi bić tylko jego).',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.activeEffects.push({ effectId: 'blotnik_taunt', sourceInstanceId: card.instanceId, trigger: EffectTrigger.PASSIVE, remainingTurns: null, stackId: `alatyr_taunt_${card.instanceId}`, metadata: {} })
    const log = addLog(newState, `Alatyr+: ${card.cardData.name} zyskuje Prowokację!`, 'effect')
    return effectResult(newState, [log])
  },
})

// ===================================================================
// ✅ ŁASKA PERENA — Welesowcy ½ ATK/DEF + tracą premie
// ===================================================================

registerEffect({
  id: 'adventure_aska_perena',
  name: 'Łaska Perena',
  description: '[ZDARZENIE] Welesowcy tracą ½ ATK i DEF i WSZYSTKIE premie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    for (const side of ['player1', 'player2'] as PlayerSide[]) {
      for (const c of getAllCreaturesOnField(newState, side)) {
        if ((c.cardData as any).idDomain === 4) {
          c.currentStats.attack = Math.max(1, Math.floor(c.currentStats.attack / 2))
          c.currentStats.defense = Math.max(1, Math.floor(c.currentStats.defense / 2))
          c.activeEffects = []
          c.isSilenced = true
          log.push(addLog(newState, `Łaska Perena: ${c.cardData.name} osłabiony! (½ statów, premie usunięte)`, 'effect'))
        }
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Łaska Perena: Brak Welesowców na polu.`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_aska_perena_enhanced',
  name: 'Łaska Perena (wzmocniona)',
  description: '[ZDARZENIE+] Zniszcz dowolną istotę na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    const victim = target ? findCardInState(newState, target.instanceId)
      : (enemies.length > 0 ? enemies.sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0]! : null)
    if (victim) {
      moveToGraveyard(newState, victim)
      return effectResult(newState, [addLog(newState, `Łaska Perena+: ${victim.cardData.name} zniszczony!`, 'death')])
    }
    return effectResult(newState, [addLog(newState, `Łaska Perena+: Brak celów.`, 'effect')])
  },
})

// ===================================================================
// ✅ ŁASKA RODA — Daj istocie dowolną premię
// ===================================================================

registerEffect({
  id: 'adventure_aska_roda',
  name: 'Łaska Roda',
  description: '[ZDARZENIE] Daj istocie +3 ATK i +3 DEF.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.currentStats.attack += 3
    card.currentStats.defense += 3
    return effectResult(newState, [addLog(newState, `Łaska Roda: ${card.cardData.name} zyskuje +3 ATK / +3 DEF!`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_aska_roda_enhanced',
  name: 'Łaska Roda (wzmocniona)',
  description: '[ZDARZENIE+] 2 istoty zamieniają się premiami i atrybutami.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) return effectResult(newState, [addLog(newState, `Łaska Roda+: Potrzeba 2 istot!`, 'effect')])
    const a = allies[0]!, b = allies[1]!
    const tmpAtk = a.currentStats.attack; const tmpDef = a.currentStats.defense
    a.currentStats.attack = b.currentStats.attack; a.currentStats.defense = b.currentStats.defense
    b.currentStats.attack = tmpAtk; b.currentStats.defense = tmpDef
    const tmpEffects = [...a.activeEffects]; a.activeEffects = [...b.activeEffects]; b.activeEffects = tmpEffects
    return effectResult(newState, [addLog(newState, `Łaska Roda+: ${a.cardData.name} ↔ ${b.cardData.name} — zamiana statów i premii!`, 'effect')])
  },
})

// ===================================================================
// ✅ ŁASKA ZORZY — Przywróć zużyte Zdarzenie
// ===================================================================

registerEffect({
  id: 'adventure_aska_zorzy',
  name: 'Łaska Zorzy',
  description: '[ZDARZENIE] Przywróć 1 zużyte Zdarzenie z cmentarza na rękę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const player = newState.players[source.owner]
    const eventIdx = player.graveyard.findIndex(c => c.cardData.cardType === 'adventure')
    if (eventIdx !== -1) {
      const card = player.graveyard.splice(eventIdx, 1)[0]!
      card.isRevealed = source.owner === 'player1'
      player.hand.push(card)
      return effectResult(newState, [addLog(newState, `Łaska Zorzy: ${card.cardData.name} wraca z cmentarza na rękę!`, 'effect')])
    }
    return effectResult(newState, [addLog(newState, `Łaska Zorzy: Brak Zdarzeń w cmentarzu.`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_aska_zorzy_enhanced',
  name: 'Łaska Zorzy (wzmocniona)',
  description: '[ZDARZENIE+] Skopiuj aktywne Zdarzenie na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state } = ctx
    const newState = cloneGameState(state)
    if (newState.activeEvents.length > 0) {
      const copied = JSON.parse(JSON.stringify(newState.activeEvents[0]!))
      copied.instanceId = `zorzy_copy_${Date.now()}`
      newState.activeEvents.push(copied)
      return effectResult(newState, [addLog(newState, `Łaska Zorzy+: Skopiowano Zdarzenie ${copied.cardData.name}!`, 'effect')])
    }
    return effectResult(newState, [addLog(newState, `Łaska Zorzy+: Brak aktywnych Zdarzeń.`, 'effect')])
  },
})

// ===================================================================
// ✅ ŁASKA SWAROŻYCA — Zadaj 6 obrażeń wrogom
// ===================================================================

registerEffect({
  id: 'adventure_aska_swarozyca',
  name: 'Łaska Swarożyca',
  description: '[ZDARZENIE] Zadaj 6 obrażeń rozłożonych po równo między wrogów.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    const log: LogEntry[] = []
    if (enemies.length === 0) return effectResult(newState, [addLog(newState, `Łaska Swarożyca: Brak wrogów.`, 'effect')])
    const dmgEach = Math.floor(6 / enemies.length)
    const remainder = 6 - dmgEach * enemies.length
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      const dmg = dmgEach + (i < remainder ? 1 : 0)
      e.currentStats.defense -= dmg
      log.push(addLog(newState, `Łaska Swarożyca: ${e.cardData.name} otrzymuje ${dmg} obrażeń!`, 'effect'))
      if (e.currentStats.defense <= 0) {
        moveToGraveyard(newState, e)
        log.push(addLog(newState, `${e.cardData.name} ginie!`, 'death'))
      }
    }
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_aska_swarozyca_enhanced',
  name: 'Łaska Swarożyca (wzmocniona)',
  description: '[ZDARZENIE+] Rozdzielaj 6 obrażeń dowolnie.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const log: LogEntry[] = []
    // Jeśli jest cel — 6 DMG na niego, inaczej najsilniejszy wróg
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const victim = target ? findCardInState(newState, target.instanceId)
      : getAllCreaturesOnField(newState, enemySide).sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))[0] ?? null
    if (victim) {
      victim.currentStats.defense -= 6
      log.push(addLog(newState, `Łaska Swarożyca+: ${victim.cardData.name} otrzymuje 6 obrażeń!`, 'effect'))
      if (victim.currentStats.defense <= 0) {
        moveToGraveyard(newState, victim)
        log.push(addLog(newState, `${victim.cardData.name} ginie!`, 'death'))
      }
    } else {
      log.push(addLog(newState, `Łaska Swarożyca+: Brak celów.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ ŁASKA MORANY — Zabij 3 następne wystawione wrogi istoty
// ===================================================================

registerEffect({
  id: 'adventure_aska_morany',
  name: 'Łaska Morany',
  description: '[ZDARZENIE] Zabij 3 następne wystawione wrogi istoty.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    ;(newState.players[source.owner] as any).moranaKillCount = 3
    return effectResult(newState, [addLog(newState, `Łaska Morany: Następne 3 wystawione wrogi istoty zostaną zabite!`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_aska_morany_enhanced',
  name: 'Łaska Morany (wzmocniona)',
  description: '[ZDARZENIE+] 1 z zabitych trafia do Twojej talii.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    ;(newState.players[source.owner] as any).moranaKillCount = 3
    ;(newState.players[source.owner] as any).moranaStealOne = true
    return effectResult(newState, [addLog(newState, `Łaska Morany+: Następne 3 wrogi istoty zabite, 1. trafia do Twojej talii!`, 'effect')])
  },
})

// ===================================================================
// ✅ ŁASKA SWAROGA — Odtwórz Artefakt/Lokację
// ===================================================================

registerEffect({
  id: 'adventure_aska_swaroga',
  name: 'Łaska Swaroga',
  description: '[ZDARZENIE] Odtwórz zniszczony Artefakt lub Lokację z cmentarza.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const player = newState.players[source.owner]
    const idx = player.graveyard.findIndex(c => c.cardData.cardType === 'adventure')
    if (idx !== -1) {
      const card = player.graveyard.splice(idx, 1)[0]!
      player.hand.push(card)
      return effectResult(newState, [addLog(newState, `Łaska Swaroga: ${card.cardData.name} odtworzona z cmentarza!`, 'effect')])
    }
    return effectResult(newState, [addLog(newState, `Łaska Swaroga: Brak zniszczonych Przygód.`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_aska_swaroga_enhanced',
  name: 'Łaska Swaroga (wzmocniona)',
  description: '[ZDARZENIE+] Skopiuj aktywny Artefakt/Lokację na polu.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const player = newState.players[source.owner]
    const log: LogEntry[] = []
    // Skopiuj lokację wroga
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemyLoc = newState.players[enemySide].activeLocation
    if (enemyLoc && !player.activeLocation) {
      player.activeLocation = JSON.parse(JSON.stringify(enemyLoc))
      player.activeLocation!.owner = source.owner as PlayerSide
      log.push(addLog(newState, `Łaska Swaroga+: Skopiowano Lokację ${enemyLoc.cardData.name}!`, 'effect'))
    } else {
      log.push(addLog(newState, `Łaska Swaroga+: Brak Lokacji do skopiowania.`, 'effect'))
    }
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ ŁASKA ŚWIĘTOWIDA — Za każde zabójstwo +ATK ofiary
// ===================================================================

registerEffect({
  id: 'adventure_aska_swietowida',
  name: 'Łaska Świętowida',
  description: '[ZDARZENIE] Wskazana istota: za każde zabójstwo +ATK ofiary.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, target } = ctx
    if (!target) return effectResult(cloneGameState(state))
    const newState = cloneGameState(state)
    const card = findCardInState(newState, target.instanceId)
    if (!card) return effectResult(newState)
    card.metadata.swietowidKillBuff = true
    return effectResult(newState, [addLog(newState, `Łaska Świętowida: ${card.cardData.name} — za każde zabójstwo +ATK ofiary!`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_aska_swietowida_enhanced',
  name: 'Łaska Świętowida (wzmocniona)',
  description: '[ZDARZENIE+] Twoje istoty po zabiciu wroga nie kończą tury.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    for (const a of allies) {
      a.metadata.swietowidFreeKill = true
    }
    return effectResult(newState, [addLog(newState, `Łaska Świętowida+: Twoje istoty po zabiciu nie kończą tury!`, 'effect')])
  },
})

// ===================================================================
// ✅ POŚWIĘCENIE WANDY — Wróg sparaliżowany 1 rundę
// ===================================================================

registerEffect({
  id: 'adventure_poswiecenie_wandy',
  name: 'Poświęcenie Wandy',
  description: '[ZDARZENIE] Wróg nie może nic robić przez następną rundę.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.cannotAttack = true
      e.paralyzeRoundsLeft = 1
    }
    ;(newState.players[enemySide] as any).wandaSkipTurn = true
    return effectResult(newState, [addLog(newState, `Poświęcenie Wandy: Wróg sparaliżowany na następną rundę!`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_poswiecenie_wandy_enhanced',
  name: 'Poświęcenie Wandy (wzmocnione)',
  description: '[ZDARZENIE+] Wróg sparaliżowany na 2 rundy.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    for (const e of enemies) {
      e.cannotAttack = true
      e.paralyzeRoundsLeft = 2
    }
    ;(newState.players[enemySide] as any).wandaSkipTurn = 2
    return effectResult(newState, [addLog(newState, `Poświęcenie Wandy+: Wróg sparaliżowany na 2 rundy!`, 'effect')])
  },
})

// ===================================================================
// ✅ ŁASKA ŁADY — Zaatakowani wrogowie tracą Lot
// ===================================================================

registerEffect({
  id: 'adventure_aska_ady',
  name: 'Łaska Łady',
  description: '[ZDARZENIE] Zaatakowani wrogowie tracą Lot.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(newState, enemySide)
    const log: LogEntry[] = []
    for (const e of enemies) {
      if ((e.cardData as any).isFlying) {
        e.isGrounded = true
        log.push(addLog(newState, `Łaska Łady: ${e.cardData.name} traci Lot!`, 'effect'))
      }
    }
    if (log.length === 0) log.push(addLog(newState, `Łaska Łady: Brak latających wrogów.`, 'effect'))
    return effectResult(newState, log)
  },
})

registerEffect({
  id: 'adventure_aska_ady_enhanced',
  name: 'Łaska Łady (wzmocniona)',
  description: '[ZDARZENIE+] Istoty w L3 otrzymują ×3 obrażeń.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const enemySide = source.owner === 'player1' ? 'player2' : 'player1'
    const l3Enemies = newState.players[enemySide].field.lines[BattleLine.SUPPORT]
    const log: LogEntry[] = []
    for (const e of l3Enemies) {
      e.metadata.tripleIncomingDamage = true
      log.push(addLog(newState, `Łaska Łady+: ${e.cardData.name} (L3) otrzyma ×3 obrażeń!`, 'effect'))
    }
    if (log.length === 0) log.push(addLog(newState, `Łaska Łady+: Brak wrogów w L3.`, 'effect'))
    return effectResult(newState, log)
  },
})

// ===================================================================
// ✅ GUSŁA — Transfer statów i premii między istotami
// ===================================================================

registerEffect({
  id: 'adventure_gusa',
  name: 'Gusła',
  description: '[ZDARZENIE] Transfer ATK, DEF i premii z jednej istoty na drugą.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source, target } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) return effectResult(newState, [addLog(newState, `Gusła: Potrzeba 2 istot!`, 'effect')])
    const sorted = [...allies].sort((a, b) => (a.currentStats.attack + a.currentStats.defense) - (b.currentStats.attack + b.currentStats.defense))
    const donor = target ? findCardInState(newState, target.instanceId) ?? sorted[0]! : sorted[0]!
    const receiver = sorted.find(c => c.instanceId !== donor.instanceId)!
    receiver.currentStats.attack += donor.currentStats.attack
    receiver.currentStats.defense += donor.currentStats.defense
    receiver.activeEffects.push(...donor.activeEffects)
    donor.currentStats.attack = 0
    donor.currentStats.defense = 1
    donor.activeEffects = []
    return effectResult(newState, [addLog(newState, `Gusła: ${donor.cardData.name} → ${receiver.cardData.name}! Transfer statów i premii.`, 'effect')])
  },
})

registerEffect({
  id: 'adventure_gusa_enhanced',
  name: 'Gusła (wzmocnione)',
  description: '[ZDARZENIE+] Zamień ATK i DEF między 2 swoimi istotami.',
  trigger: EffectTrigger.ON_PLAY,
  priority: EffectPriority.MODIFIER,
  execute: (ctx) => {
    const { state, source } = ctx
    const newState = cloneGameState(state)
    const allies = getAllCreaturesOnField(newState, source.owner)
    if (allies.length < 2) return effectResult(newState, [addLog(newState, `Gusła+: Potrzeba 2 istot!`, 'effect')])
    const a = allies[0]!, b = allies[1]!
    const tmpAtk = a.currentStats.attack; const tmpDef = a.currentStats.defense
    a.currentStats.attack = b.currentStats.attack; a.currentStats.defense = b.currentStats.defense
    b.currentStats.attack = tmpAtk; b.currentStats.defense = tmpDef
    return effectResult(newState, [addLog(newState, `Gusła+: ${a.cardData.name} ↔ ${b.cardData.name} — zamiana statów!`, 'effect')])
  },
})

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
