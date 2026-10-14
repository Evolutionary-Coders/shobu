/**
 * FNV-1a de 32 bits sobre o texto, por unidade de código. É o hash curto e
 * determinístico do projeto: o mesmo texto dá o mesmo número no node, no
 * navegador e, amanhã, no servidor. Não é criptografia.
 *
 * ```ts
 * fnv1a32('bot-0') // sempre o mesmo inteiro sem sinal
 * ```
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}
