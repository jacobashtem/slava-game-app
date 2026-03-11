/**
 * AIPlayer — interfejs i implementacja gracza komputerowego.
 * Etap 2: EASY AI (losowa karta, losowy cel).
 * Etap 3: MEDIUM AI (heurystyki).
 */

import type { GameState, CardInstance } from './types'
import { BattleLine, CardPosition, GamePhase, AttackType } from './constants'
import type { PlayerSide } from './types'
import { cloneGameState, addLog } from './GameStateUtils'
import { canAttack, canPlayCreature, canPlaceInLine, getAllCreaturesOnField, getEnemyFrontLine } from './LineManager'
import { playCreature, playAdventure, performAttack, changePosition } from './TurnManager'
import { GOLD_EDITION_RULES } from './constants'
import { canActivateEffect, getEffect } from './EffectRegistry'

export type AIDifficulty = 'easy' | 'medium' | 'hard'

// Efekty o wysokim zagrożeniu — priorytetowe cele do zabicia
const DANGEROUS_EFFECTS = new Set([
  // Aury tempo/ofensywne
  'chlop_extra_attack', 'lesnica_double_attack', 'kikimora_free_attack',
  // AOE / cleave
  'swiatogor_line_cleave', 'morowa_dziewica_aoe_all', 'konny_cleave', 'waz_tugaryn_cleave',
  // ON_ANY_DEATH scaling
  'baba_jaga_death_growth', 'smierc_death_growth_save',
  // Kradzież / kontrola
  'aitwar_steal_hand', 'czarnoksieznik_steal_abilities', 'inkluz_steal_buff', 'mara_sacrifice_takeover',
  // Immunitet / obrona pasywna
  'wapierz_invincible_hunger', 'brzegina_shield_for_gold', 'mavka_line_shield',
  'utopiec_half_damage', 'szeptunka_damage_reduction',
  // Paraliż / disable
  'bazyliszek_paralyze', 'polnocnica_mass_paralyze', 'biali_ludzie_wound_disarm',
  // Natychmiastowe zabójstwo
  'cicha_kill_weak', 'poludnica_kill_weakest', 'bogunka_instant_kill_human', 'kania_chain_kill',
  // Lifesteal / drain
  'strzyga_lifesteal', 'bezkost_atk_drain',
  // Spell defense (blokuje przygody)
  'bzionek_spell_intercept', 'czarownica_redirect_spell',
  // Inne groźne pasywne
  'rusalka_mirror_attack', 'licho_block_draw', 'buka_force_defense', 'matoha_anti_magic',
  'zmora_grow_sacrifice', 'gryf_double_dmg_on_play_turn',
])

// Efekty wsparcia — istoty użyteczne ale mniej groźne bojowo
const SUPPORT_EFFECTS = new Set([
  // Leczenie / regeneracja
  'barstuk_ally_regen', 'wolch_heal', 'bagiennik_cleanse_buff', 'siemiargl_cleanse',
  // Ekonomia
  'zmije_glory_on_empty_field', 'chasnik_gold_on_kill', 'korgorusze_recover_glory', 'szatopierz_discard_for_gold',
  // Wskrzeszenie
  'cmentarna_baba_resurrect', 'wij_revive_once', 'homen_convert_on_death',
  // Pozycjonowanie / taktyka
  'belt_rearrange', 'chowaniec_intercept', 'naczelnik_human_rally',
  // Buff sojuszników
  'polewik_buff_neighbors', 'kresnik_choose_buff', 'rodzanice_swap_buff',
  // Informacja / dobieranie
  'dziad_reveal_all', 'rodzanice_scry', 'domowik_hand_size',
])

export interface AIDecision {
  type: 'play_creature' | 'play_adventure' | 'attack' | 'change_position' | 'activate_effect' | 'invoke_god' | 'end_turn'
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
  useEnhanced?: boolean
  // Slava-specific
  godId?: number
  bidAmount?: number
}

// ===================================================================
// GŁÓWNA KLASA AI
// ===================================================================

