import { readFileSync } from 'node:fs'
import {
  createKillEvent,
  type Fighter,
  type KillEvent,
  killFighter,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomIo } from './roomIoFake.ts'
import { scoreRoomBoundaryDeath, scoreRoomKill } from './roomScoreboard.ts'
import { chooseScorestreaks, requestScorestreak, stepRoomScorestreaks } from './roomScorestreaks.ts'
import {
  createRoomSimulation,
  joinRoom,
  leaveRoom,
  type RoomSimulation,
  roomRulesFor,
  stepRoom,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)
const PING_COST = config.scorestreaks.pingCost

function killOf(shooterId: string, victimId: string): KillEvent {
  return { ...createKillEvent(), shooterId, victimId }
}

/**
 * Ana e Bia na sala, com as séries padrão: PING, FERROLHO RÁPIDO, GOLPE ORBITAL,
 * e a partida já valendo — no aquecimento ninguém aciona série.
 */
function duel(): { room: RoomSimulation; io: FakeRoomIo } {
  const room = createRoomSimulation(rules)
  room.match.cycle.phase = 'live'
  joinRoom(room, 'ana', 'katana', rules)
  joinRoom(room, 'bia', 'katana', rules)
  return { room, io: new FakeRoomIo(room) }
}

/** Os pontos da vida de Ana logo abaixo do PING: a próxima kill o paga. */
function nearPing(room: RoomSimulation, playerId: string): void {
  const score = room.board.players.get(playerId)
  if (score) score.scorestreakPoints = PING_COST - config.match.pointsPerKill
}

function fighterOf(room: RoomSimulation, playerId: string): Fighter {
  const seat = room.seats.get(playerId)
  if (!seat) throw new Error(`'${playerId}' fora da sala`)
  return seat.fighter
}

function slotsOf(room: RoomSimulation, playerId: string) {
  return room.scorestreaks.ledger.slotsById.get(playerId)
}

describe('séries da sala', () => {
  it('a kill que chega aos 400 deixa o PING pronto e avisa só o dono, depois da kill', () => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    expect(io.kills).toHaveLength(1)
    expect(io.earned).toEqual(['ana:0:ping'])
    expect(io.activated).toEqual([])
    expect(room.board.players.get('bia')?.scorestreakPoints).toBe(0)
  })

  it('o vivo aciona a série pronta e todos ficam sabendo; o morto não aciona', () => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    nearPing(room, 'bia')
    scoreRoomKill(room, io, killOf('bia', 'ana'), rules)
    killFighter(fighterOf(room, 'ana'), config.match.respawnDelayS)
    requestScorestreak(room, 'ana', 0)
    requestScorestreak(room, 'bia', 0)
    stepRoomScorestreaks(room, io)
    expect(io.activated).toEqual([{ playerId: 'bia', slot: 0, scorestreak: 'ping' }])
    expect(slotsOf(room, 'ana')?.ready[0]).toBe(true)
    expect(room.scorestreaks.pending.size).toBe(0)
  })

  it('o pedido entra pelo tick da sala', () => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    requestScorestreak(room, 'ana', 0)
    stepRoom(room, io, rules)
    expect(io.activated).toEqual([{ playerId: 'ana', slot: 0, scorestreak: 'ping' }])
  })

  it.each(['warmup', 'over'] as const)('em %s ninguém aciona, e o pedido se perde', (phase) => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    room.match.cycle.phase = phase
    requestScorestreak(room, 'ana', 0)
    stepRoomScorestreaks(room, io)
    expect(io.activated).toEqual([])
    expect(room.scorestreaks.pending.size).toBe(0)
    expect(slotsOf(room, 'ana')?.ready[0]).toBe(true)
  })

  it.each([
    ['slot fora da faixa', 'ana', 3],
    ['slot negativo', 'ana', -1],
    ['slot que não é inteiro', 'ana', 0.5],
    ['slot que não é número', 'ana', '0'],
    ['quem não está na sala', 'zé', 0],
  ])('ignora pedido de %s', (_, playerId, slot) => {
    const { room } = duel()
    requestScorestreak(room, playerId, slot)
    expect(room.scorestreaks.pending.size).toBe(0)
  })

  it('o pedido de quem saiu antes do tick se perde com ele', () => {
    const { room, io } = duel()
    requestScorestreak(room, 'bia', 0)
    leaveRoom(room, 'bia', rules)
    room.scorestreaks.pending.set('bia', 0)
    stepRoomScorestreaks(room, io)
    expect(io.activated).toEqual([])
    expect(room.board.players.has('bia')).toBe(false)
  })

  it('a morte pela borda zera os pontos da vida, e a série pronta atravessa a morte', () => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    scoreRoomBoundaryDeath(room, io, 'ana')
    expect(io.boundaryDeaths).toEqual(['ana'])
    expect(room.board.players.get('ana')?.scorestreakPoints).toBe(0)
    expect(slotsOf(room, 'ana')?.ready).toEqual([true, false, false])
    expect(slotsOf(room, 'ana')?.earnedThisLife).toEqual([false, false, false])
  })

  it('o bot que chega ao custo aciona a série no mesmo tick, para todos', () => {
    const { room, io } = duel()
    const [bot] = room.bots.squad.bots
    const botId = bot?.id ?? ''
    const score = room.board.players.get(botId)
    if (score) score.scorestreakPoints = 5000
    scoreRoomKill(room, io, killOf(botId, 'ana'), rules)
    expect(io.activated.map((activated) => activated.playerId)).toEqual([botId, botId, botId])
    expect(slotsOf(room, botId)?.ready).toEqual([false, false, false])
  })
})

