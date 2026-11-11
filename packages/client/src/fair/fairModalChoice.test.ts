import { describe, expect, it } from 'vitest'
import { fairModalOutcome, INVALID_FAIR_ID_TEXT } from './fairModalChoice.ts'

describe('fairModalOutcome', () => {
  it('confirmar fecha com o ID digitado', () => {
    expect(fairModalOutcome({ kind: 'confirm', text: ' 42 ' }, null)).toEqual({ close: 42 })
  })

  it('confirmar um ID fora de forma mostra o erro e não fecha', () => {
    expect(fairModalOutcome({ kind: 'confirm', text: '4a' }, 7)).toEqual({
      error: INVALID_FAIR_ID_TEXT,
    })
  })

  it('jogar sem ID fecha com null, mesmo havendo ID', () => {
    expect(fairModalOutcome({ kind: 'skip' }, 42)).toEqual({ close: null })
  })

  /** Regressão do review do PR #49: o ESC do TROCAR apagava o ID. */
  it('cancelar devolve o ID que já havia', () => {
    expect(fairModalOutcome({ kind: 'cancel' }, 42)).toEqual({ close: 42 })
    expect(fairModalOutcome({ kind: 'cancel' }, null)).toEqual({ close: null })
  })
})
