import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'

/**
 * O bit que a câmera do mundo não enxerga. O padrão do babylon, tanto em malha
 * quanto em câmera, é `0x0fffffff`, então marcar o viewmodel com um bit fora
 * desse padrão não exige tocar em nenhuma malha do mundo nem na câmera dele.
 */
export const VIEWMODEL_LAYER = 0x10000000
export const WORLD_LAYER = 0x0fffffff

/**
 * O fov do viewmodel, horizontal, em graus — nada a ver com o do mundo.
 *
 * A arma era desenhada com os 120° do mundo, e era isso que a fazia "parecer
 * largada": num frustum tão largo o braço, que vai até 0,70 m atrás da origem
 * do rig, cai **atrás do olho** e aparece cortado na borda da tela. Fov
 * estreito joga essa geometria para fora do frustum lateralmente — é o corte
 * que resolve, não o `minZ`.
 */
export const VIEWMODEL_FOV_DEG = 65

/**
 * O olhal da luneta, em metros no espaço do rig. Medido no glb: o centro da
 * malha `lens_lens_0`. É o ponto de referência do enquadramento, porque foi a
 * luneta que a equipe posicionou a olho (ver `SNIPER_PLACEMENT`).
 */
export const SCOPE_EYEPIECE_M: readonly [number, number, number] = [0, 0.172, -0.141]

/** O que este módulo usa de uma malha. Estrutural: o teste roda em node. */
export interface Maskable {
  layerMask: number
}

/** Tira as malhas da vista da câmera do mundo e as entrega à do viewmodel. */
export function maskAsViewmodel(meshes: readonly Maskable[]): void {
  for (const mesh of meshes) mesh.layerMask = VIEWMODEL_LAYER
}

export interface CameraPose {
  readonly position: { x: number; y: number; z: number }
  readonly rotation: { x: number; y: number; z: number }
}

export interface MutableCameraPose {
  readonly position: { copyFrom(source: { x: number; y: number; z: number }): unknown }
  readonly rotation: { copyFrom(source: { x: number; y: number; z: number }): unknown }
}

/**
 * Copia a pose da câmera do mundo.
 *
 * **Chamar imediatamente antes do passe da câmera do viewmodel**, em
 * `onBeforeCameraRenderObservable` — não em `onBeforeRenderObservable`. A arma
 * é filha da câmera do mundo, e tudo que move essa câmera (o olho interpolado,
 * o coice) roda em passos de quadro registrados depois: copiar cedo desenha a
 * arma de uma pose e a câmera de outra, e a arma nada na tela.
 *
 * Cópia explícita e não `camera.parent`: o babylon resolve o pai por
 * `getWorldMatrix()`, que numa câmera é derivada dentro de `getViewMatrix()`,
 * e isso é uma dependência de ordem entre as duas câmeras que não vale a pena
 * ter num laço que já é apertado.
 */
export function followWorldCamera(world: CameraPose, viewmodel: MutableCameraPose): void {
  viewmodel.position.copyFrom(world.position)
  viewmodel.rotation.copyFrom(world.rotation)
}

/**
 * Onde um ponto do rig cai na tela, em frações de meia-largura e meia-altura:
 * (0, 0) é o centro, (1, 1) a quina superior direita.
 *
 * Existe para o enquadramento da arma ser resolvido em vez de adivinhado. A
 * posição foi ajustada a olho uma vez, com 120°; mudar o fov exige mover o
 * deslocamento, e "multiplicar pela razão das tangentes" **não** preserva o
 * enquadramento porque a arma não muda de tamanho junto. O que se preserva é
 * este ponto de tela.
 *
 * ```ts
 * framePoint(SNIPER_PLACEMENT, SCOPE_EYEPIECE_M, VIEWMODEL_FOV_DEG, 16 / 9)
 * // [0.335, 0.113] — a luneta onde ela sempre esteve
 * ```
 */
export function framePoint(
  placement: ViewmodelPlacement,
  pointM: readonly [number, number, number],
  horizontalFovDeg: number,
  aspectRatio: number,
): readonly [number, number] {
  const [x, y, z] = rotatePoint(pointM, placement.yawRad, placement.pitchRad)
  const depth = z + placement.offsetM[2]
  if (depth <= 0) {
    throw new RangeError(`o ponto caiu em z ${depth}; esperado > 0, à frente do olho`)
  }
  const halfWidth = depth * Math.tan((horizontalFovDeg * Math.PI) / 360)
  return [
    (x + placement.offsetM[0]) / halfWidth,
    ((y + placement.offsetM[1]) * aspectRatio) / halfWidth,
  ]
}

/** Yaw e depois pitch, a ordem que o babylon usa em `rotation` (YXZ). */
function rotatePoint(
  pointM: readonly [number, number, number],
  yawRad: number,
  pitchRad: number,
): readonly [number, number, number] {
  const [x, y, z] = pointM
  const pitchedY = y * Math.cos(pitchRad) - z * Math.sin(pitchRad)
  const pitchedZ = y * Math.sin(pitchRad) + z * Math.cos(pitchRad)
  return [
    x * Math.cos(yawRad) + pitchedZ * Math.sin(yawRad),
    pitchedY,
    -x * Math.sin(yawRad) + pitchedZ * Math.cos(yawRad),
  ]
}
