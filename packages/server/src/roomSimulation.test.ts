import { readFileSync } from 'node:fs'
import {
  blockoutToStaticBoxes,
  boxFromCenterSize,
  decodeStance,
  dequantizePositionM,
  EYE_HEIGHT_RATIO,
  encodeButtons,
  GREYBOX_BLOCKOUT,
  GREYBOX_SPAWN_POINTS_M,
  type KillMessage,
  parseGameplayConfig,
  quantizePositionM,
  spawnFeetM,
  type Vector3,
  type WireInput,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  admitPlayer,
  assertCanonicalAddress,
  createRoomSimulation,
  FORWARD_AIM,
  INPUT_CREDIT_CAP,
  joinRoom,
  leaveRoom,
  type PlayerStateFields,
  type RoomIo,
  type RoomRules,
  type RoomSimulation,
  stepRoom,
  writeRoomState,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const boxes = blockoutToStaticBoxes(GREYBOX_BLOCKOUT)

const NO_BUTTONS = encodeButtons({
  sprint: false,
  jump: false,
  crouch: false,
  fire: false,
  scope: false,
  reload: false,
})
const FORWARD_WIRE: WireInput = { wishX: 0, wishZ: -127, buttons: NO_BUTTONS, ...FORWARD_AIM }

const rules: RoomRules = { config, boxes, spawns: GREYBOX_SPAWN_POINTS_M }

/**
 * O colyseus do lado da sala, em memória: a fila de input por jogador, o
 * rewind e o log de kills. Sem posição rebobinada marcada, o atirador vê o
 * alvo onde o alvo está agora.
 */
class FakeRoomIo implements RoomIo {
  readonly #queues = new Map<string, WireInput[]>()
  readonly seenFeet = new Map<string, Vector3>()
  readonly kills: string[] = []

  constructor(readonly room: RoomSimulation) {}

  push(playerId: string, input: WireInput): void {
    const queue = this.#queues.get(playerId) ?? []
    queue.push(input)
    this.#queues.set(playerId, queue)
  }

  remaining(playerId: string): number {
    return this.#queues.get(playerId)?.length ?? 0
  }

  nextInput(playerId: string): WireInput | undefined {
    return this.#queues.get(playerId)?.shift()
  }

  readonly feetSeenBy = (_shooterId: string, targetId: string, out: Vector3): Vector3 => {
    const feetM =
      this.seenFeet.get(targetId) ?? this.room.seats.get(targetId)?.player.character.position
    if (!feetM) throw new Error(`alvo '${targetId}' fora da sala`)
    out.x = feetM.x
    out.y = feetM.y
    out.z = feetM.z
    return out
  }

  readonly killMessages: KillMessage[] = []

  readonly onKill = (shooterId: string, kill: KillMessage): void => {
    this.kills.push(`${shooterId}>${kill.victimId}`)
    this.killMessages.push(kill)
  }
}

function emptyState(): PlayerStateFields {
  return { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, stance: 0, alive: false }
}

describe('joinRoom', () => {
  it('põe cada jogador que entra no spawn seguinte, com os pés no chão do spawn', () => {
    const room = createRoomSimulation(config)
    const first = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const second = joinRoom(room, 'bia', GREYBOX_SPAWN_POINTS_M, config)
    const [x0, y0, z0] = spawnFeetM(
      GREYBOX_SPAWN_POINTS_M[0] ?? [0, 0, 0],
      config.collision.capsuleHeightM,
    )
    expect(first.character.position).toEqual({ x: x0, y: y0, z: z0 })
    const [x1] = spawnFeetM(GREYBOX_SPAWN_POINTS_M[1] ?? [0, 0, 0], config.collision.capsuleHeightM)
    expect(second.character.position.x).toBe(x1)
  })

  /** Treze entradas numa sala que gira jogadores não podem estourar os doze spawns. */
  it('volta ao primeiro spawn depois do último', () => {
    const room = createRoomSimulation(config)
    for (let index = 0; index < GREYBOX_SPAWN_POINTS_M.length; index += 1) {
      joinRoom(room, `p${index}`, GREYBOX_SPAWN_POINTS_M, config)
      leaveRoom(room, `p${index}`)
    }
    const again = joinRoom(room, 'volta', GREYBOX_SPAWN_POINTS_M, config)
    const [x0] = spawnFeetM(GREYBOX_SPAWN_POINTS_M[0] ?? [0, 0, 0], config.collision.capsuleHeightM)
    expect(again.character.position.x).toBe(x0)
  })
})

describe('joinRoom sem spawn', () => {
  it('recusa lista de spawn vazia, dizendo o tamanho', () => {
    expect(() => joinRoom(createRoomSimulation(config), 'ana', [], config)).toThrow(/recebeu 0/)
  })
})

describe('admitPlayer', () => {
  /**
   * Regressão: o estado nascia zerado e só era preenchido no tick seguinte. Se
   * o patch saísse antes, os outros viam o jogador no centro da arena e depois
   * saltando 26 m para o spawn.
   */
  it('escreve o estado de quem entra antes do primeiro tick', () => {
    const room = createRoomSimulation(config)
    const state = emptyState()
    admitPlayer(room, 'ana', GREYBOX_SPAWN_POINTS_M, config, () => state)
    const [x0, , z0] = spawnFeetM(
      GREYBOX_SPAWN_POINTS_M[0] ?? [0, 0, 0],
      config.collision.capsuleHeightM,
    )
    expect(state.x).toBe(quantizePositionM(x0))
    expect(state.z).toBe(quantizePositionM(z0))
  })
})

describe('leaveRoom', () => {
  it('tira o jogador da partida e da sala', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    leaveRoom(room, 'ana')
    expect(room.match.players.size).toBe(0)
    expect(room.seats.size).toBe(0)
  })
})

