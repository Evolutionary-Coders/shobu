import type { GameplayConfig, RoomEntryRequest } from '@shobu/core'
import { ARENA_CATALOG, type ArenaMap } from '../arena/arenaCatalog.ts'
import type { AudioMixer } from '../audio/audioMixer.ts'
import type { VoiceStage } from '../audio/spatialVoice.ts'
import { bindPushToTalk } from '../controller/pushToTalk.ts'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import { reloadIntoArena, tabStorage } from '../matchEnd/rematchWiring.ts'
import type { JsonStore } from '../settings/jsonStore.ts'
import { type CarriedOffer, type GameLink, type ReservedSeat, requestSeat } from './gameLink.ts'
import { createNetworkPort, type NetworkPort } from './networkPort.ts'
import { interpolationDelayMs } from './remotePlayerView.ts'
import { type CreatedRoom, createCreatedRoomStore, type RoomHere } from './roomEntryChoice.ts'
import { createRoomFollower } from './roomFollower.ts'
import { gameServerUrl, roomAddressInPath } from './roomLocation.ts'
import {
  createRoomSeatState,
  entryFailed,
  holdSeat,
  launchEntry,
  type RoomSeatState,
  reloadKindOf,
  roomClosed,
  roomHereOf,
  roomLeavingWithPage,
  seatTaken,
  startEntry,
} from './roomSeatState.ts'
import { type CarriedSeat, createSeatCarry, type SeatCarry } from './seatCarry.ts'
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
  /** A sala em que a página está, para escolher a entrada (`roomEntryFor`). */
  roomHere(): RoomHere
  /**
   * Entra na sala que o menu pediu (ADR 0032): sem sala, segue a que o
   * servidor reservar; já numa sala, troca para a nova só depois de ocupá-la.
   * `'stay'` fica onde está.
   */
  enterRoom(request: RoomEntryRequest | 'stay'): void
}

/** As recargas da página que a sala pede e só o boot sabe fazer. */
export interface RoomPageReloads {
  /**
   * Recarrega no mapa da sala com a entrada esperando o gesto, o CLIQUE PARA
   * ENTRAR (`rematchWiring.ts`): quem já pediu para entrar não volta ao menu.
   */
  readonly reloadForEntry: (arenaId: string) => void
}

/**
 * Liga a página à sala, sem segurar o boot: a arena roda sozinha, com os bots
 * locais, até a conexão chegar, e falha de conexão vira log, não tela de erro.
 *
 * Com um endereço na url — o link de um amigo, a fila, ou a recarga no mapa da
 * sala —, entra nele já no boot (ADR 0028). Sem endereço, espera o menu: a
 * ENTRAR pede a partida rápida e o COMEÇAR uma sala nova (`enterRoom`, ADR
 * 0032). Entrar no boot sem endereço sentava quem só olhava o menu numa sala
 * pública, e ela parecia cheia para a partida rápida.
 *
 * A url mostra o endereço da sala em que se joga só depois de entrar: é o link
 * para chamar alguém. Com a sala pedida cheia, é o da sala provisória, e muda
 * de novo quando o servidor chama da fila (CONTEXT.md, "Sala provisória").
 *
 * ```ts
 * const room = joinGameRoom(config, { arena }, audio.mixer, { reloadForEntry: rematch.switchTo })
 * room.enterRoom(roomEntryFor(ask, room.roomHere()))
 * ```
 */
export function joinGameRoom(
  config: GameplayConfig,
  scene: RoomScene,
  mixer: AudioMixer,
  reloads: RoomPageReloads,
): GameRoomLinks {
  const network = createNetworkPort()
  const voice = createVoiceSeat(mixer)
  const tab = tabStorage()
  const carry = createSeatCarry<CarriedOffer>(tab, () => Date.now())
  const created = createCreatedRoomStore(tab)
  const links = { network, voice, carry, created }
  const seating = seatInRooms(scene, links, interpolationDelayMs(config), reloads)
  const address = roomAddressInPath(window.location.pathname)
  if (address) {
    seating.enter({ kind: 'address', address, arenaId: scene.arena.id }, carry.take(address))
  }
  return { network, voice, latency: network, ...seating.controls }
}

/** O que liga a página à sala de agora: a rede, a voz, a reserva e a sala criada. */
interface RoomLinkParts {
  readonly network: NetworkPort
  readonly voice: VoiceSeat
  readonly carry: SeatCarry<CarriedOffer>
  readonly created: JsonStore<CreatedRoom | null>
}

/** A sala de agora, e o que a página sabe dela (`roomSeatState.ts`). */
type RoomSeatNow = RoomSeatState<GameLink>

