import { describe, expect, it } from 'vitest'
import { dottedField } from './dottedField.ts'

describe('dottedField', () => {
  it('põe o valor na mesma coluna para rótulos de tamanhos diferentes', () => {
    const short = dottedField('NÓ', 'X')
    const long = dottedField('ADRENALINA', 'X')
    expect(short.indexOf('X')).toBe(long.indexOf('X'))
  })

  /**
   * O que trava o alinhamento na tela de verdade: acento é ponto de código, não
   * caractere a mais. Com `.length` cru o trilho esquerdo saía escalonado.
   */
  it('conta rótulo acentuado pelo mesmo tamanho do sem acento', () => {
    expect(dottedField('CORAÇÃO', 'X')).toHaveLength(dottedField('ESPINHA', 'X').length)
  })

  it('nunca cola rótulo e valor, mesmo com rótulo mais largo que a coluna', () => {
    expect(dottedField('RÓTULO EXAGERADAMENTE LONGO', 'X')).toContain(' .. X')
  })

  it('mantém rótulo e valor no texto', () => {
    expect(dottedField('VIDA', 'UMA')).toBe('VIDA ......... UMA')
  })
})
