import { describe, expect, it } from 'vitest'
import type { RadarConfig } from '../config/gameplayConfig.ts'
import {
  createRadarState,
  isRadarJammedFor,
  type RadarFighterView,
  type RadarState,
  type RadarSweep,
  radarBlipsFor,
  radarPulseLeftS,
  resetRadarState,
  startPingPulse,
  startSonarSweep,
  stepRadarPulses,
} from './radarPulse.ts'

const RADAR: RadarConfig = {
  pingDurationS: 15,
  pingSweepEveryS: 3,
  blipFadeS: 2.5,
  sonarRevealS: 4,
  shotRevealS: 1.5,
  minimapRangeM: 35,
}

function fighter(id: string, x: number, alive = true): RadarFighterView {
  return { id, alive, body: { position: { x, y: 1, z: -x } } }
}

const FIGHTERS = [fighter('local', 0), fighter('bot-0', 4), fighter('bot-1', 8, false)]

function activate(state: RadarState, playerId: string, nowS: number) {
  startPingPulse(state, playerId, nowS, RADAR)
}

/** Os instantes, de 0,5 em 0,5 s, em que `ownerId` recebeu varredura. */
function sweepTimes(state: RadarState, ownerId: string, untilS: number): number[] {
  const times: number[] = []
  for (let t = 10; t <= untilS; t += 0.5) {
    const into: RadarSweep[] = []
    stepRadarPulses(state, t, FIGHTERS, into)
    if (into.some((sweep) => sweep.ownerId === ownerId)) times.push(t)
  }
  return times
}

describe('o PING', () => {
  it('varre no acionamento e a cada 3 s pelos 15 s que dura, e para', () => {
    const state = createRadarState()
    activate(state, 'local', 10)
    expect(sweepTimes(state, 'local', 40)).toEqual([10, 13, 16, 19, 22])
    expect(state.pulses.size).toBe(0)
  })

  /** Regressão: a soma dos intervalos no relógio de ticks varria uma vez a mais no fim. */
  it('no relógio de ticks de 1/60 s, varre só as vezes que cabem', () => {
    const state = createRadarState()
    const tickS = 1 / 60
    activate(state, 'local', tickS)
    let sweeps = 0
    for (let t = tickS; t < 20; t += tickS) {
      const into: RadarSweep[] = []
      stepRadarPulses(state, t, FIGHTERS, into)
      sweeps += into.length
    }
    expect(sweeps).toBe(5)
  })

  it('a varredura leva os inimigos vivos, sem o dono, e quanto falta', () => {
    const state = createRadarState()
    activate(state, 'local', 10)
    const into: RadarSweep[] = []
    stepRadarPulses(state, 10, FIGHTERS, into)
    expect(into).toEqual([
      {
        ownerId: 'local',
        blips: [{ id: 'bot-0', xM: 4, yM: 1, zM: -4 }],
        pulseLeftS: 15,
        revealS: 2.5,
      },
    ])
  })

  it('o tempo que falta desce e para em zero', () => {
    const state = createRadarState()
    expect(radarPulseLeftS(state, 'local', 0)).toBe(0)
    activate(state, 'local', 10)
    expect(radarPulseLeftS(state, 'local', 14)).toBe(11)
    expect(radarPulseLeftS(state, 'local', 30)).toBe(0)
  })

  it('o tick atrasado não empurra as varreduras seguintes', () => {
    const state = createRadarState()
    activate(state, 'local', 10)
    const into: RadarSweep[] = []
    stepRadarPulses(state, 11, FIGHTERS, into)
    stepRadarPulses(state, 13, FIGHTERS, into)
    expect(into).toHaveLength(2)
  })
})

describe('o SONAR', () => {
  it('varre uma vez no acionamento, com o ponto de `sonarRevealS`, e acaba', () => {
    const state = createRadarState()
    startSonarSweep(state, 'local', 10, RADAR)
    expect(sweepTimes(state, 'local', 40)).toEqual([10])
    expect(state.sonars.size).toBe(0)
    const into: RadarSweep[] = []
    startSonarSweep(state, 'local', 50, RADAR)
    stepRadarPulses(state, 50, FIGHTERS, into)
    expect(into.map((sweep) => [sweep.revealS, sweep.pulseLeftS])).toEqual([[4, 4]])
  })

  it('o dono embaralhado perde a varredura única', () => {
    const state = createRadarState()
    startSonarSweep(state, 'local', 10, RADAR)
    state.jams.set('bot-0', 12)
    expect(sweepTimes(state, 'local', 40)).toEqual([])
  })
})

describe('o embaralhamento, o gancho do CONTRA-PING', () => {
  it('embaralha os outros, não quem embaralhou, e acaba', () => {
    const state = createRadarState()
    state.jams.set('bot-0', 25)
    expect(isRadarJammedFor(state, 'local', 12)).toBe(true)
    expect(isRadarJammedFor(state, 'bot-0', 12)).toBe(false)
    expect(isRadarJammedFor(state, 'local', 25)).toBe(false)
    stepRadarPulses(state, 25, FIGHTERS, [])
    expect(state.jams.size).toBe(0)
  })

  it('o dono embaralhado perde a varredura, e o PING segue contando', () => {
    const state = createRadarState()
    activate(state, 'local', 10)
    state.jams.set('bot-0', 24)
    expect(sweepTimes(state, 'local', 40)).toEqual([])
    const late = createRadarState()
    activate(late, 'local', 10)
    late.jams.set('bot-0', 14)
    expect(sweepTimes(late, 'local', 40)).toEqual([16, 19, 22])
  })
})

describe('o resto', () => {
  it('radarBlipsFor deixa de fora mortos e o dono', () => {
    expect(radarBlipsFor('bot-0', FIGHTERS).map((blip) => blip.id)).toEqual(['local'])
  })

  it('a partida nova limpa os PINGs, os SONARs e o embaralhamento', () => {
    const state = createRadarState()
    activate(state, 'local', 10)
    startSonarSweep(state, 'local', 10, RADAR)
    state.jams.set('bot-0', 25)
    resetRadarState(state)
    expect(state.pulses.size + state.sonars.size + state.jams.size).toBe(0)
  })
})
