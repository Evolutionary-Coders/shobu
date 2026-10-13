import { readFileSync } from 'node:fs'
import {
  COLLIDER_GRAPPLE_ONLY,
  createCharacterState,
  EYE_HEIGHT_RATIO,
  findGrappleAnchor,
  IDLE_INPUT,
  parseGameplayConfig,
  raycastBoxes,
  STOPS_SHOT,
  stepCharacter,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { arenaCollisionBoxes } from './collisionBoxes.ts'
import { ichibanGaiLanterns } from './ichibanGaiLanterns.ts'
import { ICHIBAN_GAI_MAP } from './ichibanGaiMap.ts'
import { nodeBounds, nodesNamed, readPublishedGlb } from './publishedArenaGlb.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
/** Até onde o bairro vai (`ichibanGai.ts`): lanterna de fora dele é cenário do além. */
const WORLD_HALF_M: readonly [number, number] = [56, 62]
/** A quantização do glb erra por menos de um milímetro em 30 m; um centímetro sobra. */
const TOLERANCE_M = 0.01

const lanterns = ichibanGaiLanterns()

/** O barril de cada lanterna da arte publicada que fica dentro do bairro. */
function publishedLanterns() {
  const glb = readPublishedGlb('ichiban-gai.glb')
  return nodesNamed(glb, 'molde-lanterna')
    .map((node) => nodeBounds(glb, node))
    .filter(({ min }) => Math.abs(min[0]) < WORLD_HALF_M[0] && Math.abs(min[2]) < WORLD_HALF_M[1])
}

describe('as lanternas do Ichiban-gai', () => {
  it('são uma caixa de gancho para cada lanterna que a arte pendura no bairro', () => {
    const art = publishedLanterns()
    expect(lanterns).toHaveLength(art.length)
    for (const { min, max } of art) {
      const centerX = (min[0] + max[0]) / 2
      const centerZ = (min[2] + max[2]) / 2
      const match = lanterns.find(
        ({ centerM, sizeM }) =>
          Math.abs(centerM[0] - centerX) < TOLERANCE_M &&
          Math.abs(centerM[2] - centerZ) < TOLERANCE_M &&
          Math.abs(centerM[1] - sizeM[1] / 2 - min[1]) < TOLERANCE_M,
      )
      expect(match, `lanterna da arte em [${centerX}, ${min[1]}, ${centerZ}]`).toBeDefined()
      expect(match?.mask).toBe(COLLIDER_GRAPPLE_ONLY)
    }
  })

  it('estão no mapa', () => {
    expect(ICHIBAN_GAI_MAP.props).toEqual(expect.arrayContaining([...lanterns]))
  })

  describe('na arena de verdade', () => {
    const boxes = arenaCollisionBoxes(ICHIBAN_GAI_MAP)
    // a primeira lanterna do fio que cruza a avenida em z = 12, a 4,9 m do chão.
    const lantern = lanterns.find(({ centerM }) => centerM[2] === 12 && centerM[0] < -5)
    const [x, y, z] = lantern?.centerM ?? [0, 0, 0]

    it('o gancho mirado nela engata nela', () => {
      // 4 m ao sul, na avenida, entre o quiosque e o fio.
      const below = createCharacterState({ x, y: 0, z: z - 4 }, config)
      const eyeY = config.collision.capsuleHeightM * EYE_HEIGHT_RATIO
      const aim = { aimX: 0, aimY: y - eyeY, aimZ: 4 }
      const anchor = { x: 0, y: 0, z: 0 }
      expect(findGrappleAnchor(below, aim, boxes, config, anchor)).toBeDefined()
      expect(anchor.z).toBeCloseTo(z - 0.32)
    })

    it('o tiro passa por ela', () => {
      const eye = { x, y, z: z - 4 }
      expect(raycastBoxes(eye, { x: 0, y: 0, z: 1 }, boxes, 8, STOPS_SHOT)).toBeUndefined()
    })

    it('o corpo atravessa ela', () => {
      // subindo de baixo dela, com a cabeça encostando no fundo do barril:
      // sem a máscara, a cabeça parava ali e a velocidade morria.
      const bottom = y - (lantern?.sizeM[1] ?? 0) / 2
      const startFeetY = bottom - config.collision.capsuleHeightM - 0.01
      const body = createCharacterState({ x, y: startFeetY, z }, config)
      body.velocity.y = 6
      stepCharacter(body, IDLE_INPUT, boxes, config, 1 / 60)
      expect(body.position.y).toBeGreaterThan(startFeetY + 0.05)
      expect(body.velocity.y).toBeGreaterThan(0)
    })
  })
})