describe('o radar da sala', () => {
  it('o PING acionado começa a varrer no relógio da sala; o ganho não', () => {
    const { room, io } = duel()
    room.matchTimeS = 42
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    expect(room.scorestreaks.radar.pulses.size).toBe(0)
    requestScorestreak(room, 'ana', 0)
    stepRoomScorestreaks(room, io)
    expect(room.scorestreaks.radar.pulses.get('ana')).toEqual({
      endsAtS: 42 + config.radar.pingDurationS,
      sweepEveryS: config.radar.pingSweepEveryS,
      revealS: config.radar.blipFadeS,
      nextSweepAtS: 42,
    })
  })

  it('a morte, por tiro ou pela borda, leva os efeitos do corpo', () => {
    const { room, io } = duel()
    const { effects } = room.scorestreaks
    for (const id of ['ana', 'bia']) effects.timers.set(id, new Map([['rapid-bolt', 99]]))
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    expect([...effects.timers.keys()]).toEqual(['ana'])
    scoreRoomBoundaryDeath(room, io, 'ana')
    expect(effects.timers.size).toBe(0)
  })

  it('o PING que o bot gasta sozinho também varre', () => {
    const { room, io } = duel()
    const botId = room.bots.squad.bots[0]?.id ?? ''
    const score = room.board.players.get(botId)
    if (score) score.scorestreakPoints = 5000
    scoreRoomKill(room, io, killOf(botId, 'ana'), rules)
    expect([...room.scorestreaks.radar.pulses.keys()]).toEqual([botId])
  })
})

describe('chooseScorestreaks', () => {
  it('troca as séries de quem está na sala', () => {
    const { room } = duel()
    expect(chooseScorestreaks(room, 'ana', ['echo', 'sonar', 'emp'])).toBe(true)
    expect(slotsOf(room, 'ana')?.loadout).toEqual(['echo', 'sonar', 'emp'])
  })

  it.each([
    ['escolha inválida', 'ana', ['ping', 'ping', 'emp']],
    ['série bloqueada', 'ana', ['ping', 'sonar', 'orbital-strike']],
    ['quem não está na sala', 'zé', ['echo', 'sonar', 'emp']],
  ])('recusa %s e não mexe em nada', (_, playerId, raw) => {
    const { room } = duel()
    expect(chooseScorestreaks(room, playerId, raw)).toBe(false)
    expect(slotsOf(room, 'ana')?.loadout).toEqual(['ping', 'rapid-bolt', 'emp'])
  })

  it('a mesma escolha não zera o que a vida já ganhou', () => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    const before = slotsOf(room, 'ana')
    expect(chooseScorestreaks(room, 'ana', ['ping', 'rapid-bolt', 'emp'])).toBe(true)
    expect(slotsOf(room, 'ana')).toBe(before)
    expect(before?.ready[0]).toBe(true)
  })

  /** A brecha: reenviar a escolha no meio da vida faria o PING já gasto sair de novo. */
  it('a escolha nova no meio de uma vida com pontos não ganha nada nesta vida', () => {
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    chooseScorestreaks(room, 'ana', ['ping', 'sonar', 'counter-ping'])
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    expect(io.earned).toEqual(['ana:0:ping'])
    expect(slotsOf(room, 'ana')?.earnedThisLife).toEqual([true, true, true])
  })

  it('a troca no meio da vida guarda a série pronta que continua na escolha', () => {
    // antes a sala inscrevia de novo: o PING pronto sumia (revisão da fase 1).
    const { room, io } = duel()
    nearPing(room, 'ana')
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    chooseScorestreaks(room, 'ana', ['sonar', 'ping', 'emp'])
    expect(slotsOf(room, 'ana')?.ready).toEqual([false, true, false])
  })

  it('a escolha nova com a vida zerada pode ganhar tudo', () => {
    const { room } = duel()
    chooseScorestreaks(room, 'ana', ['ping', 'sonar', 'counter-ping'])
    expect(slotsOf(room, 'ana')?.earnedThisLife).toEqual([false, false, false])
  })
})
