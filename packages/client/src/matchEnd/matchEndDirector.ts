import {
  type BotPlayer,
  isBenched,
  isFrozenPhase,
  type MapVoteOutcome,
  type MatchConfig,
  type MatchCycle,
  type MatchPhase,
  type MatchSummaryRow,
  matchPhaseFrozen,
  type Scoreboard,
  stepMatchCycle,
  summarizeMatch,
} from '@shobu/core'
import type { ArenaChoice } from '../arena/arenaChoices.ts'
import type { RoomIntermission } from '../controller/roomIntermission.ts'
import {
  adoptBallots,
  choiceOf,
  closeVoteBooth,
  type MapVoteBooth,
  openVoteBooth,
} from './mapVoteBooth.ts'
import { applyVoteCommand, type VoteCommand } from './voteCommands.ts'

/**
 * O fim de partida inteiro, como estado e eventos: a fase que a tela mostra,
 * a ordem final tirada quando a partida acaba, a cabine de voto e o resultado.
 * As fases são as do ciclo da partida do núcleo (ADR 0031): online, as da
 * sala; offline, as da sessão, que este diretor anda enquanto a arena está
 * congelada — o tick não roda ali. O adapter (`driveMatchEnd.ts`) entrega o
 * quadro e os comandos do jogador, e reage aos eventos. Sem dom e sem engine.
 */
export interface MatchEndDirector {
  /**
   * A fase que a tela mostra. Anda uma por quadro atrás da do ciclo: quem
   * entra no meio do intervalo vê o fim e o MVP montarem na ordem.
   */
  phase: MatchPhase
  /** A sala na ordem final: o resumo da partida, do MVP ao último. */
  standings: readonly MatchSummaryRow[]
  /** A cabine de voto, aberta quando a partida acaba. */
  booth: MapVoteBooth
  outcome: MapVoteOutcome | undefined
}

/** O que mudou neste quadro e pede uma ação do adapter. */
export type MatchEndEvent =
  /** A partida acabou: o MVP já é conhecido, e o pódio pode começar a montar. */
  | { readonly kind: 'over'; readonly mvpId: string | undefined }
  /** A tela de MVP abriu: a câmera corta para o pódio. */
  | { readonly kind: 'results' }
  /** O voto fechou. */
  | { readonly kind: 'decided'; readonly outcome: MapVoteOutcome }
  /** Offline, hora da partida seguinte, no mapa que venceu. Online quem a começa é a sala. */
  | { readonly kind: 'next'; readonly mapId: string }
  /** A partida seguinte começou: a câmera volta ao jogador. */
  | { readonly kind: 'playing' }
  /** O jogador pediu o menu (Esc, B, o botão da tela). */
  | { readonly kind: 'leave' }
  /** Online, o jogador votou ou trocou o voto: vai para a sala (`MAP_VOTE_MESSAGE`). */
  | { readonly kind: 'vote'; readonly optionIndex: number }

/** O que o diretor lê da sala: o ciclo, o placar, os bots e a semente da partida. */
export interface MatchEndRoom {
  /** O ciclo da sessão; offline, o diretor o anda com a arena congelada. */
  readonly cycle: MatchCycle
  readonly match: MatchConfig
  readonly scoreboard: Readonly<Scoreboard>
  readonly bots: readonly Readonly<BotPlayer>[]
  readonly matchSeed: number
  /** Os mapas do voto (`MATCH_ARENAS`). */
  readonly arenas: readonly ArenaChoice[]
  readonly localId: string
  /** A sala do servidor está conectada: o intervalo é dela (`roomIntermission.ts`). */
  readonly online: boolean
  readonly intermission: Readonly<RoomIntermission>
}

/**
 * A cabine nasce aberta e vazia, só com os mapas: quem a enche é o fim da
 * partida, com os bots da sala e a semente dela.
 */
export function createMatchEndDirector(arenas: readonly ArenaChoice[]): MatchEndDirector {
  return {
    phase: 'live',
    standings: [],
    booth: openVoteBooth(arenas, [], 0),
    outcome: undefined,
  }
}

/**
 * Um quadro: os comandos do jogador valem só com a tela de MVP aberta; online
 * o intervalo da sala entra na tela; offline o ciclo anda; e a fase da tela
 * segue a do ciclo. Devolve o evento do quadro, ou `undefined` — um por
 * quadro, porque a fase da tela anda uma por quadro.
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
  const commanded = applyCommands(director, room, commands)
  if (commanded) return commanded
  if (room.online) followRoomIntermission(director, room)
  return stepLocalIntermission(director, room, dtS) ?? catchUpPhase(director, room)
}

/** O menu ganha de tudo; online, o voto que mudou vai para a sala. */
function applyCommands(
  director: MatchEndDirector,
  room: MatchEndRoom,
  commands: readonly VoteCommand[],
): MatchEndEvent | undefined {
  if (director.phase !== 'results') return undefined
  const { booth } = director
  const before = choiceOf(booth, room.localId)
  const atS = room.cycle.phaseS
  if (commands.some((command) => applyVoteCommand(booth, command, room.localId, atS))) {
    return { kind: 'leave' }
  }
  const after = choiceOf(booth, room.localId)
  return room.online && after !== before ? { kind: 'vote', optionIndex: after } : undefined
}

