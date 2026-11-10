import {
  type GameplayConfig,
  SCORESTREAK_CATALOG,
  type ScorestreakSlug,
  type ScorestreakTier,
  scorestreakCost,
} from '@shobu/core'
import { SCORESTREAK_BLURBS } from './scorestreakBlurbs.ts'
import { SCORESTREAK_CHOICE_SPEC, type ScorestreakChoice } from './scorestreakLoadout.ts'

/**
 * A miniatura da série, desenhada por `scripts/build-scorestreak-icons.mjs`. O
 * menu e o visor leem o mesmo svg: chapado, ele é nítido nos 48 px do hud e
 * nos 128 px do menu sem um segundo arquivo.
 *
 * ```ts
 * scorestreakIconUrl('ping') // '/assets/images/scorestreaks/ping.svg'
 * ```
 */
export function scorestreakIconUrl(slug: ScorestreakSlug): string {
  return `/assets/images/scorestreaks/${slug}.svg`
}

/**
 * Um cartão da tela das SÉRIES DE PONTUAÇÃO, no desenho do black ops 2: a
 * miniatura, o nome, o custo e o peso, e se a série está numa das três linhas.
 */
export interface ScorestreakCard {
  readonly slug: ScorestreakSlug
  readonly label: string
  readonly tier: ScorestreakTier
  readonly cost: number
  readonly iconUrl: string
  /** A linha que leva a série, de 0 a 2, ou `null` fora da escolha. */
  readonly slot: number | null
  /** É a série da linha em foco: o cartão que a seta está trocando. */
  readonly focused: boolean
  /** O que a série faz, numa linha (`SCORESTREAK_BLURBS`). */
  readonly blurb: string
}

/**
 * Os sete cartões, na ordem do catálogo — que já é a do peso, então a grade
 * sai com uma fileira por peso. `rowIndex` é o cursor da tela: na linha do
 * VOLTAR, nenhum cartão fica em foco.
 *
 * ```ts
 * scorestreakCardsOf(parseScorestreakChoice(null), 0, config.scorestreaks)[2]
 * // { slug: 'ping', label: 'PING', tier: 'leve', cost: 400, slot: 0, focused: true, ... }
 * ```
 */
export function scorestreakCardsOf(
  choice: ScorestreakChoice,
  rowIndex: number,
  costs: GameplayConfig['scorestreaks'],
): readonly ScorestreakCard[] {
  const picked = SCORESTREAK_CHOICE_SPEC.map((spec) => choice[spec.key])
  const focusKey = SCORESTREAK_CHOICE_SPEC[rowIndex]?.key
  const focused = focusKey === undefined ? -1 : choice[focusKey]
  return SCORESTREAK_CATALOG.map((streak, index) => {
    const slot = picked.indexOf(index)
    return {
      slug: streak.slug,
      label: streak.label,
      tier: streak.tier,
      cost: scorestreakCost(streak.slug, costs),
      iconUrl: scorestreakIconUrl(streak.slug),
      slot: slot === -1 ? null : slot,
      focused: index === focused,
      blurb: SCORESTREAK_BLURBS[streak.slug],
    }
  })
}
