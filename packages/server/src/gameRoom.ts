import { type Client, type Rewind, Room } from '@colyseus/core'
import {
  BOUNDARY_DEATH_MESSAGE,
  type BoundaryDeathMessage,
  dequantizePositionM,
  type GameplayConfig,
  KILL_MESSAGE,
  type KillEvent,
  LOADOUT_MESSAGE,
  type LoadoutMessage,
  type MeleeWeapon,
  VOICE_TICKET_MESSAGE,
  type VoiceTicket,
  type WireInput,
} from '@shobu/core'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import { type RoomLifecycle, SEAT_RESERVATION_S } from './matchmaking.ts'
import {
  admitPlayer,
  assertCanonicalAddress,
  chooseMelee,
  createRoomSimulation,
  leaveRoom,
  type RoomIo,
  type RoomRules,
  type RoomSimulation,
  stepRoom,
} from './roomSimulation.ts'
import { type RoomStateSink, writeRoomState } from './roomState.ts'
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
 * A janela do rewind, em ms. Cobre o buffer de interpolação (33 ms) mais meio
 * RTT do pior perfil do ADR 0006, com folga; acima dela o servidor lê a posição
 * mais antiga da janela, e um cliente não rebobina mais longe que isso.
 */
const MAX_REWIND_MS = 150

/** A lâmina de quem ainda não mandou a classe (`LOADOUT_MESSAGE`). */
const DEFAULT_MELEE: MeleeWeapon = 'katana'

/** O pedaço da sala do colyseus que a simulação usa. */
interface RoomSources extends Pick<Room, 'broadcast' | 'broadcastPatch' | 'clock'> {
  readonly state: InstanceType<typeof GameRoomState>
  readonly inputs: { get(id: string): { next(): WireInput | undefined } }
  allowRewindState(options: { maxRewindMs: number }): Rewind
}

/**
 * A sala do servidor de jogo, ligada ao colyseus. Adapter de rede: a lógica
 * está em `roomSimulation.ts`, e o que fica aqui é só a cola.
 *
 * ```ts
 * defineRoom(createGameRoom({ ...roomRulesFor(NEON_KAIDO_LAYOUT, config), lifecycle, voice }))
 * ```
 */
