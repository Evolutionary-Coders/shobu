import { describe, expect, it } from 'vitest'
import { BOUNDARY_CRITICAL_S, boundaryTenths, boundaryTone } from './boundaryWarning.ts'

describe('boundaryTenths', () => {
  it('sem aviso não há décimo', () => {
    expect(boundaryTenths(null)).toBeNull()
  })

  /** Arredondar para baixo mostraria 4,9 no primeiro quadro fora da área. */
  it('arredonda para cima: o primeiro quadro fora mostra o prazo inteiro', () => {
    expect(boundaryTenths(5 - 1 / 60)).toBe(50)
  })

  it('o décimo exato não sobe por erro de ponto flutuante', () => {
    expect(boundaryTenths(4.9)).toBe(49)
    expect(boundaryTenths(0.3)).toBe(3)
  })

  it('trava em zero em vez de contar negativo', () => {
    expect(boundaryTenths(-0.5)).toBe(0)
  })

  it('recusa tempo não finito citando o valor', () => {
    expect(() => boundaryTenths(Number.NaN)).toThrow(/remainingS recebeu NaN/)
  })
})

describe('boundaryTone', () => {
  it('apaga o aviso sem contagem', () => {
    expect(boundaryTone(null)).toBe('off')
  })

  it('âmbar acima dos últimos segundos', () => {
    expect(boundaryTone(BOUNDARY_CRITICAL_S * 10 + 1)).toBe('warning')
  })

  it('vermelho nos últimos segundos, borda incluída', () => {
    expect(boundaryTone(BOUNDARY_CRITICAL_S * 10)).toBe('critical')
    expect(boundaryTone(0)).toBe('critical')
  })
})
