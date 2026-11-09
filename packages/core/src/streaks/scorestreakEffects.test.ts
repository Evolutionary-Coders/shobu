import { describe, expect, it } from 'vitest'
import { createCharacterState } from '../movement/characterState.ts'
import { createWeaponState } from '../weapon/weaponState.ts'
import { shippedConfig } from '../weapon/weaponTestKit.ts'
import { createRadarState, isRadarJammedFor, type RadarState } from './radarPulse.ts'
import type { ScorestreakSlug } from './scorestreakCatalog.ts'
import {
  applyScorestreakActivation,
  armScorestreakFlags,
  armScorestreakWeapon,
  clearOwnTimedEffects,
  createScorestreakEffects,
  grappleFlagsFor,
  grappleFreeFor,
  hasEffect,
  isEmpedFor,
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
    sonarRevealS: 4,
    counterPingDurationS: 15,
    shotRevealS: 1.5,
    minimapRangeM: 35,
  },
  streakEffects: { rapidBoltDurationS: 15, grappleOverclockDurationS: 20, empDurationS: 10 },
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
    expect(radar.pulses.get('local')).toEqual({
      endsAtS: 25,
      sweepEveryS: 3,
      revealS: 2.5,
      nextSweepAtS: 10,
    })
  })

  it('o SONAR varre uma vez, sem mexer no PING do dono', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    activate(effects, radar, 'local', 'ping', 10)
    activate(effects, radar, 'local', 'sonar', 11)
    expect(radar.pulses.get('local')?.endsAtS).toBe(25)
    expect(radar.sonars.get('local')).toEqual({
      endsAtS: 15,
      sweepEveryS: 4,
      revealS: 4,
      nextSweepAtS: 11,
    })
  })

  it('o CONTRA-PING embaralha o radar dos outros, e não o do dono', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    activate(effects, radar, 'bot-0', 'counter-ping', 10)
    expect(isRadarJammedFor(radar, 'local', 24)).toBe(true)
    expect(isRadarJammedFor(radar, 'bot-0', 24)).toBe(false)
    expect(isRadarJammedFor(radar, 'local', 25)).toBe(false)
  })

  it('o FERROLHO RÁPIDO vale para o dono, pelo tempo da config', () => {
    const effects = createScorestreakEffects()
    const radar = createRadarState()
    activate(effects, radar, 'bot-0', 'rapid-bolt', 10)
    expect(hasEffect(effects, 'bot-0', 'rapid-bolt', 24)).toBe(true)
    expect(hasEffect(effects, 'bot-0', 'rapid-bolt', 25)).toBe(false)
    expect(hasEffect(effects, 'local', 'rapid-bolt', 24)).toBe(false)
  })

  it('o GANCHO OVERCLOCK solta o gancho do dono, e só o dele, pelo tempo da config', () => {
    const effects = createScorestreakEffects()
    activate(effects, createRadarState(), 'bot-0', 'grapple-overclock', 10)
    expect(grappleFreeFor(effects, 'bot-0', 29)).toBe(true)
    expect(grappleFreeFor(effects, 'bot-0', 30)).toBe(false)
    expect(grappleFreeFor(effects, 'local', 29)).toBe(false)
  })

  it('o PULSO EMP vale contra os outros, e não contra o dono, pelo tempo da config', () => {
    const effects = createScorestreakEffects()
    activate(effects, createRadarState(), 'bot-0', 'emp', 10)
    expect(isEmpedFor(effects, 'local', 19)).toBe(true)
    expect(isEmpedFor(effects, 'local', 20)).toBe(false)
    expect(isEmpedFor(effects, 'bot-0', 19)).toBe(false)
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

describe('isEmpedFor', () => {
  it('dois EMPs por cima valem até o fim do último, e cada dono só sofre o do outro', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'bot-0', 'emp', 20)
    startTimedEffect(effects, 'bot-1', 'emp', 25)
    expect(isEmpedFor(effects, 'local', 22)).toBe(true)
    expect(isEmpedFor(effects, 'bot-0', 22)).toBe(true)
    expect(isEmpedFor(effects, 'bot-1', 22)).toBe(false)
    expect(isEmpedFor(effects, 'local', 25)).toBe(false)
  })

  it('a morte do dono não devolve a visão dos outros', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'bot-0', 'emp', 20)
    clearOwnTimedEffects(effects, 'bot-0')
    expect(isEmpedFor(effects, 'local', 15)).toBe(true)
  })
})

describe('armScorestreakWeapon', () => {
  it('liga a flag da arma enquanto o FERROLHO RÁPIDO vale, e a desliga depois', () => {
    const effects = createScorestreakEffects()
    const weapon = createWeaponState(shippedConfig())
    startTimedEffect(effects, 'local', 'rapid-bolt', 30)
    armScorestreakWeapon(weapon, effects, 'local', 29)
    expect(weapon.boltFree).toBe(true)
    armScorestreakWeapon(weapon, effects, 'local', 30)
    expect(weapon.boltFree).toBe(false)
  })

  it('o FERROLHO RÁPIDO de um não solta a arma do outro', () => {
    const effects = createScorestreakEffects()
    const weapon = createWeaponState(shippedConfig())
    startTimedEffect(effects, 'bot-0', 'rapid-bolt', 30)
    armScorestreakWeapon(weapon, effects, 'local', 10)
    expect(weapon.boltFree).toBe(false)
  })

  it('o EMP de outro tranca a luneta, e o próprio não', () => {
    const effects = createScorestreakEffects()
    const weapon = createWeaponState(shippedConfig())
    startTimedEffect(effects, 'bot-0', 'emp', 30)
    armScorestreakWeapon(weapon, effects, 'local', 10)
    expect(weapon.scopeLocked).toBe(true)
    armScorestreakWeapon(weapon, effects, 'bot-0', 10)
    expect(weapon.scopeLocked).toBe(false)
  })
})

describe('grappleFlagsFor', () => {
  it('o OVERCLOCK do dono solta o gancho dele, e o EMP de outro o tranca', () => {
    const effects = createScorestreakEffects()
    startTimedEffect(effects, 'bot-0', 'grapple-overclock', 30)
    startTimedEffect(effects, 'bot-1', 'emp', 30)
    expect(grappleFlagsFor(effects, 'bot-0', 10)).toEqual({
      grappleFree: true,
      grappleLocked: true,
    })
    expect(grappleFlagsFor(effects, 'bot-1', 10)).toEqual({
      grappleFree: false,
      grappleLocked: false,
    })
  })
})

describe('armScorestreakFlags', () => {
  it('põe as duas flags do mesmo dono, na arma e no corpo', () => {
    const config = shippedConfig()
    const effects = createScorestreakEffects()
    const weapon = createWeaponState(config)
    const body = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    startTimedEffect(effects, 'bot-0', 'grapple-overclock', 30)
    armScorestreakFlags(weapon, body, effects, 'bot-0', 10)
    expect([weapon.boltFree, body.grappleFree]).toEqual([false, true])
    armScorestreakFlags(weapon, body, effects, 'local', 10)
    expect(body.grappleFree).toBe(false)
    startTimedEffect(effects, 'bot-0', 'emp', 30)
    armScorestreakFlags(weapon, body, effects, 'local', 10)
    expect([weapon.scopeLocked, body.grappleLocked]).toEqual([true, true])
  })
})
