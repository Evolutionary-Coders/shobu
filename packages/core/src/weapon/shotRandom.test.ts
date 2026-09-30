import { describe, expect, it } from 'vitest'
import { nextUnit } from '../math/seededRandom.ts'
import { SHOT_SEED_BASE, shotRandom } from './shotRandom.ts'

describe('shotRandom', () => {
  it('sorteia a mesma sequência para o mesmo tiro, nos dois lados da rede', () => {
    expect(nextUnit(shotRandom(7))).toBe(nextUnit(shotRandom(7)))
  })

  it('sorteia diferente em tiros diferentes', () => {
    expect(nextUnit(shotRandom(7))).not.toBe(nextUnit(shotRandom(8)))
  })

  it('usa a base compartilhada quando não recebe outra', () => {
    expect(nextUnit(shotRandom(3))).toBe(nextUnit(shotRandom(3, SHOT_SEED_BASE)))
  })
})
