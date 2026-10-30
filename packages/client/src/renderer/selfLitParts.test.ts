import { describe, expect, it } from 'vitest'
import { isBladeGlow, keepsOwnGlow, skipsFinish } from './selfLitParts.ts'

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

describe('skipsFinish', () => {
  /**
   * Regressão: o babylon chama a malha dos braços pelo nó, `Object_80`, e o
   * teste pelo nome da malha deixava o acabamento tingir os braços.
   */
  it('os braços ficam fora do acabamento pelo material, com qualquer nome de malha', () => {
    expect(skipsFinish('Object_80', 'viewmodel-arms')).toBe(true)
  })

  it('o neon fica fora pelo nome da malha', () => {
    expect(skipsFinish('laser_emitter', 'viewmodel-sniper_laser_palette')).toBe(true)
    expect(skipsFinish('arms_cyber_plates', 'viewmodel-arms_cyber_plates')).toBe(true)
  })

  it('o corpo, a luneta e o carregador são pintados', () => {
    const parts = ['base_sniper_0', 'scope_sniper_0', 'mag_sniper_0']
    expect(parts.map((mesh) => skipsFinish(mesh, 'viewmodel-sniper'))).toEqual([
      false,
      false,
      false,
    ])
  })
})

describe('isBladeGlow', () => {
  it('o fio e o filete acendem; o corpo da lâmina não', () => {
    const names = ['blade-M_Fio', 'blade-M_Filete', 'blade-M_Lamina']
    expect(names.map(isBladeGlow)).toEqual([true, true, false])
  })
})
