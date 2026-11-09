import { describe, expect, it } from 'vitest'
import { createRadarState, type RadarState } from './radarPulse.ts'
import type { ScorestreakSlug } from './scorestreakCatalog.ts'
import {
  applyScorestreakActivation,
  clearOwnTimedEffects,
  createScorestreakEffects,
  hasEffect,
  resetScorestreakEffects,
  type ScorestreakEffects,
  type ScorestreakEffectsConfig,
  startTimedEffect,
} from './scorestreakEffects.ts'

const CONFIG: ScorestreakEffectsConfig = {
  radar: {
    pingDurationS: 15,
    pingSweepEveryS: 3,
    blipFadeS: 2.5,
    shotRevealS: 1.5,
    minimapRangeM: 35,
  },
}

function activate(
  effects: ScorestreakEffects,
  radar: RadarState,
  playerId: string,
  scorestreak: ScorestreakSlug,
  nowS: number,
): void {
  const notice = { kind: 'activated', playerId, slot: 0, scorestreak } as const
  applyScorestreakActivation(effects, radar, notice, nowS, CONFIG)
}

describe('applyScorestreakActivation', () => {
  it('o PING começa a varrer no radar', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    activate(effects, radar, 'local', 'ping', 10)
    expect(radar.pulses.get('local')).toEqual({ endsAtS: 25, sweepEveryS: 3, nextSweepAtS: 10 })
  })

  it('o aviso de série ganha não aciona nada', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    const earned = { kind: 'earned', playerId: 'local', slot: 0, scorestreak: 'ping' } as const
    applyScorestreakActivation(effects, radar, earned, 10, CONFIG)
    expect(radar.pulses.size).toBe(0)
  })

  it('a série sem efeito não mexe em nada', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    activate(effects, radar, 'local', 'decoy', 10)
    expect(radar.pulses.size + radar.jams.size + effects.timers.size).toBe(0)
  })
})

describe('os efeitos com prazo', () => {
  it('valem até o prazo, só para o dono e só a série ligada', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'local', 'rapid-bolt', 30)
    expect(hasEffect(effects, 'local', 'rapid-bolt', 29)).toBe(true)
    expect(hasEffect(effects, 'local', 'rapid-bolt', 30)).toBe(false)
    expect(hasEffect(effects, 'local', 'emp', 29)).toBe(false)
    expect(hasEffect(effects, 'bot-0', 'rapid-bolt', 29)).toBe(false)
  })

  it('acionar de novo recomeça a contagem', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'local', 'rapid-bolt', 30)
    startTimedEffect(effects, 'local', 'rapid-bolt', 50)
    expect(hasEffect(effects, 'local', 'rapid-bolt', 40)).toBe(true)
  })

  it('a morte leva os do corpo e deixa o EMP', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'local', 'rapid-bolt', 30)
    startTimedEffect(effects, 'local', 'grapple-overclock', 30)
    startTimedEffect(effects, 'local', 'emp', 30)
    clearOwnTimedEffects(effects, 'local')
    expect(hasEffect(effects, 'local', 'rapid-bolt', 10)).toBe(false)
    expect(hasEffect(effects, 'local', 'grapple-overclock', 10)).toBe(false)
    expect(hasEffect(effects, 'local', 'emp', 10)).toBe(true)
  })

  it('quem morre só com efeitos do corpo sai do mapa; quem não tem nada não muda nada', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'local', 'rapid-bolt', 30)
    clearOwnTimedEffects(effects, 'local')
    clearOwnTimedEffects(effects, 'bot-0')
    expect(effects.timers.size).toBe(0)
  })
})

describe('resetScorestreakEffects', () => {
  it('a partida nova limpa os prazos, o ECO e o radar', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    startTimedEffect(effects, 'local', 'emp', 30)
    effects.echoes.set('local', { subjectId: 'bot-0', endsAtS: 30 })
    activate(effects, radar, 'local', 'ping', 10)
    radar.jams.set('bot-0', 25)
    resetScorestreakEffects(effects, radar)
    expect(effects.timers.size + effects.echoes.size).toBe(0)
    expect(radar.pulses.size + radar.jams.size).toBe(0)
  })
})
