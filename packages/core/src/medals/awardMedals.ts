import type { MedalsConfig } from '../config/gameplayConfig.ts'
import type { KillEvent } from '../scoring/killEvent.ts'
import { addPlayer, killsWithin, type PlayerScore, type Scoreboard } from '../scoring/scoreboard.ts'
import { type Medal, type MedalRarity, type MedalSlug, medalBySlug } from './medalCatalog.ts'
import { MEDAL_RULES, type MedalSubject } from './medalRules.ts'

/**
 * As medalhas de uma kill, já com as duas regras de acúmulo aplicadas, e os
 * pontos creditados no placar.
 *
 * **Roda antes de `applyKill`**, e não depois: as condições leem o estado
 * anterior à kill — a sequência da vítima, a contagem da partida e o anel de
 * multikill —, e `applyKill` é justamente quem muda os três. A soma no placar
 * é a mesma nas duas ordens.
 *
 * ```ts
 * const bonus = awardMedals(board, kill, config.medals, medals)
 * applyKill(board, kill, config.match.pointsPerKill)
 * ```
 */
export interface MedalAward {
  readonly medal: Medal
  /** Pontos desta medalha, já descontado o que a escada de multikill já pagou. */
  readonly points: number
}

/**
 * A escada de multikill, do degrau mais baixo ao mais alto. Só o maior degrau
 * alcançado é concedido, e ele paga a diferença para o que a sequência **já
 * pagou** (`PlayerScore.multiKillPaid`). Sem isso, cinco kills encadeadas
 * somariam 50 + 100 + 250 + 400.
 *
 * Descontar o degrau *imediatamente anterior* não serve, e é sutil: as janelas
 * não são encaixadas — 5, 8, 12 e 15 s —, então kills em 0, 1, 2, 14 e 15 s
 * alcançam o `kill-chain` sem nunca terem alcançado o `overkill`, e descontar
 * um degrau que ninguém pagou paga 250 pelo que a `docs/medals.md` fixa em 400.
 */
const MULTIKILL_LADDER: readonly MedalSlug[] = [
  'double-kill',
  'triple-kill',
  'overkill',
  'kill-chain',
]

/**
 * Quem implica quem. Medalha implicada não é concedida nem aparece no feed —
 * um `360-no-scope` já **é** um `no-scope` aéreo, e listar os três seria pagar
 * três vezes pela mesma jogada.
 */
const IMPLIES: Readonly<Partial<Record<MedalSlug, readonly MedalSlug[]>>> = {
  '360-no-scope': ['no-scope', 'airborne'],
  'longshot-no-scope': ['no-scope'],
  backstab: ['knife'],
}

export function awardMedals(
  board: Scoreboard,
  event: Readonly<KillEvent>,
  config: MedalsConfig,
  into: MedalAward[],
): readonly MedalAward[] {
  into.length = 0
  if (event.shooterId === event.victimId) return into
  const subject = subjectOf(board, event)
  resetLapsedChain(subject.shooter, event.atS, config)
  const earned = MEDAL_RULES.filter((rule) => rule.holds(subject, config)).map((rule) => rule.slug)
  for (const slug of keepHighest(earned)) {
    into.push({ medal: medalBySlug(slug), points: pointsFor(slug, subject.shooter, config) })
  }
  addPlayer(board, event.shooterId).points += into.reduce((sum, award) => sum + award.points, 0)
  return into
}

function subjectOf(board: Scoreboard, event: Readonly<KillEvent>): MedalSubject {
  return {
    event,
    shooter: addPlayer(board, event.shooterId),
    victim: addPlayer(board, event.victimId),
    matchKillsBefore: board.kills,
  }
}

/**
 * As duas regras de acúmulo, na mesma passada: da família de multikill fica só
 * o degrau mais alto, e toda medalha implicada por outra concedida sai.
 */
function keepHighest(earned: readonly MedalSlug[]): readonly MedalSlug[] {
  const topStep = MULTIKILL_LADDER.filter((slug) => earned.includes(slug)).at(-1)
  const kept = earned.filter((slug) => !MULTIKILL_LADDER.includes(slug) || slug === topStep)
  const implied = new Set(kept.flatMap((slug) => IMPLIES[slug] ?? []))
  return kept.filter((slug) => !implied.has(slug))
}

function pointsFor(slug: MedalSlug, shooter: PlayerScore, config: MedalsConfig): number {
  if (!MULTIKILL_LADDER.includes(slug)) return rarityBonus(medalBySlug(slug).rarity, config)
  const value = ladderValue(slug, config)
  const payout = Math.max(0, value - shooter.multiKillPaid)
  shooter.multiKillPaid = Math.max(shooter.multiKillPaid, value)
  return payout
}

/**
 * A sequência acabou quando nem a janela mais larga alcança a kill anterior; aí
 * a escada recomeça do chão. Sem este zeramento, um `double-kill` isolado meia
 * hora depois de um `kill-chain` pagaria zero.
 */
function resetLapsedChain(shooter: PlayerScore, atS: number, config: MedalsConfig): void {
  if (killsWithin(shooter, atS, config.killChainWindowS) === 0) shooter.multiKillPaid = 0
}

function ladderValue(slug: MedalSlug, config: MedalsConfig): number {
  if (slug === 'kill-chain') return config.bonusKillChain
  return rarityBonus(medalBySlug(slug).rarity, config)
}

function rarityBonus(rarity: MedalRarity, config: MedalsConfig): number {
  if (rarity === 'comum') return config.bonusComum
  if (rarity === 'incomum') return config.bonusIncomum
  if (rarity === 'rara') return config.bonusRara
  return config.bonusLendaria
}

/** O vetor reaproveitado, como o do `rankedScores`: uma kill por tick. */
export function createMedalAwards(): MedalAward[] {
  return []
}
