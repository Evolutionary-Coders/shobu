import {
  type BotPlayer,
  finalStandings,
  isBenched,
  type MapVoteOutcome,
  type PlayerScore,
  type Scoreboard,
} from '@shobu/core'
import type { ArenaChoice } from '../arena/arenaChoices.ts'
import { closeVoteBooth, type MapVoteBooth, openVoteBooth } from './mapVoteBooth.ts'
import { advanceMatchEndFlow, createMatchEndFlow, type MatchEndFlow } from './matchEndFlow.ts'
import { applyVoteCommand, type VoteCommand } from './voteCommands.ts'

/**
 * O fim de partida inteiro, como estado e eventos: a fase, a ordem final
 * tirada quando o tempo acaba, a cabine de voto e o resultado. O adapter
 * (`driveMatchEnd.ts`) entrega o quadro e os comandos do jogador, e reage aos
 * eventos — montar o pódio, cortar a câmera, começar a partida seguinte, sair
 * para o menu. Sem dom e sem engine.
 */
export interface MatchEndDirector {
  readonly flow: MatchEndFlow
  /** A sala na ordem final, tirada no instante em que o tempo acabou. */
  standings: readonly PlayerScore[]
  /** A cabine de voto, aberta quando o tempo acaba. */
  booth: MapVoteBooth
  outcome: MapVoteOutcome | undefined
}

/** O que mudou neste quadro e pede uma ação do adapter. */
export type MatchEndEvent =
  /** O tempo acabou: o MVP já é conhecido, e o pódio pode começar a montar. */
  | { readonly kind: 'over'; readonly mvpId: string | undefined }
  /** A tela de MVP abriu: a câmera corta para o pódio. */
  | { readonly kind: 'results' }
  /** O voto fechou. */
  | { readonly kind: 'decided'; readonly outcome: MapVoteOutcome }
  /** Hora da partida seguinte, no mapa que venceu. */
  | { readonly kind: 'next'; readonly mapId: string }
  /** A partida seguinte começou: a câmera volta ao jogador. */
  | { readonly kind: 'playing' }
  /** O jogador pediu o menu (Esc, B, o botão da tela). */
  | { readonly kind: 'leave' }

/** O que o diretor lê da sala: o placar, os bots e a semente da partida. */
export interface MatchEndRoom {
  readonly matchOver: boolean
  readonly scoreboard: Readonly<Scoreboard>
  readonly bots: readonly Readonly<BotPlayer>[]
  readonly matchSeed: number
  /** Os mapas do voto (`MATCH_ARENAS`). */
  readonly arenas: readonly ArenaChoice[]
  readonly localId: string
}

/**
 * A cabine nasce aberta e vazia, só com os mapas: quem a enche é o fim da
 * partida, com os bots da sala e a semente dela.
 */
export function createMatchEndDirector(arenas: readonly ArenaChoice[]): MatchEndDirector {
  return {
    flow: createMatchEndFlow(),
    standings: [],
    booth: openVoteBooth(arenas, [], 0),
    outcome: undefined,
  }
}

/**
 * Um quadro: os comandos do jogador valem só com a tela de MVP aberta, e
 * depois a fase anda. Devolve o evento do quadro, ou `undefined` — um por
 * quadro, porque a fase anda uma por quadro.
 *
 * ```ts
 * const event = stepMatchEnd(director, room, frameS, commands)
 * if (event?.kind === 'next') startNextMatch(event.mapId)
 * ```
 */
export function stepMatchEnd(
  director: MatchEndDirector,
  room: MatchEndRoom,
  dtS: number,
  commands: readonly VoteCommand[],
): MatchEndEvent | undefined {
  if (applyCommands(director, room, commands)) return { kind: 'leave' }
  if (!advanceMatchEndFlow(director.flow, room.matchOver, dtS)) return undefined
  return enterPhase(director, room)
}

/** Devolve se algum comando pediu o menu. */
function applyCommands(
  director: MatchEndDirector,
  room: MatchEndRoom,
  commands: readonly VoteCommand[],
): boolean {
  if (director.flow.phase !== 'results') return false
  const atS = director.flow.phaseS
  return commands.some((command) => applyVoteCommand(director.booth, command, room.localId, atS))
}

function enterPhase(director: MatchEndDirector, room: MatchEndRoom): MatchEndEvent {
  const { phase } = director.flow
  if (phase === 'over') return closeTheMatch(director, room)
  if (phase === 'results') return { kind: 'results' }
  if (phase === 'decided') {
    director.outcome = closeVoteBooth(director.booth)
    return { kind: 'decided', outcome: director.outcome }
  }
  if (phase === 'done') return { kind: 'next', mapId: (director.outcome as MapVoteOutcome).mapId }
  director.outcome = undefined
  return { kind: 'playing' }
}

/**
 * O tempo acabou: a ordem final congela, e a cabine abre com os votos dos
 * bots que estão na sala — o banco não vota.
 */
function closeTheMatch(director: MatchEndDirector, room: MatchEndRoom): MatchEndEvent {
  director.standings = finalStandings(room.scoreboard)
  const voters = room.bots.filter((bot) => !isBenched(bot)).map((bot) => bot.id)
  director.booth = openVoteBooth(room.arenas, voters, room.matchSeed)
  director.outcome = undefined
  return { kind: 'over', mvpId: director.standings[0]?.playerId }
}
