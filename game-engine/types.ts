import type {
  AttackType, Domain, CardPosition, GamePhase,
  AdventureType, BattleLine, EffectTrigger, EffectPriority,
  Season,
} from './constants'

// ===== RAW JSON DATA SHAPES =====

export interface RawCreatureCard {
  id: number
  idDomain: number
  domain: string
  name: string
  stats: { attack: number; defense: number }
  oldStats: string
  combat: {
    attackType: number
    attackTypeString: string
    isFlying: boolean
  }
  effectId: string           // referencja do EffectRegistry
  effect: string             // opis do wyświetlenia w UI (tooltip)
  lore: string
}

export interface RawAdventureCard {
  id: number
  idType: number
  type: string
  name: string
  effectId: string           // referencja do EffectRegistry (podstawowy efekt)
  enhancedEffectId: string   // referencja do EffectRegistry (wzmocniony efekt)
  effect: string             // opis podstawowego efektu (UI)
  enhancedEffect: string     // opis wzmocnionego efektu (UI)
  lore: string
  persistence?: 'instant' | 'permanent' | 'duration' | 'conditional'
  durationRounds?: number | null
  conditionEnd?: string
}

// ===== CARD STATS =====

export interface CardStats {
  attack: number
  defense: number
  maxDefense: number  // bazowa wartość — do resetowania / leczenia
  maxAttack: number
}

// ===== CARD DATA (po przetworzeniu z JSON) =====

export interface AbilityEntry {
  trigger: string
  text: string
  cost?: number
  limit?: string
}

export interface CreatureCardData {
  id: number
  cardType: 'creature'
  domain: Domain
  name: string
  stats: CardStats
  attackType: AttackType
  isFlying: boolean
  effectId: string
  effectDescription: string  // tekst do UI
  lore: string
  abilities: AbilityEntry[]
}

export interface AdventureCardData {
  id: number
  cardType: 'adventure'
  adventureType: AdventureType
  name: string
  effectId: string
  enhancedEffectId: string
  effectDescription: string
  enhancedEffectDescription: string
  lore: string
  persistence: 'instant' | 'permanent' | 'duration' | 'conditional'
  durationRounds?: number | null
  conditionEnd?: string
  abilities: AbilityEntry[]
}

export type CardData = CreatureCardData | AdventureCardData

// ===== RUNTIME CARD INSTANCE =====

export interface CardInstance {
  instanceId: string                       // unikalne ID runtime: "creature-15-abc123"
  cardData: CardData
  currentStats: CardStats                  // aktualne (zmodyfikowane) statystyki
  position: CardPosition
  line: BattleLine | null                  // null = w ręce lub talii
  activeEffects: ActiveEffect[]            // nałożone efekty (buffy/debuffy)
  equippedArtifacts: AdventureCardData[]   // artefakty podpięte pod tę istotę
  isRevealed: boolean                      // czy przeciwnik widzi tę kartę
  turnsInPlay: number                      // ile tur spędzone na polu
  roundEnteredPlay: number                 // w której rundzie wystawiono (dla Gryfa etc.)
  owner: PlayerSide
  // Flagi statusu
  isSilenced: boolean          // nie może używać zdolności
  isImmune: boolean            // odporny na efekty negatywne
  cannotAttack: boolean        // nie może atakować (np. po Białych Ludziach)
  isGrounded: boolean          // uziemiony (traci latanie)
  hasAttackedThisTurn: boolean
  hasMovedThisTurn: boolean
  poisonRoundsLeft: number | null  // Trucizna: ile rund do śmierci
  paralyzeRoundsLeft: number | null  // Paraliż: ile rund do odblokowania (null = brak / trwały)
  // Dane dla specyficznych efektów
  metadata: Record<string, unknown>  // dowolne dane dla efektów
}

// ===== ACTIVE EFFECT =====

