import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  createKillEvent,
  createNavGraph,
  encodeButtons,
  encodePrimaryWeapon,
  isBenched,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { capRoomBots, strikeFromBot } from './roomBots.ts'
import { emptyPlayerState, FakeRoomIo, FakeRoomStateSink } from './roomIoFake.ts'
import { scoreRoomKill } from './roomScoreboard.ts'
import { FORWARD_AIM } from './roomSeat.ts'
import {
  createRoomSimulation,
  joinRoom,
  leaveRoom,
  type RoomRules,
  type RoomSimulation,
  stepRoom,
} from './roomSimulation.ts'
import { writeRoomState } from './roomState.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
/** Sem aquecimento: o primeiro tick já põe a partida valendo, e o tiro do bot mata. */
const config = { ...shipped, match: { ...shipped.match, warmupS: 0 } }

/** A sala de quatro do jogo num campo aberto, com os spawns em linha ao longo de -z. */
const field: RoomRules = {
  arenaId: 'campo-aberto',
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

  /** Regressão do playtest de 09/11: NOVA PARTIDA pública com BOTS 0 sentava um bot. */
  it('respeitam o BOTS da NOVA PARTIDA que criou a sala, também depois de uma saída', () => {
    const room = createRoomSimulation(field)
    capRoomBots(room, 0)
    joinRoom(room, 'ana', 'knife', field)
    expect(seatedBots(room)).toBe(0)
    capRoomBots(room, 1)
    joinRoom(room, 'bia', 'knife', field)
    leaveRoom(room, 'bia', field)
    expect(seatedBots(room)).toBe(1)
  })

  it('sem BOTS válido, completam a sala como sempre', () => {
    const room = createRoomSimulation(field)
    capRoomBots(room, undefined)
    capRoomBots(room, -2)
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
    // o mesmo caminho do tiro humano: conta na precisão do bot.
    expect(room.board.players.get(bot?.id ?? '')?.shotsFired).toBe(1)
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
    io.push('ana', { wishX: 0, wishZ: 0, buttons: fire, ...FORWARD_AIM })
    stepRoom(room, io, field)
    expect(io.kills.map((kill) => `${kill.shooterId}>${kill.victimId}`)).toEqual([`ana>${bot.id}`])
  })
})

