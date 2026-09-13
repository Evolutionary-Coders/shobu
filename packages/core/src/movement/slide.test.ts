import { describe, expect, it } from 'vitest'
import { horizontalSpeed } from './characterState.ts'
import { shippedConfig, standingCharacter, tickDurationS } from './movementTestKit.ts'
import { continueSlide, SLIDE_CAPSULE_RATIO, startSlide } from './slide.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)
const HELD_NOTHING = { jumpPressed: false, crouchPressed: false, crouchHeld: false }

/**
 * O decaimento do slide divide pela velocidade atual para reescalar o vetor.
 * Com velocidade zero isso é `0/0`, e o personagem sairia do tick com `NaN` na
 * posição — corrupção que a simulação nunca mais larga, e que o servidor
 * reproduziria fielmente. O piso do decaimento é a corrida (pilar 3), então a
 * mesma guarda cobre o slide que já chegou ao piso.
 */
describe('continueSlide: o decaimento sem velocidade para dividir', () => {
  function slidingAtRest() {
    const state = standingCharacter(config)
    startSlide(state, config)
    state.velocity.x = 0
    state.velocity.z = 0
    return state
  }

  it('não produz NaN deslizando parado', () => {
    const state = slidingAtRest()
    continueSlide(state, HELD_NOTHING, config, dtS)
    expect(Number.isNaN(state.velocity.x)).toBe(false)
    expect(Number.isNaN(state.velocity.z)).toBe(false)
  })

  it('deslizar parado continua parado', () => {
    const state = slidingAtRest()
    continueSlide(state, HELD_NOTHING, config, dtS)
    expect(horizontalSpeed(state)).toBe(0)
  })

  it('não desce do piso da corrida', () => {
    const state = standingCharacter(config)
    startSlide(state, config)
    state.velocity.x = config.movement.runSpeedMps
    state.velocity.z = 0
    continueSlide(state, HELD_NOTHING, config, dtS)
    expect(horizontalSpeed(state)).toBeCloseTo(config.movement.runSpeedMps, 9)
  })

  it('o slide encolhe a cápsula pela razão declarada', () => {
    const state = standingCharacter(config)
    const standing = state.capsuleHeightM
    startSlide(state, config)
    expect(state.capsuleHeightM).toBeCloseTo(standing * SLIDE_CAPSULE_RATIO, 9)
  })
})
