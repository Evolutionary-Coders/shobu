import { describe, expect, it } from 'vitest'
import { leadershipCalloutText } from './leadershipCallout.ts'

describe('leadershipCalloutText', () => {
  it('escreve cada fala de liderança no hud', () => {
    expect(leadershipCalloutText('lead-taken')).toBe('ASSUMIU A LIDERANÇA')
    expect(leadershipCalloutText('lead-lost')).toBe('PERDEU A LIDERANÇA')
    expect(leadershipCalloutText('one-kill-left')).toBe('FALTA 1 KILL')
  })
})
