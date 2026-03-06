/**
 * CombatResolver — serce silnika.
 * Obsługuje: obrażenia, kontratak, śmierć, dynamiczny front, efekty walki.
 */

import type { GameState, CardInstance, CombatResult, LogEntry } from './types'
import { CardPosition, AttackType, BattleLine, EffectTrigger } from './constants'
import type { PlayerSide } from './types'
import { cloneGameState, addLog, moveToGraveyard } from './GameStateUtils'
import { canAttack, removeFromField, getEnemyFrontLine } from './LineManager'
import { getEffect } from './EffectRegistry'

// ===================================================================
// GŁÓWNA FUNKCJA ATAKU
// ===================================================================

export function resolveAttack(
  state: GameState,
  attackerInstanceId: string,
  defenderInstanceId: string
): { newState: GameState; result: CombatResult } {
  let newState = cloneGameState(state)

  const attacker = findCardOnField(newState, attackerInstanceId)
  const defender = findCardOnField(newState, defenderInstanceId)

  if (!attacker || !defender) {
    throw new Error(`[CombatResolver] Nie znaleziono kart: ${attackerInstanceId} / ${defenderInstanceId}`)
  }

  // 1. Walidacja zasięgu
  const validation = canAttack(newState, attacker, defender)
  if (!validation.valid) {
    throw new Error(`[CombatResolver] Nieprawidłowy atak: ${validation.reason}`)
  }

  const log: LogEntry[] = []
  const effectsTriggered: string[] = []

  // 2. Ujawnij obie karty (pierwsza walka = karta ujawniona)
  const revealAttacker = findCardOnField(newState, attackerInstanceId)
  const revealDefender = findCardOnField(newState, defenderInstanceId)
  if (revealAttacker) revealAttacker.isRevealed = true
  if (revealDefender) revealDefender.isRevealed = true

  // 3. Trigger: ON_ATTACK efekty atakującego (np. Gryf, Szalińc)
  const preAttackResult = triggerEffect(newState, attacker, EffectTrigger.ON_ATTACK, defender)
  newState = preAttackResult.newState
  log.push(...preAttackResult.log)

  // Pobierz referencje po klonowaniu
  let currentAttacker = findCardOnField(newState, attackerInstanceId)!
  let currentDefender = findCardOnField(newState, defenderInstanceId)!

  // 3. Oblicz obrażenia atakującego
  let damageToDefender = calculateDamage(newState, currentAttacker, currentDefender)

  // 4. Sprawdź prewencję obrażeń (np. Brzegina)
  const preventionResult = checkDamagePrevention(newState, currentAttacker, currentDefender, damageToDefender)
  if (preventionResult.prevented) {
    newState = preventionResult.newState
    log.push(...preventionResult.log)
    log.push(addLog(newState, `Atak ${currentAttacker.cardData.name} na ${currentDefender.cardData.name} zablokowany!`, 'effect'))
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
  currentDefender.currentStats.defense -= damageToDefender
  log.push(addLog(newState,
    `${currentAttacker.cardData.name} atakuje ${currentDefender.cardData.name} za ${damageToDefender} obrażeń. (DEF: ${currentDefender.currentStats.defense + damageToDefender} → ${currentDefender.currentStats.defense})`,
    'damage',
    [attackerInstanceId, defenderInstanceId]
  ))

  // 6. Trigger: ON_DAMAGE efekty obrońcy (np. Bugaj)
  const onDamageResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DAMAGE, currentAttacker, damageToDefender)
  newState = onDamageResult.newState
  log.push(...onDamageResult.log)

  // Trigger: ON_ATTACK efekty specjalne (np. Biali Ludzie, Dziewiątko)
  const attackEffectResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_ATTACK, currentDefender)
  newState = attackEffectResult.newState
  log.push(...attackEffectResult.log)

  currentAttacker = findCardOnField(newState, attackerInstanceId)!
  currentDefender = findCardOnField(newState, defenderInstanceId)!

  // 7. KONTRATAK
  let damageToAttacker = 0
  let counterattackOccurred = false

  const canCounter = shouldCounterattack(newState, currentAttacker, currentDefender)
  if (canCounter) {
    // Kontratak używa ATK obrońcy (nie resztek DEF po otrzymaniu ciosu)
    damageToAttacker = currentDefender.currentStats.attack

    // Wyjątek: niektóre efekty blokują kontratak (np. Topór Peruna)
    if (currentAttacker.metadata.noCounterattack) {
      damageToAttacker = 0
      log.push(addLog(newState, `${currentDefender.cardData.name} nie może kontratakować (efekt artefaktu).`, 'effect'))
    } else if (damageToAttacker > 0) {
      currentAttacker.currentStats.defense -= damageToAttacker
      counterattackOccurred = true
      log.push(addLog(newState,
        `${currentDefender.cardData.name} kontratakuje ${currentAttacker.cardData.name} za ${damageToAttacker}. (DEF: ${currentAttacker.currentStats.defense + damageToAttacker} → ${currentAttacker.currentStats.defense})`,
        'damage',
        [defenderInstanceId, attackerInstanceId]
      ))

      // Trigger ON_DAMAGE na atakującym
      const counterDmgResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DAMAGE, currentDefender, damageToAttacker)
      newState = counterDmgResult.newState
      log.push(...counterDmgResult.log)
    }
  }

  currentAttacker = findCardOnField(newState, attackerInstanceId)!
  currentDefender = findCardOnField(newState, defenderInstanceId)!

  // Oznacz że atakujący już atakował
  if (currentAttacker) {
    currentAttacker.hasAttackedThisTurn = true
  }

  // 8. ŚMIERĆ OBROŃCY
  let defenderDied = false
  if (currentDefender && currentDefender.currentStats.defense <= 0) {
    defenderDied = true
    log.push(addLog(newState, `${currentAttacker.cardData.name} zabija ${currentDefender.cardData.name}!`, 'death', [defenderInstanceId]))

    // Trigger ON_DEATH obrońcy
    const deathResult = triggerEffect(newState, currentDefender, EffectTrigger.ON_DEATH)
    newState = deathResult.newState
    log.push(...deathResult.log)

    // Trigger ON_KILL atakującego (np. Dziki Myśliwy, Czarnoksiężnik)
    currentAttacker = findCardOnField(newState, attackerInstanceId)!
    if (currentAttacker) {
      const killResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_KILL, currentDefender)
      newState = killResult.newState
      log.push(...killResult.log)
    }

    // Sprawdź efekt Moc Światogora: karta ginie po zabiciu
    currentAttacker = findCardOnField(newState, attackerInstanceId)!
    if (currentAttacker?.metadata?.diesOnKill) {
      currentAttacker.currentStats.defense = 0
      log.push(addLog(newState, `${currentAttacker.cardData.name} ginie zgodnie z efektem Mocy Światogora!`, 'death'))
    }

    // Trofeum: dodaj do trofeów właściciela atakującego (tryb Slava!)
    const attackerPlayer = newState.players[currentAttacker?.owner ?? attacker.owner]
    const defenderCardRemoved = removeFromField(newState, defenderInstanceId)
    if (defenderCardRemoved) {
      defenderCardRemoved.line = null
      newState.players[defenderCardRemoved.owner].graveyard.push(defenderCardRemoved)
      attackerPlayer?.trophies.push(defenderCardRemoved)
    }
  }

  // 9. ŚMIERĆ ATAKUJĄCEGO (od kontrataku lub Mocy Światogora)
  let attackerDied = false
  currentAttacker = findCardOnField(newState, attackerInstanceId)
  if (currentAttacker && currentAttacker.currentStats.defense <= 0) {
    attackerDied = true
    // defender may already be removed from field; use saved name
    const counterName = findCardOnField(newState, defenderInstanceId)?.cardData.name
      ?? currentDefender?.cardData.name ?? 'Obrońca'
    log.push(addLog(newState, `${counterName} kontratakuje — ${currentAttacker.cardData.name} ginie!`, 'death', [attackerInstanceId]))

    const atkDeathResult = triggerEffect(newState, currentAttacker, EffectTrigger.ON_DEATH)
    newState = atkDeathResult.newState
    log.push(...atkDeathResult.log)

    const atkCardRemoved = removeFromField(newState, attackerInstanceId)
    if (atkCardRemoved) {
      atkCardRemoved.line = null
      newState.players[atkCardRemoved.owner].graveyard.push(atkCardRemoved)
    }
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
      effectsTriggered,
      log,
    },
  }
}

