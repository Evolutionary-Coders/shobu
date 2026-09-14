import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { type AlleyKitMesh, ARENA_PROPS, type ArenaProp } from '../arena/arenaProps.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/** Servido de `public/`; conta nos cinco segundos do pilar 2 como o js conta. */
const ALLEY_KIT_URL = '/assets/props/alley-kit.glb'

/**
 * Desenha os condensadores do kit de beco nas posições de `arenaProps.ts`.
 *
 * **Só desenha.** A colisão deles não passa por aqui: os mesmos centros e
 * tamanhos já entraram no `GREYBOX_BLOCKOUT` e seguiram para o núcleo por
 * `blockoutToStaticBoxes`. Este módulo é a metade visível de uma descrição que
 * `arenaProps.test.ts` mantém única — se ele desenhar noutro lugar, o teste
 * quebra antes de alguém notar bala parando no ar.
 *
 * ```ts
 * await loadArenaProps(scene)
 * ```
 */
export async function loadArenaProps(scene: Scene): Promise<void> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(ALLEY_KIT_URL, scene)
  const kit = collectKitMeshes(loaded.meshes, scene)
  for (const [kitMesh, props] of groupByKitMesh(ARENA_PROPS)) {
    const template = kit.get(kitMesh)
    if (!template) {
      throw new Error(`${ALLEY_KIT_URL} não tem a malha '${kitMesh}'; esperado o kit completo`)
    }
    placeAll(template, props)
  }
}

/**
 * As malhas do kit, soltas do `__root__` e com a transformação assada nos
 * vértices.
 *
 * O `__root__` que o loader do glTF cria guarda a troca de mão do sistema de
 * coordenadas, e uma instância parenteada em outro lugar a perderia — o
 * condensador sairia espelhado. Assar resolve de vez, e custa uma vez: são 884
 * triângulos no kit inteiro.
 */
function collectKitMeshes(meshes: readonly unknown[], scene: Scene): Map<string, Mesh> {
  const kit = new Map<string, Mesh>()
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) continue
    flattenPbrMaterial(mesh, scene, 'alley-prop')
    mesh.setParent(null)
    mesh.bakeCurrentTransformIntoVertices()
    kit.set(mesh.name, mesh)
  }
  return kit
}

function groupByKitMesh(props: readonly ArenaProp[]): Map<AlleyKitMesh, ArenaProp[]> {
  const grouped = new Map<AlleyKitMesh, ArenaProp[]>()
  for (const prop of props) {
    const existing = grouped.get(prop.kitMesh)
    if (existing) existing.push(prop)
    else grouped.set(prop.kitMesh, [prop])
  }
  return grouped
}

/**
 * A primeira ocorrência é a própria malha do kit; as outras são instâncias
 * dela.
 *
 * Não dá para esconder o original e instanciar todas: no babylon a instância
 * é desenhada pela chamada da malha de origem, e origem desligada leva as
 * instâncias junto. Usar a origem como a primeira cópia evita tanto isso
 * quanto uma malha invisível ocupando memória à toa.
 */
function placeAll(template: Mesh, props: readonly ArenaProp[]): void {
  for (const [copy, prop] of props.entries()) {
    const mesh = copy === 0 ? template : template.createInstance(prop.name)
    // o nome é o que se procura no inspector, e a malha do kit chega com o
    // nome da peça (`condenser-wide`), não com o do lugar onde ela fica.
    mesh.name = prop.name
    mesh.position.set(...prop.centerM)
    mesh.rotation.y = prop.yawRad
    // o hitscan do núcleo varre as caixas do blockout, não a cena: o raio de
    // seleção do babylon não tem o que fazer aqui.
    mesh.isPickable = false
    mesh.computeWorldMatrix(true)
    mesh.freezeWorldMatrix()
  }
}
