import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { Scene } from '@babylonjs/core/scene'
import type { SniperSkinUrls, TexturePairUrls } from '../loadout/weaponFinishes.ts'

/**
 * As texturas de um acabamento da sniper, prontas para `paintSniper`. Adapter:
 * só baixa o que `sniperSkinUrls` escolheu.
 */

/** Uma textura e a emissiva que anda com ela. */
export interface TexturePair {
  readonly base: Texture
  readonly glow: Texture
}

/** O acabamento em texturas: o atlas do corpo e, na HANABI, a paleta do neon. */
export interface SniperSkin {
  readonly body: TexturePair
  readonly palette?: TexturePair
}

/**
 * Uma fábrica de acabamentos com cache por url: trocar e voltar no menu não
 * baixa de novo, e só o acabamento pedido é baixado. Filtro nearest como o
 * resto (`flattenPbrMaterial`), sem mipmap (ADR 0008), e **`invertY: false`**:
 * os atlas estão no layout do glTF, e com o padrão do babylon chegariam de
 * cabeça para baixo.
 *
 * ```ts
 * const skins = createSniperSkins(scene)
 * const skin = skins(sniperSkinUrls('laser', looks.sniper))
 * ```
 */
export function createSniperSkins(
  scene: Scene,
): (urls: SniperSkinUrls | undefined) => SniperSkin | undefined {
  const cache = new Map<string, Texture>()
  const textureOf = (url: string): Texture => {
    const cached = cache.get(url)
    if (cached) return cached
    const texture = new Texture(url, scene, {
      noMipmap: true,
      invertY: false,
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
    })
    cache.set(url, texture)
    return texture
  }
  const pairOf = (urls: TexturePairUrls): TexturePair => ({
    base: textureOf(urls.base),
    glow: textureOf(urls.glow),
  })
  return (urls) => {
    if (!urls) return undefined
    const body = pairOf(urls.body)
    return urls.palette ? { body, palette: pairOf(urls.palette) } : { body }
  }
}

/**
 * Verdadeiro quando todas as texturas do acabamento chegaram. Pintar antes
 * disso desenha a arma com textura vazia por alguns quadros; esperando, ela
 * fica no acabamento anterior até o novo estar inteiro.
 *
 * ```ts
 * if (!skin || sniperSkinReady(skin)) paintSniper(meshes, skin)
 * ```
 */
export function sniperSkinReady(skin: SniperSkin): boolean {
  const pairs = skin.palette ? [skin.body, skin.palette] : [skin.body]
  return pairs.every((pair) => pair.base.isReady() && pair.glow.isReady())
}
