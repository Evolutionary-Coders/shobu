import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  createNavGraph,
  encodeButtons,
  isBenched,
  type KillEvent,
  parseGameplayConfig,
  type ShotMessage,
  type Vector3,
  type WireInput,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { strikeFromBot } from './roomBots.ts'
import {
  createRoomSimulation,
  FORWARD_AIM,
  joinRoom,
  leaveRoom,
  type RoomIo,
  type RoomRules,
  type RoomSimulation,
  stepRoom,
} from './roomSimulation.ts'
import { type PlayerStateFields, writeRoomState } from './roomState.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

/** A sala de quatro do jogo num campo aberto, com os spawns em linha ao longo de -z. */
const field: RoomRules = {
  config,
  boxes: [boxFromCenterSize([0, -0.5, 0], [400, 1, 400])],
  spawnsFeetM: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -8 },
    { x: 30, y: 0, z: 30 },
    { x: -30, y: 0, z: 30 },
  ],
  playArea: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  navGraph: createNavGraph(
    [
      { name: 'a', feetM: { x: -0.2, y: 0, z: 0 } },
      { name: 'b', feetM: { x: 0.2, y: 0, z: 0 } },
    ],
    [{ from: 'a', to: 'b', kind: 'walk' }],
  ),
}

/** O colyseus da sala em memória: inputs, rewind que vê o agora, as kills e os tiros. */
class FakeRoomIo implements RoomIo {
  readonly inputs = new Map<string, WireInput[]>()
  readonly kills: KillEvent[] = []
  readonly shots: ShotMessage[] = []

  constructor(readonly room: RoomSimulation) {}

  nextInput(playerId: string): WireInput | undefined {
    return this.inputs.get(playerId)?.shift()
  }

  readonly feetSeenBy = (_shooterId: string, targetId: string, out: Vector3): Vector3 => {
    const target = this.room.fighters.find((fighter) => fighter.id === targetId)
    if (!target) throw new Error(`alvo '${targetId}' fora da sala`)
    return Object.assign(out, target.body.position)
  }

  readonly onKill = (kill: Readonly<KillEvent>): void => {
    this.kills.push({ ...kill })
  }

  readonly onBoundaryDeath = (): void => {}

  readonly onShot = (shot: Readonly<ShotMessage>): void => {
    this.shots.push({ ...shot, fromM: { ...shot.fromM }, toM: { ...shot.toM } })
  }
}

function seatedBots(room: RoomSimulation): number {
  return room.bots.squad.bots.filter((bot) => !isBenched(bot)).length
}

