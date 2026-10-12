import type { MenuCommand } from './mainMenuModel.ts'

/**
 * O que um clique numa linha do menu manda: a seta ‹ › tocada ajusta, o resto
 * da linha confirma — e o clique **dentro do campo de texto** não manda nada.
 *
 * O campo do nome mora dentro de uma linha, e o clique nele sobe até ela. O
 * navegador já focou o campo no `mousedown`; confirmar a linha em seguida caía
 * em `holdsForNameField`, que fecha o campo que o dedo acabou de abrir. O campo
 * é dele mesmo: a linha só seleciona.
 *
 * ```ts
 * rowClickCommandOf({ inTextField: true, step: undefined }) // null: o campo cuida
 * rowClickCommandOf({ inTextField: false, step: 'left' }) // 'left'
 * ```
 */
export function rowClickCommandOf(click: {
  readonly inTextField: boolean
  readonly step: string | undefined
}): MenuCommand | null {
  if (click.inTextField) return null
  return click.step === 'left' || click.step === 'right' ? click.step : 'activate'
}
