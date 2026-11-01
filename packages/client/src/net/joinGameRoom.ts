import type { GameplayConfig } from '@shobu/core'
import { ARENA_CATALOG, type ArenaMap } from '../arena/arenaCatalog.ts'
import type { AudioMixer } from '../audio/audioMixer.ts'
import type { VoiceStage } from '../audio/spatialVoice.ts'
import { bindPushToTalk } from '../controller/pushToTalk.ts'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import { reloadIntoArena, tabStorage } from '../matchEnd/rematchWiring.ts'
import { type CarriedOffer, type GameLink, type ReservedSeat, requestSeat } from './gameLink.ts'
import { createNetworkPort, type NetworkPort } from './networkPort.ts'
import { interpolationDelayMs } from './remotePlayerView.ts'
import { createRoomFollower } from './roomFollower.ts'
import { gameServerUrl, resolveRoomAddress } from './roomLocation.ts'
import { createSeatCarry, type SeatCarry } from './seatCarry.ts'
import { openVoiceLink, type VoiceLink } from './voiceLink.ts'

/** A porta do servidor de jogo, a da Tabela 1 de `docs/rede/arquitetura-de-rede.md`. */
export const GAME_SERVER_PORT = 2567

/** A sinalização do servidor de mídia, a da Tabela 1. */
const MEDIA_SERVER_PORT = 7880

/** A sala, do lado da cena: o canal de jogo e onde cada voz soa. */
export interface GameRoomLinks {
  readonly network: NetworkPort
  readonly voice: VoiceStage
  /** O ping da tela (ADR 0015): o ida e volta da sala. */
  readonly latency: LatencySource
  /**
   * O voto trocou o mapa da sala (ADR 0031): guarda a volta à vaga pelo token
   * de reconexão, e a saída da página deixa de sair da sala — a recarga no
   * mapa novo cai, e a sala segura a vaga pela janela da reserva. Chamar
   * antes de recarregar.
   */
  holdSeatForReload(): void
}

/**
 * Entra na sala do endereço da url, sem segurar o boot: a arena roda sozinha,
 * com os bots locais, até a conexão chegar, e falha de conexão vira log, não
 * tela de erro. A url mostra o endereço da sala em que se joga, que é o link
 * para chamar alguém: com a sala pedida cheia, é o da sala provisória, e muda
 * de novo quando o servidor chama da fila (CONTEXT.md, "Sala provisória").
 *
 * ```ts
 * const room = joinGameRoom(config, { arena }, audio.mixer)
 * createBabylonArenaRenderer({ ...options, ...room })
 * ```
 */
export function joinGameRoom(
  config: GameplayConfig,
  scene: RoomScene,
  mixer: AudioMixer,
): GameRoomLinks {
  const network = createNetworkPort()
  const voice = createVoiceSeat(mixer)
  const room = showRoomAddress()
  const url = gameServerUrl(window.location, GAME_SERVER_PORT)
  const carry = createSeatCarry<CarriedOffer>(tabStorage(), () => Date.now())
  const { follow, holdSeatForReload } = followRooms(
    scene,
    { network, voice, carry },
    room.address,
    url,
  )
  const request = { address: room.address, arenaId: scene.arena.id }
  requestSeat(url, request, interpolationDelayMs(config), carry.take(room.address))
    .then(follow)
    .catch(logJoinFailure(room.address, url))
  return { network, voice, latency: network, holdSeatForReload }
}

/**
 * A sala em que se joga ligada à rede, à voz e à url; a anterior sai junto com
 * a página, menos quando a página recarrega no mapa que o voto escolheu: sair
 * ali é saída pedida, e a sala soltaria a vaga na hora (ADR 0031).
 */
