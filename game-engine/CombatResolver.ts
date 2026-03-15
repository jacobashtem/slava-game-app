/**
 * CombatResolver — serce silnika.
 * Obsługuje: obrażenia, kontratak, śmierć, dynamiczny front, efekty walki.
 */

import type { GameState, CardInstance, CombatResult, LogEntry } from './types'
import { CardPosition, AttackType, BattleLine, EffectTrigger } from './constants'
import type { PlayerSide } from './types'
import { cloneGameState, addLog, moveToGraveyard } from './GameStateUtils'
import { canAttack, removeFromField, getEnemyFrontLine, getOwnFrontLine } from './LineManager'
import { getEffect } from './EffectRegistry'
import { trackKill, trackDamageDealt } from './GloryManager'

// ===================================================================
// GŁÓWNA FUNKCJA ATAKU
// ===================================================================

export function resolveAttack(
  state: GameState,
  attackerInstanceId: string,
  defenderInstanceId: string,
  options?: { forceBrzeginaSkip?: boolean; forcedByEffect?: boolean }
): { newState: GameState; result: CombatResult } {
  let newState = cloneGameState(state)

  const attacker = findCardOnField(newState, attackerInstanceId)
  const defender = findCardOnField(newState, defenderInstanceId)

  if (!attacker || !defender) {
    throw new Error(`[CombatResolver] Nie znaleziono kart: ${attackerInstanceId} / ${defenderInstanceId}`)
  }

  // 1. Walidacja zasięgu (wymuszony atak pomija owner/position/hasAttacked, ale zachowuje zasięg linii)
  const validation = canAttack(newState, attacker, defender, { forcedByEffect: options?.forcedByEffect })
  const isSoftFail = !validation.valid && !!validation.softFail
  if (!validation.valid && !validation.softFail) {
    throw new Error(`[CombatResolver] Nieprawidłowy atak: ${validation.reason}`)
  }

  // Sztandar / Sztandar+: nośnik nie może atakować
  if (attacker.equippedArtifacts.some(a => ['adventure_sztandar', 'adventure_sztandar_enhanced'].includes((a as any).effectId))) {
    throw new Error(`[CombatResolver] ${attacker.cardData.name} trzyma Sztandar — nie może atakować!`)
  }

  const log: LogEntry[] = []
  const effectsTriggered: string[] = []

  // 2. Ujawnij obie karty (pierwsza walka = karta ujawniona)
  const revealAttacker = findCardOnField(newState, attackerInstanceId)
  const revealDefender = findCardOnField(newState, defenderInstanceId)
  if (revealAttacker) revealAttacker.isRevealed = true
  if (revealDefender) revealDefender.isRevealed = true

  // Sztandar+: gdy nośnik wzmocnionego sztandaru jest atakowany, losowy sojusznik przejmuje atak
  {
    const potentialDefender = findCardOnField(newState, defenderInstanceId)
    if (potentialDefender && potentialDefender.equippedArtifacts.some(a => (a as any).effectId === 'adventure_sztandar_enhanced')) {
      const defOwner = potentialDefender.owner as PlayerSide
      const allies = getAllCreaturesForPlayer(newState, defOwner)
        .filter(c => c.instanceId !== defenderInstanceId && c.currentStats.defense > 0)
      if (allies.length > 0) {
        const interceptor = allies[Math.floor(Math.random() * allies.length)]!
        log.push(addLog(newState,
          `Sztandar+: ${interceptor.cardData.name} staje w obronie ${potentialDefender.cardData.name}!`,
          'effect'
        ))
        defenderInstanceId = interceptor.instanceId
      }
    }
  }

  // 3. Trigger: ON_ATTACK efekty atakującego (np. Gryf, Szalińc)
  const preAttackResult = triggerEffect(newState, attacker, EffectTrigger.ON_ATTACK, findCardOnField(newState, defenderInstanceId) ?? defender)
  newState = preAttackResult.newState
  log.push(...preAttackResult.log)

  // Pobierz referencje po klonowaniu
  let currentAttacker = findCardOnField(newState, attackerInstanceId)
  let currentDefender = findCardOnField(newState, defenderInstanceId)

  // Guard: karty mogły zniknąć z pola po efekcie ON_ATTACK
  if (!currentAttacker || !currentDefender) {
    return {
      newState,
      result: {
        attacker: currentAttacker ?? attacker,
        defender: currentDefender ?? defender,
        damageToDefender: 0, damageToAttacker: 0,
        defenderDied: false, attackerDied: false,
        counterattackOccurred: false, effectsTriggered, log,
      },
    }
  }

  // 3. Oblicz obrażenia atakującego (softFail = atak chybiony, 0 DMG ale kontratak działa)
  const damageCalc = calculateDamage(newState, currentAttacker, currentDefender)
  let damageToDefender = isSoftFail ? 0 : damageCalc.damage
  if (isSoftFail) {
    log.push(addLog(newState,
      `${currentAttacker.cardData.name} atakuje ${currentDefender.cardData.name} — ${validation.reason ?? 'chybiony!'}`,
      'effect', [attackerInstanceId, defenderInstanceId]
    ))
  }
  log.push(...damageCalc.bonusLog)

  // 4. Sprawdź prewencję obrażeń (np. Brzegina)
  const preventionResult = checkDamagePrevention(newState, currentAttacker, currentDefender, damageToDefender, options?.forceBrzeginaSkip)
  if (preventionResult.prevented) {
    newState = preventionResult.newState
    log.push(...preventionResult.log)
    currentAttacker.hasAttackedThisTurn = true
    return {
      newState,
      result: {
        attacker: currentAttacker,
        defender: currentDefender,
        damageToDefender: 0,
        damageToAttacker: 0,
        defenderDied: false,
        attackerDied: false,
        counterattackOccurred: false,
        effectsTriggered,
        log,
      },
    }
  }

  // 5. ZADAJ OBRAŻENIA OBROŃCY
  // Zapamiętaj oryginalną DEF przed ciosem — kontratak działa jednocześnie (tarcza = pełna moc)
  const defenderDefBeforeHit = currentDefender.currentStats.defense
  currentDefender.currentStats.defense -= damageToDefender
  log.push(addLog(newState,
    `${currentAttacker.cardData.name} atakuje ${currentDefender.cardData.name} za ${damageToDefender} obrażeń. (DEF: ${currentDefender.currentStats.defense + damageToDefender} → ${currentDefender.currentStats.defense})`,
    'damage',
    [attackerInstanceId, defenderInstanceId]
  ))

  // Sława: track damage dealt for holiday conditions
  trackDamageDealt(newState, currentAttacker.owner as PlayerSide, damageToDefender)

  // 5b. BRZEGINA — check RIGHT AFTER damage dealt, BEFORE any triggers
  // Brzegina "cancels" the attack: damage is healed, no ON_DAMAGE triggers, no counterattack
  if (damageToDefender > 0 && !options?.forceBrzeginaSkip && currentDefender.currentStats.defense > 0) {
    const defOwner = currentDefender.owner as PlayerSide
    if (!newState.players[defOwner].isAI) {
      const brzegina = getAllCreaturesForPlayer(newState, defOwner).find(c =>
        (c.cardData as any).effectId === 'brzegina_shield_for_gold' &&
        c.instanceId !== defenderInstanceId &&
        !c.isSilenced &&
        c.currentStats.defense > 0
      )
      if (brzegina) {
        const brzeginaEffect = getEffect('brzegina_shield_for_gold')
        if (brzeginaEffect?.canActivate?.({ state: newState, source: brzegina, target: currentDefender, trigger: EffectTrigger.ON_DAMAGE_RECEIVED })) {
          const firstUseFree = !(brzegina.metadata.brzeginaUsedFree as boolean)
          newState.pendingInteraction = {
            type: 'brzegina_shield',
            sourceInstanceId: brzegina.instanceId,
            respondingPlayer: defOwner,
            targetInstanceId: defenderInstanceId,
            metadata: {
              cost: firstUseFree ? 0 : 1,
              damageToHeal: damageToDefender,
              attackerInstanceId,
              defenderDefBeforeHit,
            },
          }
          addLog(newState, `${brzegina.cardData.name}: Może cofnąć obrażenia na ${currentDefender.cardData.name}!`, 'effect')

          // Mark attacker as having attacked
          currentAttacker.hasAttackedThisTurn = true
          if ((currentAttacker.cardData as any).effectId === 'lesnica_double_attack') {
            currentAttacker.metadata.attacksThisTurn = ((currentAttacker.metadata.attacksThisTurn as number) ?? 0) + 1
          }

          return {
            newState,
            result: {
              attacker: currentAttacker,
              defender: currentDefender,
              damageToDefender,
              damageToAttacker: 0,
              defenderDied: false,
              attackerDied: false,
              counterattackOccurred: false,
              brzeginaPaused: true,
              defenderDefBeforeHit,
              effectsTriggered,
              log,
            },
          }
        }
      }
    }
  }

  // 6. Trigger: ON_DAMAGE_RECEIVED na obrońcy (np. Bugaj) + ON_DAMAGE_DEALT na atakującym
  const onDamageRecResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DAMAGE_RECEIVED, currentAttacker, damageToDefender)
  newState = onDamageRecResult.newState
  log.push(...onDamageRecResult.log)

  const onDamageDealtResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DAMAGE_DEALT, currentDefender, damageToDefender)
  newState = onDamageDealtResult.newState
  log.push(...onDamageDealtResult.log)

  // Trigger: ON_ATTACK efekty specjalne (np. Biali Ludzie, Dziewiątko)
  const attackEffectResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_ATTACK, currentDefender)
  newState = attackEffectResult.newState
  log.push(...attackEffectResult.log)

  currentAttacker = findCardOnField(newState, attackerInstanceId)
  currentDefender = findCardOnField(newState, defenderInstanceId)

  // Guard: karty mogły zniknąć z pola po efektach ON_DAMAGE (np. Wisielec bounce)
  if (!currentAttacker || !currentDefender) {
    let earlyDefenderDied = !currentDefender
    let earlyAttackerDied = !currentAttacker

    // Jeśli obrońca nadal jest na polu ale ma DEF <= 0 → zabij go (np. Wisielec po bounce atakującego)
    if (currentDefender && currentDefender.currentStats.defense <= 0) {
      earlyDefenderDied = true
      moveToGraveyard(newState, currentDefender)
      log.push(addLog(newState, `${currentDefender.cardData.name} ginie! (DEF: ${currentDefender.currentStats.defense})`, 'death', [defenderInstanceId]))
      // ON_DEATH trigger
      const deathResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DEATH)
      newState = deathResult.newState
      log.push(...deathResult.log)
      // ON_ANY_DEATH trigger
      for (const side of ['player1', 'player2'] as const) {
        for (const line of Object.values(newState.players[side].field.lines)) {
          for (const c of line as any[]) {
            if (c.instanceId === currentDefender.instanceId) continue
            const anyDeathResult = triggerEffect(newState, c, EffectTrigger.ON_ANY_DEATH, currentDefender)
            newState = anyDeathResult.newState
            log.push(...anyDeathResult.log)
          }
        }
      }
    }

    // Jeśli atakujący nadal jest na polu ale ma DEF <= 0 → zabij go
    if (currentAttacker && currentAttacker.currentStats.defense <= 0) {
      earlyAttackerDied = true
      moveToGraveyard(newState, currentAttacker)
      log.push(addLog(newState, `${currentAttacker.cardData.name} ginie! (DEF: ${currentAttacker.currentStats.defense})`, 'death', [attackerInstanceId]))
      const deathResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DEATH)
      newState = deathResult.newState
      log.push(...deathResult.log)
    } else if (currentAttacker) {
      currentAttacker.hasAttackedThisTurn = true
      if ((currentAttacker.cardData as any).effectId === 'lesnica_double_attack') {
        currentAttacker.metadata.attacksThisTurn = ((currentAttacker.metadata.attacksThisTurn as number) ?? 0) + 1
      }
    }

    return {
      newState,
      result: {
        attacker: currentAttacker ?? attacker,
        defender: currentDefender ?? defender,
        damageToDefender, damageToAttacker: 0,
        defenderDied: earlyDefenderDied, attackerDied: earlyAttackerDied,
        counterattackOccurred: false, effectsTriggered, log,
      },
    }
  }

  // Rumak (#46): jeździec z rumakiem rani całą linię wrogów
  if (currentAttacker && currentAttacker.metadata.rumakActive && !currentAttacker.isSilenced && damageToDefender > 0) {
    const defLine = currentDefender?.line
    if (defLine !== null && defLine !== undefined) {
      const defenderSide = currentDefender?.owner ?? (currentAttacker.owner === 'player1' ? 'player2' : 'player1')
      const lineEnemies = newState.players[defenderSide].field.lines[defLine]
        .filter(c => c.instanceId !== defenderInstanceId && c.currentStats.defense > 0)
      for (const lineEnemy of lineEnemies) {
        lineEnemy.currentStats.defense -= damageToDefender
        log.push(addLog(newState,
          `${currentAttacker.cardData.name}: Rumak! Uderza ${lineEnemy.cardData.name} za ${damageToDefender} obrażeń.`,
          'effect'
        ))
        if (lineEnemy.currentStats.defense <= 0) {
          const removed = newState.players[defenderSide].field.lines[defLine]
            .find(c => c.instanceId === lineEnemy.instanceId)
          if (removed) {
            newState.players[defenderSide].field.lines[defLine] =
              newState.players[defenderSide].field.lines[defLine].filter(c => c.instanceId !== removed.instanceId)
            removed.line = null
            newState.players[defenderSide].graveyard.push(removed)
            log.push(addLog(newState, `${removed.cardData.name} poległ od ciosu jeźdźca!`, 'death'))
          }
        }
      }
      currentAttacker = findCardOnField(newState, attackerInstanceId)
      currentDefender = findCardOnField(newState, defenderInstanceId)
    }
  }

  // Guard: karty mogły zniknąć po cleave Rumaka
  if (!currentAttacker || !currentDefender) {
    if (currentAttacker) {
      currentAttacker.hasAttackedThisTurn = true
    }
    return {
      newState,
      result: {
        attacker: currentAttacker ?? attacker,
        defender: currentDefender ?? defender,
        damageToDefender, damageToAttacker: 0,
        defenderDied: !currentDefender, attackerDied: !currentAttacker,
        counterattackOccurred: false, effectsTriggered, log,
      },
    }
  }

  // Trigger: ON_ALLY_ATTACKED — sojusznicy obrońcy (np. Niedźwiedziołak, Wielkolud)
  if (currentDefender) {
    const defenderSideAllies = getAllCreaturesForPlayer(newState, currentDefender.owner)
      .filter(c => c.instanceId !== defenderInstanceId && !c.isSilenced)
    for (const ally of defenderSideAllies) {
      const allyResult = triggerEffect(newState, ally, EffectTrigger.ON_ALLY_ATTACKED, currentAttacker, damageToDefender)
      newState = allyResult.newState
      log.push(...allyResult.log)
    }
    // Odśwież referencje po ewentualnych zmianach
    currentAttacker = findCardOnField(newState, attackerInstanceId)
    currentDefender = findCardOnField(newState, defenderInstanceId)
  }

  // 7. KONTRATAK
  let damageToAttacker = 0
  let counterattackOccurred = false

  // Guard: karty mogły zostać odesłane do talii (np. Wisielec) przed kontratakiem
  if (!currentAttacker || !currentDefender) {
    // Ustaw flagę ataku dla atakującego (jeśli nadal jest na polu)
    if (currentAttacker) {
      currentAttacker.hasAttackedThisTurn = true
      if ((currentAttacker.cardData as any).effectId === 'lesnica_double_attack') {
        currentAttacker.metadata.attacksThisTurn = ((currentAttacker.metadata.attacksThisTurn as number) ?? 0) + 1
      }
    }
    // Zebranie wyniku bez kontrataku
    const finalAttackerNc = findCardOnField(newState, attackerInstanceId) ?? attacker
    const finalDefenderNc = findCardOnField(newState, defenderInstanceId) ?? defender
    return {
      newState,
      result: {
        attacker: finalAttackerNc, defender: finalDefenderNc,
        damageToDefender, damageToAttacker: 0,
        defenderDied: !findCardOnField(newState, defenderInstanceId), attackerDied: !findCardOnField(newState, attackerInstanceId), counterattackOccurred: false,
        effectsTriggered, log,
      },
    }
  }

  const counterCheck = shouldCounterattack(newState, currentAttacker, currentDefender)
  if (counterCheck.reason) {
    log.push(addLog(newState, counterCheck.reason, 'effect'))
  }
  if (counterCheck.canCounter) {
    // Kontratak używa DEF sprzed ciosu (walka jednoczesna — tarcza zachowuje pełną moc)
    damageToAttacker = Math.max(0, defenderDefBeforeHit)

    // Wyjątek: niektóre efekty blokują kontratak (np. Topór Peruna)
    if (currentAttacker.metadata.noCounterattack) {
      damageToAttacker = 0
      const ncSource = currentAttacker.metadata.toporPerunaUsed ? 'Topór Peruna'
        : currentAttacker.metadata.mlotSwarogaEnhanced ? 'Młot Swaroga+'
        : currentAttacker.metadata.mlotSwarogaActive ? 'Młot Swaroga'
        : 'efekt'
      log.push(addLog(newState, `${currentDefender.cardData.name} nie może kontratakować — ${currentAttacker.cardData.name} ma efekt "${ncSource}" (atak bez kontrataku).`, 'effect'))
    } else if (damageToAttacker > 0) {
      currentAttacker.currentStats.defense -= damageToAttacker
      counterattackOccurred = true
      log.push(addLog(newState,
        `${currentDefender.cardData.name} kontratakuje ${currentAttacker.cardData.name} za ${damageToAttacker}. (DEF: ${currentAttacker.currentStats.defense + damageToAttacker} → ${currentAttacker.currentStats.defense})`,
        'damage',
        [defenderInstanceId, attackerInstanceId]
      ))

      // Trigger ON_DAMAGE_RECEIVED na atakującym (od kontrataku) + ON_DAMAGE_DEALT na obrońcy
      const counterDmgResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DAMAGE_RECEIVED, currentDefender, damageToAttacker)
      const counterDealtResult = triggerEffect(counterDmgResult.newState, currentDefender, EffectTrigger.ON_DAMAGE_DEALT, currentAttacker, damageToAttacker)
      counterDmgResult.newState = counterDealtResult.newState
      counterDmgResult.log.push(...counterDealtResult.log)
      newState = counterDmgResult.newState
      log.push(...counterDmgResult.log)
    }
  }

  currentAttacker = findCardOnField(newState, attackerInstanceId)
  currentDefender = findCardOnField(newState, defenderInstanceId)

  // Oznacz że atakujący już atakował
  if (currentAttacker) {
    // Przyjaźń+: darmowy atak — dekrementuj licznik, nie ustawiaj hasAttackedThisTurn
    const freeLeft = (currentAttacker.metadata.freeAttacksLeft as number) ?? 0
    if (freeLeft > 0) {
      currentAttacker.metadata.freeAttacksLeft = freeLeft - 1
    } else {
      currentAttacker.hasAttackedThisTurn = true
    }
    // Leśnica: śledź liczbę ataków w tej turze
    if ((currentAttacker.cardData as any).effectId === 'lesnica_double_attack') {
      currentAttacker.metadata.attacksThisTurn = ((currentAttacker.metadata.attacksThisTurn as number) ?? 0) + 1
    }
  }

  // 8. ŚMIERĆ OBROŃCY
  let defenderDied = false
  if (currentDefender && currentDefender.currentStats.defense <= 0) {
    defenderDied = true
    const attackerName = currentAttacker?.cardData.name ?? attacker.cardData.name
    const attackerAtk = currentAttacker?.currentStats.attack ?? attacker.currentStats.attack
    log.push(addLog(newState, `${attackerName} zabija ${currentDefender.cardData.name}! (ATK ${attackerAtk} vs DEF ${currentDefender.currentStats.defense})`, 'death', [defenderInstanceId]))

    // Zapamiętaj zabójcę (dla Latawca i Homena)
    currentDefender.metadata.killedBy = attackerInstanceId

    // Obsłuż Homen: jeśli zabitego naznaczył Homen → wskrzeszenie po drugiej stronie
    if (currentDefender.metadata.homenCurseOwner) {
      const newOwner = currentDefender.metadata.homenCurseOwner as string
      const homenData = currentDefender.metadata.homenCardData as any
      if (homenData && newOwner) {
        currentDefender.owner = newOwner as 'player1' | 'player2'
        const hAtk = homenData.stats?.attack ?? 1
        const hDef = homenData.stats?.defense ?? 1
        currentDefender.currentStats = { attack: hAtk, defense: hDef, maxAttack: hAtk, maxDefense: hDef }
        currentDefender.position = CardPosition.ATTACK
        currentDefender.metadata = {}
        delete currentDefender.metadata.homenCurseOwner
        newState.players[newOwner as 'player1' | 'player2'].field.lines[BattleLine.FRONT].push(currentDefender)
        log.push(addLog(newState, `${currentDefender.cardData.name} wstaje jako Homen po stronie ${newOwner}!`, 'effect'))
      }
    }

    // Sobowtór: kopia chroniona dopóki oryginał żyje — sprawdź PRZED triggerami śmierci
    if (currentDefender.metadata.sobowtorProtected) {
      const originalId = currentDefender.metadata.sobowtorOriginalId as string
      const originalAlive = getAllCreaturesForPlayer(newState, currentDefender.owner)
        .some(c => c.instanceId === originalId)
      if (originalAlive) {
        currentDefender.currentStats.defense = (currentDefender.cardData as any).stats?.defense ?? 1
        defenderDied = false
        log.push(addLog(newState, `Sobowtór: Kopia ${currentDefender.cardData.name} niezniszczalna dopóki oryginał żyje!`, 'effect'))
      }
    }

    // Trigger ON_DEATH obrońcy (pominięty jeśli Sobowtór uratował)
    if (defenderDied) {
      const deathResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DEATH)
      newState = deathResult.newState
      log.push(...deathResult.log)

      // Trigger ON_KILL atakującego (np. Dziki Myśliwy, Czarnoksiężnik)
      currentAttacker = findCardOnField(newState, attackerInstanceId)
      if (currentAttacker) {
        const killResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_KILL, currentDefender)
        newState = killResult.newState
        log.push(...killResult.log)
      }

      // Sprawdź efekt Moc Światogora: karta ginie po zabiciu
      currentAttacker = findCardOnField(newState, attackerInstanceId)
      if (currentAttacker?.metadata?.diesOnKill) {
        currentAttacker.currentStats.defense = 0
        log.push(addLog(newState, `${currentAttacker.cardData.name} ginie zgodnie z efektem Mocy Światogora!`, 'death'))
      }

      // ON_ANY_DEATH — trigger dla wszystkich istot na polu (np. Baba Jaga)
      const allBeforeDefDeath = getAllCreaturesForPlayer(newState, 'player1').concat(getAllCreaturesForPlayer(newState, 'player2'))
      for (const watcher of allBeforeDefDeath) {
        if (watcher.instanceId === defenderInstanceId) continue
        const watchResult = triggerEffect(newState, watcher, EffectTrigger.ON_ANY_DEATH, currentDefender)
        newState = watchResult.newState
        log.push(...watchResult.log)
      }

      // Trofeum: dodaj do trofeów właściciela atakującego (tryb Slava!)
      const attackerPlayer = newState.players[currentAttacker?.owner ?? attacker.owner]
      const killerSide = (currentAttacker?.owner ?? attacker.owner) as PlayerSide
      const defenderCardRemoved = removeFromField(newState, defenderInstanceId)
      if (defenderCardRemoved) {
        defenderCardRemoved.line = null
        newState.players[defenderCardRemoved.owner].graveyard.push(defenderCardRemoved)
        attackerPlayer?.trophies.push(defenderCardRemoved)

        // Sława: track kill for trophy bonus calculation
        trackKill(newState, killerSide, defenderCardRemoved)

        // Kościej (#43): wskrzesza się po śmierci od Wręcz (1. raz gratis)
        if (defenderCardRemoved.metadata.kosciejResurrected) {
          delete defenderCardRemoved.metadata.kosciejResurrected
          defenderCardRemoved.currentStats.defense = (defenderCardRemoved.cardData as any).stats.defense
          defenderCardRemoved.line = BattleLine.FRONT
          const gravIdx = newState.players[defenderCardRemoved.owner].graveyard.findIndex(c => c.instanceId === defenderCardRemoved.instanceId)
          if (gravIdx !== -1) newState.players[defenderCardRemoved.owner].graveyard.splice(gravIdx, 1)
          if (attackerPlayer) {
            const trophyIdx = attackerPlayer.trophies.findIndex(c => c.instanceId === defenderCardRemoved.instanceId)
            if (trophyIdx !== -1) attackerPlayer.trophies.splice(trophyIdx, 1)
          }
          newState.players[defenderCardRemoved.owner].field.lines[BattleLine.FRONT].push(defenderCardRemoved)
          defenderDied = false
          log.push(addLog(newState, `${defenderCardRemoved.cardData.name}: Serce bije! Wstaje na L1!`, 'effect'))
        }

        // Wij (#116): wskrzesza się raz na grę na 1 turę
        if (defenderCardRemoved.metadata.wijRevived && !defenderCardRemoved.metadata.wijPermanentlyDead) {
          defenderCardRemoved.currentStats.defense = (defenderCardRemoved.cardData as any).stats.defense
          defenderCardRemoved.line = BattleLine.FRONT
          const gravIdx = newState.players[defenderCardRemoved.owner].graveyard.findIndex(c => c.instanceId === defenderCardRemoved.instanceId)
          if (gravIdx !== -1) newState.players[defenderCardRemoved.owner].graveyard.splice(gravIdx, 1)
          if (attackerPlayer) {
            const trophyIdx = attackerPlayer.trophies.findIndex(c => c.instanceId === defenderCardRemoved.instanceId)
            if (trophyIdx !== -1) attackerPlayer.trophies.splice(trophyIdx, 1)
          }
          newState.players[defenderCardRemoved.owner].field.lines[BattleLine.FRONT].push(defenderCardRemoved)
          defenderDied = false
          log.push(addLog(newState, `${defenderCardRemoved.cardData.name}: Nieśmiertelny! Wraca na L1 na ostatnią turę!`, 'effect'))
        }
      }
    } // end if (defenderDied)
  } // end if (currentDefender.defense <= 0)

  // 9. ŚMIERĆ ATAKUJĄCEGO (od kontrataku lub Mocy Światogora)
  let attackerDied = false
  currentAttacker = findCardOnField(newState, attackerInstanceId)
  if (currentAttacker && currentAttacker.currentStats.defense <= 0) {
    attackerDied = true
    const counterName = findCardOnField(newState, defenderInstanceId)?.cardData.name
      ?? currentDefender?.cardData.name ?? 'Obrońca'
    log.push(addLog(newState, `${counterName} kontratakuje i zabija ${currentAttacker.cardData.name}! (kontratak zadany jednocześnie z atakiem)`, 'death', [attackerInstanceId]))

    // Zapamiętaj zabójcę (kontraatakujący)
    currentAttacker.metadata.killedBy = defenderInstanceId

    const atkDeathResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DEATH)
    newState = atkDeathResult.newState
    log.push(...atkDeathResult.log)

    // ON_ANY_DEATH — trigger dla wszystkich istot na polu
    const allBeforeAtkDeath = getAllCreaturesForPlayer(newState, 'player1').concat(getAllCreaturesForPlayer(newState, 'player2'))
    for (const watcher of allBeforeAtkDeath) {
      if (watcher.instanceId === attackerInstanceId) continue
      const watchResult = triggerEffect(newState, watcher, EffectTrigger.ON_ANY_DEATH, currentAttacker)
      newState = watchResult.newState
      log.push(...watchResult.log)
    }

    const atkCardRemoved = removeFromField(newState, attackerInstanceId)
    if (atkCardRemoved) {
      atkCardRemoved.line = null
      newState.players[atkCardRemoved.owner].graveyard.push(atkCardRemoved)
    }
  }

  // Likantropia: atakujący przejmuje ATK i DEF zabitego obrońcy
  if (defenderDied) {
    currentAttacker = findCardOnField(newState, attackerInstanceId)
    if (currentAttacker && currentAttacker.metadata.likantropiaActive) {
      const defenderRef = newState.players[defender.owner].graveyard.find(c => c.instanceId === defenderInstanceId) ?? defender
      const baseAtk = (defenderRef.cardData as any).stats?.attack ?? defenderRef.currentStats.attack
      const baseDef = (defenderRef.cardData as any).stats?.defense ?? defenderRef.currentStats.defense
      currentAttacker.currentStats.attack += baseAtk
      currentAttacker.currentStats.defense += baseDef
      currentAttacker.metadata.likantropiaLastKillRound = newState.roundNumber
      log.push(addLog(newState,
        `Likantropia: ${currentAttacker.cardData.name} pochłania siłę ${defender.cardData.name}! (+${baseAtk} ATK, +${baseDef} DEF)`,
        'effect'
      ))
    }
  }

  // Miecz Kladenet / Miecz Kladenet+: nośnik atakuje 2. cel
  currentAttacker = findCardOnField(newState, attackerInstanceId)
  if (currentAttacker && !attackerDied &&
      currentAttacker.equippedArtifacts.some(a => ['adventure_miecz_kladenet', 'adventure_miecz_kladenet_enhanced'].includes((a as any).effectId))) {
    const enemySide = currentAttacker.owner === 'player1' ? 'player2' : 'player1'
    const otherEnemies = getAllCreaturesForPlayer(newState, enemySide)
      .filter(c => c.instanceId !== defenderInstanceId && c.currentStats.defense > 0)
    if (otherEnemies.length > 0) {
      const secondTarget = otherEnemies[Math.floor(Math.random() * otherEnemies.length)]!
      const miecz2Dmg = currentAttacker.currentStats.attack
      secondTarget.currentStats.defense -= miecz2Dmg
      log.push(addLog(newState,
        `Miecz Kladenet: ${currentAttacker.cardData.name} też uderza ${secondTarget.cardData.name} za ${miecz2Dmg} obrażeń!`,
        'effect'
      ))
      if (secondTarget.currentStats.defense <= 0) {
        const removed = removeFromField(newState, secondTarget.instanceId)
        if (removed) {
          removed.line = null
          newState.players[enemySide].graveyard.push(removed)
          log.push(addLog(newState, `${removed.cardData.name} ginie od Miecza Kladeneta!`, 'death'))

          // Triggery śmierci drugiego celu
          const deathResult2 = triggerEffect(newState, removed, EffectTrigger.ON_DEATH)
          newState = deathResult2.newState
          log.push(...deathResult2.log)

          // ON_KILL atakującego za drugi cel
          const atkAfter2 = findCardOnField(newState, attackerInstanceId)
          if (atkAfter2) {
            const killResult2 = triggerEffect(newState, atkAfter2, EffectTrigger.ON_KILL, removed)
            newState = killResult2.newState
            log.push(...killResult2.log)
          }

          // ON_ANY_DEATH watchers
          const allAfter2 = getAllCreaturesForPlayer(newState, 'player1').concat(getAllCreaturesForPlayer(newState, 'player2'))
          for (const watcher of allAfter2) {
            if (watcher.instanceId === removed.instanceId) continue
            const anyDeathResult = triggerEffect(newState, watcher, EffectTrigger.ON_ANY_DEATH, removed)
            newState = anyDeathResult.newState
            log.push(...anyDeathResult.log)
          }
        }
      }
    }
  }

  // Przyjaźń+: gdy ochroniarz ginie → chroniony dostaje 3 darmowe ataki
  if (defenderDied) {
    const defenderGrave2 = newState.players[defender.owner].graveyard
      .find(c => c.instanceId === defenderInstanceId)
    if (defenderGrave2 && defenderGrave2.metadata.przyjaznEnhanced && defenderGrave2.metadata.przyjaznGuard) {
      const protectedId = defenderGrave2.metadata.przyjaznGuard as string
      const protectedCard = findCardOnField(newState, protectedId)
      if (protectedCard) {
        protectedCard.metadata.freeAttacksLeft = ((protectedCard.metadata.freeAttacksLeft as number) ?? 0) + 3
        delete protectedCard.metadata.przyjaznProtector
        log.push(addLog(newState,
          `Przyjaźń+: ${defenderGrave2.cardData.name} poległ — ${protectedCard.cardData.name} zyskuje 3 darmowe ataki!`,
          'effect'
        ))
      }
    }
  }
  if (attackerDied) {
    const attackerGrave = newState.players[attacker.owner].graveyard
      .find(c => c.instanceId === attackerInstanceId)
    if (attackerGrave && attackerGrave.metadata.przyjaznEnhanced && attackerGrave.metadata.przyjaznGuard) {
      const protectedId = attackerGrave.metadata.przyjaznGuard as string
      const protectedCard = findCardOnField(newState, protectedId)
      if (protectedCard) {
        protectedCard.metadata.freeAttacksLeft = ((protectedCard.metadata.freeAttacksLeft as number) ?? 0) + 3
        delete protectedCard.metadata.przyjaznProtector
        log.push(addLog(newState,
          `Przyjaźń+: ${attackerGrave.cardData.name} poległ — ${protectedCard.cardData.name} zyskuje 3 darmowe ataki!`,
          'effect'
        ))
      }
    }
  }

  // Młot Swaroga: istota ginie po ataku (flag mlotSwarogaDie)
  currentAttacker = findCardOnField(newState, attackerInstanceId)
  if (currentAttacker && currentAttacker.metadata.mlotSwarogaDie) {
    const atkCardRemoved = removeFromField(newState, attackerInstanceId)
    if (atkCardRemoved) {
      atkCardRemoved.line = null
      newState.players[atkCardRemoved.owner].graveyard.push(atkCardRemoved)
      log.push(addLog(newState, `${atkCardRemoved.cardData.name}: Szał Swaroga pochłonął go całkowicie!`, 'death'))
    }
    attackerDied = true
  }

  // 10. TRUCIZNA — sprawdź status po walce
  newState = processPoison(newState, log)

  // 11. CLEANUP: aktualizuj turnsInPlay dla wszystkich kart na polu
  updateTurnsInPlay(newState)

  // Zbierz wynik
  const finalAttacker = findCardOnField(newState, attackerInstanceId) ?? attacker
  const finalDefender = findCardOnField(newState, defenderInstanceId) ?? defender

  return {
    newState,
    result: {
      attacker: finalAttacker,
      defender: finalDefender,
      damageToDefender,
      damageToAttacker,
      defenderDied,
      attackerDied,
      counterattackOccurred,
      softFail: isSoftFail || undefined,
      softFailReason: isSoftFail ? (validation.reason ?? 'Odporny!') : undefined,
      effectsTriggered,
      log,
    },
  }
}

