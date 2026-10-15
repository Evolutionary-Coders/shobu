import { describe, expect, it } from 'vitest'
import { arenaAt, arenaWanted, createRoomArenas } from './roomArenas.ts'

const arenas = createRoomArenas('neon-kaido', ['neon-kaido', 'ichiban-gai'])

describe('arenaWanted', () => {
  it('aceita o mapa do catálogo que o cliente subiu', () => {
    expect(arenaWanted(arenas, { arenaId: 'ichiban-gai' })).toBe('ichiban-gai')
  })

  /** Vem da rede: o que não é mapa do catálogo vira o padrão. */
  it.each([{ arenaId: 'mapa-falso' }, { arenaId: 7 }, {}, undefined])(
    'com %j, é o padrão',
    (body) => {
      expect(arenaWanted(arenas, body)).toBe('neon-kaido')
    },
  )
})

describe('arenaAt', () => {
  it('é o mapa com que a sala foi criada, e o padrão para uma desconhecida', () => {
    const local = createRoomArenas('neon-kaido', ['neon-kaido', 'ichiban-gai'])
    local.byAddress.set('203.0.113.7', 'ichiban-gai')
    expect(arenaAt(local, '203.0.113.7')).toBe('ichiban-gai')
    expect(arenaAt(local, '198.51.100.9')).toBe('neon-kaido')
  })
})
