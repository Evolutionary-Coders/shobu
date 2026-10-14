import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  decodeStance,
  dequantizePositionM,
  EYE_HEIGHT_RATIO,
  encodeButtons,
  type KillEvent,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  quantizePositionM,
  spawnFeetM,
  type Vector3,
  type WireButtons,
  type WireInput,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  admitPlayer,
  assertCanonicalAddress,
  chooseMelee,
  createRoomSimulation,
  FORWARD_AIM,
  INPUT_CREDIT_CAP,
  joinRoom,
  leaveRoom,
  type PlayerStateFields,
  type RoomIo,
  type RoomRules,
  type RoomSeat,
  type RoomSimulation,
  roomRulesFor,
  stepRoom,
  writeRoomState,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const NO_BUTTONS: WireButtons = {
  sprint: false,
  jump: false,
  crouch: false,
  grapple: false,
  fire: false,
  scope: false,
  aim: false,
  reload: false,
  melee: false,
  primary: false,
}

function wire(buttons: Partial<WireButtons> = {}, wish: Partial<WireInput> = {}): WireInput {
  return {
    wishX: 0,
    wishZ: 0,
    buttons: encodeButtons({ ...NO_BUTTONS, ...buttons }),
    ...FORWARD_AIM,
    ...wish,
  }
}

const FORWARD_WIRE = wire({}, { wishZ: -127 })
const FIRE_WIRE = wire({ fire: true })
const DUEL_M = 1.5

/**
 * Abre a luneta, espera ela assentar e atira: o tiro sai exato, sem cone, e
 * a altura do acerto é a do olho.
 */
function pushScopedShot(io: FakeRoomIo, playerId: string): number {
  const settleTicks = Math.ceil(config.weapon.scopeSettleS * config.simulation.tickHz) + 1
  io.push(playerId, wire({ scope: true }))
  io.push(playerId, wire(), settleTicks)
  io.push(playerId, FIRE_WIRE)
  return settleTicks + 2
}

/**
 * Um campo aberto, só chão, com dois spawns frente a frente: a mira padrão,
 * para -z, cruza o alvo. O duelo é a 1,5 m, onde o cone sem luneta tem raio
 * menor que o da cápsula, e o tiro acerta sem depender de sorte. A área de jogo cobre o
 * campo inteiro, menos onde um teste leva alguém para fora.
 */
const open: RoomRules = {
  config,
  boxes: [boxFromCenterSize([0, -0.5, 0], [400, 1, 400])],
  spawnsFeetM: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -3 },
  ],
  playArea: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
}

/**
 * O colyseus do lado da sala, em memória: a fila de input por jogador, o
 * rewind e os avisos de morte. Sem posição rebobinada marcada, o atirador vê
 * o alvo onde o alvo está agora.
 */
class FakeRoomIo implements RoomIo {
  readonly #queues = new Map<string, WireInput[]>()
  readonly seenFeet = new Map<string, Vector3>()
  readonly kills: KillEvent[] = []
  readonly boundaryDeaths: string[] = []

  constructor(readonly room: RoomSimulation) {}

  push(playerId: string, input: WireInput, times = 1): void {
    const queue = this.#queues.get(playerId) ?? []
    for (let index = 0; index < times; index += 1) queue.push(input)
    this.#queues.set(playerId, queue)
  }

  remaining(playerId: string): number {
    return this.#queues.get(playerId)?.length ?? 0
  }

  nextInput(playerId: string): WireInput | undefined {
    return this.#queues.get(playerId)?.shift()
  }

  readonly feetSeenBy = (_shooterId: string, targetId: string, out: Vector3): Vector3 => {
    const feetM = this.seenFeet.get(targetId) ?? this.room.seats.get(targetId)?.body.position
    if (!feetM) throw new Error(`alvo '${targetId}' fora da sala`)
    out.x = feetM.x
    out.y = feetM.y
    out.z = feetM.z
    return out
  }

  readonly onKill = (kill: Readonly<KillEvent>): void => {
    this.kills.push({ ...kill })
  }

  readonly onBoundaryDeath = (playerId: string): void => {
    this.boundaryDeaths.push(playerId)
  }

  killList(): string[] {
    return this.kills.map((kill) => `${kill.shooterId}>${kill.victimId}:${kill.weapon}`)
  }
}

