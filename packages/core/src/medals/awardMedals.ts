import type { MedalsConfig } from '../config/gameplayConfig.ts'
import type { KillEvent } from '../scoring/killEvent.ts'
import { addPlayer, type Scoreboard } from '../scoring/scoreboard.ts'
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
  /** Pontos desta medalha, já descontado o degrau anterior da multikill. */
  readonly points: number
}

/**
 * A escada de multikill, do degrau mais baixo ao mais alto. Só o maior degrau
 * alcançado é concedido, e ele paga a **diferença** do anterior: a segunda
 * kill já pagou o `double-kill`, então a terceira paga o que falta para o
 * `triple-kill`. Sem isso, cinco kills encadeadas somariam 50 + 100 + 250 + 400.
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
  const earned = MEDAL_RULES.filter((rule) => rule.holds(subject, config)).map((rule) => rule.slug)
  for (const slug of keepHighest(earned)) {
    into.push({ medal: medalBySlug(slug), points: pointsFor(slug, config) })
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

function pointsFor(slug: MedalSlug, config: MedalsConfig): number {
  const step = MULTIKILL_LADDER.indexOf(slug)
  if (step < 0) return rarityBonus(medalBySlug(slug).rarity, config)
  const previous = MULTIKILL_LADDER[step - 1]
  return ladderValue(slug, config) - (previous ? ladderValue(previous, config) : 0)
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
