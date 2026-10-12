import { describe, expect, it } from 'vitest'
import { arenaChoiceAt, MATCH_ARENAS } from './arenaChoices.ts'

describe('arenaChoices', () => {
  it('o mapa padrão é o Neon-kaidō, e índice que não existe cai nele', () => {
    expect(MATCH_ARENAS[0]?.id).toBe('neon-kaido')
    expect(arenaChoiceAt(7).id).toBe('neon-kaido')
  })

  it('o Ichiban-gai continua na lista', () => {
    expect(arenaChoiceAt(1).id).toBe('ichiban-gai')
  })
})
