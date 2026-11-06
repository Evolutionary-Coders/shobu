import { type HumanSkinId, isHumanSkin, isSniperFinishId } from '../cosmetics/competitorLook.ts'
import { sanitizeProfileName } from '../match/profileName.ts'
import { parseDeviceKey } from '../wire/kickVoteWire.ts'
import { parseRoomAddress } from './roomAddress.ts'

/**
 * O matchmaking pela URL, no fio: o cliente pede a entrada pelo endereço numa
 * rota HTTP do servidor de jogo, e recebe o assento reservado na sala em que
 * vai jogar. Com a sala pedida cheia, essa é a sala provisória, e o servidor
 * manda outro assento, na sala pedida, quando a vaga abre (CONTEXT.md, "Fila
 * da sala").
 */
export const ROOM_ENTRY_PATH = '/rooms/enter'

/**
 * Quanto um assento reservado espera o jogador chegar, o padrão do colyseus,
 * fixado porque o matchmaking confere a fila de novo quando ele vence, e o
 * cliente que recarrega a página carrega a reserva só enquanto ela vale.
 */
export const SEAT_RESERVATION_S = 15

/**
 * Quanto a vaga segurada para a recarga no mapa novo (ADR 0031) ainda espera
 * depois que a partida começa valendo. A recarga baixa o mapa novo, e em
 * máquina fraca ou wi-fi de feira passa do aquecimento; dez segundos cobrem a
 * cauda dela. Mais que isso é um lugar morto sem bot na partida valendo, que
 * os outros três jogam em desvantagem, e a sala parece cheia para a partida
 * rápida (o assento reservado conta na lotação do colyseus).
 */
export const MAP_RELOAD_LIVE_GRACE_S = 10

/**
 * Quanto a vaga de quem recarrega a página no mapa que o voto trocou espera a
 * volta, contado da troca: o aquecimento inteiro e mais `MAP_RELOAD_LIVE_GRACE_S`
 * da partida valendo. Derivado do aquecimento, e não fixo: com 45 s fixos e
 * o aquecimento de 12 s, a vaga vazia atravessava 33 s de partida valendo.
 *
 * ```ts
 * mapReloadHoldS({ warmupS: 12 }) // 22
 * ```
 */
export function mapReloadHoldS(match: { readonly warmupS: number }): number {
  return match.warmupS + MAP_RELOAD_LIVE_GRACE_S
}

/** Do servidor para quem está na fila: a vaga abriu, e o assento já está reservado. */
export const ROOM_MOVE_MESSAGE = 'room.move'

/**
 * Um assento reservado e o endereço da sala dele, que é o que a URL passa a
 * mostrar. A reserva é a do colyseus; o núcleo não a conhece por dentro.
 */
export interface SeatOffer<Reservation> {
  readonly reservation: Reservation
  readonly address: string
  /**
   * O mapa da sala (`ArenaLayout.id`). O mapa é da sala, não de quem entra: o
   * servidor simula nele, e o cliente que subiu outro recarrega neste.
   */
  readonly arenaId: string
  /**
   * O endereço pedido que recusou este aparelho, por banimento da sala
   * (ADR 0034): a entrada foi desviada para a partida rápida, e o menu diz
   * por quê. Ausente na entrada normal.
   */
  readonly refusedAddress?: string
}

/**
 * Do servidor para quem acabou de entrar: o token de acesso à sala de voz, assinado
 * com a chave do servidor de mídia. Só o servidor de jogo emite, então só quem joga
 * na sala fala nela (ADR 0026). Sem servidor de mídia configurado, não chega.
 */
export const VOICE_TICKET_MESSAGE = 'voice.ticket'

export interface VoiceTicket {
  readonly token: string
}

/**
 * Quem pode cair numa sala sem o link dela. A pública é a que a partida
 * rápida completa; a privada só recebe quem abre o endereço, e nunca serve de
 * sala provisória para a fila de outra. A visibilidade nasce com a sala e não
 * muda: o voto troca o mapa, não quem pode entrar.
 */
export type RoomVisibility = 'public' | 'private'

/**
 * O corpo de `POST /rooms/enter`:
 * - `address`: o endereço da URL. Entra na sala dele, cria a sala, ou põe na
 *   fila dela (ADR 0028). Ignora a visibilidade: o link é o convite.
 * - `quick`: a partida rápida, sem endereço. O servidor escolhe a sala pública
 *   mais cheia com vaga, ou cria uma.
 * - `create`: NOVA PARTIDA. Sempre uma sala nova, pública ou privada.
 *
 * `arenaId` é o mapa que o cliente subiu, em texto: o servidor confere no
 * catálogo e, fora dele, usa o padrão.
 */
