import {
  type BotPlayer,
  type CharacterState,
  DEFAULT_PRIMARY_WEAPON,
  encodeMatchPhase,
  encodePrimaryWeapon,
  encodeStance,
  isBenched,
  lengthSquared,
  matchPhaseLeftS,
  type PlayerScore,
  quantizeAim,
  quantizePhaseLeft,
  quantizePositionM,
} from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'
import { visibleRoomBallots } from './roomVote.ts'

/** Os campos que o `PlayerState` do schema tem; o schema os satisfaz por estrutura. */
export interface PlayerStateFields {
  x: number
  y: number
  z: number
  aimX: number
  aimY: number
  aimZ: number
  stance: number
  alive: boolean
  name: string
  primary: number
  points: number
  kills: number
  deaths: number
  streakPoints: number
}

/** Os campos que o `MatchState` do schema tem: a fase, o que falta nela, o mapa e o voto. */
export interface MatchStateFields {
  phase: number
  phaseLeftDs: number
  arenaId: string
  readonly ballots: BallotFields
  winner: number
  nextArenaId: string
}

/** O mapa de votos do schema, de quem votou para o índice da opção; um `Map` serve. */
export interface BallotFields {
  readonly size: number
  get(voterId: string): number | undefined
  set(voterId: string, optionIndex: number): unknown
  clear(): void
}

/** O estado da sala que o colyseus sincroniza, visto pela simulação. */
export interface RoomStateSink {
  /** A partida da sala: um só para todos. */
  matchState(): MatchStateFields
  /** O estado de um jogador da sala, criado na primeira vez que é pedido. */
  stateOf(playerId: string): PlayerStateFields | undefined
  /** Tira do estado quem não está mais na arena: o bot que foi para o banco. */
  drop(playerId: string): void
}

/**
 * Escreve o snapshot quantizado de cada jogador e de cada bot sentado no
 * estado que o colyseus sincroniza; o bot do banco sai do estado. Para o
 * cliente, os dois são iguais: um jogador da sala. A fase da partida e o
 * placar oficial vão junto, para quem entra no meio saber onde a partida está.
 *
 * ```ts
 * writeRoomState(room, {
 *   matchState: () => state.match,
 *   stateOf: (id) => state.players.get(id),
 *   drop: (id) => state.players.delete(id),
 * })
 * ```
 */
export function writeRoomState(room: RoomSimulation, sink: RoomStateSink): void {
  writeMatch(room, sink.matchState())
  for (const [playerId, { body, aim, fighter, callsign, primaryWeapon }] of room.seats) {
    const out = sink.stateOf(playerId)
    if (!out) continue
    writeBody(out, body, fighter.alive)
    // o schema não reenvia o mesmo valor: o nome e a arma só viajam quando mudam.
    out.name = callsign
    out.primary = encodePrimaryWeapon(primaryWeapon)
    out.aimX = aim.aimX
    out.aimY = aim.aimY
    out.aimZ = aim.aimZ
    writeScore(out, room.board.players.get(playerId))
  }
  for (const bot of room.bots.squad.bots) writeBot(room, bot, sink)
}

/**
 * A fase e o que falta nela, em décimos: o schema só manda o que mudou, e o
 * relógio muda dez vezes por segundo. O mapa só viaja quando muda.
 */
function writeMatch(room: RoomSimulation, out: MatchStateFields): void {
  const { cycle } = room.match
  out.phase = encodeMatchPhase(cycle.phase)
  out.phaseLeftDs = quantizePhaseLeft(matchPhaseLeftS(cycle, room.match.config))
  out.arenaId = room.rules.arenaId
  writeVote(room, out)
}

/**
 * O voto que a tela mostra: cada voto à vista, e o que venceu quando fecha.
 * Fora do intervalo não há voto, e o mapa de votos fica vazio. Um voto que
 * muda de opção só reescreve a entrada dele.
 */
function writeVote(room: RoomSimulation, out: MatchStateFields): void {
  const { vote } = room.match
  out.winner = vote?.outcome?.winner ?? -1
  out.nextArenaId = vote?.outcome?.mapId ?? ''
  if (!vote) {
    if (out.ballots.size > 0) out.ballots.clear()
    return
  }
  for (const { voterId, optionId } of visibleRoomBallots(room)) {
    const index = vote.options.indexOf(optionId)
    if (out.ballots.get(voterId) !== index) out.ballots.set(voterId, index)
  }
}

/** O bot sentado como um jogador; o do banco, fora do estado. */
function writeBot(room: RoomSimulation, bot: BotPlayer, sink: RoomStateSink): void {
  if (isBenched(bot)) {
    sink.drop(bot.id)
    return
  }
  const out = sink.stateOf(bot.id)
  if (!out) return
  writeBody(out, bot.body, bot.alive)
  out.name = bot.callsign
  // o bot não escolhe classe: carrega a padrão, como o bot do modo offline.
  out.primary = encodePrimaryWeapon(DEFAULT_PRIMARY_WEAPON)
  // a mira de um bot que ainda não olhou para lado nenhum é zero, e zero não
  // tem direção: fica a do patch anterior.
  if (lengthSquared(bot.aimM) > 0) quantizeAim(bot.aimM, out)
  writeScore(out, room.board.players.get(bot.id))
}

/**
 * A linha do placar oficial, nas larguras do schema: o `uint16` não passa do
 * teto, para um número grande não dar a volta e virar zero no tab.
 */
function writeScore(out: PlayerStateFields, score: Readonly<PlayerScore> | undefined): void {
  if (!score) return
  out.points = score.points
  out.kills = Math.min(UINT16_MAX, score.kills)
  out.deaths = Math.min(UINT16_MAX, score.deaths)
  out.streakPoints = Math.min(UINT16_MAX, score.scorestreakPoints)
}

const UINT16_MAX = 65535

function writeBody(out: PlayerStateFields, body: Readonly<CharacterState>, alive: boolean): void {
  out.x = quantizePositionM(body.position.x)
  out.y = quantizePositionM(body.position.y)
  out.z = quantizePositionM(body.position.z)
  out.stance = encodeStance(body.stance, body.grounded)
  out.alive = alive
}
