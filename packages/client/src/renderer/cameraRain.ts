import type { Camera } from '@babylonjs/core/Cameras/camera'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import type { Scene } from '@babylonjs/core/scene'
import { paintRainStreaks, type RainSpec, rainScrollAt } from '../arena/rainSpec.ts'

/**
 * A chuva presa à câmera (`rainSpec.ts`): cortinas filhas da câmera do mundo,
 * aditivas, com a textura de riscos deslizando para baixo a cada quadro.
 *
 * Uma textura e uma cortina por distância — três draw calls no mapa inteiro,
 * em qualquer predefinição, e nada alocado por quadro: o laço só escreve o
 * `vOffset` de cada textura.
 *
 * Sem névoa no material, pelo mesmo motivo do halo (`loadArenaScenery.ts`): a
 * névoa puxa o preto para a cor dela, e a cortina viraria um véu.
 *
 * ```ts
 * attachCameraRain(scene, camera, neonRain())
 * ```
 */
export function attachCameraRain(scene: Scene, camera: Camera, spec: RainSpec): void {
  const textures = spec.curtainsM.map((distanceM, index) =>
    createCurtain(scene, camera, spec, distanceM, index),
  )
  let elapsedS = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsedS += scene.getEngine().getDeltaTime() / 1000
    for (let index = 0; index < textures.length; index += 1) {
      const texture = textures[index]
      if (texture) texture.vOffset = rainScrollAt(spec, index, elapsedS)
    }
  })
}

function createCurtain(
  scene: Scene,
  camera: Camera,
  spec: RainSpec,
  distanceM: number,
  index: number,
): Texture {
  const [width, height] = spec.curtainSizeM
  const plane = CreatePlane(`chuva-${index}`, { width, height }, scene)
  plane.parent = camera
  plane.position.set(0, 0, distanceM)
  plane.isPickable = false
  plane.alwaysSelectAsActiveMesh = true
  const texture = rainTexture(scene, spec, index)
  plane.material = curtainMaterial(scene, texture, index)
  return texture
}

function rainTexture(scene: Scene, spec: RainSpec, index: number): RawTexture {
  const [width, height] = spec.sizePx
  const texture = RawTexture.CreateRGBATexture(
    paintRainStreaks({ ...spec, seed: spec.seed + index }),
    width,
    height,
    scene,
    true,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  // a mesma textura repetida na largura e na altura da cortina: o risco fica
  // fino de perto em vez de esticado.
  texture.uScale = spec.curtainSizeM[0] / spec.tileM[0]
  texture.vScale = spec.curtainSizeM[1] / spec.tileM[1]
  return texture
}

function curtainMaterial(scene: Scene, texture: Texture, index: number): StandardMaterial {
  const material = new StandardMaterial(`chuva-${index}`, scene)
  material.disableLighting = true
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.emissiveColor = Color3.Black()
  material.emissiveTexture = texture
  material.alphaMode = Constants.ALPHA_ADD
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.disableDepthWrite = true
  material.backFaceCulling = false
  material.fogEnabled = false
  return material
}
