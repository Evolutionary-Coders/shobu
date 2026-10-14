import { type ChoiceSpec, type ChoiceValues, stepChoice } from './choiceTable.ts'
import type { MenuCommand } from './mainMenuModel.ts'

/**
 * Um passo numa tela de escolhas — a NOVA PARTIDA e a EDITAR CLASSE: as linhas
 * da tabela, que a seta lateral ajusta, e embaixo as linhas de ação
 * (COMEÇAR, VOLTAR), que o confirmar aciona.
 */
export interface ChoiceScreenStep<Key extends string> {
  readonly index: number
  readonly values: ChoiceValues<Key>
  /** A linha de ação confirmada, contada a partir da primeira; `undefined` quando nenhuma. */
  readonly action: number | undefined
  /** Esc ou B: sair da tela, como VOLTAR. */
  readonly leave: boolean
}

/** A tela, como o passo a vê: onde está o cursor, os valores, e quantas linhas de ação. */
export interface ChoiceScreen<Key extends string> {
  readonly index: number
  readonly values: ChoiceValues<Key>
  readonly specs: readonly ChoiceSpec<Key>[]
  readonly actionCount: number
}

/**
 * ```ts
 * stepChoiceScreen({ index: 2, values, specs: MATCH_SETUP_SPEC, actionCount: 2 }, 'left').values.bots // 2
 * ```
 */
export function stepChoiceScreen<Key extends string>(
  screen: ChoiceScreen<Key>,
  command: MenuCommand,
): ChoiceScreenStep<Key> {
  const still = { index: screen.index, values: screen.values, action: undefined, leave: false }
  if (command === 'back') return { ...still, leave: true }
  if (command === 'up' || command === 'down')
    return { ...still, index: moveCursor(screen, command) }
  if (command === 'left' || command === 'right') {
    return { ...still, values: adjustRow(screen, command === 'left' ? -1 : 1) }
  }
  return { ...still, action: actionAt(screen) }
}

/** Para nas pontas, como o resto do menu. */
function moveCursor<Key extends string>(screen: ChoiceScreen<Key>, command: 'up' | 'down'): number {
  const next = command === 'up' ? screen.index - 1 : screen.index + 1
  return Math.min(choiceScreenRows(screen.specs, screen.actionCount) - 1, Math.max(0, next))
}

/** A seta só vale numa linha de escolha; nas de ação ela não faz nada. */
function adjustRow<Key extends string>(
  screen: ChoiceScreen<Key>,
  direction: -1 | 1,
): ChoiceValues<Key> {
  const spec = screen.specs[screen.index]
  if (!spec) return screen.values
  return stepChoice(screen.values, screen.specs, spec.key, direction)
}

/** Confirmar numa linha de escolha não faz nada: quem ajusta é a seta. */
function actionAt<Key extends string>(screen: ChoiceScreen<Key>): number | undefined {
  const action = screen.index - screen.specs.length
  return action >= 0 ? action : undefined
}

/**
 * O total de linhas, para o clique e o `index.html` concordarem.
 *
 * ```ts
 * choiceScreenRows(MATCH_SETUP_SPEC, 2) // 6
 * ```
 */
export function choiceScreenRows<Key extends string>(
  specs: readonly ChoiceSpec<Key>[],
  actionCount: number,
): number {
  return specs.length + actionCount
}
