import type { RoomEntryRequest, RoomVisibility } from '@shobu/core'
import type { MenuAction } from '../menu/mainMenuModel.ts'
import { createJsonStore, type JsonStore, type SettingsStorage } from '../settings/jsonStore.ts'

/** A entrada que o menu pediu: a ação, a PRIVADA da NOVA PARTIDA e o mapa que a cena subiu. */
export interface RoomEntryAsk {
  readonly action: MenuAction
  readonly privateRoom: boolean
  /** O BOTS da NOVA PARTIDA: a sala que o COMEÇAR cria senta no máximo esses. */
  readonly botCount: number
  readonly arenaId: string
  /** A entrada vem do CLIQUE PARA ENTRAR, depois de uma recarga (`rematch.ts`). */
  readonly fromRematch: boolean
}

/** A sala em que a página já está, do ponto de vista de quem escolhe a entrada. */
export interface RoomHere {
  /** Há uma sala, ou um pedido de assento em voo. */
  readonly joined: boolean
  /** A visibilidade com que esta aba criou a sala em que está; `undefined` se não a criou. */
  readonly createdHere: RoomVisibility | undefined
}

/**
 * O pedido de entrada que a ação do menu faz ao servidor, ou `'stay'` para
 * ficar na sala em que já está (ADR 0032):
 *
 * - ENTRAR e o VR: a partida rápida, mas só sem sala. Quem abriu o link de
 *   um amigo, ou está numa sala privada, não é tirado dela.
 * - COMEÇAR: uma sala nova, pública ou privada pela PRIVADA, com o BOTS da
 *   NOVA PARTIDA, a menos que a aba já esteja numa que ela criou com a mesma
 *   visibilidade.
 * - TREINO: uma sala privada só dele, com os bots, pela mesma regra do
 *   COMEÇAR. Treinar na partida rápida punha o treino na partida de
 *   estranhos.
 * - Depois de uma recarga (voto, mapa da sala), a página já voltou à sala no
 *   boot: fica nela. Sem sala, a recarga veio de um COMEÇAR que pediu sala
 *   nova, e a ação vale como sempre.
 *
 * ```ts
 * roomEntryFor({ action: 'deploy', privateRoom: false, botCount: 3, arenaId: 'neon-kaido', fromRematch: false }, { joined: false, createdHere: undefined })
 * // { kind: 'quick', arenaId: 'neon-kaido' }
 * ```
 */
export function roomEntryFor(ask: RoomEntryAsk, here: RoomHere): RoomEntryRequest | 'stay' {
  if (!ENTERING_ACTIONS.includes(ask.action)) return 'stay'
  if (ask.fromRematch && here.joined) return 'stay'
  if (ask.action === 'deploy-match') {
    return ownRoomEntry({ privateRoom: ask.privateRoom, botCount: ask.botCount }, ask, here)
  }
  // o TREINO completa a sala, como a `QUICK_MATCH` que ele joga offline.
  if (ask.action === 'train') return ownRoomEntry({ privateRoom: true }, ask, here)
  return here.joined ? 'stay' : { kind: 'quick', arenaId: ask.arenaId }
}

/** O COMEÇAR e o TREINO: a sala que a aba já criou com a mesma visibilidade, ou uma nova. */
function ownRoomEntry(
  room: { readonly privateRoom: boolean; readonly botCount?: number },
  ask: RoomEntryAsk,
  here: RoomHere,
): RoomEntryRequest | 'stay' {
  const visibility: RoomVisibility = room.privateRoom ? 'private' : 'public'
  if (here.joined && here.createdHere === visibility) return 'stay'
  const bots = room.botCount === undefined ? {} : { botCount: room.botCount }
  return { kind: 'create', visibility, arenaId: ask.arenaId, ...bots }
}

const ENTERING_ACTIONS: readonly MenuAction[] = [
  'deploy',
  'deploy-match',
  'deploy-headset',
  'train',
]

/** A sala que esta aba criou pela NOVA PARTIDA, guardada na aba: sobrevive à recarga. */
export interface CreatedRoom {
  readonly address: string
  readonly visibility: RoomVisibility
}

/** Onde a sala criada pela aba fica guardada. Na aba, não no navegador. */
export const CREATED_ROOM_KEY = 'shobu.createdRoom'

/**
 * A sala criada guardada, ou `null` quando o que estava lá não é uma:
 * armazenamento é entrada de fora.
 *
 * ```ts
 * parseCreatedRoom({ address: '93.184.216.34', visibility: 'private' }) // a mesma sala
 * ```
 */
export function parseCreatedRoom(raw: unknown): CreatedRoom | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { address, visibility } = raw as Record<string, unknown>
  if (typeof address !== 'string') return null
  if (visibility !== 'public' && visibility !== 'private') return null
  return { address, visibility }
}

/**
 * A visibilidade com que a aba criou a sala em que está. Uma sala criada antes,
 * de onde a aba já saiu, não conta: COMEÇAR ali tem que criar outra.
 *
 * ```ts
 * createdRoomHere({ address: '93.184.216.34', visibility: 'public' }, '93.184.216.34') // 'public'
 * ```
 */
export function createdRoomHere(
  created: CreatedRoom | null,
  currentAddress: string | undefined,
): RoomVisibility | undefined {
  return created && created.address === currentAddress ? created.visibility : undefined
}

/**
 * ```ts
 * createCreatedRoomStore(tabStorage()).write({ address: link.address, visibility: 'private' })
 * ```
 */
export function createCreatedRoomStore(storage: SettingsStorage): JsonStore<CreatedRoom | null> {
  return createJsonStore(storage, CREATED_ROOM_KEY, parseCreatedRoom)
}
