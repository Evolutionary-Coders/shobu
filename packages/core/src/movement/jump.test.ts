import { describe, expect, it } from 'vitest'
import { createCharacterState, JUMPS_PER_FLIGHT } from './characterState.ts'
import { applyGravity, settleOnGround, TERMINAL_FALL_MPS } from './jump.ts'
import { shippedConfig, tickDurationS } from './movementTestKit.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)

describe('applyGravity', () => {
  it('acumula a gravidade da config em cada tick', () => {
    const state = createCharacterState({ x: 0, y: 10, z: 0 }, config)
    applyGravity(state, config, dtS)
    expect(state.velocity.y).toBeCloseTo(config.movement.gravityMps2 * dtS)
  })

  /**
   * A salvaguarda do arquivo: quem sair da geometria esperada cai rápido, e
   * sem o teto a velocidade cresceria até atravessar o chão entre dois ticks.
   */
  it('não deixa a queda passar da velocidade terminal', () => {
    const state = createCharacterState({ x: 0, y: 500, z: 0 }, config)
    state.velocity.y = -TERMINAL_FALL_MPS
    applyGravity(state, config, dtS)
    expect(state.velocity.y).toBe(-TERMINAL_FALL_MPS)
  })
})

describe('settleOnGround', () => {
  it('recarrega os pulos e para a queda de quem tocou o chão', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.grounded = true
    state.jumpsLeft = 0
    state.velocity.y = -12
    settleOnGround(state)
    expect(state.jumpsLeft).toBe(JUMPS_PER_FLIGHT)
    expect(state.velocity.y).toBe(0)
  })

  /**
   * Subir e estar no chão no mesmo tick é o instante do pulo. Zerar aqui
   * comeria o impulso que acabou de sair, e o pulo sairia mais fraco que o
   * configurado uma vez a cada tantos.
   */
  it('não come a velocidade de quem está subindo', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.grounded = true
    state.velocity.y = config.movement.jumpImpulseMps
    settleOnGround(state)
    expect(state.velocity.y).toBe(config.movement.jumpImpulseMps)
  })

  it('não recarrega pulo de quem está no ar', () => {
    const state = createCharacterState({ x: 0, y: 3, z: 0 }, config)
    state.grounded = false
    state.jumpsLeft = 0
    settleOnGround(state)
    expect(state.jumpsLeft).toBe(0)
  })
})
