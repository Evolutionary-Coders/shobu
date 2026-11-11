/**
 * O maior ID que a Feira guarda: o `id` de `people` é um `integer` do
 * Postgres. Acima dele a Feira responde 400, e não o 404 de ID inexistente, e
 * o jogador leria "falhou" em vez de "ID não encontrado" (review do PR #49).
 */
const MAX_FAIR_USER_ID = 2_147_483_647

/**
 * O ID do jogador na Feira de Jogos, o `userId` do crédito (ADR 0037): um
 * inteiro positivo que a pessoa digita no modal ao abrir o jogo. Vale para o
 * texto do campo, no cliente, e para o que chega na mensagem, no servidor;
 * o que não tem essa forma é "sem ID", e não erro. O texto passa por NFKC: o
 * teclado de alguns celulares manda os dígitos de largura cheia (`４２`).
 *
 * ```ts
 * fairUserIdOf(' 42 ') // 42
 * fairUserIdOf('4,2') // undefined
 * ```
 */
export function fairUserIdOf(raw: unknown): number | undefined {
  const value = typeof raw === 'string' ? numberOfDigits(raw.normalize('NFKC')) : raw
  if (typeof value !== 'number') return undefined
  return Number.isInteger(value) && value > 0 && value <= MAX_FAIR_USER_ID ? value : undefined
}

function numberOfDigits(text: string): number | undefined {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : undefined
}
