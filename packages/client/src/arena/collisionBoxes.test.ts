import { readFileSync } from 'node:fs'
import {
  COLLIDER_BODY_ONLY,
  COLLIDER_GRAPPLE_ONLY,
  COLLIDER_SOLID,
  createCharacterState,
  findGrappleAnchor,
  parseGameplayConfig,
  STOPS_BODY,
  stopsAny,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockBetween } from './arenaBlock.ts'
import { arenaCollisionBoxes, blockoutToStaticBoxes } from './collisionBoxes.ts'
import { ICHIBAN_GAI_BLOCKOUT, ICHIBAN_GAI_SPAWN_POINTS_M } from './ichibanGai.ts'
import { NEON_KAIDO_BLOCKOUT } from './neonKaido.ts'
import { propBetween } from './propCollider.ts'

/** A cápsula versionada: com o número na mão, mexer nela e esquecer os spawns passava. */
const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const CAPSULE_HEIGHT_M = config.collision.capsuleHeightM

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

  it('a parede invisível do fim do bairro só para o corpo, e todo o resto para tudo', () => {
    const boxes = blockoutToStaticBoxes(NEON_KAIDO_BLOCKOUT)
    for (const [index, block] of NEON_KAIDO_BLOCKOUT.entries()) {
      const expected = block.layer === 'barrier' ? COLLIDER_BODY_ONLY : COLLIDER_SOLID
      expect(boxes[index]?.mask, block.name).toBe(expected)
      expect(stopsAny(boxes[index]?.mask ?? 0, STOPS_BODY), block.name).toBe(true)
    }
  })

  /**
   * A regressão do fim do Kaidō (12/10): mirando a rua para o norte por cima
   * do tapume, o gancho prendia na parede invisível de z = 62 — a corda presa
   * no ar, na frente do cânion que continua.
   */
  it('o gancho mirado na boca do Kaidō não prende no ar', () => {
    const boxes = blockoutToStaticBoxes(NEON_KAIDO_BLOCKOUT)
    const standing = createCharacterState({ x: 0, y: 0, z: 30 }, config)
    const aim = { aimX: 0, aimY: 0.3, aimZ: 1 }
    const anchor = { x: 0, y: 0, z: 0 }
    expect(findGrappleAnchor(standing, aim, boxes, config, anchor)).toBeUndefined()
    const asBefore = boxes.map((box) => ({ ...box, mask: COLLIDER_SOLID }))
    expect(findGrappleAnchor(standing, aim, asBefore, config, anchor)).toBeDefined()
    expect(anchor.z).toBeCloseTo(62)
  })

  it('recusa blockout vazio', () => {
    expect(() => blockoutToStaticBoxes([])).toThrow(/lista vazia/)
  })
})

describe('arenaCollisionBoxes', () => {
  it('põe o blockout primeiro e a arte com colisão depois, cada peça com a sua máscara', () => {
    const floor = blockBetween('piso', 'floor', 'rua', [-5, -1, -5], [5, 0, 5])
    const lantern = propBetween('lanterna', COLLIDER_GRAPPLE_ONLY, [0, 4, 0], [1, 5, 1])
    const boxes = arenaCollisionBoxes({ blockout: [floor], props: [lantern] })
    expect(boxes.map((box) => box.mask)).toEqual([COLLIDER_SOLID, COLLIDER_GRAPPLE_ONLY])
    expect(boxes[1]).toMatchObject({ minX: 0, minY: 4, maxY: 5, maxZ: 1 })
  })
})