// ===================================================================
// WZNOWIENIE KONTRATAKU PO BRZEGINIE
// ===================================================================

/**
 * Wznawia walkę po odrzuceniu tarczy Brzeginy.
 * Wykonuje: ON_DAMAGE triggers + ON_ALLY_ATTACKED + kontratak + death checks.
 */
export function resumeCombatCounterattack(
  state: GameState,
  attackerInstanceId: string,
  defenderInstanceId: string,
  damageToDefender: number,
  defenderDefBeforeHit: number
): { newState: GameState; result: CombatResult } {
  let newState = cloneGameState(state)
  const log: LogEntry[] = []
  const effectsTriggered: string[] = []

  let currentAttacker = findCardOnField(newState, attackerInstanceId)
  let currentDefender = findCardOnField(newState, defenderInstanceId)

  if (!currentAttacker || !currentDefender) {
    return {
      newState,
      result: {
        attacker: currentAttacker ?? { instanceId: attackerInstanceId } as any,
        defender: currentDefender ?? { instanceId: defenderInstanceId } as any,
        damageToDefender, damageToAttacker: 0,
        defenderDied: !currentDefender, attackerDied: !currentAttacker,
        counterattackOccurred: false, effectsTriggered, log,
      },
    }
  }

  // ON_DAMAGE triggers — skipped during Brzegina pause, now resumed
  if (damageToDefender > 0) {
    const onDamageRecResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DAMAGE_RECEIVED, currentAttacker, damageToDefender)
    newState = onDamageRecResult.newState
    log.push(...onDamageRecResult.log)

    const onDamageDealtResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DAMAGE_DEALT, currentDefender, damageToDefender)
    newState = onDamageDealtResult.newState
    log.push(...onDamageDealtResult.log)

    currentAttacker = findCardOnField(newState, attackerInstanceId)
    currentDefender = findCardOnField(newState, defenderInstanceId)
  }

  // ON_ALLY_ATTACKED triggers
  if (currentDefender && currentAttacker) {
    const defenderSideAllies = getAllCreaturesForPlayer(newState, currentDefender.owner)
      .filter(c => c.instanceId !== defenderInstanceId && !c.isSilenced)
    for (const ally of defenderSideAllies) {
      const allyResult = triggerEffect(newState, ally, EffectTrigger.ON_ALLY_ATTACKED, currentAttacker, damageToDefender)
      newState = allyResult.newState
      log.push(...allyResult.log)
    }
    currentAttacker = findCardOnField(newState, attackerInstanceId)
    currentDefender = findCardOnField(newState, defenderInstanceId)
  }

  if (!currentAttacker || !currentDefender) {
    return {
      newState,
      result: {
        attacker: currentAttacker ?? { instanceId: attackerInstanceId } as any,
        defender: currentDefender ?? { instanceId: defenderInstanceId } as any,
        damageToDefender, damageToAttacker: 0,
        defenderDied: !currentDefender, attackerDied: !currentAttacker,
        counterattackOccurred: false, effectsTriggered, log,
      },
    }
  }

  // Kontratak
  let damageToAttacker = 0
  let counterattackOccurred = false

  const counterCheck = shouldCounterattack(newState, currentAttacker, currentDefender)
  if (counterCheck.reason) {
    log.push(addLog(newState, counterCheck.reason, 'effect'))
  }
  if (counterCheck.canCounter) {
    damageToAttacker = Math.max(0, defenderDefBeforeHit)

    if (currentAttacker.metadata.noCounterattack) {
      damageToAttacker = 0
      const ncSource = currentAttacker.metadata.toporPerunaUsed ? 'Topór Peruna'
        : currentAttacker.metadata.mlotSwarogaEnhanced ? 'Młot Swaroga+'
        : currentAttacker.metadata.mlotSwarogaActive ? 'Młot Swaroga'
        : 'efekt'
      log.push(addLog(newState, `${currentDefender.cardData.name} nie może kontratakować — ${currentAttacker.cardData.name} ma efekt "${ncSource}".`, 'effect'))
    } else if (damageToAttacker > 0) {
      currentAttacker.currentStats.defense -= damageToAttacker
      counterattackOccurred = true
      log.push(addLog(newState,
        `${currentDefender.cardData.name} kontratakuje ${currentAttacker.cardData.name} za ${damageToAttacker}. (DEF: ${currentAttacker.currentStats.defense + damageToAttacker} → ${currentAttacker.currentStats.defense})`,
        'damage',
        [defenderInstanceId, attackerInstanceId]
      ))

      const counterDmgResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DAMAGE_RECEIVED, currentDefender, damageToAttacker)
      const counterDealtResult = triggerEffect(counterDmgResult.newState, currentDefender, EffectTrigger.ON_DAMAGE_DEALT, currentAttacker, damageToAttacker)
      counterDmgResult.newState = counterDealtResult.newState
      counterDmgResult.log.push(...counterDealtResult.log)
      newState = counterDmgResult.newState
      log.push(...counterDmgResult.log)
    }
  }

  currentAttacker = findCardOnField(newState, attackerInstanceId)
  currentDefender = findCardOnField(newState, defenderInstanceId)

  // Death checks — defender
  let defenderDied = false
  if (currentDefender && currentDefender.currentStats.defense <= 0) {
    defenderDied = true
    log.push(addLog(newState, `${currentAttacker?.cardData.name ?? 'Atakujący'} zabija ${currentDefender.cardData.name}!`, 'death', [defenderInstanceId]))
    currentDefender.metadata.killedBy = attackerInstanceId
    const deathResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DEATH)
    newState = deathResult.newState
    log.push(...deathResult.log)

    if (currentAttacker) {
      currentAttacker = findCardOnField(newState, attackerInstanceId)
      if (currentAttacker) {
        const killResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_KILL, currentDefender)
        newState = killResult.newState
        log.push(...killResult.log)
      }
    }

    // ON_ANY_DEATH watchers
    const allWatchers = getAllCreaturesForPlayer(newState, 'player1').concat(getAllCreaturesForPlayer(newState, 'player2'))
    for (const watcher of allWatchers) {
      if (watcher.instanceId === defenderInstanceId) continue
      const watchResult = triggerEffect(newState, watcher, EffectTrigger.ON_ANY_DEATH, currentDefender)
      newState = watchResult.newState
      log.push(...watchResult.log)
    }

    const defenderRemoved = removeFromField(newState, defenderInstanceId)
    if (defenderRemoved) {
      defenderRemoved.line = null
      newState.players[defenderRemoved.owner].graveyard.push(defenderRemoved)
      const killerSide = (currentAttacker?.owner ?? attackerInstanceId) as PlayerSide
      newState.players[killerSide]?.trophies?.push(defenderRemoved)
      trackKill(newState, killerSide, defenderRemoved)
    }
  }

  // Death checks — attacker (from counterattack)
  let attackerDied = false
  currentAttacker = findCardOnField(newState, attackerInstanceId)
  if (currentAttacker && currentAttacker.currentStats.defense <= 0) {
    attackerDied = true
    log.push(addLog(newState, `${currentDefender?.cardData.name ?? 'Obrońca'} kontratakuje i zabija ${currentAttacker.cardData.name}!`, 'death', [attackerInstanceId]))
    currentAttacker.metadata.killedBy = defenderInstanceId
    const atkDeathResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DEATH)
    newState = atkDeathResult.newState
    log.push(...atkDeathResult.log)

    const allWatchers = getAllCreaturesForPlayer(newState, 'player1').concat(getAllCreaturesForPlayer(newState, 'player2'))
    for (const watcher of allWatchers) {
      if (watcher.instanceId === attackerInstanceId) continue
      const watchResult = triggerEffect(newState, watcher, EffectTrigger.ON_ANY_DEATH, currentAttacker)
      newState = watchResult.newState
      log.push(...watchResult.log)
    }

    const atkRemoved = removeFromField(newState, attackerInstanceId)
    if (atkRemoved) {
      atkRemoved.line = null
      newState.players[atkRemoved.owner].graveyard.push(atkRemoved)
    }
  }

  // Poison + cleanup
  newState = processPoison(newState, log)
  updateTurnsInPlay(newState)

  const finalAttacker = findCardOnField(newState, attackerInstanceId) ?? currentAttacker ?? { instanceId: attackerInstanceId } as any
  const finalDefender = findCardOnField(newState, defenderInstanceId) ?? currentDefender ?? { instanceId: defenderInstanceId } as any

  return {
    newState,
    result: {
      attacker: finalAttacker,
      defender: finalDefender,
      damageToDefender,
      damageToAttacker,
      defenderDied,
      attackerDied,
      counterattackOccurred,
      effectsTriggered,
      log,
    },
  }
}

