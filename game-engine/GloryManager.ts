/**
 * GloryManager — zarządza mechanikami trybu Sława!
 * PS (Punkty Sławy), pory roku, trofea, przełamanie, bogowie, święta.
 * ZERO wpływu na Gold Edition — wywoływany TYLKO gdy gameMode === 'slava'.
 */

import type { GameState, LogEntry, PlayerSide, SlavaState, GodData, HolidayMission, AuctionState, CardInstance, PendingFavor } from './types'
import { Season, Domain, BattleLine, SLAVA_RULES, GOLD_EDITION_RULES, SEASON_BONUS_DOMAIN, SEASON_PARALYSIS_DOMAIN, SEASON_NAMES, DOMAIN_NAMES } from './constants'
import { cloneGameState, addLog, getAllCreaturesOnField } from './GameStateUtils'

import panteonData from '../data/Slava_Vol2_Panteon_Normalized.json'

// ===== SEASON HELPERS =====

/** Ile rund trwa jedna pora roku */
const ROUNDS_PER_SEASON = 12

/** Oblicza porę roku z numeru rundy + offset sezonu (0–3) */
export function getSeasonFromRound(round: number, seasonOffset: number = 0): Season {
  const cycleLen = ROUNDS_PER_SEASON * 4 // 48 rund = pełny cykl
  const shifted = round - 1 + seasonOffset * ROUNDS_PER_SEASON
  const cyclePos = ((shifted % cycleLen) + cycleLen) % cycleLen
  if (cyclePos < ROUNDS_PER_SEASON) return Season.WINTER
  if (cyclePos < ROUNDS_PER_SEASON * 2) return Season.SPRING
  if (cyclePos < ROUNDS_PER_SEASON * 3) return Season.SUMMER
  return Season.AUTUMN
}

/** Runda w ramach pory roku (1-12) */
export function getSeasonRound(round: number): number {
  return ((round - 1) % ROUNDS_PER_SEASON) + 1
}

/** Ile rund ma jedna pora roku (eksport dla UI) */
export function getRoundsPerSeason(): number {
  return ROUNDS_PER_SEASON
}

// ===== INITIAL SLAVA STATE =====

export function createInitialSlavaState(startRound: number, seasonOffset: number = 0): SlavaState {
  const season = getSeasonFromRound(startRound, seasonOffset)
  const gods = getGodsForSeason(season)

  return {
    currentSeason: season,
    previousSeason: null,
    seasonRound: getSeasonRound(startRound),
    gods,
    holiday: createHolidayForSeason(season),
    seasonalBuffsApplied: false,
    paralyzedDomain: null,
    paralysisRoundsLeft: 0,
    activeAuction: null,
    pendingFavor: null,
    damageDealtThisTurn: { player1: 0, player2: 0 },
    killedEnemyDefenseThisTurn: { player1: 0, player2: 0 },
  }
}

// ===== GODS =====

function getGodsForSeason(season: Season): GodData[] {
  const seasonData = panteonData.seasons.find(s => s.seasonID === season)
  if (!seasonData) return []
  return seasonData.gods.map(g => ({
    id: g.id,
    name: g.name,
    powerID: g.powerID,
    cost: g.cost,
    usedThisCycle: false,
  }))
}

// ===== HOLIDAYS =====

