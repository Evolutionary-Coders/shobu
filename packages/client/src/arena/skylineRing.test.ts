import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'
import {
  isSkylineNeon,
  SKYLINE_BLOCK_SCALE,
  SKYLINE_BLOCK_SIZE_M,
  SKYLINE_COPIES,
  SKYLINE_FAR_PLANE_M,
  SKYLINE_NEON_MATERIAL,
  SKYLINE_RING_RADIUS_M,
  skylineRingPlacements,
} from './skylineRing.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const northWall = GREYBOX_BLOCKOUT.find((block) => block.name === 'wall-north')

describe('skylineRingPlacements', () => {
  const placements = skylineRingPlacements()

  it('põe uma cópia por posição do anel', () => {
    expect(placements).toHaveLength(SKYLINE_COPIES)
  })

  it('assenta todas no chão da arena, que é y = 0', () => {
    expect(placements.every(({ positionM }) => positionM[1] === 0)).toBe(true)
  })

  it('mantém todas à mesma distância do centro', () => {
    for (const { positionM } of placements) {
      expect(Math.hypot(positionM[0], positionM[2])).toBeCloseTo(SKYLINE_RING_RADIUS_M, 6)
    }
  })

  /** Quatro cópias com o mesmo giro mostrariam a mesma fachada para dentro. */
  it('gira cada cópia junto com o ângulo em que ela está', () => {
    for (const { positionM, yawRad } of placements) {
      expect(Math.sin(yawRad) * SKYLINE_RING_RADIUS_M).toBeCloseTo(positionM[0], 6)
      expect(Math.cos(yawRad) * SKYLINE_RING_RADIUS_M).toBeCloseTo(positionM[2], 6)
    }
  })

  it('espaça os giros por igual, senão sobra vão entre duas cópias', () => {
    const yaws = placements.map(({ yawRad }) => yawRad)
    expect(new Set(yaws).size).toBe(yaws.length)
    for (const [copy, yawRad] of yaws.entries()) {
      expect(yawRad).toBeCloseTo((copy * 2 * Math.PI) / SKYLINE_COPIES, 6)
    }
  })

  it('leva a escala do quarteirão para toda cópia', () => {
    expect(placements.every((p) => p.scaleFactor === SKYLINE_BLOCK_SCALE)).toBe(true)
  })
})

/**
 * O anel só serve para alguma coisa se o jogador **vir** a cidade, e o casco de
 * 22 m é quem decide isso. Da altura do olho no centro da arena, a borda do
 * muro esconde tudo abaixo da reta que passa por ela — e é essa reta, não a
 * altura do muro, que a escala do quarteirão tem que vencer.
 *
 * Sem este teste, reduzir `SKYLINE_BLOCK_SCALE` para economizar triângulo
 * deixaria uma cidade inteira escondida atrás da parede, e nenhum outro teste
 * notaria.
 */
describe('o quarteirão aparece por cima do casco', () => {
  it('encontra o muro norte, senão o teste passaria vazio', () => {
    expect(northWall).toBeDefined()
  })

  it('as torres passam da linha de visão que a borda do muro traça', () => {
    if (!northWall) throw new Error('wall-north sumiu do blockout')
    const wallTopM = northWall.centerM[1] + northWall.sizeM[1] / 2
    const wallDistanceM = northWall.centerM[2]
    const eyeM = config.collision.capsuleHeightM
    const sightLineAtRingM = eyeM + ((wallTopM - eyeM) * SKYLINE_RING_RADIUS_M) / wallDistanceM
    const towerHeightM = SKYLINE_BLOCK_SIZE_M[1] * SKYLINE_BLOCK_SCALE
    expect(
      towerHeightM,
      `torre de ${towerHeightM.toFixed(0)} m contra linha de visão de ${sightLineAtRingM.toFixed(0)} m`,
    ).toBeGreaterThan(sightLineAtRingM)
  })
})

/**
 * O outro lado da mesma moeda: o quarteirão não pode entrar na arena. O raio é
 * medido, não escolhido, e este teste guarda a folga que a medição achou.
 */
describe('o quarteirão fica fora da arena', () => {
  it('o anel começa além do muro', () => {
    if (!northWall) throw new Error('wall-north sumiu do blockout')
    expect(SKYLINE_RING_RADIUS_M).toBeGreaterThan(northWall.centerM[2])
  })

  it('o plano distante alcança o anel inteiro', () => {
    expect(SKYLINE_FAR_PLANE_M).toBeGreaterThan(SKYLINE_RING_RADIUS_M)
  })

  it('o plano distante vai além do alcance do hitscan, porque cenário não é alvo', () => {
    expect(SKYLINE_FAR_PLANE_M).toBeGreaterThan(config.weapon.hitscanRangeM)
  })
})

describe('isSkylineNeon', () => {
  it('reconhece o material que o conversor marcou', () => {
    expect(isSkylineNeon(SKYLINE_NEON_MATERIAL)).toBe(true)
  })

  /** O loader do babylon prefixa o nome do material com o do arquivo. */
  it('reconhece o nome mesmo prefixado pelo loader', () => {
    expect(isSkylineNeon(`skyline.glb#${SKYLINE_NEON_MATERIAL}`)).toBe(true)
  })

  it('não confunde a estrutura com neon', () => {
    expect(isSkylineNeon('skyline-structure')).toBe(false)
  })
})
