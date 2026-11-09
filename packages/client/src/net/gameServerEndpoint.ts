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
 * na 2567; vazias, as duas contam como ausentes. Url que não é ws(s), ou
 * porta fora de 1–65535, lança citando o valor: o `Client` do colyseus
 * aceitaria e falharia longe daqui. O build confere as mesmas regras antes
 * (`checkClientEnv`), então em produção isso só lança num build que pulou a
 * conferência — e lança dentro do boot, que mostra a falha na tela.
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
    // a linha vazia no `.env` (ou `VITE_GAME_SERVER_PORT=` no ambiente do
    // build) é a variável ausente, como a url vazia.
    const port = env.VITE_GAME_SERVER_PORT || undefined
    return gameServerUrl(
      location,
      portSetting(
        { VITE_GAME_SERVER_PORT: port },
        'VITE_GAME_SERVER_PORT',
        DEFAULT_GAME_SERVER_PORT,
      ),
    )
  }
  return websocketUrlSetting('VITE_GAME_SERVER_URL', url)
}

/**
 * Uma url de WebSocket vinda de uma variável do vite, sem a barra do fim (as
 * rotas emendam `/caminho` nela). O que não é ws(s) lança citando o nome e o
 * valor.
 *
 * ```ts
 * websocketUrlSetting('VITE_VOICE_SERVER_URL', 'wss://voz.dominio/') // 'wss://voz.dominio'
 * ```
 */
export function websocketUrlSetting(name: string, url: string): string {
  if (!/^wss?:\/\/[^/\s]+/.test(url)) {
    throw new Error(`${name}='${url}' inválida; esperado ws://host[:porta][/caminho] ou wss://...`)
  }
  return url.replace(/\/+$/, '')
}
