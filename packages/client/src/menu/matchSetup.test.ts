import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/jsonStore.ts'
import { createMatchSetupStore, MATCH_SETUP_SPEC, matchPlanOf, QUICK_MATCH } from './matchSetup.ts'

describe('matchSetup', () => {
  it('a partida rápida é o mapa padrão, a sala cheia de bots e o nível normal', () => {
    expect(matchPlanOf(QUICK_MATCH)).toEqual({
      arenaId: 'neon-kaido',
      privateRoom: false,
      botCount: 3,
      botDifficulty: 'normal',
    })
  })

  it('a escolha da nova partida vira o plano da sala', () => {
    const plan = matchPlanOf({ ...QUICK_MATCH, private: 1, bots: 1, difficulty: 2 })
    expect(plan).toMatchObject({ privateRoom: true, botCount: 1, botDifficulty: 'hard' })
  })

  it('as linhas são as do pedido: mapa, privada, bots e dificuldade', () => {
    expect(MATCH_SETUP_SPEC.map((spec) => spec.label)).toEqual([
      'MAPA',
      'PRIVADA',
      'BOTS',
      'DIFICULDADE',
    ])
  })

  it('guarda e devolve a escolha; nada guardado é a partida rápida', () => {
    const store = createMatchSetupStore(createMemorySettingsStorage())
    expect(store.read()).toEqual(QUICK_MATCH)
    store.write({ ...QUICK_MATCH, bots: 0 })
    expect(store.read().bots).toBe(0)
  })
})
