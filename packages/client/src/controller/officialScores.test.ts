import { describe, expect, it } from 'vitest'
import { AHEAD, mountOnline, snapshotAt } from './arenaOnlineTestKit.ts'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'

const OFFICIAL = { points: 450, kills: 4, deaths: 2, streakPoints: 150, pingMs: 0 }

describe('applyOfficialScores', () => {
  it('os números do jogador são os da sala, e a barra das séries também', () => {
    const rig = mountOnline()
    rig.room.scores.set('eu', OFFICIAL)
    rig.frame()
    const local = rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)
    expect(local).toMatchObject({ points: 450, kills: 4, deaths: 2, scorestreakPoints: 150 })
  })

  it('os de cada outro vão para a vaga dele, sem os pontos da vida', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.room.scores.set('ana', OFFICIAL)
    rig.frame()
    const ana = rig.session.scoreboard.players.get('bot-0')
    expect(ana).toMatchObject({ points: 450, kills: 4, deaths: 2, scorestreakPoints: 0 })
  })

  it('quem a sessão ainda não sentou fica de fora', () => {
    const rig = mountOnline()
    rig.room.scores.set('quem', OFFICIAL)
    rig.frame()
    expect([...rig.session.scoreboard.players.keys()]).toEqual([LOCAL_PLAYER_ID])
  })

  /** A revisão redesenha o tab: subir por quadro sem mudança seria redesenho à toa. */
  it('a revisão só sobe quando algum número muda', () => {
    const rig = mountOnline()
    rig.room.scores.set('eu', OFFICIAL)
    rig.frame()
    const revision = rig.session.scoreboard.revision
    rig.frame()
    expect(rig.session.scoreboard.revision).toBe(revision)
    rig.room.scores.set('eu', { ...OFFICIAL, deaths: 3 })
    rig.frame()
    expect(rig.session.scoreboard.revision).toBe(revision + 1)
  })
})

describe('o ping da sala', () => {
  it('o do jogador e o de cada humano são os relatados; o bot da sala é bot', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.room.remotes.set('bot-3', snapshotAt(AHEAD))
    rig.room.scores.set('eu', { ...OFFICIAL, pingMs: 38 })
    rig.room.scores.set('ana', { ...OFFICIAL, pingMs: 120 })
    rig.room.scores.set('bot-3', OFFICIAL)
    rig.frame()
    expect(rig.session.pingOf(LOCAL_PLAYER_ID)).toBe(38)
    expect(rig.session.pingOf('bot-0')).toBe(120)
    expect(rig.session.pingOf('bot-1')).toBe('bot')
  })

  /** A coluna é do tab, e o tab só redesenha quando a revisão sobe. */
  it('o ping que muda sobe a revisão; o mesmo, não', () => {
    const rig = mountOnline()
    rig.room.scores.set('eu', { ...OFFICIAL, pingMs: 38 })
    rig.frame()
    const revision = rig.session.scoreboard.revision
    rig.frame()
    expect(rig.session.scoreboard.revision).toBe(revision)
    rig.room.scores.set('eu', { ...OFFICIAL, pingMs: 52 })
    rig.frame()
    expect(rig.session.scoreboard.revision).toBe(revision + 1)
  })

  it('sem sala, ninguém tem ping', () => {
    const rig = mountOnline()
    rig.room.scores.set('eu', { ...OFFICIAL, pingMs: 38 })
    rig.frame()
    rig.room.ownId = undefined
    rig.frame()
    expect(rig.session.pingOf(LOCAL_PLAYER_ID)).toBeUndefined()
  })
})