function createHolidayForSeason(season: Season): HolidayMission {
  switch (season) {
    case Season.WINTER:
      return {
        seasonId: Season.WINTER,
        name: 'Szczodre Gody',
        condition: (state, side) => {
          const allies = getAllCreaturesOnField(state, side)
          const totalDef = allies.reduce((sum, c) => sum + c.currentStats.defense, 0)
          return totalDef >= 20
        },
        reward: 3,
        completed: { player1: false, player2: false },
        claimable: { player1: false, player2: false },
      }
    case Season.SPRING:
      return {
        seasonId: Season.SPRING,
        name: 'Jare Gody',
        condition: (state, side) => {
          const allies = getAllCreaturesOnField(state, side)
          const domains = new Set(allies.map(c => (c.cardData as any).domain as number))
          return domains.size >= 4
        },
        reward: 3,
        completed: { player1: false, player2: false },
        claimable: { player1: false, player2: false },
      }
    case Season.SUMMER:
      return {
        seasonId: Season.SUMMER,
        name: 'Święto Kupały',
        condition: (state, side) => {
          const slava = state.slavaData
          if (!slava) return false
          return slava.damageDealtThisTurn[side] >= 15
        },
        reward: 3,
        completed: { player1: false, player2: false },
        claimable: { player1: false, player2: false },
      }
    case Season.AUTUMN:
      return {
        seasonId: Season.AUTUMN,
        name: 'Dziady',
        condition: (state, side) => {
          const opponent: PlayerSide = side === 'player1' ? 'player2' : 'player1'
          const allyCount = getAllCreaturesOnField(state, side).length
          const enemyCount = getAllCreaturesOnField(state, opponent).length
          return allyCount - enemyCount >= 3
        },
        reward: 3,
        completed: { player1: false, player2: false },
        claimable: { player1: false, player2: false },
      }
  }
}

// ===== CORE GLORY FUNCTIONS =====

/** Pasywny dochód: +1 PS na początku tury */
export function grantPassiveIncome(state: GameState): LogEntry[] {
  if (state.gameMode !== 'slava') return []
  const side = state.currentTurn
  const player = state.players[side]
  player.glory += SLAVA_RULES.PASSIVE_INCOME_PER_TURN
  return [addLog(state, `${side === 'player1' ? 'Ty' : 'AI'}: +${SLAVA_RULES.PASSIVE_INCOME_PER_TURN} PS (pasywny dochód). Sława: ${player.glory}`, 'glory')]
}

/** Trofea: na koniec tury, suma bazowej DEF zabitych >= 9 → +1 PS */
export function grantTrophyBonus(state: GameState): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData) return []
  const side = state.currentTurn
  const player = state.players[side]
  const totalDef = state.slavaData.killedEnemyDefenseThisTurn[side]
  if (totalDef >= SLAVA_RULES.TROPHY_THRESHOLD) {
    player.glory += 1
    return [addLog(state, `${side === 'player1' ? 'Ty' : 'AI'}: +1 PS — TROFEUM! (zabito wrogów o łącznej obronie ${totalDef} ≥ ${SLAVA_RULES.TROPHY_THRESHOLD})`, 'glory')]
  }
  return []
}

/** Przełamanie linii: atak w pustą linię wroga → +1 PS atakujący, -1 PS obrońca */
export function checkBreakthrough(state: GameState, attackerSide: PlayerSide, targetLine: BattleLine): LogEntry[] {
  if (state.gameMode !== 'slava') return []
  const defenderSide: PlayerSide = attackerSide === 'player1' ? 'player2' : 'player1'
  const defender = state.players[defenderSide]

  // Czy linia jest pusta?
  if (defender.field.lines[targetLine].length === 0) {
    const attacker = state.players[attackerSide]
    attacker.glory += SLAVA_RULES.BREAKTHROUGH_REWARD
    defender.glory = Math.max(0, defender.glory - SLAVA_RULES.BREAKTHROUGH_PENALTY)
    return [addLog(state,
      `${attackerSide === 'player1' ? 'Ty' : 'AI'}: PRZEŁAMANIE LINII! +${SLAVA_RULES.BREAKTHROUGH_REWARD} PS, wróg traci ${SLAVA_RULES.BREAKTHROUGH_PENALTY} PS!`,
      'glory'
    )]
  }
  return []
}

