/**
 * Uma tabela de escolhas do menu: cada linha é uma lista de rótulos, e o valor
 * guardado é o índice. É a forma da NOVA PARTIDA e da EDITAR CLASSE — mapa,
 * bots, arma, acabamento —, no molde do `playerSettingsSpec.ts`: o parser, o
 * menu e o teste leem a **mesma** tabela.
 */
export interface ChoiceSpec<Key extends string> {
  readonly key: Key
  /** O rótulo da linha, já em caixa alta. */
  readonly label: string
  /** Os rótulos de cada valor, na ordem da seta. Nunca vazio. */
  readonly choices: readonly string[]
  /** O índice do padrão. */
  readonly fallback: number
}

export type ChoiceValues<Key extends string> = Readonly<Record<Key, number>>

/**
 * O padrão de cada linha, montado da tabela: padrão repetido à mão é padrão
 * que diverge.
 *
 * ```ts
 * defaultChoices(MATCH_SETUP_SPEC).bots // 3
 * ```
 */
export function defaultChoices<Key extends string>(
  specs: readonly ChoiceSpec<Key>[],
): ChoiceValues<Key> {
  return Object.fromEntries(specs.map((spec) => [spec.key, spec.fallback])) as ChoiceValues<Key>
}

/**
 * Lê escolhas de origem desconhecida — o armazenamento do navegador — e
 * **nunca lança**, pelo mesmo motivo do `parsePlayerSettings`: campo ausente,
 * de tipo errado ou fora da lista cai no padrão da linha, e o resto é
 * aproveitado.
 *
 * ```ts
 * parseChoices({ bots: 9 }, MATCH_SETUP_SPEC).bots // 3, o maior que existe
 * ```
 */
export function parseChoices<Key extends string>(
  raw: unknown,
  specs: readonly ChoiceSpec<Key>[],
): ChoiceValues<Key> {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(
    specs.map((spec) => [spec.key, readChoice(record[spec.key], spec)]),
  ) as ChoiceValues<Key>
}

function readChoice<Key extends string>(value: unknown, spec: ChoiceSpec<Key>): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return spec.fallback
  return clampChoice(spec, value)
}

/** Recorta na lista em vez de recusar, como `clampToSpec`: 9 bots é "o máximo". */
function clampChoice<Key extends string>(spec: ChoiceSpec<Key>, value: number): number {
  return Math.min(spec.choices.length - 1, Math.max(0, value))
}

/**
 * Uma seta numa linha: anda um e **para** nas pontas, como o resto do menu.
 *
 * ```ts
 * stepChoice(values, MATCH_SETUP_SPEC, 'bots', -1).bots // 2
 * ```
 */
export function stepChoice<Key extends string>(
  values: ChoiceValues<Key>,
  specs: readonly ChoiceSpec<Key>[],
  key: Key,
  direction: -1 | 1,
): ChoiceValues<Key> {
  const spec = specFor(specs, key)
  return { ...values, [key]: clampChoice(spec, values[key] + direction) }
}

/** O rótulo do valor de uma linha, como a tela o escreve. */
export function choiceLabel<Key extends string>(
  specs: readonly ChoiceSpec<Key>[],
  key: Key,
  value: number,
): string {
  const spec = specFor(specs, key)
  return spec.choices[clampChoice(spec, value)] as string
}

function specFor<Key extends string>(specs: readonly ChoiceSpec<Key>[], key: Key): ChoiceSpec<Key> {
  const spec = specs.find((candidate) => candidate.key === key)
  if (!spec) {
    const known = specs.map((candidate) => candidate.key).join(', ')
    throw new RangeError(`a tabela de escolhas recebeu ${key}; esperado uma de ${known}`)
  }
  return spec
}
