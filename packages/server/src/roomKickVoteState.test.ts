import { readFileSync } from 'node:fs'
import { Encoder } from '@colyseus/schema'
import {
  KICK_BALLOT_NO,
  KICK_BALLOT_PENDING,
  KICK_BALLOT_YES,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GameRoomState } from './gameRoomState.ts'
import { FakeRoomStateSink } from './roomIoFake.ts'
import { castRoomKickBallot, requestRoomKick } from './roomKickVote.ts'
import { writeKickVoteState } from './roomKickVoteState.ts'
import {
  createRoomSimulation,
  joinRoom,
  leaveRoom,
  type RoomSimulation,
  roomRulesFor,
} from './roomSimulation.ts'
import { writeRoomState } from './roomState.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)

/** Ana abre o voto contra Bia, com Caio e Duda na sala. */
function votingRoom(): RoomSimulation {
  const room = createRoomSimulation(rules)
  for (const id of ['ana', 'bia', 'caio', 'duda']) {
    const seat = joinRoom(room, id, 'katana', rules)
    seat.callsign = id.toUpperCase()
  }
  room.matchTimeS = config.match.kickVoteJoinGraceS + 1
  requestRoomKick(room, 'ana', { targetId: 'bia' })
  return room
}

describe('writeKickVoteState', () => {
  it('escreve o alvo, o tempo, as contagens e cada eleitor', () => {
    const room = votingRoom()
    castRoomKickBallot(room, 'duda', { yes: false })
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    const { kickVote } = sink.match
    expect(kickVote).toMatchObject({
      targetId: 'bia',
      targetName: 'BIA',
      initiatorId: 'ana',
      leftDs: config.match.kickVoteWindowS * 10,
      yes: 1,
      no: 1,
      needed: 2,
    })
    expect([...kickVote.ballots]).toEqual([
      ['ana', KICK_BALLOT_YES],
      ['caio', KICK_BALLOT_PENDING],
      ['duda', KICK_BALLOT_NO],
    ])
    expect(sink.match.hostId).toBe('')
  })

  it('tira do mapa quem saiu, e apaga tudo quando o voto fecha', () => {
    const room = votingRoom()
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    leaveRoom(room, 'duda', rules)
    writeRoomState(room, sink)
    expect([...sink.match.kickVote.ballots.keys()]).toEqual(['ana', 'caio'])
    room.kick.vote = undefined
    writeRoomState(room, sink)
    writeRoomState(room, sink)
    expect(sink.match.kickVote).toMatchObject({ targetId: '', targetName: '', needed: 0 })
    expect(sink.match.kickVote.ballots.size).toBe(0)
  })

  it('escreve o anfitrião da sala privada', () => {
    const room = votingRoom()
    room.kick.visibility = 'private'
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.match.hostId).toBe('ana')
  })

  it('cabe no schema e codifica', () => {
    const room = votingRoom()
    const state = new GameRoomState()
    writeKickVoteState(room, state.match)
    expect(state.match.kickVote.targetId).toBe('bia')
    expect(state.match.kickVote.ballots.get('caio')).toBe(KICK_BALLOT_PENDING)
    expect(new Encoder(state).encodeAll().byteLength).toBeGreaterThan(0)
  })
})