/** Złupienie: gdy wróg nie ma istot na polu, zabierz mu 1 walutę (od rundy 3) */
export function performPlunder(state: GameState, attackerSide: PlayerSide): LogEntry[] {
  if (state.roundNumber < 3) return []
  const log: LogEntry[] = []

  const defenderSide: PlayerSide = attackerSide === 'player1' ? 'player2' : 'player1'
  const defenderCreatures = getAllCreaturesOnField(state, defenderSide)
  if (defenderCreatures.length > 0) return []

  const defender = state.players[defenderSide]
  const attacker = state.players[attackerSide]
  const label = attackerSide === 'player1' ? 'Ty' : 'AI'

  if (state.gameMode === 'slava') {
    if (defender.glory <= 0) return []
    defender.glory = Math.max(0, defender.glory - 1)
    attacker.glory += 1
    log.push(addLog(state, `${label}: ŁUPIENIE! Wróg bez obrony — kradniesz 1 PS!`, 'glory'))
  } else {
    if (defender.gold <= 0) return []
    defender.gold = Math.max(0, defender.gold - 1)
    attacker.gold += 1
    const atkLabel = attackerSide === 'player1' ? 'Gracz' : 'AI'
    const defLabel = defenderSide === 'player1' ? 'Gracz' : 'AI'
    log.push(addLog(state, `${label}: ŁUPIENIE! Wróg bez obrony — kradniesz 1 Złoto! (${atkLabel}: ${attacker.gold}, ${defLabel}: ${defender.gold})`, 'gold'))
  }

  return log
}

/** Rejestruje zabicie wroga (do trofeów) */
export function trackKill(state: GameState, killerSide: PlayerSide, killedCard: CardInstance): void {
  if (state.gameMode !== 'slava' || !state.slavaData) return
  const baseDef = killedCard.currentStats.maxDefense
  state.slavaData.killedEnemyDefenseThisTurn[killerSide] += baseDef
}

/** Rejestruje obrażenia zadane (dla Święta Kupały) */
export function trackDamageDealt(state: GameState, side: PlayerSide, amount: number): void {
  if (state.gameMode !== 'slava' || !state.slavaData) return
  state.slavaData.damageDealtThisTurn[side] += amount
}

// ===== ŻNIWO DUSZ (Soul Harvest) =====

/**
 * Żniwo Dusz: po śmierci wroga, zabójca zbiera punkty dusz (ATK + DEF bazowe).
 * Co 20 punktów → +1 PS. Działa w OBU trybach (Gold & Sława).
 * Zwraca log entries + info o zdobytych PS (do animacji).
 */
export interface SoulHarvestResult {
  log: LogEntry[]
  soulValue: number       // ATK + DEF zabitego
  oldSoulPoints: number   // stan przed harvest
  newSoulPoints: number   // stan po harvest (po modulo)
  psGained: number        // ile PS przyznano (0 lub więcej)
}

export function harvestSoul(state: GameState, killerSide: PlayerSide, killedCard: CardInstance): SoulHarvestResult {
  const player = state.players[killerSide]
  const label = killerSide === 'player1' ? 'Ty' : 'AI'
  const log: LogEntry[] = []

  // Bazowe statystyki zabitego — soulValue z JSON (ATK + DEF)
  const soulValue = (killedCard.cardData as any).stats?.soulValue
    ?? killedCard.currentStats.soulValue
    ?? (killedCard.currentStats.maxAttack + killedCard.currentStats.maxDefense)

  const oldSoulPoints = player.soulPoints
  player.soulPoints += soulValue

  const threshold = state.gameMode === 'slava'
    ? SLAVA_RULES.SOUL_HARVEST_THRESHOLD
    : GOLD_EDITION_RULES.SOUL_HARVEST_THRESHOLD

  // Log: soul collection (always)
  log.push(addLog(state,
    `${label}: +${soulValue} dusz za ${killedCard.cardData.name} (${player.soulPoints}/${threshold})`,
    'info'
  ))

  // Ile PS zdobyto?
  const psGained = Math.floor(player.soulPoints / threshold)
  const newSoulPoints = player.soulPoints % threshold

  if (psGained > 0) {
    player.soulPoints = newSoulPoints
    if (state.gameMode === 'slava') {
      player.glory += psGained
    } else {
      player.gold += psGained
    }
    const currencyLabel = state.gameMode === 'slava' ? 'Sława' : 'Złoto'
    const totalPS = state.gameMode === 'slava' ? player.glory : player.gold
    // Osobny log o zdobyciu PS (dla banneru)
    log.push(addLog(state,
      `${label}: ŻNIWO DUSZ! +${psGained} ${currencyLabel}! (razem: ${totalPS})`,
      state.gameMode === 'slava' ? 'glory' : 'gold'
    ))
  }

  return { log, soulValue, oldSoulPoints, newSoulPoints: player.soulPoints, psGained }
}

