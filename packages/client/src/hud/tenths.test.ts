import { describe, expect, it } from 'vitest'
import { ceilTenths, tenthsLabel } from './tenths.ts'

describe('ceilTenths', () => {
  /** Arredondar para baixo mostraria 4,9 no primeiro quadro da contagem. */
  it('arredonda para cima: o primeiro quadro mostra o prazo inteiro', () => {
    expect(ceilTenths(5 - 1 / 60)).toBe(50)
  })

  it('o décimo exato não sobe por erro de ponto flutuante', () => {
    expect(ceilTenths(4.9)).toBe(49)
    expect(ceilTenths(0.3)).toBe(3)
  })

  it('trava em zero em vez de contar negativo', () => {
    expect(ceilTenths(-0.5)).toBe(0)
  })

  it('recusa tempo não finito citando o valor', () => {
    expect(() => ceilTenths(Number.POSITIVE_INFINITY)).toThrow(/seconds recebeu Infinity/)
  })
})

describe('tenthsLabel', () => {
  it('escreve segundos e décimos com vírgula', () => {
    expect(tenthsLabel(50)).toBe('5,0')
    expect(tenthsLabel(49)).toBe('4,9')
    expect(tenthsLabel(3)).toBe('0,3')
  })

  it('passa de dez segundos sem quebrar, se o prazo da configuração crescer', () => {
    expect(tenthsLabel(125)).toBe('12,5')
  })
})
