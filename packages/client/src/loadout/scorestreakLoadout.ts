import {
  DEFAULT_SCORESTREAK_LOADOUT,
  SCORESTREAK_CATALOG,
  type Scorestreak,
  type ScorestreakSlug,
} from '@shobu/core'
import type { ChoiceAdjuster } from '../menu/choiceScreen.ts'
import {
  type ChoiceSpec,
  type ChoiceValues,
  parseChoices,
  stepChoice,
} from '../menu/choiceTable.ts'
import { createJsonStore, type JsonStore, type SettingsStorage } from '../settings/jsonStore.ts'

/**
 * As três séries de pontuação que o jogador leva (ADR 0029), como a tela das
 * SÉRIES DE PONTUAÇÃO as guarda: três linhas que giram pelo catálogo inteiro, e
 * o valor de cada uma é o índice no `SCORESTREAK_CATALOG`.
 *
 * Três linhas, e não doze caixas de marcar: assim "exatamente três" vale por
 * construção — não existe o estado de duas escolhidas para tratar —, e a tela
 * reaproveita a tabela de escolhas da NOVA PARTIDA e da EDITAR CLASSE, com a
 * mesma seta no teclado, no controle e no toque.
 */
export type ScorestreakChoiceKey = 'first' | 'second' | 'third'

export type ScorestreakChoice = ChoiceValues<ScorestreakChoiceKey>

const SCORESTREAK_LABELS = SCORESTREAK_CATALOG.map((streak) => streak.label)

/** O padrão de cada linha sai do padrão do core: escrito à mão aqui, divergiria. */
function defaultSlotIndex(slot: number): number {
  return SCORESTREAK_CATALOG.findIndex(
    (streak) => streak.slug === DEFAULT_SCORESTREAK_LOADOUT[slot],
  )
}

export const SCORESTREAK_CHOICE_SPEC: readonly ChoiceSpec<ScorestreakChoiceKey>[] = [
  { key: 'first', label: 'SÉRIE 1', choices: SCORESTREAK_LABELS, fallback: defaultSlotIndex(0) },
  { key: 'second', label: 'SÉRIE 2', choices: SCORESTREAK_LABELS, fallback: defaultSlotIndex(1) },
  { key: 'third', label: 'SÉRIE 3', choices: SCORESTREAK_LABELS, fallback: defaultSlotIndex(2) },
]

/**
 * A seta numa linha das séries: anda como o `stepChoice`, mas **pula** o que
 * outra linha já leva, porque a mesma série duas vezes não existe. Sem livre
 * até a ponta, nada se move — para na ponta, como o resto do menu.
 *
 * ```ts
 * // PING (2) na linha 1 e ECO (0) na 2: a seta para a esquerda na 1 pula o ECO
 * stepScorestreakChoice({ first: 2, second: 0, third: 9 }, SCORESTREAK_CHOICE_SPEC, 'first', -1).first // 1
 * ```
 */
export const stepScorestreakChoice: ChoiceAdjuster<ScorestreakChoiceKey> = (
  values,
  specs,
  key,
  direction,
) => {
  const taken = new Set(specs.filter((spec) => spec.key !== key).map((spec) => values[spec.key]))
  let next = stepChoice(values, specs, key, direction)
  while (taken.has(next[key])) {
    const further = stepChoice(next, specs, key, direction)
    if (further[key] === next[key]) return values
    next = further
  }
  return next
}

/**
 * Lê a escolha guardada e **nunca lança**, como o `parseChoices`: o
 * armazenamento não é de confiança. Três índices que não são distintos — o
 * jogador mexeu no json, ou o catálogo encolheu — voltam ao padrão inteiro,
 * em vez de adivinhar qual linha manter.
 *
 * ```ts
 * parseScorestreakChoice({ first: 0, second: 0, third: 0 }) // o padrão
 * ```
 */
export function parseScorestreakChoice(raw: unknown): ScorestreakChoice {
  const parsed = parseChoices(raw, SCORESTREAK_CHOICE_SPEC)
  const picked = SCORESTREAK_CHOICE_SPEC.map((spec) => parsed[spec.key])
  if (new Set(picked).size === picked.length) return parsed
  return parseChoices(null, SCORESTREAK_CHOICE_SPEC)
}

/**
 * Os slugs da escolha, na ordem dos slots: é o que a partida e a rede recebem.
 *
 * ```ts
 * scorestreakLoadoutOf(parseScorestreakChoice(null)) // ['ping', 'rapid-bolt', 'emp']
 * ```
 */
export function scorestreakLoadoutOf(choice: ScorestreakChoice): readonly ScorestreakSlug[] {
  // a escolha vem do `parseScorestreakChoice` ou da seta, que recortam na lista.
  return SCORESTREAK_CHOICE_SPEC.map(
    (spec) => (SCORESTREAK_CATALOG[choice[spec.key]] as Scorestreak).slug,
  )
}

/** Onde as séries moram no armazenamento. */
export const SCORESTREAK_CHOICE_KEY = 'shobu.scorestreaks'

/**
 * ```ts
 * const store = createScorestreakChoiceStore(window.localStorage)
 * store.write({ ...store.read(), first: 0 })
 * ```
 */
export function createScorestreakChoiceStore(
  storage: SettingsStorage,
): JsonStore<ScorestreakChoice> {
  return createJsonStore(storage, SCORESTREAK_CHOICE_KEY, parseScorestreakChoice)
}
