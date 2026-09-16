import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  isSkylineNeon,
  neonFlickerAt,
  SKYLINE_STRUCTURE_RGB,
  type SkylinePlacement,
  skylineRingPlacements,
} from '../arena/skylineRing.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/** Servido de `public/`; conta nos cinco segundos do pilar 2 como o js conta. */
const SKYLINE_MODEL_URL = '/assets/arena/skyline.glb'

/**
 * Põe a cidade cyberpunk em volta da arena: um quarteirão baixado uma vez e
 * instanciado nas posições que `skylineRing.ts` calcula — hoje **três anéis**
 * de raios e escalas diferentes, que é o que dá paralaxe e tira o fundo da
 * cara de anteparo pintado.
 *
 * **É cenário, e nada mais.** Não tem colisão, não entra no blockout e não
 * para bala — o hitscan e o controlador varrem as caixas do núcleo (ADR 0003),
 * que não sabem que isto existe. Trocar os anéis inteiros não muda uma linha de
 * simulação.
 *
 * `instantiateHierarchy` e não `clone`: instância compartilha a geometria com
 * o original **e o babylon as desenha em lote por hardware**, então dezenove
 * cópias custam um download, uma malha na memória e os mesmos dois draw calls
 * de uma cópia só.
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
  const neon = createNeonMaterial(scene)
  const structure = createStructureMaterial(scene)
  for (const mesh of loaded.meshes) paintSkylineMesh(mesh, neon, structure)
  for (const [copy, placement] of skylineRingPlacements().entries()) {
    const anchor = anchorFor(scene, copy, placement)
    // a primeira cópia é o próprio glb; o `__root__` do loader guarda a troca
    // de mão do sistema de coordenadas e por isso vira **filho** da âncora em
    // vez de receber a posição direto — sobrescrevê-lo espelharia a cidade.
    if (copy === 0) root.parent = anchor
    else root.instantiateHierarchy(anchor)
    freezeDescendants(anchor)
  }
  flickerNeon(scene, neon)
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
 * Os materiais são **dois no total**, criados uma vez e compartilhados por
 * todas as cópias — não um par por malha carregada.
 *
 * A cor dos dois vem do **vértice**: o conversor assou os 30 materiais do
 * original em `COLOR_0` para fundir tudo em duas malhas, e o babylon multiplica
 * a difusa pela cor do vértice sem precisar que ninguém peça.
 */
function paintSkylineMesh(
  mesh: AbstractMesh,
  neon: StandardMaterial,
  structure: StandardMaterial,
): void {
  const source = mesh.material
  if (!source) return
  mesh.material = isSkylineNeon(source.name) ? neon : structure
}

/**
 * **A cidade é escura.** O material chegava do glb com difusa branca, e branco
 * vezes a cor do vértice sob duas luzes globais desenhava um horizonte de
 * concreto cinza-claro que dominava a imagem inteira e achatava a arena — era
 * a coisa mais clara da tela, quando devia ser a mais distante.
 *
 * O tom escuro devolve a cidade ao papel de silhueta e deixa o letreiro ser a
 * única coisa acesa lá atrás, que é como cidade noturna se lê de longe.
 */
function createStructureMaterial(scene: Scene): StandardMaterial {
  const structure = new StandardMaterial('skyline-structure', scene)
  structure.diffuseColor = new Color3(...SKYLINE_STRUCTURE_RGB)
  structure.specularColor = Color3.Black()
  structure.freeze()
  return structure
}

/**
 * Letreiro e janela acesa não obedecem à luz da arena: a chave direcional vem
 * do alto e deixaria metade dos letreiros no escuro, quando o ponto deles é
 * justamente brilhar sozinhos. Com `disableLighting` o babylon entrega a cor do
 * vértice crua, que é a cor do neon do original.
 *
 * **Sem `freeze()`**, ao contrário de todo outro material da arena: é a difusa
 * dele que a piscada mexe por quadro, e material congelado é material que
 * ignora essa mudança.
 */
function createNeonMaterial(scene: Scene): StandardMaterial {
  const neon = new StandardMaterial('skyline-neon', scene)
  neon.diffuseColor = Color3.White()
  neon.specularColor = Color3.Black()
  neon.disableLighting = true
  return neon
}

/**
 * A piscada que o GDD pede em "Environment Animations". Uma atribuição de cor
 * por quadro, num material só: **nenhum draw call e nenhuma malha a mais**, e é
 * o que tira a cidade de morta — fundo parado lê como pintura.
 */
function flickerNeon(scene: Scene, neon: StandardMaterial): void {
  let elapsedS = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsedS += scene.getEngine().getDeltaTime() / 1000
    const level = neonFlickerAt(elapsedS)
    neon.diffuseColor.set(level, level, level)
  })
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
