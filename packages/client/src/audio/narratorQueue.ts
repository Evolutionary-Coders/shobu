import type { MedalRarity } from '@shobu/core'

/**
 * Quem fala e quem cala. O narrador comenta as dezessete medalhas e os quatro
 * marcos de partida, e sem fila isso vira duas vozes por cima uma da outra numa
 * kill que ganhou três medalhas.
 *
 * Duas regras, e nada mais: **nunca duas falas ao mesmo tempo**, e **a mais
 * rara corta a menos rara**. Fora disso, a fala é descartada — enfileirar para
 * depois faria o narrador comentar um double kill dez segundos atrasado, que é
 * pior do que não comentar.
 *
 * **Sem relógio próprio**: recebe o tempo do quadro, como o resto do hud.
 *
 * ```ts
 * queue.request(medalPriority('incomum'), session.matchTimeS)
 * ```
 */
export const NARRATOR_COOLDOWN_S = 2.5

/**
 * Quanto tempo uma fala ocupa a boca do narrador. É estimativa: os takes vão
 * de 1 a 4 s e o mixer não devolve a duração antes de decodificar. Errar para
 * mais só descarta fala; errar para menos deixaria duas se atropelarem, e o
 * mixer corta a anterior de qualquer jeito.
 */
export const NARRATOR_CLIP_S = 2.8

/** Os marcos de partida falam acima de medalha comum, e abaixo de lendária. */
export const MATCH_MARK_PRIORITY = 3

export interface NarratorQueue {
  /** Verdade quando a fala deve começar agora, cortando a que estiver no ar. */
  request(priority: number, nowS: number): boolean
}

export function medalPriority(rarity: MedalRarity): number {
  if (rarity === 'comum') return 1
  if (rarity === 'incomum') return 2
  if (rarity === 'rara') return 3
  return 4
}

export function createNarratorQueue(cooldownS: number = NARRATOR_COOLDOWN_S): NarratorQueue {
  if (!(cooldownS >= 0)) {
    throw new RangeError(`cooldownS recebeu ${cooldownS}; esperado número >= 0`)
  }
  const speaking = { untilS: Number.NEGATIVE_INFINITY, priority: 0 }
  return {
    request: (priority, nowS) => {
      const free = nowS >= speaking.untilS + cooldownS
      const cuts = nowS < speaking.untilS && priority > speaking.priority
      if (!free && !cuts) return false
      speaking.untilS = nowS + NARRATOR_CLIP_S
      speaking.priority = priority
      return true
    },
  }
}
