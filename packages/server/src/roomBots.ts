import {
  aimAndTrigger,
  type BotPlayer,
  type BotSquad,
  type BotTick,
  botSeatsFor,
  createBotSquad,
  createShotHit,
  createTargetList,
  describeMeleeKill,
  describeSniperKill,
  type Fighter,
  isBenched,
  killFighter,
  MATCH_SEED_BASE,
  moveBot,
  noticeShot,
  type PassingShot,
  placeBot,
  resolveFighterShot,
  resolveFighterStrike,
  type ShotHit,
  type ShotRange,
  seatBots,
  spreadTangent,
  stepRespawnClock,
  type Vector3,
} from '@shobu/core'
import type { RoomIo, RoomRules, RoomSimulation } from './roomSimulation.ts'

/**
 * Os bots da sala (ADR 0016): completam as vagas que os humanos não ocupam,
 * com as mesmas regras do jogador (`aimAndTrigger`, `resolveFighterShot`,
 * `moveBot`). Para o cliente, um bot é só mais um jogador da sala: o patch de
 * estado o traz como traz um humano, e as kills dele chegam pela mesma
 * mensagem.
 */
export interface RoomBots {
  readonly squad: BotSquad
  readonly tick: BotTick
  readonly range: ShotRange
  readonly hit: ShotHit
  readonly passing: { shooterIndex: number; readonly fromM: Vector3; readonly toM: Vector3 }
}

/**
 * Tantos bots quantas vagas há além do primeiro humano: a sala nasce com a
 * entrada de alguém, e o bot que sobra nunca senta. Todos começam no banco;
 * quem senta é `seatRoomBots`.
 */
export function createRoomBots(rules: RoomRules, fighters: readonly Fighter[]): RoomBots {
  const { config, boxes } = rules
  const squad = createBotSquad({
    count: config.match.playersPerRoom - 1,
    seed: MATCH_SEED_BASE,
    arena: { boxes, graph: rules.navGraph, spawnsFeetM: rules.spawnsFeetM },
    config,
  })
  seatBots(squad, fighters, 0, config)
  return {
    squad,
    tick: { squad, fighters, config, dtS: 1 / config.simulation.tickHz },
    range: {
      boxes,
      config,
      coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
      targets: createTargetList(config.match.playersPerRoom * 2),
    },
    hit: createShotHit(),
    passing: { shooterIndex: -1, fromM: { x: 0, y: 0, z: 0 }, toM: { x: 0, y: 0, z: 0 } },
  }
}

/**
 * A conta de vagas a cada entrada e saída (`botSeatsFor`): quem chega toma a
 * vaga de um bot, e quem sai a devolve.
 *
 * ```ts
 * seatRoomBots(room, rules)
 * ```
 */
export function seatRoomBots(room: RoomSimulation, rules: RoomRules): void {
  const count = botSeatsFor(rules.config.match.playersPerRoom, room.seats.size)
  seatBots(room.bots.squad, room.fighters, count, rules.config)
}

/**
 * Um tick de cada bot sentado, na ordem do jogador (`arenaCombat.ts`): arma,
 * tiro, golpe, corpo. O bot vê a sala de agora, sem rewind: ele está no
 * servidor, e o que ele vê é o que é.
 */
export function stepRoomBots(room: RoomSimulation, io: RoomIo, rules: RoomRules): void {
  for (const [botIndex, bot] of room.bots.squad.bots.entries()) {
    if (!isBenched(bot)) stepRoomBot(room, io, bot, botIndex, rules)
  }
}

function stepRoomBot(
  room: RoomSimulation,
  io: RoomIo,
  bot: BotPlayer,
  botIndex: number,
  rules: RoomRules,
): void {
  const { bots } = room
  if (!bot.alive) {
    if (stepRespawnClock(bot, bots.tick.dtS)) placeBot(bots.squad, bot, room.fighters, rules.config)
    return
  }
  if (aimAndTrigger(bot, botIndex, bots.tick)) fireBot(room, io, bot, botIndex, rules)
  if (bot.melee.struckThisTick) strikeFromBot(room, io, bot, botIndex, rules)
  moveBot(bot, bots.tick)
}

function fireBot(
  room: RoomSimulation,
  io: RoomIo,
  bot: BotPlayer,
  botIndex: number,
  rules: RoomRules,
): void {
  const { bots } = room
  const shot = bots.hit
  const aim = { shooterIndex: botIndex, eyeM: bot.eyeM, aimM: bot.aimM, weapon: bot.weapon }
  const victimIndex = resolveFighterShot(
    { ...aim, seedBase: MATCH_SEED_BASE },
    room.fighters,
    bots.range,
    shot,
  )
  warnBotsOfShot(room, botIndex, bot.eyeM, shot.endpointM, rules)
  const victim = room.fighters[victimIndex]
  if (!victim || !killFighter(victim, rules.config.match.respawnDelayS)) return
  const atS = room.matchTimeS
  io.onKill(describeSniperKill(room.kill, { shooter: bot, victim, shot, weapon: bot.weapon, atS }))
}

/**
 * O golpe de um bot contra quem está ao alcance agora. Exportada para o teste
 * do golpe no vazio, que o bot de verdade quase nunca dá.
 *
 * ```ts
 * if (bot.melee.struckThisTick) strikeFromBot(room, io, bot, botIndex, rules)
 * ```
 */
export function strikeFromBot(
  room: RoomSimulation,
  io: RoomIo,
  bot: BotPlayer,
  botIndex: number,
  rules: RoomRules,
): void {
  const { boxes, config } = rules
  const weapon = bot.melee.weapon
  const hit = room.strike.hit
  const victimIndex = resolveFighterStrike(
    { strikerIndex: botIndex, eyeM: bot.eyeM, aimM: bot.aimM, weapon },
    room.fighters,
    { boxes, config, reach: room.strike.reach },
    hit,
  )
  const victim = room.fighters[victimIndex]
  if (!victim || !killFighter(victim, config.match.respawnDelayS)) return
  io.onKill(
    describeMeleeKill(room.kill, { striker: bot, victim, weapon, hit, atS: room.matchTimeS }),
  )
}

/**
 * Todo bot sentado ouve o tiro que cruzou a arena, venha de bot ou de humano:
 * o que passou perto o assusta e o faz procurar o atirador (`noticeShot`).
 *
 * ```ts
 * warnBotsOfShot(room, shooterIndex, eyeM, hit.endpointM, rules)
 * ```
 */
export function warnBotsOfShot(
  room: RoomSimulation,
  shooterIndex: number,
  fromM: Readonly<Vector3>,
  toM: Readonly<Vector3>,
  rules: RoomRules,
): void {
  const passing: PassingShot = Object.assign(room.bots.passing, { shooterIndex })
  Object.assign(room.bots.passing.fromM, fromM)
  Object.assign(room.bots.passing.toM, toM)
  for (const [botIndex, bot] of room.bots.squad.bots.entries()) {
    noticeShot(bot, botIndex, passing, rules.config.bots)
  }
}
