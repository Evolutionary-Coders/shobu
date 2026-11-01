import type { RoomEntryRequest, RoomVisibility } from '@shobu/core'
import { type CreatedRoom, createdRoomHere, type RoomHere } from './roomEntryChoice.ts'

/** O que o estado lê da sala ocupada: o endereço e o token da volta. */
export interface SeatedRoom {
  readonly address: string
  readonly reconnectionToken: string
}

/**
 * A sala de agora, e o que a página sabe dela, sem a rede: o adapter
 * (`joinGameRoom.ts`) pede o assento e liga a sala, e cada decisão sobre o
 * pedido, a recarga e a saída sai daqui.
 */
export interface RoomSeatState<Room extends SeatedRoom> {
  room: Room | undefined
  /** Um pedido de assento em voo, do pedido até ocupar ou falhar. */
  asking: boolean
  /** A visibilidade da sala que o pedido em voo cria, para guardá-la ao ocupar. */
  creating: RoomVisibility | undefined
  /** O jogador já pediu para entrar: a recarga no mapa da sala volta ao CLIQUE PARA ENTRAR. */
  launched: boolean
  /** A vaga foi segurada para a recarga no mapa do voto: sair com a página não solta. */
  held: boolean
}

/**
 * ```ts
 * const state = createRoomSeatState<GameLink>()
 * ```
 */
export function createRoomSeatState<Room extends SeatedRoom>(): RoomSeatState<Room> {
  return { room: undefined, asking: false, creating: undefined, launched: false, held: false }
}

/**
 * O pedido saiu: fica em voo, e lembra a visibilidade da sala que ele cria.
 *
 * ```ts
 * startEntry(state, { kind: 'create', visibility: 'private', arenaId })
 * ```
 */
export function startEntry<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
  request: RoomEntryRequest,
): void {
  state.asking = true
  state.creating = request.kind === 'create' ? request.visibility : undefined
}

/**
 * A sala ocupada passa a ser a de agora. Devolve a sala que o pedido criou,
 * para a aba guardar (`createCreatedRoomStore`), ou `undefined` se ele não
 * criou nenhuma.
 *
 * ```ts
 * const created = seatTaken(state, link)
 * if (created) store.write(created)
 * ```
 */
export function seatTaken<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
  room: Room,
): CreatedRoom | undefined {
  const visibility = state.creating
  state.room = room
  state.asking = false
  state.creating = undefined
  return visibility ? { address: room.address, visibility } : undefined
}

/** O pedido ou a troca falhou: a página fica sem pedido em voo, e a ENTRAR seguinte pede de novo. */
export function entryFailed<Room extends SeatedRoom>(state: RoomSeatState<Room>): void {
  state.asking = false
  state.creating = undefined
}

/**
 * A sala fechou — o servidor fechou, a conexão caiu. Só a de agora deixa a
 * página sem sala; a anterior, que a troca de sala deixou, não muda nada.
 *
 * ```ts
 * link.onClose(() => roomClosed(state, link))
 * ```
 */
export function roomClosed<Room extends SeatedRoom>(state: RoomSeatState<Room>, room: Room): void {
  if (state.room === room) state.room = undefined
}

/**
 * A sala em que a página está, para escolher a entrada (`roomEntryFor`): o
 * pedido em voo conta como sala.
 *
 * ```ts
 * roomEntryFor(ask, roomHereOf(state, createdStore.read()))
 * ```
 */
export function roomHereOf<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
  created: CreatedRoom | null,
): RoomHere {
  return {
    joined: state.asking || state.room !== undefined,
    createdHere: createdRoomHere(created, state.room?.address),
  }
}

/**
 * O jogador pediu para entrar: a partir daqui a recarga no mapa da sala volta
 * ao CLIQUE PARA ENTRAR. Devolve o pedido a fazer, ou `undefined` para ficar.
 *
 * ```ts
 * const request = launchEntry(state, roomEntryFor(ask, here))
 * if (request) enter(request)
 * ```
 */
export function launchEntry<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
  request: RoomEntryRequest | 'stay',
): RoomEntryRequest | undefined {
  state.launched = true
  return request === 'stay' ? undefined : request
}

/**
 * Como recarregar no mapa da sala: de volta ao CLIQUE PARA ENTRAR (`'entry'`)
 * se o jogador já tinha pedido para entrar, ou ao menu (`'menu'`) se não.
 *
 * ```ts
 * reloadKindOf(state) === 'entry' ? reloads.reloadForEntry(arenaId) : reloadIntoArena(arenaId)
 * ```
 */
export function reloadKindOf<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
): 'entry' | 'menu' {
  return state.launched ? 'entry' : 'menu'
}

/**
 * Segura a vaga para a recarga no mapa do voto (ADR 0031): devolve o endereço
 * e o token para a aba guardar, e a saída da página deixa de sair da sala.
 * Sem sala, não há vaga a segurar.
 *
 * ```ts
 * const hold = holdSeat(state)
 * if (hold) carry.keepReconnect(hold.address, hold.token)
 * ```
 */
export function holdSeat<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
): { readonly address: string; readonly token: string } | undefined {
  const { room } = state
  if (!room) return undefined
  state.held = true
  return { address: room.address, token: room.reconnectionToken }
}

/**
 * A sala que sai junto com a página, ou `undefined`: com a vaga segurada,
 * sair ali é saída pedida, e a sala soltaria a vaga na hora.
 *
 * ```ts
 * window.addEventListener('pagehide', () => void roomLeavingWithPage(state)?.leave())
 * ```
 */
export function roomLeavingWithPage<Room extends SeatedRoom>(
  state: RoomSeatState<Room>,
): Room | undefined {
  return state.held ? undefined : state.room
}
