import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'

/**
 * A ADR 0004 proíbe pbr, e todo glb chega com `PBRMaterial`. Trocar por
 * `StandardMaterial` preserva o que os assets deste projeto realmente usam —
 * cor de base e, quando há, a textura de base — e sai do caminho de iluminação
 * caro. Filtro **nearest** na textura: metade da receita do look ps1, e a
 * textura já foi reduzida para 256 px na conversão pensando nisso.
 *
 * Cada carregamento cria os próprios materiais. Com oito competidores isso é
 * material duplicado por jogador, e a saída é malha instanciada com esqueleto
 * compartilhado — problema do multiplayer (ADR 0002), não deste carregamento.
 *
 * ```ts
 * for (const mesh of loaded.meshes) flattenPbrMaterial(mesh, scene, 'competitor')
 * ```
 */
export function flattenPbrMaterial(mesh: AbstractMesh, scene: Scene, prefix: string): void {
  const source = mesh.material
  if (!(source instanceof PBRMaterial)) return
  const flat = new StandardMaterial(`${prefix}-${source.name}`, scene)
  flat.diffuseColor = source.albedoColor.clone()
  flat.specularColor = Color3.Black()
  flat.alpha = source.alpha
  applyBaseTexture(flat, source)
  flat.freeze()
  mesh.material = flat
}

function applyBaseTexture(flat: StandardMaterial, source: PBRMaterial): void {
  const albedo = source.albedoTexture
  if (!albedo) return
  if (albedo instanceof Texture) albedo.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
  flat.diffuseTexture = albedo
  // a cor de base do glTF multiplica a textura; o standard faz o mesmo com a difusa.
  flat.diffuseColor = source.albedoColor.clone()
}
