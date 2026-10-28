import { describe, expect, it } from 'vitest'
import { MATCH_SEED_BASE } from '../match/fighterShot.ts'
import { pickBotScorestreaks } from './botScorestreaks.ts'
import { parseScorestreakLoadout } from './scorestreakSlots.ts'

describe('pickBotScorestreaks', () => {
  it('cada vaga leva três séries que a validação da rede aceita', () => {
    for (let botIndex = 0; botIndex < 8; botIndex += 1) {
      const picked = pickBotScorestreaks(MATCH_SEED_BASE, botIndex)
      expect(parseScorestreakLoadout([...picked])).toEqual(picked)
    }
  })

  it('a mesma semente e a mesma vaga dão as mesmas séries, no cliente e no servidor', () => {
    expect(pickBotScorestreaks(MATCH_SEED_BASE, 3)).toEqual(pickBotScorestreaks(MATCH_SEED_BASE, 3))
  })

  it('vagas diferentes não levam todas a mesma escolha', () => {
    const picks = new Set(
      [0, 1, 2, 3, 4, 5].map((botIndex) => pickBotScorestreaks(MATCH_SEED_BASE, botIndex).join()),
    )
    expect(picks.size).toBeGreaterThan(1)
  })
})
