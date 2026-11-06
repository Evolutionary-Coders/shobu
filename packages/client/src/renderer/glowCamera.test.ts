import { describe, expect, it } from 'vitest'
import { glowDrawsFor } from './glowCamera.ts'

/** Uma câmera de mentira: só a identidade e, no óculos, o pai do olho. */
class FakeViewpoint {
  constructor(readonly rigParent?: FakeViewpoint) {}
}

describe('glowDrawsFor', () => {
  const world = new FakeViewpoint()
  const viewmodel = new FakeViewpoint()

  it('o halo da cidade é misturado depois da câmera do mundo', () => {
    expect(glowDrawsFor(world, world)).toBe(true)
  })

  /** Regressão de ba4a3dd: o halo da rua era pintado de novo por cima da arma. */
  it('o halo da cidade não é misturado depois da câmera da arma', () => {
    expect(glowDrawsFor(world, viewmodel)).toBe(false)
    expect(glowDrawsFor(viewmodel, world)).toBe(false)
  })

  it('no óculos, cada olho filho da câmera presa recebe o halo', () => {
    expect(glowDrawsFor(world, new FakeViewpoint(world))).toBe(true)
    expect(glowDrawsFor(world, new FakeViewpoint(viewmodel))).toBe(false)
  })

  it('camada sem câmera presa vale para qualquer câmera', () => {
    expect(glowDrawsFor(null, viewmodel)).toBe(true)
    expect(glowDrawsFor(null, null)).toBe(true)
  })

  it('sem câmera desenhando, o halo preso não é misturado', () => {
    expect(glowDrawsFor(world, null)).toBe(false)
  })
})
