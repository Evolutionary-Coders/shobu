import { arenaToFollow } from './roomArena.ts'

/** O que seguir uma sala lê do link: o endereço, o mapa, a saída e a chamada da fila. */
export interface FollowedRoom<Link> {
  readonly address: string
  readonly arenaId: string
  leave(): Promise<void>
  onMove(listener: (follow: () => Promise<Link>) => void): void
}

/** O que seguir uma sala faz fora daqui: a rede, a url e a página. */
export interface RoomFollowerPorts<Link> {
  readonly bootedArenaId: string
  readonly catalogIds: readonly string[]
  /** A rede e a voz passam a falar com a sala. */
  attach(link: Link): void
  /** A url passa a mostrar o endereço da sala. */
  showAddress(address: string): void
  /** Recarrega a página no mapa dado, com o endereço que a url mostra. */
  reloadInto(arenaId: string): void
  /** A troca de sala que a fila pediu falhou. */
  onMoveFailed(reason: unknown): void
}

/**
 * Segue a sala em que se joga, e a da fila quando o servidor chamar. O mapa é
 * da sala: com outro subido, sai dela e recarrega no dela. A recarga entra no
 * endereço que a url mostra, então a sala da fila vai para a url **antes** de
 * recarregar: sem isto, a página voltava à sala provisória, e o assento que a
 * fila acabara de reservar ia para o próximo da fila.
 *
 * ```ts
 * const follow = createRoomFollower({ bootedArenaId, catalogIds, attach, showAddress, reloadInto, onMoveFailed })
 * openGameLink(url, request, delayMs).then(follow)
 * ```
 */
export function createRoomFollower<Link extends FollowedRoom<Link>>(
  ports: RoomFollowerPorts<Link>,
): (link: Link) => void {
  const follow = (link: Link): void => {
    if (reloadForRoomArena(ports, link)) return
    ports.showAddress(link.address)
    ports.attach(link)
    link.onMove(
      (next) =>
        void next()
          .then(moveTo)
          .catch((reason) => ports.onMoveFailed(reason)),
    )
  }
  const moveTo = (link: Link): void => {
    ports.showAddress(link.address)
    follow(link)
  }
  return follow
}

/** Devolve se recarregou. */
function reloadForRoomArena<Link extends FollowedRoom<Link>>(
  ports: RoomFollowerPorts<Link>,
  link: Link,
): boolean {
  const arenaId = arenaToFollow(link.arenaId, ports.bootedArenaId, ports.catalogIds)
  if (!arenaId) return false
  console.info(
    JSON.stringify({ event: 'room.arena-reload', from: ports.bootedArenaId, to: arenaId }),
  )
  void link.leave().finally(() => ports.reloadInto(arenaId))
  return true
}
