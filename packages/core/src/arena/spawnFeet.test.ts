import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameplayConfig } from '../config/parseGameplayConfig.ts'
import { spawnFeetM } from './spawnFeet.ts'

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

describe('spawnFeetM', () => {
  it('desce uma cápsula e preserva o plano horizontal', () => {
    expect(spawnFeetM([26, CAPSULE_HEIGHT_M, 26], CAPSULE_HEIGHT_M)).toEqual([26, 0, 26])
  })
})
