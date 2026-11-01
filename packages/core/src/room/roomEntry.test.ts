import { describe, expect, it } from 'vitest'
import { parseRoomEntryRequest } from './roomEntry.ts'

describe('parseRoomEntryRequest', () => {
  it('lê a entrada por endereço, na forma canônica', () => {
    expect(
      parseRoomEntryRequest({ kind: 'address', address: '10.0.0.07', arenaId: 'neon-kaido' }),
    ).toEqual({ kind: 'address', address: '10.0.0.7', arenaId: 'neon-kaido' })
  })

  it('lê a partida rápida, sem endereço', () => {
    expect(parseRoomEntryRequest({ kind: 'quick', arenaId: 'ichiban-gai' })).toEqual({
      kind: 'quick',
      arenaId: 'ichiban-gai',
    })
  })

  it.each(['public', 'private'] as const)('lê a criação de sala %s', (visibility) => {
    expect(parseRoomEntryRequest({ kind: 'create', visibility, arenaId: 'neon-kaido' })).toEqual({
      kind: 'create',
      visibility,
      arenaId: 'neon-kaido',
    })
  })

  /** A aba aberta antes desta mudança manda `{ address, arenaId }`, sem `kind`. */
  it('lê o corpo antigo, sem kind, como entrada por endereço', () => {
    expect(parseRoomEntryRequest({ address: '203.0.113.7', arenaId: 'neon-kaido' })).toEqual({
      kind: 'address',
      address: '203.0.113.7',
      arenaId: 'neon-kaido',
    })
  })

  it('sem mapa em texto, deixa o mapa vazio para o servidor usar o padrão', () => {
    expect(parseRoomEntryRequest({ kind: 'quick', arenaId: 7 })).toEqual({
      kind: 'quick',
      arenaId: '',
    })
  })

  it.each([
    ['um kind desconhecido', { kind: 'random', arenaId: 'neon-kaido' }],
    ['uma visibilidade desconhecida', { kind: 'create', visibility: 'secreta' }],
    ['a criação sem visibilidade', { kind: 'create' }],
    ['um endereço inválido', { kind: 'address', address: '300.0.0.1' }],
    ['um endereço que não é texto', { address: 203 }],
    ['um objeto sem kind nem endereço', { arenaId: 'neon-kaido' }],
    ['null', null],
    ['um texto', '203.0.113.7'],
  ])('recusa %s', (_label, body) => {
    expect(parseRoomEntryRequest(body)).toBeUndefined()
  })
})