// ===================================================================
// POMOCNICZE
// ===================================================================

function calculateDamage(state: GameState, attacker: CardInstance, defender: CardInstance): { damage: number; bonusLog: LogEntry[] } {
  let damage = attacker.currentStats.attack
  const bonusLog: LogEntry[] = []

  // Modyfikator z efektów (np. Gryf x2, Topór Peruna x4)
  const multiplier = (attacker.metadata.damageMultiplier as number) ?? 1
  if (multiplier !== 1) {
    damage *= multiplier
    delete attacker.metadata.damageMultiplier  // jednorazowe
  }

  // Guślarka: sojusznicy atakujący demony (Weles, idDomain=4) zyskują +2 ATK
  const attackerSideField = Object.values(state.players[attacker.owner].field.lines).flat()
  const hasGuslarka = attackerSideField
    .some(c => (c.cardData as any).effectId === 'guslarka_bonus_vs_demon' && c.instanceId !== attacker.instanceId)
  if (hasGuslarka && (defender.cardData as any).idDomain === 4) {
    damage += 2
    bonusLog.push(addLog(state, `Guślarka: +2 ATK dla ${attacker.cardData.name} vs demon!`, 'effect'))
  }

  // Żerca Welesa: sojusznicze demony (Weles, idDomain=4) zyskują +1 ATK
  const hasZercaWelesa = attackerSideField
    .some(c => (c.cardData as any).effectId === 'zerca_welesa_demon_buff' && c.instanceId !== attacker.instanceId)
  if (hasZercaWelesa && (attacker.cardData as any).idDomain === 4) {
    damage += 1
    bonusLog.push(addLog(state, `Żerca Welesa: +1 ATK dla demona ${attacker.cardData.name}.`, 'effect'))
  }

  // Polewik: L1 Żywi sąsiedzi +1 ATK
  const hasPolewik = attackerSideField
    .some(c => (c.cardData as any).effectId === 'polewik_buff_neighbors'
          && c.line === BattleLine.FRONT
          && c.instanceId !== attacker.instanceId)
  if (hasPolewik && (attacker.cardData as any).idDomain === 2 && attacker.line === BattleLine.FRONT) {
    damage += 1
    bonusLog.push(addLog(state, `Polewik: +1 ATK dla ${attacker.cardData.name} (sąsiad w L1).`, 'effect'))
  }

  // Baba (#31): +4 ATK vs wszystkich poza wybraną domeną
  if ((attacker.cardData as any).effectId === 'baba_bonus_vs_type') {
    const chosenDomain = (attacker.metadata.babaChosenDomain as number) ?? 4
    const defenderDomain = (defender.cardData as any).idDomain as number
    if (defenderDomain !== chosenDomain) {
      damage += 4
    }
  }

  // Sztandar / Sztandar+: sojusznicy nośnika zyskują +2 ATK
  const hasSztandar = attackerSideField
    .some(c => c.equippedArtifacts.some(a => ['adventure_sztandar', 'adventure_sztandar_enhanced'].includes((a as any).effectId)))
  if (hasSztandar) {
    damage += 2
    bonusLog.push(addLog(state, `Sztandar: +2 ATK dla ${attacker.cardData.name}!`, 'effect'))
  }

  return { damage: Math.max(0, damage), bonusLog }
}

