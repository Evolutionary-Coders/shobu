import { websocketUrlSetting } from './gameServerEndpoint.ts'
import { gameServerUrl } from './roomLocation.ts'

/** A sinalização do servidor de mídia, a da Tabela 1 de `docs/rede/arquitetura-de-rede.md`. */
export const DEFAULT_MEDIA_SERVER_PORT = 7880

/** A variável do vite que aponta o servidor de voz (`vite-env.d.ts`). */
export type VoiceServerEnv = Pick<ImportMetaEnv, 'VITE_VOICE_SERVER_URL'>

/**
 * Onde o cliente acha a sinalização da voz (ADR 0026). Com
 * `VITE_VOICE_SERVER_URL`, ela inteira — atrás de um Ingress a voz não está
 * na 7880 do host da página, como o jogo não está na 2567; sem ela, ou vazia,
 * o host da página na 7880. Url que não é ws(s) lança citando o valor, e o
 * build confere antes (`checkClientEnv`).
 *
 * ```ts
 * voiceServerEndpoint({}, { protocol: 'https:', hostname: 'shobu.example' }) // 'wss://shobu.example:7880'
 * voiceServerEndpoint({ VITE_VOICE_SERVER_URL: 'wss://voz.dominio' }, location) // 'wss://voz.dominio'
 * ```
 */
export function voiceServerEndpoint(
  env: VoiceServerEnv,
  location: { readonly protocol: string; readonly hostname: string },
): string {
  const url = env.VITE_VOICE_SERVER_URL
  if (url === undefined || url === '') return gameServerUrl(location, DEFAULT_MEDIA_SERVER_PORT)
  return websocketUrlSetting('VITE_VOICE_SERVER_URL', url)
}
