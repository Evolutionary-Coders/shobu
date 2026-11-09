/**
 * O mapa de cada sala: o de quem a criou, se for do catálogo, e o padrão se
 * não for; depois, o que o voto escolher (ADR 0031). Quem entra depois recebe
 * o da sala e recarrega nele.
 */
export interface RoomArenas {
  readonly defaultId: string
  readonly catalogIds: readonly string[]
  readonly byAddress: Map<string, string>
}

export function createRoomArenas(defaultId: string, catalogIds: readonly string[]): RoomArenas {
  return { defaultId, catalogIds, byAddress: new Map() }
}

/**
 * O mapa que o cliente subiu, se for do catálogo. Vem da rede, então o resto
 * é o padrão.
 *
 * ```ts
 * arenaWanted(arenas, ctx.body) // 'ichiban-gai', ou o padrão
 * ```
 */
export function arenaWanted(arenas: RoomArenas, body: unknown): string {
  const wanted = (body as { arenaId?: unknown } | undefined)?.arenaId
  return arenas.catalogIds.find((id) => id === wanted) ?? arenas.defaultId
}

/** O mapa de uma sala aberta; o padrão só para uma que o matchmaking não criou. */
export function arenaAt(arenas: RoomArenas, address: string): string {
  return arenas.byAddress.get(address) ?? arenas.defaultId
}

/**
 * O voto trocou o mapa da sala: quem entrar daqui em diante recebe o novo.
 * Só para uma sala aberta e um mapa do catálogo; o resto é ignorado.
 *
 * ```ts
 * moveRoomArena(arenas, '203.0.113.7', 'ichiban-gai')
 * ```
 */
export function moveRoomArena(arenas: RoomArenas, address: string, arenaId: string): void {
  if (!arenas.byAddress.has(address) || !arenas.catalogIds.includes(arenaId)) return
  arenas.byAddress.set(address, arenaId)
}
