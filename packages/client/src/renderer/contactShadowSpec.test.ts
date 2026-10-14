import { describe, expect, it } from 'vitest'
import { contactShadowOpacity, contactShadowSpec, paintContactShadow } from './contactShadowSpec.ts'

describe('contactShadowOpacity', () => {
  it('é cheia no centro e some na borda', () => {
    expect(contactShadowOpacity(0, 0.55)).toBe(0.55)
    expect(contactShadowOpacity(1, 0.55)).toBe(0)
    expect(contactShadowOpacity(1.4, 0.55)).toBe(0)
  })

  /** Borda dura lê como mancha pintada no chão, não como sombra. */
  it('cai sem degrau, sempre descendo do centro para fora', () => {
    const samples = Array.from({ length: 21 }, (_, step) => contactShadowOpacity(step / 20, 1))
    for (const [index, value] of samples.entries()) {
      if (index > 0) expect(value).toBeLessThan(samples[index - 1] ?? Number.POSITIVE_INFINITY)
    }
    expect(samples.at(-2)).toBeLessThan(0.15)
  })
})

describe('paintContactShadow', () => {
  it('pinta preto, com a sombra só no alfa', () => {
    const pixels = paintContactShadow({ ...contactShadowSpec(), sizePx: 8 })
    expect(pixels).toHaveLength(8 * 8 * 4)
    const colour = pixels.filter((_, index) => index % 4 !== 3)
    expect(colour.every((channel) => channel === 0)).toBe(true)
  })

  it('é opaco no meio e transparente nos cantos', () => {
    const spec = { ...contactShadowSpec(), sizePx: 16 }
    const pixels = paintContactShadow(spec)
    const alphaAt = (column: number, row: number) => pixels[(row * 16 + column) * 4 + 3]
    expect(alphaAt(7, 7)).toBeGreaterThan(120)
    expect(alphaAt(0, 0)).toBe(0)
  })

  it('recusa textura menor que 2 px ou fracionária, dizendo o valor', () => {
    expect(() => paintContactShadow({ ...contactShadowSpec(), sizePx: 1 })).toThrow(/recebeu 1/)
    expect(() => paintContactShadow({ ...contactShadowSpec(), sizePx: 2.5 })).toThrow(/recebeu 2.5/)
  })
})
