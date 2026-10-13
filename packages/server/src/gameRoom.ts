import { type Client, type Rewind, Room } from '@colyseus/core'
import {
  dequantizePositionM,
  KILL_MESSAGE,
  VOICE_TICKET_MESSAGE,
  type VoiceTicket,
  type WireInput,
} from '@shobu/core'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import type { RoomLifecycle } from './matchmaking.ts'
import {
  admitPlayer,
  assertCanonicalAddress,
  createRoomSimulation,
  leaveRoom,
  type RoomIo,
  type RoomRules,
  type RoomSimulation,
  stepRoom,
  writeRoomState,
} from './roomSimulation.ts'
import type { VoiceAccess } from './voiceAccess.ts'

/**
 * O que a sala recebe por injeção. Não vem pelas opções do `defineRoom`,
 * porque o colyseus mistura essas opções com as que o cliente manda, e um
 * cliente adulterado sobrescreveria a configuração do servidor.
 */
export interface GameRoomDeps extends RoomRules {
  readonly lifecycle: RoomLifecycle
  /** O servidor de mídia; `undefined` roda o jogo sem voz. */
  readonly voice: VoiceAccess | undefined
}

/** O que o cliente manda no matchmaking. */
export interface GameRoomOptions {
  readonly address?: string
}

/**
 * A janela do rewind, em ms. Cobre o buffer de interpolação (46,9 ms) mais meio
 * RTT do pior perfil do ADR 0006, com folga; acima dela o servidor lê a posição
 * mais antiga da janela, e um cliente não rebobina mais longe que isso.
 */
const MAX_REWIND_MS = 150

/** O pedaço da sala do colyseus que a simulação usa. */
interface RoomSources {
  readonly state: InstanceType<typeof GameRoomState>
  readonly inputs: { get(id: string): { next(): WireInput | undefined } }
  readonly clients: { getById(sessionId: string): Pick<Client, 'send'> | undefined }
  allowRewindState(options: { maxRewindMs: number }): Rewind
}

/**
 * A sala do servidor de jogo, ligada ao colyseus. Adapter de rede: a lógica
 * está em `roomSimulation.ts`, e o que fica aqui é só a cola.
 *
 * ```ts
 * defineRoom(createGameRoom({ config, boxes, spawns, lifecycle: matchmaking, voice }))
 * ```
 */
export function createGameRoom(deps: GameRoomDeps) {
  return class GameRoom extends Room {
    override state = new GameRoomState()
    override readonly inputs = this.defineInput(PlayerInput, { bufferMaxSize: 64 })
    readonly #simulation = createRoomSimulation(deps.config)
    #address = ''

    override onCreate(options: GameRoomOptions): void {
      assertCanonicalAddress(options.address)
      this.#address = options.address
      deps.lifecycle.roomCreated(options.address, this.roomId)
      runRoom(this, deps, this.#simulation, options.address)
    }

    override onJoin(client: Client): void {
      seatPlayer(this, deps, this.#simulation, client)
    }

    override onLeave(client: Client, code?: number): void {
      leaveRoom(this.#simulation, client.sessionId)
      this.state.players.delete(client.sessionId)
      deps.lifecycle.playerLeft(this.#address, client.sessionId, code)
      deps.voice?.remove(this.roomId, client.sessionId)
    }

    override onDispose(): void {
      deps.lifecycle.roomDisposed(this.#address)
    }
  }
}

/** O estado do jogador no patch, o personagem na simulação e o token da voz. */
function seatPlayer(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  client: Client,
): void {
  const { players } = room.state
  players.set(client.sessionId, new PlayerState())
  admitPlayer(simulation, client.sessionId, deps.spawns, deps.config, (id) => players.get(id))
  sendVoiceTicket(deps.voice, room.roomId, client)
}

/** Capacidade, ritmo de patch e o passo fixo da simulação, da configuração. */
function runRoom(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  address: string,
): void {
  const { config } = deps
  room.maxClients = config.match.playersPerRoom
  room.patchRate = 1000 / config.simulation.patchHz
  const io = createRoomIo(room, address)
  const stateOf = (id: string) => room.state.players.get(id)
  room.setFixedTimestep(() => {
    stepRoom(simulation, io, deps)
    writeRoomState(simulation, stateOf)
  }, config.simulation.tickHz)
}

/**
 * O que a simulação lê do colyseus a cada tick. O rewind grava só a posição
 * dos jogadores, a cada patch. `lastSeenBy` rebobina ao
 * instante de tela do último input consumido do atirador, e o tiro é resolvido
 * logo depois de consumir o input que disparou: é o instante daquele tiro.
 */
function createRoomIo(room: RoomSources, address: string | undefined): RoomIo {
  const { players } = room.state
  const rewind = room.allowRewindState({ maxRewindMs: MAX_REWIND_MS })
  rewind.attachAll(players, { fields: ['x', 'y', 'z'] })
  return {
    nextInput: (id) => room.inputs.get(id).next(),
    feetSeenBy: (shooterId, targetId, out) => {
      const target = players.get(targetId)
      if (!target) throw new Error(`alvo '${targetId}' sem estado; esperado jogador da sala`)
      const seen = rewind.lastSeenBy(shooterId)
      out.x = dequantizePositionM(seen.value(target, 'x'))
      out.y = dequantizePositionM(seen.value(target, 'y'))
      out.z = dequantizePositionM(seen.value(target, 'z'))
      return out
    },
    onKill: announceKill(room.clients, address),
  }
}

/** O log da kill, e a confirmação para o atirador, se ele ainda está na sala. */
function announceKill(
  clients: { getById(sessionId: string): Pick<Client, 'send'> | undefined },
  address: string | undefined,
): RoomIo['onKill'] {
  return (shooterId, kill) => {
    console.log(JSON.stringify({ event: 'match.kill', room: address, shooterId, ...kill }))
    clients.getById(shooterId)?.send(KILL_MESSAGE, kill)
  }
}

/** A voz é opcional: sem token, o jogador joga sem ela, e o jogo não para. */
function sendVoiceTicket(
  voice: VoiceAccess | undefined,
  roomId: string,
  client: Pick<Client, 'sessionId' | 'send'>,
): void {
  voice
    ?.ticketFor(roomId, client.sessionId)
    .then((token) => client.send(VOICE_TICKET_MESSAGE, { token } satisfies VoiceTicket))
    .catch((error: unknown) => {
      console.log(JSON.stringify({ event: 'voice.ticket-failed', roomId, error: String(error) }))
    })
}
