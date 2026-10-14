import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { FinishColor, WeaponFinish } from '../loadout/weaponFinishes.ts'

/**
 * O acabamento da classe nos materiais da arma (ADR 0021). Adapter: só troca
 * cor de material que `flattenPbrMaterial` já fez `StandardMaterial`. Os
 * materiais vêm congelados, e por isso cada pintura descongela, pinta e
 * congela de novo — é gesto de menu, fora do caminho quente.
 */

/** As peças da sniper que acendem no acabamento: a luneta e o carregador. */
const SNIPER_ACCENTS = ['scope_sniper', 'mag_sniper']

/**
 * A sniper inteira, menos os braços: o corpo multiplica a textura, e os
 * acentos ganham luz própria. A PRETA, sem cor nenhuma, devolve o glb como
 * ele veio.
 *
 * ```ts
 * paintSniper(viewmodel.root.getChildMeshes(), finishAt(SNIPER_FINISHES, 1))
 * ```
 */
export function paintSniper(meshes: readonly AbstractMesh[], finish: WeaponFinish): void {
  for (const mesh of meshes) {
    const material = mesh.material
    if (!(material instanceof StandardMaterial) || mesh.name.includes('arms')) continue
    const accent = SNIPER_ACCENTS.some((name) => mesh.name.includes(name))
    repaint(material, finish.body ?? WHITE, accent ? finish.glow : undefined)
  }
}

/** As cores de origem de uma lâmina, guardadas antes da primeira pintura. */
export interface BladeColors {
  readonly blade: FinishColor
  readonly glow: FinishColor
}

/**
 * A lâmina: o corpo é a cor da lâmina, e a luz vai para o fio e para o filete
 * da luva. Sem cor no acabamento, a de origem do glb (`melee_blades.py`).
 *
 * ```ts
 * paintBlade(meshes, finishAt(KATANA_FINISHES, 2), origin)
 * ```
 */
export function paintBlade(
  meshes: readonly AbstractMesh[],
  finish: WeaponFinish,
  origin: BladeColors,
): void {
  const glow = finish.glow ?? origin.glow
  const body = finish.body ?? origin.blade
  for (const mesh of meshes) {
    const material = mesh.material
    if (material instanceof StandardMaterial) paintBladePart(material, body, glow)
  }
}

function paintBladePart(material: StandardMaterial, body: FinishColor, glow: FinishColor): void {
  if (material.name.endsWith('M_Lamina')) repaint(material, body)
  if (isGlowing(material.name)) repaint(material, glow, glow)
}

/** O fio da lâmina e o filete da luva: as duas peças que acendem. */
function isGlowing(name: string): boolean {
  return name.endsWith('M_Fio') || name.endsWith('M_Filete')
}

const WHITE: FinishColor = [1, 1, 1]

function repaint(material: StandardMaterial, body: FinishColor, glow?: FinishColor): void {
  material.unfreeze()
  material.diffuseColor = new Color3(...body)
  material.emissiveColor = glow ? new Color3(...glow) : Color3.Black()
  material.freeze()
}