function emptyState(): PlayerStateFields {
  return { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, stance: 0, alive: false }
}

function seat(room: RoomSimulation, playerId: string): RoomSeat {
  const found = room.seats.get(playerId)
  if (!found) throw new Error(`'${playerId}' fora da sala`)
  return found
}

interface Duel {
  readonly room: RoomSimulation
  readonly io: FakeRoomIo
}

/** Ana no primeiro spawn, Bia no segundo, bem na mira de Ana. */
function duel(): Duel {
  const room = createRoomSimulation(config)
  joinRoom(room, 'ana', 'knife', open)
  joinRoom(room, 'bia', 'knife', open)
  const ana = seat(room, 'ana')
  const bia = seat(room, 'bia')
  Object.assign(ana.body.position, { x: 0, y: 0, z: 0 })
  Object.assign(bia.body.position, { x: 0, y: 0, z: -DUEL_M })
  return { room, io: new FakeRoomIo(room) }
}

describe('roomRulesFor', () => {
  it('monta a colisão do mapa e desce cada spawn uma cápsula, na ordem do mapa', () => {
    const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)
    const [x, y, z] = spawnFeetM(
      NEON_KAIDO_LAYOUT.spawnPointsM[0] ?? [0, 0, 0],
      config.collision.capsuleHeightM,
    )
    expect(rules.spawnsFeetM[0]).toEqual({ x, y, z })
    expect(rules.spawnsFeetM).toHaveLength(NEON_KAIDO_LAYOUT.spawnPointsM.length)
    expect(rules.boxes.length).toBeGreaterThan(NEON_KAIDO_LAYOUT.blockout.length)
    expect(rules.playArea).toBe(NEON_KAIDO_LAYOUT.playArea)
  })
})

describe('joinRoom', () => {
  it('põe quem entra num dos spawns, com a lâmina da classe', () => {
    const room = createRoomSimulation(config)
    const ana = joinRoom(room, 'ana', 'katana', open)
    expect(open.spawnsFeetM).toContainEqual(ana.body.position)
    expect(ana.arsenal.melee.weapon).toBe('katana')
    expect(room.fighters).toEqual([ana.fighter])
  })

  it('recusa um id que já está na sala, dizendo qual', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', 'knife', open)
    expect(() => joinRoom(room, 'ana', 'knife', open)).toThrow(/'ana'/)
  })
})

describe('admitPlayer', () => {
  /**
   * Regressão: o estado nascia zerado e só era preenchido no tick seguinte. Se
   * o patch saísse antes, os outros viam o jogador no centro da arena e depois
   * saltando para o spawn.
   */
  it('escreve o estado de quem entra antes do primeiro tick', () => {
    const room = createRoomSimulation(config)
    const state = emptyState()
    const ana = admitPlayer(room, 'ana', 'knife', open, () => state)
    expect(state.x).toBe(quantizePositionM(ana.body.position.x))
    expect(state.z).toBe(quantizePositionM(ana.body.position.z))
  })
})

describe('chooseMelee', () => {
  it('troca a lâmina pela que o cliente escolheu', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', 'knife', open)
    chooseMelee(room, 'ana', 'katana')
    expect(seat(room, 'ana').arsenal.melee.weapon).toBe('katana')
  })

  /** Vem da rede: uma lâmina que o jogo não tem não entra, e ninguém de fora da sala muda. */
  it.each(['machado', undefined, 3])('ignora %j', (weapon) => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', 'knife', open)
    chooseMelee(room, 'ana', weapon)
    chooseMelee(room, 'ninguém', 'katana')
    expect(seat(room, 'ana').arsenal.melee.weapon).toBe('knife')
  })
})

describe('leaveRoom', () => {
  it('tira o jogador da sala e dos lutadores', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', 'knife', open)
    const bia = joinRoom(room, 'bia', 'knife', open)
    leaveRoom(room, 'ana')
    leaveRoom(room, 'ninguém')
    expect([...room.seats.keys()]).toEqual(['bia'])
    expect(room.fighters).toEqual([bia.fighter])
  })
})

