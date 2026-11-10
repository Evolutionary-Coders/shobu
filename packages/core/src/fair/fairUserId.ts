/**
 * O ID do jogador na Feira de Jogos, o `userId` do crédito (ADR 0037): um
 * inteiro positivo que a pessoa digita no modal ao abrir o jogo. Vale para o
 * texto do campo, no cliente, e para o que chega na mensagem, no servidor;
 * o que não tem essa forma é "sem ID", e não erro.
 *
 * ```ts
 * fairUserIdOf(' 42 ') // 42
 * fairUserIdOf('4,2') // undefined
 * ```
 */
export function fairUserIdOf(raw: unknown): number | undefined {
  const value = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw
  if (typeof value !== 'number') return undefined
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}
