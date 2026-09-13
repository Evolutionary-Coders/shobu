import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import gameplay from '../../../../config/gameplay.json' with { type: 'json' }
import { FOOTSTEP_LOOP, footstepLoopFor } from './footstepLoop.ts'

const MOVEMENT = parseGameplayConfig(gameplay).movement

function onFoot(groundSpeedMps: number, grounded = true) {
  return footstepLoopFor({ grounded, groundSpeedMps }, MOVEMENT)
}

describe('footstepLoopFor', () => {
  it('parado não faz passo', () => {
    expect(onFoot(0)).toBeUndefined()
  })

  it('no ar não faz passo, nem em velocidade de corrida', () => {
    expect(onFoot(MOVEMENT.runSpeedMps, false)).toBeUndefined()
  })

  it('andando toca o laço de andar', () => {
    expect(onFoot(MOVEMENT.crouchSpeedMps)).toBe('walking')
  })

  it('na velocidade de corrida ainda é o laço de andar', () => {
    expect(onFoot(MOVEMENT.runSpeedMps)).toBe('walking')
  })

  it('esprintando toca o laço de correr', () => {
    expect(onFoot(MOVEMENT.sprintSpeedMps)).toBe('running')
  })

  it('a escorregada de fim de slide não vira passo', () => {
    expect(onFoot(MOVEMENT.crouchSpeedMps / 4)).toBeUndefined()
  })

  it('o limiar fica entre correr e esprintar, e não em cima de um deles', () => {
    const meio = (MOVEMENT.runSpeedMps + MOVEMENT.sprintSpeedMps) / 2
    expect(onFoot(meio)).toBe('running')
    expect(onFoot(meio - 0.01)).toBe('walking')
  })

  it('tem um nome de laço só, senão trocar de ritmo empilharia som', () => {
    expect(FOOTSTEP_LOOP).toBe('passo')
  })
})
