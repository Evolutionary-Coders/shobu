import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { FinishColor, WeaponFinish } from '../loadout/weaponFinishes.ts'
import { isBladeGlow, sniperSkinSlot } from './selfLitParts.ts'
import type { SniperSkin } from './sniperSkinTextures.ts'

/**
 * O acabamento da classe nos materiais da arma (ADR 0021). Adapter: só troca
 * cor ou textura de material que `flattenPbrMaterial` já fez `StandardMaterial`. Os
 * materiais vêm congelados, e por isso cada pintura descongela, pinta e
 * congela de novo — é gesto de menu, fora do caminho quente.
 */

/** As texturas que o glb trouxe para um material, antes da primeira pintura. */
interface GlbTextures {
  readonly diffuse: BaseTexture | null
  readonly emissive: BaseTexture | null
}

/**
 * As texturas de origem de cada material da sniper. É o que a PRETA devolve:
 * antes do atlas, a PRETA multiplicava por branco, e com a textura trocada
 * multiplicar por branco deixaria o último acabamento na arma.
 */
const GLB_TEXTURES = new WeakMap<StandardMaterial, GlbTextures>()

function glbTexturesOf(material: StandardMaterial): GlbTextures {
  const saved = GLB_TEXTURES.get(material)
  if (saved) return saved
  const original = { diffuse: material.diffuseTexture, emissive: material.emissiveTexture }
  GLB_TEXTURES.set(material, original)
  return original
}

/**
 * A sniper no acabamento: o corpo ganha o atlas e a máscara de luz dele, e o
 * neon da HANABI a paleta trocada (`sniperSkinSlot`). Sem acabamento (a PRETA),
 * ou sem paleta, cada material volta às texturas do glb. Serve às duas
 * snipers: a laser tem os mesmos nós, mais os `laser_*`.
 *
 * ```ts
 * paintSniper(viewmodel.root.getChildMeshes(), skins(sniperSkinUrls(viewmodel.weapon, finish)))
 * ```
 */
export function paintSniper(meshes: readonly AbstractMesh[], skin: SniperSkin | undefined): void {
  for (const mesh of meshes) {
    const material = mesh.material
    if (material instanceof StandardMaterial) paintSniperPart(material, mesh.name, skin)
  }
}

function paintSniperPart(
  material: StandardMaterial,
  meshName: string,
  skin: SniperSkin | undefined,
): void {
  const slot = sniperSkinSlot(meshName, material.name)
  if (slot === 'skip') return
  // cada malha tem o próprio material achatado (`flattenPbrMaterial`): trocar
  // a textura de uma não vaza para o braço nem para a lente.
  const pair = slot === 'body' ? skin?.body : skin?.palette
  const glb = glbTexturesOf(material)
  retexture(material, pair ? { diffuse: pair.base, emissive: pair.glow } : glb)
}

function retexture(material: StandardMaterial, textures: GlbTextures): void {
  material.unfreeze()
  material.diffuseTexture = textures.diffuse
  material.emissiveTexture = textures.emissive
  // o shader padrão **soma** a emissiva à cor emissiva (`applyEmissiveTexture`).
  material.emissiveColor = Color3.Black()
  material.freeze()
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
  if (isBladeGlow(material.name)) repaint(material, glow, glow)
}

function repaint(material: StandardMaterial, body: FinishColor, glow?: FinishColor): void {
  material.unfreeze()
  material.diffuseColor = new Color3(...body)
  material.emissiveColor = glow ? new Color3(...glow) : Color3.Black()
  material.freeze()
}
