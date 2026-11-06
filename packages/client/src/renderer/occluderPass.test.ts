import { describe, expect, it } from 'vitest'
import { hideFromMainPass, writeInOccluderPass } from './occluderPass.ts'

/** O material de parede de mentira: só as duas chaves de escrita. */
class FakeWallMaterial {
  disableColorWrite = false
  disableDepthWrite = false
}

describe('as chaves da parede do halo', () => {
  it('fora do passe, a parede não escreve nada', () => {
    const material = new FakeWallMaterial()
    hideFromMainPass(material)
    expect(material).toEqual({ disableColorWrite: true, disableDepthWrite: true })
  })

  /** Regressão: só a profundidade deixava vazar o neon desenhado antes da parede. */
  it('no passe, a parede escreve cor e profundidade', () => {
    const material = new FakeWallMaterial()
    hideFromMainPass(material)
    writeInOccluderPass(material)
    expect(material).toEqual({ disableColorWrite: false, disableDepthWrite: false })
  })
})
