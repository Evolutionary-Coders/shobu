/// <reference types="vite/client" />

/**
 * As variáveis do vite que o cliente lê, fixadas no build (`.env`, ou o
 * ambiente de quem roda `vite`). Só `gameServerEndpoint.ts` e
 * `voiceServerEndpoint.ts` as interpretam, e o build as confere (`checkClientEnv`).
 */
interface ImportMetaEnv {
  /** A url inteira do servidor de jogo, para atrás de um Ingress: `wss://jogo.dominio/ws`. */
  readonly VITE_GAME_SERVER_URL?: string
  /** Só a porta do servidor de jogo, no mesmo host da página; ignorada com a url. */
  readonly VITE_GAME_SERVER_PORT?: string
  /** A url inteira da sinalização da voz, para atrás de um Ingress: `wss://voz.dominio`. */
  readonly VITE_VOICE_SERVER_URL?: string
}
