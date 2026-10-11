import { describe, expect, it } from 'vitest'
import { horizontalSpeed } from './characterState.ts'
import { IDLE_INPUT } from './movementInput.ts'
import { runTicks, shippedConfig, standingCharacter, ticksFor } from './movementTestKit.ts'

const config = shippedConfig()
const FORWARD = { ...IDLE_INPUT, wishZ: 1 }
const SCOPED_FORWARD = { ...FORWARD, scoped: true }

/** Meio segundo é aceleração de sobra: 90 m/s² passa da corrida em dois ticks. */
function settledSpeed(input: typeof FORWARD): number {
  const state = standingCharacter(config)
  runTicks(state, input, ticksFor(0.5, config), config)
  return horizontalSpeed(state)
}

describe('mirar reduz a velocidade', () => {
  /** Pilar 3: mirar é a única troca do jogo, e o preço é velocidade. */
  it('mirando, o jogador anda na velocidade de mira', () => {
    expect(settledSpeed(SCOPED_FORWARD)).toBeCloseTo(config.weapon.scopedMoveSpeedMps, 1)
  })

  it('sem mirar, o jogador anda na corrida base', () => {
    expect(settledSpeed(FORWARD)).toBeCloseTo(config.movement.runSpeedMps, 1)
  })

  it('mirar cancela a corrida tática', () => {
    const state = standingCharacter(config)
    runTicks(state, { ...SCOPED_FORWARD, sprint: true }, ticksFor(0.5, config), config)
    expect(state.sprinting).toBe(false)
    expect(horizontalSpeed(state)).toBeCloseTo(config.weapon.scopedMoveSpeedMps, 1)
  })

  /** Agachado já é a escolha mais lenta: mirar agachado não pode acelerar ninguém. */
  it('agachado e mirando anda na velocidade de agachado, que é a menor', () => {
    const state = standingCharacter(config)
    runTicks(state, { ...SCOPED_FORWARD, crouch: true }, ticksFor(0.5, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(config.movement.crouchSpeedMps, 1)
  })

  /** Slide exige corrida tática plena, e mirando não há corrida tática. */
  it('não entra em slide mirando', () => {
    const state = standingCharacter(config)
    runTicks(state, { ...FORWARD, sprint: true }, ticksFor(0.6, config), config)
    runTicks(state, { ...SCOPED_FORWARD, sprint: true, crouch: true }, 2, config)
    expect(state.stance).not.toBe('sliding')
  })

  it('soltar a mira devolve a corrida', () => {
    const state = standingCharacter(config)
    runTicks(state, SCOPED_FORWARD, ticksFor(0.5, config), config)
    runTicks(state, FORWARD, ticksFor(0.5, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(config.movement.runSpeedMps, 1)
  })
})
