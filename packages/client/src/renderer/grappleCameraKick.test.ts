import { describe, expect, it } from 'vitest'
import {
  advanceGrappleCameraKick,
  createGrappleCameraKick,
  type GrappleCameraSample,
  kickedFovDeg,
  MAX_FOV_KICK_DEG,
  MAX_ROLL_RAD,
} from './grappleCameraKick.ts'

const FULL_PULL: GrappleCameraSample = {
  attached: true,
  speedMps: 26,
  lateralMps: 0,
  maxPullSpeedMps: 26,
}

/** Um segundo de quadros a 60 Hz: o efeito já chegou no alvo. */
function settle(kick: ReturnType<typeof createGrappleCameraKick>, sample: GrappleCameraSample) {
  for (let frame = 0; frame < 60; frame += 1) advanceGrappleCameraKick(kick, sample, 1 / 60)
  return kick
}

describe('grappleCameraKick', () => {
  it('no teto da velocidade, o fov abre MAX_FOV_KICK_DEG', () => {
    const kick = settle(createGrappleCameraKick(true), FULL_PULL)
    expect(kick.fovDeg).toBeCloseTo(MAX_FOV_KICK_DEG, 3)
  })

  it('o fov cresce com a velocidade, e não passa do teto', () => {
    const half = settle(createGrappleCameraKick(true), { ...FULL_PULL, speedMps: 13 })
    const over = settle(createGrappleCameraKick(true), { ...FULL_PULL, speedMps: 60 })
    expect(half.fovDeg).toBeCloseTo(MAX_FOV_KICK_DEG / 2, 3)
    expect(over.fovDeg).toBeCloseTo(MAX_FOV_KICK_DEG, 3)
  })

  it('não salta num quadro: persegue o alvo', () => {
    const kick = createGrappleCameraKick(true)
    advanceGrappleCameraKick(kick, FULL_PULL, 1 / 60)
    expect(kick.fovDeg).toBeGreaterThan(0)
    expect(kick.fovDeg).toBeLessThan(MAX_FOV_KICK_DEG / 2)
  })

  it('o balanço para um lado rola para esse lado, com teto, e o contrário rola ao contrário', () => {
    const right = settle(createGrappleCameraKick(true), { ...FULL_PULL, lateralMps: 50 })
    const left = settle(createGrappleCameraKick(true), { ...FULL_PULL, lateralMps: -13 })
    expect(right.rollRad).toBeCloseTo(-MAX_ROLL_RAD, 4)
    expect(left.rollRad).toBeCloseTo(MAX_ROLL_RAD / 2, 4)
  })

  it('solto, os dois voltam a zero', () => {
    const kick = settle(createGrappleCameraKick(true), { ...FULL_PULL, lateralMps: 20 })
    settle(kick, { ...FULL_PULL, attached: false })
    expect(kick.fovDeg).toBeCloseTo(0, 3)
    expect(kick.rollRad).toBeCloseTo(0, 4)
  })

  it('quem pediu menos movimento não ganha nada', () => {
    const kick = createGrappleCameraKick(false)
    kick.fovDeg = 3
    advanceGrappleCameraKick(kick, { ...FULL_PULL, lateralMps: 20 }, 1 / 60)
    expect([kick.fovDeg, kick.rollRad]).toEqual([0, 0])
  })

  it('a luneta fechada apaga o efeito do fov', () => {
    const kick = settle(createGrappleCameraKick(true), FULL_PULL)
    expect(kickedFovDeg(90, kick, 0)).toBeCloseTo(90 + MAX_FOV_KICK_DEG, 3)
    expect(kickedFovDeg(22, kick, 1)).toBe(22)
  })
})
