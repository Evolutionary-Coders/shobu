import { describe, expect, it } from 'vitest'
import { fairUserIdOf } from './fairUserId.ts'

describe('fairUserIdOf', () => {
  it.each([
    [42, 42],
    ['42', 42],
    [' 007 ', 7],
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
    ['grande demais', '9007199254740993'],
    ['nulo', null],
    ['objeto', { userId: 1 }],
  ])('rejeita %s', (_case, raw) => {
    expect(fairUserIdOf(raw)).toBeUndefined()
  })
})
