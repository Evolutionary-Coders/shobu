/**
 * O lema, sob o logo. Uma sentença só.
 *
 * Não passa pelo `TerminalPrinter`: isto não é saída de boot, é parte do lockup
 * do título — o bloco de créditos do cartaz — e chega inteiro com o slam em vez
 * de ser datilografado.
 *
 * Já foram três frases separadas por `//`, e três frases não são um lema: são
 * uma lista de features. Um lema desafia quem lê, e cabe numa linha.
 *
 * ```ts
 * buildTagline() // 'AQUI NINGUÉM ERRA DUAS VEZES'
 * ```
 */
export function buildTagline(): string {
  return 'AQUI NINGUÉM ERRA DUAS VEZES'
}
