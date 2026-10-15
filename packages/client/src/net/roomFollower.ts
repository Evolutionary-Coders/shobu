import { arenaToFollow } from './roomArena.ts'

/** Um assento que o servidor reservou e ninguém ocupou ainda: a sala dele, o mapa, e ocupar. */
export interface OfferedSeat<Link> {
  readonly address: string
  readonly arenaId: string
  take(): Promise<Link>
}

/** O que seguir uma sala lê do link: o endereço, a saída e a chamada da fila. */
export interface FollowedRoom<Seat> {
  readonly address: string
  leave(): Promise<void>
  onMove(listener: (next: Seat) => void): void
}

/** O que seguir uma sala faz fora daqui: a rede, a url, a página e a reserva guardada. */
export interface RoomFollowerPorts<Link, Seat> {
  readonly bootedArenaId: string
  readonly catalogIds: readonly string[]
  /** A rede e a voz passam a falar com a sala. */
  attach(link: Link): void
  /** A url passa a mostrar o endereço da sala. */
  showAddress(address: string): void
  /** Guarda a reserva para a página seguinte entrar com ela (`seatCarry.ts`). */
  keepSeat(seat: Seat): void
  /** Recarrega a página no mapa dado, com o endereço que a url mostra. */
  reloadInto(arenaId: string): void
  /** Ocupar o assento falhou: a entrada, ou a troca que a fila pediu. */
  onEnterFailed(reason: unknown): void
}

/**
 * Segue a sala em que se joga, e a da fila quando o servidor chamar. O mapa é
 * da sala: com outro subido, a página recarrega no dela **sem ocupar o
 * assento**, guarda a reserva e entra com ela depois. Ocupar, sair e pedir de
 * novo deixava a vaga livre no meio, e o próximo da fila a tomava. A sala da
 * reserva vai para a url antes da recarga, que entra no endereço que a url
 * mostra.
 *
 * Chamado da fila, ocupa o assento novo antes de sair da sala provisória: se a
 * troca falhar, ele continua onde estava.
 *
 * ```ts
 * const follow = createRoomFollower({ bootedArenaId, catalogIds, attach, showAddress, keepSeat, reloadInto, onEnterFailed })
 * requestSeat(url, request, delayMs).then(follow)
 * ```
 */
export function createRoomFollower<Link extends FollowedRoom<Seat>, Seat extends OfferedSeat<Link>>(
  ports: RoomFollowerPorts<Link, Seat>,
): (seat: Seat) => void {
  const enter = (seat: Seat, current?: Link): void => {
    if (reloadForRoomArena(ports, seat, current)) return
    seat
      .take()
      .then((link) => {
        void current?.leave()
        ports.showAddress(link.address)
        ports.attach(link)
        link.onMove((next) => enter(next, link))
      })
      .catch((reason) => ports.onEnterFailed(reason))
  }
  return (seat) => enter(seat)
}

/** Devolve se recarregou. */
function reloadForRoomArena<Link extends FollowedRoom<Seat>, Seat extends OfferedSeat<Link>>(
  ports: RoomFollowerPorts<Link, Seat>,
  seat: Seat,
  current: Link | undefined,
): boolean {
  const arenaId = arenaToFollow(seat.arenaId, ports.bootedArenaId, ports.catalogIds)
  if (!arenaId) return false
  console.info(
    JSON.stringify({ event: 'room.arena-reload', from: ports.bootedArenaId, to: arenaId }),
  )
  ports.keepSeat(seat)
  ports.showAddress(seat.address)
  const leaving = current ? current.leave() : Promise.resolve()
  void leaving.finally(() => ports.reloadInto(arenaId))
  return true
}
