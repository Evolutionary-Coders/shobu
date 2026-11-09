import { readFileSync } from 'node:fs'
import { NEON_KAIDO_LAYOUT, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomIo } from './roomIoFake.ts'
import {
  castRoomKickBallot,
  kickRoomViewOf,
  requestRoomKick,
  roomKickVerdict,
  stepRoomKickVote,
} from './roomKickVote.ts'
import { seatReturned } from './roomMatch.ts'
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
const { kickVoteJoinGraceS, kickVoteWindowS, kickVoteProtectionS } = config.match
const BIA_KEY = '3f1c2b8e-9a7d-4c1e-8b2a-6d5e4f3a2b1c'

/** A sala com os humanos dados, todos sentados há mais que a carência da entrada. */
function roomWith(...ids: string[]): { room: RoomSimulation; io: FakeRoomIo } {
  const room = createRoomSimulation(rules)
  for (const id of ids) {
    const seat = joinRoom(room, id, 'katana', rules)
    seat.callsign = id.toUpperCase()
  }
  const bia = room.seats.get('bia')
  if (bia) bia.deviceKey = BIA_KEY
  room.matchTimeS = kickVoteJoinGraceS + 1
  return { room, io: new FakeRoomIo(room) }
}

describe('requestRoomKick', () => {
  it('abre o voto, e quem abriu e mais um expulsam com quatro humanos', () => {
    const { room, io } = roomWith('ana', 'bia', 'caio', 'duda')
    expect(requestRoomKick(room, 'ana', { targetId: 'bia' })).toBe(true)
    stepRoomKickVote(room, io)
    expect(roomKickVerdict(room)).toMatchObject({ kind: 'open', yes: 1, needed: 2 })
    expect(castRoomKickBallot(room, 'caio', { yes: true })).toBe(true)
    stepRoomKickVote(room, io)
    stepRoomKickVote(room, io)
    expect(io.kickVotesClosed).toEqual([{ targetId: 'bia', targetName: 'BIA', outcome: 'passed' }])
    expect(io.voteKicks).toEqual([`bia:${BIA_KEY}`])
    expect(room.kick.vote).toBeUndefined()
  })

  it('a recusa vai a quem pediu no tick', () => {
    const { room, io } = roomWith('ana', 'bia', 'caio')
    requestRoomKick(room, 'ana', { targetId: 'bot-0' })
    stepRoomKickVote(room, io)
    stepRoomKickVote(room, io)
    expect(io.kickRefusals).toEqual(['ana:target-is-bot'])
  })

  it.each([undefined, {}, { targetId: 3 }])('recusa o corpo %j sem tocar no voto', (raw) => {
    const { room } = roomWith('ana', 'bia', 'caio')
    expect(requestRoomKick(room, 'ana', raw)).toBe(false)
    expect(room.kick.refusals).toEqual([])
  })

  it('na sala privada, o anfitrião expulsa no tick, sem voto', () => {
    const { room, io } = roomWith('ana', 'bia')
    room.kick.visibility = 'private'
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    stepRoomKickVote(room, io)
    expect(io.voteKicks).toEqual([`bia:${BIA_KEY}`])
    expect(io.kickVotesClosed).toEqual([{ targetId: 'bia', targetName: 'BIA', outcome: 'passed' }])
  })

  /**
   * Regressão do review do PR #37: quem estava longe, na recarga do mapa novo,
   * não tem conexão para a sala fechar, e voltava pelo token logo depois de
   * expulso e banido.
   */
  it('a vaga expulsa enquanto recarregava não volta pelo token', () => {
    const { room, io } = roomWith('ana', 'bia')
    room.kick.visibility = 'private'
    ;(room.seats.get('bia') as { away: boolean }).away = true
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    stepRoomKickVote(room, io)
    expect(io.voteKicks).toEqual([`bia:${BIA_KEY}`])
    expect(seatReturned(room, 'bia')).toBe(false)
    expect(seatReturned(room, 'ana')).toBe(true)
  })

  it('o alvo que sai antes do tick não é expulso de novo', () => {
    const { room, io } = roomWith('ana', 'bia')
    room.kick.visibility = 'private'
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    leaveRoom(room, 'bia', rules)
    stepRoomKickVote(room, io)
    expect(io.voteKicks).toEqual([])
  })
})

describe('castRoomKickBallot', () => {
  it('recusa sem voto aberto, de quem não vota, e o corpo malformado', () => {
    const { room } = roomWith('ana', 'bia', 'caio')
    expect(castRoomKickBallot(room, 'caio', { yes: true })).toBe(false)
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    expect(castRoomKickBallot(room, 'bia', { yes: false })).toBe(false)
    expect(castRoomKickBallot(room, 'caio', { yes: 'sim' })).toBe(false)
  })
})

describe('stepRoomKickVote', () => {
  it('fecha o voto que a janela venceu, e protege o alvo', () => {
    const { room, io } = roomWith('ana', 'bia', 'caio', 'duda')
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    room.matchTimeS += kickVoteWindowS
    stepRoomKickVote(room, io)
    expect(io.kickVotesClosed).toEqual([{ targetId: 'bia', targetName: 'BIA', outcome: 'failed' }])
    expect(io.voteKicks).toEqual([])
    expect(room.kick.protectedUntilS.get('bia')).toBe(room.matchTimeS + kickVoteProtectionS)
  })

  it('o alvo que sai cancela, com o nome guardado na abertura', () => {
    const { room, io } = roomWith('ana', 'bia', 'caio', 'duda')
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    leaveRoom(room, 'bia', rules)
    stepRoomKickVote(room, io)
    expect(io.kickVotesClosed).toEqual([
      { targetId: 'bia', targetName: 'BIA', outcome: 'cancelled' },
    ])
  })

  it('quem recarrega o mapa novo deixa de contar', () => {
    const { room, io } = roomWith('ana', 'bia', 'caio')
    requestRoomKick(room, 'ana', { targetId: 'bia' })
    const caio = room.seats.get('caio')
    if (caio) caio.awaitsControl = true
    stepRoomKickVote(room, io)
    expect(io.kickVotesClosed.map((closed) => closed.outcome)).toEqual(['cancelled'])
  })

  it('roda no tick da sala', () => {
    const { room, io } = roomWith('ana', 'bia', 'caio')
    requestRoomKick(room, 'ana', { targetId: 'bot-0' })
    stepRoom(room, io, rules)
    expect(io.kickRefusals).toEqual(['ana:target-is-bot'])
  })
})

describe('kickRoomViewOf', () => {
  it('lista os humanos na ordem de entrada, com a presença', () => {
    const { room } = roomWith('ana', 'bia')
    const bia = room.seats.get('bia')
    if (bia) bia.away = true
    expect(kickRoomViewOf(room).humans).toEqual([
      { id: 'ana', seatedAtS: 0, present: true },
      { id: 'bia', seatedAtS: 0, present: false },
    ])
  })

  it('sem voto aberto, não há veredito', () => {
    expect(roomKickVerdict(roomWith('ana').room)).toBeUndefined()
  })
})
