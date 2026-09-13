import { describe, expect, it } from 'vitest'
import { buildJackInReadout } from './jackIn.ts'
import { killPointsField, scoreField, weaponField } from './visorFields.ts'

describe('scoreField', () => {
  it('escreve o placar com dois dígitos, para a coluna não dançar', () => {
    expect(scoreField(3)).toContain('03')
    expect(scoreField(12)).toContain('12')
  })
})

describe('weaponField', () => {
  it('diz o que a arma está fazendo', () => {
    expect(weaponField(5, 'ready')).toContain('PRONTA')
    expect(weaponField(4, 'cycling')).toContain('FERROLHO')
    expect(weaponField(0, 'reloading')).toContain('RECARREGANDO')
  })

  it('pente vazio e arma parada é arma vazia', () => {
    expect(weaponField(0, 'ready')).toContain('VAZIA')
  })
})

/**
 * O visor tem que sentar na mesma espinha tipográfica do roteiro do boot e do
 * mostrador da transição: é o alinhamento do pontilhado que faz as três telas
 * parecerem o mesmo aparelho.
 */
describe('a coluna do visor', () => {
  it('alinha com a do mostrador da transição', () => {
    const visor = [scoreField(0), weaponField(5, 'ready')]
    const columns = [...visor, ...buildJackInReadout()].map((line) => line.lastIndexOf('.'))
    expect(new Set(columns).size).toBe(1)
  })
})

describe('killPointsField', () => {
  it('mostra o ganho com sinal, que é metade da leitura', () => {
    expect(killPointsField(1)).toBe('+1')
    expect(killPointsField(10)).toBe('+10')
  })

  it('aceita desconto, para o dia em que houver um', () => {
    expect(killPointsField(-5)).toBe('-5')
  })

  it('zero conta como ganho nenhum, não como perda', () => {
    expect(killPointsField(0)).toBe('+0')
  })
})