function shouldCounterattack(
  state: GameState,
  attacker: CardInstance,
  defender: CardInstance
): { canCounter: boolean; reason?: string } {
  // Paraliż: sparaliżowana istota nie kontratakuje
  if (defender.paralyzeRoundsLeft !== null && defender.paralyzeRoundsLeft !== 0) {
    return { canCounter: false, reason: `${defender.cardData.name}: Sparaliżowany — nie może kontratakować!` }
  }

  // Dobroochoczy: dopóki jest na polu, ŻADNA istota nie kontratakuje (chyba że sparaliżowany/uciszony)
  const allCreatures = getAllCreaturesForPlayer(state, 'player1').concat(getAllCreaturesForPlayer(state, 'player2'))
  const dobroochoczyOnField = allCreatures.some(c =>
    (c.cardData as any).effectId === 'dobroochoczy_no_counter' &&
    !c.isSilenced &&
    !c.metadata?.dziewiatkoParalyze &&
    (c.paralyzeRoundsLeft === null || c.paralyzeRoundsLeft === 0)
  )
  if (dobroochoczyOnField) return { canCounter: false, reason: `Dobroochoczy: Aura Pokoju — nikt nie kontratakuje!` }

  // Kresnik buff: indywidualny brak kontrataku
  if (defender.activeEffects.some(e => e.effectId === 'dobroochoczy_no_counter')) return { canCounter: false }

  // Smocze Jajo / Bałwan: nie kontratakuje
  if ((defender.cardData as any).effectId === 'smocze_jajo_hatch') return { canCounter: false }
  if ((defender.cardData as any).effectId === 'balwan_free_divine_favor') return { canCounter: false }

  // Cmuch (#119): atakujący nie otrzymuje kontrataku
  if ((attacker.cardData as any).effectId === 'cmuch_no_counter_received') return { canCounter: false, reason: `${attacker.cardData.name}: Ćmuch unika kontrataku!` }

  // Miecz Kladenet / Miecz Kladenet+: brak kontrataku dla nośnika
  if (attacker.equippedArtifacts.some(a => ['adventure_miecz_kladenet', 'adventure_miecz_kladenet_enhanced'].includes((a as any).effectId))) return { canCounter: false }

  // noCounterattack flag (Topór Peruna, Młot Swaroga itd.)
  if (attacker.metadata.noCounterattack) return { canCounter: false }

  // Standardowa zasada: kontratak tylko w pozycji Obrony
  if (defender.position !== CardPosition.DEFENSE) {
    // Król Wężów: kontratakuje zawsze, niezależnie od pozycji
    if (defender.cardData.name === 'Król wężów') return { canCounter: true }
    if (defender.activeEffects.some(e => e.effectId === 'krol_wezow_always_counter')) return { canCounter: true }
    return { canCounter: false }
  }

  // Sprawdź zasięg: obrońca musi móc dosięgnąć atakującego
  const reach = canReachForCounter(state, defender, attacker)
  if (!reach.canReach) {
    return { canCounter: false, reason: reach.reason }
  }

  return { canCounter: true }
}

