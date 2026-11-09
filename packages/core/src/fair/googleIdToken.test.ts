import { describe, expect, it } from 'vitest'
import { isIdTokenFresh, readIdTokenClaims } from './googleIdToken.ts'
import { forgeIdToken } from './idTokenForge.ts'

describe('readIdTokenClaims', () => {
  it('lê conta, validade e nome', () => {
    const token = forgeIdToken({ sub: 'c1', exp: 2000, name: 'Ana Júlia', email: 'a@x.br' })
    expect(readIdTokenClaims(token)).toEqual({ sub: 'c1', exp: 2000, name: 'Ana Júlia' })
  })

  it('cai no e-mail sem nome, e em vazio sem os dois', () => {
    expect(readIdTokenClaims(forgeIdToken({ sub: 'c1', exp: 1, email: 'a@x.br' }))?.name).toBe(
      'a@x.br',
    )
    expect(readIdTokenClaims(forgeIdToken({ sub: 'c1', exp: 1, name: '' }))?.name).toBe('')
  })

  it.each([
    ['sem três partes', 'abc.def'],
    ['payload que não é base64', 'a.!!!.c'],
    ['payload que não é json', `a.${btoa('oi')}.c`],
    ['payload que não é objeto', `a.${btoa('3')}.c`],
    ['sem sub', forgeIdToken({ exp: 1 })],
    ['sub vazio', forgeIdToken({ sub: '', exp: 1 })],
    ['exp que não é número', forgeIdToken({ sub: 'c1', exp: '1' })],
  ])('rejeita token %s', (_case, token) => {
    expect(readIdTokenClaims(token)).toBeUndefined()
  })
})

describe('isIdTokenFresh', () => {
  const claims = { sub: 'c1', exp: 1000, name: '' }

  it('vale antes da expiração menos a folga', () => {
    expect(isIdTokenFresh(claims, 969, 30)).toBe(true)
  })

  it('não vale dentro da folga', () => {
    expect(isIdTokenFresh(claims, 970, 30)).toBe(false)
  })
})
