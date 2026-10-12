import { COLLIDER_GRAPPLE_ONLY } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { propBetween } from './propCollider.ts'

describe('propBetween', () => {
  it('aceita os cantos em qualquer ordem', () => {
    expect(propBetween('peca', COLLIDER_GRAPPLE_ONLY, [1, 2, 3], [0, 1, 1])).toEqual({
      name: 'peca',
      mask: COLLIDER_GRAPPLE_ONLY,
      centerM: [0.5, 1.5, 2],
      sizeM: [1, 1, 2],
    })
  })

  it('recusa peça chata, com os cantos na mensagem', () => {
    expect(() => propBetween('placa', COLLIDER_GRAPPLE_ONLY, [0, 0, 0], [1, 1, 0])).toThrow(
      /placa recebeu cantos \[0, 0, 0\] e \[1, 1, 0\]/,
    )
  })
})
