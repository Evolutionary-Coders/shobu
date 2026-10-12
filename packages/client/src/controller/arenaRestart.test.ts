import { describe, expect, it } from 'vitest'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'
import {
  mountSession,
  pullTrigger,
  ROOM_RULES,
  SPAWN_FEET,
  settleScope,
} from './arenaSessionTestKit.ts'

describe('restartMatch', () => {
  /**
   * O relógio anda desde o primeiro quadro renderizado, que é o boot: sem o
   * zeramento, quem fica cinco minutos no menu entra numa partida encerrada.
   */
  it('zera o relógio da partida', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.matchTimeS).toBeGreaterThan(0)
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    expect(rig.session.matchTimeS).toBe(0)
  })

  /** Regressão: o placar atravessava partidas, e o tab da segunda abria com as kills da primeira. */
  it('zera o placar e as medalhas, com a sala inteira ainda nele', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)?.medals).toBeGreaterThan(0)
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    const local = rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)
    expect([local?.points, local?.kills, local?.medals]).toEqual([0, 0, 0])
    expect(rig.session.scoreboard.kills).toBe(0)
    expect([...rig.session.scoreboard.players.keys()]).toEqual(['local', 'bot-0'])
  })

  it('devolve todo mundo vivo: o jogador no primeiro spawn, e o bot morto de volta à arena', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.bots[0]?.alive).toBe(false)
    rig.session.character.respawnAt({ x: 7, y: 0, z: 7 })
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    expect(rig.session.bots[0]?.alive).toBe(true)
    expect(rig.session.local.alive).toBe(true)
    expect(rig.session.killedBy).toBeNull()
    expect(rig.session.character.current.position).toMatchObject(SPAWN_FEET)
  })
})
