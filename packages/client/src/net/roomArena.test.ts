import { describe, expect, it } from 'vitest'
import { arenaToFollow, roomArenaFor } from './roomArena.ts'

const CATALOG = ['neon-kaido', 'ichiban-gai']

describe('arenaToFollow', () => {
  /** Regressão: com o Ichiban-gai guardado no menu, o spawn do servidor caía fora do mapa. */
  it('pede o mapa da sala quando o cliente subiu outro', () => {
    expect(arenaToFollow('neon-kaido', 'ichiban-gai', CATALOG)).toBe('neon-kaido')
  })

  it('não pede nada quando o mapa já é o da sala', () => {
    expect(arenaToFollow('neon-kaido', 'neon-kaido', CATALOG)).toBeUndefined()
  })

  it('não pede um mapa que este cliente não conhece', () => {
    expect(arenaToFollow('mapa-novo', 'neon-kaido', CATALOG)).toBeUndefined()
  })
})

describe('roomArenaFor', () => {
  it('segue o mapa de agora da sala', () => {
    expect(roomArenaFor({ arenaId: 'neon-kaido', nextArenaId: undefined }, 'ichiban-gai')).toBe(
      'neon-kaido',
    )
  })

  /** Regressão: quem entrava no intervalo com o mapa seguinte recarregava no que a sala deixava. */
  it('com o voto fechado no mapa subido, fica nele', () => {
    const view = { arenaId: 'neon-kaido', nextArenaId: 'ichiban-gai' }
    expect(roomArenaFor(view, 'ichiban-gai')).toBe('ichiban-gai')
  })

  /** Quem já está na sala recarrega na partida seguinte, com a vaga segura, e não antes. */
  it('com o voto fechado em outro mapa, segue o de agora', () => {
    const view = { arenaId: 'neon-kaido', nextArenaId: 'ichiban-gai' }
    expect(roomArenaFor(view, 'neon-kaido')).toBe('neon-kaido')
  })

  it('antes do estado da sala, o mapa subido', () => {
    expect(roomArenaFor(undefined, 'neon-kaido')).toBe('neon-kaido')
  })
})
