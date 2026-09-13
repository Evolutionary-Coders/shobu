import { describe, expect, it } from 'vitest'
import { hitHeightRatio } from './hitHeight.ts'

const FEET = { x: 4, y: 2, z: -7 }
const CAPSULE_HEIGHT_M = 2

function hitAt(y: number) {
  return { x: 4, y, z: -7 }
}

describe('hitHeightRatio', () => {
  it('no pé é 0', () => {
    expect(hitHeightRatio(hitAt(2), FEET, CAPSULE_HEIGHT_M)).toBe(0)
  })

  it('no topo da cabeça é 1', () => {
    expect(hitHeightRatio(hitAt(4), FEET, CAPSULE_HEIGHT_M)).toBe(1)
  })

  it('na cintura é meio', () => {
    expect(hitHeightRatio(hitAt(3), FEET, CAPSULE_HEIGHT_M)).toBe(0.5)
  })

  it('no terço superior passa do limiar do headshot', () => {
    expect(hitHeightRatio(hitAt(3.5), FEET, CAPSULE_HEIGHT_M)).toBeGreaterThan(0.66)
  })

  /** A calota da cápsula pode devolver ponto um fio acima do topo. */
  it('recorta em 1 o acerto acima da cápsula', () => {
    expect(hitHeightRatio(hitAt(9), FEET, CAPSULE_HEIGHT_M)).toBe(1)
  })

  it('recorta em 0 o acerto abaixo do pé', () => {
    expect(hitHeightRatio(hitAt(-3), FEET, CAPSULE_HEIGHT_M)).toBe(0)
  })

  /** Agachado a cápsula encolhe, e a razão acompanha sem ninguém mexer nela. */
  it('a mesma altura vira headshot na cápsula agachada', () => {
    expect(hitHeightRatio(hitAt(2.9), FEET, 1)).toBeGreaterThan(0.66)
    expect(hitHeightRatio(hitAt(2.9), FEET, CAPSULE_HEIGHT_M)).toBeLessThan(0.66)
  })

  it.each([0, -2, Number.NaN])('recusa cápsula de altura %s, dizendo o valor', (height) => {
    expect(() => hitHeightRatio(hitAt(3), FEET, height)).toThrow(/capsuleHeightM/)
  })
})
