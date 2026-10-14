import type { GameplayConfig, MeleeWeapon } from '@shobu/core'
import { ARENA_CATALOG, type ArenaMap } from '../arena/arenaCatalog.ts'
import type { VoiceStage } from '../audio/spatialVoice.ts'
import { bindPushToTalk } from '../controller/pushToTalk.ts'
import { reloadIntoArena } from '../matchEnd/rematchWiring.ts'
import { type GameLink, openGameLink } from './gameLink.ts'
import { createNetworkPort, type NetworkPort } from './networkPort.ts'
import { interpolationDelayMs } from './remotePlayerView.ts'
import { arenaToFollow } from './roomArena.ts'
import { gameServerUrl, resolveRoomAddress } from './roomLocation.ts'
import { openVoiceLink, type VoiceLink } from './voiceLink.ts'

/** A porta do servidor de jogo, a da Tabela 1 de `docs/rede/arquitetura-de-rede.md`. */
const GAME_SERVER_PORT = 2567

/** A sinalização do servidor de mídia, a da Tabela 1. */
const MEDIA_SERVER_PORT = 7880

/** A sala, do lado da cena: o canal de jogo e onde cada voz soa. */
export interface GameRoomLinks {
  readonly network: NetworkPort
  readonly voice: VoiceStage
}

/**
 * Entra na sala do endereço da url, sem segurar o boot: a arena roda sozinha,
 * com os bots locais, até a conexão chegar, e falha de conexão vira log, não
 * tela de erro. A url mostra o endereço da sala em que se joga, que é o link
 * para chamar alguém: com a sala pedida cheia, é o da sala provisória, e muda
 * de novo quando o servidor chama da fila (CONTEXT.md, "Sala provisória").
 *
 * ```ts
 * const room = joinGameRoom(config, { meleeWeapon: kit.meleeWeapon, arena })
 * createBabylonArenaRenderer({ ...options, ...room })
 * ```
 */
export function joinGameRoom(config: GameplayConfig, scene: RoomScene): GameRoomLinks {
  const network = createNetworkPort()
  network.chooseMelee(scene.meleeWeapon)
  const voice = createVoiceSeat(config)
  const room = resolveRoomAddress(window.location.pathname, randomUint32)
  window.history.replaceState(null, '', `${room.path}${window.location.search}`)
  const url = gameServerUrl(window.location, GAME_SERVER_PORT)
  const current: { link: GameLink | undefined } = { link: undefined }
  window.addEventListener('pagehide', () => void current.link?.leave())
  const follow = (link: GameLink): void => {
    if (reloadForRoomArena(link, scene.arena.id)) return
    current.link = link
    network.attach(link)
    voice.follow(link)
    window.history.replaceState(null, '', `/${link.address}${window.location.search}`)
    link.onMove((next) => void next().then(follow).catch(logJoinFailure(room.address, url)))
    logJoined(link, room.address)
  }
  openGameLink(url, room.address, interpolationDelayMs(config))
    .then(follow)
    .catch(logJoinFailure(room.address, url))
  return { network, voice }
}

/** O que a cena subiu e a sala precisa saber: a lâmina da classe e o mapa. */
export interface RoomScene {
  readonly meleeWeapon: MeleeWeapon
  readonly arena: ArenaMap
}

/**
 * O mapa é da sala: com outro mapa subido, sai da sala e recarrega no dela,
 * com o mesmo endereço na url. Devolve se recarregou.
 */
function reloadForRoomArena(link: GameLink, bootedArenaId: string): boolean {
  const catalogIds = ARENA_CATALOG.map((map) => map.id)
  const arenaId = arenaToFollow(link.arenaId, bootedArenaId, catalogIds)
  if (!arenaId) return false
  console.info(JSON.stringify({ event: 'room.arena-reload', from: bootedArenaId, to: arenaId }))
  void link.leave().finally(() => reloadIntoArena(arenaId))
  return true
}

/** O canal de voz da sala em que se joga, trocado junto com ela. */
interface VoiceSeat extends VoiceStage {
  follow(link: GameLink): void
}

/**
 * A voz acompanha a sala de jogo: cada sala tem a sua, e quem troca de sala
 * sai da voz antiga. Sem token, ou com falha, o jogo segue sem voz (ADR 0026).
 */
function createVoiceSeat(config: GameplayConfig): VoiceSeat {
  const url = gameServerUrl(window.location, MEDIA_SERVER_PORT)
  const seat: { voice: VoiceLink | undefined } = { voice: undefined }
  bindPushToTalk(window, (on) => seat.voice?.talk(on))
  window.addEventListener('pagehide', () => seat.voice?.leave())
  return {
    hearFrom: (eyeM, forward) => seat.voice?.hearFrom(eyeM, forward),
    placeSpeaker: (playerId, mouthM) => seat.voice?.placeSpeaker(playerId, mouthM),
    follow: (link) => {
      seat.voice?.leave()
      seat.voice = undefined
      link.onVoiceTicket((ticket) => {
        openVoiceLink(url, ticket.token, config.voice)
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
