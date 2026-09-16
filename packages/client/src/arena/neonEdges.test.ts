import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'
import {
  NEON_EDGE_RGB,
  NEON_STRIP_HEIGHT_M,
  NEON_STRIP_PROUD_M,
  NEON_STRIP_WIDTH_M,
  neonEdgeStrips,
} from './neonEdges.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const strips = neonEdgeStrips(GREYBOX_BLOCKOUT)
const edged = GREYBOX_BLOCKOUT.filter(
  (block) => block.layer === 'ground' || block.layer === 'mid' || block.layer === 'top',
)

describe('neonEdgeStrips', () => {
  it('contorna quatro lados de cada plataforma', () => {
    expect(strips).toHaveLength(edged.length * 4)
  })

  it('não contorna o casco, que é piso e muro, nem os props', () => {
    for (const block of GREYBOX_BLOCKOUT.filter((b) => b.layer === 'shell' || b.layer === 'prop')) {
      expect(strips.some(({ name }) => name.startsWith(`${block.name}-neon`))).toBe(false)
    }
  })

  it('dá a cada camada a sua cor', () => {
    for (const block of edged) {
      const daCamada = strips.filter(({ name }) => name.startsWith(`${block.name}-neon`))
      for (const strip of daCamada) {
        expect(strip.colourRgb).toEqual(NEON_EDGE_RGB[block.layer as 'ground' | 'mid' | 'top'])
      }
    }
  })

  it('dá um nome único a cada fita', () => {
    expect(new Set(strips.map(({ name }) => name)).size).toBe(strips.length)
  })
})

/**
 * A fita mora na beirada do bloco e mal sobra dele. Estes três testes são o que
 * impede a fita de virar obstáculo: ela é geometria sem colisão, e geometria
 * sem colisão que um jogador consiga tropeçar seria a mentira que
 * `arenaProps.ts` existe para não cometer.
 */
describe('a fita não vira degrau nem obstáculo', () => {
  it('sobra menos que a altura de degrau do controlador', () => {
    expect(NEON_STRIP_PROUD_M + NEON_STRIP_HEIGHT_M).toBeLessThan(config.collision.stepHeightM)
  })

  it('encosta a face de fora na face do bloco, sem passar dela', () => {
    for (const block of edged) {
      const [width, , depth] = block.sizeM
      const [x, , z] = block.centerM
      for (const strip of strips.filter(({ name }) => name.startsWith(`${block.name}-neon`))) {
        expect(Math.abs(strip.centerM[0] - x) + strip.sizeM[0] / 2).toBeLessThanOrEqual(
          width / 2 + 1e-9,
        )
        expect(Math.abs(strip.centerM[2] - z) + strip.sizeM[2] / 2).toBeLessThanOrEqual(
          depth / 2 + 1e-9,
        )
      }
    }
  })

  it('assenta o topo da fita logo acima da face de cima do bloco', () => {
    for (const block of edged) {
      const topoDoBloco = block.centerM[1] + block.sizeM[1] / 2
      for (const strip of strips.filter(({ name }) => name.startsWith(`${block.name}-neon`))) {
        const topoDaFita = strip.centerM[1] + strip.sizeM[1] / 2
        expect(topoDaFita).toBeCloseTo(topoDoBloco + NEON_STRIP_PROUD_M, 9)
      }
    }
  })

  it('a fita é fina, senão ela desenha um retângulo em vez de acender a beirada', () => {
    expect(NEON_STRIP_WIDTH_M).toBeLessThan(0.25)
  })
})

describe('as cores das camadas', () => {
  it('são três cores distintas, senão a camada deixa de ter nome', () => {
    const cores = Object.values(NEON_EDGE_RGB).map((rgb) => rgb.join())
    expect(new Set(cores).size).toBe(cores.length)
  })

  /** Neon apagado não acende beirada nenhuma: o canal mais forte vai ao teto. */
  it('são saturadas, porque neon é fonte de luz e não tinta', () => {
    for (const rgb of Object.values(NEON_EDGE_RGB)) {
      expect(Math.max(...rgb)).toBeGreaterThanOrEqual(0.9)
      expect(Math.min(...rgb)).toBeLessThan(0.5)
    }
  })
})

describe('neonEdgeStrips recusa entrada vazia', () => {
  it('não aceita blockout sem bloco', () => {
    expect(() => neonEdgeStrips([])).toThrow(/blockout recebeu lista vazia/)
  })
})
