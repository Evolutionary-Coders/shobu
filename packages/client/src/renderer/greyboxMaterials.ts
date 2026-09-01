import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaLayer } from '../arena/greyboxBlockout.ts'

/**
 * Um material por camada, congelado. `StandardMaterial` e não PBR por decisão
 * de arte com efeito direto no orçamento de quadro (ADR 0004); `freeze()`
 * porque material congelado sai do recálculo por quadro (nfr.md).
 *
 * A cor separa as camadas só o bastante para ler a verticalidade no greybox —
 * a identidade visual do jogo mora na ui, não aqui.
 */
const LAYER_TINTS: Readonly<Record<ArenaLayer, readonly [number, number, number]>> = {
  shell: [0.18, 0.18, 0.22],
  ground: [0.4, 0.4, 0.45],
  mid: [0.58, 0.5, 0.4],
  top: [0.78, 0.62, 0.34],
}

export function createLayerMaterials(scene: Scene): ReadonlyMap<ArenaLayer, StandardMaterial> {
  const materials = new Map<ArenaLayer, StandardMaterial>()
  for (const [layer, tint] of Object.entries(LAYER_TINTS)) {
    materials.set(layer as ArenaLayer, createGreyboxMaterial(scene, layer, tint))
  }
  return materials
}

function createGreyboxMaterial(
  scene: Scene,
  layer: string,
  tint: readonly [number, number, number],
): StandardMaterial {
  const material = new StandardMaterial(`greybox-${layer}`, scene)
  material.diffuseColor = new Color3(...tint)
  material.specularColor = Color3.Black()
  material.freeze()
  return material
}
