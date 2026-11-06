import { confirmScorestreakEarned, type ScorestreakLedger, type ScorestreakSlug } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { noteTracer } from './arenaFrameLog.ts'
import { mountOnline } from './arenaOnlineTestKit.ts'
import { type ArenaParts, createArenaParts, LOCAL_PLAYER_ID } from './arenaParts.ts'
import { blipLifeS, holdRoomSweep, restartArenaRadar, stepArenaRadar } from './arenaRadar.ts'
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
    stepArenaRadar(parts, 10, RADAR)
    expect(parts.radar.blips.map((blip) => blip.id)).toEqual(aliveBotIds(parts))
    expect(parts.radar.blips.every((blip) => blip.kind === 'sweep' && blip.seenAtS === 10)).toBe(
      true,
    )
    expect(parts.radar.sweepCount).toBe(1)
    parts.scorestreakNotices.length = 0
    stepArenaRadar(parts, 10 + RADAR.blipFadeS, RADAR)
    expect(parts.radar.blips).toEqual([])
  })

  it('a varredura seguinte troca os pontos da anterior', () => {
    const parts = openParts()
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    stepArenaRadar(parts, 10, RADAR)
    parts.scorestreakNotices.length = 0
    stepArenaRadar(parts, 10 + RADAR.pingSweepEveryS, RADAR)
    expect(parts.radar.blips).toHaveLength(aliveBotIds(parts).length)
    expect(parts.radar.sweepCount).toBe(2)
  })

  it('o PING de um bot varre no vazio: o minimapa do jogador não ganha nada', () => {
    const parts = openParts()
    activated(parts, 'bot-0', 'ping')
    stepArenaRadar(parts, 10, RADAR)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.state.pulses.has('bot-0')).toBe(true)
  })

  it('o tiro de um bot marca a boca do cano, uma vez por atirador, pelo `shotRevealS`', () => {
    const parts = openParts()
    noteTracer(parts.tracers, 0, FROM, TO, false)
    noteTracer(parts.tracers, 0, { x: 5, y: 1, z: 5 }, TO, false)
    // a vaga que não existe não tem quem marcar.
    noteTracer(parts.tracers, 99, FROM, TO, false)
    stepArenaRadar(parts, 10, RADAR)
    expect(parts.radar.blips).toEqual([
      { id: 'bot-0', xM: 5, yM: 1, zM: 5, seenAtS: 10, kind: 'shot' },
    ])
    parts.tracers.count = 0
    stepArenaRadar(parts, 10 + RADAR.shotRevealS, RADAR)
    expect(parts.radar.blips).toEqual([])
  })
})

describe('stepArenaRadar online', () => {
  it('os pontos vêm da varredura da sala, com o relógio do quadro que a lê', () => {
    const parts = openParts()
    parts.online = true
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    holdRoomSweep(parts.radar, { blips: [{ id: 'ana', xM: 1, yM: 0, zM: 2 }], pulseLeftS: 15 })
    stepArenaRadar(parts, 7, RADAR)
    expect(parts.radar.blips).toEqual([
      { id: 'ana', xM: 1, yM: 0, zM: 2, seenAtS: 7, kind: 'sweep' },
    ])
    expect(parts.radar.arrivedSweeps).toEqual([])
  })

  it('o PING próprio não varre do lado do cliente: só a sala varre', () => {
    const parts = openParts()
    parts.online = true
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    stepArenaRadar(parts, 7, RADAR)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.state.pulses.has(LOCAL_PLAYER_ID)).toBe(true)
  })
})

describe('restartArenaRadar', () => {
  it('a partida nova tira os pontos, o PING e o CONTRA-PING, também online', () => {
    const parts = openParts()
    parts.online = true
    activated(parts, LOCAL_PLAYER_ID, 'ping')
    activated(parts, 'bot-0', 'counter-ping')
    holdRoomSweep(parts.radar, { blips: [{ id: 'ana', xM: 1, yM: 0, zM: 2 }], pulseLeftS: 15 })
    stepArenaRadar(parts, 7, RADAR)
    holdRoomSweep(parts.radar, { blips: [], pulseLeftS: 12 })
    restartArenaRadar(parts)
    expect(parts.radar.blips).toEqual([])
    expect(parts.radar.arrivedSweeps).toEqual([])
    expect(parts.radar.state.pulses.size + parts.radar.state.jams.size).toBe(0)
  })
})

describe('blipLifeS', () => {
  it('a varredura dura o desbotar e o tiro, o `shotRevealS`', () => {
    expect([blipLifeS({ kind: 'sweep' }, RADAR), blipLifeS({ kind: 'shot' }, RADAR)]).toEqual([
      RADAR.blipFadeS,
      RADAR.shotRevealS,
    ])
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
    rig.room.radarSweeps.push({ blips: [{ id: 'ana', xM: 1, yM: 0, zM: 2 }], pulseLeftS: 15 })
    rig.frame()
    expect(rig.session.radar.blips.map((blip) => blip.id)).toEqual(['ana'])
  })
})
