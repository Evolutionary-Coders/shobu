import { describe, expect, it } from 'vitest'
import { arenaChoiceAt, MATCH_ARENAS } from './arenaChoices.ts'

describe('arenaChoices', () => {
  it('o mapa padrão é o Ichiban-gai, e índice que não existe cai nele', () => {
    expect(MATCH_ARENAS[0]?.id).toBe('ichiban-gai')
    expect(arenaChoiceAt(7).id).toBe('ichiban-gai')
  })

  it('oferece o Neon-kaidō do catálogo', () => {
    expect(MATCH_ARENAS.map((arena) => arena.id)).toContain('neon-kaido')
  })
})