export type RoomEntryRequest =
  | { readonly kind: 'address'; readonly address: string; readonly arenaId: string }
  | { readonly kind: 'quick'; readonly arenaId: string }
  | { readonly kind: 'create'; readonly visibility: RoomVisibility; readonly arenaId: string }

/**
 * O pedido de entrada que veio da rede, ou `undefined` se ele não é nenhuma
 * das três formas. Um corpo com `address` e sem `kind` é a entrada por
 * endereço: é o que a página de antes desta mudança manda, e uma aba aberta
 * de antes dela continua entrando. O endereço sai na forma canônica.
 *
 * ```ts
 * parseRoomEntryRequest({ kind: 'quick', arenaId: 'neon-kaido' }) // { kind: 'quick', arenaId: 'neon-kaido' }
 * parseRoomEntryRequest({ address: '10.0.0.07' }) // { kind: 'address', address: '10.0.0.7', arenaId: '' }
 * ```
 */
export function parseRoomEntryRequest(body: unknown): RoomEntryRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const fields = body as Record<string, unknown>
  const arenaId = typeof fields.arenaId === 'string' ? fields.arenaId : ''
  const kind = fields.kind ?? ('address' in fields ? 'address' : undefined)
  if (kind === 'quick') return { kind, arenaId }
  if (kind === 'create') return createRequestOf(fields.visibility, arenaId)
  if (kind === 'address') return addressRequestOf(fields.address, arenaId)
  return undefined
}

/**
 * O nome de perfil que vem junto do pedido de entrada, já limpo, ou `''`
 * sem nome. Vai nas opções do assento reservado, e a sala nomeia a vaga na
 * entrada: só pela mensagem (`CALLSIGN_MESSAGE`), que chega depois do
 * `onJoin`, a vaga nova aparecia como AGENTE para os outros por um instante.
 *
 * ```ts
 * entryCallsignOf({ kind: 'quick', arenaId: 'neon-kaido', callsign: ' raiden ' }) // 'RAIDEN'
 * ```
 */
export function entryCallsignOf(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  return sanitizeProfileName((body as { callsign?: unknown }).callsign)
}

/**
 * A chave do aparelho que vem junto do pedido de entrada (`parseDeviceKey`),
 * ou `''`: a página guardada no cache de antes do voto de expulsão não manda
 * nenhuma, e esse jogador nunca é banido.
 *
 * ```ts
 * entryDeviceKeyOf({ kind: 'quick', arenaId: '', deviceKey: '3f1c2b8e-9a7d-4c1e' }) // '3f1c2b8e-9a7d-4c1e'
 * ```
 */
export function entryDeviceKeyOf(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  return parseDeviceKey((body as { deviceKey?: unknown }).deviceKey)
}

/** O visual que vem com o pedido de entrada: só o que vale, campo a campo. */
export interface EntryLook {
  readonly characterSkin?: HumanSkinId
  readonly sniperFinish?: string
}

/**
 * A skin e o acabamento que vêm junto do pedido de entrada, cada um só se
 * for válido (`isHumanSkin`, `isSniperFinishId`). Vão nas opções do assento,
 * como o nome: só pela mensagem, a vaga nova aparecia com o corpo padrão
 * para os outros até ela chegar.
 *
 * ```ts
 * entryLookOf({ kind: 'quick', arenaId: 'neon-kaido', characterSkin: 'vex', sniperFinish: 'carbono' })
 * // { characterSkin: 'vex', sniperFinish: 'carbono' }
 * ```
 */
export function entryLookOf(body: unknown): EntryLook {
  if (typeof body !== 'object' || body === null) return {}
  const { characterSkin, sniperFinish } = body as Record<string, unknown>
  return {
    ...(isHumanSkin(characterSkin) ? { characterSkin } : {}),
    ...(isSniperFinishId(sniperFinish) ? { sniperFinish } : {}),
  }
}

function createRequestOf(visibility: unknown, arenaId: string): RoomEntryRequest | undefined {
  if (visibility !== 'public' && visibility !== 'private') return undefined
  return { kind: 'create', visibility, arenaId }
}

function addressRequestOf(text: unknown, arenaId: string): RoomEntryRequest | undefined {
  const address = typeof text === 'string' ? parseRoomAddress(text) : undefined
  return address === undefined ? undefined : { kind: 'address', address, arenaId }
}
