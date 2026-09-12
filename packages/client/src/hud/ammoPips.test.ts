import { describe, expect, it } from 'vitest'
import { ammoPipStates } from './ammoPips.ts'

const MAGAZINE = 5

describe('ammoPipStates', () => {
  it('desenha uma marca por bala do pente, cheio ou vazio', () => {
    expect(ammoPipStates(MAGAZINE, MAGAZINE, 'ready')).toHaveLength(MAGAZINE)
    expect(ammoPipStates(0, MAGAZINE, 'ready')).toHaveLength(MAGAZINE)
  })

  it('apaga as marcas gastas, do fim para o começo', () => {
    expect(ammoPipStates(3, MAGAZINE, 'ready')).toEqual([
      'loaded',
      'loaded',
      'loaded',
      'spent',
      'spent',
    ])
  })

  it('o pente cheio acende tudo', () => {
    expect(new Set(ammoPipStates(MAGAZINE, MAGAZINE, 'ready'))).toEqual(new Set(['loaded']))
  })

  it('o pente vazio não acende nada', () => {
    expect(new Set(ammoPipStates(0, MAGAZINE, 'ready'))).toEqual(new Set(['spent']))
  })

  /** Mostra que a arma ainda não está pronta, sem uma palavra de texto. */
  it('marca a bala na câmara enquanto o ferrolho cicla', () => {
    expect(ammoPipStates(4, MAGAZINE, 'cycling')[0]).toBe('chambered')
    expect(ammoPipStates(4, MAGAZINE, 'ready')[0]).toBe('loaded')
  })

  it('recusa mais balas do que o pente aceita', () => {
    expect(() => ammoPipStates(9, MAGAZINE, 'ready')).toThrow(/esperado inteiro de 0 a 5/)
  })

  it('recusa pente que não guarda bala nenhuma', () => {
    expect(() => ammoPipStates(0, 0, 'ready')).toThrow(/magazineRounds recebeu 0/)
  })
})
