import { describe, expect, it } from 'vitest'
import { clampPitchRad } from './driveCameraFromCharacter.ts'

/**
 * O resto de `driveCameraFromCharacter` não tem teste: ele é o adapter entre a
 * `Scene` do babylon e o núcleo, e instanciar uma cena exige um contexto webgl
 * que não existe no node (ADR 0001). O que é regra mora na função pura abaixo.
 */
describe('clampPitchRad', () => {
  /** Sem trava o jogador passa da vertical e o mundo gira de cabeça para baixo. */
  it('não deixa a mira passar do topo', () => {
    expect(clampPitchRad(Math.PI)).toBeLessThan(Math.PI / 2)
    expect(clampPitchRad(Math.PI)).toBeGreaterThan(0)
  })

  it('não deixa a mira passar do chão', () => {
    expect(clampPitchRad(-Math.PI)).toBeGreaterThan(-Math.PI / 2)
    expect(clampPitchRad(-Math.PI)).toBeLessThan(0)
  })

  it('deixa a mira no meio do caminho como está', () => {
    expect(clampPitchRad(0)).toBe(0)
    expect(clampPitchRad(0.7)).toBe(0.7)
    expect(clampPitchRad(-0.7)).toBe(-0.7)
  })

  /** Exatamente na vertical a frente da câmera degenera e a base do chão some. */
  it('guarda uma folga da vertical exata', () => {
    expect(Math.abs(clampPitchRad(Math.PI / 2))).toBeLessThan(Math.PI / 2)
  })
})
