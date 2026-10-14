import { createShotHit, type ShotHit } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createRumbleCues, RUMBLE_EFFECTS } from './gamepadRumble.ts'

function shotAt(targetIndex: number): ShotHit {
  return { ...createShotHit(), targetIndex }
}

describe('createRumbleCues', () => {
  it('quadro sem tiro e sem kill não treme', () => {
    expect(createRumbleCues().since({ shot: undefined, kills: 0 })).toBeUndefined()
  })

  it('tiro na parede treme o tiro; no alvo, o acerto', () => {
    const cues = createRumbleCues()
    expect(cues.since({ shot: shotAt(-1), kills: 0 })).toBe(RUMBLE_EFFECTS.shot)
    expect(cues.since({ shot: shotAt(2), kills: 0 })).toBe(RUMBLE_EFFECTS.hit)
  })

  it('o tiro que mata treme só a kill', () => {
    expect(createRumbleCues().since({ shot: shotAt(2), kills: 1 })).toBe(RUMBLE_EFFECTS.kill)
  })

  it('a kill é borda: o contador parado não treme de novo', () => {
    const cues = createRumbleCues()
    cues.since({ shot: undefined, kills: 1 })
    expect(cues.since({ shot: undefined, kills: 1 })).toBeUndefined()
  })

  it('o contador zerado pela partida nova não treme', () => {
    const cues = createRumbleCues()
    cues.since({ shot: undefined, kills: 3 })
    expect(cues.since({ shot: undefined, kills: 0 })).toBeUndefined()
    expect(cues.since({ shot: undefined, kills: 1 })).toBe(RUMBLE_EFFECTS.kill)
  })

  it('cada degrau é mais longo e mais grave que o anterior', () => {
    const { shot, hit, kill } = RUMBLE_EFFECTS
    expect(shot.duration).toBeLessThan(hit.duration)
    expect(hit.duration).toBeLessThan(kill.duration)
    expect(shot.strongMagnitude).toBeLessThan(hit.strongMagnitude)
    expect(hit.strongMagnitude).toBeLessThan(kill.strongMagnitude)
  })
})
