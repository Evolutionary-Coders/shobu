import { boxFromCenterSize, type StaticBox } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'
import {
  config,
  FLOOR,
  mountSession,
  pullTrigger,
  type Rig,
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

  it('cada partida tem semente nova, para o voto dos bots não se repetir', () => {
    const rig = mountSession()
    const first = rig.session.matchSeed
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    expect(rig.session.matchSeed).toBe(first + 1)
  })
})

describe('fim de partida', () => {
  const TIMED = { ...ROOM_RULES, hostileBots: false, timed: true } as const
  /** A partida mais curta que o parser aceita: o mesmo relógio, em menos quadros. */
  const SHORT = { ...config, match: { ...config.match, durationS: 30 } }
  /** O maior quadro que o acumulador aceita inteiro (`maxTicksPerFrame`). */
  const LONG_FRAME_S = 0.1

  /** Uma parede 30 m à frente: dentro do alcance do gancho. */
  const WALL = boxFromCenterSize([0, 10, 30.5], [40, 20, 1])

  function mountTimed(boxes: readonly StaticBox[] = [FLOOR]): Rig {
    const rig = mountSession(boxes, { config: SHORT })
    rig.session.restartMatch(TIMED)
    return rig
  }

  /** Roda até `seconds` de partida, em quadros longos: rápido, e o tick é o mesmo. */
  function runFor(rig: Rig, seconds: number): void {
    for (let frame = 0; frame < seconds / LONG_FRAME_S; frame += 1) {
      rig.frame({ elapsedS: LONG_FRAME_S })
    }
  }

  it('sem relógio (o treino), a partida não acaba', () => {
    const rig = mountSession([FLOOR], { config: SHORT })
    runFor(rig, 31)
    expect(rig.session.matchOver).toBe(false)
    expect(rig.session.matchTimeS).toBeGreaterThan(30)
  })

  it('com relógio, acaba no prazo, com o relógio cravado no zero', () => {
    const rig = mountTimed()
    runFor(rig, 29)
    expect(rig.session.matchOver).toBe(false)
    runFor(rig, 2)
    expect(rig.session.matchOver).toBe(true)
    expect(rig.session.matchTimeS).toBe(30)
  })

  it('acabada, nada mais anda: nem o relógio, nem o tiro', () => {
    const rig = mountTimed()
    runFor(rig, 31)
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.matchTimeS).toBe(30)
    expect(rig.session.bots[0]?.alive).toBe(true)
    expect(rig.session.weapon.scoped).toBe(false)
  })

  it('fecha a luneta de quem mirava no último segundo', () => {
    const rig = mountTimed()
    runFor(rig, 29.5)
    settleScope(rig)
    expect(rig.session.weapon.scoped).toBe(true)
    runFor(rig, 1)
    expect(rig.session.matchOver).toBe(true)
    expect(rig.session.weapon.scoped).toBe(false)
  })

  it('solta o gancho de quem estava na corda: a corda não fica atrás da tela do MVP', () => {
    const rig = mountTimed([FLOOR, WALL])
    runFor(rig, 29.5)
    rig.movementInput.grapple = true
    rig.frame()
    expect(rig.session.character.current.grappleAttached).toBe(true)
    runFor(rig, 1)
    expect(rig.session.matchOver).toBe(true)
    expect(rig.session.character.current.grappleAttached).toBe(false)
  })

  it('apaga o aviso de alcance do gancho', () => {
    const rig = mountTimed([FLOOR, WALL])
    runFor(rig, 29.5)
    expect(rig.session.grappleInReach).toBe(true)
    runFor(rig, 1)
    expect(rig.session.grappleInReach).toBe(false)
  })

  it('a partida seguinte reabre o relógio', () => {
    const rig = mountTimed()
    runFor(rig, 31)
    rig.session.restartMatch(TIMED)
    expect(rig.session.matchOver).toBe(false)
    rig.frame()
    expect(rig.session.matchTimeS).toBeGreaterThan(0)
  })
})
