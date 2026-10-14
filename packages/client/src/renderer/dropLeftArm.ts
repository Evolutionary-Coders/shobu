import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Node } from '@babylonjs/core/node'
import type { Scene } from '@babylonjs/core/scene'

/** O ombro esquerdo do rig do viewmodel da sniper (`sniper.glb`). */
const LEFT_SHOULDER = 'L_arm_01'

/**
 * O giro que tira o braço esquerdo do quadro, nos eixos da câmera: o braço
 * desce em volta do ombro, para baixo e para trás. Acertado num render do
 * blender e nas capturas.
 */
const DROP_AXIS = new Vector3(1, 0, 0)
const DROP_RAD = 1.4

/**
 * Na corrida plena a mão esquerda solta a arma (a corrida do warzone): o
 * `allanims` não tem esse gesto, então o ombro esquerdo gira **por cima** do
 * que a animação escreveu, na medida do peso da pose (`weight`, de 0 a 1), e
 * volta ao valor da animação depois do quadro desenhado — o clipe parado não
 * reescreve o osso, e sem a volta o giro se acumularia quadro a quadro.
 *
 * Adapter: mexe no nó do esqueleto que o babylon criou para o glTF.
 *
 * ```ts
 * dropLeftArm(scene, viewmodel.root, camera, () => stage.gait.tactical)
 * ```
 */
export function dropLeftArm(
  scene: Scene,
  root: TransformNode,
  camera: Node,
  weight: () => number,
): void {
  const shoulder = root.getChildTransformNodes(false).find((node) => node.name === LEFT_SHOULDER)
  if (!shoulder?.rotationQuaternion) {
    console.error(JSON.stringify({ event: 'left-arm-drop-missing', joint: LEFT_SHOULDER }))
    return
  }
  const animated = shoulder.rotationQuaternion.clone()
  const scratch = createDropScratch()
  let dropped = false
  scene.onBeforeRenderObservable.add(() => {
    const amount = weight()
    dropped = amount > 0
    if (!dropped) return
    animated.copyFrom(shoulder.rotationQuaternion as Quaternion)
    turnShoulder(shoulder, camera, amount, scratch)
  })
  scene.onAfterRenderObservable.add(() => {
    if (dropped) (shoulder.rotationQuaternion as Quaternion).copyFrom(animated)
  })
}

interface DropScratch {
  readonly cameraTurn: Matrix
  readonly parentInCamera: Matrix
  readonly inverse: Matrix
  readonly local: Matrix
  readonly turn: Quaternion
}

function createDropScratch(): DropScratch {
  return {
    cameraTurn: new Matrix(),
    parentInCamera: new Matrix(),
    inverse: new Matrix(),
    local: new Matrix(),
    turn: new Quaternion(),
  }
}

/**
 * O giro da câmera levado ao espaço do pai do ombro: com `A` o pai visto da
 * câmera, `A · giro · A⁻¹` (matrizes de linha do babylon). O pai do glTF
 * carrega o espelho da troca de mão do sistema, e o espelho se cancela na
 * conjugação.
 */
function turnShoulder(
  shoulder: TransformNode,
  camera: Node,
  amount: number,
  scratch: DropScratch,
): void {
  const parent = shoulder.parent as Node
  camera.getWorldMatrix().invertToRef(scratch.inverse)
  parent.getWorldMatrix().multiplyToRef(scratch.inverse, scratch.parentInCamera)
  scratch.parentInCamera.setTranslationFromFloats(0, 0, 0)
  Quaternion.RotationAxisToRef(DROP_AXIS, DROP_RAD * amount, scratch.turn)
  scratch.turn.toRotationMatrix(scratch.cameraTurn)
  scratch.parentInCamera.invertToRef(scratch.inverse)
  scratch.parentInCamera.multiplyToRef(scratch.cameraTurn, scratch.local)
  scratch.local.multiplyToRef(scratch.inverse, scratch.local)
  Quaternion.FromRotationMatrixToRef(scratch.local, scratch.turn)
  const rotation = shoulder.rotationQuaternion as Quaternion
  rotation.multiplyToRef(scratch.turn, rotation)
}
