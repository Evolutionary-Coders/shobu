import { describe, expect, it } from 'vitest'
import {
  entryCallsignOf,
  entryLookOf,
  MAP_RELOAD_LIVE_GRACE_S,
  mapReloadHoldS,
  parseRoomEntryRequest,
} from './roomEntry.ts'

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

describe('mapReloadHoldS', () => {
  /**
   * Regressão: a espera era 45 s fixos da troca, e com o aquecimento de 12 s a
   * vaga vazia, sem bot, atravessava 33 s da partida valendo.
   */
  it('cobre o aquecimento e só a folga da partida valendo', () => {
    expect(mapReloadHoldS({ warmupS: 12 })).toBe(12 + MAP_RELOAD_LIVE_GRACE_S)
    expect(MAP_RELOAD_LIVE_GRACE_S).toBe(10)
  })
})

describe('entryCallsignOf', () => {
  /** Regressão: o nome só chegava por mensagem depois da entrada, e a vaga nova aparecia como AGENTE. */
  it('lê o nome que vem com o pedido, limpo como no menu', () => {
    expect(entryCallsignOf({ kind: 'quick', arenaId: 'neon-kaido', callsign: ' raiden ' })).toBe(
      'RAIDEN',
    )
  })

  it.each([null, 'texto', {}, { callsign: 42 }])('sem nome em %j, devolve vazio', (body) => {
    expect(entryCallsignOf(body)).toBe('')
  })
})

describe('entryLookOf', () => {
  /** Regressão: o visual só chegava por mensagem, e a vaga nova aparecia com o corpo padrão. */
  it('lê a skin e o acabamento que vêm com o pedido', () => {
    const body = {
      kind: 'quick',
      arenaId: 'neon-kaido',
      characterSkin: 'vex',
      sniperFinish: 'carbono',
    }
    expect(entryLookOf(body)).toEqual({ characterSkin: 'vex', sniperFinish: 'carbono' })
  })

  it('deixa de fora cada campo que não vale, sem perder o outro', () => {
    expect(entryLookOf({ characterSkin: 'robo', sniperFinish: 'carbono' })).toEqual({
      sniperFinish: 'carbono',
    })
    expect(entryLookOf({ characterSkin: 'nova', sniperFinish: '<x>' })).toEqual({
      characterSkin: 'nova',
    })
  })

  it.each([null, 'texto', {}])('sem visual em %j, devolve vazio', (body) => {
    expect(entryLookOf(body)).toEqual({})
  })
})
