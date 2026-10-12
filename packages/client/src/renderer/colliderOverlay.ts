import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import type { Scene } from '@babylonjs/core/scene'
import type { StaticBox } from '@shobu/core'
import type { ArenaMap } from '../arena/arenaCatalog.ts'
import { colliderOverlayGroups } from '../arena/colliderOverlaySpec.ts'

/**
 * Desenha a colisão que não se vê (`colliderOverlaySpec.ts`) como arame, uma
 * malha de linhas por cor: é a revisão de `?perf=1&colisao=1` (ADR 0024).
 *
 * No grupo de renderização de cima, que limpa a profundidade antes: o arame
 * aparece através da parede. É raio-x de propósito — a caixa que importa é
 * justamente a que a arte esconde.
 *
 * ```ts
 * drawColliderOverlay(scene, options.arena)
 * ```
 */
export function drawColliderOverlay(scene: Scene, map: Pick<ArenaMap, 'blockout' | 'props'>): void {
  for (const group of colliderOverlayGroups(map)) {
    const colour = new Color4(...group.colour, 1)
    const lines = group.boxes.flatMap(edgesOf)
    const mesh = CreateLineSystem(
      `colisao-${group.mask}`,
      { lines, colors: lines.map((line) => line.map(() => colour)) },
      scene,
    )
    mesh.isPickable = false
    mesh.renderingGroupId = OVERLAY_RENDERING_GROUP
    mesh.freezeWorldMatrix()
  }
}

/** Acima da cena (`arenaSky.ts` põe o céu no 0 e a cena no 1), como a retícula do óculos. */
const OVERLAY_RENDERING_GROUP = 3

/** As doze arestas da caixa. */
function edgesOf(box: StaticBox): Vector3[][] {
  const corner = (x: 0 | 1, y: 0 | 1, z: 0 | 1) =>
    new Vector3(x ? box.maxX : box.minX, y ? box.maxY : box.minY, z ? box.maxZ : box.minZ)
  const edges: Vector3[][] = []
  for (const a of [0, 1] as const) {
    for (const b of [0, 1] as const) {
      edges.push([corner(0, a, b), corner(1, a, b)])
      edges.push([corner(a, 0, b), corner(a, 1, b)])
      edges.push([corner(a, b, 0), corner(a, b, 1)])
    }
  }
  return edges
}