export interface ActiveEffect {
  effectId: string
  sourceInstanceId: string           // kto nałożył efekt
  trigger: EffectTrigger
  remainingTurns: number | null      // null = permanentny, 0 = wygasa na końcu tej tury
  stackId: string                    // dla de-duplikacji (jeden efekt = jeden stack)
  metadata: Record<string, unknown>  // dane efektu (np. ile HP ukradł)
}

// ===== PLAYERS =====

export type PlayerSide = 'player1' | 'player2'

export interface PlayerState {
  side: PlayerSide
  isAI: boolean
  deck: CardInstance[]
  hand: CardInstance[]
  field: FieldState
  graveyard: CardInstance[]
  trophies: CardInstance[]     // zabici wrogowie (dla trybu Slava!)
  glory: number                // Sława w trybie Slava!
  gold: number                 // Punkty Sławy (legacy: gold)
  activeLocation: CardInstance | null
  handLimit: number
  // Liczniki dla reguł Gold Edition
  creaturesPlayedThisTurn: number
  adventuresPlayedThisTurn: number
}

export interface FieldState {
  lines: {
    [BattleLine.FRONT]: CardInstance[]
    [BattleLine.RANGED]: CardInstance[]
    [BattleLine.SUPPORT]: CardInstance[]
  }
}

// ===== ACTIVE EVENT CARD (persistence != 'instant') =====

export interface ActiveEventCard {
  instanceId: string           // instanceId karty zdarzenia
  cardData: AdventureCardData
  owner: PlayerSide
  playedOnRound: number
  // duration: licznik rund (null = permanent/conditional)
  roundsRemaining: number | null
  // conditional: warunek zakończenia
  conditionEnd?: string
}

// ===== PENDING PLAYER INTERACTION =====
// Gdy silnik potrzebuje decyzji gracza w trakcie efektu, ustawia to pole.
// UI renderuje modal odpowiedni do typu i czeka na odpowiedź.

export type PendingInteractionType =
  | 'alkonost_target'          // Alkonost: wskaż sojusznika który zostanie zaatakowany
  | 'chowaniec_intercept'      // Chowaniec: czy przejąć atak? (Y/N)
  | 'kresnik_buff'             // Kresnik ON_PLAY: wybierz premię
  | 'baba_domain'              // Baba ON_PLAY: wybierz domenę
  | 'cmentarna_baba_resurrect' // Cmentarna Baba: wybierz kartę z cmentarza
  | 'inkluz_recipient'         // Inkluz: wybierz sojusznika który dostanie premię
  | 'wielkolud_counter'        // Wielkolud: wybierz cel kontrataku
  | 'liczyrzepa_type'          // Liczyrzepa: wybierz typ ataku
  | 'strela_intercept'         // Strela: czy zagrać kartę? (Y/N)
  | 'on_play_target'           // ON_PLAY z wymaganym celem (np. Jaroszek)
  | 'brzegina_shield'          // Brzegina: czy użyć tarczy za PS?
  | 'kosciej_resurrect'        // Kościej: czy wskrzesić za PS?
  // Tryb Sława!
  | 'auction_bid'              // Licytacja o Bożą Łaskę
  | 'divine_favor_target'      // Wybór celu mocy boga
  | 'swarozyc_split_damage'    // Swarożyc: rozdziel 15 obrażeń
  | 'smocze_jajo_hatch'        // Smocze Jajo: wybierz smoka do wyklucia

export interface PendingInteraction {
  type: PendingInteractionType
  // Karta która wyzwala interakcję
  sourceInstanceId: string
  // Kto musi odpowiedzieć
  respondingPlayer: PlayerSide
  // Opcjonalny kontekst
  attackerInstanceId?: string      // dla alkonost: kto atakował
  targetInstanceId?: string        // kontekst pomocniczy
  availableTargetIds?: string[]    // lista instanceId do wyboru
  availableChoices?: string[]      // lista stringów do wyboru (np. nazwy premii)
  metadata?: Record<string, unknown>
}

// ===== GAME STATE =====

