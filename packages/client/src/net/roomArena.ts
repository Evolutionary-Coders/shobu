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

/**
 * O mapa da sala que a página segue, lido do estado dela: o de agora, a menos
 * que o voto já tenha fechado no mapa que a página subiu. É quem entrou no
 * intervalo com a oferta do mapa seguinte (`offerAt`, no servidor): seguir o
 * de agora o mandava de volta ao mapa que a sala deixa em segundos, e depois
 * ao novo outra vez.
 *
 * Quem já estava na sala, no mapa de agora, não muda nada: o voto fechado em
 * outro mapa não é o subido, e a página só recarrega na partida seguinte,
 * quando a vaga espera a volta (ADR 0031).
 *
 * ```ts
 * const roomArenaId = roomArenaFor(network.matchState(), scene.arena.id)
 * ```
 */
export function roomArenaFor(
  view: { readonly arenaId: string; readonly nextArenaId: string | undefined } | undefined,
  bootedArenaId: string,
): string {
  if (!view || view.nextArenaId === bootedArenaId) return bootedArenaId
  return view.arenaId
}
