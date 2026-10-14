import { describe, expect, it } from 'vitest'
import { arenaToFollow } from './roomArena.ts'

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