describe('stepRoom, o crédito de input', () => {
  it('aplica um input no primeiro tick, com um crédito só', () => {
    const { room, io } = duel()
    const ana = seat(room, 'ana')
    io.push('ana', FORWARD_WIRE, 2)
    const startZ = ana.body.position.z
    stepRoom(room, io, open)
    expect(ana.body.position.z).toBeLessThan(startZ)
    expect(io.remaining('ana')).toBe(1)
  })

  /** Sem input, o servidor não inventa tick: é o que deixa a reconciliação do cliente fechar. */
  it('deixa parado quem não mandou input', () => {
    const { room, io } = duel()
    const before = { ...seat(room, 'ana').body.position }
    stepRoom(room, io, open)
    expect(seat(room, 'ana').body.position).toEqual(before)
  })

  it('recupera o atraso de um soluço de rede com o crédito guardado', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 3; tick += 1) stepRoom(room, io, open)
    io.push('ana', FORWARD_WIRE, 5)
    stepRoom(room, io, open)
    expect(io.remaining('ana')).toBe(1)
  })

  it('guarda no máximo INPUT_CREDIT_CAP créditos', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 20; tick += 1) stepRoom(room, io, open)
    io.push('ana', FORWARD_WIRE, 20)
    stepRoom(room, io, open)
    expect(io.remaining('ana')).toBe(20 - INPUT_CREDIT_CAP)
  })

  /** Um cliente adulterado que manda três inputs por tick não anda três vezes mais rápido. */
  it('não aplica mais de um input por tick na média', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 10; tick += 1) {
      io.push('ana', FORWARD_WIRE, 3)
      stepRoom(room, io, open)
    }
    expect(30 - io.remaining('ana')).toBe(10)
  })

  it('guarda a mira do último input, e é para lá que o lutador olha', () => {
    const { room, io } = duel()
    io.push('ana', wire({}, { aimX: 32767, aimZ: 0 }))
    stepRoom(room, io, open)
    expect(seat(room, 'ana').aim).toEqual({ aimX: 32767, aimY: 0, aimZ: 0 })
    expect(seat(room, 'ana').fighter.facingM).toEqual({ x: 1, y: 0, z: 0 })
  })
})

describe('stepRoom, o tiro', () => {
  it('mata o alvo na mira e avisa a sala de quem matou quem', () => {
    const { room, io } = duel()
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(seat(room, 'bia').fighter.alive).toBe(false)
    expect(io.killList()).toEqual(['ana>bia:sniper'])
  })

  /** Cada cliente pontua a kill pelo `recordKill`, e as medalhas leem estes campos. */
  it('descreve a kill com distância, altura do acerto e luneta, do jeito do núcleo', () => {
    const { room, io } = duel()
    const ticks = pushScopedShot(io, 'ana')
    for (let tick = 0; tick < ticks; tick += 1) stepRoom(room, io, open)
    const [kill] = io.kills
    expect(kill?.distanceM).toBeCloseTo(DUEL_M - config.collision.capsuleRadiusM, 6)
    expect(kill?.hitHeightRatio).toBeCloseTo(EYE_HEIGHT_RATIO, 6)
    expect(kill).toMatchObject({ victimId: 'bia', scoped: true })
    expect(kill?.atS).toBeCloseTo(ticks / config.simulation.tickHz, 9)
  })

  /** O rewind: o acerto vale contra o que a tela do atirador mostrava, não contra o agora. */
  it('acerta o alvo onde o atirador o viu, mesmo que ele já tenha saído dali', () => {
    const { room, io } = duel()
    seat(room, 'bia').body.position.x = 5
    io.seenFeet.set('bia', { x: 0, y: 0, z: -DUEL_M })
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(io.killList()).toEqual(['ana>bia:sniper'])
  })

  /** A altura do acerto é contra a cápsula em que o raio bateu: a rebobinada. */
  it('mede a altura do acerto nos pés rebobinados', () => {
    const { room, io } = duel()
    seat(room, 'bia').body.position.y = 3
    io.seenFeet.set('bia', { x: 0, y: 0, z: -DUEL_M })
    const ticks = pushScopedShot(io, 'ana')
    for (let tick = 0; tick < ticks; tick += 1) stepRoom(room, io, open)
    expect(io.kills[0]?.hitHeightRatio).toBeCloseTo(EYE_HEIGHT_RATIO, 6)
  })

  it('erra o alvo que o atirador viu fora da mira, mesmo que ele esteja nela agora', () => {
    const { room, io } = duel()
    io.seenFeet.set('bia', { x: 5, y: 0, z: -DUEL_M })
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(seat(room, 'bia').fighter.alive).toBe(true)
  })

  it('não mira em quem já morreu', () => {
    const { room, io } = duel()
    seat(room, 'bia').fighter.alive = false
    seat(room, 'bia').fighter.respawnLeftS = 10
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(io.kills).toEqual([])
  })

  /** O morto não atira nem anda, e a confirmação dele segue andando. */
  it('consome o input do morto sem mover nem atirar', () => {
    const { room, io } = duel()
    const bia = seat(room, 'bia')
    bia.fighter.alive = false
    bia.fighter.respawnLeftS = 10
    const before = { ...bia.body.position }
    io.push('bia', wire({ fire: true }, { wishZ: 127, aimZ: 32767 }))
    stepRoom(room, io, open)
    expect(io.remaining('bia')).toBe(0)
    expect(bia.body.position).toEqual(before)
    expect(seat(room, 'ana').fighter.alive).toBe(true)
  })

  it('o morto volta num spawn, com o corpo zerado, depois do atraso', () => {
    const { room, io } = duel()
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    const bia = seat(room, 'bia')
    bia.body.position.y = 7
    let ticks = 1
    while (!bia.fighter.alive && ticks < 1000) {
      stepRoom(room, io, open)
      ticks += 1
    }
    // a soma de ticks de 1/60 não fecha exata: o relógio pode pedir um tick a mais.
    const expected = config.match.respawnDelayS * config.simulation.tickHz
    expect(ticks).toBeGreaterThanOrEqual(expected)
    expect(ticks).toBeLessThanOrEqual(expected + 1)
    expect(open.spawnsFeetM).toContainEqual(bia.body.position)
  })
})