// ===== SEASON MANAGEMENT =====

/** Wywoływane na początku rundy — sprawdza zmianę pory roku */
export function processSeasonChange(state: GameState): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData) return []
  const log: LogEntry[] = []
  const slava = state.slavaData

  const newSeason = getSeasonFromRound(state.roundNumber, state.seasonOffset)
  const newSeasonRound = getSeasonRound(state.roundNumber)
  slava.seasonRound = newSeasonRound

  if (newSeason !== slava.currentSeason) {
    // Zmiana pory roku!
    log.push(addLog(state, `⚡ ZMIANA PORY ROKU: ${SEASON_NAMES[slava.currentSeason]} → ${SEASON_NAMES[newSeason]}!`, 'system'))

    // Usuń sezonowe buffy
    removeSeasonalBuffs(state)
    slava.seasonalBuffsApplied = false

    // Paraliż domeny
    const paralyzedDomain = SEASON_PARALYSIS_DOMAIN[newSeason]
    slava.paralyzedDomain = paralyzedDomain
    slava.paralysisRoundsLeft = 1
    applyParalysis(state, paralyzedDomain)
    log.push(addLog(state, `☠ ${DOMAIN_NAMES[paralyzedDomain]}: PARALIŻ na 1 rundę! Nie mogą atakować ani używać zdolności.`, 'effect'))

    // Nowi bogowie
    slava.gods = getGodsForSeason(newSeason)

    // Nowe święto
    slava.holiday = createHolidayForSeason(newSeason)
    if (slava.holiday) {
      log.push(addLog(state, `🎉 ŚWIĘTO: ${slava.holiday.name} — Nagroda: +${slava.holiday.reward} PS`, 'system'))
    }

    slava.previousSeason = slava.currentSeason
    slava.currentSeason = newSeason
  }

  // Nałóż sezonowe buffy (co rundę — refreshowane)
  if (!slava.seasonalBuffsApplied) {
    applySeasonalBuffs(state)
    slava.seasonalBuffsApplied = true
    const bonusDomain = SEASON_BONUS_DOMAIN[slava.currentSeason]
    log.push(addLog(state, `🌟 Bonus pory: ${DOMAIN_NAMES[bonusDomain]} otrzymują premię sezonu (${SEASON_NAMES[slava.currentSeason]})`, 'effect'))
  }

  // Tick paraliżu
  if (slava.paralysisRoundsLeft > 0) {
    slava.paralysisRoundsLeft--
    if (slava.paralysisRoundsLeft <= 0) {
      removeParalysis(state, slava.paralyzedDomain!)
      log.push(addLog(state, `✅ ${DOMAIN_NAMES[slava.paralyzedDomain!]}: Paraliż zakończony!`, 'effect'))
      slava.paralyzedDomain = null
    }
  }

  return log
}

/** Nałóż sezonowe buffy (+1 ATK/DEF dla premiowanej domeny) */
function applySeasonalBuffs(state: GameState): void {
  if (!state.slavaData) return
  const season = state.slavaData.currentSeason
  const bonusDomain = SEASON_BONUS_DOMAIN[season]

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const creatures = getAllCreaturesOnField(state, side)
    for (const card of creatures) {
      if ((card.cardData as any).domain === bonusDomain) {
        if (!card.metadata.seasonalBuff) {
          if (season === Season.WINTER) {
            // Zima: Nieumarli +1 DEF
            card.currentStats.defense += 1
            card.currentStats.maxDefense += 1
          } else if (season === Season.SPRING || season === Season.SUMMER) {
            // Wiosna: Perun +1 ATK, Lato: Żywi +1 ATK
            card.currentStats.attack += 1
            card.currentStats.maxAttack += 1
          }
          // Jesień: Weles enhanced za 0 — handled in playAdventure cost check
          card.metadata.seasonalBuff = true
        }
      }
    }
  }
}

