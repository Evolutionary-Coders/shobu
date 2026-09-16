import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { GreyboxBlock } from '../arena/greyboxBlockout.ts'
import { type NeonStrip, neonEdgeStrips, type Rgb } from '../arena/neonEdges.ts'

/**
 * Acende as beiradas das plataformas com as fitas de `neonEdges.ts`.
 *
 * **Fundidas por cor.** São cinquenta e duas caixinhas, e cinquenta e dois
 * draw calls para desenhar contorno seria o oposto do que o nfr.md pede do
 * babylon. `MergeMeshes` deixa **uma malha por cor** — três no total —, e o
 * preço é que elas param de ser objetos separados, o que não custa nada aqui:
 * nenhuma fita se move, se apaga ou é atingida.
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (ADR 0001). Onde cada
 * fita fica é testado em `neonEdges.test.ts`.
 *
 * ```ts
 * lightArenaEdges(scene, GREYBOX_BLOCKOUT)
 * ```
 */
export function lightArenaEdges(scene: Scene, blockout: readonly GreyboxBlock[]): void {
  for (const [key, strips] of groupByColour(neonEdgeStrips(blockout))) {
    const merged = Mesh.MergeMeshes(
      strips.map((strip) => createStripMesh(scene, strip)),
      true,
    )
    if (!merged) {
      throw new Error(`MergeMeshes devolveu nada para a cor ${key}; esperado uma malha`)
    }
    merged.name = `arena-neon-${key}`
    merged.material = createNeonMaterial(scene, key, strips[0]?.colourRgb ?? [1, 1, 1])
    finish(merged)
  }
}

/** A cor é a chave: é o que decide quantas malhas a arena vai ter de neon. */
function groupByColour(strips: readonly NeonStrip[]): Map<string, NeonStrip[]> {
  const grouped = new Map<string, NeonStrip[]>()
  for (const strip of strips) {
    const key = strip.colourRgb.join('-')
    const existing = grouped.get(key)
    if (existing) existing.push(strip)
    else grouped.set(key, [strip])
  }
  return grouped
}

function createStripMesh(scene: Scene, strip: NeonStrip): Mesh {
  const [width, height, depth] = strip.sizeM
  const mesh = CreateBox(strip.name, { width, height, depth }, scene)
  mesh.position.set(...strip.centerM)
  return mesh
}

/**
 * `disableLighting`: a fita **é** fonte, não superfície. A chave da arena vem
 * do alto e deixaria as fitas viradas para o outro lado apagadas, quando o
 * ponto delas é justamente acender sozinhas — é a mesma decisão que
 * `loadArenaSkyline.ts` toma com o letreiro da cidade.
 *
 * A névoa fica **ligada**: neon que não desbota com a distância acaba com a
 * profundidade que `arenaFogSpec.ts` acabou de comprar.
 */
function createNeonMaterial(scene: Scene, key: string, colourRgb: Rgb): StandardMaterial {
  const material = new StandardMaterial(`arena-neon-${key}`, scene)
  material.emissiveColor = new Color3(...colourRgb)
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.disableLighting = true
  material.freeze()
  return material
}

/**
 * Matriz congelada e seleção desligada, como toda geometria estática da arena
 * (nfr.md). A fita não para bala: ela mora dentro da caixa de colisão do bloco
 * que contorna, e o hitscan varre as caixas do núcleo, não a cena (ADR 0003).
 */
function finish(mesh: Mesh): void {
  mesh.isPickable = false
  mesh.computeWorldMatrix(true)
  mesh.freezeWorldMatrix()
}
