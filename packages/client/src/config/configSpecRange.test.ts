import { describe, expect, it } from 'vitest'
import { isWithinConfigSpec } from './configSpecRange.ts'

describe('isWithinConfigSpec', () => {
  it('aceita o que o parser aceita', () => {
    expect(isWithinConfigSpec('simulation', 'tickHz', 120)).toBe(true)
  })

  it.each([
    ['simulation', 'tickHz', 999],
    ['simulation', 'tickHz', Number.NaN],
    ['simulation', 'semCampo', 60],
  ] as const)('recusa %s.%s = %s', (section, key, value) => {
    expect(isWithinConfigSpec(section, key, value)).toBe(false)
  })
})
