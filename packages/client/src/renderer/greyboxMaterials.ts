import { Material } from '@babylonjs/core/Materials/material'
// sem este import o `detailMap` do material não existe: o babylon es6 carrega a
// configuração de detalhe por efeito colateral de módulo, não pelo material.
import '@babylonjs/core/Materials/material.detailMapConfiguration'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
// sem estes dois, o babylon es6 busca o shader por url em tempo de execução,
// o vite devolve o index.html no lugar do .fx, e o efeito só compila por
// fallback degradado. importar estaticamente resolve o shader no bundle.
import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/Shaders/default.fragment'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import {
  type CyberspaceSurface,
  paintCircuit,
  paintPanel,
  SURFACE_SIZE_PX,
} from '../arena/cyberspaceSurface.ts'
import { type GreyboxSurfaceLayer, greyboxSurfaceSpec } from './greyboxSurfaceSpec.ts'

/**
 * Um material por camada, congelado. `StandardMaterial` e não PBR por decisão
 * de arte com efeito direto no orçamento de quadro (ADR 0004); `freeze()`
 * porque material congelado sai do recálculo por quadro (nfr.md).
 *
 * **Dois mapas por camada**: o difuso é o painel escuro, que a luz da arena
 * ilumina; o emissivo é o circuito, que acende sozinho. É a separação que
 * permite a arena ser escura sem ficar ilegível — apague a luz e a linha do
 * circuito continua desenhando a forma do piso.
 *
 * Os dois são **gerados**, não baixados: `cyberspaceSurface.ts` pinta os bytes
 * e este arquivo só os sobe. Zero requisição, zero byte no orçamento do
 * pilar 2 — os quatro webp que isto substituía somavam 62 kB.
 */
/** Passo do detalhe em relação ao do painel. Primo do 1 para a emenda não casar. */
const DETAIL_TILES_PER_PANEL = 3

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
  surface: CyberspaceSurface,
): StandardMaterial {
  const material = new StandardMaterial(`greybox-${layer}`, scene)
  material.diffuseTexture = createTileTexture(scene, `${layer}-panel`, paintPanel(surface))
  material.emissiveTexture = createTileTexture(scene, `${layer}-circuit`, paintCircuit(surface))
  // difusa branca: o tom da superfície já está pintado no painel, e multiplicar
  // de novo escureceria duas vezes — foi esse o defeito quando a cor da camada
  // era um tom por cima de uma foto.
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  applyPanelAlpha(material, surface)
  applyDetailMap(material, scene, surface)
  material.freeze()
  return material
}

/**
 * O detalhe baixado, quando houver. Ele entra **multiplicando** o painel, e
 * ladrilha num passo diferente do painel de propósito: no mesmo passo, a
 * emenda da foto cairia sempre em cima da linha do circuito e as duas
 * formariam um padrão de interferência que o olho pega na hora.
 *
 * `npm run fetch:textures` é quem põe o arquivo em `public/`; o manifesto é
 * `config/textures.json`, e o registro de licença está em
 * `docs/asset-licenses.md`. Sem o arquivo, este ramo não roda e a arena fica
 * como está.
 */
function applyDetailMap(
  material: StandardMaterial,
  scene: Scene,
  surface: CyberspaceSurface,
): void {
  if (!surface.detailTextureUrl) return
  const detail = new Texture(surface.detailTextureUrl, scene, {
    samplingMode: Texture.NEAREST_NEAREST_MIPLINEAR,
  })
  detail.uScale = DETAIL_TILES_PER_PANEL
  detail.vScale = DETAIL_TILES_PER_PANEL
  material.detailMap.texture = detail
  material.detailMap.isEnabled = true
  material.detailMap.diffuseBlendLevel = surface.detailStrength ?? 0
}

/**
 * A superfície que o olho atravessa — hoje só a barreira do perímetro.
 *
 * O alfa vem do **canal alfa do difuso**, e não de `material.alpha`: o painel é
 * quase transparente e a linha do circuito é opaca, e uma opacidade única para
 * o material inteiro apagaria a malha junto com o painel. É a malha que diz ao
 * jogador que ali acaba a arena.
 *
 * Nada disso toca colisão: a caixa da barreira segue no `GREYBOX_BLOCKOUT` e
 * no núcleo, do mesmo jeito que estava quando ela era concreto.
 */
function applyPanelAlpha(material: StandardMaterial, surface: CyberspaceSurface): void {
  if (surface.panelAlpha >= 1) return
  const diffuse = material.diffuseTexture
  if (!diffuse) {
    throw new Error(`material ${material.name} está sem difuso; esperado a textura de painel`)
  }
  diffuse.hasAlpha = true
  material.useAlphaFromDiffuseTexture = true
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
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
function createTileTexture(scene: Scene, name: string, pixels: Uint8Array<ArrayBuffer>): Texture {
  const texture = RawTexture.CreateRGBATexture(
    pixels,
    SURFACE_SIZE_PX,
    SURFACE_SIZE_PX,
    scene,
    true,
    false,
    Texture.NEAREST_NEAREST_MIPLINEAR,
  )
  texture.name = `greybox-${name}`
  // o ladrilho vem do uv de cada bloco (`greyboxFaceUv.ts`), não daqui: um
  // uScale no material valeria para todos os blocos da camada de uma vez, e
  // eles vão de 4 a 64 m.
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  return texture
}
