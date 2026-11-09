import { parseRoomAddress } from '@shobu/core'

/**
 * O endereço da sala no caminho da url (ADR 0028), na forma canônica, para
 * `10.0.0.07` e `10.0.0.7` caírem na mesma sala; `undefined` sem endereço, ou
 * com um inválido. O cliente não sorteia mais endereço: sem ele, a sala sai do
 * menu, e quem a escolhe é o servidor (ADR 0032). A url só passa a mostrar um
 * endereço depois de entrar na sala (`roomFollower.ts`).
 *
 * ```ts
 * roomAddressInPath('/10.0.0.07/') // '10.0.0.7'
 * roomAddressInPath('/')           // undefined
 * ```
 */
export function roomAddressInPath(pathname: string): string | undefined {
  return parseRoomAddress(pathname.replaceAll('/', ''))
}

/**
 * O servidor de jogo no mesmo host da página. Página em https exige `wss`: o
 * navegador bloqueia `ws://` numa página segura como conteúdo misto.
 *
 * ```ts
 * gameServerUrl(window.location, 2567) // 'wss://host:2567'
 * ```
 */
export function gameServerUrl(
  location: { readonly protocol: string; readonly hostname: string },
  port: number,
): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.hostname}:${port}`
}
