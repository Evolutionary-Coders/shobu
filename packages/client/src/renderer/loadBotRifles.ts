import '@babylonjs/core/Meshes/thinInstanceMesh'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { PrimaryWeapon } from '@shobu/core'
import {
  hideRifle,
  RIFLE_COLOR_FLOATS,
  RIFLE_MATRIX_FLOATS,
  writeRifleTint,
} from '../character/botRifle.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import { precompileMeshes } from './precompileMeshes.ts'
import { BOT_RIFLE_URLS } from './primaryModels.ts'

/**
 * Os rifles dos bots de uma arma principal (`BOT_RIFLE_URLS`): **uma malha,
 * uma chamada de desenho**, com uma thin instance por bot. A matriz de cada um é escrita por quadro no buffer
 * (`writeRifleMatrix`), e `commit` a manda para a gpu de uma vez — 16 números
 * por bot, sem objeto nenhum por quadro.
 *
 * Adapter de babylon: a conta (punho, mira, boca do cano) mora em
 * `character/botRifle.ts`, testada.
 *
 * ```ts
 * const rifles = await loadBotRifles(scene, session.bots.length, 'laser')
 * writeRifleMatrix(rifles.matrices, 0, grip, bot.aimM, up)
 * rifles.commit()
 * ```
 */
export interface BotRifles {
  readonly matrices: Float32Array
  /** A cor de cada rifle, rgba, que multiplica a difusa (`writeRifleTint`). */
  readonly colors: Float32Array
  commit(): void
}

export async function loadBotRifles(
  scene: Scene,
  count: number,
  weapon: PrimaryWeapon,
): Promise<BotRifles> {
  const url = BOT_RIFLE_URLS[weapon]
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(url, scene)
  const rifle = loaded.meshes.find(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.name === 'Rifle',
  )
  if (!rifle) {
    const names = loaded.meshes.map((mesh) => mesh.name).join(', ')
    throw new Error(`${url} trouxe [${names}]; esperado uma malha 'Rifle'`)
  }
  standAlone(rifle)
  for (const mesh of loaded.meshes) if (mesh !== rifle) mesh.dispose()
  flattenPbrMaterial(rifle, scene, `bot-rifle-${weapon}`)
  matchViewmodelBlack(rifle)
  const rifles = thinRifles(rifle, count)
  // desligado até compilar: o rifle é desenhado todo quadro (`alwaysSelectAsActiveMesh`),
  // e sem isto o primeiro desenho compilaria no quadro em que o glb chegasse —
  // no meio da partida, para o primeiro jogador com esta arma.
  rifle.setEnabled(false)
  await precompileMeshes(scene, [rifle])
  rifle.setEnabled(true)
  return rifles
}

/**
 * O carregador pendura a malha num `__root__` que converte o glTF (mão
 * direita) para o babylon (mão esquerda). As thin instances compõem a matriz
 * delas com a da malha, então a conversão é assada nos vértices e a malha
 * fica na origem, sem pai: a matriz de cada bot passa a ser o mundo inteiro.
 */
function standAlone(rifle: Mesh): void {
  rifle.setParent(null)
  rifle.bakeCurrentTransformIntoVertices()
}

/**
 * Preto fosco, sem brilho: o mesmo tom da sniper do jogador (decisão de
 * 11/10). O material vem do glb já quase preto; aqui só se garante que nenhum
 * especular de cena o deixe cinza. A textura emissiva do rifle laser passa
 * intacta (`flattenPbrMaterial`): só o especular é zerado.
 */
function matchViewmodelBlack(rifle: Mesh): void {
  const material = rifle.material
  if (!(material instanceof StandardMaterial)) return
  material.unfreeze()
  material.specularColor.set(0, 0, 0)
  material.freeze()
}

function thinRifles(rifle: Mesh, count: number): BotRifles {
  const matrices = new Float32Array(RIFLE_MATRIX_FLOATS * count)
  const colors = new Float32Array(RIFLE_COLOR_FLOATS * count)
  for (let index = 0; index < count; index += 1) {
    hideRifle(matrices, index)
    writeRifleTint(colors, index, undefined)
  }
  rifle.thinInstanceSetBuffer('matrix', matrices, RIFLE_MATRIX_FLOATS, false)
  // a cor por instância: o acabamento da sniper de cada um, sem material a mais.
  rifle.thinInstanceSetBuffer('color', colors, RIFLE_COLOR_FLOATS, false)
  // os rifles andam pelo mapa inteiro com os bots: a caixa de recorte da malha
  // na origem os cortaria. São três, e baratos; desenhar sempre sai mais em conta.
  rifle.alwaysSelectAsActiveMesh = true
  rifle.isPickable = false
  return {
    matrices,
    colors,
    commit: () => {
      rifle.thinInstanceBufferUpdated('matrix')
      rifle.thinInstanceBufferUpdated('color')
    },
  }
}
