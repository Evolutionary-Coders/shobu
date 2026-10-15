import { generateRoomAddress, parseRoomAddress } from '@shobu/core'

/** A sala que o jogador vai pedir e o caminho que a url passa a mostrar. */
export interface RoomLocation {
  readonly address: string
  readonly path: string
}

/**
 * O endereço da sala sai do caminho da url (ADR 0028). Endereço válido volta
 * na forma canônica, para `10.0.0.07` e `10.0.0.7` caírem na mesma sala; sem
 * endereço, ou com um inválido, sorteia um novo fora das faixas reservadas.
 *
 * ```ts
 * resolveRoomAddress(location.pathname, () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
 * ```
 */
export function resolveRoomAddress(pathname: string, nextUint32: () => number): RoomLocation {
  const typed = parseRoomAddress(pathname.replaceAll('/', ''))
  const address = typed ?? generateRoomAddress(nextUint32)
  return { address, path: `/${address}` }
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
