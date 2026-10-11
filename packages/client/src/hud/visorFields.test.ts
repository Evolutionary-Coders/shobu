import { describe, expect, it } from 'vitest'
import {
  ammoLabels,
  CALLSIGN_MAX,
  callsignLabel,
  DEFAULT_CALLSIGN,
  killPointsParts,
  pointsLabel,
  weaponStatus,
} from './visorFields.ts'

describe('weaponStatus', () => {
  it.each([
    [5, 'ready', 'PRONTA'],
    [4, 'firing', 'FERROLHO'],
    [4, 'cycling', 'FERROLHO'],
    [0, 'reloading', 'RECARREGANDO'],
    [0, 'ready', 'VAZIA'],
  ] as const)('%s balas em %s é %s', (loaded, phase, status) => {
    expect(weaponStatus(loaded, phase)).toBe(status)
  })
})

describe('ammoLabels', () => {
  it('separa o número grande do tamanho do pente', () => {
    expect(ammoLabels(3, 5)).toEqual({ loaded: '3', magazine: '/5' })
  })
})

describe('callsignLabel', () => {
  it('sem apelido, o estado mostra o nome padrão', () => {
    expect(callsignLabel(undefined)).toBe(DEFAULT_CALLSIGN)
    expect(callsignLabel('   ')).toBe(DEFAULT_CALLSIGN)
  })

  it('passa o apelido para caixa alta e tira o espaço das pontas', () => {
    expect(callsignLabel(' raiden ')).toBe('RAIDEN')
  })

  it('corta no teto, contando ponto de código', () => {
    const long = 'Á'.repeat(CALLSIGN_MAX + 3)
    expect([...callsignLabel(long)]).toHaveLength(CALLSIGN_MAX)
  })
})

describe('pointsLabel', () => {
  it('escreve sete dígitos com zeros à esquerda', () => {
    expect(pointsLabel(400)).toBe('PTS: 0000400')
    expect(pointsLabel(0)).toBe('PTS: 0000000')
  })

  it('para no teto de sete dígitos em vez de alargar a linha', () => {
    expect(pointsLabel(12_345_678)).toBe('PTS: 9999999')
  })

  it.each([-1, 1.5, Number.NaN])('recusa %s pontos citando o valor', (points) => {
    expect(() => pointsLabel(points)).toThrow(`points recebeu ${points}`)
  })
})

describe('killPointsParts', () => {
  it('separa o sinal, que a folha de glifos não desenha', () => {
    expect(killPointsParts(100)).toEqual({ sign: '+', digits: '100' })
    expect(killPointsParts(0)).toEqual({ sign: '+', digits: '0' })
  })

  it('aceita desconto, para o dia em que houver um', () => {
    expect(killPointsParts(-5)).toEqual({ sign: '-', digits: '5' })
  })
})
