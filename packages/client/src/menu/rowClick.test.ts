import { describe, expect, it } from 'vitest'
import { rowClickCommandOf } from './rowClick.ts'

describe('rowClickCommandOf', () => {
  it('o clique dentro do campo do nome não confirma a linha, que fecharia o campo', () => {
    // regressão: tocar no campo abria e fechava o teclado no mesmo gesto.
    expect(rowClickCommandOf({ inTextField: true, step: undefined })).toBeNull()
  })

  it('a seta ‹ › tocada ajusta', () => {
    expect(rowClickCommandOf({ inTextField: false, step: 'left' })).toBe('left')
    expect(rowClickCommandOf({ inTextField: false, step: 'right' })).toBe('right')
  })

  it('o resto da linha confirma', () => {
    expect(rowClickCommandOf({ inTextField: false, step: undefined })).toBe('activate')
    expect(rowClickCommandOf({ inTextField: false, step: 'up' })).toBe('activate')
  })
})
