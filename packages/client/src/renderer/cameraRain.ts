import type { Camera } from '@babylonjs/core/Cameras/camera'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  curtainSizeAt,
  paintRainStreaks,
  type RainSpec,
  rainOpacityWhileScoping,
  rainScrollAt,
} from '../arena/rainSpec.ts'

/**
 * A chuva presa à câmera (`rainSpec.ts`): cortinas filhas da câmera do mundo,
 * aditivas, com a textura de riscos deslizando para baixo a cada quadro.
 *
 * Uma textura e uma cortina por distância — um draw call por cortina no mapa
 * inteiro, em qualquer predefinição, e nada alocado por quadro: o laço só
 * escreve o `vOffset` de cada textura e a opacidade de cada cortina.
 *
 * Com a luneta abrindo, a chuva some (`rainOpacityWhileScoping`): presa ao
 * olho, ela seria ampliada junto com o mundo, em cima do alvo.
 *
 * Sem névoa no material, pelo mesmo motivo do halo (`loadArenaScenery.ts`): a
 * névoa puxa o preto para a cor dela, e a cortina viraria um véu.
 *
 * ```ts
 * attachCameraRain(scene, camera, neonRain(), () => scopeBlend(zoom))
 * ```
 */
export function attachCameraRain(
  scene: Scene,
  camera: Camera,
  spec: RainSpec,
  scopeBlend: () => number,
): void {
  const curtains = spec.curtainsM.map((distanceM, index) =>
    createCurtain(scene, camera, spec, distanceM, index),
  )
  let elapsedS = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsedS += scene.getEngine().getDeltaTime() / 1000
    const opacity = rainOpacityWhileScoping(scopeBlend())
    for (let index = 0; index < curtains.length; index += 1) {
      const curtain = curtains[index]
      if (!curtain) continue
      curtain.texture.vOffset = rainScrollAt(spec, index, elapsedS)
      // apagada, a cortina nem entra na lista de desenho.
      curtain.plane.isVisible = opacity > 0
      curtain.plane.visibility = opacity
    }
  })
}

interface RainCurtain {
  readonly plane: Mesh
  readonly texture: Texture
}

function createCurtain(
  scene: Scene,
  camera: Camera,
  spec: RainSpec,
  distanceM: number,
  index: number,
): RainCurtain {
  const [width, height] = curtainSizeAt(spec, distanceM)
  const plane = CreatePlane(`chuva-${index}`, { width, height }, scene)
  plane.parent = camera
  plane.position.set(0, 0, distanceM)
  plane.isPickable = false
  plane.alwaysSelectAsActiveMesh = true
  const texture = rainTexture(scene, spec, distanceM, index)
  plane.material = curtainMaterial(scene, texture, index)
  return { plane, texture }
}

function rainTexture(scene: Scene, spec: RainSpec, distanceM: number, index: number): RawTexture {
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
  const [curtainWidthM, curtainHeightM] = curtainSizeAt(spec, distanceM)
  texture.uScale = curtainWidthM / spec.tileM[0]
  texture.vScale = curtainHeightM / spec.tileM[1]
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
