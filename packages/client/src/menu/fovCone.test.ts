import { describe, expect, it } from 'vitest'
import { specFor } from '../settings/playerSettingsSpec.ts'
import { fovCone } from './fovCone.ts'

const spec = specFor('fieldOfViewDeg')

describe('fovCone', () => {
  it('a meia-abertura é metade do campo, que é o que o css gira para cada lado', () => {
    expect(fovCone(90).halfAngleDeg).toBe(45)
  })

  it('vai de 0 no fov mais fechado a 1 no mais aberto', () => {
    expect(fovCone(spec.minInclusive).openness).toBe(0)
    expect(fovCone(spec.maxInclusive).openness).toBe(1)
  })

  it('o padrão cai dentro da faixa, sem encostar nas pontas', () => {
    const { openness } = fovCone(spec.fallback)
    expect(openness).toBeGreaterThan(0)
    expect(openness).toBeLessThan(1)
  })

  it('cresce com o campo, sem degrau', () => {
    let anterior = -1
    for (let fov = spec.minInclusive; fov <= spec.maxInclusive; fov += 1) {
      const atual = fovCone(fov).openness
      expect(atual).toBeGreaterThan(anterior)
      anterior = atual
    }
  })

  it('recorta valor fora da faixa em vez de desenhar cone impossível', () => {
    expect(fovCone(9999).halfAngleDeg).toBe(spec.maxInclusive / 2)
    expect(fovCone(-5).halfAngleDeg).toBe(spec.minInclusive / 2)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('recusa %s dizendo o que recebeu', (value) => {
    expect(() => fovCone(value)).toThrow(/recebeu/)
  })
})
