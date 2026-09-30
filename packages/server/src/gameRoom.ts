import { type Client, type Rewind, Room } from '@colyseus/core'
import { dequantizePositionM, type WireInput } from '@shobu/core'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import {
  admitPlayer,
  assertCanonicalAddress,
  createRoomSimulation,
  leaveRoom,
  type RoomIo,
  type RoomRules,
  stepRoom,
  writeRoomState,
} from './roomSimulation.ts'

/**
 * O que a sala recebe por injeção. Não vem pelas opções do `defineRoom`,
 * porque o colyseus mistura essas opções com as que o cliente manda, e um
 * cliente adulterado sobrescreveria a configuração do servidor.
 */
export type GameRoomDeps = RoomRules

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

type PlayerStates = InstanceType<typeof GameRoomState>['players']

/**
 * A sala do servidor de jogo, ligada ao colyseus. Adapter de rede: a lógica
 * está em `roomSimulation.ts`, e o que fica aqui é só a cola.
 *
 * ```ts
 * defineRoom(createGameRoom({ config, boxes, spawns })).filterBy(['address'])
 * ```
 */
export function createGameRoom(deps: GameRoomDeps) {
  return class GameRoom extends Room {
    override state = new GameRoomState()
    override readonly inputs = this.defineInput(PlayerInput, { bufferMaxSize: 64 })
    readonly #simulation = createRoomSimulation(deps.config)
    readonly #stateOf = (id: string) => this.state.players.get(id)

    override onCreate(options: GameRoomOptions): void {
      assertCanonicalAddress(options.address)
      this.maxClients = deps.config.match.playersPerRoom
      this.patchRate = 1000 / deps.config.simulation.patchHz
      const rewind = this.allowRewindState({ maxRewindMs: MAX_REWIND_MS })
      const io = createRoomIo(this.state.players, this.inputs, rewind, options.address)
      this.setFixedTimestep(() => {
        stepRoom(this.#simulation, io, deps)
        writeRoomState(this.#simulation, this.#stateOf)
      }, deps.config.simulation.tickHz)
    }

    override onJoin(client: Client): void {
      this.state.players.set(client.sessionId, new PlayerState())
      admitPlayer(this.#simulation, client.sessionId, deps.spawns, deps.config, this.#stateOf)
    }

    override onLeave(client: Client): void {
      leaveRoom(this.#simulation, client.sessionId)
      this.state.players.delete(client.sessionId)
    }
  }
}

/**
 * O que a simulação lê do colyseus a cada tick. O rewind grava só a posição
 * dos jogadores, a cada patch. `lastSeenBy` rebobina ao
 * instante de tela do último input consumido do atirador, e o tiro é resolvido
 * logo depois de consumir o input que disparou: é o instante daquele tiro.
 */
function createRoomIo(
  players: PlayerStates,
  inputs: { get(id: string): { next(): WireInput | undefined } },
  rewind: Rewind,
  address: string | undefined,
): RoomIo {
  rewind.attachAll(players, { fields: ['x', 'y', 'z'] })
  return {
    nextInput: (id) => inputs.get(id).next(),
    feetSeenBy: (shooterId, targetId, out) => {
      const target = players.get(targetId)
      if (!target) throw new Error(`alvo '${targetId}' sem estado; esperado jogador da sala`)
      const seen = rewind.lastSeenBy(shooterId)
      out.x = dequantizePositionM(seen.value(target, 'x'))
      out.y = dequantizePositionM(seen.value(target, 'y'))
      out.z = dequantizePositionM(seen.value(target, 'z'))
      return out
    },
    onKill: (shooterId, victimId) =>
      console.log(JSON.stringify({ event: 'match.kill', room: address, shooterId, victimId })),
  }
}
