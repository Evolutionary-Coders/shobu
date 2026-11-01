import { portSetting } from '@shobu/core'
import { gameServerUrl } from './roomLocation.ts'

/** A porta do servidor de jogo, a da Tabela 1 de `docs/rede/arquitetura-de-rede.md`. */
export const DEFAULT_GAME_SERVER_PORT = 2567

/** As variáveis do vite que apontam o servidor de jogo (`vite-env.d.ts`). */
export type GameServerEnv = Pick<ImportMetaEnv, 'VITE_GAME_SERVER_URL' | 'VITE_GAME_SERVER_PORT'>

/**
 * Onde o cliente acha o servidor de jogo. Com `VITE_GAME_SERVER_URL`, ela
 * inteira — atrás de um Ingress o servidor não está numa porta do host da
 * página; sem ela, o host da página na porta de `VITE_GAME_SERVER_PORT`, ou
 * na 2567. Url que não é ws(s) para o boot citando o valor: o `Client` do
 * colyseus aceitaria e falharia longe daqui.
 *
 * ```ts
 * gameServerEndpoint({}, { protocol: 'http:', hostname: 'localhost' }) // 'ws://localhost:2567'
 * gameServerEndpoint({ VITE_GAME_SERVER_URL: 'wss://jogo.dominio/ws' }, location) // 'wss://jogo.dominio/ws'
 * ```
 */
export function gameServerEndpoint(
  env: GameServerEnv,
  location: { readonly protocol: string; readonly hostname: string },
): string {
  const url = env.VITE_GAME_SERVER_URL
  if (url === undefined || url === '') {
    const { VITE_GAME_SERVER_PORT } = env
    const port = portSetting(
      { VITE_GAME_SERVER_PORT },
      'VITE_GAME_SERVER_PORT',
      DEFAULT_GAME_SERVER_PORT,
    )
    return gameServerUrl(location, port)
  }
  if (!/^wss?:\/\/[^/\s]+/.test(url)) {
    throw new Error(
      `VITE_GAME_SERVER_URL='${url}' inválida; esperado ws://host[:porta][/caminho] ou wss://...`,
    )
  }
  return url.replace(/\/+$/, '')
}
