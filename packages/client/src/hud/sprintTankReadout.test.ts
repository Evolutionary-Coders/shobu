import { describe, expect, it } from 'vitest'
import { sprintTankPercent } from './sprintTankReadout.ts'

describe('sprintTankPercent', () => {
  it('cheio some; quase cheio por soma de ponto flutuante também', () => {
    expect(sprintTankPercent(1)).toBeNull()
    expect(sprintTankPercent(0.9999)).toBeNull()
  })

  it('gastando, o inteiro do que resta, e nunca negativo', () => {
    expect(sprintTankPercent(0.427)).toBe(42)
    expect(sprintTankPercent(0)).toBe(0)
    expect(sprintTankPercent(-0.1)).toBe(0)
  })
})
