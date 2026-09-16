import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'
import {
  copyReachM,
  isSkylineNeon,
  NEON_FLICKER_MIN,
  neonFlickerAt,
  SKYLINE_BLOCK_SIZE_M,
  SKYLINE_FAR_PLANE_M,
  SKYLINE_NEON_MATERIAL,
  SKYLINE_RINGS,
  SKYLINE_STRUCTURE_RGB,
  skylineFarthestVertexM,
  skylineRingPlacements,
} from './skylineRing.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const northWall = GREYBOX_BLOCKOUT.find((block) => block.name === 'wall-north')
const placements = skylineRingPlacements()

describe('SKYLINE_RINGS', () => {
  /** Um anel só é um anteparo de teatro: sem camadas não há paralaxe. */
  it('tem mais de um anel, senão o fundo volta a ser muro pintado', () => {
    expect(SKYLINE_RINGS.length).toBeGreaterThan(1)
  })

  it('cada anel é mais longe e maior que o anterior', () => {
    for (const [step, ring] of SKYLINE_RINGS.slice(1).entries()) {
      const anterior = SKYLINE_RINGS[step]
      if (!anterior) throw new Error('anel anterior sumiu')
      expect(ring.radiusM).toBeGreaterThan(anterior.radiusM)
      expect(ring.scaleFactor).toBeGreaterThan(anterior.scaleFactor)
    }
  })

  it('dá nome único a cada anel', () => {
    const names = SKYLINE_RINGS.map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
  })

  /**
   * A cópia é larga: se as cópias de um anel forem menos que a volta dele
   * dividida pela largura de uma, abre vão e dá para ver o céu no meio da
   * cidade. Vale para o anel de perto, que é o único sem nada na frente.
   */
  it('o anel de perto fecha a volta sem vão', () => {
    const near = SKYLINE_RINGS[0]
    if (!near) throw new Error('nenhum anel declarado')
    const widthM = SKYLINE_BLOCK_SIZE_M[0] * near.scaleFactor
    expect(near.copies * widthM).toBeGreaterThan(2 * Math.PI * near.radiusM)
  })
})

/**
 * O outro lado da moeda do anel: ele não pode entrar na arena. O defeito que
 * este teste existe para pegar é exatamente o que apareceu em tela — prédio
 * atravessando a barreira e geometria cortada no perímetro.
 */
describe('nenhuma cópia entra na arena', () => {
  it('encontra o muro norte, senão o teste passaria vazio', () => {
    expect(northWall).toBeDefined()
  })

  it('toda cópia fica além da barreira, com folga', () => {
    if (!northWall) throw new Error('wall-north sumiu do blockout')
    const arenaEdgeM = northWall.centerM[2] + northWall.sizeM[2] / 2
    for (const placement of placements) {
      const centreM = Math.hypot(placement.positionM[0], placement.positionM[2])
      const nearestM = centreM - copyReachM(placement.scaleFactor)
      expect(nearestM, `cópia chega a ${nearestM.toFixed(1)} m do centro`).toBeGreaterThan(
        arenaEdgeM,
      )
    }
  })
})

describe('skylineRingPlacements', () => {
  it('põe uma cópia por posição de cada anel', () => {
    const total = SKYLINE_RINGS.reduce((sum, ring) => sum + ring.copies, 0)
    expect(placements).toHaveLength(total)
  })

  /**
   * O glb é centrado nos três eixos. Sem levantar cada cópia por metade da
   * altura, metade de todo prédio fica **enterrada** abaixo do piso da arena —
   * que era o que fazia o horizonte ler como um muro de lajes.
   */
  it('assenta a base de cada cópia no chão da arena', () => {
    for (const placement of placements) {
      const halfHeightM = (SKYLINE_BLOCK_SIZE_M[1] * placement.scaleFactor) / 2
      expect(placement.positionM[1]).toBeCloseTo(halfHeightM, 6)
    }
  })

  /** Cópias com o mesmo giro mostrariam a mesma fachada, e a repetição salta. */
  it('nenhuma cópia repete o giro de outra', () => {
    const yaws = placements.map(({ yawRad }) => yawRad.toFixed(6))
    expect(new Set(yaws).size).toBe(yaws.length)
  })

  it('nenhuma cópia repete a escala de outra', () => {
    const scales = placements.map(({ scaleFactor }) => scaleFactor.toFixed(6))
    expect(new Set(scales).size).toBe(scales.length)
  })

  /** Captura de tela que muda sozinha entre dois runs não compara nada. */
  it('sai igual toda vez, porque o desvio é determinístico', () => {
    expect(skylineRingPlacements()).toEqual(placements)
  })
})

/**
 * O anel só serve para alguma coisa se o jogador **vir** a cidade. A barreira
 * agora é translúcida, então a linha de visão que importa não é mais a borda
 * de cima dela: é a própria altura da barreira, que a cópia mais próxima tem
 * que vencer para haver silhueta recortada contra o céu.
 */
describe('a cidade aparece por cima da barreira', () => {
  it('a torre do anel de perto passa da altura da barreira', () => {
    if (!northWall) throw new Error('wall-north sumiu do blockout')
    const barrierTopM = northWall.centerM[1] + northWall.sizeM[1] / 2
    const near = SKYLINE_RINGS[0]
    if (!near) throw new Error('nenhum anel declarado')
    const towerHeightM = SKYLINE_BLOCK_SIZE_M[1] * near.scaleFactor
    expect(towerHeightM).toBeGreaterThan(barrierTopM)
  })
})

describe('SKYLINE_FAR_PLANE_M', () => {
  it('alcança o vértice mais distante, visto da quina oposta', () => {
    expect(SKYLINE_FAR_PLANE_M).toBeGreaterThan(skylineFarthestVertexM())
  })

  it('vai além do alcance do hitscan, porque cenário não é alvo', () => {
    expect(SKYLINE_FAR_PLANE_M).toBeGreaterThan(config.weapon.hitscanRangeM)
  })
})

describe('copyReachM', () => {
  it('mede metade da diagonal da pegada', () => {
    const [width, , depth] = SKYLINE_BLOCK_SIZE_M
    expect(copyReachM(2)).toBeCloseTo(Math.hypot(width, depth), 6)
  })
})

describe('neonFlickerAt', () => {
  it('começa cheio', () => {
    expect(neonFlickerAt(0)).toBeCloseTo(1, 6)
  })

  it('nunca apaga de vez nem estoura', () => {
    for (let elapsedS = 0; elapsedS < 40; elapsedS += 0.11) {
      expect(neonFlickerAt(elapsedS)).toBeGreaterThanOrEqual(NEON_FLICKER_MIN - 1e-9)
      expect(neonFlickerAt(elapsedS)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('de fato pisca, senão é uma constante com nome bonito', () => {
    const níveis = new Set(
      Array.from({ length: 50 }, (_unused, step) => neonFlickerAt(step * 0.19).toFixed(3)),
    )
    expect(níveis.size).toBeGreaterThan(20)
  })
})

describe('SKYLINE_STRUCTURE_RGB', () => {
  /** Cidade clara vira a coisa mais brilhante da tela e achata a arena. */
  it('é escura, porque é noite e quem acende é o letreiro', () => {
    const [red, green, blue] = SKYLINE_STRUCTURE_RGB
    expect(0.2126 * red + 0.7152 * green + 0.0722 * blue).toBeLessThan(0.4)
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