export function createGameRoom(deps: GameRoomDeps) {
  return class GameRoom extends Room {
    override state = new GameRoomState()
    override readonly inputs = this.defineInput(PlayerInput, { bufferMaxSize: 64 })
    readonly #simulation = createRoomSimulation(deps)
    #address = ''

    override onCreate(options: GameRoomOptions): void {
      this.#address = runRoom(this, deps, this.#simulation, options.address)
    }

    /** Só entra quem recebeu o assento do matchmaking (`POST /rooms/enter`). */
    override onAuth(client: Client): boolean {
      return deps.lifecycle.admits(client.sessionId)
    }

    override onJoin(client: Client): void {
      seatPlayer(this, deps, this.#simulation, client)
    }

    override messages = { [LOADOUT_MESSAGE]: loadoutHandler(this.#simulation) }

    override onLeave(client: Client, code?: number): void {
      leaveRoom(this.#simulation, client.sessionId, deps)
      this.state.players.delete(client.sessionId)
      deps.lifecycle.playerLeft(this.#address, client.sessionId, code)
      deps.voice?.remove(this.roomId, client.sessionId)
    }

    override onDispose(): void {
      deps.lifecycle.roomDisposed(this.#address)
    }
  }
}

/**
 * O estado da sala como a simulação o escreve: o jogador ou o bot ganha o
 * estado na primeira escrita, e o bot que vai para o banco sai dele.
 */
function stateSinkOf(players: InstanceType<typeof GameRoomState>['players']): RoomStateSink {
  return {
    stateOf: (id) => {
      const existing = players.get(id)
      if (existing) return existing
      players.set(id, new PlayerState())
      return players.get(id)
    },
    drop: (id) => {
      players.delete(id)
    },
  }
}

/** A lâmina que o cliente diz ter escolhido; `chooseMelee` só aceita uma do jogo. */
function loadoutHandler(
  simulation: RoomSimulation,
): (client: Client, message: Partial<LoadoutMessage> | undefined) => void {
  return (client, message) => chooseMelee(simulation, client.sessionId, message?.meleeWeapon)
}

/** O estado do jogador no patch, o personagem na simulação e o token da voz. */
function seatPlayer(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  client: Client,
): void {
  admitPlayer(simulation, client.sessionId, DEFAULT_MELEE, deps, stateSinkOf(room.state.players))
  sendVoiceTicket(deps.voice, room.roomId, client)
}

/**
 * O endereço conferido e registrado, a capacidade e o passo fixo da simulação,
 * que também manda o patch. Devolve o endereço, que a sala guarda para avisar
 * a saída.
 */
function runRoom(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  address: string | undefined,
): string {
  assertCanonicalAddress(address)
  const { config } = deps
  deps.lifecycle.roomCreated(address, room.roomId)
  room.maxClients = config.match.playersPerRoom
  room.seatReservationTimeout = SEAT_RESERVATION_S
  const { io, rewind } = createRoomIo(room, address)
  const sink = stateSinkOf(room.state.players)
  const patch = patchAfterTicks(room, rewind, config.simulation)
  room.setFixedTimestep((step) => {
    stepRoom(simulation, io, deps)
    writeRoomState(simulation, sink)
    patch(step.tick)
  }, config.simulation.tickHz)
  // depois do passo fixo: sem ele, o `null` liga um timer só de relógio, e o
  // relógio andaria duas vezes por intervalo.
  room.patchRate = null
  return address
}

/**
 * O patch sai no fim do tick, a cada `tickHz / patchHz` ticks, e não num timer
 * próprio. Com dois timers sem fase comum, um patch às vezes saía sem tick
 * novo e o seguinte levava dois: o cliente precisava de um intervalo a mais de
 * buffer só para isso. O rewind grava o que o patch leva, no ritmo dele.
 *
 * Quando o colyseus recupera ticks atrasados num intervalo só, eles têm o
 * mesmo relógio, e só o primeiro manda patch; o resto vai no próximo.
 * ponytail: o patch leva o primeiro tick da recuperação, e não o último; só
 * acontece com o servidor engasgado.
 */
function patchAfterTicks(
  room: Pick<Room, 'broadcastPatch' | 'clock'>,
  rewind: Rewind,
  simulation: GameplayConfig['simulation'],
): (tick: number) => void {
  const ticksPerPatch = Math.max(1, Math.round(simulation.tickHz / simulation.patchHz))
  const intervalMs = (1000 * ticksPerPatch) / simulation.tickHz
  let patchedAtMs = Number.NaN
  return (tick) => {
    const nowMs = room.clock.elapsedTime
    if (tick % ticksPerPatch !== 0 || nowMs === patchedAtMs) return
    patchedAtMs = nowMs
    rewind.record(nowMs, intervalMs)
    room.broadcastPatch()
  }
}

/**
 * O que a simulação lê do colyseus a cada tick. O rewind grava só a posição
 * dos jogadores, a cada patch (`patchAfterTicks`). `lastSeenBy` rebobina ao
 * instante de tela do último input consumido do atirador, e o tiro é resolvido
 * logo depois de consumir o input que disparou: é o instante daquele tiro.
 */
function createRoomIo(
  room: RoomSources,
  address: string | undefined,
): { io: RoomIo; rewind: Rewind } {
  const { players } = room.state
  const rewind = room.allowRewindState({ maxRewindMs: MAX_REWIND_MS })
  rewind.attachAll(players, { fields: ['x', 'y', 'z'] })
  const io: RoomIo = {
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
    ...announceDeaths(room, address),
  }
  return { io, rewind }
}

/** O log de cada morte, e o aviso para todos: cada cliente pontua a mesma lista. */
function announceDeaths(
  room: Pick<Room, 'broadcast'>,
  address: string | undefined,
): Pick<RoomIo, 'onKill' | 'onBoundaryDeath'> {
  return {
    onKill: (kill) => {
      console.log(JSON.stringify({ event: 'match.kill', room: address, ...kill }))
      room.broadcast(KILL_MESSAGE, { ...kill } satisfies KillEvent)
    },
    onBoundaryDeath: (playerId) => {
      console.log(JSON.stringify({ event: 'match.boundary-death', room: address, playerId }))
      room.broadcast(BOUNDARY_DEATH_MESSAGE, { playerId } satisfies BoundaryDeathMessage)
    },
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
