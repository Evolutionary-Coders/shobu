import { SCORESTREAK_CATALOG } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { SCORESTREAK_BLURBS } from './scorestreakBlurbs.ts'

describe('SCORESTREAK_BLURBS', () => {
  it('toda série disponível tem efeito, e nenhuma bloqueada se diz pronta', () => {
    for (const streak of SCORESTREAK_CATALOG) {
      expect(SCORESTREAK_BLURBS[streak.slug].live, streak.slug).toBe(streak.available)
    }
  })
})
