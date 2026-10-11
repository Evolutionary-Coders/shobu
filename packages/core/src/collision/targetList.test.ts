import { describe, expect, it } from 'vitest'
import { createTargetList, pushTarget, resetTargetList } from './targetList.ts'

const FEET = { x: 3, y: 0, z: 12 }

describe('createTargetList', () => {
  it('nasce vazia, com as caixas já alocadas', () => {
    const list = createTargetList(8)
    expect(list.count).toBe(0)
    expect(list.boxes).toHaveLength(8)
  })

  it('recusa capacidade que não guarda ninguém', () => {
    expect(() => createTargetList(0)).toThrow(/capacity recebeu 0/)
    expect(() => createTargetList(1.5)).toThrow(/capacity recebeu 1.5/)
  })
})

describe('pushTarget', () => {
  it('escreve a cápsula e de quem ela é', () => {
    const list = createTargetList(4)
    pushTarget(list, 7, FEET, 0.4, 1.8)
    expect(list.count).toBe(1)
    // igualdade profunda, e não campo a campo: a origem viaja **dentro** da
    // caixa, e é isso que impede um array paralelo dessincronizar dela.
    expect(list.boxes[0]).toEqual({
      feetX: 3,
      feetY: 0,
      feetZ: 12,
      radiusM: 0.4,
      heightM: 1.8,
      sourceIndex: 7,
    })
  })

  it('recusa mais alvos que a capacidade, dizendo quantos cabem', () => {
    const list = createTargetList(1)
    pushTarget(list, 0, FEET, 0.4, 1.8)
    expect(() => pushTarget(list, 1, FEET, 0.4, 1.8)).toThrow(/esperado no máximo 1/)
  })
})

describe('resetTargetList', () => {
  /** A lista é reaproveitada entre ticks: o que passa de `count` é lixo de propósito. */
  it('esvazia a contagem sem trocar as caixas, que são reaproveitadas', () => {
    const list = createTargetList(4)
    pushTarget(list, 0, FEET, 0.4, 1.8)
    const firstBox = list.boxes[0]
    resetTargetList(list)
    expect(list.count).toBe(0)
    expect(list.boxes[0]).toBe(firstBox)
  })

  it('escrever depois do reset sobrescreve do começo', () => {
    const list = createTargetList(4)
    pushTarget(list, 0, FEET, 0.4, 1.8)
    resetTargetList(list)
    pushTarget(list, 5, { x: 0, y: 0, z: 0 }, 0.5, 2)
    expect(list.count).toBe(1)
    expect(list.boxes[0]?.sourceIndex).toBe(5)
    expect(list.boxes[0]?.feetZ).toBe(0)
  })
})