function followRooms(
  scene: RoomScene,
  links: {
    readonly network: NetworkPort
    readonly voice: VoiceSeat
    readonly carry: SeatCarry<CarriedOffer>
  },
  requested: string,
  url: string,
): { follow: (seat: ReservedSeat) => void; holdSeatForReload: () => void } {
  const { current, holdSeatForReload } = leaveWithThePage(links.carry)
  const follow = createRoomFollower<GameLink, ReservedSeat>({
    bootedArenaId: scene.arena.id,
    catalogIds: ARENA_CATALOG.map((map) => map.id),
    attach: (link) => {
      current.link = link
      links.network.attach(link)
      links.voice.follow(link)
      logJoined(link, requested)
    },
    showAddress: (address) => {
      window.history.replaceState(null, '', `/${address}${window.location.search}`)
    },
    keepSeat: (seat) => {
      if (seat.offer) links.carry.keep(seat.offer)
    },
    reloadInto: reloadIntoArena,
    onEnterFailed: logJoinFailure(requested, url),
  })
  return { follow, holdSeatForReload }
}

/**
 * A sala de agora sai junto com a página, a menos que a vaga tenha sido
 * segurada para a recarga no mapa novo.
 */
function leaveWithThePage(carry: SeatCarry<CarriedOffer>): {
  readonly current: { link: GameLink | undefined }
  readonly holdSeatForReload: () => void
} {
  const current: { link: GameLink | undefined; held: boolean } = { link: undefined, held: false }
  window.addEventListener('pagehide', () => {
    if (!current.held) void current.link?.leave()
  })
  const holdSeatForReload = (): void => {
    const { link } = current
    if (!link) return
    current.held = true
    carry.keepReconnect(link.address, link.reconnectionToken)
  }
  return { current, holdSeatForReload }
}

/** O endereço da url, ou um sorteado sem ele, e a url passa a mostrá-lo. */
function showRoomAddress(): ReturnType<typeof resolveRoomAddress> {
  const room = resolveRoomAddress(window.location.pathname, randomUint32)
  window.history.replaceState(null, '', `${room.path}${window.location.search}`)
  return room
}

/** O que a cena subiu e a sala precisa saber: o mapa. A lâmina vai pela sessão (`announceMelee`). */
export interface RoomScene {
  readonly arena: ArenaMap
}

/** O canal de voz da sala em que se joga, trocado junto com ela. */
interface VoiceSeat extends VoiceStage {
  follow(link: GameLink): void
}

/**
 * A voz acompanha a sala de jogo: cada sala tem a sua, e quem troca de sala
 * sai da voz antiga. Sem token, ou com falha, o jogo segue sem voz (ADR 0026).
 * As vozes tocam no mixer, no canal de voz.
 */
function createVoiceSeat(mixer: AudioMixer): VoiceSeat {
  const url = gameServerUrl(window.location, MEDIA_SERVER_PORT)
  const seat: { voice: VoiceLink | undefined } = { voice: undefined }
  bindPushToTalk(window, (on) => seat.voice?.talk(on))
  window.addEventListener('pagehide', () => seat.voice?.leave())
  return {
    placeSpeaker: (playerId, mouthM) => mixer.placeVoice(playerId, mouthM),
    follow: (link) => {
      seat.voice?.leave()
      seat.voice = undefined
      link.onVoiceTicket((ticket) => {
        openVoiceLink(url, ticket.token, mixer)
          .then((opened) => {
            seat.voice = opened
          })
          .catch(logVoiceFailure(url))
      })
    },
  }
}

function logVoiceFailure(url: string): (reason: unknown) => void {
  return (reason) => {
    console.warn(JSON.stringify({ event: 'voice.join-failed', url, message: String(reason) }))
  }
}

function logJoined(link: GameLink, requested: string): void {
  const { address, sessionId } = link
  console.info(JSON.stringify({ event: 'room.joined', address, requested, sessionId }))
}

function logJoinFailure(address: string, url: string): (reason: unknown) => void {
  return (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(JSON.stringify({ event: 'room.join-failed', address, url, message }))
  }
}

function randomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
}
