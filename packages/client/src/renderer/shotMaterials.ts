import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/Shaders/default.fragment'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'

/**
 * Os materiais do tiro com textura: o feixe, o clarão e o furo. Sem teste: é
 * adapter puro de engine (ADR 0001). As texturas saem de
 * `npm run build:shot-sprites`.
 *
 * **Um material por camada, compartilhado** por todas as malhas dela, como em
 * `beamMeshes.ts`: o esmaecimento é por malha (`visibility`) ou por instância
 * (cor), e nunca por clone de material — nada de material novo por tiro.
 */
export const SHOT_TEXTURE_DIR = '/assets/textures/shot/'

/**
 * Chama `callback` quando todas as texturas do tiro já chegaram. É o que o
 * aquecimento espera: material com textura pendente não fica pronto, o
 * babylon pula o desenho, e o shader só compilava no primeiro tiro de
 * verdade — a travada que o aquecimento existe para tirar.
 *
 * ```ts
 * whenShotTexturesReady(scene, () => shots.warmUp(eye, ahead))
 * ```
 */
export function whenShotTexturesReady(scene: Scene, callback: () => void): void {
  const textures = scene.textures.filter((texture) => texture.name.includes(SHOT_TEXTURE_DIR))
  BaseTexture.WhenAllReady(textures, callback)
}

/**
 * Luz somada, com a forma e o degradê na textura e a cor no `tint`. Sem
 * iluminação e sem depth: o feixe é luz, e luz não esconde o que está atrás.
 *
 * ```ts
 * const halo = glowMaterial(scene, 'tracer-halo', 'tracer-profile.png', new Color3(1, 0.26, 0.3))
 * ```
 */
export function glowMaterial(
  scene: Scene,
  name: string,
  textureFile: string,
  tint: Color3,
): StandardMaterial {
  const material = texturedMaterial(scene, name, textureFile)
  // sem iluminação, o babylon desenha `emissive × textura`: o tint pinta a
  // forma branca da textura.
  material.emissiveColor = tint
  material.alphaMode = Constants.ALPHA_ADD
  material.disableDepthWrite = true
  material.freeze()
  return material
}

/**
 * O furo de bala: mistura alfa comum, puxado para a frente no depth para não
 * brigar com a parede (`zOffset`), e um pouco abaixo do branco — sem luz, um
 * furo de brilho cheio parece adesivo à noite.
 */
export function decalMaterial(scene: Scene, name: string, textureFile: string): StandardMaterial {
  const material = texturedMaterial(scene, name, textureFile)
  material.emissiveColor = new Color3(0.8, 0.8, 0.8)
  material.alphaMode = Constants.ALPHA_COMBINE
  material.disableDepthWrite = true
  material.zOffset = -2
  material.freeze()
  return material
}

function texturedMaterial(scene: Scene, name: string, textureFile: string): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  const texture = new Texture(`${SHOT_TEXTURE_DIR}${textureFile}`, scene)
  texture.hasAlpha = true
  // a fita e o clarão não repetem: sem `CLAMP`, a borda do quad puxa o pixel
  // do lado oposto da textura e desenha um fio na ponta.
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  material.diffuseTexture = texture
  material.useAlphaFromDiffuseTexture = true
  material.disableLighting = true
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  // a passada transparente, sempre: ver o mesmo comentário em `beamMeshes.ts`.
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = false
  return material
}
