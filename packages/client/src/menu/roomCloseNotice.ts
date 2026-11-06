import { AFK_CLOSE_CODE, KICK_CLOSE_CODE } from '@shobu/core'

/**
 * O fechamento sem aviso do WebSocket: o heartbeat do servidor cortou, ou a
 * rede caiu. É o 1006 do padrão, que o navegador põe, e não o servidor.
 */
const ABNORMAL_CLOSE_CODE = 1006

/** O servidor desligando com a sala aberta (`CloseCode.SERVER_SHUTDOWN` do colyseus). */
const SERVER_SHUTDOWN_CLOSE_CODE = 4001

/** O colyseus fechou por erro (`CloseCode.WITH_ERROR`): para quem joga, a conexão caiu. */
const ERROR_CLOSE_CODE = 4002

const NOTICES: ReadonlyMap<number, string> = new Map([
  [AFK_CLOSE_CODE, 'VOCÊ FOI REMOVIDO POR INATIVIDADE'],
  [KICK_CLOSE_CODE, 'VOCÊ FOI EXPULSO DA SALA POR VOTO'],
  [ABNORMAL_CLOSE_CODE, 'A CONEXÃO COM O SERVIDOR CAIU'],
  [ERROR_CLOSE_CODE, 'A CONEXÃO COM O SERVIDOR CAIU'],
  [SERVER_SHUTDOWN_CLOSE_CODE, 'O SERVIDOR FECHOU A SALA'],
])

/**
 * A nota do menu quando a sala fecha a conexão, pelo código do fechamento, ou
 * `null` quando não há o que explicar. Sem nota, o jogador volta à arena
 * sozinho, com bots, e não saberia por quê: a saída por inatividade (ADR
 * 0031), a expulsão por voto (ADR 0034), a queda da conexão e o servidor desligado. A saída pedida fecha calada.
 *
 * ```ts
 * roomCloseNotice(AFK_CLOSE_CODE) // 'VOCÊ FOI REMOVIDO POR INATIVIDADE'
 * ```
 */
export function roomCloseNotice(code: number | undefined): string | null {
  if (code === undefined) return null
  return NOTICES.get(code) ?? null
}

/** O que o fechamento da sala mexe na tela: a nota do menu e a saída da arena. */
export interface RoomCloseScreen {
  setNotice(notice: string | null): void
  leaveArena(): void
}

/**
 * A sala fechou: o menu ganha a nota (`roomCloseNotice`), e, havendo o que
 * explicar, o jogador sai da arena para lê-la. Sem a saída, a nota ia para o
 * menu escondido, e quem foi removido por inatividade ou viu o servidor fechar
 * seguia na arena contra os bots locais, com o ponteiro travado e o hud
 * rodando, sem saber por quê. A saída pedida fecha calada e não tira ninguém.
 *
 * ```ts
 * network.onRoomClosed((code) => showRoomClose({ setNotice, leaveArena }, code))
 * ```
 */
export function showRoomClose(screen: RoomCloseScreen, code: number | undefined): void {
  const notice = roomCloseNotice(code)
  screen.setNotice(notice)
  if (notice) screen.leaveArena()
}
