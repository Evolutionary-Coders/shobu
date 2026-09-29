import {
  createMatch,
  decodeMovementInput,
  encodeStance,
  type GameplayConfig,
  joinMatch,
  leaveMatch,
  type Match,
  type MatchPlayer,
  parseRoomAddress,
  quantizePositionM,
  type StaticBox,
  spawnFeetM,
  stepMatchPlayer,
  type WireAim,
  type WireInput,
} from '@shobu/core'

/**
 * A sala do servidor de jogo sem o colyseus: a partida do núcleo, a mira de
 * cada jogador e a conta de entradas que escolhe o spawn. A `gameRoom.ts` só
 * liga isto ao colyseus; tudo que decide alguma coisa mora aqui, testado.
 */
export interface RoomSimulation {
  readonly match: Match
  readonly seats: Map<string, RoomSeat>
  joins: number
}

/** Um jogador da sala: o personagem da partida, a última mira e o crédito de input. */
export interface RoomSeat {
  readonly player: MatchPlayer
  /** A mira viaja já quantizada e volta igual para os outros clientes. */
  aim: WireAim
  /** Quantos inputs o jogador ainda pode aplicar; ver `INPUT_CREDIT_CAP`. */
  inputCredits: number
}

/**
 * O teto do balde de crédito de input, em ticks: 125 ms a 64 Hz.
 *
 * Cada tick do servidor dá um crédito ao jogador, e cada input aplicado gasta
 * um. Sem balde, consumir um input por tick nunca esvazia o atraso que um
 * soluço de rede acumula, e o jogador ficaria para sempre esse tanto atrás;
 * consumir tudo o que chegou deixaria um cliente adulterado mandar inputs mais
 * rápido e andar mais rápido. Com o balde, ninguém passa de um input por tick
 * na média, e o atraso de um soluço de até 125 ms é recuperado.
 */
export const INPUT_CREDIT_CAP = 8

/** Os pontos de spawn, na convenção de altura de olho de `GREYBOX_SPAWN_POINTS_M`. */
export type SpawnPoints = readonly (readonly [number, number, number])[]

/** Os campos que o `PlayerState` do schema tem; o schema os satisfaz por estrutura. */
export interface PlayerStateFields {
  x: number
  y: number
  z: number
  aimX: number
  aimY: number
  aimZ: number
  stance: number
}

/** Olhando para -z até o primeiro input dizer outra coisa. */
export const FORWARD_AIM: WireAim = { aimX: 0, aimY: 0, aimZ: -32767 }

export function createRoomSimulation(): RoomSimulation {
  return { match: createMatch(), seats: new Map(), joins: 0 }
}

/**
 * Entra no spawn seguinte, na ordem da lista, e volta ao primeiro depois do
 * último. A escolha de spawn por distância aos outros jogadores é da fatia do
 * respawn; aqui basta não empilhar quem entra.
 *
 * ```ts
 * joinRoom(room, client.sessionId, GREYBOX_SPAWN_POINTS_M, config)
 * ```
 */
export function joinRoom(
  room: RoomSimulation,
  playerId: string,
  spawns: SpawnPoints,
  config: GameplayConfig,
): MatchPlayer {
  const eyeM = spawns[room.joins % spawns.length]
  if (!eyeM)
    throw new Error(`joinRoom recebeu ${spawns.length} pontos de spawn; esperado ao menos 1`)
  room.joins += 1
  const [x, y, z] = spawnFeetM(eyeM, config.collision.capsuleHeightM)
  const player = joinMatch(room.match, playerId, { x, y, z }, config)
  room.seats.set(playerId, { player, aim: FORWARD_AIM, inputCredits: 0 })
  return player
}

/**
 * Entra e já escreve o estado de todos. O primeiro patch com o jogador novo
 * pode sair antes do próximo tick; sem esta escrita ele levaria zeros, e os
 * outros clientes veriam o jogador no centro da arena saltando para o spawn.
 *
 * ```ts
 * state.players.set(sessionId, new PlayerState())
 * admitPlayer(room, sessionId, spawns, config, (id) => state.players.get(id))
 * ```
 */
export function admitPlayer(
  room: RoomSimulation,
  playerId: string,
  spawns: SpawnPoints,
  config: GameplayConfig,
  stateOf: (playerId: string) => PlayerStateFields | undefined,
): MatchPlayer {
  const player = joinRoom(room, playerId, spawns, config)
  writeRoomState(room, stateOf)
  return player
}

export function leaveRoom(room: RoomSimulation, playerId: string): void {
  leaveMatch(room.match, playerId)
  room.seats.delete(playerId)
}

/**
 * Um tick do servidor: cada jogador ganha um crédito e aplica os inputs que
 * chegaram enquanto houver crédito, um tick de personagem por input. Sem input,
 * o jogador fica parado: repetir o último input faria o servidor simular ticks
 * que o cliente nunca simulou, e a reconciliação não fecharia.
 *
 * ```ts
 * stepRoom(room, (id) => this.inputs.get(id).next(), boxes, config)
 * ```
 */
export function stepRoom(
  room: RoomSimulation,
  nextInput: (playerId: string) => WireInput | undefined,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): void {
  for (const [playerId, seat] of room.seats) {
    seat.inputCredits = Math.min(INPUT_CREDIT_CAP, seat.inputCredits + 1)
    while (seat.inputCredits >= 1) {
      const wire = nextInput(playerId)
      if (!wire) break
      seat.inputCredits -= 1
      stepMatchPlayer(room.match, playerId, decodeMovementInput(wire, false), boxes, config)
      seat.aim = { aimX: wire.aimX, aimY: wire.aimY, aimZ: wire.aimZ }
    }
  }
}

/**
 * Escreve o snapshot quantizado de cada jogador no estado que o colyseus
 * sincroniza. Jogador sem estado ainda criado fica para o próximo tick.
 */
export function writeRoomState(
  room: RoomSimulation,
  stateOf: (playerId: string) => PlayerStateFields | undefined,
): void {
  for (const [playerId, { player, aim }] of room.seats) {
    const out = stateOf(playerId)
    if (!out) continue
    const { position, stance, grounded } = player.character
    out.x = quantizePositionM(position.x)
    out.y = quantizePositionM(position.y)
    out.z = quantizePositionM(position.z)
    out.aimX = aim.aimX
    out.aimY = aim.aimY
    out.aimZ = aim.aimZ
    out.stance = encodeStance(stance, grounded)
  }
}

/**
 * O `filterBy` do colyseus compara o texto cru. Um endereço não canônico,
 * como `10.0.0.07`, abriria uma segunda sala para o mesmo endereço, então o
 * servidor recusa e o cliente normaliza antes de pedir.
 */
export function assertCanonicalAddress(address: string | undefined): void {
  if (address === undefined || parseRoomAddress(address) !== address) {
    throw new Error(
      `endereço de sala '${address}' não é canônico; esperado ipv4 como '203.0.113.7'`,
    )
  }
}
