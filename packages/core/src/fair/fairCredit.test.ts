import { describe, expect, it } from 'vitest'
import type { MatchSummaryRow } from '../match/matchSummary.ts'
import {
  DEFAULT_FAIR_CREDIT_URL,
  type FairCreditRules,
  fairCreditOf,
  fairCreditRulesFrom,
} from './fairCredit.ts'

const RULES: FairCreditRules = {
  serverToken: 'segredo',
  pointsPerBrick: 500,
  mvpBonus: 2,
  creditCap: 10,
  creditUrl: DEFAULT_FAIR_CREDIT_URL,
}

function rowWith(points: number): MatchSummaryRow {
  return {
    playerId: 'ana',
    points,
    kills: 0,
    deaths: 0,
    kd: 0,
    accuracy: 0,
    bestStreak: 0,
    medals: 0,
  }
}

describe('fairCreditOf', () => {
  it('paga um tijolinho a cada pointsPerBrick, arredondado para baixo', () => {
    expect(fairCreditOf(rowWith(1499), false, RULES)).toBe(2)
  })

  it('soma o bônus do MVP', () => {
    expect(fairCreditOf(rowWith(1200), true, RULES)).toBe(4)
  })

  it('não passa do teto, bônus incluído', () => {
    expect(fairCreditOf(rowWith(9000), true, RULES)).toBe(10)
  })

  it('nada para quem não pontuou nem foi MVP', () => {
    expect(fairCreditOf(rowWith(0), false, RULES)).toBe(0)
  })

  /** Regressão do review do PR #38: a sala parada pagava o bônus ao primeiro do resumo. */
  it('o MVP sem ponto não ganha o bônus, e a pontuação negativa não desconta', () => {
    expect(fairCreditOf(rowWith(0), true, RULES)).toBe(0)
    expect(fairCreditOf(rowWith(-300), true, RULES)).toBe(0)
    expect(fairCreditOf(rowWith(1), true, RULES)).toBe(2)
  })
})

describe('fairCreditRulesFrom', () => {
  it('desliga o crédito sem FAIR_SERVER_TOKEN', () => {
    expect(fairCreditRulesFrom({})).toBeUndefined()
    expect(fairCreditRulesFrom({ FAIR_SERVER_TOKEN: ' ' })).toBeUndefined()
  })

  it('usa os padrões com só o token, sem os espaços da linha do .env', () => {
    expect(fairCreditRulesFrom({ FAIR_SERVER_TOKEN: ' segredo ' })).toEqual(RULES)
  })

  it('a linha vazia no .env vale o padrão', () => {
    expect(fairCreditRulesFrom({ FAIR_SERVER_TOKEN: 'segredo', FAIR_MVP_BONUS: '' })).toEqual(RULES)
  })

  it('lê cada valor do ambiente', () => {
    const env = {
      FAIR_SERVER_TOKEN: 'outro',
      FAIR_POINTS_PER_BRICK: '250',
      FAIR_MVP_BONUS: '0',
      FAIR_CREDIT_CAP: '5',
      FAIR_CREDIT_URL: 'http://localhost:9999/credit',
    }
    expect(fairCreditRulesFrom(env)).toEqual({
      serverToken: 'outro',
      pointsPerBrick: 250,
      mvpBonus: 0,
      creditCap: 5,
      creditUrl: 'http://localhost:9999/credit',
    })
  })

  it.each([
    ['FAIR_POINTS_PER_BRICK', '0'],
    ['FAIR_MVP_BONUS', '-1'],
    ['FAIR_CREDIT_CAP', '2.5'],
    ['FAIR_CREDIT_URL', 'feira.dev'],
  ])('rejeita %s=%j citando o valor', (name, text) => {
    expect(() => fairCreditRulesFrom({ FAIR_SERVER_TOKEN: 'segredo', [name]: text })).toThrow(
      `${name}='${text}'`,
    )
  })
})