export class AIPlayer {
  constructor(
    private side: PlayerSide,
    private difficulty: AIDifficulty = 'easy'
  ) {}

  /**
   * Zwraca listę decyzji dla całej tury AI.
   * GameEngine wykonuje je sekwencyjnie z opóźnieniami.
   */
  planTurn(state: GameState): AIDecision[] {
    switch (this.difficulty) {
      case 'easy': return this.planEasyTurn(state)
      case 'medium': return this.planMediumTurn(state)
      case 'hard': return this.planHardTurn(state)
      default: return this.planEasyTurn(state)
    }
  }

  // ===================================================================
  // EASY AI — losowe decyzje
  // ===================================================================

  private planEasyTurn(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []
    let currentState = cloneGameState(state)

    // FAZA PLAY: wylosuj istotę do wystawienia
    const player = currentState.players[this.side]
    const creaturesInHand = player.hand.filter(c => c.cardData.cardType === 'creature')

    if (creaturesInHand.length > 0 && canPlayCreature(currentState, this.side)) {
      const card = randomChoice(creaturesInHand)
      const line = this.chooseLineForCreature(currentState, card)
      if (line !== null) {
        decisions.push({
          type: 'play_creature',
          cardInstanceId: card.instanceId,
          targetLine: line,
        })
        // Symuluj wystawienie dla dalszego planowania
        try {
          const { newState } = playCreature(currentState, card.instanceId, line)
          currentState = newState
        } catch {}
      }
    }

    // FAZA PLAY: zagraj przygodę (efekt podstawowy darmowy)
    if (player.adventuresPlayedThisTurn === 0) {
      const adventuresInHand = player.hand.filter(c => c.cardData.cardType === 'adventure')
      if (adventuresInHand.length > 0) {
        const card = randomChoice(adventuresInHand)
        decisions.push({
          type: 'play_adventure',
          cardInstanceId: card.instanceId,
        })
      }
    }

    // FAZA COMBAT: zmień pozycje na Atak
    const myCreatures = getAllCreaturesOnField(currentState, this.side)
    const hasEnemies = getAllCreaturesOnField(currentState, this.side === 'player1' ? 'player2' : 'player1').length > 0

    for (const creature of myCreatures) {
      // 50% szans na zmianę pozycji
      if (Math.random() > 0.5 && creature.position !== CardPosition.ATTACK) {
        decisions.push({
          type: 'change_position',
          cardInstanceId: creature.instanceId,
          targetPosition: CardPosition.ATTACK,
        })
      }
    }

    // FAZA COMBAT: zaatakuj losowym atakującym — MAX 1 atak na turę (jak gracz)
    const attackers = getAllCreaturesOnField(currentState, this.side)
      .filter(c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack)

    const enemySideEasy = this.side === 'player1' ? 'player2' : 'player1'
    const enemies = getAllCreaturesOnField(currentState, enemySideEasy)
      .filter(c => c.owner !== this.side) // wyklucz własne karty na polu wroga (Wieszczy/Bieda)

    for (const attacker of attackers) {
      const validTargets = enemies.filter(e => canAttack(currentState, attacker, e).valid)
      if (validTargets.length > 0) {
        const target = randomChoice(validTargets)
        decisions.push({
          type: 'attack',
          cardInstanceId: attacker.instanceId,
          targetInstanceId: target.instanceId,
        })
        break // limit: 1 atak na turę
      }
    }

    decisions.push({ type: 'end_turn' })
    return decisions
  }

  // ===================================================================
  // MEDIUM AI — heurystyki
  // ===================================================================

