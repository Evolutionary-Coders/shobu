import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  isSkylineNeon,
  type SkylinePlacement,
  skylineRingPlacements,
} from '../arena/skylineRing.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/** Servido de `public/`; conta nos cinco segundos do pilar 2 como o js conta. */
const SKYLINE_MODEL_URL = '/assets/arena/skyline.glb'

/**
 * Põe a cidade cyberpunk em volta da arena: um quarteirão baixado uma vez e
 * instanciado nas quatro posições que `skylineRing.ts` calcula.
 *
 * **É cenário, e nada mais.** Não tem colisão, não entra no blockout e não
 * para bala — o hitscan e o controlador varrem as caixas do núcleo (ADR 0003),
 * que não sabem que isto existe. Trocar o anel inteiro não muda uma linha de
 * simulação.
 *
 * `instantiateHierarchy` e não `clone`: instância compartilha a geometria com
 * o original, então as quatro cópias custam um download, uma malha na memória
 * e um punhado de draw calls — e não quatro vezes 64 mil triângulos copiados.
 *
 * ```ts
 * await loadArenaSkyline(scene)
 * ```
 */
export async function loadArenaSkyline(scene: Scene): Promise<void> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(SKYLINE_MODEL_URL, scene)
  const root = loaded.meshes[0]
  if (!root) {
    throw new Error(`${SKYLINE_MODEL_URL} carregou 0 malhas; esperado o root do glb`)
  }
  for (const mesh of loaded.meshes) paintSkylineMesh(mesh, scene)
  for (const [copy, placement] of skylineRingPlacements().entries()) {
    const anchor = anchorFor(scene, copy, placement)
    // a primeira cópia é o próprio glb; o `__root__` do loader guarda a troca
    // de mão do sistema de coordenadas e por isso vira **filho** da âncora em
    // vez de receber a posição direto — sobrescrevê-lo espelharia a cidade.
    if (copy === 0) root.parent = anchor
    else root.instantiateHierarchy(anchor)
    freezeDescendants(anchor)
  }
}

/** Um nó por cópia: leva posição, giro e escala do anel de uma vez só. */
function anchorFor(scene: Scene, copy: number, placement: SkylinePlacement): TransformNode {
  const anchor = new TransformNode(`skyline-${copy}`, scene)
  anchor.position.set(...placement.positionM)
  anchor.rotation.y = placement.yawRad
  anchor.scaling.setAll(placement.scaleFactor)
  return anchor
}

/**
 * O material do glb chega como `PBRMaterial`, que a ADR 0004 proíbe. A
 * estrutura usa o mesmo achatamento do avatar e do viewmodel; o neon precisa
 * de um material próprio, e a diferença é uma linha só — `disableLighting`.
 *
 * A cor dos dois vem do **vértice**: o conversor assou os 30 materiais do
 * original em `COLOR_0` para fundir tudo em duas malhas, e o babylon multiplica
 * a difusa branca pela cor do vértice sem precisar que ninguém peça.
 */
function paintSkylineMesh(mesh: AbstractMesh, scene: Scene): void {
  const source = mesh.material
  if (!source) return
  if (isSkylineNeon(source.name)) {
    mesh.material = createNeonMaterial(scene)
    return
  }
  flattenPbrMaterial(mesh, scene, 'skyline')
}

/**
 * Letreiro e janela acesa não obedecem à luz da arena: a chave direcional vem
 * do alto e deixaria metade dos letreiros no escuro, quando o ponto deles é
 * justamente brilhar sozinhos. Com `disableLighting` o babylon entrega a cor do
 * vértice crua, que é a cor do neon do original.
 */
function createNeonMaterial(scene: Scene): StandardMaterial {
  const neon = new StandardMaterial('skyline-neon', scene)
  neon.diffuseColor = Color3.White()
  neon.specularColor = Color3.Black()
  neon.disableLighting = true
  neon.freeze()
  return neon
}

/**
 * A cidade não se move durante a partida, e matriz congelada é uma das quatro
 * medidas de draw call que o nfr.md exige do babylon — a mesma que
 * `buildGreyboxArena.ts` toma com as caixas.
 *
 * `isPickable` desligado junto: o raio de seleção do babylon não tem o que
 * fazer num cenário que o hitscan do núcleo nem enxerga.
 */
function freezeDescendants(anchor: TransformNode): void {
  for (const mesh of anchor.getChildMeshes()) {
    mesh.computeWorldMatrix(true)
    mesh.freezeWorldMatrix()
    mesh.isPickable = false
  }
}
