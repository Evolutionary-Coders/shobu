import { type Client, type Rewind, Room } from '@colyseus/core'
import {
  BOUNDARY_DEATH_MESSAGE,
  type BoundaryDeathMessage,
  CALLSIGN_MESSAGE,
  type CallsignMessage,
  dequantizePositionM,
  type GameplayConfig,
  KILL_MESSAGE,
  type KillEvent,
  LOADOUT_MESSAGE,
  type LoadoutMessage,
  MAP_VOTE_MESSAGE,
  MATCH_SUMMARY_MESSAGE,
  type MapVoteMessage,
  type MatchCycleEdge,
  type MatchSummaryMessage,
  type MeleeWeapon,
  PRIMARY_LOADOUT_MESSAGE,
  type PrimaryLoadoutMessage,
  SCORESTREAK_ACTIVATE_MESSAGE,
  SCORESTREAK_ACTIVATED_MESSAGE,
  SCORESTREAK_EARNED_MESSAGE,
  SCORESTREAK_LOADOUT_MESSAGE,
  type ScorestreakActivatedMessage,
  type ScorestreakActivateMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakLoadoutMessage,
  SEAT_RESERVATION_S,
  SHOT_MESSAGE,
  type ShotMessage,
  VOICE_TICKET_MESSAGE,
  type VoiceTicket,
  type WireInput,
} from '@shobu/core'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import type { RoomLifecycle } from './matchmaking.ts'
import { holdSeatForReload, seatReturned } from './roomMatch.ts'
import { openRoomArena } from './roomRestart.ts'
import { chooseScorestreaks, requestScorestreak } from './roomScorestreaks.ts'
import { chooseMelee, choosePrimary, nameSeat } from './roomSeatChoices.ts'
import {
  admitPlayer,
  assertCanonicalAddress,
  createRoomSimulation,
  dismissPlayer,
  type RoomIo,
  type RoomRules,
  type RoomSimulation,
  stepRoom,
} from './roomSimulation.ts'
import { type RoomStateSink, writeRoomState } from './roomState.ts'
import { castRoomVote } from './roomVote.ts'
import type { VoiceAccess } from './voiceAccess.ts'

/**
 * O que a sala recebe por injeção. Não vem pelas opções do `defineRoom`,
 * porque o colyseus mistura essas opções com as que o cliente manda, e um
 * cliente adulterado sobrescreveria a configuração do servidor.
 */
export interface GameRoomDeps {
  /** Os mapas que a sala pode ter, na ordem do catálogo, que é a do voto. */
  readonly arenas: ReadonlyMap<string, RoomRules>
  /** O mapa de quem não pediu um do catálogo. */
  readonly defaultArenaId: string
  readonly lifecycle: RoomLifecycle
  /** O servidor de mídia; `undefined` roda o jogo sem voz. */
  readonly voice: VoiceAccess | undefined
}

