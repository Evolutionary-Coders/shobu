import { describe, expect, it } from 'vitest'
import { consumeTicks, createFixedTickAccumulator } from './fixedTickAccumulator.ts'

describe('createFixedTickAccumulator', () => {
  it('deriva a duração do tick da taxa', () => {
    expect(createFixedTickAccumulator(60, 5).tickDurationS).toBeCloseTo(1 / 60)
  })

  it.each([0, -60, Number.NaN])('rejeita tickHz inválido: %p', (tickHz) => {
    expect(() => createFixedTickAccumulator(tickHz, 5)).toThrow(/tickHz/)
  })

  it('rejeita teto de ticks que não é inteiro positivo', () => {
    expect(() => createFixedTickAccumulator(60, 0)).toThrow(/maxTicksPerFrame/)
  })
})

describe('consumeTicks', () => {
  it('não entrega tick antes de o tempo do tick passar', () => {
    const accumulator = createFixedTickAccumulator(60, 5)
    expect(consumeTicks(accumulator, 0.01)).toBe(0)
  })

  it('acumula o resto entre quadros em vez de descartá-lo', () => {
    const accumulator = createFixedTickAccumulator(60, 5)
    consumeTicks(accumulator, 0.01)
    expect(consumeTicks(accumulator, 0.01)).toBe(1)
  })

  it('entrega ticks inteiros de um quadro longo', () => {
    expect(consumeTicks(createFixedTickAccumulator(60, 10), 0.05)).toBe(3)
  })

  it('corta no teto e descarta o excedente, contra a espiral da morte', () => {
    const accumulator = createFixedTickAccumulator(60, 5)
    expect(consumeTicks(accumulator, 2)).toBe(5)
    expect(consumeTicks(accumulator, 0)).toBe(0)
  })

  it('rejeita tempo decorrido negativo citando o valor', () => {
    expect(() => consumeTicks(createFixedTickAccumulator(60, 5), -1)).toThrow(/-1/)
  })
})
