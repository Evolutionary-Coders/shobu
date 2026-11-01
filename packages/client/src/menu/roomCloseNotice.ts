import { AFK_CLOSE_CODE } from '@shobu/core'

/**
 * A nota do menu quando a sala fecha a conexão, pelo código do fechamento, ou
 * `null` quando não há o que explicar. Hoje só a saída por inatividade tem
 * nota (ADR 0031): o jogador volta ao teclado na arena sozinho, com bots, e
 * sem ela não saberia por quê.
 *
 * ```ts
 * roomCloseNotice(AFK_CLOSE_CODE) // 'VOCÊ FOI REMOVIDO POR INATIVIDADE'
 * ```
 */
export function roomCloseNotice(code: number | undefined): string | null {
  return code === AFK_CLOSE_CODE ? 'VOCÊ FOI REMOVIDO POR INATIVIDADE' : null
}
