import { describe, expect, it } from 'vitest'
import { greyboxFate, hideFromMainPass, writeInOccluderPass } from './occluderPass.ts'

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

describe('o destino do greybox', () => {
  it('com halo, fica na cena como parede dele', () => {
    expect(greyboxFate(true, true)).toBe('keep')
    expect(greyboxFate(true, false)).toBe('keep')
  })

  /** Regressão: sem halo, o greybox saía, e a poça refletia o neon atrás das paredes. */
  it('sem halo mas com poça, some das câmeras e fica para o espelho', () => {
    expect(greyboxFate(false, true)).toBe('hide')
  })

  it('sem halo nem poça, sai da gpu', () => {
    expect(greyboxFate(false, false)).toBe('dispose')
  })
})
