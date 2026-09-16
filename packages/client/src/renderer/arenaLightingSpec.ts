/**
 * A luz da arena, como dado. A ADR 0004 fecha a porta para pbr e sombra
 * dinâmica — a luz de verdade virá cozida no lightmap do glTF —, então o que
 * cabe aqui é o mínimo que faz um greybox ler: uma **chave** direcional para
 * cada face ter um tom, e um **preenchimento** hemisférico para face nenhuma
 * ficar preta.
 *
 * Duas luzes e não uma: só com a hemisférica toda parede vertical recebe a
 * mesma quantidade de luz, e caixa com todas as faces iguais é caixa sem
 * volume. Foi assim que a arena estava escura e chapada.
 *
 * Não importa nada da engine de propósito: `arenaLighting.ts` traduz isto para
 * o babylon, e o teste vigia os números sem precisar de cena.
 */

import { arenaFogSpec } from '../arena/arenaFogSpec.ts'
import { NEON_EDGE_RGB } from '../arena/neonEdges.ts'

export type Rgb = readonly [number, number, number]

export interface KeyLightSpec {
  /** Para onde a luz vai. Aponta para baixo: é um sol, não um refletor de chão. */
  readonly directionM: readonly [number, number, number]
  readonly intensity: number
  readonly colorRgb: Rgb
}

export interface FillLightSpec {
  readonly intensity: number
  /** Cor que vem de cima. */
  readonly skyRgb: Rgb
  /** Cor que vem de baixo: é o que dá silhueta à face inferior das plataformas. */
  readonly groundRgb: Rgb
}

/**
 * Uma luz que tem **lugar**. As duas globais dão tom a cada face e não dão
 * lugar nenhum: com só elas, todo canto da arena recebe a mesma luz, e arena em
 * que todo canto é igual não tem posição com nome.
 *
 * Duas, e no máximo duas: o `StandardMaterial` do babylon aceita **quatro**
 * luzes simultâneas por padrão, e a chave e o preenchimento já ocupam duas.
 * Uma quinta exigiria mexer em `maxSimultaneousLights`, que recompila o shader
 * e sai do orçamento de quadro sem ninguém pedir.
 */
export interface PointLightSpec {
  readonly name: string
  readonly positionM: readonly [number, number, number]
  readonly colorRgb: Rgb
  readonly intensity: number
  /** Alcance em metros. Curto de propósito: luz que alcança tudo é luz global. */
  readonly rangeM: number
}

export interface ArenaLightingSpec {
  readonly key: KeyLightSpec
  readonly fill: FillLightSpec
  readonly points: readonly PointLightSpec[]
  /**
   * O que fica atrás de tudo. Desde que `deadChannelSky.ts` existe, a cúpula
   * cobre isto em todo quadro — ele sobrevive como a cor do **primeiro** quadro,
   * antes de a cúpula ser desenhada, e por isso é a cor do horizonte e não outra.
   */
  readonly skyClearRgb: Rgb
}

/**
 * A faixa em que a soma das duas luzes globais tem que cair.
 *
 * O **teto** é onde a face virada para a chave começa a estourar em branco. O
 * **piso** é o que impede alguém de escurecer a arena até ela ficar bonita e
 * injogável: o painel de `cyberspaceSurface.ts` tem luminância perto de 0,05, e
 * abaixo deste piso ele some no preto — e com ele some a silhueta do alvo, que
 * é a única coisa que o pilar 1 promete ao jogador.
 *
 * Era 2,2 de teto e nenhum piso, quando a arena era concreto claro e a luz
 * carregava tudo. Quem carrega agora é o circuito emissivo, que não obedece a
 * luz nenhuma — então a global pode e deve ser mais baixa.
 */
export const LIGHT_TOTAL_INTENSITY_MAX = 2
export const LIGHT_TOTAL_INTENSITY_MIN = 1.2

/**
 * ```ts
 * const spec = arenaLightingSpec()
 * spec.key.directionM // [-0.45, -1, -0.35]
 * ```
 */
export function arenaLightingSpec(): ArenaLightingSpec {
  return {
    key: {
      // vem do alto, de nordeste: os decks e as passarelas ficam iluminados
      // de um lado e sombreados do outro, e a verticalidade lê de qualquer spawn.
      directionM: [-0.45, -1, -0.35],
      intensity: 1,
      // **azul frio, e não mais quente.** A chave é a claridade da cidade no céu
      // de uma noite cyberpunk, não um sol. Quente vindo do alto era metade do
      // que fazia a arena ler como pátio de dia.
      colorRgb: [0.62, 0.74, 1],
    },
    fill: {
      intensity: 0.7,
      skyRgb: [0.45, 0.55, 0.9],
      // **magenta vindo de baixo**: é o neon do chão batendo na face inferior
      // das plataformas. A temperatura oposta à da chave é o que separa a face
      // de cima da face de baixo — o que mudou foi de que lado está cada uma.
      groundRgb: [0.6, 0.22, 0.42],
    },
    points: arenaPointLights(),
    skyClearRgb: arenaFogSpec().colorRgb,
  }
}

/**
 * Duas luzes com lugar, uma de cada lado do eixo leste-oeste, na altura dos
 * decks do meio. Não iluminam a arena — elas **nomeiam** pedaços dela: passa a
 * existir "o lado magenta" e "o lado ciano", que é como um time de fps chama
 * posição. A cor é a mesma das fitas de `neonEdges.ts`, porque duas paletas
 * para a mesma arena é uma paleta a mais.
 *
 * Alcance de 34 m: cobre o próprio lado e morre antes do lado oposto. Com
 * alcance maior as duas se somam no centro e voltam a ser uma luz global só.
 */
function arenaPointLights(): readonly PointLightSpec[] {
  return [
    {
      name: 'glow-east',
      positionM: [19, 9, 0],
      colorRgb: NEON_EDGE_RGB.mid,
      intensity: 0.85,
      rangeM: 34,
    },
    {
      name: 'glow-west',
      positionM: [-19, 9, 0],
      colorRgb: NEON_EDGE_RGB.ground,
      intensity: 0.85,
      rangeM: 34,
    },
  ]
}

/**
 * Direção da chave normalizada, para o babylon não receber um vetor de
 * comprimento arbitrário e mudar a intensidade sem ninguém pedir.
 *
 * ```ts
 * keyLightDirection(arenaLightingSpec()) // [-0.39, -0.86, -0.30]
 * ```
 */
export function keyLightDirection(spec: ArenaLightingSpec): readonly [number, number, number] {
  const [x, y, z] = spec.key.directionM
  const length = Math.hypot(x, y, z)
  if (length === 0) {
    throw new RangeError(`key.directionM recebeu [0, 0, 0]; esperado vetor com comprimento > 0`)
  }
  return [x / length, y / length, z / length]
}
