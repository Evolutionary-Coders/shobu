import { describe, expect, it } from 'vitest'
import { AHEAD, mountOnline, type OnlineRig, snapshotAt } from './arenaOnlineTestKit.ts'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'
import { config } from './arenaSessionTestKit.ts'

/** A sala com a Ana à frente, já vista pela sessão. */
function roomWithAna(): OnlineRig {
  const rig = mountOnline()
  rig.room.remotes.set('ana', snapshotAt(AHEAD))
  rig.frame()
  return rig
}

function shownSlugs(rig: OnlineRig): string[] {
  return rig.session.lastMedals.map((award) => award.medal.slug)
}

describe('as medalhas da sala, online (ADR 0031)', () => {
  /**
   * Regressão: quem entrou no meio da partida ou recarregou a página começava
   * com o placar local vazio, e a primeira kill que via era o primeiro sangue.
   */
  it('a sala sem medalha nenhuma vale mais que o placar local vazio: sem primeiro sangue', () => {
    const rig = roomWithAna()
    rig.room.kill('eu', 'ana', 'sniper', [])
    rig.frame()
    expect(rig.session.lastMedals).toEqual([])
    expect(rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)?.points).toBe(
      config.match.pointsPerKill,
    )
  })

  it('as que a sala concedeu vão para a tela com os pontos dela', () => {
    const rig = roomWithAna()
    rig.room.kill('eu', 'ana', 'sniper', [{ slug: 'headshot', points: 77 }])
    rig.frame()
    expect(rig.session.lastMedals.map(({ medal, points }) => `${medal.slug}:${points}`)).toEqual([
      'headshot:77',
    ])
    expect(rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)?.medals).toBe(1)
  })

  it('a kill de outro leva as medalhas dela sem anunciá-las na tela deste jogador', () => {
    const rig = roomWithAna()
    rig.room.kill('ana', 'eu', 'sniper', [{ slug: 'first-blood', points: 50 }])
    rig.frame()
    expect(rig.session.lastMedals).toEqual([])
  })

  it('um servidor que não manda medalhas deixa o placar local decidir, como antes', () => {
    const rig = roomWithAna()
    rig.room.kill('eu', 'ana')
    rig.frame()
    expect(shownSlugs(rig)).toContain('first-blood')
  })
})
