/**
 * O mapa que o cliente tem de subir para jogar na sala, ou `undefined` se o
 * que ele subiu já é o da sala. O mapa é da sala (o servidor simula nele), e
 * não da escolha guardada no menu: com mapas diferentes, o spawn do servidor
 * cai fora do mapa desenhado e toda confirmação vira correção.
 *
 * Um id que o catálogo deste cliente não conhece não pede recarga: recarregar
 * nele cairia de novo aqui, para sempre.
 *
 * ```ts
 * const arenaId = arenaToFollow(link.arenaId, scene.arena.id, MATCH_ARENAS.map((choice) => choice.id))
 * if (arenaId) reloadIntoArena(arenaId)
 * ```
 */
export function arenaToFollow(
  roomArenaId: string,
  bootedArenaId: string,
  catalogIds: readonly string[],
): string | undefined {
  if (roomArenaId === bootedArenaId || !catalogIds.includes(roomArenaId)) return undefined
  return roomArenaId
}
