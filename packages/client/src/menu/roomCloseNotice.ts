import { AFK_CLOSE_CODE } from '@shobu/core'

/**
 * O fechamento sem aviso do WebSocket: o heartbeat do servidor cortou, ou a
 * rede caiu. É o 1006 do padrão, que o navegador põe, e não o servidor.
 */
const ABNORMAL_CLOSE_CODE = 1006

/** O servidor desligando com a sala aberta (`CloseCode.SERVER_SHUTDOWN` do colyseus). */
const SERVER_SHUTDOWN_CLOSE_CODE = 4001

const NOTICES: ReadonlyMap<number, string> = new Map([
  [AFK_CLOSE_CODE, 'VOCÊ FOI REMOVIDO POR INATIVIDADE'],
  [ABNORMAL_CLOSE_CODE, 'A CONEXÃO COM O SERVIDOR CAIU'],
  [SERVER_SHUTDOWN_CLOSE_CODE, 'O SERVIDOR FECHOU A SALA'],
])

/**
 * A nota do menu quando a sala fecha a conexão, pelo código do fechamento, ou
 * `null` quando não há o que explicar. Sem nota, o jogador volta à arena
 * sozinho, com bots, e não saberia por quê: a saída por inatividade (ADR
 * 0031), a queda da conexão e o servidor desligado. A saída pedida fecha calada.
 *
 * ```ts
 * roomCloseNotice(AFK_CLOSE_CODE) // 'VOCÊ FOI REMOVIDO POR INATIVIDADE'
 * ```
 */
export function roomCloseNotice(code: number | undefined): string | null {
  if (code === undefined) return null
  return NOTICES.get(code) ?? null
}
