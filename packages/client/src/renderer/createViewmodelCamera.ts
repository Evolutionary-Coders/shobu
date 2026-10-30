import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import { type CandidateCache, createCandidateCache } from './candidateCache.ts'
import { verticalFovRad } from './fieldOfView.ts'
import { followWorldCamera, VIEWMODEL_FOV_DEG, VIEWMODEL_LAYER } from './viewmodelCamera.ts'

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

/**
 * Mantém a câmera do viewmodel colada na do mundo, **na matriz que de fato
 * desenha**.
 *
 * A cópia tem que acontecer depois de tudo que mexe na câmera do mundo no
 * quadro — o olho interpolado e o coice — e por isso não pode ficar em
 * `onBeforeRenderObservable`, que roda antes desses passos quando registrada
 * cedo.
 *
 * E copiar em `onBeforeCameraRenderObservable` **também não basta sozinho**: o
 * babylon chama `updateTransformMatrix()` **antes** de notificar esse
 * observável (`scene.pure.js`, em `_renderForCamera`), então a matriz de vista
 * já foi calculada com a pose antiga e a cópia só valeria no quadro seguinte.
 * Era isso que fazia a arma tremer quando o jogador girava a mira: ela é filha
 * da câmera do mundo e ia junto na hora, mas era desenhada por uma câmera um
 * quadro atrás.
 *
 * Refazer a matriz depois de copiar é o que fecha a conta. **Medido**: com a
 * câmera girando a 0,02 rad por quadro, a arma andava até 2293 px na tela sem
 * a segunda linha, e 0,01 px com ela.
 *
 * ```ts
 * followViewmodelCamera(scene, camera, viewmodelCamera)
 * ```
 */
export function followViewmodelCamera(
  scene: Scene,
  world: UniversalCamera,
  viewmodel: UniversalCamera,
): void {
  scene.onBeforeCameraRenderObservable.add((rendering) => {
    if (rendering !== viewmodel) return
    followWorldCamera(world, viewmodel)
    scene.updateTransformMatrix()
  })
}
