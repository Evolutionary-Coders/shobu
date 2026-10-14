import { describe, expect, it } from 'vitest'
import { type KillCircumstances, killTagsOf } from './killTags.ts'

const PLAIN: KillCircumstances = {
  weapon: 'sniper',
  headshot: false,
  scoped: true,
  shooterAirborne: false,
  victimAirborne: false,
  shooterGrappling: false,
}

describe('killTagsOf', () => {
  it('o tiro comum, de luneta, só tem a marca da luneta', () => {
    expect(killTagsOf(PLAIN)).toEqual(['scoped'])
  })

  it('o tiro sem luneta é marcado como tal', () => {
    expect(killTagsOf({ ...PLAIN, scoped: false })).toEqual(['noscope'])
  })

  it('tudo junto sai na ordem da linha: cabeça, mira, ar, gancho', () => {
    expect(
      killTagsOf({
        ...PLAIN,
        headshot: true,
        scoped: false,
        shooterAirborne: true,
        shooterGrappling: true,
      }),
    ).toEqual(['headshot', 'noscope', 'airborne', 'grapple'])
  })

  /** Atirador ou vítima: um ícone só (ver o docblock de `KillTag`). */
  it('a vítima no ar também é kill no ar', () => {
    expect(killTagsOf({ ...PLAIN, victimAirborne: true })).toEqual(['scoped', 'airborne'])
  })

  it('a lâmina não tem marca de luneta', () => {
    expect(killTagsOf({ ...PLAIN, weapon: 'katana', scoped: false })).toEqual([])
    expect(killTagsOf({ ...PLAIN, weapon: 'knife', shooterGrappling: true })).toEqual(['grapple'])
  })
})
