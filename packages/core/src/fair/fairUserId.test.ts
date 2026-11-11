import { describe, expect, it } from 'vitest'
import { fairUserIdOf } from './fairUserId.ts'

describe('fairUserIdOf', () => {
  it.each([
    [42, 42],
    ['42', 42],
    [' 007 ', 7],
    ['４２', 42],
    [2_147_483_647, 2_147_483_647],
  ])('aceita %j como %j', (raw, id) => {
    expect(fairUserIdOf(raw)).toBe(id)
  })

  it.each([
    ['zero', 0],
    ['negativo', -3],
    ['fração', 2.5],
    ['texto vazio', ''],
    ['texto com vírgula', '4,2'],
    ['texto com letra', '12a'],
    ['acima do integer da Feira', 2_147_483_648],
    ['texto acima do integer da Feira', '99999999999'],
    ['nulo', null],
    ['objeto', { userId: 1 }],
  ])('rejeita %s', (_case, raw) => {
    expect(fairUserIdOf(raw)).toBeUndefined()
  })
})
