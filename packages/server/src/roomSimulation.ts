import {
  type ArenaLayout,
  type Arsenal,
  arenaCollisionBoxes,
  armMovementInput,
  type BoundaryClock,
  type CharacterState,
  createBoundaryClock,
  createCharacterState,
  createKillEvent,
  createMeleeHit,
  createMeleeReach,
  createMeleeState,
  createSeededRandom,
  createWeaponState,
  DEFAULT_PROFILE_NAME,
  decodeMovementInput,
  decodeWeaponInput,
  dequantizeAim,
  describeMeleeKill,
  eyeOf,
  type Fighter,
  type GameplayConfig,
  IDLE_INPUT,
  type KillEvent,
  killFighter,
  MATCH_SEED_BASE,
  MELEE_WEAPONS,
  type MeleeHit,
  type MeleeReach,
  type MeleeWeapon,
  type MutableKillEvent,
  type MutableMovementInput,
  type NavGraph,
  type PlayArea,
  parseRoomAddress,
  pickSpawn,
  profileNameLabel,
  rearmMelee,
  rearmWeapon,
  resolveFighterStrike,
  respawnCharacter,
  type SeededRandom,
  type ShotMessage,
  type StaticBox,
  spawnFeetM,
  stepArsenal,
  stepBoundary,
  stepCharacter,
  stepRespawnClock,
  type Vector3,
  type WireAim,
  type WireInput,
} from '@shobu/core'
import {
  createRoomBots,
  type RoomBots,
  seatRoomBots,
  stepRoomBots,
  warnBotsOfShot,
} from './roomBots.ts'
import {
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
  readonly bots: RoomBots
  readonly shot: RoomShot
  readonly strike: { readonly hit: MeleeHit; readonly reach: MeleeReach }
  /** A kill descrita, reaproveitada: o `onKill` copia o que quiser guardar. */
  readonly kill: MutableKillEvent
  readonly spawnRng: SeededRandom
  /** Segundos de sala: é o `atS` da kill. */
  matchTimeS: number
}

/**
 * Um jogador da sala: o lutador, a arma e a lâmina, o input do tick e o
 * crédito de input. A mira viaja já quantizada e volta igual para os outros.
 */
export interface RoomSeat {
  readonly fighter: Fighter & { readonly facingM: Vector3 }
  /** O mesmo objeto de `fighter.body`, mutável: é o que `stepCharacter` anda. */
  readonly body: CharacterState
  readonly arsenal: Arsenal
  readonly movementInput: MutableMovementInput
  readonly boundary: BoundaryClock
  /** A mira do último input, como chegou do fio. */
  aim: WireAim
  /** A mesma mira, unitária, em metros: de onde o tiro e o golpe saem. */
  readonly aimM: Vector3
  readonly eyeM: Vector3
  /** Mortes por sair da área: escolhem o spawn, como no cliente (`respawnOutOfBounds`). */
  boundaryDeaths: number
  /** Quantos inputs o jogador ainda pode aplicar; ver `INPUT_CREDIT_CAP`. */
  inputCredits: number
  /** O nome de perfil, já limpo; o padrão até o cliente mandar o dele. */
  callsign: string
}

