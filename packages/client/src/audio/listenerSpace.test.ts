import { describe, expect, it } from 'vitest'
import { toWebAudioSpace } from './listenerSpace.ts'

/**
 * A regra da mão direita da Web Audio: olhando para -z com y para cima, a
 * direita é +x. Produto vetorial frente × cima dá a direita.
 */
function rightOf(forward: { x: number; y: number; z: number }) {
  const up = { x: 0, y: 1, z: 0 }
  return {
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  }
}

describe('toWebAudioSpace', () => {
  it('troca só o sinal do z', () => {
    expect(toWebAudioSpace({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0 })).toEqual({
      x: 1,
      y: 2,
      z: -3,
    })
  })

  /** Olhando para +z no babylon, a direita do jogador é +x; no fone tem que continuar sendo. */
  it('o que está à direita do jogador continua à direita do ouvido', () => {
    const forward = toWebAudioSpace({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })
    const source = toWebAudioSpace({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const right = rightOf(forward)
    expect(source.x * right.x + source.y * right.y + source.z * right.z).toBeGreaterThan(0)
  })
})