  private planMediumTurn(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []
    let currentState = cloneGameState(state)
    const player = currentState.players[this.side]

    // PLAY: wystaw najsilniejszą istotę
    if (canPlayCreature(currentState, this.side)) {
      const creaturesInHand = player.hand
        .filter(c => c.cardData.cardType === 'creature')
        .sort((a, b) => (b.currentStats.attack + b.currentStats.defense) - (a.currentStats.attack + a.currentStats.defense))

      if (creaturesInHand.length > 0) {
        const card = creaturesInHand[0]!
        const line = this.chooseLineStrategic(currentState, card)
        if (line !== null) {
          decisions.push({ type: 'play_creature', cardInstanceId: card.instanceId, targetLine: line })
          try {
            const { newState } = playCreature(currentState, card.instanceId, line)
            currentState = newState
          } catch {}
        }
      }
    }

    // PLAY: zagraj kartę przygody (jeśli mamy)
    const adventuresInHand = player.hand.filter(c => c.cardData.cardType === 'adventure')
    if (adventuresInHand.length > 0) {
      const myField = getAllCreaturesOnField(currentState, this.side)
      const adventure = adventuresInHand[0]
      if (!adventure) return decisions
      const advData = adventure.cardData as any
      // Enhanced: zagraj wzmocnioną wersję jeśli AI stać (1 PS) i ma sens
      const canEnhance = player.glory >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST && advData.enhancedEffectId
      const useEnhanced = canEnhance && Math.random() > 0.4 // 60% szans na enhanced

      if (advData.adventureType === 1 && myField.length > 0) {
        // Artefakt — cel: najsilniejszy sojusznik (który jest na polu)
        const strongest = myField.reduce((a, b) =>
          (a.currentStats.attack + a.currentStats.defense) > (b.currentStats.attack + b.currentStats.defense) ? a : b
        )
        decisions.push({
          type: 'play_adventure',
          cardInstanceId: adventure.instanceId,
          targetInstanceId: strongest.instanceId,
          useEnhanced,
        })
      } else {
        // Zdarzenie/Lokacja — bez celu, lub cel: najsilniejszy wróg (dla debuffów)
        const enemySide = this.side === 'player1' ? 'player2' : 'player1'
        const enemies = getAllCreaturesOnField(currentState, enemySide)
        const targetId = enemies.length > 0
          ? enemies.reduce((a, b) => (a.currentStats.attack + a.currentStats.defense) > (b.currentStats.attack + b.currentStats.defense) ? a : b).instanceId
          : (myField.length > 0 ? myField.reduce((a, b) => (a.currentStats.attack + a.currentStats.defense) > (b.currentStats.attack + b.currentStats.defense) ? a : b).instanceId : undefined)
        decisions.push({
          type: 'play_adventure',
          cardInstanceId: adventure.instanceId,
          targetInstanceId: targetId,
          useEnhanced,
        })
      }
    }

    // PLAY: aktywuj zdolności istot (jeśli dostępne i opłacalne)
    const aiPlayer = currentState.players[this.side]
    const activatableCreatures = getAllCreaturesOnField(currentState, this.side)
      .filter(c => canActivateEffect(currentState, c))
    for (const creature of activatableCreatures) {
      const effect = getEffect((creature.cardData as any).effectId)
      if (!effect) continue
      const cost = effect.activationCost ?? 0
      // Sprawdź czy AI stać na aktywację
      if (cost > aiPlayer.glory) continue
      // Pomiń efekty samobójcze (np. Mara) gdy AI ma mało istot
      if (effect.activationCooldown === 'once') {
        const myCount = getAllCreaturesOnField(currentState, this.side).length
        if (myCount <= 2) continue // nie poświęcaj gdy masz ≤ 2 istoty
      }
      // Wybierz cel jeśli wymaga
      let targetId: string | undefined
      if (effect.activationRequiresTarget) {
        const enemySide = this.side === 'player1' ? 'player2' : 'player1'
        const enemies = getAllCreaturesOnField(currentState, enemySide)
          .filter(c => c.currentStats.defense > 0)
          .filter(c => !effect.activationTargetFilter || effect.activationTargetFilter(c, creature, currentState))
        if (enemies.length === 0) continue
        targetId = enemies.reduce((a, b) =>
          a.currentStats.defense < b.currentStats.defense ? a : b
        ).instanceId
      }
      decisions.push({
        type: 'activate_effect',
        cardInstanceId: creature.instanceId,
        targetInstanceId: targetId,
      })
    }

    // COMBAT: ustaw pozycje — słabe istoty (def ≤ 2) w obronę, reszta w atak
    const myCreatures = getAllCreaturesOnField(currentState, this.side)
    for (const creature of myCreatures) {
      const shouldDefend = creature.currentStats.defense <= 2
      const targetPos = shouldDefend ? CardPosition.DEFENSE : CardPosition.ATTACK
      if (creature.position !== targetPos) {
        decisions.push({ type: 'change_position', cardInstanceId: creature.instanceId, targetPosition: targetPos })
        // Aktualizuj currentState żeby atak widział poprawne pozycje
        try {
          const { newState } = changePosition(currentState, creature.instanceId, targetPos)
          currentState = newState
        } catch {}
      }
    }

    // COMBAT: atakuj optymalnie
    const attackers = getAllCreaturesOnField(currentState, this.side)
      .filter(c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack)

    const enemies = getAllCreaturesOnField(currentState, this.side === 'player1' ? 'player2' : 'player1')
      .filter(c => c.owner !== this.side) // wyklucz własne karty na polu wroga (Wieszczy/Bieda)

    for (const attacker of attackers) {
      const validTargets = enemies.filter(e => canAttack(currentState, attacker, e).valid)
      if (validTargets.length === 0) continue

      // Priorytety celów:
      // 1. Cel który mogę zabić jednym ciosem
      // 2. Cel z najniższą obroną

      let target = validTargets.find(t => t.currentStats.defense <= attacker.currentStats.attack)
        ?? validTargets.reduce((best, t) => t.currentStats.defense < best.currentStats.defense ? t : best)

      decisions.push({
        type: 'attack',
        cardInstanceId: attacker.instanceId,
        targetInstanceId: target.instanceId,
      })
      break // limit: 1 atak na turę (symetrycznie z graczem)
    }

    decisions.push({ type: 'end_turn' })
    return decisions
  }

