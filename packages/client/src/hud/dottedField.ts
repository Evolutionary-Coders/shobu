/**
 * A espinha tipográfica das telas de terminal do jogo: rótulo, pontilhado até
 * uma coluna fixa, valor.
 *
 * O alinhamento **é** o desenho — é ele que faz a tela ler como instrumento em
 * vez de colagem. Por isso a coluna mora aqui e não em cada tela: o roteiro do
 * boot e o mostrador da transição precisam bater no mesmo pontilhado, senão as
 * duas telas parecem de jogos diferentes.
 */
const LABEL_COLUMN = 13

/**
 * ```ts
 * dottedField('CORTEX', 'SYN-7 / ONLINE') // 'CORTEX ....... SYN-7 / ONLINE'
 * ```
 */
export function dottedField(label: string, value: string): string {
  // pontos de código, não unidades de utf-16: `CORAÇÃO` tem que alinhar com
  // `ESPINHA`, e `.length` cru conta o acento como caractere em algumas formas.
  const dots = '.'.repeat(Math.max(2, LABEL_COLUMN - [...label].length))
  return `${label} ${dots} ${value}`
}
