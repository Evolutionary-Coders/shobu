import {
  type ArenaLayout,
  arenaCollisionBoxes,
  armMovementInput,
  createCharacterState,
  createKillEvent,
  createMeleeHit,
  createMeleeReach,
  createScoreboard,
  createSeededRandom,
  decodeMovementInput,
  decodeWeaponInput,
  dequantizeAim,
  describeMeleeKill,
  eyeOf,
  type Fighter,
  forgetFighters,
  type GameplayConfig,
  type KillEvent,
  killFighter,
  MATCH_SEED_BASE,
  type MatchCycleEdge,
  type MatchSummaryRow,
  type MedalAward,
  type MeleeHit,
  type MeleeReach,
  type MeleeWeapon,
  type MutableKillEvent,
  matchPhaseFrozen,
  type NavGraph,
  noteYaw,
  type PlayArea,
  parseRoomAddress,
  pickSpawn,
  resolveFighterStrike,
  type Scoreboard,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type SeededRandom,
  type ShotMessage,
  type StaticBox,
  spawnFeetM,
  stepArsenal,
  stepBoundary,
  stepCharacter,
  stepRespawnClock,
  type Vector3,
  type WireInput,
} from '@shobu/core'
import { noteSeatInput, stepRoomAfk } from './roomAfk.ts'
import {
  createRoomBots,
  type RoomBots,
  seatRoomBots,
  stepRoomBots,
  warnBotsOfShot,
} from './roomBots.ts'
import { type InputQueueIo, trimStandingBacklog } from './roomInputBacklog.ts'
import {
  createRoomMatch,
  type MatchEndReason,
  type RoomMatch,
  roomScores,
  stepRoomMatch,
} from './roomMatch.ts'
import {
  scoreRoomBoundaryDeath,
  scoreRoomKill,
  seatRoomScore,
  unseatRoomScore,
} from './roomScoreboard.ts'
import {
  createRoomScorestreaks,
  dropSeatScorestreaks,
  enlistSeatScorestreaks,
  type RoomScorestreaks,
  stepRoomScorestreaks,
} from './roomScorestreaks.ts'
import { createSeat, type RoomSeat, respawnSeat } from './roomSeat.ts'
import { freeSeatAccentOf } from './roomSeatLooks.ts'
import {
  announceRoomShot,
  createRoomShot,
  describeRoomKill,
  type FeetSeenBy,
  type RoomShot,
  resolveRoomShot,
} from './roomShot.ts'
import { type RoomStateSink, writeRoomState } from './roomState.ts'

/**
 * A sala do servidor de jogo sem o colyseus: os lutadores do núcleo
 * (`fighter.ts`), um por jogador, andando pelos inputs de cada um. A
 * `gameRoom.ts` só liga isto ao colyseus; tudo que decide alguma coisa mora
 * aqui, testado.
 */
export interface RoomSimulation {
  readonly seats: Map<string, RoomSeat>
  /**
   * Os lutadores: os bots primeiro, na ordem do esquadrão, e os humanos na
   * ordem de entrada. Os bots na frente deixam o índice de cada um fixo, que
   * é como o bot se reconhece (`aimAndTrigger`) quando alguém entra ou sai.
   */
  readonly fighters: Fighter[]
  /** Trocados inteiros na virada de mapa: a colisão, o grafo e os spawns são do mapa. */
  bots: RoomBots
  readonly shot: RoomShot
  readonly strike: { readonly hit: MeleeHit; readonly reach: MeleeReach }
  /** A kill descrita, reaproveitada: o `onKill` copia o que quiser guardar. */
  readonly kill: MutableKillEvent
  readonly spawnRng: SeededRandom
  /** O placar oficial (ADR 0031): um só, para séries, limite, MVP e tab. */
  readonly board: Scoreboard
  /** Rascunho de `recordKill`: as medalhas somam pontos, mas ninguém as lê aqui. */
  readonly medals: MedalAward[]
  /** As séries de cada um (ADR 0029). */
  readonly scorestreaks: RoomScorestreaks
  /**
   * Segundos de sala: é o `atS` da kill. Só cresce, de uma partida para a
   * outra; o relógio da partida é o de `match`.
   */
  matchTimeS: number
  /** A fase da partida e o relógio dela (ADR 0031). */
  readonly match: RoomMatch
  /**
   * As regras do mapa de agora: o `arenaId` vai no estado para quem entra, e
   * trocam inteiras quando o voto escolhe outro mapa.
   */
  rules: RoomRules
  /** Os mapas que a sala pode votar, na ordem do catálogo, com as regras de cada um. */
  readonly arenas: ReadonlyMap<string, RoomRules>
}

