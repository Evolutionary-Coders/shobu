import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { COMPETITOR_MODEL_HEIGHT_M, competitorAvatarScale } from './competitorAvatar.ts'

/**
 * A altura **versionada**, não uma constante local.
 *
 * Com o número na mão aqui, mexer na cápsula e esquecer os spawns passava no
 * teste e enterrava o jogador no chão — foi o que aconteceu ao subir a cápsula
 * para 2 m. Lendo a config, a relação "spawn = superfície + cápsula" é vigiada
 * contra o número que o jogo de fato usa.
 */
const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const CAPSULE_HEIGHT_M = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
  .collision.capsuleHeightM

describe('competitorAvatarScale', () => {
  it('encolhe o modelo até a altura da cápsula de colisão', () => {
    const scale = competitorAvatarScale(CAPSULE_HEIGHT_M)
    expect(COMPETITOR_MODEL_HEIGHT_M * scale).toBeCloseTo(CAPSULE_HEIGHT_M, 6)
  })

  it('recusa altura não positiva com o valor recebido na mensagem', () => {
    expect(() => competitorAvatarScale(0)).toThrow(/recebeu 0/)
    expect(() => competitorAvatarScale(Number.NaN)).toThrow(/recebeu NaN/)
  })
})
