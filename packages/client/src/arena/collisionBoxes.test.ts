import { readFileSync } from 'node:fs'
import { COLLIDER_SOLID, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockoutToStaticBoxes } from './collisionBoxes.ts'
import { ICHIBAN_GAI_BLOCKOUT, ICHIBAN_GAI_SPAWN_POINTS_M } from './ichibanGai.ts'

/** A cápsula versionada: com o número na mão, mexer nela e esquecer os spawns passava. */
const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const CAPSULE_HEIGHT_M = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
  .collision.capsuleHeightM

describe('blockoutToStaticBoxes', () => {
  it('devolve uma caixa por bloco, nas faces certas', () => {
    const boxes = blockoutToStaticBoxes(ICHIBAN_GAI_BLOCKOUT)
    expect(boxes).toHaveLength(ICHIBAN_GAI_BLOCKOUT.length)
    expect(boxes[0]).toEqual({
      minX: -56,
      minY: -1,
      minZ: -62,
      maxX: 56,
      maxY: 0,
      maxZ: 62,
      mask: COLLIDER_SOLID,
    })
  })

  /**
   * Todo spawn está uma cápsula acima de alguma superfície (convenção de
   * `ICHIBAN_GAI_SPAWN_POINTS_M`): logo, o pé de cada spawn tem que estar exatamente
   * no topo de alguma caixa. Se o blockout mudar e um spawn ficar no ar ou
   * dentro de um bloco, é aqui que aparece.
   */
  it('cada spawn apoia o pé no topo de uma caixa', () => {
    const boxes = blockoutToStaticBoxes(ICHIBAN_GAI_BLOCKOUT)
    for (const [x, eyeY, z] of ICHIBAN_GAI_SPAWN_POINTS_M) {
      // 9,3 - 1,8 não é 7,5 exato em ponto flutuante; o topo da caixa é.
      const feetY = eyeY - CAPSULE_HEIGHT_M
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
