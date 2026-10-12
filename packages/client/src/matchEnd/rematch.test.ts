import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/playerSettingsStore.ts'
import { createRematchStore, parseRematch, pendingRematch, rematchFor } from './rematch.ts'

describe('parseRematch', () => {
  it('aceita o pedido que ele mesmo escreveu', () => {
    expect(parseRematch({ arenaId: 'ichiban-gai', action: 'deploy' })).toEqual({
      arenaId: 'ichiban-gai',
      action: 'deploy',
    })
  })

  it.each([null, 'texto', { arenaId: 3, action: 'deploy' }, { arenaId: 'x', action: 'train' }, {}])(
    'recusa %j',
    (raw) => {
      expect(parseRematch(raw)).toBeNull()
    },
  )
})

describe('rematchFor', () => {
  it('a partida e a partida rápida voltam como entraram', () => {
    expect(rematchFor('deploy-match', 'ichiban-gai')?.action).toBe('deploy-match')
    expect(rematchFor('deploy-headset', 'neon-kaido')?.action).toBe('deploy-headset')
  })

  it('o treino não tem partida seguinte', () => {
    expect(rematchFor('train', 'neon-kaido')).toBeNull()
  })
})

describe('pendingRematch', () => {
  const asked = { arenaId: 'ichiban-gai', action: 'deploy' } as const

  it('vale para o mapa que a página subiu', () => {
    expect(pendingRematch(asked, 'ichiban-gai')).toBe(asked)
  })

  it('não vale para outro mapa, nem sem pedido', () => {
    expect(pendingRematch(asked, 'neon-kaido')).toBeNull()
    expect(pendingRematch(null, 'neon-kaido')).toBeNull()
  })
})

describe('createRematchStore', () => {
  it('guarda, lê e apaga', () => {
    const store = createRematchStore(createMemorySettingsStorage())
    expect(store.read()).toBeNull()
    store.write({ arenaId: 'ichiban-gai', action: 'deploy' })
    expect(store.read()).toEqual({ arenaId: 'ichiban-gai', action: 'deploy' })
    store.write(null)
    expect(store.read()).toBeNull()
  })
})
