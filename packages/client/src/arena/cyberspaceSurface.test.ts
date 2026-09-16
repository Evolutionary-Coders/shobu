import { describe, expect, it } from 'vitest'
import {
  type CyberspaceSurface,
  isNode,
  isOnLine,
  paintCircuit,
  paintPanel,
  SURFACE_SIZE_PX,
} from './cyberspaceSurface.ts'

const surface: CyberspaceSurface = {
  panelRgb: [0.06, 0.068, 0.085],
  seamRgb: [0.025, 0.028, 0.038],
  circuitRgb: [0.1, 0.9, 1],
  cellPx: 32,
  linePx: 2,
  grainAmplitude: 0.025,
  metresPerTile: 2,
  panelAlpha: 1,
}

function texelAt(pixels: Uint8Array, x: number, y: number): readonly number[] {
  const start = (y * SURFACE_SIZE_PX + x) * 4
  return [0, 1, 2, 3].map((channel) => pixels[start + channel] ?? -1)
}

describe('isOnLine', () => {
  it('acende a linha no começo de cada célula', () => {
    expect(isOnLine(surface, 0, 17)).toBe(true)
    expect(isOnLine(surface, 17, 32)).toBe(true)
  })

  it('não acende no meio da célula', () => {
    expect(isOnLine(surface, 17, 19)).toBe(false)
  })

  it('recusa célula que não divide a textura', () => {
    expect(() => isOnLine({ ...surface, cellPx: 30 }, 0, 0)).toThrow(/cellPx recebeu 30/)
  })

  it('recusa linha mais grossa que a célula', () => {
    expect(() => isOnLine({ ...surface, linePx: 32 }, 0, 0)).toThrow(/linePx recebeu 32/)
    expect(() => isOnLine({ ...surface, linePx: 0 }, 0, 0)).toThrow(/linePx recebeu 0/)
  })
})

describe('isNode', () => {
  it('só no encontro de duas linhas', () => {
    expect(isNode(surface, 0, 0)).toBe(true)
    expect(isNode(surface, 0, 17)).toBe(false)
    expect(isNode(surface, 17, 0)).toBe(false)
    expect(isNode(surface, 17, 19)).toBe(false)
  })
})

describe('paintPanel', () => {
  const pixels = paintPanel(surface)

  it('pinta a textura inteira, opaca', () => {
    expect(pixels).toHaveLength(SURFACE_SIZE_PX * SURFACE_SIZE_PX * 4)
    for (let alpha = 3; alpha < pixels.length; alpha += 4) {
      expect(pixels[alpha]).toBe(255)
    }
  })

  /** Costura mais clara que o painel é relevo invertido: vira ressalto. */
  it('deixa a costura mais escura que o painel', () => {
    const [costura] = texelAt(pixels, 0, 0)
    const [painel] = texelAt(pixels, 17, 19)
    expect(costura).toBeLessThan(painel as number)
  })

  it('sai igual toda vez que é pintada', () => {
    expect(paintPanel(surface)).toEqual(pixels)
  })

  /** Sem grão a superfície é cor chapada, que é o oposto do que a adr 0004 pede. */
  it('granula o painel', () => {
    const amostras = new Set(
      Array.from({ length: 24 }, (_unused, step) => texelAt(pixels, 8 + step, 19)[0]),
    )
    expect(amostras.size).toBeGreaterThan(1)
  })
})

/**
 * A barreira do perímetro é a única superfície que o olho atravessa, e o que
 * torna isso honesto é a linha ficar opaca: superfície que o jogador não vê
 * mas na qual ele esbarra seria exatamente a mentira que o projeto não comete.
 */
describe('paintPanel com painel translúcido', () => {
  const vidro = { ...surface, panelAlpha: 0.1 }
  const pixels = paintPanel(vidro)

  it('deixa o painel translúcido', () => {
    expect(texelAt(pixels, 17, 19)[3]).toBe(Math.round(0.1 * 255))
  })

  it('mantém a linha do circuito opaca, senão a barreira some de vez', () => {
    expect(texelAt(pixels, 0, 17)[3]).toBe(255)
  })

  it('recusa opacidade fora da faixa', () => {
    expect(() => paintPanel({ ...surface, panelAlpha: 0 })).toThrow(/panelAlpha recebeu 0/)
    expect(() => paintPanel({ ...surface, panelAlpha: 1.5 })).toThrow(/panelAlpha recebeu 1.5/)
  })
})

describe('paintCircuit', () => {
  const pixels = paintCircuit(surface)

  it('deixa o painel preto, porque emissiva é só o circuito', () => {
    expect(texelAt(pixels, 17, 19).slice(0, 3)).toEqual([0, 0, 0])
  })

  it('acende a linha', () => {
    expect(texelAt(pixels, 0, 17)[1]).toBeGreaterThan(0)
  })

  /** Nó e linha no mesmo nível devolvem papel quadriculado, não circuito. */
  it('acende o nó mais que a linha', () => {
    const [, noVerde] = texelAt(pixels, 0, 0)
    const [, linhaVerde] = texelAt(pixels, 0, 17)
    expect(noVerde).toBeGreaterThan(linhaVerde as number)
  })

  it('nenhum canal sai da faixa de um byte', () => {
    for (const channel of pixels) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
  })
})
