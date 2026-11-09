import {
  matchPhaseFrozen,
  matchPhaseLengthS,
  resetScoreboard,
  resetScorestreakLedger,
} from '@shobu/core'
import type { RoomMatchView } from '../net/roomMatchView.ts'
import type { CombatScope } from './arenaCombat.ts'
import { restartArenaRadar } from './arenaRadar.ts'
import { endMatch } from './arenaRestart.ts'
import { clearRoomIntermission } from './roomIntermission.ts'

/**
 * Online, o ciclo da partida é o da sala (ADR 0031): a sessão copia a fase e
 * o que falta dela do estado, a cada quadro, e reage às bordas como a partida
 * offline reage às do próprio ciclo — o fim congela a arena, e a partida
 * seguinte zera o placar e as séries. Quem decide é o servidor; aqui só se
 * segue.
 */

/**
 * O relógio da sala visto daqui. O estado traz os segundos em décimos, e só
 * quando mudam; entre um patch e outro a sessão conta sozinha, e só volta ao
 * da sala quando ele se afasta mais que `ROOM_CLOCK_SNAP_S`.
 */
export interface RoomClock {
  /** Os segundos que faltam na fase, contados aqui. */
  leftS: number
  /** O último valor que a sala mandou: outro é patch novo. */
  serverLeftS: number
}

/** Mais que um décimo do fio e um quadro lento: menos que isto é arredondamento. */
export const ROOM_CLOCK_SNAP_S = 0.15

export function createRoomClock(): RoomClock {
  return { leftS: Number.POSITIVE_INFINITY, serverLeftS: Number.NaN }
}

/** O que seguir a partida da sala lê do `RoomFeed`. */
export interface RoomMatchFeed {
  matchState(): Readonly<RoomMatchView> | undefined
  /**
   * A partida seguinte pôs todo mundo num spawn, vivo ou não: o próximo
   * `takeOwnSpawn` devolve onde o jogador está, como na volta da morte.
   */
  restartOwnSpawn(): void
}

/**
 * Copia a fase e o relógio da sala no ciclo da sessão, e reage à borda. Sem
 * estado ainda, o ciclo fica como está. Quem entra no meio do intervalo vê a
 * borda para a fase de agora já no primeiro quadro: a arena congela e a tela
 * aparece, sem ter visto o fim.
 *
 * ```ts
 * followRoomMatch(scope, seats.roomClock, feed, frameS) // antes do takeOwnSpawn
 * ```
 */
export function followRoomMatch(
  scope: CombatScope,
  clock: RoomClock,
  feed: RoomMatchFeed,
  frameS: number,
): void {
  const view = feed.matchState()
  if (!view) return
  const cycle = scope.session.matchCycle
  const changed = cycle.phase !== view.phase
  const wasFrozen = matchPhaseFrozen(cycle)
  cycle.phase = view.phase
  tickRoomClock(clock, view, changed, frameS)
  cycle.phaseS = matchPhaseLengthS(cycle, scope.options.config.match) - clock.leftS
  reactToRoomPhase(scope, feed, wasFrozen)
}

/**
 * Conta o relógio da sala neste quadro: a fase nova, ou o patch que se afastou
 * do que se contou aqui, vale o da sala; senão, desconta o quadro.
 *
 * ```ts
 * tickRoomClock(clock, view, phaseChanged, frameS)
 * ```
 */
export function tickRoomClock(
  clock: RoomClock,
  view: Readonly<RoomMatchView>,
  phaseChanged: boolean,
  frameS: number,
): void {
  const patched = view.phaseLeftS !== clock.serverLeftS
  clock.serverLeftS = view.phaseLeftS
  const counted = Math.max(0, clock.leftS - frameS)
  const drifted = !(Math.abs(counted - view.phaseLeftS) <= ROOM_CLOCK_SNAP_S)
  clock.leftS = phaseChanged || (patched && drifted) ? view.phaseLeftS : counted
}

/** A arena congela na entrada do fim, e a partida seguinte começa na saída do intervalo. */
function reactToRoomPhase(scope: CombatScope, feed: RoomMatchFeed, wasFrozen: boolean): void {
  const frozen = matchPhaseFrozen(scope.session.matchCycle)
  if (frozen && !wasFrozen) endMatch(scope.session, scope.options, scope.parts)
  if (wasFrozen && !frozen) restartRoomMatch(scope, feed)
}

/**
 * A partida seguinte da sala: o servidor zerou o placar, as séries e as
 * mortes fora da área, fechou o intervalo, e pôs todo mundo num spawn. A sessão faz o mesmo com o
 * que ela conta por conta própria; o corpo vai ao spawn pelo `takeOwnSpawn`.
 */
function restartRoomMatch(scope: CombatScope, feed: RoomMatchFeed): void {
  const { session, parts } = scope
  resetScoreboard(parts.scoreboard)
  resetScorestreakLedger(parts.scorestreaks)
  // o servidor também apaga os efeitos e o PING na partida nova
  // (`resetScorestreakEffects`); o relógio da sessão para no intervalo, e um
  // EMP ou um GANCHO OVERCLOCK do fim da partida entrava vivo no aquecimento.
  restartArenaRadar(parts)
  parts.boundary.outsideS = 0
  session.boundaryRemainingS = null
  session.boundaryDeaths = 0
  clearRoomIntermission(session.roomIntermission)
  feed.restartOwnSpawn()
}