/** O mundo fixo da sala: o mapa, a configuração, a colisão, os spawns no pé e a área de jogo. */
export interface RoomRules {
  /** O `id` do mapa no catálogo. */
  readonly arenaId: string
  readonly config: GameplayConfig
  readonly boxes: readonly StaticBox[]
  readonly spawnsFeetM: readonly Readonly<Vector3>[]
  readonly playArea: PlayArea
  /** Por onde os bots andam (ADR 0016). */
  readonly navGraph: NavGraph
}

/**
 * As regras da sala para um mapa do catálogo: a mesma colisão que o cliente
 * monta (`arenaCollisionBoxes`) e os spawns no pé, na ordem do mapa, que é a
 * ordem do rodízio de quem sai da área.
 *
 * ```ts
 * createGameRoom({ ...roomRulesFor(NEON_KAIDO_LAYOUT, config), lifecycle, voice })
 * ```
 */
export function roomRulesFor(layout: ArenaLayout, config: GameplayConfig): RoomRules {
  const capsuleHeightM = config.collision.capsuleHeightM
  return {
    arenaId: layout.id,
    config,
    boxes: arenaCollisionBoxes(layout),
    spawnsFeetM: layout.spawnPointsM.map((eyeM) => {
      const [x, y, z] = spawnFeetM(eyeM, capsuleHeightM)
      return { x, y, z }
    }),
    playArea: layout.playArea,
    navGraph: layout.navGraph(),
  }
}

/** O que a sala lê e avisa a cada tick; o colyseus do lado do servidor, fakes nos testes. */
export interface RoomIo extends InputQueueIo {
  readonly feetSeenBy: FeetSeenBy
  /**
   * Uma kill de tiro ou de lâmina, para todos, com as medalhas que o placar
   * oficial deu a ela: o cliente as anuncia em vez de decidir pelo placar dele.
   */
  onKill(kill: Readonly<KillEvent>, medals: readonly MedalAward[]): void
  /** Uma morte por sair da área de jogo, que o placar também conta. */
  onBoundaryDeath(playerId: string): void
  /** Um tiro, de humano ou de bot, para o rastro nos outros clientes. */
  onShot(shot: Readonly<ShotMessage>): void
  /** A série ficou pronta: só o dono sabe, e é dele a marca de pronta. */
  onScorestreakEarned(playerId: string, earned: Readonly<ScorestreakEarnedMessage>): void
  /** Alguém acionou uma série, para todos. */
  onScorestreakActivated(activated: Readonly<ScorestreakActivatedMessage>): void
  /** A partida mudou de fase; o estado da sala já leva a fase, e isto é o log. */
  onMatchEdge(edge: MatchCycleEdge): void
  /** A partida acabou: o resumo, do MVP ao último, para todos, e o porquê para o log. */
  onMatchSummary(summary: readonly MatchSummaryRow[], reason: MatchEndReason): void
  /** A partida seguinte começou, no mapa dado; `mapChanged` quando o voto trocou o mapa. */
  onNextMatch(arenaId: string, mapChanged: boolean): void
  /** O jogador está parado há `afkWarnS`: sai da sala em `secondsLeft` se nada mudar. */
  onAfkWarning(playerId: string, secondsLeft: number): void
  /** O jogador ficou parado `afkKickS` com a partida valendo: a vaga é de quem espera. */
  onAfkKick(playerId: string): void
}

/**
 * O teto do balde de crédito de input, em ticks: 133 ms a 60 Hz.
 *
 * Cada tick do servidor dá um crédito ao jogador, e cada input aplicado gasta
 * um. Sem balde, consumir um input por tick nunca esvazia o atraso que um
 * soluço de rede acumula, e o jogador ficaria para sempre esse tanto atrás;
 * consumir tudo o que chegou deixaria um cliente adulterado mandar inputs mais
 * rápido e andar mais rápido. Com o balde, ninguém passa de um input por tick
 * na média, e o atraso de um soluço de até 133 ms é recuperado.
 */
export const INPUT_CREDIT_CAP = 8

