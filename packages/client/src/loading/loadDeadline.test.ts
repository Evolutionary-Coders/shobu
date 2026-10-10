import { describe, expect, it } from 'vitest'
import { createLoadDeadline, LOAD_CEILING_S, LOAD_STALL_S } from './loadDeadline.ts'

describe('createLoadDeadline', () => {
  it('download andando não vence o prazo de parado', () => {
    const deadline = createLoadDeadline(0)
    for (let second = 0; second < LOAD_CEILING_S - 1; second += 1) {
      expect(deadline.expired(second / 100, second)).toBe(false)
    }
  })

  it('barra parada por tempo demais solta a entrada', () => {
    const deadline = createLoadDeadline(0)
    deadline.expired(0.4, 1)
    expect(deadline.expired(0.4, 1 + LOAD_STALL_S - 0.1)).toBe(false)
    expect(deadline.expired(0.4, 1 + LOAD_STALL_S)).toBe(true)
  })

  it('o teto vence mesmo com a barra andando', () => {
    const deadline = createLoadDeadline(10)
    deadline.expired(0.1, 10 + LOAD_CEILING_S - 1)
    expect(deadline.expired(0.2, 10 + LOAD_CEILING_S)).toBe(true)
  })

  it('a barra parada desde o começo conta do começo', () => {
    expect(createLoadDeadline(0).expired(0, LOAD_STALL_S)).toBe(true)
  })
})