  // ===================================================================
  // HARD AI — zaawansowane heurystyki + ocena zagrożeń
  // ===================================================================

  private planHardTurn(state: GameState): AIDecision[] {
    const decisions: AIDecision[] = []
    let currentState = cloneGameState(state)
    const player = currentState.players[this.side]
    const enemySide: PlayerSide = this.side === 'player1' ? 'player2' : 'player1'

    // === ANALIZA SYTUACJI ===
    const myField = getAllCreaturesOnField(currentState, this.side)
    const enemyField = getAllCreaturesOnField(currentState, enemySide)
    const myPower = myField.reduce((s, c) => s + c.currentStats.attack + c.currentStats.defense, 0)
    const enemyPower = enemyField.reduce((s, c) => s + c.currentStats.attack + c.currentStats.defense, 0)
    const isLosing = enemyPower > myPower * 1.3
    const isWinning = myPower > enemyPower * 1.5

    // === PLAY: wybierz najlepszą istotę (scoring) ===
    if (canPlayCreature(currentState, this.side)) {
      const creaturesInHand = player.hand
        .filter(c => c.cardData.cardType === 'creature')
        .map(c => ({ card: c, score: this.scoreCreatureForPlay(c, currentState, isLosing) }))
        .sort((a, b) => b.score - a.score)

      if (creaturesInHand.length > 0) {
        const best = creaturesInHand[0]!
        const line = this.chooseLineStrategic(currentState, best.card)
        if (line !== null) {
          decisions.push({ type: 'play_creature', cardInstanceId: best.card.instanceId, targetLine: line })
          try {
            const { newState } = playCreature(currentState, best.card.instanceId, line)
            currentState = newState
          } catch {}
        }
      }
    }

    // === PLAY: przygody — priorytetyzuj wg sytuacji ===
    const adventuresInHand = player.hand
      .filter(c => c.cardData.cardType === 'adventure')
      .map(c => ({ card: c, score: this.scoreAdventureForPlay(c, currentState, isLosing) }))
      .sort((a, b) => b.score - a.score)

    if (adventuresInHand.length > 0) {
      const best = adventuresInHand[0]!
      const adventure = best.card
      const advData = adventure.cardData as any
      const myFieldNow = getAllCreaturesOnField(currentState, this.side)
      const enemiesNow = getAllCreaturesOnField(currentState, enemySide)

      // Enhanced: używaj gdy PS ≥ 2 (zachowaj 1 PS w rezerwie na zdolności)
      const canEnhance = player.glory >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST + 1 && advData.enhancedEffectId
      const useEnhanced = canEnhance ? true : (player.glory >= GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST && advData.enhancedEffectId && isLosing)

      if (advData.adventureType === 1 && myFieldNow.length > 0) {
        // Artefakt → najcenniejsza istota (wysoki ATK + ma efekt)
        const target = myFieldNow.reduce((a, b) => this.creatureThreatScore(a) > this.creatureThreatScore(b) ? a : b)
        decisions.push({ type: 'play_adventure', cardInstanceId: adventure.instanceId, targetInstanceId: target.instanceId, useEnhanced: !!useEnhanced })
      } else {
        // Zdarzenie/Lokacja
        const targetId = enemiesNow.length > 0
          ? enemiesNow.reduce((a, b) => this.creatureThreatScore(a) > this.creatureThreatScore(b) ? a : b).instanceId
          : (myFieldNow.length > 0 ? myFieldNow.reduce((a, b) => this.creatureThreatScore(a) > this.creatureThreatScore(b) ? a : b).instanceId : undefined)
        decisions.push({ type: 'play_adventure', cardInstanceId: adventure.instanceId, targetInstanceId: targetId, useEnhanced: !!useEnhanced })
      }
    }

    // === PLAY: aktywuj zdolności (z oceną wartości) ===
    const activatable = getAllCreaturesOnField(currentState, this.side)
      .filter(c => canActivateEffect(currentState, c))
    for (const creature of activatable) {
      const effect = getEffect((creature.cardData as any).effectId)
      if (!effect) continue
      const cost = effect.activationCost ?? 0
      if (cost > currentState.players[this.side].glory) continue
      // Samobójcze efekty: aktywuj tylko gdy warto (dużo istot + silny cel)
      if (effect.activationCooldown === 'once') {
        const myCount = getAllCreaturesOnField(currentState, this.side).length
        if (myCount <= 3) continue
      }
      let targetId: string | undefined
      if (effect.activationRequiresTarget) {
        const targets = getAllCreaturesOnField(currentState, enemySide)
          .filter(c => c.currentStats.defense > 0)
          .filter(c => !effect.activationTargetFilter || effect.activationTargetFilter(c, creature, currentState))
        if (targets.length === 0) continue
        // Cel: największe zagrożenie
        targetId = targets.reduce((a, b) => this.creatureThreatScore(a) > this.creatureThreatScore(b) ? a : b).instanceId
      }
      decisions.push({ type: 'activate_effect', cardInstanceId: creature.instanceId, targetInstanceId: targetId })
    }

    // === SLAVA: AI proaktywnie invokuje boga ===
    if (currentState.gameMode === 'slava' && currentState.slavaData && !currentState.slavaData.pendingFavor) {
      const aiGlory = currentState.players[this.side].glory
      const availableGods = currentState.slavaData.gods.filter(g => !g.usedThisCycle)
      if (availableGods.length > 0 && aiGlory >= 2) {
        // Proste heurystyki: invoke gdy jest sens
        const myCreatures = getAllCreaturesOnField(currentState, this.side)
        const enemyCreatures = getAllCreaturesOnField(currentState, enemySide)

        for (const god of availableGods) {
          let shouldInvoke = false
          let bidAmount = 1

          switch (god.id) {
            case 4: // Jaryło — heal all
              if (myCreatures.some(c => c.currentStats.defense < c.currentStats.maxDefense * 0.6)) {
                shouldInvoke = true
              }
              break
            case 2: // Swarożyc — AOE 15 dmg
              if (enemyCreatures.length >= 3) {
                shouldInvoke = true
              }
              break
            case 5: // Mokosz — draw 3
              if (player.hand.length <= 2) {
                shouldInvoke = true
              }
              break
            case 1: // Weles — resurrect
              if (player.graveyard.filter(c => c.cardData.cardType === 'creature').length >= 2) {
                shouldInvoke = true
              }
              break
            case 6: // Perun — nuke Weles creature
              if (enemyCreatures.some(c => c.currentStats.defense >= 6)) {
                shouldInvoke = true
              }
              break
            default:
              if (isLosing && aiGlory >= 2) {
                shouldInvoke = true
              }
          }

          if (shouldInvoke && aiGlory >= bidAmount) {
            decisions.push({ type: 'invoke_god', godId: god.id, bidAmount })
            break // max 1 god per turn
          }
        }
      }
    }

    // === COMBAT: inteligentne pozycjonowanie ===
    const creaturesForCombat = getAllCreaturesOnField(currentState, this.side)
    const enemiesForCombat = getAllCreaturesOnField(currentState, enemySide)
    const enemyMaxAtk = enemiesForCombat.reduce((max, c) => Math.max(max, c.currentStats.attack), 0)

    for (const creature of creaturesForCombat) {
      let targetPos: CardPosition
      if (isLosing && creature.currentStats.defense <= enemyMaxAtk) {
        // Przegrywa + kruchy → obrona (chroń wartościowe karty)
        targetPos = CardPosition.DEFENSE
      } else if (creature.currentStats.defense <= 1) {
        // Bardzo kruchy → obrona zawsze
        targetPos = CardPosition.DEFENSE
      } else if (isWinning || creature.currentStats.attack >= 3) {
        // Wygrywa lub mocny atakujący → atak
        targetPos = CardPosition.ATTACK
      } else if (enemiesForCombat.length === 0) {
        // Brak wrogów → obrona (nic do atakowania)
        targetPos = CardPosition.DEFENSE
      } else {
        targetPos = CardPosition.ATTACK
      }
      if (creature.position !== targetPos) {
        decisions.push({ type: 'change_position', cardInstanceId: creature.instanceId, targetPosition: targetPos })
        try {
          const { newState } = changePosition(currentState, creature.instanceId, targetPos)
          currentState = newState
        } catch {}
      }
    }

    // === COMBAT: inteligentny wybór celów ===
    const attackers = getAllCreaturesOnField(currentState, this.side)
      .filter(c => c.position === CardPosition.ATTACK && !c.hasAttackedThisTurn && !c.cannotAttack)
      .sort((a, b) => b.currentStats.attack - a.currentStats.attack) // najsilniejszy atakuje pierwszy

    const currentEnemies = getAllCreaturesOnField(currentState, enemySide)
      .filter(c => c.owner !== this.side) // wyklucz własne karty na polu wroga (Wieszczy/Bieda)

    for (const attacker of attackers) {
      const validTargets = currentEnemies.filter(e => canAttack(currentState, attacker, e).valid)
      if (validTargets.length === 0) continue

      // Cel scoring:
      const scoredTargets = validTargets.map(t => {
        let score = 0
        const canKill = t.currentStats.defense <= attacker.currentStats.attack
        const willSurvive = attacker.currentStats.defense > t.currentStats.attack
        const threatScore = this.creatureThreatScore(t)

        if (canKill) score += 100                  // zabicie = wysoki priorytet
        if (canKill && willSurvive) score += 50    // zabij i przeżyj = idealnie
        if (!willSurvive && !canKill) score -= 80  // zginę bez zabicia = zła wymiana
        score += threatScore * 2                    // groźne cele = priorytet
        if (canKill) score += threatScore * 3       // zabij groźnego = mega priorytet
        return { target: t, score }
      })

      scoredTargets.sort((a, b) => b.score - a.score)
      const best = scoredTargets[0]!

      // Pomiń atak jeśli wymiana jest bardzo zła (zginę bez zabicia, cel nie jest groźny)
      if (best.score < -30 && !isLosing) continue

      decisions.push({
        type: 'attack',
        cardInstanceId: attacker.instanceId,
        targetInstanceId: best.target.instanceId,
      })
      break // 1 atak na turę
    }

    decisions.push({ type: 'end_turn' })
    return decisions
  }

