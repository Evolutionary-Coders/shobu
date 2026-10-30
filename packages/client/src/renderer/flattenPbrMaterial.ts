import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'

/**
 * A ADR 0004 proíbe pbr, e todo glb chega com `PBRMaterial`. Trocar por
 * `StandardMaterial` preserva o que os assets deste projeto realmente usam —
 * cor de base, a textura de base e a emissiva, quando há — e sai do caminho de iluminação
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
  applyFlatEmissive(flat, source)
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

/**
 * O neon pintado na textura (o `laser_*` da sniper laser, as placas dos
 * braços): sem isto o achatamento jogava a emissiva fora e o neon chegava
 * apagado. Nearest como a de base, pelo mesmo look ps1. O fator de emissão
 * sem textura fica de fora de propósito: as lâminas (`M_Fio`) e os humanos
 * (`M_Accent`) o têm, e quem os pinta já o reescreve.
 */
function applyFlatEmissive(flat: StandardMaterial, source: PBRMaterial): void {
  const emissive = source.emissiveTexture
  if (emissive instanceof Texture) emissive.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
  applyEmissiveTexture(flat, source)
}

/**
 * A textura emissiva do glTF num `StandardMaterial`, com a cor emissiva preta.
 * O shader padrão do babylon **soma** a textura emissiva à cor emissiva — não
 * multiplica —, então com textura a cor tem que ser preta: com o fator branco
 * do glTF, todo letreiro e todo halo saía branco chapado (captura do
 * look-dev, 11/10). Sem textura, não mexe em nada.
 *
 * ```ts
 * applyEmissiveTexture(material, source)
 * ```
 */
export function applyEmissiveTexture(material: StandardMaterial, source: PBRMaterial): void {
  if (!source.emissiveTexture) return
  material.emissiveTexture = source.emissiveTexture
  material.emissiveColor = Color3.Black()
}