/** Pedir um assento e segui-lo, e o que a página expõe da sala. */
interface RoomSeating {
  enter(request: RoomEntryRequest, carried?: CarriedSeat<CarriedOffer>): void
  readonly controls: Pick<GameRoomLinks, 'holdSeatForReload' | 'roomHere' | 'enterRoom'>
}

function seatInRooms(
  scene: RoomScene,
  links: RoomLinkParts,
  delayMs: number,
  reloads: RoomPageReloads,
): RoomSeating {
  const state: RoomSeatNow = createRoomSeatState()
  const url = gameServerUrl(window.location, GAME_SERVER_PORT)
  const follow = followRooms(scene, links, state, { url, reloads })
  leaveWithThePage(state)
  const enter = (request: RoomEntryRequest, carried?: CarriedSeat<CarriedOffer>): void => {
    if (!startEntry(state, request)) {
      console.warn(JSON.stringify({ event: 'room.entry-busy', request }))
      return
    }
    requestSeat(url, request, delayMs, carried)
      .then((seat) => follow(seat, state.room))
      .catch(failedEntry(state, request, url))
  }
  return { enter, controls: roomControls(state, links, enter) }
}

/** O que o boot e o menu fazem com a sala: entrar, perguntar onde está, segurar a vaga. */
function roomControls(
  state: RoomSeatNow,
  links: RoomLinkParts,
  enter: (request: RoomEntryRequest) => void,
): RoomSeating['controls'] {
  return {
    holdSeatForReload: () => {
      const hold = holdSeat(state)
      if (hold) links.carry.keepReconnect(hold.address, hold.token)
    },
    roomHere: () => roomHereOf(state, links.created.read()),
    enterRoom: (choice) => {
      const request = launchEntry(state, choice)
      if (request) enter(request)
    },
  }
}

/**
 * A sala em que se joga ligada à rede, à voz e à url; a anterior sai depois
 * que a nova foi ocupada. O mapa da sala manda: com outro subido, a página
 * recarrega nele — de volta ao menu se o jogador ainda não tinha entrado, ou
 * ao CLIQUE PARA ENTRAR se já tinha.
 */
function followRooms(
  scene: RoomScene,
  links: RoomLinkParts,
  state: RoomSeatNow,
  server: { readonly url: string; readonly reloads: RoomPageReloads },
): (seat: ReservedSeat, current?: GameLink) => void {
  return createRoomFollower<GameLink, ReservedSeat>({
    bootedArenaId: scene.arena.id,
    catalogIds: ARENA_CATALOG.map((map) => map.id),
    attach: (link) => attachRoom(state, links, link),
    showAddress: (address) => {
      window.history.replaceState(null, '', `/${address}${window.location.search}`)
    },
    keepSeat: (seat) => {
      if (seat.offer) links.carry.keep(seat.offer)
    },
    reloadInto: (arenaId) =>
      reloadKindOf(state) === 'entry'
        ? server.reloads.reloadForEntry(arenaId)
        : reloadIntoArena(arenaId),
    onEnterFailed: failedEntry(state, undefined, server.url),
  })
}

/**
 * A sala ocupada passa a ser a de agora: a rede e a voz falam com ela, a sala
 * que o pedido criou fica guardada na aba, e o fechamento dela — o servidor
 * fechou, a conexão caiu — deixa a página sem sala e a url sem o endereço
 * dela, para a ENTRAR seguinte, ou o F5, pedir outra (`roomClosed`).
 */
function attachRoom(state: RoomSeatNow, links: RoomLinkParts, link: GameLink): void {
  const created = seatTaken(state, link)
  if (created) links.created.write(created)
  link.onClose(() => {
    const shown = roomAddressInPath(window.location.pathname)
    if (roomClosed(state, link, shown)) {
      window.history.replaceState(null, '', `/${window.location.search}`)
    }
  })
  links.network.attach(link)
  links.voice.follow(link)
  logJoined(link)
}

/**
 * A sala de agora sai junto com a página, a menos que a vaga tenha sido
 * segurada para a recarga no mapa novo: sair ali é saída pedida, e a sala
 * soltaria a vaga na hora (ADR 0031).
 */
function leaveWithThePage(state: RoomSeatNow): void {
  window.addEventListener('pagehide', () => {
    void roomLeavingWithPage(state)?.leave()
  })
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

function logJoined(link: GameLink): void {
  const { address, sessionId } = link
  console.info(JSON.stringify({ event: 'room.joined', address, sessionId }))
}

/**
 * O pedido ou a troca que falhou: a página fica sem pedido em voo, e a ENTRAR
 * seguinte pode pedir de novo. O log diz o que foi pedido.
 */
function failedEntry(
  state: RoomSeatNow,
  request: RoomEntryRequest | undefined,
  url: string,
): (reason: unknown) => void {
  return (reason) => {
    entryFailed(state)
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(JSON.stringify({ event: 'room.join-failed', request, url, message }))
  }
}
