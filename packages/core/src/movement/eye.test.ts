import { describe, expect, it } from 'vitest'
import { createCharacterState } from './characterState.ts'
import { EYE_HEIGHT_RATIO, eyeOf } from './eye.ts'
import { shippedConfig } from './movementTestKit.ts'

const config = shippedConfig()

describe('eyeOf', () => {
  it('fica a EYE_HEIGHT_RATIO da cápsula acima do pé', () => {
    const state = createCharacterState({ x: 3, y: 7.5, z: -4 }, config)
    expect(eyeOf(state, { x: 0, y: 0, z: 0 })).toEqual({
      x: 3,
      y: 7.5 + config.collision.capsuleHeightM * EYE_HEIGHT_RATIO,
      z: -4,
    })
  })

  /** Agachado a cápsula encolhe, e o olho desce com ela: o tiro sai de onde o jogador está. */
  it('desce com a cápsula agachada', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.capsuleHeightM = 1
    expect(eyeOf(state, { x: 0, y: 0, z: 0 }).y).toBeCloseTo(EYE_HEIGHT_RATIO, 12)
  })
})
