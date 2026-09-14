import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT } from '../arena/greyboxBlockout.ts'
import { greyboxSurfaceSpec } from './greyboxSurfaceSpec.ts'

const spec = greyboxSurfaceSpec()
const surfaces = Object.values(spec)

describe('greyboxSurfaceSpec', () => {
  /**
   * Camada sem superfície é bloco sem material, e o babylon desenha isso como
   * branco liso — o que ninguém percebe até estar na arena.
   */
  it('cobre toda camada que o blockout usa', () => {
    for (const layer of new Set(GREYBOX_BLOCKOUT.map((block) => block.layer))) {
      expect(spec[layer], `camada ${layer} sem superfície`).toBeDefined()
    }
  })

  it('dá textura própria a cada camada, senão a verticalidade some', () => {
    const urls = surfaces.map(({ textureUrl }) => textureUrl)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('aponta para webp servido de public/assets/textures/', () => {
    for (const { textureUrl } of surfaces) {
      expect(textureUrl).toMatch(/^\/assets\/textures\/[a-z-]+\.webp$/)
    }
  })

  it('pede ladrilho de tamanho positivo', () => {
    for (const { metresPerTile } of surfaces) {
      expect(metresPerTile).toBeGreaterThan(0)
    }
  })

  it('mantém todo canal dentro da faixa de um multiplicador', () => {
    for (const { tintRgb } of surfaces) {
      for (const channel of tintRgb) {
        expect(channel).toBeGreaterThan(0)
        expect(channel).toBeLessThanOrEqual(1)
      }
    }
  })

  /**
   * O tom multiplica a textura, então um tom escuro escurece duas vezes — a
   * textura já tem valor próprio. Era esse o defeito quando a cor era tudo que
   * havia e o casco precisou subir de 0,18 para 0,3 para não engolir a luz.
   *
   * A conta é de **luminância**, não de canal: o tom do topo é dourado, e
   * dourado precisa de azul baixo para ser dourado. Exigir 0,5 em todo canal
   * proibiria qualquer tom saturado, que não é o defeito que se quer evitar.
   */
  it('mantém todo tom claro o bastante para não escurecer a textura de novo', () => {
    for (const { tintRgb } of surfaces) {
      const [red, green, blue] = tintRgb
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      expect(
        luminance,
        `tom [${tintRgb.join(', ')}] tem luminância ${luminance.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(0.5)
    }
  })

  /** Duas camadas do mesmo tom voltam a ser uma caixa lisa só. */
  it('dá tom distinto a cada camada', () => {
    const tints = surfaces.map(({ tintRgb }) => tintRgb.join(','))
    expect(new Set(tints).size).toBe(tints.length)
  })
})
