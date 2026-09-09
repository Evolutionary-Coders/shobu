import { describe, expect, it } from 'vitest'
import { createHeldKeys } from './heldKeys.ts'
import { createMovementInput, type PlanarBasis, planarUnit, wishFromKeys } from './wishDirection.ts'

/** Câmera olhando para +z: frente é +z, direita é +x. */
const FACING_Z: PlanarBasis = { forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0 }

/** Câmera girada 90° para a direita: frente é +x, direita é -z. */
const FACING_X: PlanarBasis = { forwardX: 1, forwardZ: 0, rightX: 0, rightZ: -1 }

describe('wishFromKeys', () => {
  it('sem tecla, sem direção', () => {
    const input = wishFromKeys(createHeldKeys(), FACING_Z, createMovementInput())
    expect([input.wishX, input.wishZ]).toEqual([0, 0])
  })

  it('w anda para onde a câmera olha', () => {
    const keys = { ...createHeldKeys(), forward: true }
    const ahead = wishFromKeys(keys, FACING_X, createMovementInput())
    expect([ahead.wishX, ahead.wishZ]).toEqual([1, 0])
  })

  it('diagonal é unitária: não anda mais rápido que reto', () => {
    const keys = { ...createHeldKeys(), forward: true, right: true }
    const input = wishFromKeys(keys, FACING_Z, createMovementInput())
    expect(Math.hypot(input.wishX, input.wishZ)).toBeCloseTo(1)
    expect(input.wishX).toBeCloseTo(input.wishZ)
  })

  it('teclas opostas se anulam', () => {
    const keys = { ...createHeldKeys(), forward: true, back: true, left: true }
    const input = wishFromKeys(keys, FACING_Z, createMovementInput())
    expect([input.wishX, input.wishZ]).toEqual([-1, 0])
  })

  it('copia shift, espaço e slide', () => {
    const keys = { ...createHeldKeys(), sprint: true, jump: true, crouch: true }
    const input = wishFromKeys(keys, FACING_Z, createMovementInput())
    expect([input.sprint, input.jump, input.crouch]).toEqual([true, true, true])
  })

  it('escreve no objeto recebido em vez de alocar', () => {
    const into = createMovementInput()
    expect(wishFromKeys(createHeldKeys(), FACING_Z, into)).toBe(into)
  })
})

describe('planarUnit', () => {
  it('projeta no plano do chão e normaliza: olhar para baixo não encurta o passo', () => {
    const [x, z] = planarUnit(0, -0.9, 0.3)
    expect([x, z]).toEqual([0, 1])
  })

  it('câmera apontando reto para o chão não tem frente', () => {
    expect(planarUnit(0, -1, 0)).toEqual([0, 0])
  })
})
