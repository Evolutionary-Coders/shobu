import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
// sem estes dois, o babylon es6 busca o shader por url em tempo de execução,
// o vite devolve o index.html no lugar do .fx, e o efeito só compila por
// fallback degradado. importar estaticamente resolve o shader no bundle.
import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/Shaders/default.fragment'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import {
  type GreyboxSurface,
  type GreyboxSurfaceLayer,
  greyboxSurfaceSpec,
} from './greyboxSurfaceSpec.ts'

/**
 * Um material por camada, congelado. `StandardMaterial` e não PBR por decisão
 * de arte com efeito direto no orçamento de quadro (ADR 0004); `freeze()`
 * porque material congelado sai do recálculo por quadro (nfr.md).
 *
 * A superfície de cada camada vem de `greyboxSurfaceSpec.ts` — textura e tom.
 * A cor sozinha separava as camadas só o bastante para ler a verticalidade; a
 * textura diz a mesma coisa por um segundo canal, e é o que tira a arena da
 * cara de caixa lisa sem custar nada de gameplay.
 */
export function createLayerMaterials(
  scene: Scene,
): ReadonlyMap<GreyboxSurfaceLayer, StandardMaterial> {
  const materials = new Map<GreyboxSurfaceLayer, StandardMaterial>()
  for (const [layer, surface] of Object.entries(greyboxSurfaceSpec())) {
    materials.set(layer as GreyboxSurfaceLayer, createGreyboxMaterial(scene, layer, surface))
  }
  return materials
}

function createGreyboxMaterial(
  scene: Scene,
  layer: string,
  surface: GreyboxSurface,
): StandardMaterial {
  const material = new StandardMaterial(`greybox-${layer}`, scene)
  material.diffuseTexture = createTileTexture(scene, layer, surface)
  // o tom multiplica a textura; sem ele as quatro camadas ficam do mesmo
  // cinza de concreto e a verticalidade volta a depender só da silhueta.
  material.diffuseColor = new Color3(...surface.tintRgb)
  material.specularColor = Color3.Black()
  material.freeze()
  return material
}

/**
 * Filtro **nearest na magnificação** — metade da receita do look ps1 da
 * ADR 0004, e o que faz o texel aparecer quando o jogador encosta na parede.
 *
 * Com mipmap na minificação, e não `NEAREST_SAMPLINGMODE` puro como no
 * `flattenPbrMaterial`: lá a textura cobre um modelo de 2 m, aqui ela ladrilha
 * dezesseis vezes num piso de 64 m. Sem mipmap, esse piso cintila a cada passo
 * — aliasing que a ADR não pede e que estraga justamente a superfície para
 * onde a câmera olha metade do tempo.
 */
function createTileTexture(scene: Scene, layer: string, surface: GreyboxSurface): Texture {
  const texture = new Texture(surface.textureUrl, scene, {
    samplingMode: Texture.NEAREST_NEAREST_MIPLINEAR,
  })
  texture.name = `greybox-${layer}-tile`
  // o ladrilho vem do uv de cada bloco (`greyboxFaceUv.ts`), não daqui: um
  // uScale no material valeria para todos os blocos da camada de uma vez, e
  // eles vão de 4 a 64 m.
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  return texture
}
