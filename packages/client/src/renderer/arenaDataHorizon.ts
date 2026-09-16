import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  type CyberspaceSurface,
  paintCircuit,
  paintPanel,
  SURFACE_SIZE_PX,
} from '../arena/cyberspaceSurface.ts'
import {
  dataTowers,
  GRID_CELL_M,
  GRID_MAJOR_EVERY,
  GRID_PLANE_SIDE_M,
  GRID_PLANE_Y_M,
} from '../arena/dataHorizon.ts'
import { gridSurface, towerSurface } from './dataHorizonSurfaces.ts'

/**
 * Desenha o que existe fora da arena: a grade do não-espaço e as torres de
 * dados (ADR 0009).
 *
 * **Dois draw calls e nenhum byte.** A grade é um `CreateGround` com textura
 * gerada; as torres são caixas fundidas numa malha só. É o que substituiu 2,9
 * MB de glb e 1,2 milhão de triângulos por quadro.
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (ADR 0001). Onde tudo
 * fica é testado em `dataHorizon.test.ts`.
 *
 * ```ts
 * openDataHorizon(scene)
 * ```
 */
export function openDataHorizon(scene: Scene): void {
  layGrid(scene)
  raiseTowers(scene)
}

/**
 * A grade. Ela é o **dispositivo de escala** do mapa desde que a cidade saiu:
 * célula de 1 m, linha forte a cada 8, e convergência de perspectiva fazendo o
 * resto. A névoa apaga o fundo dela antes de a borda aparecer.
 */
function layGrid(scene: Scene): void {
  const plane = CreateGround(
    'data-grid',
    { width: GRID_PLANE_SIDE_M, height: GRID_PLANE_SIDE_M },
    scene,
  )
  plane.position.y = GRID_PLANE_Y_M
  plane.material = createSurfaceMaterial(scene, 'data-grid', gridSurface(), tilesAcrossGrid())
  plane.isPickable = false
  plane.computeWorldMatrix(true)
  plane.freezeWorldMatrix()
}

/**
 * Quantas vezes a textura se repete no plano. Uma célula de textura tem que
 * medir `GRID_CELL_M` no mundo, senão a régua mente — e uma régua que mente é
 * pior que nenhuma, porque o jogador confia nela para estimar distância.
 */
function tilesAcrossGrid(): number {
  return GRID_PLANE_SIDE_M / (GRID_CELL_M * GRID_MAJOR_EVERY)
}

/**
 * As torres, fundidas numa malha. São dez caixas, e dez draw calls para um
 * fundo que a névoa quase apaga seria o oposto do que o nfr.md pede.
 */
function raiseTowers(scene: Scene): void {
  const boxes = dataTowers().map((tower) => {
    const [width, height, depth] = tower.sizeM
    const box = CreateBox(tower.name, { width, height, depth }, scene)
    box.position.set(...tower.centerM)
    return box
  })
  const merged = Mesh.MergeMeshes(boxes, true)
  if (!merged) {
    throw new Error('MergeMeshes devolveu nada para as torres; esperado uma malha')
  }
  merged.name = 'data-towers'
  merged.material = createSurfaceMaterial(scene, 'data-tower', towerSurface(), TOWER_TILES)
  merged.isPickable = false
  merged.computeWorldMatrix(true)
  merged.freezeWorldMatrix()
}

/**
 * A torre é alta e fina, e o `CreateBox` dá uv de 0 a 1 por face. Repetir
 * poucas vezes deixa a célula grande, que é o que se quer a 300 m: célula
 * pequena a essa distância vira cintilação, que é ruído exatamente na
 * frequência de um alvo distante.
 */
const TOWER_TILES = 3

/**
 * O mesmo par de mapas da arena — painel difuso e circuito emissivo —, com o
 * ladrilho vindo daqui e não do `faceUV` de cada bloco: fora da arena não há
 * caixa de colisão com quem casar o tamanho em metros.
 */
function createSurfaceMaterial(
  scene: Scene,
  name: string,
  surface: CyberspaceSurface,
  tiles: number,
): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.diffuseTexture = tiled(scene, `${name}-panel`, paintPanel(surface), tiles)
  material.emissiveTexture = tiled(scene, `${name}-circuit`, paintCircuit(surface), tiles)
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.freeze()
  return material
}

function tiled(
  scene: Scene,
  name: string,
  pixels: Uint8Array<ArrayBuffer>,
  tiles: number,
): Texture {
  const texture = RawTexture.CreateRGBATexture(
    pixels,
    SURFACE_SIZE_PX,
    SURFACE_SIZE_PX,
    scene,
    true,
    false,
    Texture.NEAREST_NEAREST_MIPLINEAR,
  )
  texture.name = name
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  texture.uScale = tiles
  texture.vScale = tiles
  return texture
}
