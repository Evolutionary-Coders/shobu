/**
 * O nome de perfil do jogador: o que o menu deixa digitar e o que o hud, o
 * placar, o killfeed e as telas de abate escrevem no lugar de `AGENTE`.
 *
 * Mora no núcleo porque o servidor de jogo também o limpa: o nome chega pela
 * rede, e o que a sala repassa aos outros clientes passa pela mesma regra que
 * o menu aplicou. A política é a do parser das configurações: **nunca lança**.
 * O nome vem do armazenamento do navegador, do teclado do jogador ou da rede,
 * e nome sujo vira nome limpo — ou o padrão —, nunca boot nem sala morta.
 */

/**
 * O teto é o da coluna mais estreita que o nome ocupa: o killfeed e o estado
 * do hud cortam em 12 (`KILLFEED_NAME_MAX`, `CALLSIGN_MAX`), e os apelidos dos
 * bots cabem nele (NEON KITSUNE tem 12). Aceitar 16 e mostrar 12 seria o menu
 * prometendo um nome que a partida corta.
 */
export const PROFILE_NAME_MAX = 12

/** O nome de quem não escolheu um. Também é o cabeçalho da coluna do placar. */
export const DEFAULT_PROFILE_NAME = 'AGENTE'

/**
 * Letras de qualquer alfabeto, com acento, dígitos, espaço, hífen e sublinhado.
 * Fora disso fica de fora o que quebraria uma linha do hud (`<`, emoji, quebra
 * de linha) ou se confundiria com a pontuação do killfeed.
 */
const ALLOWED_CHAR = /^[\p{L}\p{N} _-]$/u

/**
 * O nome **enquanto é digitado**: caixa alta, só os caracteres aceitos, sem
 * espaço no começo nem dois seguidos, cortado no teto. O espaço do fim fica —
 * é o jogador no meio de digitar "NEO X".
 *
 * ```ts
 * typedProfileName('neo  <x> ') // 'NEO X '
 * ```
 */
export function typedProfileName(raw: string): string {
  const kept = [...raw.normalize('NFC').toLocaleUpperCase('pt-BR')]
    .filter((char) => ALLOWED_CHAR.test(char))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trimStart()
  return [...kept].slice(0, PROFILE_NAME_MAX).join('')
}

/**
 * O nome pronto para guardar: o digitado sem o espaço do fim. Vazio quer dizer
 * "sem nome", e é o `profileNameLabel` que troca pelo padrão na hora de
 * mostrar — guardar `AGENTE` faria o padrão parecer escolha.
 *
 * ```ts
 * sanitizeProfileName('  raiden ') // 'RAIDEN'
 * sanitizeProfileName(42)          // ''
 * ```
 */
export function sanitizeProfileName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return typedProfileName(raw).trimEnd()
}

/**
 * O nome como a tela o escreve, com o padrão no lugar do vazio.
 *
 * ```ts
 * profileNameLabel('')       // 'AGENTE'
 * profileNameLabel('kitsu') // 'KITSU'
 * ```
 */
export function profileNameLabel(raw: unknown): string {
  return sanitizeProfileName(raw) || DEFAULT_PROFILE_NAME
}