/**
 * A sala nova no mapa das regras dadas. O catálogo é o que o voto oferece; sem
 * ele, a sala só conhece o próprio mapa.
 *
 * ```ts
 * createRoomSimulation(rulesById.get('neon-kaido'), rulesById)
 * ```
 */
export function createRoomSimulation(
  rules: RoomRules,
  arenas: ReadonlyMap<string, RoomRules> = new Map([[rules.arenaId, rules]]),
): RoomSimulation {
  assertInCatalog(rules, arenas)
  const { fighters, bots } = squadOf(rules)
  const room: RoomSimulation = {
    seats: new Map(),
    fighters,
    bots,
    shot: createRoomShot(rules.config),
    strike: { hit: createMeleeHit(), reach: createMeleeReach(rules.config) },
    kill: createKillEvent(),
    // a semente da partida deslocada como no cliente (`arenaParts`): outra base não ganharia nada.
    spawnRng: createSeededRandom(MATCH_SEED_BASE ^ 0x5bd1_e995),
    // vazio: `seatRoomBots`, no fim, dá a linha e as séries de cada bot sentado.
    board: createScoreboard(),
    medals: [],
    scorestreaks: createRoomScorestreaks(),
    matchTimeS: 0,
    match: createRoomMatch(rules.config.match),
    rules,
    arenas,
  }
  seatRoomBots(room, rules)
  return room
}

/** Os bots do mapa, e a lista de lutadores que começa por eles. */
function squadOf(rules: RoomRules): { fighters: Fighter[]; bots: RoomBots } {
  const fighters: Fighter[] = []
  const bots = createRoomBots(rules, fighters)
  fighters.push(...bots.squad.bots)
  return { fighters, bots }
}

function assertInCatalog(rules: RoomRules, arenas: ReadonlyMap<string, RoomRules>): void {
  if (arenas.get(rules.arenaId) === rules) return
  throw new Error(
    `createRoomSimulation recebeu o mapa '${rules.arenaId}' fora do catálogo [${[...arenas.keys()].join(', ')}]; esperado as regras do próprio catálogo`,
  )
}

/**
 * Entra num spawn sorteado longe de quem está vivo (`pickSpawn`), com a
 * lâmina da classe que o jogador escolheu.
 *
 * ```ts
 * joinRoom(room, client.sessionId, 'katana', rules)
 * ```
 */
export function joinRoom(
  room: RoomSimulation,
  playerId: string,
  meleeWeapon: MeleeWeapon,
  rules: RoomRules,
): RoomSeat {
  if (room.seats.has(playerId)) {
    throw new Error(`joinRoom recebeu '${playerId}', que já está na sala; esperado id novo`)
  }
  const seat = createSeat(playerId, createCharacterState(spawnFor(room, rules), rules.config), {
    meleeWeapon,
    config: rules.config,
  })
  // a inatividade conta da entrada, e não do zero da sala.
  seat.activeAtS = room.matchTimeS
  room.seats.set(playerId, seat)
  room.fighters.push(seat.fighter)
  seatRoomScore(room, playerId)
  enlistSeatScorestreaks(room, playerId)
  seatRoomBots(room, rules)
  // depois dos bots: o que foi para o banco na entrada solta a cor dele.
  seat.accent = freeSeatAccentOf(room, playerId)
  return seat
}

/**
 * Um spawn do mapa, sorteado longe de quem está vivo (`pickSpawn`).
 *
 * ```ts
 * respawnSeat(seat, spawnFor(room, rules), rules)
 * ```
 */
export function spawnFor(room: RoomSimulation, rules: RoomRules): Readonly<Vector3> {
  const index = pickSpawn(rules.spawnsFeetM, room.fighters, room.spawnRng)
  return rules.spawnsFeetM[index] as Readonly<Vector3>
}

/**
 * Entra e já escreve o estado de todos. O primeiro patch com o jogador novo
 * pode sair antes do próximo tick; sem esta escrita ele levaria zeros, e os
 * outros clientes veriam o jogador no centro da arena saltando para o spawn.
 *
 * ```ts
 * admitPlayer(room, sessionId, 'knife', rules, sink)
 * ```
 */
export function admitPlayer(
  room: RoomSimulation,
  playerId: string,
  meleeWeapon: MeleeWeapon,
  rules: RoomRules,
  sink: RoomStateSink,
): RoomSeat {
  const seat = joinRoom(room, playerId, meleeWeapon, rules)
  writeRoomState(room, sink)
  return seat
}