/**
 * Czy kontraatakujący (defender) może dosięgnąć pierwotnego atakującego?
 * Zasady zasięgu kontrataku odpowiadają normalnym zasadom ataku:
 * - Magia: dowolna linia
 * - Dystans: dowolna linia
 * - Wręcz/Żywioł: tylko front wroga (najniższa zajęta linia przeciwnika)
 */
function canReachForCounter(
  state: GameState,
  counterattacker: CardInstance,
  target: CardInstance
): { canReach: boolean; reason?: string } {
  const attackType = (counterattacker.cardData as any).attackType as AttackType
  const attackTypeName = attackType === AttackType.MELEE ? 'Wręcz'
    : attackType === AttackType.ELEMENTAL ? 'Żywioł'
    : attackType === AttackType.RANGED ? 'Dystans'
    : 'Magia'

  // Magia/Dystans: dowolna linia — zawsze dosięgnie
  if (attackType === AttackType.RANGED || attackType === AttackType.MAGIC) {
    return { canReach: true }
  }

  // Wręcz/Żywioł: kontratakujący musi być na WŁASNYM froncie żeby dosięgnąć
  const ownFrontLine = getOwnFrontLine(state, counterattacker.owner)
  if (counterattacker.line !== ownFrontLine) {
    return {
      canReach: false,
      reason: `${counterattacker.cardData.name} (${attackTypeName}) nie może kontratakować z L${counterattacker.line} — musi być na froncie (L${ownFrontLine}).`,
    }
  }

  // Cel musi być na froncie wroga (najniższa zajęta linia przeciwnika)
  const frontLine = getEnemyFrontLine(state, counterattacker.owner)
  if (target.line === frontLine) {
    return { canReach: true }
  }

  return {
    canReach: false,
    reason: `${counterattacker.cardData.name} (${attackTypeName}) nie może kontratakować — przeciwnik w L${target.line} jest poza zasięgiem kontrataku (front wroga: L${frontLine}).`,
  }
}

