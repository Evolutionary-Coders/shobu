import { describe, expect, it } from 'vitest'
import { GREYBOX_SPAWN_POINTS_M } from '../arena/greyboxBlockout.ts'
import {
  COMPETITOR_MODEL_HEIGHT_M,
  competitorAvatarScale,
  competitorFeetM,
} from './competitorAvatar.ts'

const CAPSULE_HEIGHT_M = 1.8

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

describe('competitorFeetM', () => {
  it('desce uma cápsula e preserva o plano horizontal', () => {
    expect(competitorFeetM([26, 1.8, 26], CAPSULE_HEIGHT_M)).toEqual([26, 0, 26])
  })

  /**
   * A regressão que importa: se o spawn deixar de ser "uma cápsula acima da
   * superfície", o avatar flutua ou afunda, e nenhum teste de unidade do
   * renderer pega isso — só esta relação entre o blockout e a cápsula.
   */
  it('apoia todo spawn do greybox em uma superfície do blockout', () => {
    const surfaceY = [0, 7.5, 14.5]
    for (const spawn of GREYBOX_SPAWN_POINTS_M) {
      const [, feetY] = competitorFeetM(spawn, CAPSULE_HEIGHT_M)
      const gap = Math.min(...surfaceY.map((y) => Math.abs(y - feetY)))
      expect(gap, `spawn ${JSON.stringify(spawn)} apoia em ${feetY}`).toBeLessThan(1e-9)
    }
  })
})
