/**
 * O visual de um competidor como dado puro: qual humano ele veste, o
 * acabamento da sniper e a cor do neon. O cliente
 * guarda os arquivos (o glb, o retrato) em `character/humanSkins.ts`; os ids
 * moram aqui porque o servidor também os valida, e os dois lados têm de
 * concordar no mesmo catálogo.
 */

/**
 * Os humanos, na ordem do catálogo do cliente: dois homens e duas mulheres
 * alternados, para bots vizinhos nunca saírem do mesmo corpo. A ordem é também
 * o código do fio: só se acrescenta no fim.
 */
export const HUMAN_SKIN_IDS = ['brick', 'vex', 'ronin', 'nova'] as const

export type HumanSkinId = (typeof HUMAN_SKIN_IDS)[number]

/** A skin de quem não escolheu nenhuma. */
export const DEFAULT_HUMAN_SKIN: HumanSkinId = 'ronin'

/**
 * Valida o que chega da rede, ou de configuração salva, antes de virar skin.
 *
 * ```ts
 * isHumanSkin('vex') // true
 * isHumanSkin('robo') // false
 * ```
 */
export function isHumanSkin(candidate: unknown): candidate is HumanSkinId {
  return HUMAN_SKIN_IDS.some((id) => id === candidate)
}

/**
 * A skin como índice de `HUMAN_SKIN_IDS`, o `uint8` do estado da sala.
 *
 * ```ts
 * encodeHumanSkin('vex') // 1
 * ```
 */
export function encodeHumanSkin(skin: HumanSkinId): number {
  return HUMAN_SKIN_IDS.indexOf(skin)
}

/**
 * O índice do estado da sala de volta para a skin. Um código desconhecido, ou
 * `undefined` de um servidor antigo sem o campo, vira a padrão em vez de
 * derrubar o cliente: errar o corpo de um rival é cosmético.
 *
 * ```ts
 * decodeHumanSkin(3) // 'nova'
 * decodeHumanSkin(9) // 'ronin'
 * ```
 */
export function decodeHumanSkin(code: number | undefined): HumanSkinId {
  if (code === undefined) return DEFAULT_HUMAN_SKIN
  return HUMAN_SKIN_IDS[code] ?? DEFAULT_HUMAN_SKIN
}

/**
 * O acabamento da sniper de quem não escolheu: vazio, que cada cliente lê como
 * o primeiro do catálogo dele.
 */
export const DEFAULT_SNIPER_FINISH = ''

/**
 * O acabamento viaja pelo **id**, e não pelo índice do catálogo: o catálogo
 * das snipers ainda muda, e um id que um cliente não conhece cai no padrão em
 * vez de pintar outro acabamento. O servidor não conhece o catálogo; só
 * confere que é um id curto, e não um texto qualquer da rede.
 */
const FINISH_ID_PATTERN = /^[a-z0-9-]{1,32}$/

/**
 * Valida o id de acabamento que chega da rede antes de ir ao estado da sala.
 *
 * ```ts
 * isSniperFinishId('grafite-neon') // true
 * isSniperFinishId('<script>') // false
 * ```
 */
export function isSniperFinishId(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && FINISH_ID_PATTERN.test(candidate)
}

/** Quantas cores de neon existem (`competitorPalette.ts` no cliente). */
export const ACCENT_COUNT = 3

/**
 * O acento de quem chega: o menor que ninguém da sala usa, para dois
 * competidores não terem o mesmo neon enquanto houver cor sobrando. Com todas
 * tomadas, repetir é inevitável, e o rodízio pela contagem espalha a repetição.
 *
 * ```ts
 * freeAccentOf([0, 2]) // 1
 * freeAccentOf([0, 1, 2]) // 0
 * ```
 */
export function freeAccentOf(taken: readonly number[]): number {
  for (let accent = 0; accent < ACCENT_COUNT; accent += 1) {
    if (!taken.includes(accent)) return accent
  }
  return taken.length % ACCENT_COUNT
}

/**
 * A skin de um bot do servidor, pelo índice dele no esquadrão: o rodízio do
 * catálogo, a mesma em toda tela, porque quem decide é a sala.
 *
 * ```ts
 * serverBotSkinOf(0) // 'brick'
 * serverBotSkinOf(5) // 'vex'
 * ```
 */
export function serverBotSkinOf(botIndex: number): HumanSkinId {
  return HUMAN_SKIN_IDS[botIndex % HUMAN_SKIN_IDS.length] ?? DEFAULT_HUMAN_SKIN
}

/**
 * O acento de um bot do servidor: a cor menos cheia da sala, com os humanos
 * pesando mais que todos os bots juntos. São três cores para quatro
 * competidores, e alguém repete: assim a repetição cai entre dois bots
 * enquanto der, e só encosta num humano quando os humanos já tomaram as três.
 *
 * Era fixo pelo índice do bot (`botIndex % ACCENT_COUNT`), e o primeiro
 * humano, que chega com os três bots sentados, ficava com o neon do bot 0
 * (validação de 05/11). Agora o bot cede: a cor de um humano não muda depois
 * da entrada, a do bot pode mudar quando a sala muda.
 *
 * ```ts
 * botAccentOf([0], []) // 1
 * botAccentOf([0], [1, 2]) // 1
 * botAccentOf([0, 1], [2]) // 2
 * ```
 */
export function botAccentOf(
  humanAccents: readonly number[],
  earlierBotAccents: readonly number[],
): number {
  // um humano pesa mais que todos os bots somados: a ordem nunca se inverte.
  const humanWeight = earlierBotAccents.length + 1
  let chosen = 0
  let chosenCrowd = Number.POSITIVE_INFINITY
  for (let accent = 0; accent < ACCENT_COUNT; accent += 1) {
    const crowd = countOf(humanAccents, accent) * humanWeight + countOf(earlierBotAccents, accent)
    if (crowd >= chosenCrowd) continue
    chosen = accent
    chosenCrowd = crowd
  }
  return chosen
}

function countOf(accents: readonly number[], accent: number): number {
  return accents.filter((taken) => taken === accent).length
}
