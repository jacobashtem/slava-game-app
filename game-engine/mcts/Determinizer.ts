/**
 * Determinizer — determinizacja ukrytej informacji dla ISMCTS.
 *
 * W grze karcianej nie znamy:
 * - Kart w ręce przeciwnika
 * - Kolejności kart w talii przeciwnika
 *
 * Determinizacja: losowo tasujemy ukryte karty przeciwnika,
 * zachowując obserwowalne informacje (ilość kart w ręce, na polu, etc.).
 *
 * To daje nam "możliwy świat" — jeden ze stanów zgodnych z naszą obserwacją.
 * ISMCTS uśrednia wyniki z wielu takich światów → robustne decyzje.
 */

import type { GameState, PlayerSide, CardInstance } from '../types'
import { cloneGameState, getOpponentSide } from '../GameStateUtils'

/**
 * Fisher-Yates shuffle — O(n), uniform distribution.
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * Utwórz zdeterminizowany stan gry.
 *
 * Losowo przypisuje karty z puli ukrytych (ręka + talia przeciwnika)
 * do ręki i talii, zachowując liczbę kart w każdej strefie.
 *
 * @param state — aktualny stan gry (z pełną widocznością — "cheating" state)
 * @param ourSide — nasza strona (obserwator)
 * @returns zdeterminizowany stan (klon z przetasowaną ręką/talią wroga)
 */
export function determinize(
  state: GameState,
  ourSide: PlayerSide,
): GameState {
  const det = cloneGameState(state)
  const oppSide = getOpponentSide(ourSide)
  const opp = det.players[oppSide]

  // Pula ukrytych kart: ręka + talia przeciwnika
  const hiddenPool: CardInstance[] = [...opp.hand, ...opp.deck]

  if (hiddenPool.length <= 1) return det // nic do tasowania

  // Losowe przetasowanie
  shuffle(hiddenPool)

  // Rozdaj z powrotem: pierwsze N do ręki, reszta do talii
  const handSize = opp.hand.length
  opp.hand = hiddenPool.slice(0, handSize)
  opp.deck = hiddenPool.slice(handSize)

  return det
}
