import type { CyberspaceSurface, Rgb } from '../arena/cyberspaceSurface.ts'
import type { ArenaLayer } from '../arena/greyboxBlockout.ts'
import { NEON_EDGE_RGB } from '../arena/neonEdges.ts'

/**
 * A superfície de cada camada da arena, como dado — a mesma divisão que
 * `arenaLightingSpec.ts` faz com a luz: aqui ficam os números, e
 * `greyboxMaterials.ts` traduz para o babylon.
 *
 * As quatro camadas existem para a **verticalidade ser legível**. Quem carrega
 * isso agora é a **cor do circuito**, e não mais o tom da textura: painel
 * escuro em toda parte, linha acesa de cor própria em cada camada. É a mesma
 * cor da fita de `neonEdges.ts`, importada de lá e não repetida aqui — duas
 * listas de cor por camada divergiriam no primeiro ajuste.
 *
 * **O que saiu, e por quê.** As quatro texturas fotográficas (concreto, laje,
 * metal enferrujado, chapa velha) liam como ferro-velho, não como cidade
 * cyberpunk, e nenhuma troca dentro daquele pacote mudaria isso — ver
 * `cyberspaceSurface.ts`.
 */

/**
 * Toda camada **menos** `prop`. Prop não é caixa do blockout desenhada pelo
 * `buildGreyboxArena`: ele tem malha própria em `props/alley-kit.glb`, com a
 * textura que veio junto. A caixa dele existe só para a colisão.
 */
export type GreyboxSurfaceLayer = Exclude<ArenaLayer, 'prop'>

/**
 * A faixa de luminância do painel — **dois stops, e é o número mais importante
 * deste arquivo** (ADR 0009).
 *
 * Era só um teto, em 0,12, e com ele a arena inteira saía entre 0,04 e 0,07:
 * abaixo de 0,08 nenhum monitor de estande em sala acesa separa uma coisa da
 * outra, e a feira é uma sala acesa. O teto sozinho também deixava passar o
 * defeito oposto ao que ele vigiava — nada impedia alguém de escurecer mais.
 *
 * O piso é o que faz o ambiente ser **meio-tom**, para o corpo do competidor,
 * agora em 0,06, ser a coisa **mais escura** da imagem e virar recorte. É a
 * inversão de `competitorPalette.ts`, e as duas pontas só funcionam juntas.
 *
 * O teto ainda importa por outro motivo: o passe de dither da ADR 0008
 * quantiza em 32 níveis por canal, e uma arena espremida em 0,04–0,12 caberia
 * em dois níveis. Faixa larga é pré-requisito do passe.
 */
export const PANEL_LUMINANCE_MIN = 0.1
export const PANEL_LUMINANCE_MAX = 0.26

/**
 * Peso do detalhe baixado sobre o painel gerado. Baixo: o painel é que manda,
 * e a foto está ali só para a superfície não ser matematicamente lisa. Subir
 * disto devolve o concreto sujo que a arena saiu de vez — e a barreira não leva
 * nenhum, porque superfície translúcida com foto por cima vira vidro sujo.
 */
const DETAIL_STRENGTH = 0.22

/** O circuito do piso, apagado: piso não é beirada, e beirada é o que tem que saltar. */
const FLOOR_CIRCUIT_RGB: Rgb = [0.05, 0.42, 0.55]

/** O circuito da barreira, ciano cheio: é ele que diz onde a arena acaba. */
const BARRIER_CIRCUIT_RGB: Rgb = [0.1, 0.85, 1]

/**
 * As três plataformas dividem tudo menos a cor: mesma célula, mesmo grão,
 * mesmo ladrilho de 2 m. O que as separa é o circuito, e é só isso que o
 * chamador escolhe — parâmetro em comum repetido três vezes é a divergência
 * esperando para acontecer.
 */
function platformSurface(
  panelRgb: Rgb,
  seamRgb: Rgb,
  circuitRgb: Rgb,
  linePx: number,
): CyberspaceSurface {
  return {
    panelRgb,
    seamRgb,
    circuitRgb,
    cellPx: 32,
    linePx,
    grainAmplitude: 0.025,
    metresPerTile: 2,
    panelAlpha: 1,
    detailTextureUrl: '/assets/textures/detail-concrete.webp',
    detailStrength: DETAIL_STRENGTH,
  }
}

/**
 * O piso é a superfície para onde a câmera olha metade do tempo, e a que mais
 * se repete. Célula grande e circuito fraco, para os 64 m não virarem papel
 * quadriculado sob os pés do jogador.
 */
function floorSurface(): CyberspaceSurface {
  return {
    panelRgb: [0.125, 0.14, 0.185],
    seamRgb: [0.07, 0.08, 0.115],
    circuitRgb: FLOOR_CIRCUIT_RGB,
    cellPx: 64,
    linePx: 2,
    grainAmplitude: 0.02,
    metresPerTile: 4,
    panelAlpha: 1,
    detailTextureUrl: '/assets/textures/detail-asphalt.webp',
    detailStrength: DETAIL_STRENGTH,
  }
}

/**
 * **O muro alto sai daqui.**
 *
 * Ele continua existindo como colisão, e por isso nada de jogabilidade muda: a
 * arena segue fechada, o blockout é o mesmo e o núcleo não sabe que houve troca.
 * O que sai é a **parede opaca de 22 m** que tapava a cidade — e era ela, não a
 * altura, que quebrava a imersão: o jogador estava numa caixa de concreto com
 * uma skyline pintada que ele nunca via.
 *
 * Com o painel quase transparente sobra a malha de contenção, e ela diz as duas
 * coisas ao mesmo tempo: *ali acaba a arena* e *a cidade continua depois*.
 * Célula fina e linha de um texel porque a malha é lida **de perto**, encostada
 * nela, e não ladrilhada num piso de 64 m.
 */
function barrierSurface(): CyberspaceSurface {
  return {
    panelRgb: [0.1, 0.115, 0.16],
    seamRgb: [0.06, 0.07, 0.1],
    circuitRgb: BARRIER_CIRCUIT_RGB,
    cellPx: 16,
    linePx: 1,
    grainAmplitude: 0.015,
    metresPerTile: 2,
    panelAlpha: 0.1,
  }
}

/**
 * ```ts
 * greyboxSurfaceSpec().floor.metresPerTile // 4
 * ```
 */
export function greyboxSurfaceSpec(): Readonly<Record<GreyboxSurfaceLayer, CyberspaceSurface>> {
  return {
    floor: floorSurface(),
    barrier: barrierSurface(),
    ground: platformSurface([0.155, 0.175, 0.225], [0.085, 0.095, 0.13], NEON_EDGE_RGB.ground, 2),
    // violeta escuro sob circuito magenta: o deck do meio é a camada que mais
    // se atravessa, e ela precisa de nome próprio de longe.
    mid: platformSurface([0.16, 0.165, 0.245], [0.09, 0.09, 0.14], NEON_EDGE_RGB.mid, 2),
    top: platformSurface([0.175, 0.185, 0.25], [0.1, 0.105, 0.145], NEON_EDGE_RGB.top, 3),
  }
}