describe('stepRoom', () => {
  it('aplica um input no primeiro tick, com um crédito só', () => {
    const room = createRoomSimulation(config)
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeRoomIo(room)
    queues.push('ana', FORWARD_WIRE)
    queues.push('ana', FORWARD_WIRE)
    const startZ = player.character.position.z

    stepRoom(room, queues, rules)

    expect(player.character.position.z).toBeLessThan(startZ)
    expect(queues.remaining('ana')).toBe(1)
  })

  /** Sem input, o servidor não inventa tick: é o que deixa a reconciliação do cliente fechar. */
  it('deixa parado quem não mandou input', () => {
    const room = createRoomSimulation(config)
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const before = { ...player.character.position }
    stepRoom(room, new FakeRoomIo(room), rules)
    expect(player.character.position).toEqual(before)
  })

  it('recupera o atraso de um soluço de rede com o crédito guardado', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeRoomIo(room)
    for (let tick = 0; tick < 3; tick += 1) stepRoom(room, queues, rules)
    for (let input = 0; input < 5; input += 1) queues.push('ana', FORWARD_WIRE)

    stepRoom(room, queues, rules)

    expect(queues.remaining('ana')).toBe(1)
  })

  it('guarda no máximo INPUT_CREDIT_CAP créditos', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeRoomIo(room)
    for (let tick = 0; tick < 20; tick += 1) stepRoom(room, queues, rules)
    for (let input = 0; input < 20; input += 1) queues.push('ana', FORWARD_WIRE)

    stepRoom(room, queues, rules)

    expect(queues.remaining('ana')).toBe(20 - INPUT_CREDIT_CAP)
  })

  /** Um cliente adulterado que manda três inputs por tick não anda três vezes mais rápido. */
  it('não aplica mais de um input por tick na média', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeRoomIo(room)
    for (let tick = 0; tick < 10; tick += 1) {
      for (let input = 0; input < 3; input += 1) queues.push('ana', FORWARD_WIRE)
      stepRoom(room, queues, rules)
    }
    expect(30 - queues.remaining('ana')).toBe(10)
  })

  it('guarda a mira do último input', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeRoomIo(room)
    queues.push('ana', { ...FORWARD_WIRE, aimX: 32767, aimZ: 0 })
    stepRoom(room, queues, rules)
    expect(room.seats.get('ana')?.aim).toEqual({ aimX: 32767, aimY: 0, aimZ: 0 })
  })
})

/**
 * Um campo aberto, só chão, com dois spawns frente a frente a 3 m: a mira
 * padrão, para -z, cruza o alvo. A 3 m o cone sem luneta tem raio menor que o
 * da cápsula, e o tiro acerta sem depender de sorte.
 */
const open: RoomRules = {
  config,
  boxes: [boxFromCenterSize([0, -0.5, 0], [200, 1, 200])],
  spawns: [
    [0, config.collision.capsuleHeightM, 0],
    [0, config.collision.capsuleHeightM, -3],
  ],
}

const FIRE_WIRE: WireInput = {
  wishX: 0,
  wishZ: 0,
  buttons: encodeButtons({
    sprint: false,
    jump: false,
    crouch: false,
    fire: true,
    scope: false,
    reload: false,
  }),
  ...FORWARD_AIM,
}

interface Duel {
  readonly room: RoomSimulation
  readonly io: FakeRoomIo
}

/** Ana no primeiro spawn, Bia no segundo, bem na mira de Ana. */
function duel(): Duel {
  const room = createRoomSimulation(config)
  joinRoom(room, 'ana', open.spawns, config)
  joinRoom(room, 'bia', open.spawns, config)
  return { room, io: new FakeRoomIo(room) }
}

function seat(room: RoomSimulation, playerId: string) {
  const found = room.seats.get(playerId)
  if (!found) throw new Error(`'${playerId}' fora da sala`)
  return found
}

