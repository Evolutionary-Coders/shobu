/**
 * O visual de um competidor como dado puro: qual humano ele veste. O cliente
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
