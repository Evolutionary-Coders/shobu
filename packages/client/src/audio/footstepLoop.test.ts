import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import gameplay from '../../../../config/gameplay.json' with { type: 'json' }
import { FOOTSTEP_LOOP, footstepLoopFor, walkRate } from './footstepLoop.ts'

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

  /** Andar é o take de correr desacelerado: o mesmo timbre de bota nos dois. */
  it('andando toca o take de correr, mais devagar', () => {
    expect(onFoot(MOVEMENT.crouchSpeedMps)).toEqual({ name: 'running', rate: walkRate(MOVEMENT) })
  })

  it('na velocidade de corrida ainda é a passada lenta', () => {
    expect(onFoot(MOVEMENT.runSpeedMps)?.rate).toBe(walkRate(MOVEMENT))
  })

  it('esprintando toca o take na velocidade dele', () => {
    expect(onFoot(MOVEMENT.sprintSpeedMps)).toEqual({ name: 'running', rate: 1 })
  })

  it('a passada lenta é mais lenta que o arquivo, e não parada', () => {
    expect(walkRate(MOVEMENT)).toBeLessThan(1)
    expect(walkRate(MOVEMENT)).toBeGreaterThan(0.4)
  })

  it('nenhum dos dois ritmos usa o take de andar, que soava mal', () => {
    const ritmos = [MOVEMENT.crouchSpeedMps, MOVEMENT.runSpeedMps, MOVEMENT.sprintSpeedMps]
    expect(ritmos.map((v) => onFoot(v)?.name)).toEqual(['running', 'running', 'running'])
  })

  it('a escorregada de fim de slide não vira passo', () => {
    expect(onFoot(MOVEMENT.crouchSpeedMps / 4)).toBeUndefined()
  })

  it('o limiar fica entre correr e esprintar, e não em cima de um deles', () => {
    const meio = (MOVEMENT.runSpeedMps + MOVEMENT.sprintSpeedMps) / 2
    expect(onFoot(meio)?.rate).toBe(1)
    expect(onFoot(meio - 0.01)?.rate).toBe(walkRate(MOVEMENT))
  })

  it('tem um nome de laço só, senão trocar de ritmo empilharia som', () => {
    expect(FOOTSTEP_LOOP).toBe('passo')
  })
})
