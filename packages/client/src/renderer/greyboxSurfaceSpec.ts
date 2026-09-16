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
 * Teto de luminância do painel. **É a direção de arte virada regra**: a arena
 * é escura e quem ilumina é o circuito. Painel claro devolve o cinza de
 * concreto que esta superfície existe para tirar do mapa.
 */
export const PANEL_LUMINANCE_MAX = 0.12

/** O circuito do casco, mais apagado que o das plataformas: piso não é beirada. */
const SHELL_CIRCUIT_RGB: readonly [number, number, number] = [0.05, 0.42, 0.55]

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
  }
}

/**
 * ```ts
 * greyboxSurfaceSpec().shell.metresPerTile // 4
 * ```
 */
export function greyboxSurfaceSpec(): Readonly<Record<GreyboxSurfaceLayer, CyberspaceSurface>> {
  return {
    // o casco é piso e muro: a superfície para onde a câmera olha metade do
    // tempo, e a que mais se repete. Célula grande e circuito fraco, para o
    // piso de 64 m não virar papel quadriculado sob os pés do jogador.
    shell: {
      panelRgb: [0.045, 0.05, 0.062],
      seamRgb: [0.018, 0.02, 0.028],
      circuitRgb: SHELL_CIRCUIT_RGB,
      cellPx: 64,
      linePx: 2,
      grainAmplitude: 0.02,
      metresPerTile: 4,
    },
    ground: platformSurface([0.06, 0.068, 0.085], [0.025, 0.028, 0.038], NEON_EDGE_RGB.ground, 2),
    // violeta escuro sob circuito magenta: o deck do meio é a camada que mais
    // se atravessa, e ela precisa de nome próprio de longe.
    mid: platformSurface([0.072, 0.055, 0.086], [0.03, 0.022, 0.036], NEON_EDGE_RGB.mid, 2),
    top: platformSurface([0.082, 0.07, 0.055], [0.034, 0.028, 0.022], NEON_EDGE_RGB.top, 3),
  }
}