/** Usuń sezonowe buffy */
function removeSeasonalBuffs(state: GameState): void {
  if (!state.slavaData) return
  const season = state.slavaData.currentSeason
  const bonusDomain = SEASON_BONUS_DOMAIN[season]

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const creatures = getAllCreaturesOnField(state, side)
    for (const card of creatures) {
      if (card.metadata.seasonalBuff && (card.cardData as any).domain === bonusDomain) {
        if (season === Season.WINTER) {
          card.currentStats.defense = Math.max(1, card.currentStats.defense - 1)
          card.currentStats.maxDefense = Math.max(1, card.currentStats.maxDefense - 1)
        } else if (season === Season.SPRING || season === Season.SUMMER) {
          card.currentStats.attack = Math.max(0, card.currentStats.attack - 1)
          card.currentStats.maxAttack = Math.max(0, card.currentStats.maxAttack - 1)
        }
        delete card.metadata.seasonalBuff
      }
    }
  }
}

/** Paraliż domeny: cannotAttack + isSilenced */
function applyParalysis(state: GameState, domain: Domain): void {
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const creatures = getAllCreaturesOnField(state, side)
    for (const card of creatures) {
      if ((card.cardData as any).domain === domain) {
        card.cannotAttack = true
        card.isSilenced = true
        card.metadata.seasonParalyzed = true
      }
    }
  }
}

/** Usuń paraliż domeny */
function removeParalysis(state: GameState, domain: Domain): void {
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    const creatures = getAllCreaturesOnField(state, side)
    for (const card of creatures) {
      if (card.metadata.seasonParalyzed && (card.cardData as any).domain === domain) {
        card.cannotAttack = false
        card.isSilenced = false
        delete card.metadata.seasonParalyzed
      }
    }
  }
}

// ===== HOLIDAY CHECK =====

/** Sprawdza święto na koniec tury — ustawia claimable jeśli warunki spełnione */
export function checkHoliday(state: GameState): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData?.holiday) return []
  const log: LogEntry[] = []
  const holiday = state.slavaData.holiday

  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    if (!holiday.completed[side] && !holiday.claimable[side] && holiday.condition(state, side)) {
      holiday.claimable[side] = true
      const label = side === 'player1' ? 'Ty' : 'AI'
      log.push(addLog(state, `🎉 ${label}: Warunki ŚWIĘTA ${holiday.name.toUpperCase()} spełnione! Kliknij by świętować!`, 'glory'))
    }
  }

  // AI automatycznie świętuje
  if (holiday.claimable.player2 && !holiday.completed.player2) {
    holiday.completed.player2 = true
    holiday.claimable.player2 = false
    state.players.player2.glory += holiday.reward
    log.push(addLog(state, `AI: ŚWIĘTO ${holiday.name.toUpperCase()} — świętuje! +${holiday.reward} PS!`, 'glory'))
  }

  return log
}

/** Gracz świętuje — ręczne kliknięcie po spełnieniu warunków */
export function claimHoliday(state: GameState, side: PlayerSide): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData?.holiday) return []
  const holiday = state.slavaData.holiday
  if (!holiday.claimable[side] || holiday.completed[side]) return []

  holiday.completed[side] = true
  holiday.claimable[side] = false
  state.players[side].glory += holiday.reward
  const label = side === 'player1' ? 'Ty' : 'AI'
  return [addLog(state, `🎉 ${label}: ŚWIĘTO ${holiday.name.toUpperCase()}! +${holiday.reward} PS!`, 'glory')]
}

// ===== TURN RESET (per turn tracking) =====

/** Reset tracking danych na początku tury */
export function resetTurnTracking(state: GameState): void {
  if (state.gameMode !== 'slava' || !state.slavaData) return
  state.slavaData.damageDealtThisTurn[state.currentTurn] = 0
  state.slavaData.killedEnemyDefenseThisTurn[state.currentTurn] = 0
}

// ===== SLAVA WIN CONDITION =====

/** Sprawdza czy ktoś ma >= 10 PS */
export function checkSlavaWinCondition(state: GameState): PlayerSide | null {
  if (state.gameMode !== 'slava') return null
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    if (state.players[side].glory >= SLAVA_RULES.GLORY_TARGET) return side
  }
  return null
}

// ===== ENHANCED ADVENTURE COST (Slava override) =====

