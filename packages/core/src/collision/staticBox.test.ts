import { describe, expect, it } from 'vitest'
import { boxFromCenterSize, overlaps, overlapsAny, type PlayerBox } from './staticBox.ts'

const player = (feetX: number, feetY: number, feetZ: number): PlayerBox => ({
  feetX,
  feetY,
  feetZ,
  // meio metro e não 0,4: 1,5 - 0,5 é exato em ponto flutuante, 1,4 - 0,4 não
  // é, e o teste de "encostar" precisa de face exatamente sobre face.
  radiusM: 0.5,
  heightM: 1.8,
})

describe('boxFromCenterSize', () => {
  it('converte centro e tamanho em faces', () => {
    expect(boxFromCenterSize([0, -0.5, 0], [64, 1, 64])).toEqual({
      minX: -32,
      minY: -1,
      minZ: -32,
      maxX: 32,
      maxY: 0,
      maxZ: 32,
    })
  })

  it('recusa tamanho que não desenha volume', () => {
    expect(() => boxFromCenterSize([0, 0, 0], [1, 0, 1])).toThrow(/sizeM recebeu \[1, 0, 1\]/)
  })
})

describe('overlaps', () => {
  const block = boxFromCenterSize([0, 1, 0], [2, 2, 2])

  it('detecta penetração', () => {
    expect(overlaps(player(0.5, 0.5, 0), block)).toBe(true)
  })

  /** Encostar não é penetrar: é o que deixa o jogador apoiado sem ser empurrado. */
  it('encostar na face não é interseção', () => {
    expect(overlaps(player(1.5, 0, 0), block)).toBe(false)
    expect(overlaps(player(0, 2, 0), block)).toBe(false)
  })

  it('não vê caixa que está só acima ou só ao lado', () => {
    expect(overlaps(player(0, 2.5, 0), block)).toBe(false)
    expect(overlaps(player(5, 0, 0), block)).toBe(false)
  })
})

describe('overlapsAny', () => {
  it('acha a caixa em qualquer posição da lista', () => {
    const far = boxFromCenterSize([50, 0, 0], [1, 1, 1])
    const near = boxFromCenterSize([0, 1, 0], [2, 2, 2])
    expect(overlapsAny(player(0, 0.5, 0), [far, near])).toBe(true)
    expect(overlapsAny(player(0, 0.5, 0), [far])).toBe(false)
  })
})
