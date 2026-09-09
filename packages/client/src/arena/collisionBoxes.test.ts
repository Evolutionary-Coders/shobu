import { describe, expect, it } from 'vitest'
import { blockoutToStaticBoxes } from './collisionBoxes.ts'
import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './greyboxBlockout.ts'

describe('blockoutToStaticBoxes', () => {
  it('devolve uma caixa por bloco, nas faces certas', () => {
    const boxes = blockoutToStaticBoxes(GREYBOX_BLOCKOUT)
    expect(boxes).toHaveLength(GREYBOX_BLOCKOUT.length)
    expect(boxes[0]).toEqual({ minX: -32, minY: -1, minZ: -32, maxX: 32, maxY: 0, maxZ: 32 })
  })

  /**
   * Todo spawn está uma cápsula acima de alguma superfície (convenção de
   * `GREYBOX_SPAWN_POINTS_M`): logo, o pé de cada spawn tem que estar exatamente
   * no topo de alguma caixa. Se o blockout mudar e um spawn ficar no ar ou
   * dentro de um bloco, é aqui que aparece.
   */
  it('cada spawn apoia o pé no topo de uma caixa', () => {
    const boxes = blockoutToStaticBoxes(GREYBOX_BLOCKOUT)
    for (const [x, eyeY, z] of GREYBOX_SPAWN_POINTS_M) {
      // 9,3 - 1,8 não é 7,5 exato em ponto flutuante; o topo da caixa é.
      const feetY = eyeY - 1.8
      const support = boxes.find(
        (box) =>
          Math.abs(box.maxY - feetY) < 1e-9 &&
          x > box.minX &&
          x < box.maxX &&
          z > box.minZ &&
          z < box.maxZ,
      )
      expect(support, `spawn em [${x}, ${eyeY}, ${z}] sem caixa embaixo`).toBeDefined()
    }
  })

  it('recusa blockout vazio', () => {
    expect(() => blockoutToStaticBoxes([])).toThrow(/lista vazia/)
  })
})
