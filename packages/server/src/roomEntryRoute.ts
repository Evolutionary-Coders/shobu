import type { RoomEntryRequest, RoomVisibility, SeatOffer } from '@shobu/core'
import { type RoomStanding, rankQuickMatchRooms } from './quickMatch.ts'
import { enqueueWaiter, planEntry, type RoomDirectory, seatTargetOf } from './roomDirectory.ts'

/** O que a reserva de assento precisa ter para a fila: quem é e em que sala. */
export interface ReservedSeatRef {
  readonly sessionId: string
  readonly roomId: string
}

/**
 * O que o caminho da entrada pede de fora: reservar, criar, sortear endereço,
 * ler as vagas e a situação de cada sala. O adapter (`matchmaking.ts`) liga
 * isto ao colyseus; o teste, a uma sala de mentira.
 */
export interface SeatSource<Reservation extends ReservedSeatRef> {
  /** Reserva um assento na sala aberta deste endereço; rejeita se ela não aceitar. */
  reserveIn(address: string): Promise<Reservation>
  /** Cria a sala neste endereço e reserva o primeiro assento nela. */
  createAndReserve(
    address: string,
    arenaId: string,
    visibility: RoomVisibility,
  ): Promise<Reservation>
  drawFreeAddress(): string
  hasVacancy(address: string): boolean
  /** A situação da sala para a partida rápida; `undefined` nascendo ou fechando. */
  standingOf(address: string): RoomStanding | undefined
  /** O mapa da sala no registro do matchmaking (`roomArenas.ts`): muda só na partida seguinte. */
  registeredArenaOf(address: string): string
  /** Se quem pede está banido da sala deste endereço (ADR 0034); ligado a um pedido. */
  isBanned(address: string): boolean
  /** A chave do aparelho de quem pede, que vai com ele para a fila; `''` sem ela. */
  readonly deviceKey: string
  log(event: Readonly<Record<string, unknown>>): void
}

/**
 * O pedido de entrada levado ao assento oferecido (ADR 0032): pelo endereço,
 * pela partida rápida, ou numa sala nova. Roda dentro da fila única do
 * matchmaking: o que ele lê do diretório ainda vale quando reserva.
 *
 * ```ts
 * const offer = await routeRoomEntry(directory, source, { kind: 'quick', arenaId }, wanted)
 * ```
 */
export function routeRoomEntry<Reservation extends ReservedSeatRef>(
  directory: RoomDirectory,
  source: SeatSource<Reservation>,
  request: RoomEntryRequest,
  wanted: string,
): Promise<SeatOffer<Reservation>> {
  if (request.kind === 'address') {
    if (source.isBanned(request.address))
      return enterAround(directory, source, request.address, wanted)
    return enterAddress(directory, source, request.address, wanted)
  }
  if (request.kind === 'quick') return enterQuick(directory, source, wanted)
  return enterNewRoom(source, request.visibility, wanted)
}

/** Pelo endereço da URL, como no ADR 0028: a sala dele, a criação dela, ou a fila. */
async function enterAddress<Reservation extends ReservedSeatRef>(
  directory: RoomDirectory,
  source: SeatSource<Reservation>,
  address: string,
  wanted: string,
): Promise<SeatOffer<Reservation>> {
  const plan = planEntry(directory, address, (candidate) => welcomes(source, candidate))
  const target = seatTargetOf(plan, () => source.drawFreeAddress())
  const reservation = await (target.create
    ? source.createAndReserve(target.address, wanted, 'public')
    : source.reserveIn(target.address))
  if (target.queued) {
    const { sessionId, roomId } = reservation
    enqueueWaiter(directory, address, { sessionId, roomId, deviceKey: source.deviceKey })
  }
  return offerAt(source, target.address, reservation)
}

/**
 * O endereço pedido baniu este aparelho: a partida rápida, que já pula a
 * sala, com o endereço recusado na oferta para o menu dizer por quê. Um 403
 * aqui cairia na entrada falha calada do cliente, e o jogador ficaria jogando
 * offline sem saber.
 */
async function enterAround<Reservation extends ReservedSeatRef>(
  directory: RoomDirectory,
  source: SeatSource<Reservation>,
  refusedAddress: string,
  wanted: string,
): Promise<SeatOffer<Reservation>> {
  source.log({ event: 'room.banned-entry', address: refusedAddress })
  const offer = await enterQuick(directory, source, wanted)
  return { ...offer, refusedAddress }
}

/** A sala tem vaga para quem pede: aberta, com lugar, e sem banir este aparelho. */
function welcomes<Reservation extends ReservedSeatRef>(
  source: SeatSource<Reservation>,
  address: string,
): boolean {
  return !source.isBanned(address) && source.hasVacancy(address)
}

/**
 * A partida rápida: a primeira sala pública da ordem de `rankQuickMatchRooms`
 * que aceitar a reserva, ou uma sala pública nova. A ordem é tirada dentro da
 * fila única, então a vaga que ela viu ainda é vaga; uma sala que fecha no
 * meio da reserva falha nela, e a próxima é tentada.
 */
async function enterQuick<Reservation extends ReservedSeatRef>(
  directory: RoomDirectory,
  source: SeatSource<Reservation>,
  wanted: string,
): Promise<SeatOffer<Reservation>> {
  const ranked = rankQuickMatchRooms(
    directory,
    (address) => source.standingOf(address),
    (address) => welcomes(source, address),
    wanted,
  )
  for (const [rank, address] of ranked.entries()) {
    const reservation = await source.reserveIn(address).catch((error: unknown) => {
      source.log({ event: 'room.quick-skip', address, error: String(error) })
      return undefined
    })
    if (!reservation) continue
    source.log({ event: 'room.quick-match', address, rank, created: false })
    return offerAt(source, address, reservation)
  }
  const offer = await enterNewRoom(source, 'public', wanted)
  source.log({ event: 'room.quick-match', address: offer.address, created: true })
  return offer
}

/** NOVA PARTIDA, e a partida rápida sem sala com vaga: uma sala nova num endereço livre. */
async function enterNewRoom<Reservation extends ReservedSeatRef>(
  source: SeatSource<Reservation>,
  visibility: RoomVisibility,
  wanted: string,
): Promise<SeatOffer<Reservation>> {
  const address = source.drawFreeAddress()
  const reservation = await source.createAndReserve(address, wanted, visibility)
  return offerAt(source, address, reservation)
}

/**
 * O assento reservado, com o endereço que a url vai mostrar e o mapa que a
 * página tem de subir. O mapa vem da situação da sala, que, com o voto
 * fechado, já é o da partida seguinte (`roomStandingOf`); o registro só troca
 * na partida seguinte, e quem entrasse ali subiria o mapa que a sala está
 * deixando. Sem situação (a sala nascendo), vale o registro.
 *
 * ```ts
 * client.send(ROOM_MOVE_MESSAGE, offerAt(source, address, await source.reserveIn(address)))
 * ```
 */
export function offerAt<Reservation extends ReservedSeatRef>(
  source: Pick<SeatSource<Reservation>, 'standingOf' | 'registeredArenaOf'>,
  address: string,
  reservation: Reservation,
): SeatOffer<Reservation> {
  const arenaId = source.standingOf(address)?.arenaId ?? source.registeredArenaOf(address)
  return { reservation, address, arenaId }
}