  // ===================================================================
  // SCORING — ocena wartości kart
  // ===================================================================

  /** Threat score: jak groźna jest istota na polu (wyższy = ważniejszy cel do zabicia) */
  private creatureThreatScore(card: CardInstance): number {
    let score = card.currentStats.attack * 2 + card.currentStats.defense
    const effectId = (card.cardData as any).effectId as string
    // Istoty z ciągłymi efektami (aury, triggery) są groźniejsze
    if (DANGEROUS_EFFECTS.has(effectId)) score += 15
    // Efekty leczenia/buffowania sojuszników
    if (SUPPORT_EFFECTS.has(effectId)) score += 10
    // Artefakty dają dodatkową wartość
    if (card.equippedArtifacts.length > 0) score += 5 * card.equippedArtifacts.length
    // Aktywowalne efekty dostępne = zagrożenie
    if ((card.cardData as any).effectId) {
      const eff = getEffect(effectId)
      if (eff?.activatable && !card.isSilenced) score += 8
    }
    return score
  }

  /** Scoring istoty do wystawienia z ręki */
  private scoreCreatureForPlay(card: CardInstance, state: GameState, isLosing: boolean): number {
    let score = card.currentStats.attack + card.currentStats.defense
    const effectId = (card.cardData as any).effectId as string
    const effect = getEffect(effectId)
    // Karty z użytecznymi efektami ON_PLAY
    if (effect) {
      const triggers = Array.isArray(effect.trigger) ? effect.trigger : [effect.trigger]
      if (triggers.includes('ON_PLAY' as any)) score += 8
      if (effect.activatable) score += 5
      if (DANGEROUS_EFFECTS.has(effectId)) score += 6
      if (SUPPORT_EFFECTS.has(effectId)) score += 6
    }
    // Preferuj tanki gdy przegrywasz
    if (isLosing && card.currentStats.defense >= 5) score += 4
    // Preferuj damage dealerów gdy wygrywasz
    if (!isLosing && card.currentStats.attack >= 4) score += 3
    return score
  }

