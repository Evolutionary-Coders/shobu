/**
 * Quem pediu por último, entre pedidos que esperam um download. O pedido
 * ganha um número **antes** do `await`; depois dele, só o último ainda vale.
 *
 * É o que a fala do narrador precisa: duas falas pedidas em sequência baixam
 * em paralelo, e a que chega por último não é necessariamente a pedida por
 * último. Sem o número, a fala velha — e de prioridade menor, que a fila já
 * tinha trocado — começava por cima da nova.
 *
 * ```ts
 * const latest = createLatestRequest()
 * const ticket = latest.stamp()
 * await download()
 * if (!latest.isLatest(ticket)) return // outra fala foi pedida no meio tempo
 * ```
 */
export interface LatestRequest {
  stamp(): number
  isLatest(ticket: number): boolean
}

export function createLatestRequest(): LatestRequest {
  let issued = 0
  return {
    stamp: () => {
      issued += 1
      return issued
    },
    isLatest: (ticket) => ticket === issued,
  }
}