export interface GameState {
  players: Record<PlayerSide, PlayerState>
  currentTurn: PlayerSide
  currentPhase: GamePhase
  roundNumber: number
  turnNumber: number
  actionLog: LogEntry[]
  winner: PlayerSide | null
  gameMode: 'gold' | 'slava'
  // Aktywne zdarzenia/lokacje leżące w polu (persistence != instant)
  activeEvents: ActiveEventCard[]
  // Legacy: globalny efekt lokacji
  activeAdventureEffects: string[]
  // Karta czekająca na potwierdzenie przez gracza efektu ON_PLAY (activatable)
  awaitingOnPlayConfirmation: string | null  // instanceId karty
  // Oczekująca interakcja gracza (blokuje grę do czasu odpowiedzi)
  pendingInteraction?: PendingInteraction
  // Dane trybu Sława! (null/undefined w Gold Edition)
  slavaData?: SlavaState
}

// ===== COMBAT =====

export interface CombatResult {
  attacker: CardInstance
  defender: CardInstance
  damageToDefender: number
  damageToAttacker: number    // kontratak (tylko gdy defender w pozycji DEFENSE)
  defenderDied: boolean
  attackerDied: boolean
  counterattackOccurred: boolean
  softFail?: boolean          // atak chybiony/zablokowany (Odporny) — 0 DMG ale kontratak działa
  softFailReason?: string     // powód blokady (np. "Tur jest odporny na Dystans i Magię")
  effectsTriggered: string[]  // lista effectId które odpaliły
  log: LogEntry[]
}

// ===== LOGGING =====

export interface LogEntry {
  round: number
  turn: number
  phase: GamePhase
  message: string
  type: 'attack' | 'damage' | 'death' | 'play' | 'effect' | 'system' | 'gold' | 'draw' | 'glory'
  involvedCards?: string[]  // instanceId kart których dotyczy wpis
}

// ===== EFFECT SYSTEM =====

export interface EffectContext {
  state: GameState
  source: CardInstance            // karta będąca źródłem efektu
  target?: CardInstance           // cel efektu (opcjonalny)
  trigger: EffectTrigger
  value?: number                  // np. ilość obrażeń
  metadata?: Record<string, unknown>
}

export interface EffectResult {
  newState: GameState
  log: LogEntry[]
  prevented: boolean              // czy efekt był zablokowany?
  replaced: boolean               // czy efekt był zastąpiony?
}

export interface EffectDefinition {
  id: string
  name: string                    // czytelna nazwa dla debugowania
  description: string             // opis dla gracza
  trigger: EffectTrigger | EffectTrigger[]
  priority: EffectPriority
  execute: (ctx: EffectContext) => EffectResult
  // Opcjonalna walidacja — czy efekt może się teraz odpalić?
  canActivate?: (ctx: EffectContext) => boolean

  // ===== AKTIVOWALNE ZDOLNOŚCI (gracz klika ⚡ na karcie) =====
  // Czy gracz może ręcznie aktywować tę zdolność (ON_ACTIVATE trigger)?
  activatable?: boolean
  // Koszt aktywacji w PS (0 = darmowe)
  activationCost?: number
  // Jak często można aktywować:
  //   'per_turn'  — raz na turę gracza
  //   'per_round' — raz na rundę (obaj gracze grają po jednej turze)
  //   'once'      — tylko raz przez całą grę
  //   'unlimited' — bez ograniczeń (dopóki spełniony koszt)
  activationCooldown?: 'per_turn' | 'per_round' | 'once' | 'unlimited'
  // Czy aktywacja wymaga wskazania celu (target selection w UI)?
  activationRequiresTarget?: boolean
  // Opcjonalny filtr celów — zwraca true jeśli karta jest prawidłowym celem aktywacji
  activationTargetFilter?: (card: CardInstance, source: CardInstance, state: GameState) => boolean

  // ===== WYSTAWIANIE NA POLE WROGA =====
  // Karta wystawiana na pole przeciwnika (np. Wieszczy, Bieda)
  playOnEnemyField?: boolean
}

