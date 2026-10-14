import type { Vector3 } from '@shobu/core'

/**
 * O que o ouvido precisa da câmera: onde ela está e um jeito de girar um eixo
 * local para o mundo sem alocar. A `UniversalCamera` do babylon satisfaz isto
 * como veio, e o teste usa uma câmera falsa.
 */
export interface EarCamera<Axis extends Vector3> {
  readonly globalPosition: Readonly<Vector3>
  getDirectionToRef(localAxis: Axis, result: Axis): unknown
}

/**
 * O ouvido é a câmera: onde ela está e para onde olha, em mundo, escritos nos
 * vetores do áudio. `ahead` é o eixo da frente da câmera no espaço dela, e
 * `scratch` o rascunho do giro — os dois criados uma vez, porque isto roda
 * por quadro.
 *
 * ```ts
 * listen: listenFromCamera(camera, Vector3.Forward(), new Vector3())
 * ```
 */
export function listenFromCamera<Axis extends Vector3>(
  camera: EarCamera<Axis>,
  ahead: Axis,
  scratch: Axis,
): (eyeOut: Vector3, forwardOut: Vector3) => void {
  return (eyeOut, forwardOut) => {
    const eye = camera.globalPosition
    eyeOut.x = eye.x
    eyeOut.y = eye.y
    eyeOut.z = eye.z
    camera.getDirectionToRef(ahead, scratch)
    forwardOut.x = scratch.x
    forwardOut.y = scratch.y
    forwardOut.z = scratch.z
  }
}
