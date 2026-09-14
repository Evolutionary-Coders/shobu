import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'
import { faceUvForBox } from './greyboxFaceUv.ts'

describe('faceUvForBox', () => {
  it('entrega as seis faces que o CreateBox pede', () => {
    expect(faceUvForBox([1, 1, 1], 1)).toHaveLength(6)
  })

  it('começa toda face na origem do uv', () => {
    for (const [u0, v0] of faceUvForBox([8, 3, 5], 2)) {
      expect([u0, v0]).toEqual([0, 0])
    }
  })

  /** É o defeito que este módulo existe para impedir. */
  it('conta um ladrilho por metro quando o ladrilho tem um metro', () => {
    const [front] = faceUvForBox([64, 22, 1], 1)
    expect(front).toEqual([0, 0, 64, 22])
  })

  it('divide pelo tamanho do ladrilho', () => {
    const [front] = faceUvForBox([64, 22, 1], 4)
    expect(front).toEqual([0, 0, 16, 5.5])
  })

  /**
   * Frente e trás correm em largura e altura; laterais em profundidade e
   * altura; topo e base em largura e profundidade. Trocar dois desses eixos
   * estica a textura numa direção só, que é difícil de ver num cubo e salta
   * num muro de 64 × 22 × 1.
   */
  it('usa as duas dimensões que de fato correm em cada face', () => {
    const [front, back, right, left, top, bottom] = faceUvForBox([64, 22, 1], 1)
    expect(front).toEqual([0, 0, 64, 22])
    expect(back).toEqual([0, 0, 64, 22])
    expect(right).toEqual([0, 0, 1, 22])
    expect(left).toEqual([0, 0, 1, 22])
    expect(top).toEqual([0, 0, 64, 1])
    expect(bottom).toEqual([0, 0, 64, 1])
  })

  it('escala junto com o bloco, que é o que mantém o ladrilho do mesmo tamanho', () => {
    const small = faceUvForBox([8, 8, 8], 2)[0]
    const big = faceUvForBox([64, 64, 64], 2)[0]
    if (!small || !big) throw new Error('faceUvForBox devolveu lista vazia')
    expect(big[2] / small[2]).toBe(8)
  })

  it('recusa ladrilho de tamanho zero ou negativo, com o valor recebido', () => {
    expect(() => faceUvForBox([1, 1, 1], 0)).toThrow(/recebeu 0/)
    expect(() => faceUvForBox([1, 1, 1], -2)).toThrow(/recebeu -2/)
  })

  it('recusa bloco degenerado, com o valor recebido', () => {
    expect(() => faceUvForBox([1, 0, 1], 1)).toThrow(/\[1, 0, 1\]/)
  })
})

/** O módulo existe para o blockout de verdade, não para caixas de teste. */
describe('todo bloco da arena tem uv', () => {
  it.each(GREYBOX_BLOCKOUT.map((block) => [block.name, block.sizeM] as const))(
    '%s ladrilha sem face degenerada',
    (_name, sizeM) => {
      for (const [, , u1, v1] of faceUvForBox(sizeM, 4)) {
        expect(u1).toBeGreaterThan(0)
        expect(v1).toBeGreaterThan(0)
      }
    },
  )
})
