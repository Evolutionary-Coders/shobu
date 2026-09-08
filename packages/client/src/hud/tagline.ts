/**
 * O lema, sob o logo. Uma sentença só.
 *
 * Não passa pelo `TerminalPrinter`: isto não é saída de boot, é parte do lockup
 * do título — o bloco de créditos do cartaz — e chega inteiro com o slam em vez
 * de ser datilografado.
 *
 * Já foram três frases separadas por `//`, e três frases não são um lema: são
 * uma lista de features. Um lema desafia quem lê, e cabe numa linha. O `//`
 * que sobrou é prefixo, não separador — a mesma marca de canal que abre e fecha
 * o roteiro do boot (`アクセス許可 // CANAL PIRATA`, `BOA CAÇADA // 勝負`).
 *
 * ```ts
 * buildTagline() // '// ONE SHOT. ONE KILL'
 * ```
 */
export function buildTagline(): string {
  return '// ONE SHOT. ONE KILL'
}
