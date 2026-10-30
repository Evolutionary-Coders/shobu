import { describe, expect, it } from 'vitest'
import { keepsOwnGlow } from './selfLitParts.ts'

describe('keepsOwnGlow', () => {
  it('as peças de neon da laser acendem sozinhas, inteiras ou partidas em primitivas', () => {
    const names = ['laser_shroud', 'laser_body_neon', 'laser_emitter_primitive0', 'laser_fins']
    expect(names.map(keepsOwnGlow)).toEqual([true, true, true, true])
  })

  it('as placas dos braços acendem sozinhas, com o nome que o loader der a elas', () => {
    expect(keepsOwnGlow('arms_cyber_plates')).toBe(true)
    expect(keepsOwnGlow('arms_cyber_plates_primitive1')).toBe(true)
  })

  /** O corpo da arma é o que o acabamento pinta: tirar dele quebraria as skins. */
  it('o corpo, a luneta e o carregador ficam com o acabamento', () => {
    const names = ['base_sniper_0', 'scope_sniper_0', 'mag_sniper_0', 'arms_0', 'sniper_laser_x']
    expect(names.map(keepsOwnGlow)).toEqual([false, false, false, false, false])
  })
})
