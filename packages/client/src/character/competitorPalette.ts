/**
 * A pintura do competidor: corpo preto, juntas em neon.
 *
 * O Mannequin da Universal Animation Library vem laranja com juntas roxas —
 * cor de manequim de estúdio, que não é deste jogo. O preto com junta acesa é
 * a leitura que a ADR 0004 pede: a identidade mora na luz, não no modelo.
 *
 * **As juntas são emissivas de propósito.** Corpo preto contra o chão escuro é
 * exatamente o defeito que aposentou o SWAT (`docs/asset-licenses.md`): a
 * silhueta sumia depois de 20 m. Aqui o que se enxerga de longe não é o corpo,
 * são os pontos acesos — e eles não dependem de luz de cena para brilhar.
 */
export type CompetitorAccent = 'red' | 'amber' | 'cyan'

/** Não é preto puro: preto absoluto contra o chão escuro apaga a forma toda. */
export const COMPETITOR_BODY_RGB: readonly [number, number, number] = [0.04, 0.04, 0.05]

/**
 * Os três acentos, na paleta do hud mais o ciano.
 *
 * O ciano não está na paleta da interface de propósito: ele é a cor que
 * **nenhum** elemento de hud usa, então uma junta ciana nunca se confunde com
 * um traço da tela. Vermelho e âmbar já convivem com o visor, e por isso são
 * os dois primeiros — o terceiro existe para os bonecos não virarem um
 * borrão só quando há vários em cena.
 */
export const COMPETITOR_ACCENT_RGB: Readonly<
  Record<CompetitorAccent, readonly [number, number, number]>
> = {
  red: [1, 0.16, 0.24],
  amber: [1, 0.69, 0.13],
  cyan: [0.2, 0.95, 1],
}

const ACCENT_CYCLE: readonly CompetitorAccent[] = ['red', 'amber', 'cyan']

/**
 * O acento de um competidor pelo índice dele, em rodízio: dois bonecos
 * vizinhos nunca saem da mesma cor.
 *
 * ```ts
 * accentForIndex(0) // 'red'
 * accentForIndex(4) // 'amber'
 * ```
 */
export function accentForIndex(index: number): CompetitorAccent {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`index recebeu ${index}; esperado inteiro >= 0`)
  }
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length] ?? 'red'
}

/** O nome do material do glb que veste o corpo. */
export const COMPETITOR_BODY_MATERIAL = 'M_Main'

/** O nome do material do glb que veste as juntas. */
export const COMPETITOR_ACCENT_MATERIAL = 'M_Joints'
