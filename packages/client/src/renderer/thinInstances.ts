import '@babylonjs/core/Meshes/thinInstanceMesh'
import { Matrix } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Mesh } from '@babylonjs/core/Meshes/mesh'

/**
 * Troca as instâncias do cenário (lanternas, escadas de incêndio, o kit de
 * prédios — ~1800 objetos) por **thin instances**: cada peça-fonte vira uma
 * malha só, com as matrizes das cópias num buffer estático, enviado à gpu uma
 * vez.
 *
 * Com `InstancedMesh`, o babylon avalia cada cópia a cada quadro (frustum,
 * ativação) e reenvia o buffer de matrizes das visíveis — era o maior custo de
 * cpu e a maior fonte de lixo do quadro com a cpu de celular (medição de
 * 11/10, 4× mais lenta). Com thin instances, a peça é avaliada uma vez e
 * desenhada inteira: a gpu desenha cópias fora de quadro, troca barata num
 * jogo limitado por cpu.
 *
 * O cenário não se mexe: as matrizes são as de agora, para sempre.
 *
 * ```ts
 * bakeInstancesIntoThin(loaded.meshes) // 1807
 * ```
 */
export function bakeInstancesIntoThin(meshes: readonly AbstractMesh[]): number {
  let converted = 0
  for (const mesh of meshes) {
    if (mesh instanceof Mesh && mesh.instances.length > 0) converted += toThin(mesh)
  }
  return converted
}

/**
 * A matriz de uma thin instance é relativa à malha-fonte (o babylon a compõe
 * com o mundo dela), e a própria fonte deixa de ser desenhada sozinha: entra
 * como a primeira cópia, na identidade.
 */
function toThin(source: Mesh): number {
  const instances = [...source.instances]
  const toSource = source.computeWorldMatrix(true).clone().invert()
  const relative = new Matrix()
  const buffer = new Float32Array(16 * (instances.length + 1))
  Matrix.IdentityReadOnly.copyToArray(buffer, 0)
  for (const [index, instance] of instances.entries()) {
    instance.computeWorldMatrix(true).multiplyToRef(toSource, relative)
    relative.copyToArray(buffer, 16 * (index + 1))
  }
  source.thinInstanceSetBuffer('matrix', buffer, 16, true)
  // a caixa de recorte passa a cobrir todas as cópias, no bairro inteiro.
  source.thinInstanceRefreshBoundingInfo(true)
  for (const instance of instances) instance.dispose()
  return instances.length
}