/** O que o matchmaking manda ao criar a sala: o endereço e o mapa de quem a criou. */
export interface GameRoomOptions {
  readonly address?: string
  readonly arenaId?: unknown
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
interface RoomSources extends Pick<Room, 'broadcast' | 'broadcastPatch' | 'clock' | 'clients'> {
  readonly state: InstanceType<typeof GameRoomState>
  readonly inputs: { get(id: string): { next(): WireInput | undefined } }
  allowRewindState(options: { maxRewindMs: number }): Rewind
}

/**
 * A sala do servidor de jogo, ligada ao colyseus. Adapter de rede: a lógica
 * está em `roomSimulation.ts`, e o que fica aqui é só a cola. Só entra quem
 * recebeu o assento do matchmaking (`POST /rooms/enter`): é o `onAuth`.
 *
 * ```ts
 * defineRoom(createGameRoom({ arenas, defaultArenaId: 'neon-kaido', lifecycle, voice }))
 * ```
 */
export function createGameRoom(deps: GameRoomDeps) {
  return class GameRoom extends Room {
    override state = new GameRoomState()
    override readonly inputs = this.defineInput(PlayerInput, { bufferMaxSize: 64 })
    readonly #simulation = createRoomSimulation(defaultRulesOf(deps), deps.arenas)
    #address = ''

    override onCreate(options: GameRoomOptions): void {
      this.#address = runRoom(this, deps, this.#simulation, options)
    }

    override onAuth(client: Client): boolean {
      return deps.lifecycle.admits(client.sessionId)
    }

    override onJoin(client: Client): void {
      seatPlayer(this, deps, this.#simulation, client)
    }

    override messages = clientMessages(this.#simulation)

    override onDrop(client: Client): void {
      awaitReload(this, this.#simulation, client)
    }

    override onReconnect(client: Client): void {
      seatReturned(this.#simulation, client.sessionId)
    }

    override onLeave(client: Client, code?: number): void {
      unseatPlayer(this, deps, this.#simulation, this.#address, { client, code })
    }

    override onDispose(): void {
      deps.lifecycle.roomDisposed(this.#address)
    }
  }
}

/**
 * A queda na recarga do mapa novo guarda a vaga (`holdSeatForReload`). Fora
 * dela, o colyseus segue para o `onLeave`, como se o `onDrop` não existisse; e,
 * se a volta não vier a tempo, também (`@colyseus/core` 0.18.17, `_onLeave`).
 * A reconexão recusada por tempo é o caminho normal, e não erro.
 */
function awaitReload(room: Room, simulation: RoomSimulation, client: Client): void {
  if (!holdSeatForReload(simulation, client.sessionId)) return
  room.allowReconnection(client, SEAT_RESERVATION_S).catch(() => undefined)
}

/** As regras do mapa padrão; um padrão fora do catálogo é erro de configuração do servidor. */
function defaultRulesOf(deps: GameRoomDeps): RoomRules {
  const rules = deps.arenas.get(deps.defaultArenaId)
  if (rules) return rules
  throw new Error(
    `mapa padrão '${deps.defaultArenaId}' fora do catálogo [${[...deps.arenas.keys()].join(', ')}]; esperado um id do catálogo`,
  )
}

/**
 * O estado da sala como a simulação o escreve: o jogador ou o bot ganha o
 * estado na primeira escrita, e o bot que vai para o banco sai dele.
 */
function stateSinkOf(state: InstanceType<typeof GameRoomState>): RoomStateSink {
  const { players } = state
  return {
    matchState: () => state.match,
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

/**
 * O que o cliente diz de si: a lâmina e a arma principal da classe, o nome de
 * perfil e as séries, o pedido de acionar uma e o voto do próximo mapa. Vem da
 * rede, e cada receptor só aceita o que é do jogo.
 */
function clientMessages(simulation: RoomSimulation) {
  return { ...loadoutMessages(simulation), ...playMessages(simulation) }
}

/** A classe e o nome: `chooseMelee`, `choosePrimary`, `nameSeat` e `chooseScorestreaks`. */
function loadoutMessages(simulation: RoomSimulation) {
  const chooseOrLog = scorestreakLoadoutReceiver(simulation)
  return {
    [LOADOUT_MESSAGE]: (client: Client, message: Partial<LoadoutMessage> | undefined) =>
      chooseMelee(simulation, client.sessionId, message?.meleeWeapon),
    [PRIMARY_LOADOUT_MESSAGE]: (
      client: Client,
      message: Partial<PrimaryLoadoutMessage> | undefined,
    ) => choosePrimary(simulation, client.sessionId, message?.primaryWeapon),
    [CALLSIGN_MESSAGE]: (client: Client, message: Partial<CallsignMessage> | undefined) =>
      nameSeat(simulation, client.sessionId, message?.callsign),
    [SCORESTREAK_LOADOUT_MESSAGE]: (
      client: Client,
      message: Partial<ScorestreakLoadoutMessage> | undefined,
    ) => chooseOrLog(client.sessionId, message?.scorestreaks),
  }
}

/** O que o jogador pede durante a partida: `requestScorestreak` e `castRoomVote`. */
function playMessages(simulation: RoomSimulation) {
  const voteOrLog = mapVoteReceiver(simulation)
  return {
    [SCORESTREAK_ACTIVATE_MESSAGE]: (
      client: Client,
      message: Partial<ScorestreakActivateMessage> | undefined,
    ) => requestScorestreak(simulation, client.sessionId, message?.slot),
    [MAP_VOTE_MESSAGE]: (client: Client, message: Partial<MapVoteMessage> | undefined) =>
      voteOrLog(client.sessionId, message?.optionIndex),
  }
}

/** O voto do próximo mapa que veio da rede; o recusado vai ao log uma vez por jogador. */
function mapVoteReceiver(simulation: RoomSimulation) {
  const logRejected = rejectOnceLogger('match.vote-rejected')
  return (playerId: string, raw: unknown): void => {
    if (!castRoomVote(simulation, playerId, raw)) logRejected(playerId, raw)
  }
}

/**
 * Aplica a escolha de séries que veio da rede e registra a recusada uma vez
 * por jogador (`rejectOnceLogger`).
 */
function scorestreakLoadoutReceiver(simulation: RoomSimulation) {
  const logRejected = rejectOnceLogger('scorestreak.loadout-rejected')
  return (playerId: string, raw: unknown): void => {
    if (!chooseScorestreaks(simulation, playerId, raw)) logRejected(playerId, raw)
  }
}

/**
 * O log da mensagem recusada, **uma vez por jogador**: sem isto, um cliente
 * quebrado (ou malicioso) enchia o log com uma linha por mensagem, cada uma
 * com o corpo inteiro (revisão da fase 1).
 */
function rejectOnceLogger(event: string): (playerId: string, raw: unknown) => void {
  const rejected = new Set<string>()
  return (playerId, raw) => {
    if (rejected.has(playerId)) return
    rejected.add(playerId)
    // o corpo vem da rede: corta antes de registrar, para uma linha não virar megabytes.
    const sample = JSON.stringify(raw)?.slice(0, 200)
    console.log(JSON.stringify({ event, playerId, sample }))
  }
}

/** O estado do jogador no patch, o personagem na simulação e o token da voz. */
function seatPlayer(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  client: Client,
): void {
  admitPlayer(
    simulation,
    client.sessionId,
    DEFAULT_MELEE,
    simulation.rules,
    stateSinkOf(room.state),
  )
  sendVoiceTicket(deps.voice, room.roomId, client)
}

/** Fora da simulação e do estado, avisando o matchmaking (a fila anda) e a voz. */
function unseatPlayer(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  address: string,
  { client, code }: { readonly client: Client; readonly code: number | undefined },
): void {
  dismissPlayer(simulation, client.sessionId, simulation.rules, stateSinkOf(room.state))
  deps.lifecycle.playerLeft(address, client.sessionId, code)
  deps.voice?.remove(room.roomId, client.sessionId)
}

/**
 * O endereço conferido e registrado, o mapa da criação, a capacidade e o passo
 * fixo da simulação, que também manda o patch. Devolve o endereço, que a sala
 * guarda para avisar a saída.
 */
function runRoom(
  room: Room & RoomSources,
  deps: GameRoomDeps,
  simulation: RoomSimulation,
  { address, arenaId }: GameRoomOptions,
): string {
  assertCanonicalAddress(address)
  openRoomArena(simulation, arenaId)
  const { config } = simulation.rules
  deps.lifecycle.roomCreated(address, room.roomId)
  room.maxClients = config.match.playersPerRoom
  room.seatReservationTimeout = SEAT_RESERVATION_S
  const { io, rewind } = createRoomIo(room, address, deps.lifecycle)
  const sink = stateSinkOf(room.state)
  const patch = patchAfterTicks(room, rewind, config.simulation)
  room.setFixedTimestep((step) => {
    // as regras de agora, e não as da criação: o voto troca o mapa da sala.
    stepRoom(simulation, io, simulation.rules)
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
  address: string,
  lifecycle: RoomLifecycle,
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
    ...announceScorestreaks(room, address),
    ...announceMatch(room, address, lifecycle),
  }
  return { io, rewind }
}

/**
 * O log de cada morte, e o aviso para todos: cada cliente pontua a mesma
 * lista. O tiro vai sem log: é rastro na tela, e não fato da partida.
 */
function announceDeaths(
  room: Pick<Room, 'broadcast'>,
  address: string | undefined,
): Pick<RoomIo, 'onKill' | 'onBoundaryDeath' | 'onShot'> {
  return {
    // o colyseus serializa na hora: os vetores que a simulação reaproveita
    // podem mudar depois desta linha.
    onShot: (shot) => room.broadcast(SHOT_MESSAGE, shot satisfies Readonly<ShotMessage>),
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

/**
 * A série pronta vai só para o dono — o bot não tem cliente, e o aviso dele
 * cai no vazio —, e o acionamento vai para todos, com log.
 */
function announceScorestreaks(
  room: Pick<Room, 'broadcast' | 'clients'>,
  address: string | undefined,
): Pick<RoomIo, 'onScorestreakEarned' | 'onScorestreakActivated'> {
  return {
    onScorestreakEarned: (playerId, earned) => {
      const message = { ...earned } satisfies ScorestreakEarnedMessage
      room.clients.getById(playerId)?.send(SCORESTREAK_EARNED_MESSAGE, message)
    },
    onScorestreakActivated: (activated) => {
      console.log(JSON.stringify({ event: 'scorestreak.activated', room: address, ...activated }))
      const message = { ...activated } satisfies ScorestreakActivatedMessage
      room.broadcast(SCORESTREAK_ACTIVATED_MESSAGE, message)
    },
  }
}

/**
 * Cada borda da partida vai para o log; o fim leva o resumo a todos, e o log
 * diz o MVP e se acabou no relógio ou no limite de pontos. A virada de mapa
 * vai ao matchmaking, para quem entrar depois receber o mapa novo.
 */
function announceMatch(
  room: Pick<Room, 'broadcast'>,
  address: string,
  lifecycle: RoomLifecycle,
): Pick<RoomIo, 'onMatchEdge' | 'onMatchSummary' | 'onNextMatch'> {
  return {
    onNextMatch: (arenaId, mapChanged) => {
      console.log(JSON.stringify({ event: 'match.next', room: address, arenaId, mapChanged }))
      if (mapChanged) lifecycle.arenaChanged(address, arenaId)
    },
    onMatchEdge: (edge: MatchCycleEdge) => {
      console.log(JSON.stringify({ event: 'match.phase', room: address, edge }))
    },
    onMatchSummary: (rows, reason) => {
      const mvp = rows[0]?.playerId
      console.log(JSON.stringify({ event: 'match.over', room: address, mvp, reason }))
      room.broadcast(MATCH_SUMMARY_MESSAGE, { rows } satisfies MatchSummaryMessage)
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
