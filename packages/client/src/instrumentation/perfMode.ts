/**
 * O modo de medição: `?perf=1` na url. Abre o overlay de desempenho desde o
 * boot, expõe a cena ao roteiro de medição e libera o `?tickHz=`. Uma leitura
 * só, para as duas portas que dependem dele não divergirem.
 *
 * ```ts
 * isPerfMode('?perf=1&tickHz=120') // true
 * ```
 */
export function isPerfMode(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1'
}
