/**
 * Blockout da arena em caixas, em **metros** — a unidade de todo número de
 * gameplay (ADR 0004). É placeholder de level design: existe para o
 * protótipo ter três camadas para atravessar, e cai inteiro quando
 * `docs/level-design.md` existir e a arena vier do blender em glTF.
 *
 * Não importa nada da engine de propósito: o mesmo dado alimenta o renderer
 * hoje e a construção da BVH de colisão depois (ADR 0003).
 */
export type ArenaLayer = 'ground' | 'mid' | 'top' | 'shell'

export interface GreyboxBlock {
  readonly name: string
  readonly centerM: readonly [number, number, number]
  readonly sizeM: readonly [number, number, number]
  readonly layer: ArenaLayer
}

const ARENA_HALF_WIDTH_M = 32
const SHELL_HEIGHT_M = 22

export const GREYBOX_BLOCKOUT: readonly GreyboxBlock[] = [
  { name: 'floor', centerM: [0, -0.5, 0], sizeM: [64, 1, 64], layer: 'shell' },
  ...perimeterWalls(),

  // 2,2 m: alto o bastante para esconder um jogador de 2 m em pé, e **baixo o
  // bastante para o pulo duplo alcançar** (ver o teste do envelope). A 3 m elas
  // ficavam 32 cm acima do alcance máximo — não difíceis de subir, impossíveis.
  { name: 'ground-cover-ne', centerM: [12, 1.1, 12], sizeM: [8, 2.2, 8], layer: 'ground' },
  { name: 'ground-cover-nw', centerM: [-12, 1.1, 12], sizeM: [8, 2.2, 8], layer: 'ground' },
  { name: 'ground-cover-se', centerM: [12, 1.1, -12], sizeM: [8, 2.2, 8], layer: 'ground' },
  { name: 'ground-cover-sw', centerM: [-12, 1.1, -12], sizeM: [8, 2.2, 8], layer: 'ground' },

  { name: 'mid-deck-east', centerM: [20, 7, 0], sizeM: [16, 1, 22], layer: 'mid' },
  { name: 'mid-deck-west', centerM: [-20, 7, 0], sizeM: [16, 1, 22], layer: 'mid' },
  { name: 'mid-deck-north', centerM: [0, 7, 20], sizeM: [22, 1, 16], layer: 'mid' },
  { name: 'mid-deck-south', centerM: [0, 7, -20], sizeM: [22, 1, 16], layer: 'mid' },
  { name: 'mid-pillar-ne', centerM: [16, 3.5, 16], sizeM: [4, 7, 4], layer: 'mid' },
  { name: 'mid-pillar-sw', centerM: [-16, 3.5, -16], sizeM: [4, 7, 4], layer: 'mid' },

  { name: 'top-spire', centerM: [0, 14, 0], sizeM: [14, 1, 14], layer: 'top' },
  { name: 'top-catwalk-east', centerM: [22, 14, 0], sizeM: [8, 1, 6], layer: 'top' },
  { name: 'top-catwalk-west', centerM: [-22, 14, 0], sizeM: [8, 1, 6], layer: 'top' },
]

/**
 * Doze spawns dispersos, um por camada e por quadrante. A dispersão é a
 * defesa contra camping de spawn — não regra de invulnerabilidade, que o
 * pilar 1 proíbe.
 *
 * Estão na **convenção de altura de olho**: o y é o piso da camada mais
 * `collision.capsuleHeightM`, e quem converte para pé é `competitorFeetM`.
 * Mexer na altura da cápsula **obriga** a mexer aqui junto, senão o jogador
 * nasce enterrado ou boiando — é o que o teste de `competitorAvatar` vigia.
 */
export const GREYBOX_SPAWN_POINTS_M: readonly (readonly [number, number, number])[] = [
  [26, 2, 26],
  [-26, 2, 26],
  [26, 2, -26],
  [-26, 2, -26],
  [0, 2, 28],
  [0, 2, -28],
  [20, 9.5, 8],
  [-20, 9.5, -8],
  [8, 9.5, 20],
  [-8, 9.5, -20],
  [0, 16.5, 4],
  [0, 16.5, -4],
]

function perimeterWalls(): readonly GreyboxBlock[] {
  const span = ARENA_HALF_WIDTH_M * 2
  const offset = ARENA_HALF_WIDTH_M + 0.5
  const y = SHELL_HEIGHT_M / 2
  const walls: readonly Omit<GreyboxBlock, 'layer'>[] = [
    { name: 'wall-north', centerM: [0, y, offset], sizeM: [span, SHELL_HEIGHT_M, 1] },
    { name: 'wall-south', centerM: [0, y, -offset], sizeM: [span, SHELL_HEIGHT_M, 1] },
    { name: 'wall-east', centerM: [offset, y, 0], sizeM: [1, SHELL_HEIGHT_M, span] },
    { name: 'wall-west', centerM: [-offset, y, 0], sizeM: [1, SHELL_HEIGHT_M, span] },
  ]
  return walls.map((wall) => ({ ...wall, layer: 'shell' as const }))
}
