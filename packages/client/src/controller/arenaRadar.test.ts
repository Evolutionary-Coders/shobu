import { confirmScorestreakEarned, type ScorestreakLedger, type ScorestreakSlug } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { noteTracer } from './arenaFrameLog.ts'
import { mountOnline } from './arenaOnlineTestKit.ts'
import { type ArenaParts, createArenaParts, LOCAL_PLAYER_ID } from './arenaParts.ts'
import { holdRoomSweep, restartArenaRadar, stepArenaRadar } from './arenaRadar.ts'
import {
  config,
  FLOOR,
  mountSession,
  ROOM_RULES,
  sessionOptionsFor,
} from './arenaSessionTestKit.ts'
import { latchScorestreakSlot } from './scorestreakTrigger.ts'
import { createWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput } from './wishDirection.ts'

const RADAR = config.radar
const FROM = { x: 3, y: 1, z: 4 }
const TO = { x: 0, y: 1, z: 0 }

function openParts(): ArenaParts {
  const inputs = { weaponInput: createWeaponInput(), movementInput: createMovementInput() }
  return createArenaParts(sessionOptionsFor([FLOOR], {}, inputs))
}

function activated(parts: ArenaParts, playerId: string, scorestreak: ScorestreakSlug): void {
  parts.scorestreakNotices.push({ kind: 'activated', playerId, slot: 0, scorestreak })
}

function aliveBotIds(parts: ArenaParts): string[] {
  return parts.fighters
    .filter((fighter) => fighter.alive && fighter.id !== LOCAL_PLAYER_ID)
    .map((fighter) => fighter.id)
}

describe('stepArenaRadar offline', () => {
  it('o PING do jogador varre os bots vivos na hora, e o ponto some no desbotar', () => {
    const parts = openParts()
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    stepArenaRadar(parts, 10, config)
    expect(parts.radar.blips.map((blip) => blip.id)).toEqual(aliveBotIds(parts))
    expect(parts.radar.blips.every((blip) => blip.kind === 'sweep' && blip.seenAtS === 10)).toBe(
      true,
    )
    expect(parts.radar.sweepCount).toBe(1)
    parts.scorestreakNotices.length = 0
    stepArenaRadar(parts, 10 + RADAR.blipFadeS, config)
    expect(parts.radar.blips).toEqual([])
  })

  it('a varredura seguinte troca os pontos da anterior', () => {
    const parts = openParts()
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    stepArenaRadar(parts, 10, config)
    parts.scorestreakNotices.length = 0
    stepArenaRadar(parts, 10 + RADAR.pingSweepEveryS, config)
    expect(parts.radar.blips).toHaveLength(aliveBotIds(parts).length)
    expect(parts.radar.sweepCount).toBe(2)
  })

  it('o PING de um bot varre no vazio: o minimapa do jogador não ganha nada', () => {
    const parts = openParts()
    activated(parts, 'bot-0', 'ping')
    stepArenaRadar(parts, 10, config)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.state.pulses.has('bot-0')).toBe(true)
  })

  it('o tiro de um bot marca a boca do cano, uma vez por atirador, pelo `shotRevealS`', () => {
    const parts = openParts()
    noteTracer(parts.tracers, 0, FROM, TO, false)
    noteTracer(parts.tracers, 0, { x: 5, y: 1, z: 5 }, TO, false)
    // a vaga que não existe não tem quem marcar.
    noteTracer(parts.tracers, 99, FROM, TO, false)
    stepArenaRadar(parts, 10, config)
    expect(parts.radar.blips).toEqual([
      { id: 'bot-0', xM: 5, yM: 1, zM: 5, seenAtS: 10, lifeS: RADAR.shotRevealS, kind: 'shot' },
    ])
    parts.tracers.count = 0
    stepArenaRadar(parts, 10 + RADAR.shotRevealS, config)
    expect(parts.radar.blips).toEqual([])
  })
  it('o SONAR do jogador varre uma vez, e o ponto dele fica o `sonarRevealS`', () => {
    const parts = openParts()
    activated(parts, LOCAL_PLAYER_ID, 'sonar')
    stepArenaRadar(parts, 10, config)
    expect(parts.radar.blips.map((blip) => blip.lifeS)).toEqual(
      aliveBotIds(parts).map(() => RADAR.sonarRevealS),
    )
    parts.scorestreakNotices.length = 0
    stepArenaRadar(parts, 10 + RADAR.blipFadeS, config)
    expect(parts.radar.blips).toHaveLength(aliveBotIds(parts).length)
    stepArenaRadar(parts, 10 + RADAR.sonarRevealS, config)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.sweepCount).toBe(1)
  })
})

describe('stepArenaRadar online', () => {
  it('os pontos vêm da varredura da sala, com o relógio do quadro que a lê', () => {
    const parts = openParts()
    parts.online = true
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    const blips = [{ id: 'ana', xM: 1, yM: 0, zM: 2 }]
    holdRoomSweep(parts.radar, { blips, pulseLeftS: 15, revealS: RADAR.sonarRevealS })
    stepArenaRadar(parts, 7, config)
    expect(parts.radar.blips).toEqual([
      { id: 'ana', xM: 1, yM: 0, zM: 2, seenAtS: 7, lifeS: RADAR.sonarRevealS, kind: 'sweep' },
    ])
    expect(parts.radar.arrivedSweeps).toEqual([])
  })

  it('o PING próprio não varre do lado do cliente: só a sala varre', () => {
    const parts = openParts()
    parts.online = true
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    stepArenaRadar(parts, 7, config)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.state.pulses.has(LOCAL_PLAYER_ID)).toBe(true)
  })
})

describe('restartArenaRadar', () => {
  it('a partida nova tira os pontos, o PING, o embaralhamento e os efeitos, também online', () => {
    const parts = openParts()
    parts.online = true
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    parts.radar.state.jams.set('bot-0', 99)
    parts.scorestreakEffects.timers.set(LOCAL_PLAYER_ID, new Map([['rapid-bolt', 99]]))
    const blips = [{ id: 'ana', xM: 1, yM: 0, zM: 2 }]
    holdRoomSweep(parts.radar, { blips, pulseLeftS: 15, revealS: 2.5 })
    stepArenaRadar(parts, 7, config)
    holdRoomSweep(parts.radar, { blips: [], pulseLeftS: 12, revealS: 2.5 })
    restartArenaRadar(parts)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.arrivedSweeps).toEqual([])
    expect(parts.radar.state.pulses.size + parts.radar.state.jams.size).toBe(0)
    expect(parts.scorestreakEffects.timers.size).toBe(0)
  })
})

describe('o radar na sessão', () => {
  it('o PING acionado no quadro já põe os bots no minimapa da sessão', () => {
    const rig = mountSession()
    confirmScorestreakEarned(
      rig.session.scorestreaks as ScorestreakLedger,
      LOCAL_PLAYER_ID,
      0,
      'ping',
    )
    latchScorestreakSlot(rig.session.scorestreakTrigger, 0)
    rig.frame()
    expect(rig.session.radar.blips.length).toBeGreaterThan(0)
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    expect(rig.session.radar.blips).toEqual([])
  })

  it('online a varredura da sala chega pelo `followRoom`', () => {
    const rig = mountOnline()
    const blips = [{ id: 'ana', xM: 1, yM: 0, zM: 2 }]
    rig.room.radarSweeps.push({ blips, pulseLeftS: 15, revealS: 2.5 })
    rig.frame()
    expect(rig.session.radar.blips.map((blip) => blip.id)).toEqual(['ana'])
  })
})