describe('bots da sala, no aquecimento', () => {
  /** O bot joga com as regras do jogador: no aquecimento o tiro dele também não mata. */
  it('o tiro de um bot sai, mas não mata ninguém', () => {
    const warmField = { ...field, config: { ...config, match: { ...config.match, warmupS: 600 } } }
    const room = createRoomSimulation(warmField)
    joinRoom(room, 'ana', 'knife', warmField)
    const io = new FakeRoomIo(room)
    for (let tick = 0; tick < 30 * 60 && !io.shots.some((s) => s.hitFighter); tick += 1) {
      stepRoom(room, io, warmField)
    }
    expect(io.shots.some((shot) => shot.hitFighter)).toBe(true)
    expect(io.kills).toEqual([])
  })

  it('o golpe de um bot colado em alguém não mata', () => {
    const room = createRoomSimulation(field)
    const ana = joinRoom(room, 'ana', 'knife', field)
    room.match.cycle.phase = 'warmup'
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    Object.assign(ana.body.position, { x: 0, y: 0, z: -1 })
    Object.assign(bot.body.position, { x: 0, y: 0, z: 0 })
    Object.assign(bot.eyeM, { x: 0, y: 1.6, z: 0 })
    Object.assign(bot.aimM, { x: 0, y: 0, z: -1 })
    bot.melee.weapon = 'knife'
    const io = new FakeRoomIo(room)
    strikeFromBot(room, io, bot, 0, field)
    expect(io.kills).toEqual([])
    expect(ana.fighter.alive).toBe(true)
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

describe('leaveRoom, os bots', () => {
  /**
   * Regressão: o bot guarda o alvo pela posição na lista de combatentes, e a
   * saída de um humano encurta a lista. O alvo do fim apontava para além dela,
   * e o tick seguinte derrubava o servidor inteiro, com todas as salas (15/10).
   */
  it('o bot esquece o alvo quando alguém sai, e o tick seguinte não quebra', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    const bia = joinRoom(room, 'bia', 'knife', field)
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    bot.mind.targetIndex = room.fighters.indexOf(bia.fighter)
    bot.mind.threatIndex = room.fighters.indexOf(bia.fighter)
    leaveRoom(room, 'ana', field)
    expect(() => stepRoom(room, new FakeRoomIo(room), field)).not.toThrow()
    expect(bot.mind.targetIndex).toBeLessThan(room.fighters.length)
  })
})

describe('writeRoomState, os bots', () => {
  it('escreve os bots sentados e tira do estado os do banco', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    joinRoom(room, 'bia', 'knife', field)
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    const benched = room.bots.squad.bots.filter(isBenched).map((bot) => bot.id)
    expect(sink.dropped).toEqual(benched)
    const [seated] = room.bots.squad.bots.filter((bot) => !isBenched(bot))
    expect(sink.states.get(seated?.id ?? '')).toMatchObject({
      alive: true,
      name: seated?.callsign,
      primary: encodePrimaryWeapon('laser'),
    })
  })

  /** Um bot que ainda não olhou para lado nenhum tem mira zero, que não tem direção. */
  it('guarda a mira anterior de um bot com mira zero', () => {
    const room = createRoomSimulation(field)
    const [bot] = room.bots.squad.bots
    if (!bot) throw new Error('a sala de quatro tem bot')
    Object.assign(bot.aimM, { x: 0, y: 0, z: 0 })
    const state = { ...emptyPlayerState(), aimX: 1, aimY: 2, aimZ: 3 }
    const sink = new FakeRoomStateSink()
    writeRoomState(room, { ...sink, stateOf: (id) => (id === bot.id ? state : undefined) })
    expect([state.aimX, state.aimY, state.aimZ]).toEqual([1, 2, 3])
  })
})

function benchedIds(room: RoomSimulation): string[] {
  return room.bots.squad.bots.filter((bot) => isBenched(bot)).map((bot) => bot.id)
}

/** O último bot, de volta do banco uma vez, mata Ana com a partida valendo. */
function roomWithScoringBot(): RoomSimulation {
  const room = createRoomSimulation(field)
  joinRoom(room, 'ana', 'knife', field)
  joinRoom(room, 'bia', 'knife', field)
  leaveRoom(room, 'bia', field)
  const io = new FakeRoomIo(room)
  room.match.cycle.phase = 'live'
  scoreRoomKill(room, io, { ...createKillEvent(), shooterId: 'bot-2', victimId: 'ana' }, field)
  return room
}

/** A vaga cedida não leva o que o bot fez: nem placar, nem série, nem pódio. */
describe('o bot no banco', () => {
  it('sai do placar e do livro das séries quando um humano toma a vaga dele', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    joinRoom(room, 'bia', 'knife', field)
    expect(benchedIds(room)).toEqual(['bot-2'])
    expect(room.board.players.has('bot-2')).toBe(false)
    expect(room.scorestreaks.ledger.slotsById.has('bot-2')).toBe(false)
    expect([...room.board.players.keys()].sort()).toEqual(['ana', 'bia', 'bot-0', 'bot-1'])
  })

  it('perde o pedido de série que esperava o tick', () => {
    const room = createRoomSimulation(field)
    joinRoom(room, 'ana', 'knife', field)
    room.scorestreaks.pending.set('bot-2', 0)
    joinRoom(room, 'bia', 'knife', field)
    expect(room.scorestreaks.pending.has('bot-2')).toBe(false)
  })

  /** Regressão: o bot que voltava do banco retomava os pontos e a série de antes. */
  it('volta do zero quando o humano sai, sem os pontos nem a série de antes', () => {
    const room = roomWithScoringBot()
    expect(room.board.players.get('bot-2')?.points).toBeGreaterThan(0)
    const oldSlots = room.scorestreaks.ledger.slotsById.get('bot-2')
    joinRoom(room, 'bia', 'knife', field)
    leaveRoom(room, 'bia', field)
    expect(room.board.players.get('bot-2')).toMatchObject({ points: 0, kills: 0 })
    expect(room.board.players.get('bot-2')?.scorestreakPoints).toBe(0)
    const slots = room.scorestreaks.ledger.slotsById.get('bot-2')
    expect(slots).toBeDefined()
    expect(slots).not.toBe(oldSlots)
    expect(slots?.earnedThisLife).toEqual([false, false, false])
    expect(room.scorestreaks.ledger.autoSpenders.has('bot-2')).toBe(true)
  })

  it('com a sala cheia de humanos, o placar só tem os quatro', () => {
    const room = createRoomSimulation(field)
    for (const id of ['ana', 'bia', 'caio', 'duda']) joinRoom(room, id, 'knife', field)
    expect([...room.board.players.keys()]).toEqual(['ana', 'bia', 'caio', 'duda'])
    expect(room.scorestreaks.ledger.slotsById.size).toBe(4)
  })
})
