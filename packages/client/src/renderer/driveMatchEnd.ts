import type { Scene } from '@babylonjs/core/scene'
import type { ArenaChoice } from '../arena/arenaChoices.ts'
import type { HumanSkinId } from '../character/humanSkins.ts'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import {
  createMatchEndDirector,
  type MatchEndDirector,
  type MatchEndEvent,
  type MatchEndRoom,
  stepMatchEnd,
} from '../matchEnd/matchEndDirector.ts'
import {
  type MatchEndScreenInput,
  matchEndScreenKey,
  matchEndScreenOf,
} from '../matchEnd/matchEndScreen.ts'
import type { MatchEndInput } from './matchEndInput.ts'
import type { MvpPodium } from './mvpPodium.ts'

export interface MatchEndOptions {
  readonly session: ArenaSession
  readonly hud: ArenaHud
  readonly input: MatchEndInput
  readonly podium: MvpPodium
  /** Os mapas do voto, e o de agora — que entra na semente do voto. */
  readonly arenas: readonly ArenaChoice[]
  readonly arenaId: string
  /** O retrato e a skin de cada id da sala (`portraitsOf`, `roomSkinsOf`). */
  readonly portraits: ReadonlyMap<string, string>
  readonly skins: ReadonlyMap<string, HumanSkinId>
  readonly inControl: () => boolean
  readonly frameDeltaMs: () => number
  /** A partida seguinte, no mapa que o voto escolheu. */
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
  const screen = { key: '' }
  scene.onBeforeRenderObservable.add(() => {
    const commands = options.input.drain()
    if (!options.inControl()) return
    const event = stepMatchEnd(director, refreshRoom(room, options), frameS(options), commands)
    if (event) react(options, director, event)
    writeScreen(options, director, screen)
  })
}

function frameS(options: MatchEndOptions): number {
  return options.frameDeltaMs() / 1000
}

/** Escrita uma vez e reescrita por quadro: um literal por quadro seria lixo no caminho quente. */
type MutableRoom = { -readonly [Key in keyof MatchEndRoom]: MatchEndRoom[Key] }

function roomOf(options: MatchEndOptions): MutableRoom {
  const { session } = options
  return {
    matchOver: session.matchOver,
    scoreboard: session.scoreboard,
    bots: session.bots,
    matchSeed: 0,
    arenas: options.arenas,
    localId: LOCAL_PLAYER_ID,
  }
}

/**
 * A semente do voto é a da partida mais o mapa de agora: depois da troca de
 * mapa a página recarrega, a sessão recomeça a contagem de partidas, e sem o
 * mapa na conta os bots votariam igual de novo.
 */
function refreshRoom(room: MutableRoom, options: MatchEndOptions): MatchEndRoom {
  const arenaIndex = options.arenas.findIndex((arena) => arena.id === options.arenaId)
  room.matchOver = options.session.matchOver
  room.matchSeed = options.session.matchSeed + 1_000 * (arenaIndex + 1)
  return room
}

function react(options: MatchEndOptions, director: MatchEndDirector, event: MatchEndEvent): void {
  if (event.kind === 'over') options.podium.hold()
  if (event.kind === 'results') showMvp(options, director)
  if (event.kind === 'next') options.onNextMatch(event.mapId)
  if (event.kind === 'playing') options.podium.hide()
  if (event.kind === 'leave') options.onLeave()
}

function showMvp(options: MatchEndOptions, director: MatchEndDirector): void {
  const mvpId = director.standings[0]?.playerId
  const skin = mvpId === undefined ? undefined : options.skins.get(mvpId)
  if (skin) options.podium.show(skin)
}

/**
 * A tela só é remontada quando a chave muda (`matchEndScreenKey`). Na fase
 * `done` ela fica como está: a troca de mapa recarrega a página, e o mapa
 * decidido segue na tela até a página sair.
 */
function writeScreen(
  options: MatchEndOptions,
  director: MatchEndDirector,
  screen: { key: string },
): void {
  const { phase } = director.flow
  if (phase === 'done') return
  // jogando, a tela some uma vez e nada mais roda: a chave aloca, e o quadro
  // de jogo não aloca nada (nfr.md).
  if (phase === 'playing') {
    if (screen.key !== phase) options.hud.setMatchEnd(null)
    screen.key = phase
    return
  }
  const input: MatchEndScreenInput = {
    flow: director.flow,
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
