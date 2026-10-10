import { describe, expect, it } from 'vitest'
import { COMPETITOR_BODY_RGB } from '../character/competitorPalette.ts'
import {
  daySkySpec,
  paintDaySky,
  relativeLuminance,
  skyColourAt,
  sunTravelDirection,
} from './daySky.ts'

const spec = daySkySpec()

describe('skyColourAt', () => {
  it('é o horizonte na metade da cúpula', () => {
    expect(skyColourAt(spec, 0.5)).toEqual(spec.horizonRgb)
  })

  it('é o zênite no topo', () => {
    const [r, g, b] = skyColourAt(spec, 1)
    expect([r, g, b].map((c) => c.toFixed(6))).toEqual(spec.zenithRgb.map((c) => c.toFixed(6)))
  })

  it('abaixo do horizonte é chapado', () => {
    expect(skyColourAt(spec, 0)).toEqual(spec.belowHorizonRgb)
    expect(skyColourAt(spec, 0.49)).toEqual(spec.belowHorizonRgb)
  })

  it('fica mais azul quanto mais alto', () => {
    const baixo = skyColourAt(spec, 0.6)
    const alto = skyColourAt(spec, 0.9)
    expect(alto[2] - alto[0]).toBeGreaterThan(baixo[2] - baixo[0])
  })
})

/**
 * O céu é o fundo de todo alvo no telhado. De dia ele é claro por natureza, e
 * o que estes testes guardam é o contrário do que a ADR 0009 guardava: que o
 * corpo escuro do competidor recorta contra ele com folga (ADR 0010).
 */
describe('legibilidade contra o céu', () => {
  const corpo = relativeLuminance(COMPETITOR_BODY_RGB)

  it('o horizonte é pelo menos oito vezes mais claro que o corpo do competidor', () => {
    expect(relativeLuminance(spec.horizonRgb)).toBeGreaterThan(corpo * 8)
  })

  it('o zênite também', () => {
    expect(relativeLuminance(spec.zenithRgb)).toBeGreaterThan(corpo * 8)
  })
})

describe('sunTravelDirection', () => {
  it('é unitário e desce', () => {
    const [x, y, z] = sunTravelDirection(spec)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1)
    expect(y).toBeLessThan(0)
  })

  /** Sol rasante deixa a rua inteira na sombra; sol a pino apaga o volume das fachadas. */
  it('fica entre 35° e 70° de elevação', () => {
    const [, y] = sunTravelDirection(spec)
    const elevationDeg = (Math.asin(-y) * 180) / Math.PI
    expect(elevationDeg).toBeGreaterThan(35)
    expect(elevationDeg).toBeLessThan(70)
  })

  it('recusa vetor nulo', () => {
    expect(() => sunTravelDirection({ ...spec, sunTravelM: [0, 0, 0] })).toThrow(
      /sunTravelM recebeu \[0, 0, 0\]/,
    )
  })
})

describe('paintDaySky', () => {
  it('pinta largura × altura texels rgba opacos', () => {
    const pixels = paintDaySky(spec)
    const [width, height] = spec.sizePx
    expect(pixels).toHaveLength(width * height * 4)
    expect(pixels[3]).toBe(255)
  })

  /**
   * Regressão de 28/09: a linha 0 era o pé da cúpula, a esfera do babylon põe
   * v = 0 no topo, e o céu saiu cinza no zênite.
   */
  it('a primeira linha é o zênite e a última é abaixo do horizonte', () => {
    const pixels = paintDaySky(spec)
    const [width, height] = spec.sizePx
    const last = (height - 1) * width * 4
    expect(pixels[2]).toBe(Math.round(spec.zenithRgb[2] * 255))
    expect(pixels[last + 2]).toBe(Math.round(spec.belowHorizonRgb[2] * 255))
  })

  it('recusa textura sem altura para gradiente', () => {
    expect(() => paintDaySky({ ...spec, sizePx: [4, 1] })).toThrow(/sizePx recebeu \[4, 1\]/)
    expect(() => paintDaySky({ ...spec, sizePx: [0, 64] })).toThrow(/sizePx recebeu \[0, 64\]/)
  })
})
