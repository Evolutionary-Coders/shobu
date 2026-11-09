import type { Scene } from '@babylonjs/core/scene'
import type { MatchConfig } from '@shobu/core'
import type { ArenaChoice } from '../arena/arenaChoices.ts'
import { accentForIndex } from '../character/competitorPalette.ts'
import type { PortraitBook } from '../character/humanSkins.ts'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import {
  createMatchEndDirector,
  type MatchEndDirector,
  type MatchEndEvent,
  type MatchEndRoom,
  stepMatchEnd,
} from '../matchEnd/matchEndDirector.ts'
import { resultsSecondsLeft } from '../matchEnd/matchEndFlow.ts'
import {
  type MatchEndScreenInput,
  matchEndScreenKey,
  matchEndScreenOf,
} from '../matchEnd/matchEndScreen.ts'
import type { MatchEndInput } from './matchEndInput.ts'
import type { MvpPodium } from './mvpPodium.ts'

export interface MatchEndOptions {
  readonly session: ArenaSession
  /** As durações das fases do intervalo (ADR 0031). */
  readonly match: MatchConfig
  /** Online, o voto do jogador vai para a sala por aqui (`NetworkPort.castMapVote`). */
  readonly castMapVote: (optionIndex: number) => void
  readonly hud: ArenaHud
  readonly input: MatchEndInput
  readonly podium: MvpPodium
  /** Os mapas do voto, e o de agora — que entra na semente do voto. */
  readonly arenas: readonly ArenaChoice[]
  readonly arenaId: string
  /** O retrato de cada id da sala (`portraitBookOf`); o corpo do pódio sai de `session.lookOf`. */
  readonly portraits: PortraitBook
  readonly inControl: () => boolean
  readonly frameDeltaMs: () => number
  /** Offline, a partida seguinte, no mapa que o voto escolheu. Online, quem a começa é a sala. */
  readonly onNextMatch: (mapId: string) => void
  /** O jogador pediu o menu: Esc, B, ou o botão da tela. */
  readonly onLeave: () => void
}

/**
 * Leva o fim de partida da sessão para a tela, a câmera e a partida seguinte.
 * Adapter fino: as fases, o MVP e o voto são de `matchEndDirector.ts`; aqui
 * só se entregam o quadro e os comandos, e se reage aos eventos.
 *
 * Fora do controle (no menu), nada anda: quem sai na tela de MVP volta por uma
 * partida nova, que o menu começa (`setMode`).
 *
 * ```ts
 * driveMatchEnd(scene, { session, hud, input, podium, arenas, ... })
 * ```
 */
export function driveMatchEnd(scene: Scene, options: MatchEndOptions): void {
  const director = createMatchEndDirector(options.arenas)
  const room = roomOf(options)
  const arenaSeed = arenaSeedOf(options)
  const screen = { key: '' }
  scene.onBeforeRenderObservable.add(() => {
    const commands = options.input.drain()
    if (!options.inControl()) return
    const event = stepMatchEnd(
      director,
      refreshRoom(room, options, arenaSeed),
      frameS(options),
      commands,
    )
    if (event) react(options, director, event)
    writeScreen(options, director, room, screen)
  })
}

/** A chave da tela com a partida correndo: nada a mostrar. */
const PLAYING_KEY = 'playing'

function frameS(options: MatchEndOptions): number {
  return options.frameDeltaMs() / 1000
}

/** Escrita uma vez e reescrita por quadro: um literal por quadro seria lixo no caminho quente. */
type MutableRoom = { -readonly [Key in keyof MatchEndRoom]: MatchEndRoom[Key] }

function roomOf(options: MatchEndOptions): MutableRoom {
  const { session } = options
  return {
    cycle: session.matchCycle,
    match: options.match,
    scoreboard: session.scoreboard,
    bots: session.bots,
    matchSeed: 0,
    arenas: options.arenas,
    localId: LOCAL_PLAYER_ID,
    online: session.online,
    intermission: session.roomIntermission,
  }
}

/**
 * A semente do voto é a da partida mais o mapa de agora: depois da troca de
 * mapa a página recarrega, a sessão recomeça a contagem de partidas, e sem o
 * mapa na conta os bots votariam igual de novo.
 */
function refreshRoom(room: MutableRoom, options: MatchEndOptions, arenaSeed: number): MatchEndRoom {
  const { session } = options
  // o ciclo offline é trocado a cada partida (`restartArena`), e o online a cada sala.
  room.cycle = session.matchCycle
  room.online = session.online
  room.matchSeed = session.matchSeed + arenaSeed
  return room
}

/** A parte do mapa na semente, calculada uma vez: o mapa não muda sem recarregar a página. */
function arenaSeedOf(options: MatchEndOptions): number {
  const arenaIndex = options.arenas.findIndex((arena) => arena.id === options.arenaId)
  return 1_000 * (arenaIndex + 1)
}

function react(options: MatchEndOptions, director: MatchEndDirector, event: MatchEndEvent): void {
  if (event.kind === 'over') options.podium.hold()
  if (event.kind === 'results') showMvp(options, director)
  if (event.kind === 'next') options.onNextMatch(event.mapId)
  if (event.kind === 'playing') options.podium.hide()
  if (event.kind === 'leave') leave(options)
  if (event.kind === 'vote') options.castMapVote(event.optionIndex)
}

/**
 * Sair pela tela de MVP desmonta o pódio antes: deixado no ar, o fim dele
 * caía na partida seguinte — talvez já no óculos (`podiumCamerasOf`).
 */
function leave(options: MatchEndOptions): void {
  options.podium.hide()
  options.onLeave()
}

function showMvp(options: MatchEndOptions, director: MatchEndDirector): void {
  const mvpId = director.standings[0]?.playerId
  if (mvpId === undefined) return
  // o visual que a sala deu ao MVP: o corpo e o neon que todo mundo viu nele.
  const look = options.session.lookOf(mvpId)
  options.podium.show({ skin: look.skin, accent: accentForIndex(look.accent) })
}

/**
 * A tela só é remontada quando a chave muda (`matchEndScreenKey`). Depois do
 * voto ela fica como está até a partida seguinte: a troca de mapa recarrega a
 * página, e o mapa decidido segue na tela até a página sair.
 */
function writeScreen(
  options: MatchEndOptions,
  director: MatchEndDirector,
  room: MatchEndRoom,
  screen: { key: string },
): void {
  const { phase } = director
  // jogando, a tela some uma vez e nada mais roda: a chave aloca, e o quadro
  // de jogo não aloca nada (nfr.md).
  if (phase === 'warmup' || phase === 'live') {
    if (screen.key !== PLAYING_KEY) options.hud.setMatchEnd(null)
    screen.key = PLAYING_KEY
    return
  }
  const input: MatchEndScreenInput = {
    phase,
    phaseS: room.cycle.phaseS,
    secondsLeft: resultsSecondsLeft(room.cycle, options.match),
    standings: director.standings,
    nameOf: options.session.nameOf,
    portraits: options.portraits,
    localId: LOCAL_PLAYER_ID,
    booth: director.booth,
    outcome: director.outcome,
  }
  const key = matchEndScreenKey(input)
  if (key === screen.key) return
  screen.key = key
  options.hud.setMatchEnd(matchEndScreenOf(input))
}