/**
 * Online, a tela mostra o que a sala diz: o resumo dela, quando chega, e os
 * votos à vista, com o do jogador ainda não ecoado.
 */
function followRoomIntermission(director: MatchEndDirector, room: MatchEndRoom): void {
  if (!isFrozenPhase(director.phase)) return
  const { summary, ballots } = room.intermission
  if (summary) director.standings = summary
  adoptBallots(director.booth, ballots, room.localId)
}

/**
 * Offline, com a arena congelada, o diretor anda o ciclo da sessão — só com a
 * tela em dia com ele, para nenhuma fase passar sem ser vista. O fim do
 * intervalo pede a partida seguinte.
 */
function stepLocalIntermission(
  director: MatchEndDirector,
  room: MatchEndRoom,
  dtS: number,
): MatchEndEvent | undefined {
  const { cycle } = room
  if (room.online || !matchPhaseFrozen(cycle) || director.phase !== cycle.phase) return undefined
  if (stepMatchCycle(cycle, dtS, 0, room.match) !== 'next') return undefined
  return { kind: 'next', mapId: (director.outcome as MapVoteOutcome).mapId }
}

/** A fase da tela anda um passo em direção à do ciclo, e o passo vira evento. */
function catchUpPhase(director: MatchEndDirector, room: MatchEndRoom): MatchEndEvent | undefined {
  const target = room.cycle.phase
  const shown = director.phase
  if (shown === target) return undefined
  director.phase = nextShownPhase(shown, target)
  if (isFrozenPhase(director.phase)) return enterFrozenPhase(director, room)
  if (!isFrozenPhase(shown)) return undefined
  director.outcome = undefined
  return { kind: 'playing' }
}

/** O intervalo seguinte, na ordem; depois do último, o fim de uma partida nova. */
const SHOWN_AFTER: Readonly<Record<'over' | 'results' | 'decided', MatchPhase>> = {
  over: 'results',
  results: 'decided',
  decided: 'over',
}

/**
 * Da partida para o intervalo, a tela passa sempre pelo fim; dentro dele,
 * fase a fase. Do intervalo para a partida, direto: o aquecimento e a partida
 * em andamento não têm tela.
 */
function nextShownPhase(shown: MatchPhase, target: MatchPhase): MatchPhase {
  if (!isFrozenPhase(target)) return target
  if (!isFrozenPhase(shown)) return 'over'
  return SHOWN_AFTER[shown as keyof typeof SHOWN_AFTER]
}

function enterFrozenPhase(director: MatchEndDirector, room: MatchEndRoom): MatchEndEvent {
  if (director.phase === 'over') return closeTheMatch(director, room)
  if (director.phase === 'results') return { kind: 'results' }
  director.outcome = room.online ? roomOutcomeOf(director, room) : closeVoteBooth(director.booth)
  return { kind: 'decided', outcome: director.outcome }
}

/**
 * O voto que a sala fechou, com a opção que a cabine mostra. Sem ele ainda no
 * estado, a cabine fecha com os votos que já vê: a sala decide igual, e a
 * partida seguinte é a dela de qualquer jeito.
 */
function roomOutcomeOf(director: MatchEndDirector, room: MatchEndRoom): MapVoteOutcome {
  const { winner, nextArenaId } = room.intermission
  const choice = winner === undefined ? undefined : director.booth.choices[winner]
  if (!choice || nextArenaId === undefined) return closeVoteBooth(director.booth)
  return { optionId: choice.id, mapId: nextArenaId, tied: false }
}

/**
 * A partida acabou: a ordem final congela, e a cabine abre. Offline, com os
 * votos dos bots que estão na sala — o banco não vota; online, vazia, e os
 * votos chegam da sala, como o resumo, que até chegar é o do placar daqui.
 */
function closeTheMatch(director: MatchEndDirector, room: MatchEndRoom): MatchEndEvent {
  director.standings = room.intermission.summary ?? summarizeMatch(room.scoreboard)
  const voters = room.online ? [] : room.bots.filter((bot) => !isBenched(bot)).map((bot) => bot.id)
  director.booth = openVoteBooth(room.arenas, voters, room.matchSeed)
  director.outcome = undefined
  return { kind: 'over', mvpId: director.standings[0]?.playerId }
}