// ===== AI =====

export interface AIDecision {
  type: 'play_creature' | 'play_adventure' | 'attack' | 'change_position' | 'end_turn' | 'activate_effect' | 'invoke_god'
  cardInstanceId?: string
  targetInstanceId?: string
  targetLine?: BattleLine
  targetPosition?: CardPosition
  // Slava-specific
  godId?: number
  bidAmount?: number
}

// ===== PRECEDENT (Księga Precedensów) =====

export interface PrecedentRule {
  id: string
  conflictingEffects: string[]    // effectId które mogą kolidować
  resolution: PrecedentResolution
  reasoning: string               // opis w języku naturalnym dla debugowania
}

export type PrecedentResolution =
  | 'FIRST_WINS'           // wygrywa efekt aktywowany pierwszy
  | 'SECOND_WINS'          // wygrywa efekt aktywowany drugi (ostatni)
  | 'IMMUNITY_WINS'        // odporność zawsze wygrywa
  | 'PREVENTION_WINS'      // zapobieganie wygrywa nad zastąpieniem
  | 'ACTIVE_WINS'          // efekt aktywny wygrywa nad pasywnym
  | 'PASSIVE_WINS'         // efekt pasywny wygrywa
  | 'CUSTOM'               // custom resolver function

// ===== TRYB SŁAWA! — TYPY =====

export interface GodData {
  id: number
  name: string
  powerID: string           // effectId mocy boga (mniejsza łaska)
  majorPowerID?: string     // effectId większej łaski (placeholder — do implementacji)
  cost: number
  usedThisCycle: boolean    // czy użyty w aktualnym cyklu pory roku
}

export interface HolidayMission {
  seasonId: Season
  name: string
  condition: (state: GameState, side: PlayerSide) => boolean
  reward: number  // PS
  completed: Record<PlayerSide, boolean>  // raz per cykl pory roku
  claimable: Record<PlayerSide, boolean>  // warunki spełnione, czeka na kliknięcie
}

/** Wygrana licytacja czekająca na aktywację (ZŁÓŻ OFIARĘ) */
export interface PendingFavor {
  godId: number
  godName: string
  winnerSide: PlayerSide
  cost: number            // PS do zapłacenia przy aktywacji
  wonOnRound: number      // runda w której wygrano licytację
  chosenPower?: 'minor' | 'major'  // placeholder — gracz wybiera po wygraniu licytacji
}

export interface AuctionState {
  godId: number
  bids: { side: PlayerSide; amount: number }[]
  currentHighBidder: PlayerSide
  currentHighBid: number
  resolved: boolean
}

export interface SlavaState {
  // Sezon (obliczany z rundy, ale trzymamy dla UI)
  currentSeason: Season
  previousSeason: Season | null
  seasonRound: number        // 1-4 w ramach aktualnej pory

  // Bogowie dostępni w aktualnej porze
  gods: GodData[]

  // Aktywne święto
  holiday: HolidayMission | null

  // Sezonowe buffy nałożone (do usunięcia przy zmianie pory)
  seasonalBuffsApplied: boolean

  // Paraliż domeny (1 runda po zmianie pory)
  paralyzedDomain: Domain | null
  paralysisRoundsLeft: number

  // Licytacja (aktywna lub null)
  activeAuction: AuctionState | null

  // Wygrana licytacja czekająca na aktywację (ZŁÓŻ OFIARĘ)
  pendingFavor: PendingFavor | null

  // Tracking per turn: damage dealt (dla Święta Kupały)
  damageDealtThisTurn: Record<PlayerSide, number>

  // Tracking per turn: killed enemy base DEF (dla trofeów)
  killedEnemyDefenseThisTurn: Record<PlayerSide, number>
}

// Rozszerzenie GameState o dane Sława (opcjonalne — null w Gold Edition)
export interface GameStateSlavaExtension {
  slavaData?: SlavaState
}