// ===================================================================
// POMOCNICZE
// ===================================================================

function calculateDamage(state: GameState, attacker: CardInstance, defender: CardInstance): number {
  let damage = attacker.currentStats.attack

  // Modyfikator z efektów (np. Gryf x2, Topór Peruna x4)
  const multiplier = (attacker.metadata.damageMultiplier as number) ?? 1
  if (multiplier !== 1) {
    damage *= multiplier
    delete attacker.metadata.damageMultiplier  // jednorazowe
  }

  return Math.max(0, damage)
}

function shouldCounterattack(
  state: GameState,
  attacker: CardInstance,
  defender: CardInstance
): boolean {
  // Dobroochoczy: nigdy nie kontratakuje
  if (defender.cardData.name === 'Dobroochoczy') return false
  if (defender.activeEffects.some(e => e.effectId === 'dobroochoczy_no_counter')) return false

  // Standardowa zasada: kontratak tylko w pozycji Obrony
  if (defender.position !== CardPosition.DEFENSE) {
    // Król Wężów: kontratakuje zawsze, niezależnie od pozycji
    if (defender.cardData.name === 'Król wężów') return true
    if (defender.activeEffects.some(e => e.effectId === 'krol_wezow_always_counter')) return true
    return false
  }

  // Sprawdź zasięg: obrońca musi móc dosięgnąć atakującego
  // (Wręcz/Żywioł nie dosięgnie ranged/magic w tylnych liniach)
  if (!canReachForCounter(state, defender, attacker)) return false

  return true
}

