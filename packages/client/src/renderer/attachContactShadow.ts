import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  type ContactShadowSpec,
  contactShadowSpec,
  paintContactShadow,
} from './contactShadowSpec.ts'

/** Acima do chão o bastante para não brigar de profundidade com o asfalto do bake. */
const LIFT_M = 0.02

const materials = new WeakMap<Scene, StandardMaterial>()

/**
 * Põe a sombra de contato sob os pés de um avatar, como filha da raiz dele:
 * anda, gira e some junto — o boneco de treino desligado leva a sombra junto.
 *
 * A raiz do glb vem escalada (`competitorAvatarScale`), e a filha herdaria a
 * escala; por isso posição e tamanho são divididos por ela, e o disco tem o
 * raio de `contactShadowSpec` em metros de mundo.
 *
 * ```ts
 * attachContactShadow(scene, avatar.root)
 * ```
 */
export function attachContactShadow(scene: Scene, root: AbstractMesh): Mesh {
  const spec = contactShadowSpec()
  const scale = root.scaling.y
  const disc = CreateDisc('sombra-de-contato', { radius: spec.radiusM, tessellation: 24 }, scene)
  disc.material = contactShadowMaterial(scene, spec)
  disc.parent = root
  disc.position.set(0, LIFT_M / scale, 0)
  disc.scaling.setAll(1 / scale)
  // o disco nasce em pé, no plano xy; deitado, a face olha para cima.
  disc.rotation.x = Math.PI / 2
  disc.isPickable = false
  return disc
}

/** Um material por cena: todo avatar divide a mesma textura e o mesmo shader. */
function contactShadowMaterial(scene: Scene, spec: ContactShadowSpec): StandardMaterial {
  const cached = materials.get(scene)
  if (cached) return cached
  const material = new StandardMaterial('sombra-de-contato', scene)
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.disableLighting = true
  material.opacityTexture = contactShadowTexture(scene, spec)
  // vista de baixo — de dentro de uma escada, pela fresta de uma laje — a
  // sombra também precisa existir, e a escala espelhada do glb inverte a face.
  material.backFaceCulling = false
  material.zOffset = -2
  materials.set(scene, material)
  return material
}

function contactShadowTexture(scene: Scene, spec: ContactShadowSpec): RawTexture {
  const texture = RawTexture.CreateRGBATexture(
    paintContactShadow(spec),
    spec.sizePx,
    spec.sizePx,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  texture.hasAlpha = true
  return texture
}
