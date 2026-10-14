import { describe, expect, it } from 'vitest'
import { eyeToScreenFor, HEADSET_MAX_MAGNIFICATION, headsetMagnification } from './headsetLens.ts'

describe('headsetMagnification', () => {
  it('sem luneta, sem ampliação', () => {
    expect(headsetMagnification(90, 90)).toBe(1)
  })

  it('é a razão das tangentes da metade do fov, e não a razão dos fovs', () => {
    // 90° → 53,13° é exatamente 2×: tan(45°) / tan(26,565°) = 1 / 0,5.
    expect(headsetMagnification(90, 53.130102354)).toBeCloseTo(2, 6)
  })

  it('a luneta inteira do desktop para no teto do óculos', () => {
    expect(headsetMagnification(90, 15)).toBe(HEADSET_MAX_MAGNIFICATION)
  })

  it('a lente de entrada, que abre além da base, não desamplia', () => {
    expect(headsetMagnification(90, 110)).toBe(1)
  })
})

describe('eyeToScreenFor', () => {
  it('ampliar m vezes é afastar a tela m vezes', () => {
    expect(eyeToScreenFor(0.041, 2)).toBeCloseTo(0.082)
  })

  it('sem ampliação, a distância de fábrica', () => {
    expect(eyeToScreenFor(0.041, 1)).toBe(0.041)
  })
})