describe('stepRoom, a lâmina', () => {
  /** O golpe é contra as posições de agora: a faca alcança quem está a um passo. */
  it('mata com a faca quem está ao alcance, e avisa a sala', () => {
    const { room, io } = duel()
    seat(room, 'bia').body.position.z = -1.2
    io.push('ana', wire({ melee: true }))
    io.push('ana', wire())
    for (let tick = 0; tick < 2; tick += 1) stepRoom(room, io, open)
    expect(io.killList()).toEqual(['ana>bia:knife'])
    expect(seat(room, 'bia').fighter.alive).toBe(false)
  })

  it('o golpe no vazio não mata ninguém', () => {
    const { room, io } = duel()
    seat(room, 'bia').body.position.z = -10
    io.push('ana', wire({ melee: true }))
    io.push('ana', wire())
    for (let tick = 0; tick < 2; tick += 1) stepRoom(room, io, open)
    expect(io.kills).toEqual([])
  })
})

describe('stepRoom, a área de jogo', () => {
  /** O rodízio por mortes é o mesmo do cliente: a predição reaparece no mesmo spawn. */
  it('quem fica fora até o prazo vencer morre e volta no spawn do rodízio', () => {
    const { room, io } = duel()
    const ana = seat(room, 'ana')
    ana.body.position.x = 60
    const graceTicks = Math.ceil(config.match.outOfBoundsGraceS * config.simulation.tickHz) + 1
    io.push('ana', wire(), graceTicks)
    for (let tick = 0; tick < graceTicks; tick += 1) stepRoom(room, io, open)
    expect(io.boundaryDeaths).toEqual(['ana'])
    expect(ana.body.position).toEqual(open.spawnsFeetM[0])
    expect(ana.boundaryDeaths).toBe(1)
  })
})

describe('writeRoomState', () => {
  it('escreve posição quantizada, mira, postura e se está vivo', () => {
    const { room } = duel()
    const ana = seat(room, 'ana')
    ana.body.position.x = 1.2345
    const states = new Map([['ana', emptyState()]])
    writeRoomState(room, (playerId) => states.get(playerId))
    const written = states.get('ana') ?? emptyState()
    expect(written.x).toBe(quantizePositionM(1.2345))
    expect(dequantizePositionM(written.y)).toBeCloseTo(ana.body.position.y, 3)
    expect(written).toMatchObject(FORWARD_AIM)
    expect(decodeStance(written.stance).stance).toBe('standing')
    expect(written.alive).toBe(true)
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