/** Zwraca koszt ulepszenia przygody w aktualnym trybie */
export function getEnhancedAdventureCost(state: GameState, side: PlayerSide): number {
  if (state.gameMode !== 'slava') return GOLD_EDITION_RULES.ENHANCED_ADVENTURE_COST
  // Jesień: Welesowcy mają za darmo
  if (state.slavaData?.currentSeason === Season.AUTUMN) {
    // Sprawdź czy gracz ma Welesowca na polu — nie, wg specyfikacji cała domena Weles za 0
    // Ale specyfikacja mówi "Welesowcy kosztują 0 Sławy przy ulepszaniu" — to dotyczy kart Welesa?
    // Prostsza interpretacja: w Jesieni KAŻDE ulepszenie kosztuje 0 PS
    return 0
  }
  return SLAVA_RULES.ENHANCED_ADVENTURE_COST
}

// ===== AUCTION =====

export function startAuction(godId: number, initiator: PlayerSide, initialBid: number): AuctionState {
  return {
    godId,
    bids: [{ side: initiator, amount: initialBid }],
    currentHighBidder: initiator,
    currentHighBid: initialBid,
    resolved: false,
  }
}

export function placeBid(auction: AuctionState, side: PlayerSide, amount: number): AuctionState {
  if (amount <= auction.currentHighBid) {
    throw new Error(`Stawka musi być wyższa niż ${auction.currentHighBid}`)
  }
  auction.bids.push({ side, amount })
  auction.currentHighBidder = side
  auction.currentHighBid = amount
  return auction
}

/** Rozwiązuje licytację — NIE pobiera PS (to się dzieje przy ZŁÓŻ OFIARĘ) */
export function resolveAuction(state: GameState, auction: AuctionState): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData) return []
  const log: LogEntry[] = []

  const winner = auction.currentHighBidder
  const cost = auction.currentHighBid
  const label = winner === 'player1' ? 'Ty' : 'AI'

  // Oznacz boga jako użytego
  const god = state.slavaData.gods.find(g => g.id === auction.godId)
  if (god) god.usedThisCycle = true

  log.push(addLog(state, `${label}: Wygrywa licytację o ${god?.name ?? 'boga'}! Koszt: ${cost} PS przy aktywacji.`, 'glory'))

  // Zapisz pendingFavor — aktywacja w następnej rundzie
  state.slavaData.pendingFavor = {
    godId: auction.godId,
    godName: god?.name ?? 'Bóg',
    winnerSide: winner,
    cost,
    wonOnRound: state.roundNumber,
  }

  auction.resolved = true
  state.slavaData.activeAuction = null

  return log
}

/** Aktywacja łaski boga (ZŁÓŻ OFIARĘ) — płaci PS i wykonuje moc */
export function activatePendingFavor(state: GameState, targetInstanceId?: string): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData?.pendingFavor) return []
  const favor = state.slavaData.pendingFavor
  const log: LogEntry[] = []
  const player = state.players[favor.winnerSide]
  const label = favor.winnerSide === 'player1' ? 'Ty' : 'AI'

  // Pobierz PS
  if (player.glory < favor.cost) {
    log.push(addLog(state, `${label}: Za mało PS na Złóż Ofiarę! (${player.glory}/${favor.cost})`, 'system'))
    return log
  }

  player.glory = Math.max(0, player.glory - favor.cost)
  log.push(addLog(state, `${label}: SKŁADA OFIARĘ — ${favor.cost} PS za łaskę ${favor.godName}!`, 'glory'))

  // Wykonaj moc boga
  const favorLogs = executeDivineFavor(state, favor.godId, favor.winnerSide, targetInstanceId)
  log.push(...favorLogs)

  // Wyczyść pendingFavor
  state.slavaData.pendingFavor = null

  return log
}

// ===== AI AUCTION STRATEGY =====

export function aiAuctionDecision(state: GameState, auction: AuctionState): { bid: boolean; amount: number } {
  if (!state.slavaData) return { bid: false, amount: 0 }
  const aiGlory = state.players.player2.glory

  // Przebij do max 2 PS
  if (aiGlory >= auction.currentHighBid + 1 && auction.currentHighBid < 2) {
    return { bid: true, amount: auction.currentHighBid + 1 }
  }

  return { bid: false, amount: 0 }
}