describe('stepRoom, o tiro', () => {
  it('mata o alvo na mira e avisa quem matou quem', () => {
    const { room, io } = duel()
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(seat(room, 'bia').alive).toBe(false)
    expect(io.kills).toEqual(['ana>bia'])
  })

  /**
   * O atirador pontua a kill como a de um boneco, e as medalhas leem estes
   * campos. Mira reta a partir do olho: o acerto é na altura do olho, na frente
   * da cápsula a 3 m.
   */
  it('descreve a kill com distância, altura do acerto, luneta e chão', () => {
    const { room, io } = duel()
    seat(room, 'ana').player.character.grounded = true
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    const [kill] = io.killMessages
    // sem luneta o tiro sai no cone, então os números são aproximados
    expect(kill?.distanceM).toBeCloseTo(3 - config.collision.capsuleRadiusM, 1)
    expect(kill?.hitHeightRatio).toBeCloseTo(EYE_HEIGHT_RATIO, 1)
    expect(kill).toMatchObject({ victimId: 'bia', scoped: false, shooterAirborne: false })
  })

  /** O rewind: o acerto vale contra o que a tela do atirador mostrava, não contra o agora. */
  it('acerta o alvo onde o atirador o viu, mesmo que ele já tenha saído dali', () => {
    const { room, io } = duel()
    seat(room, 'bia').player.character.position.x = 5
    io.seenFeet.set('bia', { x: 0, y: 0, z: -3 })
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(io.kills).toEqual(['ana>bia'])
  })

  it('erra o alvo que o atirador viu fora da mira, mesmo que ele esteja nela agora', () => {
    const { room, io } = duel()
    io.seenFeet.set('bia', { x: 5, y: 0, z: -3 })
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(seat(room, 'bia').alive).toBe(true)
  })

  it('não mira em quem já morreu', () => {
    const { room, io } = duel()
    seat(room, 'bia').alive = false
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(io.kills).toEqual([])
  })

  /** O morto não atira nem anda, e a confirmação dele segue andando. */
  it('consome o input do morto sem mover nem atirar', () => {
    const { room, io } = duel()
    const bia = seat(room, 'bia')
    bia.alive = false
    bia.respawnLeftS = config.match.respawnDelayS
    const before = { ...bia.player.character.position }
    io.push('bia', { ...FIRE_WIRE, wishZ: 127, aimZ: 32767 })
    stepRoom(room, io, open)
    expect(io.remaining('bia')).toBe(0)
    expect(bia.player.character.position).toEqual(before)
    expect(seat(room, 'ana').alive).toBe(true)
  })

  /** O cliente não sabe que morreu e segue contando tiros; o contador semeia a dispersão. */
  it('a arma do morto segue contando tiros', () => {
    const { room, io } = duel()
    seat(room, 'bia').alive = false
    seat(room, 'bia').respawnLeftS = config.match.respawnDelayS
    io.push('bia', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(seat(room, 'bia').weapon.shotsFired).toBe(1)
  })

  it('o morto volta no spawn seguinte depois do atraso de respawn', () => {
    const { room, io } = duel()
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    const bia = seat(room, 'bia')
    bia.player.character.position.y = 7
    const ticks = Math.ceil(config.match.respawnDelayS * config.simulation.tickHz)
    // o tick da kill já conta: a vaga de Bia vem depois da de Ana no mesmo tick.
    for (let tick = 2; tick < ticks; tick += 1) stepRoom(room, io, open)
    expect(bia.alive).toBe(false)
    stepRoom(room, io, open)
    expect(bia.alive).toBe(true)
    expect(bia.player.character.position).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('writeRoomState', () => {
  it('escreve posição quantizada, mira e postura de cada jogador', () => {
    const room = createRoomSimulation(config)
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const states = new Map([['ana', emptyState()]])

    writeRoomState(room, (playerId) => states.get(playerId))

    const written = states.get('ana') ?? emptyState()
    expect(written.x).toBe(quantizePositionM(player.character.position.x))
    expect(dequantizePositionM(written.y)).toBeCloseTo(player.character.position.y, 3)
    expect(written).toMatchObject(FORWARD_AIM)
    expect(decodeStance(written.stance)).toEqual({ stance: 'standing', grounded: false })
    expect(written.alive).toBe(true)
  })

  it('pula jogador sem estado ainda criado', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    expect(() => writeRoomState(room, () => undefined)).not.toThrow()
  })
})

describe('assertCanonicalAddress', () => {
  it('aceita o endereço canônico', () => {
    expect(() => assertCanonicalAddress('203.0.113.7')).not.toThrow()
  })

  it.each(['10.0.0.07', 'sala', undefined])('recusa %j, dizendo qual', (address) => {
    expect(() => assertCanonicalAddress(address)).toThrow(new RegExp(`'${address}'`))
  })
})
