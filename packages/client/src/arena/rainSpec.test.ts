import { describe, expect, it } from 'vitest'
import { paintRainStreaks, type RainSpec, rainScrollAt } from './rainSpec.ts'

const SPEC: RainSpec = {
  sizePx: [64, 256],
  streaks: 120,
  seed: 7,
  fallMps: 9,
  curtainsM: [2.5, 6, 12],
  curtainSizeM: [10, 8],
  tilesTall: 2,
  brightness: 0.6,
}

describe('paintRainStreaks', () => {
  const pixels = paintRainStreaks(SPEC)

  it('pinta uma textura do tamanho pedido, em RGBA', () => {
    expect(pixels).toHaveLength(64 * 256 * 4)
  })

  it('é repetível: a mesma semente dá a mesma chuva', () => {
    expect(paintRainStreaks(SPEC)).toEqual(pixels)
  })

  /** A cortina soma luz: fundo que não fosse preto clarearia a tela inteira. */
  it('deixa a maior parte da textura preta', () => {
    let lit = 0
    for (let offset = 0; offset < pixels.length; offset += 4)
      if ((pixels[offset + 2] ?? 0) > 0) lit += 1
    expect(lit / (64 * 256)).toBeLessThan(0.25)
    expect(lit).toBeGreaterThan(0)
  })

  it('nenhum risco passa do brilho pedido', () => {
    expect(Math.max(...pixels.filter((_, index) => index % 4 === 2))).toBeLessThanOrEqual(
      Math.round(255 * SPEC.brightness),
    )
  })
})

describe('rainScrollAt', () => {
  it('começa em zero e fica entre 0 e 1', () => {
    expect(rainScrollAt(SPEC, 0, 0)).toBe(0)
    for (const t of [0.3, 1.7, 52.1, -4]) {
      const v = rainScrollAt(SPEC, 1, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('uma volta a cada ladrilho caído: 4 m a 9 m/s', () => {
    expect(rainScrollAt(SPEC, 0, 4 / 9 / 2)).toBeCloseTo(0.5)
  })

  it('a cortina de trás cai mais devagar que a da frente', () => {
    expect(rainScrollAt(SPEC, 2, 0.1)).toBeGreaterThan(rainScrollAt(SPEC, 0, 0.1))
  })
})
