import { describe, expect, it } from 'vitest'
import { thinBarDivisions, thinBarFraction } from './thinBar.ts'

describe('thinBarFraction', () => {
  it('é a razão entre valor e máximo', () => {
    expect(thinBarFraction(150, 300)).toBe(0.5)
    expect(thinBarFraction(300, 300)).toBe(1)
  })

  it('prende o valor na faixa em vez de inverter ou estourar a barra', () => {
    expect(thinBarFraction(-2, 300)).toBe(0)
    expect(thinBarFraction(400, 300)).toBe(1)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('recusa máximo %s', (max) => {
    expect(() => thinBarFraction(1, max)).toThrow(`max recebeu ${max}`)
  })

  it('recusa valor não finito citando o valor', () => {
    expect(() => thinBarFraction(Number.NaN, 5)).toThrow('value recebeu NaN')
  })
})

describe('thinBarDivisions', () => {
  it('põe uma marca a cada passo', () => {
    expect(thinBarDivisions(300, 60)).toBe(5)
  })

  it('o último trecho curto também conta como trecho', () => {
    expect(thinBarDivisions(330, 60)).toBe(6)
  })

  it.each([0, Number.NaN])('recusa total %s', (total) => {
    expect(() => thinBarDivisions(total, 60)).toThrow(`total recebeu ${total}`)
  })

  it.each([0, Number.POSITIVE_INFINITY])('recusa passo %s', (step) => {
    expect(() => thinBarDivisions(300, step)).toThrow(`step recebeu ${step}`)
  })
})
