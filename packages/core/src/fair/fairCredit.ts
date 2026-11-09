import type { DeployEnv } from '../config/deploySettings.ts'
import type { MatchSummaryRow } from '../match/matchSummary.ts'

/**
 * Quanto a partida paga em tijolinhos, a moeda da Feira de Jogos (ADR 0036).
 * Valores baixos de propósito: o jogo é um entre vários na feira, e o crédito
 * é um agrado por jogar, não um prêmio.
 */
export interface FairCreditRules {
  /** O id do shobu no banco da Feira, o `product` do POST de crédito. */
  readonly productId: number
  /** Um tijolinho a cada tantos pontos da partida, arredondado para baixo. */
  readonly pointsPerBrick: number
  /** O que o MVP ganha a mais. */
  readonly mvpBonus: number
  /** O máximo de um jogador numa partida, bônus incluído. */
  readonly creditCap: number
  /** O endpoint de crédito da Feira. */
  readonly creditUrl: string
}

export const DEFAULT_FAIR_CREDIT_URL = 'https://feira-de-jogos.dev.br/api/v2/credit'

const DEFAULT_POINTS_PER_BRICK = 500
const DEFAULT_MVP_BONUS = 2
const DEFAULT_CREDIT_CAP = 10

/**
 * Os tijolinhos de uma linha do resumo da partida.
 *
 * ```ts
 * fairCreditOf({ ...row, points: 1200 }, true, rules) // 2 + 2 = 4
 * ```
 */
export function fairCreditOf(
  row: Readonly<MatchSummaryRow>,
  isMvp: boolean,
  rules: Readonly<FairCreditRules>,
): number {
  const earned = Math.floor(Math.max(0, row.points) / rules.pointsPerBrick)
  const bonus = isMvp ? rules.mvpBonus : 0
  return Math.min(rules.creditCap, earned + bonus)
}

/**
 * As regras do crédito lidas do ambiente (`.env.example`). Sem
 * `FAIR_PRODUCT_ID` não há para quem creditar, e a volta é `undefined`: o
 * jogo roda sem crédito. Valor fora de forma para o processo citando-o, como
 * `portSetting`: cair no padrão em silêncio pagaria errado a feira inteira.
 *
 * ```ts
 * const rules = fairCreditRulesFrom(process.env)
 * ```
 */
export function fairCreditRulesFrom(env: DeployEnv): FairCreditRules | undefined {
  if (env.FAIR_PRODUCT_ID === undefined || env.FAIR_PRODUCT_ID === '') return undefined
  return {
    productId: countSetting(env, 'FAIR_PRODUCT_ID', 0, 1),
    pointsPerBrick: countSetting(env, 'FAIR_POINTS_PER_BRICK', DEFAULT_POINTS_PER_BRICK, 1),
    mvpBonus: countSetting(env, 'FAIR_MVP_BONUS', DEFAULT_MVP_BONUS, 0),
    creditCap: countSetting(env, 'FAIR_CREDIT_CAP', DEFAULT_CREDIT_CAP, 0),
    creditUrl: urlSetting(env, 'FAIR_CREDIT_URL', DEFAULT_FAIR_CREDIT_URL),
  }
}

function countSetting(env: DeployEnv, name: string, fallback: number, min: number): number {
  const text = env[name]
  if (text === undefined || text === '') return fallback
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN
  if (Number.isSafeInteger(value) && value >= min) return value
  throw new Error(`${name}='${text}' inválida; esperado um inteiro a partir de ${min}`)
}

function urlSetting(env: DeployEnv, name: string, fallback: string): string {
  const text = env[name]
  if (text === undefined || text === '') return fallback
  if (/^https?:\/\/\S+$/.test(text)) return text
  throw new Error(`${name}='${text}' inválida; esperado uma url http(s)://`)
}
