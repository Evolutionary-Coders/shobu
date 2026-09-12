import { describe, expect, it } from 'vitest'
import { createJackInLens, LENS_CLOSED_SCALE, LENS_OPEN_MS, lensFovScale } from './jackInLens.ts'

/** Relógio de mentira: o teste decide que hora é. */
class FakeClock {
  nowMs = 0
  readonly now = (): number => this.nowMs
}

describe('lensFovScale', () => {
  it('começa fechada e termina no fov base', () => {
    expect(lensFovScale(0)).toBe(LENS_CLOSED_SCALE)
    expect(lensFovScale(LENS_OPEN_MS)).toBe(1)
  })

  it('só abre, nunca fecha de volta', () => {
    let previous = lensFovScale(0)
    for (let elapsed = 50; elapsed <= LENS_OPEN_MS; elapsed += 50) {
      const current = lensFovScale(elapsed)
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  /** Abrir rápido e assentar devagar: na metade do tempo já passou da metade. */
  it('abre com saída suave', () => {
    expect(lensFovScale(LENS_OPEN_MS / 2)).toBeGreaterThan((LENS_CLOSED_SCALE + 1) / 2)
  })

  it('não passa do fov base nem volta antes do zero', () => {
    expect(lensFovScale(LENS_OPEN_MS * 3)).toBe(1)
    expect(lensFovScale(-200)).toBe(LENS_CLOSED_SCALE)
  })

  it('recusa instante que não é número', () => {
    expect(() => lensFovScale(Number.NaN)).toThrow(/elapsedMs recebeu NaN/)
  })
})

describe('createJackInLens', () => {
  it('vale 1 antes de tocar, para não estreitar quem nunca entrou', () => {
    expect(createJackInLens(new FakeClock().now).scale()).toBe(1)
  })

  it('fecha a lente ao tocar e abre até o fov base', () => {
    const clock = new FakeClock()
    const lens = createJackInLens(clock.now)
    lens.play()
    expect(lens.scale()).toBeCloseTo(LENS_CLOSED_SCALE)
    clock.nowMs = LENS_OPEN_MS
    expect(lens.scale()).toBe(1)
  })

  /**
   * Um esc e uma reentrada no meio da abertura: a base tem que continuar sendo
   * o fov original, e como a lente só devolve multiplicador, tocar de novo
   * recomeça do fechado em vez de afunilar em cima do que já estreitou.
   */
  it('reentrar no meio da abertura recomeça do fechado', () => {
    const clock = new FakeClock()
    const lens = createJackInLens(clock.now)
    lens.play()
    clock.nowMs = 200
    expect(lens.scale()).toBeGreaterThan(LENS_CLOSED_SCALE)
    lens.play()
    expect(lens.scale()).toBeCloseTo(LENS_CLOSED_SCALE)
  })

  it('fica em 1 depois de aberta, quantos quadros passarem', () => {
    const clock = new FakeClock()
    const lens = createJackInLens(clock.now)
    lens.play()
    clock.nowMs = LENS_OPEN_MS
    expect(lens.scale()).toBe(1)
    clock.nowMs = LENS_OPEN_MS + 5_000
    expect(lens.scale()).toBe(1)
  })
})
