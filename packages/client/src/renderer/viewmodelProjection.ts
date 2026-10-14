import type { Vector3 } from '@shobu/core'

/**
 * Leva um ponto do espaço da câmera para onde a **câmera do mundo** o
 * desenharia no mesmo pixel em que a **câmera da arma** o desenha.
 *
 * A arma é desenhada com fov próprio, mais estreito que o do mundo
 * (`VIEWMODEL_FOV_DEG`); o feixe, com o do mundo. Saindo da boca do cano em
 * mundo, o feixe nascia longe do cano desenhado — mais perto do centro da
 * tela, porque o fov do mundo é mais largo —, e o clarão e o rastro
 * pareciam duas armas. Escalar x e y pela razão das tangentes, com a mesma
 * profundidade, põe o começo do feixe exatamente sobre o cano.
 *
 * Os dois fov são **verticais**, como o babylon os guarda em `camera.fov`.
 *
 * ```ts
 * matchViewmodelProjection(muzzleInView, viewmodelCamera.fov, camera.fov)
 * ```
 */
export function matchViewmodelProjection(
  pointInView: Vector3,
  viewmodelFovRad: number,
  worldFovRad: number,
): Vector3 {
  if (!(viewmodelFovRad > 0 && viewmodelFovRad < Math.PI)) {
    throw new RangeError(`viewmodelFovRad recebeu ${viewmodelFovRad}; esperado entre 0 e π`)
  }
  if (!(worldFovRad > 0 && worldFovRad < Math.PI)) {
    throw new RangeError(`worldFovRad recebeu ${worldFovRad}; esperado entre 0 e π`)
  }
  const scale = Math.tan(worldFovRad / 2) / Math.tan(viewmodelFovRad / 2)
  pointInView.x *= scale
  pointInView.y *= scale
  return pointInView
}
