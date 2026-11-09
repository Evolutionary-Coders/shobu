/**
 * O client id OAuth da Feira de Jogos, o do exemplo do professor
 * (tes786205/game, `49beaaef71`). É público: vai em toda página que faz login.
 * O token só vale na API da Feira se for emitido para ele.
 */
export const FAIR_GOOGLE_CLIENT_ID =
  '331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com'

/**
 * O client id do login, ou `undefined` com o login desligado. Sem a variável,
 * o da Feira: um build que esqueceu o `.env` (a imagem docker) ainda mostra o
 * botão. Vazia, desliga, para quem roda o jogo fora da Feira.
 *
 * ```ts
 * googleClientIdOf(import.meta.env) // FAIR_GOOGLE_CLIENT_ID
 * googleClientIdOf({ VITE_GOOGLE_CLIENT_ID: '' }) // undefined
 * ```
 */
export function googleClientIdOf(env: {
  readonly VITE_GOOGLE_CLIENT_ID?: string | undefined
}): string | undefined {
  const id = env.VITE_GOOGLE_CLIENT_ID
  if (id === undefined) return FAIR_GOOGLE_CLIENT_ID
  return id.trim() === '' ? undefined : id.trim()
}