describe('bots da sala', () => {
  /** Os bots completam a sala (ADR 0016): quem entra toma a vaga de um, quem sai a devolve. */
  it('sentam um bot a menos por humano, até a sala de quatro encher', () => {
    const room = createRoomSimulation(field)
    expect(seatedBots(room)).toBe(3)
    joinRoom(room, 'ana', 'knife', field)
    expect(seatedBots(room)).toBe(3)
    joinRoom(room, 'bia', 'knife', field)
    expect(seatedBots(room)).toBe(2)
    leaveRoom(room, 'bia', field)
    expect(seatedBots(room)).toBe(3)
  })

  it('vêm antes dos humanos na lista de lutadores', () => {
    const room = createRoomSimulation(field)
    const ana = joinRoom(room, 'ana', 'knife', field)
    expect(room.fighters.slice(0, 3)).toEqual(room.bots.squad.bots)
    expect(room.fighters.at(-1)).toBe(ana.fighter)
  })

  /** O bot joga com as regras do jogador: na sala com alguém na mira, ele mata. */
  it('um bot mata o humano que fica parado na frente dele, e a sala fica sabendo', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    const io = new FakeRoomIo(room)
    for (let tick = 0; tick < 30 * 60 && io.kills.length === 0; tick += 1) stepRoom(room, io, field)
    expect(io.kills[0]?.shooterId).toMatch(/^bot-/)
  })

  /** Para o cliente, o tiro do bot é o de um jogador da sala: rastro, clarão e som. */
  it('o tiro de um bot vai para a sala, do olho dele até onde o raio parou', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    const io = new FakeRoomIo(room)
    for (let tick = 0; tick < 30 * 60 && io.shots.length === 0; tick += 1) stepRoom(room, io, field)
    const [shot] = io.shots
    const bot = room.bots.squad.bots.find((candidate) => candidate.id === shot?.shooterId)
    expect(shot?.fromM).toEqual(bot?.eyeM)
    expect(shot?.toM).not.toEqual(shot?.fromM)
  })

  /** Colado no humano, o bot puxa a faca (`trackKnifeReach`), como o bot local. */
  it('um bot colado no humano o mata na faca', () => {
    const room = createRoomSimulation(field)
    const ana = joinRoom(room, 'ana', 'knife', field)
    const [bot, ...others] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    // os outros dois no banco: o duelo é só deste bot com Ana.
    for (const other of others) Object.assign(other, { alive: false, respawnLeftS: Infinity })
    Object.assign(ana.body.position, { x: 0, y: 0, z: -1 })
    Object.assign(bot.body.position, { x: 0, y: 0, z: 0 })
    const io = new FakeRoomIo(room)
    for (let tick = 0; tick < 10 * 60 && io.kills.length === 0; tick += 1) stepRoom(room, io, field)
    expect(io.kills[0]).toMatchObject({ shooterId: bot.id, victimId: 'ana', weapon: 'knife' })
  })

  it('o bot morto volta num spawn depois do atraso', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    bot.alive = false
    bot.respawnLeftS = config.match.respawnDelayS
    const io = new FakeRoomIo(room)
    const ticks = Math.ceil(config.match.respawnDelayS * config.simulation.tickHz) + 1
    for (let tick = 0; tick < ticks; tick += 1) stepRoom(room, io, field)
    expect(bot.alive).toBe(true)
  })

  /** O humano acerta o bot pelo mesmo rewind que acerta outro humano. */
  it('o tiro do humano mata o bot que está na mira', () => {
    const room = createRoomSimulation(field)
    const ana = joinRoom(room, 'ana', 'knife', field)
    room.bots.squad.hostile = false
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    Object.assign(ana.body.position, { x: 50, y: 0, z: 50 })
    Object.assign(bot.body.position, { x: 50, y: 0, z: 48.5 })
    const io = new FakeRoomIo(room)
    const fire = encodeButtons({
      sprint: false,
      jump: false,
      crouch: false,
      grapple: false,
      fire: true,
      scope: false,
      aim: false,
      reload: false,
      melee: false,
      primary: false,
    })
    io.inputs.set('ana', [{ wishX: 0, wishZ: 0, buttons: fire, ...FORWARD_AIM }])
    stepRoom(room, io, field)
    expect(io.kills.map((kill) => `${kill.shooterId}>${kill.victimId}`)).toEqual([`ana>${bot.id}`])
  })
})

describe('strikeFromBot', () => {
  it('o golpe no vazio não mata ninguém', () => {
    const room = createRoomSimulation(field)
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    const io = new FakeRoomIo(room)
    strikeFromBot(room, io, bot, 0, field)
    expect(io.kills).toEqual([])
  })
})

describe('writeRoomState, os bots', () => {
  it('escreve os bots sentados e tira do estado os do banco', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    joinRoom(room, 'bia', 'knife', field)
    const states = new Map<string, PlayerStateFields>()
    const dropped: string[] = []
    writeRoomState(room, {
      stateOf: (id) => {
        const state = states.get(id) ?? {
          x: 0,
          y: 0,
          z: 0,
          aimX: 0,
          aimY: 0,
          aimZ: 0,
          stance: 0,
          alive: false,
        }
        states.set(id, state)
        return state
      },
      drop: (id) => dropped.push(id),
    })
    const benched = room.bots.squad.bots.filter(isBenched).map((bot) => bot.id)
    expect(dropped).toEqual(benched)
    const [seated] = room.bots.squad.bots.filter((bot) => !isBenched(bot))
    expect(states.get(seated?.id ?? '')?.alive).toBe(true)
  })

  /** Um bot que ainda não olhou para lado nenhum tem mira zero, que não tem direção. */
  it('guarda a mira anterior de um bot com mira zero', () => {
    const room = createRoomSimulation(field)
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    Object.assign(bot.aimM, { x: 0, y: 0, z: 0 })
    const state = { x: 0, y: 0, z: 0, aimX: 1, aimY: 2, aimZ: 3, stance: 0, alive: false }
    writeRoomState(room, { stateOf: (id) => (id === bot.id ? state : undefined), drop: () => {} })
    expect([state.aimX, state.aimY, state.aimZ]).toEqual([1, 2, 3])
  })
})
