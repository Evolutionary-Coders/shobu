import { describe, expect, it } from 'vitest'
import {
  describeTimeToControl,
  TIME_TO_CONTROL_BUDGET_MS,
  timeToControlMs,
} from './timeToPlayerControl.ts'

describe('timeToControlMs', () => {
  it('mede o intervalo entre a navegação e o controle', () => {
    expect(timeToControlMs(100, 1_340)).toBe(1_240)
  })

  it('rejeita controle anterior à navegação, que é relógio quebrado', () => {
    expect(() => timeToControlMs(1_000, 10)).toThrow(/anterior/)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejeita valor não finito: %p', (value) => {
    expect(() => timeToControlMs(0, value)).toThrow(/finitos/)
  })
})

describe('describeTimeToControl', () => {
  it('aprova o que cabe no orçamento de cinco segundos', () => {
    expect(describeTimeToControl(1_240)).toBe('1.24 s / 5 s — dentro do pilar 2')
  })

  it('reprova o que estoura, inclusive por um milissegundo', () => {
    expect(describeTimeToControl(TIME_TO_CONTROL_BUDGET_MS + 1)).toMatch(/estourou/)
  })

  it('trata o limite exato como aprovado', () => {
    expect(describeTimeToControl(TIME_TO_CONTROL_BUDGET_MS)).toMatch(/dentro/)
  })
})
