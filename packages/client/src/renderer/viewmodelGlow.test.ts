import { describe, expect, it } from 'vitest'
import {
  blocksViewmodelGlow,
  effectLayerEnabled,
  glowsInViewmodel,
  VIEWMODEL_GLOW,
  VIEWMODEL_GLOW_LAYER,
  viewmodelGlowColor,
} from './viewmodelGlow.ts'

/** O `Color4` de mentira: guarda o último `set`. */
class RecordedColor {
  value: readonly number[] = []
  set(r: number, g: number, b: number, a: number): void {
    this.value = [r, g, b, a]
  }
}

describe('glowsInViewmodel', () => {
  it('o neon da laser, as placas dos braços e o fio da lâmina entram no halo', () => {
    expect(glowsInViewmodel('laser_emitter', 'viewmodel-sniper_laser_palette')).toBe(true)
    expect(glowsInViewmodel('arms_cyber_plates', 'viewmodel-arms_cyber_plates')).toBe(true)
    expect(glowsInViewmodel('Object_3', 'blade-M_Fio')).toBe(true)
  })

  it('a pele dos braços e o corpo da arma ficam fora', () => {
    expect(glowsInViewmodel('Object_80', 'viewmodel-arms')).toBe(false)
    expect(glowsInViewmodel('base_sniper_0', 'viewmodel-sniper')).toBe(false)
  })
})

describe('viewmodelGlowColor', () => {
  /** A emissiva é preta com textura (`applyEmissiveTexture`): multiplicar por ela apagaria o halo. */
  it('com textura emissiva, branco: a cor vem da textura', () => {
    const out = new RecordedColor()
    viewmodelGlowColor({ emissiveTexture: {}, emissiveColor: { r: 0, g: 0, b: 0 } }, out)
    expect(out.value).toEqual([1, 1, 1, 1])
  })

  it('sem textura, a cor emissiva do acabamento', () => {
    const out = new RecordedColor()
    viewmodelGlowColor({ emissiveTexture: null, emissiveColor: { r: 0, g: 0.8, b: 1 } }, out)
    expect(out.value).toEqual([0, 0.8, 1, 1])
  })
})

describe('effectLayerEnabled', () => {
  it('o halo da mão fica ligado em toda predefinição, DESEMPENHO incluída', () => {
    expect(effectLayerEnabled(VIEWMODEL_GLOW_LAYER, false)).toBe(true)
    expect(effectLayerEnabled(VIEWMODEL_GLOW_LAYER, true)).toBe(true)
  })

  it('o halo da cidade segue a predefinição', () => {
    expect(effectLayerEnabled('neon', false)).toBe(false)
    expect(effectLayerEnabled('neon', true)).toBe(true)
  })

  it('o halo da mão é barato: no máximo meia resolução', () => {
    expect(VIEWMODEL_GLOW.mainTextureRatio).toBeLessThanOrEqual(0.5)
  })
})

describe('blocksViewmodelGlow', () => {
  /** Regressão: a laser do outro lado do receptor brilhava através da sniper. */
  it('o receptor e a luneta tapam o halo da mão', () => {
    expect(blocksViewmodelGlow('base_sniper_0')).toBe(true)
    expect(blocksViewmodelGlow('scope_sniper_0_primitive1')).toBe(true)
  })

  it('o que acende e o resto da arma ficam fora da parede', () => {
    expect(blocksViewmodelGlow('laser_scope_housing')).toBe(false)
    expect(blocksViewmodelGlow('bolt_sniper_0')).toBe(false)
    expect(blocksViewmodelGlow('Object_80')).toBe(false)
  })

  it('a parede recua no passe, para a laser rente ao corpo não piscar', () => {
    expect(VIEWMODEL_GLOW.blockerZOffset).toBeGreaterThan(0)
  })
})