  /** Scoring przygody */
  private scoreAdventureForPlay(card: CardInstance, state: GameState, isLosing: boolean): number {
    const data = card.cardData as any
    let score = 5 // bazowa wartość
    // Artefakty zyskują wartość gdy mamy istoty na polu
    if (data.adventureType === 1) {
      const myField = getAllCreaturesOnField(state, this.side)
      score += myField.length > 0 ? 8 : -10
    }
    // Lokacje mają trwały efekt
    if (data.adventureType === 2) score += 6
    // Zdarzenia — średnia wartość
    if (data.adventureType === 0) score += 3
    return score
  }

  // ===================================================================
  // HELPERS
  // ===================================================================

  private chooseLineForCreature(state: GameState, card: CardInstance): BattleLine | null {
    // Karty wystawiane na pole wroga (Wieszczy, Bieda)
    const effect = getEffect((card.cardData as any).effectId)
    const targetSide = effect?.playOnEnemyField
      ? (this.side === 'player1' ? 'player2' : 'player1')
      : this.side

    // Priorytet: L1 → L2 → L3 (wolne miejsce)
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      if (canPlaceInLine(state, targetSide as any, line)) return line
    }
    return null
  }

  private chooseLineStrategic(state: GameState, card: CardInstance): BattleLine | null {
    const attackType = (card.cardData as any).attackType as AttackType

    // Wręcz/Żywioł → L1, Dystans → L2, Magia → L3 (jeśli dostępne)
    const preferredLine = attackType === AttackType.MAGIC
      ? BattleLine.SUPPORT
      : attackType === AttackType.RANGED
        ? BattleLine.RANGED
        : BattleLine.FRONT

    if (canPlaceInLine(state, this.side, preferredLine)) return preferredLine

    // Fallback: pierwsze wolne miejsce
    return this.chooseLineForCreature(state, card)
  }
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}
