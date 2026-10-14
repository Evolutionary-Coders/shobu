import { describe, expect, it } from 'vitest'
import {
  addScaledPose,
  copyRigPose,
  createRigPose,
  REST_POSE,
  resetRigPose,
  rigPose,
} from './rigPose.ts'

describe('rigPose', () => {
  it('a pose parcial completa o resto com zero', () => {
    expect(rigPose({ y: -0.2 })).toEqual({ ...REST_POSE, y: -0.2 })
  })

  it('soma com peso, copia e volta ao descanso sem trocar de objeto', () => {
    const out = createRigPose()
    addScaledPose(
      out,
      rigPose({ x: 1, y: 2, z: 3, pitchRad: 4, yawRad: 5, rollRad: 6, cantRad: 7 }),
      0.5,
    )
    expect(out).toEqual({
      x: 0.5,
      y: 1,
      z: 1.5,
      pitchRad: 2,
      yawRad: 2.5,
      rollRad: 3,
      cantRad: 3.5,
    })
    const copy = copyRigPose(out, createRigPose())
    expect(copy).toEqual(out)
    expect(resetRigPose(out)).toBe(out)
    expect(out).toEqual(REST_POSE)
  })
})
