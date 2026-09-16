import { type CyberspaceSurface, SURFACE_SIZE_PX } from '../arena/cyberspaceSurface.ts'
import { GRID_MAJOR_EVERY } from '../arena/dataHorizon.ts'

/**
 * As superfícies do lado de fora, como dado — a mesma divisão que
 * `greyboxSurfaceSpec.ts` faz com as da arena.
 *
 * As duas seguem a mesma regra da ADR 0009 e a quebram no mesmo ponto: são
 * **mais escuras** que o painel de dentro. O lado de fora não pode competir
 * com a arena por atenção, e a névoa já leva a maior parte do que resta.
 */

/**
 * O chão do não-espaço. A célula da textura **é** a célula maior da grade: uma
 * subdivisão de textura por metro de mundo, com a linha forte na emenda do
 * ladrilho. É o que faz a régua medir certo, e é `arenaDataHorizon.ts` quem
 * casa o ladrilho com o metro.
 *
 * Fundo bem escuro e linha fraca: a grade tem que dar escala, não brilhar. Ela
 * cobre metade do campo de visão de quem olha para baixo, e grade forte ali é
 * ruído permanente ao redor do retículo.
 */
export function gridSurface(): CyberspaceSurface {
  return {
    panelRgb: [0.055, 0.062, 0.088],
    seamRgb: [0.055, 0.062, 0.088],
    circuitRgb: [0.11, 0.42, 0.55],
    cellPx: SURFACE_SIZE_PX / GRID_MAJOR_EVERY,
    linePx: 1,
    grainAmplitude: 0.01,
    metresPerTile: 1,
    panelAlpha: 1,
  }
}

/**
 * A torre de dados. Corpo quase preto contra o horizonte e aresta acesa fraca:
 * a 260 e a 610 m a névoa deixa passar 20% e 0,7% respectivamente, então o que
 * chega ao olho é uma silhueta escura com um fio de luz — que é exatamente a
 * frase de Gibson sobre "luzes de cidade recuando".
 *
 * **Não pisca.** Luz que se move no fundo disputa atenção com o alvo, e foi um
 * dos defeitos da cidade que saiu.
 */
export function towerSurface(): CyberspaceSurface {
  return {
    panelRgb: [0.05, 0.056, 0.082],
    seamRgb: [0.03, 0.034, 0.052],
    circuitRgb: [0.16, 0.5, 0.72],
    cellPx: 32,
    linePx: 2,
    grainAmplitude: 0.012,
    metresPerTile: 1,
    panelAlpha: 1,
  }
}
