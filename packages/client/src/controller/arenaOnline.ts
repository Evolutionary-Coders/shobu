import {
  addPlayer,
  aimOnWire,
  applyBoundaryDeath,
  type BotPlayer,
  copyCharacterState,
  createMatchCycle,
  type Fighter,
  type KillEvent,
  type MeleeWeapon,
  type MutableKillEvent,
  type PrimaryWeapon,
  rearmMelee,
  rearmWeapon,
  removePlayer,
  resetScoreboard,
  resetScorestreakLedger,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakSlug,
  type ShotMessage,
  type Vector3,
  wishOnWire,
} from '@shobu/core'
import {
  createRemotePlayerView,
  type PlayerSnapshotFields,
  readRemotePlayer,
} from '../net/remotePlayerView.ts'
import { createRemoteRoster, type RemoteRoster } from '../net/remoteRoster.ts'
import { type CombatScope, scoreKill } from './arenaCombat.ts'
import { noteTracer } from './arenaFrameLog.ts'
import {
  createRoomClock,
  followRoomMatch,
  type RoomClock,
  type RoomMatchFeed,
} from './arenaMatchPhase.ts'
import { type ArenaParts, clearFrameLogs, LOCAL_PLAYER_ID, primaryWeaponOf } from './arenaParts.ts'
import { seatBotsOnTheBoard } from './arenaRestart.ts'
import {
  drainRoomScorestreaks,
  dropArenaBots,
  enlistArenaBots,
  followRoomScorestreaks,
} from './arenaScorestreaks.ts'
import type { ArenaFrame } from './arenaSession.ts'
import type { MutableMovementInput } from './wishDirection.ts'

/**
 * A sala vista pela sessão: o que o servidor de jogo decidiu e o cliente só
 * desenha. É o pedaço do `NetworkPort` que a sessão lê, por estrutura.
 */
