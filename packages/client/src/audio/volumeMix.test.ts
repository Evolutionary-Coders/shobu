import { describe, expect, it } from 'vitest'
import { channelGain, duckedGain, MUSIC_DUCK_RATIO } from './volumeMix.ts'

describe('channelGain', () => {
  it('o cursor no fim é ganho cheio', () => {
    expect(channelGain(100)).toBe(1)
  })

  it('o cursor no começo é silêncio', () => {
    expect(channelGain(0)).toBe(0)
  })

  it('a metade do cursor não é a metade do ganho: a curva é quadrática', () => {
    expect(channelGain(50)).toBe(0.25)
  })

  it('é monotônica: mais cursor nunca é menos som', () => {
    const ganhos = [0, 25, 50, 75, 100].map(channelGain)
    expect(ganhos).toEqual([...ganhos].sort((a, b) => a - b))
  })

  it.each([-20, 140])('recorta o cursor fora da faixa em vez de estourar (%s)', (percent) => {
    expect(channelGain(percent)).toBeGreaterThanOrEqual(0)
    expect(channelGain(percent)).toBeLessThanOrEqual(1)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('recusa %s, dizendo o valor', (percent) => {
    expect(() => channelGain(percent)).toThrow(`channelGain recebeu ${percent}`)
  })
})

describe('duckedGain', () => {
  it('a música cede enquanto o narrador fala, mas não some', () => {
    expect(duckedGain(1)).toBe(MUSIC_DUCK_RATIO)
    expect(duckedGain(1)).toBeGreaterThan(0)
  })

  it('música já muda continua muda', () => {
    expect(duckedGain(0)).toBe(0)
  })
})