export function leaveRoom(room: RoomSimulation, playerId: string, rules: RoomRules): void {
  const seat = room.seats.get(playerId)
  if (!seat) return
  room.seats.delete(playerId)
  unseatRoomScore(room, playerId)
  dropSeatScorestreaks(room, playerId)
  room.fighters.splice(room.fighters.indexOf(seat.fighter), 1)
  // a lista encurtou: o alvo que cada bot guarda pela posição não vale mais.
  for (const bot of room.bots.squad.bots) forgetFighters(bot.mind)
  seatRoomBots(room, rules)
}

/**
 * Sai e já escreve o estado de todos, como `admitPlayer`. O bot que volta do
 * banco no lugar de quem saiu já está vivo; sem esta escrita ele ficaria sem
 * estado até o próximo tick, e um tiro antes disso não acharia o alvo no
 * rewind (`feetSeenBy`) e derrubaria o servidor inteiro.
 *
 * ```ts
 * dismissPlayer(room, client.sessionId, rules, sink)
 * ```
 */
export function dismissPlayer(
  room: RoomSimulation,
  playerId: string,
  rules: RoomRules,
  sink: RoomStateSink,
): void {
  leaveRoom(room, playerId, rules)
  sink.drop(playerId)
  writeRoomState(room, sink)
}

/**
 * Um tick do servidor: o relógio de quem está morto, e cada jogador ganha um
 * crédito e aplica os inputs que chegaram enquanto houver crédito, um tick de
 * personagem por input. Sem input, o jogador fica parado: repetir o último
 * input faria o servidor simular ticks que o cliente nunca simulou, e a
 * reconciliação não fecharia.
 *
 * ```ts
 * stepRoom(room, io, rules)
 * ```
 */
export function stepRoom(room: RoomSimulation, io: RoomIo, rules: RoomRules): void {
  const dtS = 1 / rules.config.simulation.tickHz
  room.matchTimeS += dtS
  // a virada de mapa troca as regras: o resto deste tick leria as do mapa velho.
  if (stepRoomMatch(room, io, rules) === 'next') return
  for (const [playerId, seat] of room.seats) stepSeat(room, playerId, seat, io, rules)
  // a arena congelada também para os bots: eles não têm input para consumir.
  if (!matchPhaseFrozen(room.match.cycle)) stepRoomBots(room, io, rules)
  stepRoomScorestreaks(room, io)
  stepRoomAfk(room, io)
}

/**
 * O relógio do morto, o crédito do tick e os inputs que o crédito paga. Quem
 * está longe (`away`) fica fora de jogo até voltar: o relógio dele não anda.
 */
function stepSeat(
  room: RoomSimulation,
  playerId: string,
  seat: RoomSeat,
  io: RoomIo,
  rules: RoomRules,
): void {
  if (seat.away) return
  const dtS = 1 / rules.config.simulation.tickHz
  // quem voltou da recarga e ainda não pegou o controle nasce no `seatTookControl`.
  const revives = !seat.awaitsControl && stepRespawnClock(seat.fighter, dtS)
  if (revives) respawnSeat(seat, spawnFor(room, rules), rules)
  seat.inputCredits = Math.min(INPUT_CREDIT_CAP, seat.inputCredits + 1)
  while (seat.inputCredits >= 1) {
    const wire = io.nextInput(playerId)
    if (!wire) break
    seat.inputCredits -= 1
    applyInput(room, seat, wire, io, rules)
  }
  trimStandingBacklog(seat.inputBacklog, playerId, io)
}

/**
 * Um input, na ordem do cliente (`stepLocalPlayer`): a arma antes do corpo, o
 * tiro e o golpe do olho do tick, antes de o corpo andar, e o limite da área
 * depois dele. O morto não atira nem anda, e ninguém anda com a arena
 * congelada; o input é consumido assim mesmo, para a confirmação seguir andando.
 */