export interface RoomFeed extends RoomMatchFeed {
  /** O `sessionId` deste jogador, ou `undefined` sem sala. */
  readonly ownId: string | undefined
  forEachRemote(
    nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void
  drainKills(visit: (kill: KillEvent) => void): void
  drainBoundaryDeaths(visit: (playerId: string) => void): void
  drainShots(visit: (shot: ShotMessage) => void): void
  takeOwnSpawn(): Vector3 | undefined
  /** O nome deste jogador, para os outros: a sessão o manda quando ele muda. */
  chooseCallsign(callsign: string): void
  /** A lâmina da classe, com o mesmo contrato do nome: o servidor anda o corpo com ela. */
  chooseMelee(weapon: MeleeWeapon): void
  /** A arma principal da classe, com o mesmo contrato do nome: os outros a desenham. */
  choosePrimary(weapon: PrimaryWeapon): void
  /** As séries de pontuação da escolha, com o mesmo contrato do nome (ADR 0029). */
  chooseScorestreaks(scorestreaks: readonly ScorestreakSlug[]): void
  /** Pede à sala a série do slot: quem decide se ela sai é o servidor. */
  requestScorestreak(slot: number): void
  drainScorestreakEarned(visit: (earned: ScorestreakEarnedMessage) => void): void
  drainScorestreakActivated(visit: (activated: ScorestreakActivatedMessage) => void): void
}

/**
 * Quem ocupa cada vaga de bot quando a sala é do servidor. Online, as vagas
 * dos bots viram **fantoches**: o corpo de cada uma é o que o patch de estado
 * diz, sem cérebro local, e o renderer, o placar e o killfeed os desenham como
 * desenham os bots (ADR 0016) — humano da sala ou bot do servidor, tanto faz.
 */
export interface PuppetSeats {
  /** O `sessionId` em cada vaga, na ordem dos bots; `undefined` é vaga livre. */
  readonly bySlot: (string | undefined)[]
  readonly roster: RemoteRoster
  readonly view: ReturnType<typeof createRemotePlayerView>
  /** O quadro como o servidor o lê, reaproveitado: `frameOnWire` roda a cada quadro. */
  readonly wireFrame: { elapsedS: number; readonly aimM: Vector3; cameraAimM: Readonly<Vector3> }
  /** O último nome mandado à sala; `undefined` antes do primeiro. */
  sentCallsign: string | undefined
  /** A última lâmina mandada à sala; `undefined` antes da primeira. */
  sentMelee: MeleeWeapon | undefined
  /** A última arma principal mandada à sala; `undefined` antes da primeira. */
  sentPrimary: PrimaryWeapon | undefined
  /** As últimas séries mandadas à sala; `undefined` antes das primeiras. */
  sentScorestreaks: readonly ScorestreakSlug[] | undefined
  /** O `sessionId` da sala em que a sessão está; outro é sala nova (`enterRoom`). */
  ownId: string | undefined
  /** O relógio da partida da sala, contado entre os patches (`arenaMatchPhase.ts`). */
  readonly roomClock: RoomClock
}

/**
 * Os métodos online da sessão, prontos para espalhar no objeto dela: a sala,
 * o quadro arredondado como o fio o leva, e os outros jogadores.
 *
 * ```ts
 * const session = { ...roomMethods(() => ({ session, options, parts })) }
 * ```
 */
export function roomMethods(scopeOf: () => CombatScope): {
  followRoom(feed: RoomFeed, nowMs: number, frameS: number): void
  forEachRoomPlayer(visit: (playerId: string, fighter: Readonly<Fighter>) => void): void
} {
  return {
    followRoom: (feed, nowMs, frameS) => {
      const scope = scopeOf()
      followRoom(scope, scope.parts.seats, feed, nowMs, frameS)
    },
    forEachRoomPlayer: (visit) => {
      const { parts } = scopeOf()
      forEachRoomPlayer(parts, parts.seats, visit)
    },
  }
}

/** O quadro que a sessão simula: online, com a mira arredondada como o fio a leva. */
export function frameForRoom(parts: ArenaParts, frame: Readonly<ArenaFrame>): Readonly<ArenaFrame> {
  return parts.online ? frameOnWire(frame, parts.seats) : frame
}

export function createPuppetSeats(slots: number): PuppetSeats {
  return {
    bySlot: Array.from({ length: slots }, () => undefined),
    roster: createRemoteRoster(),
    view: createRemotePlayerView(),
    wireFrame: { elapsedS: 0, aimM: { x: 0, y: 0, z: -1 }, cameraAimM: { x: 0, y: 0, z: -1 } },
    sentCallsign: undefined,
    sentMelee: undefined,
    sentPrimary: undefined,
    sentScorestreaks: undefined,
    ownId: undefined,
    roomClock: createRoomClock(),
  }
}

/**
 * A sala conectou: daqui em diante as vagas dos bots são dos jogadores da
 * sala, e todas começam vazias, fora da arena e fora do placar. As séries dos
 * fantoches são da sala: o livro local fica só com o jogador.
 */
function goOnline(parts: ArenaParts): void {
  parts.online = true
  for (const bot of parts.squad.bots) benchPuppet(parts, bot)
  dropArenaBots(parts.scorestreaks, parts.squad)
}

/**
 * A sala caiu: a arena volta a jogar sozinha, como antes da conexão. As vagas
 * esvaziam e os bots locais voltam, na conta do menu; sem isto, os outros
 * ficavam congelados e o jogador não morria mais, porque online a morte e o
 * respawn são da sala.
 */
function goOffline(scope: CombatScope, seats: PuppetSeats): void {
  const { parts, options } = scope
  parts.online = false
  seats.ownId = undefined
  // o ciclo volta a ser da sessão, numa partida que começa agora.
  scope.session.matchCycle = createMatchCycle({ warmup: false, timed: parts.timed })
  for (const playerId of seats.bySlot) {
    if (playerId !== undefined) releaseSeat(parts, seats, playerId)
  }
  seatBotsOnTheBoard(parts, options.config, parts.botCount)
  enlistArenaBots(parts.scorestreaks, parts.squad, parts.seedBase)
}

/**
 * O que a sala mudou desde o quadro anterior, antes do tick: onde o servidor
 * pôs este jogador para nascer, os outros jogadores, e as mortes. As mortes
 * passam pelo mesmo `scoreKill` das kills locais, e é assim que o placar, as
 * medalhas, o killfeed e a tela de morte funcionam online sem código novo.
 *
 * Quem saiu só libera a vaga depois das mortes e dos tiros: a kill de quem
 * saiu no mesmo quadro ainda acha o atirador, e a do jogador local o mata.
 *
 * ```ts
 * followRoom(scope, seats, network, performance.now(), frameS)
 * ```
 */
export function followRoom(
  scope: CombatScope,
  seats: PuppetSeats,
  feed: RoomFeed,
  nowMs: number,
  frameS: number,
): void {
  scope.parts.followsRoom = true
  clearFrameLogs(scope.parts)
  if (feed.ownId === undefined) {
    if (scope.parts.online) goOffline(scope, seats)
    return
  }
  if (feed.ownId !== seats.ownId) enterRoom(scope, seats, feed.ownId)
  announceClass(scope.parts, seats, feed)
  followRoomScorestreaks(scope.parts, seats, feed)
  // antes do spawn: a partida seguinte pede o spawn de novo (`restartOwnSpawn`).
  followRoomMatch(scope, seats.roomClock, feed, frameS)
  const spawn = feed.takeOwnSpawn()
  if (spawn) bornAt(scope, spawn)
  followRemotes(scope, seats, feed, nowMs, frameS)
}

/** Os outros jogadores e o que eles fizeram; a vaga de quem saiu, por último. */
function followRemotes(
  scope: CombatScope,
  seats: PuppetSeats,
  feed: RoomFeed,
  nowMs: number,
  frameS: number,
): void {
  seats.roster.beginFrame()
  feed.forEachRemote(nowMs, (playerId, fields) =>
    placePuppet(scope, seats, playerId, fields, frameS),
  )
  feed.drainKills((kill) => ingestKill(scope, seats, feed.ownId, kill))
  feed.drainBoundaryDeaths((playerId) => ingestBoundaryDeath(scope.parts, seats, playerId))
  feed.drainShots((shot) => ingestShot(scope.parts, seats, feed.ownId, shot))
  drainRoomScorestreaks(scope.parts, seats, feed)
  for (const playerId of seats.roster.endFrame()) releaseSeat(scope.parts, seats, playerId)
}

/**
 * Uma sala nova, a primeira ou a da fila: o assento nela começa do zero no
 * servidor, e o que a predição conta por assento recomeça junto. O tiro sem
 * luneta sorteia o cone pelo número do disparo, o rodízio da área escolhe o
 * spawn pelas mortes, e o placar compara o `atS` das kills, que na sala nova
 * volta a ser pequeno e caía na janela das medalhas de sequência.
 */
function enterRoom(scope: CombatScope, seats: PuppetSeats, ownId: string): void {
  const { session, parts } = scope
  seats.ownId = ownId
  if (!parts.online) goOnline(parts)
  parts.weapon.shotsFired = 0
  parts.boundary.outsideS = 0
  session.boundaryDeaths = 0
  resetScoreboard(parts.scoreboard)
  // o assento novo não tem série nenhuma pronta.
  resetScorestreakLedger(parts.scorestreaks)
  // a partida é da sala, que sempre tem relógio: a fase chega no primeiro estado.
  session.matchCycle = createMatchCycle({ warmup: false, timed: true })
}

/**
 * O nome do perfil, a lâmina e a arma principal vão à sala na entrada e a
 * cada partida que os troca. Sem a lâmina, o servidor andaria o corpo com a
 * antiga, e a predição com a nova seria corrigida a cada quadro; sem a arma
 * principal, os outros desenhariam a sniper errada na mão do jogador.
 */
function announceClass(parts: ArenaParts, seats: PuppetSeats, feed: RoomFeed): void {
  // o jogador local está no mapa desde a criação (`namesOf`).
  const callsign = parts.names.get(LOCAL_PLAYER_ID) as string
  announceOnChange(seats, 'sentCallsign', callsign, (sent) => feed.chooseCallsign(sent))
  announceOnChange(seats, 'sentMelee', parts.melee.weapon, (sent) => feed.chooseMelee(sent))
  const primary = primaryWeaponOf(parts, LOCAL_PLAYER_ID)
  announceOnChange(seats, 'sentPrimary', primary, (sent) => feed.choosePrimary(sent))
}

type AnnouncedKey = 'sentCallsign' | 'sentMelee' | 'sentPrimary'

/** Manda `value` à sala só quando ele mudou desde o último envio guardado em `seats[key]`. */
function announceOnChange<Key extends AnnouncedKey>(
  seats: PuppetSeats,
  key: Key,
  value: NonNullable<PuppetSeats[Key]>,
  send: (value: NonNullable<PuppetSeats[Key]>) => void,
): void {
  if (value === seats[key]) return
  seats[key] = value
  send(value)
}

/**
 * O spawn é do servidor: na entrada e na volta da morte, o corpo vai para
 * onde o patch diz, armado e vivo, e a tela de morte apaga.
 */
function bornAt(scope: CombatScope, feetM: Readonly<Vector3>): void {
  const { session, options, parts } = scope
  options.character.respawnAt(feetM)
  rearmWeapon(parts.weapon, options.config)
  rearmMelee(parts.melee)
  parts.local.alive = true
  parts.local.respawnLeftS = 0
  session.killedBy = null
}

/**
 * Um jogador remoto no quadro: a vaga dele, ou uma livre se ainda não tem.
 * Quem chegou com as vagas cheias tenta de novo a cada quadro: a vaga de quem
 * saiu no mesmo patch só libera no fim do quadro, e o recém-chegado ficaria
 * sem vaga para sempre se só a pedisse na chegada.
 */
function placePuppet(
  scope: CombatScope,
  seats: PuppetSeats,
  playerId: string,
  fields: PlayerSnapshotFields,
  frameS: number,
): void {
  seats.roster.visit(playerId)
  const seated = seats.bySlot.indexOf(playerId)
  const arrived = seated < 0
  const slot = arrived ? claimSeat(scope.parts, seats, playerId) : seated
  const bot = scope.parts.squad.bots[slot]
  if (!bot) return
  const view = readRemotePlayer(fields, seats.view)
  writePuppet(bot, view, frameS)
  // o placar, o killfeed e a voz leem o nome pelo id da vaga; o renderer, a arma.
  scope.parts.names.set(bot.id, fields.name || bot.callsign)
  scope.parts.primaries.set(bot.id, view.primary)
  // quem acabou de chegar não interpola da vaga anterior até onde está.
  if (arrived) copyCharacterState(bot.body, bot.previousBody)
}

/**
 * O corpo do fantoche é o do patch: posição, postura e mira. A velocidade sai
 * da diferença entre dois quadros, porque é ela que escolhe o clipe de andar.
 */
function writePuppet(
  bot: BotPlayer,
  view: ReturnType<typeof createRemotePlayerView>,
  frameS: number,
): void {
  copyCharacterState(bot.body, bot.previousBody)
  const { position, velocity } = bot.body
  if (frameS > 0) {
    velocity.x = (view.feetM.x - position.x) / frameS
    velocity.y = (view.feetM.y - position.y) / frameS
    velocity.z = (view.feetM.z - position.z) / frameS
  }
  Object.assign(position, view.feetM)
  bot.body.stance = view.stance
  bot.body.grounded = view.grounded
  Object.assign(bot.aimM, view.aim)
  Object.assign(bot.facingM, view.aim)
  bot.alive = view.alive
  // morto mas não no banco: o banco é `Infinity` (`isBenched`), e o morto da
  // sala volta quando o patch disser.
  bot.respawnLeftS = view.alive ? 0 : 1
}

/** A primeira vaga livre, com o placar dela zerado: quem chega começa do zero. */
function claimSeat(parts: ArenaParts, seats: PuppetSeats, playerId: string): number {
  const slot = seats.bySlot.indexOf(undefined)
  const bot = parts.squad.bots[slot]
  if (!bot) return -1
  seats.bySlot[slot] = playerId
  addPlayer(parts.scoreboard, bot.id)
  return slot
}

function releaseSeat(parts: ArenaParts, seats: PuppetSeats, playerId: string): void {
  const slot = seats.bySlot.indexOf(playerId)
  const bot = parts.squad.bots[slot]
  if (!bot) return
  seats.bySlot[slot] = undefined
  parts.names.set(bot.id, bot.callsign)
  // a vaga volta a ser bot, e o bot carrega a padrão.
  parts.primaries.delete(bot.id)
  benchPuppet(parts, bot)
}

function benchPuppet(parts: ArenaParts, bot: BotPlayer): void {
  bot.alive = false
  bot.respawnLeftS = Number.POSITIVE_INFINITY
  removePlayer(parts.scoreboard, bot.id)
}

/**
 * Os outros jogadores da sala, pelo id da sala: é o que a voz por proximidade
 * usa para pôr cada voz no corpo de quem fala.
 *
 * ```ts
 * session.forEachRoomPlayer((playerId, fighter) => voice.placeSpeaker(playerId, mouthOf(fighter)))
 * ```
 */
export function forEachRoomPlayer(
  parts: ArenaParts,
  seats: PuppetSeats,
  visit: (playerId: string, fighter: Readonly<Fighter>) => void,
): void {
  for (const [slot, playerId] of seats.bySlot.entries()) {
    const bot = parts.squad.bots[slot]
    if (playerId !== undefined && bot) visit(playerId, bot)
  }
}

/**
 * O índice de quem a sala chama de `playerId` na lista de combatentes: o
 * jogador local é o 0, e o fantoche da vaga `i` é o `i + 1`. -1 é quem a
 * sessão ainda não viu (a kill chegou antes do patch com ele).
 *
 * ```ts
 * fighterIndexOf(seats, feed.ownId, kill.shooterId) // 0 para o próprio jogador
 * ```
 */
export function fighterIndexOf(
  seats: PuppetSeats,
  ownId: string | undefined,
  playerId: string,
): number {
  if (playerId === ownId) return 0
  const slot = seats.bySlot.indexOf(playerId)
  return slot < 0 ? -1 : slot + 1
}

/** A kill da sala, com os ids da sala trocados pelos da sessão, no placar de sempre. */
function ingestKill(
  scope: CombatScope,
  seats: PuppetSeats,
  ownId: string | undefined,
  kill: Readonly<KillEvent>,
): void {
  const shooterIndex = fighterIndexOf(seats, ownId, kill.shooterId)
  const victimIndex = fighterIndexOf(seats, ownId, kill.victimId)
  const shooter = scope.parts.fighters[shooterIndex]
  const victim = scope.parts.fighters[victimIndex]
  if (!shooter || !victim) return
  const local: MutableKillEvent = Object.assign(scope.parts.kill, kill)
  local.shooterId = shooter.id
  local.victimId = (victim as Fighter).id
  scoreKill(scope, shooterIndex, victimIndex, local)
}

/**
 * O tiro de outro jogador da sala vira o rastro da vaga dele, o mesmo do bot
 * local: o renderer desenha o feixe e o clarão, e o som toca. O próprio tiro
 * já foi desenhado pela predição, e o de quem a sessão ainda não viu não tem
 * de onde sair.
 */
function ingestShot(
  parts: ArenaParts,
  seats: PuppetSeats,
  ownId: string | undefined,
  shot: Readonly<ShotMessage>,
): void {
  if (shot.shooterId === ownId) return
  const slot = seats.bySlot.indexOf(shot.shooterId)
  if (slot >= 0) noteTracer(parts.tracers, slot, shot.fromM, shot.toM, shot.hitFighter)
}

/** A própria morte fora da área já foi contada pela predição (`enforcePlayArea`). */
function ingestBoundaryDeath(parts: ArenaParts, seats: PuppetSeats, playerId: string): void {
  const bot = parts.squad.bots[seats.bySlot.indexOf(playerId)]
  if (bot) applyBoundaryDeath(parts.scoreboard, bot.id)
}

/**
 * O quadro como o servidor o lê: a mira passa pelo arredondamento do fio. O
 * gancho e a investida leem a mira, e com o valor cru a predição dispararia o
 * gancho num ponto que o servidor não acha.
 *
 * ```ts
 * advance(frameOnWire(frame, seats))
 * ```
 */
export function frameOnWire(frame: Readonly<ArenaFrame>, seats: PuppetSeats): ArenaFrame {
  const wire = seats.wireFrame
  wire.elapsedS = frame.elapsedS
  wire.cameraAimM = frame.aimM
  aimOnWire(frame.aimM, wire.aimM)
  return wire
}

/**
 * Online, a direção de andar arredondada como o servidor a recebe, pelo mesmo
 * motivo da mira; offline, a do teclado.
 */
export function wishForRoom(parts: ArenaParts, input: MutableMovementInput): void {
  if (!parts.online) return
  input.wishX = wishOnWire(input.wishX)
  input.wishZ = wishOnWire(input.wishZ)
}
