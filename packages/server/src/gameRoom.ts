import { type Client, Room } from '@colyseus/core'
import type { GameplayConfig, StaticBox } from '@shobu/core'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import {
  assertCanonicalAddress,
  createRoomSimulation,
  joinRoom,
  leaveRoom,
  type SpawnPoints,
  stepRoom,
  writeRoomState,
} from './roomSimulation.ts'

/**
 * O que a sala recebe por injeção. Não vem pelas opções do `defineRoom`,
 * porque o colyseus mistura essas opções com as que o cliente manda, e um
 * cliente adulterado sobrescreveria a configuração do servidor.
 */
export interface GameRoomDeps {
  readonly config: GameplayConfig
  readonly boxes: readonly StaticBox[]
  readonly spawns: SpawnPoints
}

/** O que o cliente manda no matchmaking. */
export interface GameRoomOptions {
  readonly address?: string
}

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
    readonly #simulation = createRoomSimulation()

    override onCreate(options: GameRoomOptions): void {
      assertCanonicalAddress(options.address)
      this.maxClients = deps.config.match.playersPerRoom
      this.patchRate = 1000 / deps.config.simulation.patchHz
      this.setFixedTimestep(() => this.#step(), deps.config.simulation.tickHz)
    }

    override onJoin(client: Client): void {
      joinRoom(this.#simulation, client.sessionId, deps.spawns, deps.config)
      this.state.players.set(client.sessionId, new PlayerState())
    }

    override onLeave(client: Client): void {
      leaveRoom(this.#simulation, client.sessionId)
      this.state.players.delete(client.sessionId)
    }

    #step(): void {
      stepRoom(this.#simulation, (id) => this.inputs.get(id).next(), deps.boxes, deps.config)
      writeRoomState(this.#simulation, (id) => this.state.players.get(id))
    }
  }
}