function checkDamagePrevention(
  state: GameState,
  attacker: CardInstance,
  defender: CardInstance,
  damage: number,
  forceBrzeginaSkip?: boolean
): { prevented: boolean; newState: GameState; log: LogEntry[] } {
  // Wąpierz: niezniszczalny — odporny na wszelkie obrażenia
  if ((defender.cardData as any).effectId === 'wapierz_invincible_hunger') {
    const log = addLog(state, `${defender.cardData.name}: Niezniszczalny! Obrażenia zablokowane — Wąpierz jest odporny na wszelkie obrażenia, dopóki sam atakuje regularnie.`, 'effect')
    return { prevented: true, newState: cloneGameState(state), log: [log] }
  }

  // Utopiec (#85): połowa obrażeń
  if ((defender.cardData as any).effectId === 'utopiec_half_damage') {
    const reduced = Math.floor(damage / 2)
    const newState = cloneGameState(state)
    const defCard = findCardOnField(newState, defender.instanceId)
    if (defCard) {
      // Cofnij pełne obrażenia i zadaj połowę
      defCard.currentStats.defense += damage
      defCard.currentStats.defense -= reduced
    }
    const log = addLog(newState, `${defender.cardData.name}: Tarcza Utopca! Obrażenia ${damage} → ${reduced}.`, 'effect')
    return { prevented: false, newState, log: [log] }
  }

  // Szeptunka (#48): sojusznicy -1 obrażeń
  const szeptunkaOnField = getAllCreaturesForPlayer(state, defender.owner)
    .find(c => (c.cardData as any).effectId === 'szeptunka_damage_reduction' && c.instanceId !== defender.instanceId)
  if (szeptunkaOnField && damage > 0) {
    const reduced = Math.max(0, damage - 1)
    if (reduced < damage) {
      const newState = cloneGameState(state)
      const defCard = findCardOnField(newState, defender.instanceId)
      if (defCard) {
        defCard.currentStats.defense += damage
        defCard.currentStats.defense -= reduced
      }
      const log = addLog(newState, `${szeptunkaOnField.cardData.name}: Szept ochronny! Obrażenia ${damage} → ${reduced}.`, 'effect')
      return { prevented: false, newState, log: [log] }
    }
  }

  // Znachor (#52): redukuje obrażenia o swój ATK, gdy sojusznik przeżyje
  const znachorOnField = getAllCreaturesForPlayer(state, defender.owner)
    .find(c => (c.cardData as any).effectId === 'znachor_absorb' && c.instanceId !== defender.instanceId)
  if (znachorOnField && damage > 0) {
    const wouldDie = defender.currentStats.defense - damage <= 0
    if (!wouldDie) {
      const reduced = Math.max(0, damage - znachorOnField.currentStats.attack)
      if (reduced < damage) {
        const newState = cloneGameState(state)
        const defCard = findCardOnField(newState, defender.instanceId)
        if (defCard) {
          defCard.currentStats.defense += damage
          defCard.currentStats.defense -= reduced
        }
        const log = addLog(newState, `${znachorOnField.cardData.name}: Uleczywa rany! Obrażenia ${damage} → ${reduced}.`, 'effect')
        return { prevented: false, newState, log: [log] }
      }
    }
  }

  // Przyjaźń: ochroniarz przejmuje obrażenia za chronionego
  if (defender.metadata.przyjaznProtector) {
    const guardianId = defender.metadata.przyjaznProtector as string
    const guardian = getAllCreaturesForPlayer(state, defender.owner)
      .find(c => c.instanceId === guardianId)
    if (guardian && guardian.metadata.przyjaznGuard === defender.instanceId) {
      const newState = cloneGameState(state)
      const guardianInState = findCardOnField(newState, guardianId)
      if (guardianInState) {
        guardianInState.currentStats.defense -= damage
        // Przywróć obrażenia obrońcy (nie trafi)
        const defCard = findCardOnField(newState, defender.instanceId)
        if (defCard) defCard.currentStats.defense += damage
        const log = addLog(newState,
          `Przyjaźń: ${guardianInState.cardData.name} osłania ${defender.cardData.name} — bierze ${damage} obrażeń!`,
          'effect'
        )
        return { prevented: false, newState, log: [log] }
      }
    }
  }

  // Twierdza: Lokacja +3 DEF (redukcja obrażeń o 3)
  const twierdza = state.players[defender.owner].activeLocation
  if (twierdza && (twierdza.cardData as any).effectId === 'adventure_twierdza' && damage > 0) {
    const reduced = Math.max(0, damage - 3)
    if (reduced < damage) {
      const newState = cloneGameState(state)
      const defCard = findCardOnField(newState, defender.instanceId)
      if (defCard) {
        defCard.currentStats.defense += damage
        defCard.currentStats.defense -= reduced
      }
      const log = addLog(newState, `Twierdza: Mury wytrzymują! Obrażenia ${damage} → ${reduced}.`, 'effect')
      return { prevented: false, newState, log: [log] }
    }
  }

  return { prevented: false, newState: state, log: [] }
}

