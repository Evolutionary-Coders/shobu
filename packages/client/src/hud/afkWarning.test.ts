import { describe, expect, it } from 'vitest'
import { afkWarningSeconds, afkWarningText } from './afkWarning.ts'

describe('afkWarningSeconds', () => {
  it('arredonda para cima: 0,2 s ainda é um segundo na tela', () => {
    expect(afkWarningSeconds(11.2)).toBe(12)
    expect(afkWarningSeconds(0.2)).toBe(1)
  })

  it('sem aviso, nada', () => {
    expect(afkWarningSeconds(undefined)).toBeNull()
  })
})

describe('afkWarningText', () => {
  it('diz quanto falta para sair, ou apaga', () => {
    expect(afkWarningText(12)).toBe('INATIVO — SAINDO EM 12 S')
    expect(afkWarningText(null)).toBeNull()
  })
})
