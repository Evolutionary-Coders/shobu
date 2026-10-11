import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import { type CandidateCache, createCandidateCache } from './candidateCache.ts'
import { verticalFovRad } from './fieldOfView.ts'
import { VIEWMODEL_FOV_DEG, VIEWMODEL_LAYER } from './viewmodelCamera.ts'

/**
 * Uma câmera só para a arma: fov próprio, profundidade própria e depth próprio.
 *
 * `maxZ` de 10 m e não dos 400 m do hitscan: a arma acaba em z ≈ 1,4 m, e uma
 * faixa de profundidade de 1000:1 em vez de 40000:1 é precisão de depth buffer
 * de graça. Sem entrada nenhuma, porque quem recebe o mouse é a câmera do
 * mundo e esta só copia a pose dela.
 *
 * Mora sozinho neste arquivo porque é a **única** linha de engine do assunto:
 * a máscara, o enquadramento e a cópia de pose ficam em `viewmodelCamera.ts`,
 * que roda em node e é testado. Juntos, o arquivo inteiro teria de sair da
 * conta de cobertura, e o enquadramento é justamente o que precisa de teste.
 *
 * ```ts
 * const camera = createViewmodelCamera(scene, canvas.clientWidth / canvas.clientHeight)
 * ```
 */
export function createViewmodelCamera(scene: Scene, aspectRatio: number): UniversalCamera {
  const camera = new UniversalCamera('viewmodel-camera', Vector3.Zero(), scene)
  camera.fov = verticalFovRad(VIEWMODEL_FOV_DEG, aspectRatio)
  camera.minZ = 0.01
  camera.maxZ = 10
  camera.layerMask = VIEWMODEL_LAYER
  camera.inputs.clear()
  return camera
}

/**
 * Para esta câmera, os candidatos a desenho são só as malhas da arma.
 *
 * O babylon avalia a cena inteira **para cada câmera ativa**, e a máscara de
 * camada só descarta a malha depois de a ter visitado: ~1800 objetos do
 * cenário avaliados de novo a cada quadro para desenhar uma arma de doze
 * malhas — ~4 ms de cpu por quadro na medição de 11/10. A lista guardada se
 * refaz quando a cena muda (`candidateCache.ts`); quem troca a camada de uma
 * malha que já está na cena chama `invalidate`.
 *
 * ```ts
 * const candidates = offerOnlyTheViewmodel(scene, viewmodelCamera)
 * maskAsViewmodel(meshes)
 * candidates.invalidate()
 * ```
 */
export function offerOnlyTheViewmodel(
  scene: Scene,
  camera: UniversalCamera,
): Pick<CandidateCache<AbstractMesh>, 'invalidate'> {
  const everything = scene.getActiveMeshCandidates.bind(scene)
  const viewmodel = createCandidateCache(
    (mesh: AbstractMesh) => (mesh.layerMask & VIEWMODEL_LAYER) !== 0,
  )
  scene.onNewMeshAddedObservable.add(() => viewmodel.invalidate())
  scene.onMeshRemovedObservable.add(() => viewmodel.invalidate())
  scene.getActiveMeshCandidates = () =>
    scene.activeCamera === camera ? viewmodel.list(scene.meshes) : everything()
  return { invalidate: viewmodel.invalidate }
}