function applyInput(
  room: RoomSimulation,
  seat: RoomSeat,
  wire: WireInput,
  io: RoomIo,
  rules: RoomRules,
): void {
  const { config, boxes } = rules
  const dtS = 1 / config.simulation.tickHz
  noteSeatInput(seat, wire, room.matchTimeS)
  seat.aim = { aimX: wire.aimX, aimY: wire.aimY, aimZ: wire.aimZ }
  Object.assign(seat.fighter.facingM, dequantizeAim(wire, seat.aimM))
  noteYaw(seat.spin, room.matchTimeS, seat.aimM)
  if (matchPhaseFrozen(room.match.cycle)) return
  if (!seat.fighter.alive) return
  stepArsenal(seat.arsenal, decodeWeaponInput(wire), seat.body, seat.aimM, config, dtS)
  if (seat.arsenal.weapon.firedThisTick) fireRoomShot(room, seat, io, rules)
  if (seat.arsenal.melee.struckThisTick) strikeFrom(room, seat, io, rules)
  decodeMovementInput(wire, seat.movementInput)
  armMovementInput(seat.arsenal, seat.movementInput)
  stepCharacter(seat.body, seat.movementInput, boxes, config, dtS)
  enforcePlayArea(room, seat, io, rules)
}

function fireRoomShot(room: RoomSimulation, seat: RoomSeat, io: RoomIo, rules: RoomRules): void {
  const { config, boxes } = rules
  const victim = resolveRoomShot(room.shot, room.fighters, seat, io.feetSeenBy, boxes, config)
  const shooterIndex = room.fighters.indexOf(seat.fighter)
  const toM = room.shot.hit.endpointM
  warnBotsOfShot(room, shooterIndex, room.shot.origin, toM, rules)
  const hitFighter = victim !== undefined
  announceRoomShot(room, io, {
    shooterId: seat.fighter.id,
    fromM: room.shot.origin,
    toM,
    hitFighter,
  })
  if (!victim || !roomScores(room)) return
  killFighter(victim, config.match.respawnDelayS)
  const kill = describeRoomKill(room.shot, seat, victim, room.kill, room.matchTimeS, config)
  scoreRoomKill(room, io, kill, rules)
}

/**
 * O golpe contra as posições de agora, sem rewind: o alcance da lâmina é de
 * dois metros, e a vítima anda poucos centímetros no meio RTT.
 * ponytail: rebobinar o golpe como o tiro entra se a lâmina errar em jogo
 * quem a tela mostrava dentro do arco (ADR 0021).
 */
function strikeFrom(room: RoomSimulation, seat: RoomSeat, io: RoomIo, rules: RoomRules): void {
  const { config, boxes } = rules
  const strikerIndex = room.fighters.indexOf(seat.fighter)
  const weapon = seat.arsenal.melee.weapon
  const victimIndex = resolveFighterStrike(
    { strikerIndex, eyeM: eyeOf(seat.body, seat.eyeM), aimM: seat.aimM, weapon },
    room.fighters,
    { boxes, config, reach: room.strike.reach },
    room.strike.hit,
  )
  const victim = room.fighters[victimIndex]
  if (!victim || !roomScores(room)) return
  killFighter(victim, config.match.respawnDelayS)
  const atS = room.matchTimeS
  const hit = room.strike.hit
  const kill = describeMeleeKill(room.kill, { striker: seat.fighter, victim, weapon, hit, atS })
  scoreRoomKill(room, io, kill, rules)
}

/**
 * Prazo vencido fora da área: a morte conta no placar, e o spawn é o do
 * rodízio por mortes, o mesmo que o cliente escolhe sozinho
 * (`respawnOutOfBounds`), para a predição não ser corrigida. No aquecimento
 * a volta ao spawn acontece igual, mas a morte não conta.
 */
function enforcePlayArea(room: RoomSimulation, seat: RoomSeat, io: RoomIo, rules: RoomRules): void {
  const { config, playArea, spawnsFeetM } = rules
  const graceS = config.match.outOfBoundsGraceS
  const dtS = 1 / config.simulation.tickHz
  if (stepBoundary(seat.boundary, playArea, seat.body.position, dtS, graceS) !== 'expired') return
  const feetM = spawnsFeetM[seat.boundaryDeaths % spawnsFeetM.length] as Readonly<Vector3>
  seat.boundaryDeaths += 1
  respawnSeat(seat, feetM, rules)
  if (roomScores(room)) scoreRoomBoundaryDeath(room, io, seat.fighter.id)
}

/**
 * O endereço vem do diretório do matchmaking, já canônico; um não canônico,
 * como `10.0.0.07`, abriria uma segunda sala para o mesmo endereço.
 */
export function assertCanonicalAddress(address: string | undefined): asserts address is string {
  if (address === undefined || parseRoomAddress(address) !== address) {
    throw new Error(
      `endereço de sala '${address}' não é canônico; esperado ipv4 como '203.0.113.7'`,
    )
  }
}
