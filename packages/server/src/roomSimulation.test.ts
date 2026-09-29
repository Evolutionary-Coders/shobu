import { readFileSync } from 'node:fs'
import {
  blockoutToStaticBoxes,
  decodeStance,
  dequantizePositionM,
  encodeButtons,
  GREYBOX_BLOCKOUT,
  GREYBOX_SPAWN_POINTS_M,
  parseGameplayConfig,
  quantizePositionM,
  spawnFeetM,
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

/** A fila de input por jogador que o colyseus guarda; aqui, em memória. */
class FakeInputQueues {
  readonly #queues = new Map<string, WireInput[]>()

  push(playerId: string, input: WireInput): void {
    const queue = this.#queues.get(playerId) ?? []
    queue.push(input)
    this.#queues.set(playerId, queue)
  }

  readonly next = (playerId: string): WireInput | undefined => this.#queues.get(playerId)?.shift()

  remaining(playerId: string): number {
    return this.#queues.get(playerId)?.length ?? 0
  }
}

function emptyState(): PlayerStateFields {
  return { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, stance: 0 }
}

describe('joinRoom', () => {
  it('põe cada jogador que entra no spawn seguinte, com os pés no chão do spawn', () => {
    const room = createRoomSimulation()
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
    const room = createRoomSimulation()
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
    expect(() => joinRoom(createRoomSimulation(), 'ana', [], config)).toThrow(/recebeu 0/)
  })
})

describe('admitPlayer', () => {
  /**
   * Regressão: o estado nascia zerado e só era preenchido no tick seguinte. Se
   * o patch saísse antes, os outros viam o jogador no centro da arena e depois
   * saltando 26 m para o spawn.
   */
  it('escreve o estado de quem entra antes do primeiro tick', () => {
    const room = createRoomSimulation()
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
    const room = createRoomSimulation()
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    leaveRoom(room, 'ana')
    expect(room.match.players.size).toBe(0)
    expect(room.seats.size).toBe(0)
  })
})

describe('stepRoom', () => {
  it('aplica um input no primeiro tick, com um crédito só', () => {
    const room = createRoomSimulation()
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeInputQueues()
    queues.push('ana', FORWARD_WIRE)
    queues.push('ana', FORWARD_WIRE)
    const startZ = player.character.position.z

    stepRoom(room, queues.next, boxes, config)

    expect(player.character.position.z).toBeLessThan(startZ)
    expect(queues.remaining('ana')).toBe(1)
  })

  /** Sem input, o servidor não inventa tick: é o que deixa a reconciliação do cliente fechar. */
  it('deixa parado quem não mandou input', () => {
    const room = createRoomSimulation()
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const before = { ...player.character.position }
    stepRoom(room, new FakeInputQueues().next, boxes, config)
    expect(player.character.position).toEqual(before)
  })

  it('recupera o atraso de um soluço de rede com o crédito guardado', () => {
    const room = createRoomSimulation()
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeInputQueues()
    for (let tick = 0; tick < 3; tick += 1) stepRoom(room, queues.next, boxes, config)
    for (let input = 0; input < 5; input += 1) queues.push('ana', FORWARD_WIRE)

    stepRoom(room, queues.next, boxes, config)

    expect(queues.remaining('ana')).toBe(1)
  })

  it('guarda no máximo INPUT_CREDIT_CAP créditos', () => {
    const room = createRoomSimulation()
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeInputQueues()
    for (let tick = 0; tick < 20; tick += 1) stepRoom(room, queues.next, boxes, config)
    for (let input = 0; input < 20; input += 1) queues.push('ana', FORWARD_WIRE)

    stepRoom(room, queues.next, boxes, config)

    expect(queues.remaining('ana')).toBe(20 - INPUT_CREDIT_CAP)
  })

  /** Um cliente adulterado que manda três inputs por tick não anda três vezes mais rápido. */
  it('não aplica mais de um input por tick na média', () => {
    const room = createRoomSimulation()
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeInputQueues()
    for (let tick = 0; tick < 10; tick += 1) {
      for (let input = 0; input < 3; input += 1) queues.push('ana', FORWARD_WIRE)
      stepRoom(room, queues.next, boxes, config)
    }
    expect(30 - queues.remaining('ana')).toBe(10)
  })

  it('guarda a mira do último input', () => {
    const room = createRoomSimulation()
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const queues = new FakeInputQueues()
    queues.push('ana', { ...FORWARD_WIRE, aimX: 32767, aimZ: 0 })
    stepRoom(room, queues.next, boxes, config)
    expect(room.seats.get('ana')?.aim).toEqual({ aimX: 32767, aimY: 0, aimZ: 0 })
  })
})

describe('writeRoomState', () => {
  it('escreve posição quantizada, mira e postura de cada jogador', () => {
    const room = createRoomSimulation()
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    const states = new Map([['ana', emptyState()]])

    writeRoomState(room, (playerId) => states.get(playerId))

    const written = states.get('ana') ?? emptyState()
    expect(written.x).toBe(quantizePositionM(player.character.position.x))
    expect(dequantizePositionM(written.y)).toBeCloseTo(player.character.position.y, 3)
    expect(written).toMatchObject(FORWARD_AIM)
    expect(decodeStance(written.stance)).toEqual({ stance: 'standing', grounded: false })
  })

  it('pula jogador sem estado ainda criado', () => {
    const room = createRoomSimulation()
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