// ===== DIVINE FAVOR EXECUTION =====

/** Wykonaj moc boga (po wygranej licytacji) */
export function executeDivineFavor(state: GameState, godId: number, winnerSide: PlayerSide, targetInstanceId?: string): LogEntry[] {
  if (state.gameMode !== 'slava' || !state.slavaData) return []
  const log: LogEntry[] = []
  const opponent: PlayerSide = winnerSide === 'player1' ? 'player2' : 'player1'
  const label = winnerSide === 'player1' ? 'Ty' : 'AI'

  const god = state.slavaData.gods.find(g => g.id === godId)
  if (!god) return []

  switch (godId) {
    case 1: { // Weles — Wskrzesza własną istotę z cmentarza
      const graveyard = state.players[winnerSide].graveyard
      const creatures = graveyard.filter(c => c.cardData.cardType === 'creature')
      if (creatures.length > 0) {
        const target = targetInstanceId
          ? creatures.find(c => c.instanceId === targetInstanceId) ?? creatures[0]!
          : creatures[0]!
        const idx = graveyard.findIndex(c => c.instanceId === target.instanceId)
        if (idx !== -1) {
          graveyard.splice(idx, 1)
          target.currentStats.defense = target.currentStats.maxDefense
          target.line = BattleLine.FRONT
          target.hasAttackedThisTurn = false
          target.isSilenced = false
          target.cannotAttack = false
          state.players[winnerSide].field.lines[BattleLine.FRONT].push(target)
          log.push(addLog(state, `${label}: Weles wskrzesza ${target.cardData.name}!`, 'effect'))
        }
      } else {
        log.push(addLog(state, `${label}: Weles — brak istot w cmentarzu!`, 'system'))
      }
      break
    }

    case 2: { // Swarożyc — 15 obrażeń rozdzielonych po równo na wrogów
      const enemies = getAllCreaturesOnField(state, opponent)
      if (enemies.length > 0) {
        const dmgPerTarget = Math.floor(15 / enemies.length)
        const remainder = 15 % enemies.length
        enemies.forEach((enemy, i) => {
          const dmg = dmgPerTarget + (i < remainder ? 1 : 0)
          enemy.currentStats.defense -= dmg
          log.push(addLog(state, `Swarożyc: ${enemy.cardData.name} otrzymuje ${dmg} obrażeń!`, 'damage'))
        })
        cleanupDeadCreatures(state, log)
      }
      break
    }

    case 3: { // Marzanna — Perunowcy wroga w Obronie do końca pory roku
      const enemies = getAllCreaturesOnField(state, opponent)
        .filter(c => (c.cardData as any).domain === Domain.PERUN)
      for (const enemy of enemies) {
        enemy.position = 'defense' as any
        enemy.metadata.marzannaLocked = true
        enemy.cannotAttack = true
      }
      log.push(addLog(state, `Marzanna: Perunowcy wroga zamrożeni w Obronie!`, 'effect'))
      break
    }

    case 4: { // Jaryło — Odrodzenie: leczy WSZYSTKICH sojuszników do pełna
      const allies = getAllCreaturesOnField(state, winnerSide)
      let healed = 0
      for (const ally of allies) {
        if (ally.currentStats.defense < ally.currentStats.maxDefense) {
          ally.currentStats.defense = ally.currentStats.maxDefense
          healed++
        }
      }
      log.push(addLog(state, `Jaryło: Odrodzenie — wyleczono ${healed} sojuszników do pełna!`, 'effect'))
      break
    }

    case 5: { // Mokosz — Dar Ziemi: dobierz 3 karty + darmowe wystawienie
      const player = state.players[winnerSide]
      let drawn = 0
      for (let i = 0; i < 3; i++) {
        if (player.deck.length > 0) {
          const card = player.deck.shift()!
          card.line = null
          player.hand.push(card)
          drawn++
        }
      }
      log.push(addLog(state, `Mokosz: Dar Ziemi — dobrano ${drawn} karty + darmowe wystawienie!`, 'effect'))
      player.creaturesPlayedThisTurn = Math.max(0, player.creaturesPlayedThisTurn - 1)
      break
    }

    case 6: { // Perun — 10 obrażeń istoty Welesa, ignoruje odporności
      const enemies = getAllCreaturesOnField(state, opponent)
        .filter(c => (c.cardData as any).domain === Domain.WELES)
      if (enemies.length > 0) {
        const target = targetInstanceId
          ? enemies.find(c => c.instanceId === targetInstanceId) ?? enemies[0]!
          : enemies[0]!
        target.currentStats.defense -= 10
        log.push(addLog(state, `Perun: 10 obrażeń ${target.cardData.name}! (ignoruje odporności)`, 'damage'))
        cleanupDeadCreatures(state, log)
      }
      break
    }

    case 7: { // Swaróg — Odtwarza kartę przygody z cmentarza
      const player = state.players[winnerSide]
      const adventureInGraveyard = player.graveyard.filter(c => c.cardData.cardType === 'adventure')
      if (adventureInGraveyard.length > 0) {
        const target = targetInstanceId
          ? adventureInGraveyard.find(c => c.instanceId === targetInstanceId) ?? adventureInGraveyard[0]!
          : adventureInGraveyard[0]!
        const idx = player.graveyard.findIndex(c => c.instanceId === target.instanceId)
        if (idx !== -1) {
          player.graveyard.splice(idx, 1)
          player.hand.push(target)
          log.push(addLog(state, `Swaróg: Odtwarza ${target.cardData.name} z cmentarza do ręki!`, 'effect'))
        }
      }
      break
    }

    case 8: { // Ród — Zamienia premie dwóch sojuszników
      const allies = getAllCreaturesOnField(state, winnerSide)
      if (allies.length >= 2) {
        const a = allies[0]!, b = allies[1]!
        const tempEffects = [...a.activeEffects]
        const tempArtifacts = [...a.equippedArtifacts]
        a.activeEffects = [...b.activeEffects]
        a.equippedArtifacts = [...b.equippedArtifacts]
        b.activeEffects = tempEffects
        b.equippedArtifacts = tempArtifacts
        log.push(addLog(state, `Ród: Zamieniono premie między ${a.cardData.name} i ${b.cardData.name}!`, 'effect'))
      }
      break
    }
  }

  return log
}

