import { matchPhaseLeftS } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createRoomMatchView, type RoomMatchView } from '../net/roomMatchView.ts'
import { createRoomClock, ROOM_CLOCK_SNAP_S, tickRoomClock } from './arenaMatchPhase.ts'
import { AHEAD, mountOnline, snapshotAt } from './arenaOnlineTestKit.ts'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'
import { config, FRAME_S } from './arenaSessionTestKit.ts'

function matchView(phase: RoomMatchView['phase'], phaseLeftS: number): RoomMatchView {
  return { ...createRoomMatchView(), phase, phaseLeftS, arenaId: 'neon-kaido' }
}

function leftS(rig: ReturnType<typeof mountOnline>): number {
  return matchPhaseLeftS(rig.session.matchCycle, config.match)
}

describe('followRoomMatch', () => {
  it('sem estado da sala, a partida segue como estava', () => {
    const rig = mountOnline()
    rig.frame()
    expect(rig.session.matchCycle.phase).toBe('live')
    expect(rig.session.matchOver).toBe(false)
  })

  it('copia a fase e o que falta dela', () => {
    const rig = mountOnline()
    rig.room.match = matchView('warmup', 9.5)
    rig.frame()
    expect(rig.session.matchCycle.phase).toBe('warmup')
    expect(leftS(rig)).toBeCloseTo(9.5)
  })

  it('conta sozinho entre os patches', () => {
    const rig = mountOnline()
    rig.room.match = matchView('live', 100)
    rig.frame()
    rig.frame()
    rig.frame()
    expect(leftS(rig)).toBeCloseTo(100 - 2 * FRAME_S)
  })

  it('o fim congela a arena e fecha a luneta', () => {
    const rig = mountOnline()
    rig.room.match = matchView('live', 1)
    rig.frame()
    rig.weaponInput.scope = true
    for (let frame = 0; frame < 10; frame += 1) rig.frame()
    expect(rig.session.weapon.scoped).toBe(true)
    rig.room.match = matchView('over', 3)
    rig.frame()
    expect(rig.session.matchOver).toBe(true)
    expect(rig.session.weapon.scoped).toBe(false)
  })

  /** Quem entra no intervalo não viu o fim: a arena congela no primeiro quadro. */
  it('quem entra na tela de resultado congela sem ter visto o fim', () => {
    const rig = mountOnline()
    rig.room.match = matchView('results', 6)
    rig.frame()
    expect(rig.session.matchOver).toBe(true)
    expect(leftS(rig)).toBeCloseTo(6)
  })

  it('a partida seguinte zera o placar e põe o jogador vivo no spawn novo', () => {
    const rig = mountOnline()
    rig.room.match = matchView('live', 10)
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.kill('eu', 'ana')
    rig.frame()
    expect(rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)?.kills).toBe(1)
    rig.room.match = matchView('decided', 1)
    rig.frame()
    rig.room.ownFeetM = { x: 7, y: 0, z: -3 }
    rig.room.match = matchView('warmup', 12)
    rig.frame()
    const local = rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)
    expect([local?.points, local?.kills]).toEqual([0, 0])
    expect(rig.session.matchOver).toBe(false)
    expect(rig.session.local.alive).toBe(true)
    expect(rig.session.character.current.position).toMatchObject({ x: 7, z: -3 })
  })

  it('a sala que cai devolve à sessão uma partida que começa agora', () => {
    const rig = mountOnline()
    rig.room.match = matchView('results', 6)
    rig.frame()
    rig.room.ownId = undefined
    rig.frame()
    expect(rig.session.matchCycle.phase).toBe('live')
    expect(rig.session.matchOver).toBe(false)
  })
})

describe('tickRoomClock', () => {
  it('volta ao da sala quando o patch se afasta do que se contou', () => {
    const clock = createRoomClock()
    const view = matchView('live', 100)
    tickRoomClock(clock, view, false, FRAME_S)
    expect(clock.leftS).toBe(100)
    view.phaseLeftS = 100 - FRAME_S - ROOM_CLOCK_SNAP_S / 2
    tickRoomClock(clock, view, false, FRAME_S)
    expect(clock.leftS).toBeCloseTo(100 - FRAME_S)
    view.phaseLeftS = 90
    tickRoomClock(clock, view, false, FRAME_S)
    expect(clock.leftS).toBe(90)
  })

  it('a fase nova vale o da sala, mesmo perto do contado', () => {
    const clock = createRoomClock()
    const view = matchView('live', 10)
    tickRoomClock(clock, view, false, 0)
    tickRoomClock(clock, view, true, FRAME_S)
    expect(clock.leftS).toBe(10)
  })
})
