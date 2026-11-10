import {
  DEFAULT_SCORESTREAK_LOADOUT,
  parseScorestreakLoadout,
  SCORESTREAK_CATALOG,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/jsonStore.ts'
import {
  createScorestreakChoiceStore,
  parseScorestreakChoice,
  SCORESTREAK_CHOICE_KEY,
  SCORESTREAK_CHOICE_SPEC,
  type ScorestreakChoice,
  scorestreakLoadoutOf,
  stepScorestreakChoice,
} from './scorestreakLoadout.ts'

const step = (values: ScorestreakChoice, key: 'first' | 'second' | 'third', direction: -1 | 1) =>
  stepScorestreakChoice(values, SCORESTREAK_CHOICE_SPEC, key, direction)

describe('scorestreakLoadout', () => {
  it('o padrão é o do core', () => {
    expect(scorestreakLoadoutOf(parseScorestreakChoice(null))).toEqual(DEFAULT_SCORESTREAK_LOADOUT)
  })

  it('cada linha gira pelo catálogo inteiro', () => {
    for (const spec of SCORESTREAK_CHOICE_SPEC) {
      expect(spec.choices).toEqual(SCORESTREAK_CATALOG.map((streak) => streak.label))
    }
  })

  it('a seta anda um quando o vizinho está livre', () => {
    expect(step({ first: 0, second: 5, third: 6 }, 'first', 1).first).toBe(1)
  })

  it('a seta pula o que outra linha já leva', () => {
    expect(step({ first: 3, second: 4, third: 0 }, 'first', 1).first).toBe(5)
    expect(step({ first: 4, second: 2, third: 1 }, 'first', -1).first).toBe(3)
    expect(step({ first: 3, second: 2, third: 1 }, 'first', -1).first).toBe(0)
  })

  it('sem livre até a ponta, nada se move', () => {
    const values = { first: 1, second: 0, third: 6 }
    expect(step(values, 'first', -1)).toBe(values)
    // depois do SONAR (5) só vem o PULSO EMP (6), que outra linha já leva.
    expect(step({ first: 5, second: 6, third: 0 }, 'first', 1).first).toBe(5)
  })

  it('na ponta, para sem repetir', () => {
    expect(step({ first: 0, second: 2, third: 1 }, 'first', -1).first).toBe(0)
  })

  it('lê a escolha guardada e recusa a repetida', () => {
    expect(parseScorestreakChoice({ first: 0, second: 1, third: 2 })).toEqual({
      first: 0,
      second: 1,
      third: 2,
    })
    expect(parseScorestreakChoice({ first: 4, second: 4, third: 1 })).toEqual(
      parseScorestreakChoice(null),
    )
  })

  it('os slugs da escolha passam na validação do core', () => {
    const loadout = scorestreakLoadoutOf({ first: 0, second: 5, third: 6 })
    expect(parseScorestreakLoadout(loadout)).toEqual(['echo', 'sonar', 'emp'])
  })

  it('guarda as séries na chave delas', () => {
    const storage = createMemorySettingsStorage()
    const store = createScorestreakChoiceStore(storage)
    store.write({ ...store.read(), first: 0 })
    expect(JSON.parse(storage.getItem(SCORESTREAK_CHOICE_KEY) ?? '{}').first).toBe(0)
    expect(store.read().first).toBe(0)
  })
})