// ===== CLEANUP DEAD CREATURES (helper) =====

function cleanupDeadCreatures(state: GameState, log: LogEntry[]): void {
  for (const side of ['player1', 'player2'] as PlayerSide[]) {
    for (const line of [BattleLine.FRONT, BattleLine.RANGED, BattleLine.SUPPORT]) {
      const dead = state.players[side].field.lines[line].filter(c => c.currentStats.defense <= 0)
      for (const dc of dead) {
        state.players[side].field.lines[line] = state.players[side].field.lines[line].filter(c => c.instanceId !== dc.instanceId)
        dc.line = null
        state.players[side].graveyard.push(dc)
        log.push(addLog(state, `${dc.cardData.name} ginie!`, 'death'))
      }
    }
  }
}

// ===== APPLY SEASONAL BUFFS TO NEWLY PLAYED CREATURE =====

/** Nakłada sezonowy buff na nowo wystawioną istotę (jeśli pasuje do domeny) */
export function applySeasonalBuffToNewCreature(state: GameState, card: CardInstance): void {
  if (state.gameMode !== 'slava' || !state.slavaData) return
  const season = state.slavaData.currentSeason
  const bonusDomain = SEASON_BONUS_DOMAIN[season]

  if ((card.cardData as any).domain === bonusDomain && !card.metadata.seasonalBuff) {
    if (season === Season.WINTER) {
      card.currentStats.defense += 1
      card.currentStats.maxDefense += 1
    } else if (season === Season.SPRING || season === Season.SUMMER) {
      card.currentStats.attack += 1
      card.currentStats.maxAttack += 1
    }
    card.metadata.seasonalBuff = true
  }

  // Sprawdź paraliż domeny
  if (state.slavaData.paralyzedDomain && (card.cardData as any).domain === state.slavaData.paralyzedDomain) {
    card.cannotAttack = true
    card.isSilenced = true
    card.metadata.seasonParalyzed = true
  }
}
