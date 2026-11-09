import { describe, expect, it } from 'vitest'
import { FAIR_GOOGLE_CLIENT_ID, googleClientIdOf } from './fairClientId.ts'

describe('googleClientIdOf', () => {
  it('cai no client id da Feira sem a variável', () => {
    expect(googleClientIdOf({})).toBe(FAIR_GOOGLE_CLIENT_ID)
  })

  it('desliga o login com a variável vazia', () => {
    expect(googleClientIdOf({ VITE_GOOGLE_CLIENT_ID: ' ' })).toBeUndefined()
  })

  it('usa o client id da variável', () => {
    expect(googleClientIdOf({ VITE_GOOGLE_CLIENT_ID: ' outro.apps ' })).toBe('outro.apps')
  })
})