/** O mundo fixo da sala: a configuração, a colisão, os spawns no pé e a área de jogo. */
export interface RoomRules {
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
export interface RoomIo {
  nextInput(playerId: string): WireInput | undefined
  readonly feetSeenBy: FeetSeenBy
  /** Uma kill de tiro ou de lâmina, para todos: cada cliente pontua a mesma lista. */
  onKill(kill: Readonly<KillEvent>): void
  /** Uma morte por sair da área de jogo, que o placar também conta. */
  onBoundaryDeath(playerId: string): void
  /** Um tiro, de humano ou de bot, para o rastro nos outros clientes. */
  onShot(shot: Readonly<ShotMessage>): void
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

/** Olhando para -z até o primeiro input dizer outra coisa. */
export const FORWARD_AIM: WireAim = { aimX: 0, aimY: 0, aimZ: -32767 }

export function createRoomSimulation(rules: RoomRules): RoomSimulation {
  const { config } = rules
  const fighters: Fighter[] = []
  const bots = createRoomBots(rules, fighters)
  fighters.push(...bots.squad.bots)
  const room: RoomSimulation = {
    seats: new Map(),
    fighters,
    bots,
    shot: createRoomShot(config),
    strike: { hit: createMeleeHit(), reach: createMeleeReach(config) },
    kill: createKillEvent(),
    // a mesma semente da partida, deslocada como a do cliente (`arenaParts`):
    // o spawn é do servidor, mas sortear com outra base não ganharia nada.
    spawnRng: createSeededRandom(MATCH_SEED_BASE ^ 0x5bd1_e995),
    matchTimeS: 0,
  }
  seatRoomBots(room, rules)
  return room
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
  const body = createCharacterState(spawnFor(room, rules), rules.config)
  const seat: RoomSeat = {
    fighter: { id: playerId, body, facingM: { x: 0, y: 0, z: -1 }, alive: true, respawnLeftS: 0 },
    body,
    arsenal: { weapon: createWeaponState(rules.config), melee: createMeleeState(meleeWeapon) },
    movementInput: { ...IDLE_INPUT },
    boundary: createBoundaryClock(),
    aim: FORWARD_AIM,
    aimM: { x: 0, y: 0, z: -1 },
    eyeM: { x: 0, y: 0, z: 0 },
    boundaryDeaths: 0,
    inputCredits: 0,
    callsign: DEFAULT_PROFILE_NAME,
  }
  room.seats.set(playerId, seat)
  room.fighters.push(seat.fighter)
  seatRoomBots(room, rules)
  return seat
}

function spawnFor(room: RoomSimulation, rules: RoomRules): Readonly<Vector3> {
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

/**
 * A lâmina da classe que o cliente escolheu (`LOADOUT_MESSAGE`). Vem da rede,
 * então só uma lâmina do jogo é aceita; o resto é ignorado e fica a que estava.
 *
 * ```ts
 * chooseMelee(room, client.sessionId, message.meleeWeapon)
 * ```
 */
export function chooseMelee(room: RoomSimulation, playerId: string, weapon: unknown): void {
  const seat = room.seats.get(playerId)
  if (!seat || !MELEE_WEAPONS.includes(weapon as MeleeWeapon)) return
  Object.assign(seat.arsenal.melee, createMeleeState(weapon as MeleeWeapon))
}

/**
 * O nome de perfil que o cliente mandou (`CALLSIGN_MESSAGE`). Vem da rede e
 * vai para os outros clientes: passa pela mesma limpeza do menu, e o que não
 * é nome vira o padrão.
 *
 * ```ts
 * nameSeat(room, client.sessionId, message.callsign)
 * ```
 */
export function nameSeat(room: RoomSimulation, playerId: string, callsign: unknown): void {
  const seat = room.seats.get(playerId)
  if (seat) seat.callsign = profileNameLabel(callsign)
}

export function leaveRoom(room: RoomSimulation, playerId: string, rules: RoomRules): void {
  const seat = room.seats.get(playerId)
  if (!seat) return
  room.seats.delete(playerId)
  room.fighters.splice(room.fighters.indexOf(seat.fighter), 1)
  seatRoomBots(room, rules)
}

/**
 * Um tick do servidor: o relógio de quem está morto, e cada jogador ganha um
 * crédito e aplica os inputs que chegaram enquanto houver crédito, um tick de
 * personagem por input. Sem input, o jogador fica parado: repetir o último
 * input faria o servidor simular ticks que o cliente nunca simulou, e a
 * reconciliação não fecharia.
 *
 * ```ts
 * stepRoom(room, { nextInput, feetSeenBy, onKill, onBoundaryDeath }, rules)
 * ```
 */
export function stepRoom(room: RoomSimulation, io: RoomIo, rules: RoomRules): void {
  const dtS = 1 / rules.config.simulation.tickHz
  room.matchTimeS += dtS
  for (const [playerId, seat] of room.seats) {
    if (stepRespawnClock(seat.fighter, dtS)) respawnSeat(seat, spawnFor(room, rules), rules)
    seat.inputCredits = Math.min(INPUT_CREDIT_CAP, seat.inputCredits + 1)
    while (seat.inputCredits >= 1) {
      const wire = io.nextInput(playerId)
      if (!wire) break
      seat.inputCredits -= 1
      applyInput(room, seat, wire, io, rules)
    }
  }
  stepRoomBots(room, io, rules)
}

/**
 * Um input, na ordem do cliente (`stepLocalPlayer`): a arma antes do corpo, o
 * tiro e o golpe do olho do tick, antes de o corpo andar, e o limite da área
 * depois dele. O morto não atira nem anda; o input é consumido assim mesmo,
 * para a confirmação seguir andando.
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
  seat.aim = { aimX: wire.aimX, aimY: wire.aimY, aimZ: wire.aimZ }
  Object.assign(seat.fighter.facingM, dequantizeAim(wire, seat.aimM))
  if (!seat.fighter.alive) return
  stepArsenal(seat.arsenal, decodeWeaponInput(wire), seat.body, seat.aimM, config, dtS)
  if (seat.arsenal.weapon.firedThisTick) fireRoomShot(room, seat, io, rules)
  if (seat.arsenal.melee.struckThisTick) strikeFrom(room, seat, io, rules)
  decodeMovementInput(wire, seat.movementInput)
  armMovementInput(seat.arsenal, seat.movementInput)
  stepCharacter(seat.body, seat.movementInput, boxes, config, dtS)
  enforcePlayArea(seat, io, rules)
}

function fireRoomShot(room: RoomSimulation, seat: RoomSeat, io: RoomIo, rules: RoomRules): void {
  const { config, boxes } = rules
  const victim = resolveRoomShot(room.shot, room.fighters, seat, io.feetSeenBy, boxes, config)
  const shooterIndex = room.fighters.indexOf(seat.fighter)
  const toM = room.shot.hit.endpointM
  warnBotsOfShot(room, shooterIndex, room.shot.origin, toM, rules)
  const hitFighter = victim !== undefined
  io.onShot({ shooterId: seat.fighter.id, fromM: room.shot.origin, toM, hitFighter })
  if (!victim) return
  killFighter(victim, config.match.respawnDelayS)
  io.onKill(describeRoomKill(room.shot, seat, victim, room.kill, room.matchTimeS))
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
  if (!victim) return
  killFighter(victim, config.match.respawnDelayS)
  const atS = room.matchTimeS
  const hit = room.strike.hit
  io.onKill(describeMeleeKill(room.kill, { striker: seat.fighter, victim, weapon, hit, atS }))
}

/**
 * Prazo vencido fora da área: a morte conta no placar, e o spawn é o do
 * rodízio por mortes, o mesmo que o cliente escolhe sozinho
 * (`respawnOutOfBounds`), para a predição não ser corrigida.
 */
function enforcePlayArea(seat: RoomSeat, io: RoomIo, rules: RoomRules): void {
  const { config, playArea, spawnsFeetM } = rules
  const graceS = config.match.outOfBoundsGraceS
  const dtS = 1 / config.simulation.tickHz
  if (stepBoundary(seat.boundary, playArea, seat.body.position, dtS, graceS) !== 'expired') return
  const feetM = spawnsFeetM[seat.boundaryDeaths % spawnsFeetM.length] as Readonly<Vector3>
  seat.boundaryDeaths += 1
  respawnSeat(seat, feetM, rules)
  io.onBoundaryDeath(seat.fighter.id)
}

/** Corpo, arma, lâmina e contagem da área de volta ao começo, no pé dado. */
function respawnSeat(seat: RoomSeat, feetM: Readonly<Vector3>, rules: RoomRules): void {
  respawnCharacter(seat.body, feetM, rules.config)
  rearmWeapon(seat.arsenal.weapon, rules.config)
  rearmMelee(seat.arsenal.melee)
  seat.boundary.outsideS = 0
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