function triggerEffect(
  state: GameState,
  card: CardInstance,
  trigger: EffectTrigger,
  target?: CardInstance,
  value?: number
): { newState: GameState; log: LogEntry[] } {
  if (card.isSilenced) return { newState: state, log: [] }
  // Paraliż Dziewiątka blokuje WSZYSTKIE triggery (premie, aury, pożegnanie, reakcje)
  if (card.metadata?.dziewiatkoParalyze) {
    return { newState: state, log: [] }
  }

  const effectDef = getEffect(card.cardData.effectId)
  if (!effectDef) return { newState: state, log: [] }

  const triggers = Array.isArray(effectDef.trigger) ? effectDef.trigger : [effectDef.trigger]
  if (!triggers.includes(trigger)) return { newState: state, log: [] }

  try {
    const result = effectDef.execute({ state, source: card, target, trigger, value })
    return { newState: result.newState, log: result.log }
  } catch (err) {
    // Effect execution failed — silently fallback to no-op
    return { newState: state, log: [] }
  }
}

function processPoison(state: GameState, log: LogEntry[]): GameState {
  let newState = cloneGameState(state)

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const creatures = getAllCreaturesForPlayer(newState, side)
    for (const card of creatures) {
      if (card.poisonRoundsLeft !== null) {
        card.poisonRoundsLeft -= 1
        if (card.poisonRoundsLeft <= 0) {
          log.push(addLog(newState, `${card.cardData.name} ginie od trucizny!`, 'death'))
          removeFromField(newState, card.instanceId)
          newState.players[side].graveyard.push(card)
        }
      }
    }
  }
  return newState
}

function updateTurnsInPlay(state: GameState): void {
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    getAllCreaturesForPlayer(state, side).forEach(c => c.turnsInPlay++)
  }
}

function getAllCreaturesForPlayer(state: GameState, side: PlayerSide): CardInstance[] {
  const player = state.players[side]
  return [
    ...player.field.lines[BattleLine.FRONT],
    ...player.field.lines[BattleLine.RANGED],
    ...player.field.lines[BattleLine.SUPPORT],
  ]
}

function findCardOnField(state: GameState, instanceId: string): CardInstance | null {
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const found = state.players[side].field.lines[line].find(c => c.instanceId === instanceId)
      if (found) return found
    }
  }
  return null
}

export { findCardOnField }
