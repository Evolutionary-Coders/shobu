import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameplayConfig } from '../config/parseGameplayConfig.ts'
import { GREYBOX_SPAWN_POINTS_M } from './greyboxBlockout.ts'
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

  /**
   * A regressão que importa: se o spawn deixar de ser "uma cápsula acima da
   * superfície", o avatar flutua ou afunda, e nenhum teste de unidade do
   * renderer pega isso — só esta relação entre o blockout e a cápsula.
   */
  it('apoia todo spawn do greybox em uma superfície do blockout', () => {
    const surfaceY = [0, 7.5, 14.5]
    for (const spawn of GREYBOX_SPAWN_POINTS_M) {
      const [, feetY] = spawnFeetM(spawn, CAPSULE_HEIGHT_M)
      const gap = Math.min(...surfaceY.map((y) => Math.abs(y - feetY)))
      expect(gap, `spawn ${JSON.stringify(spawn)} apoia em ${feetY}`).toBeLessThan(1e-9)
    }
  })
})