/**
 * Czy kontraatakujący (defender) może dosięgnąć pierwotnego atakującego?
 * Magia/Dystans: zawsze. Wręcz/Żywioł: tylko jeśli cel jest na froncie.
 */
function canReachForCounter(
  state: GameState,
  counterattacker: CardInstance,
  target: CardInstance
): boolean {
  const attackType = (counterattacker.cardData as any).attackType as AttackType
  // Ranged/Magic can hit any line
  if (attackType === AttackType.RANGED || attackType === AttackType.MAGIC) return true
  // Melee/Elemental: target must be on enemy front line (lowest occupied)
  const frontLine = getEnemyFrontLine(state, counterattacker.owner)
  return target.line === frontLine
}

function checkDamagePrevention(
  state: GameState,
  attacker: CardInstance,
  defender: CardInstance,
  damage: number
): { prevented: boolean; newState: GameState; log: LogEntry[] } {
  // Brzegina: może zablokować obrażenia dla sojusznika
  const owner = state.players[defender.owner]
  const brzeginaOnField = getAllCreaturesForPlayer(state, defender.owner)
    .find(c => c.cardData.name === 'Brzegina')

  if (brzeginaOnField) {
    const effect = getEffect('brzegina_shield_for_gold')
    if (effect?.canActivate?.({ state, source: brzeginaOnField, target: defender, trigger: EffectTrigger.ON_DAMAGE })) {
      const result = effect.execute({ state, source: brzeginaOnField, target: defender, trigger: EffectTrigger.ON_DAMAGE, value: damage })
      if (result.prevented) {
        return { prevented: true, newState: result.newState, log: result.log }
      }
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

  const effectDef = getEffect(card.cardData.effectId)
  if (!effectDef) return { newState: state, log: [] }

  const triggers = Array.isArray(effectDef.trigger) ? effectDef.trigger : [effectDef.trigger]
  if (!triggers.includes(trigger)) return { newState: state, log: [] }

  try {
    const result = effectDef.execute({ state, source: card, target, trigger, value })
    return { newState: result.newState, log: result.log }
  } catch (err) {
    console.warn(`[EffectRegistry] Błąd efektu "${effectDef.id}":`, err)
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
