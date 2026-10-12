/**
 * A colisão da arte que o build do blender decide sozinho, gravada em json por
 * mapa (`artColliders/<mapa>.json`, ADR 0024): a platibanda, a casa de
 * máquinas, o guarda-corpo, o letreiro e o telão.
 *
 * O json é gerado, não escrito: `npm run export:art-colliders -- <mapa>` roda
 * as funções do próprio build (`export_art_colliders.py`) e lê o glb publicado
 * (`artColliderExtraction.ts`). O teste do mapa confere o json contra a arte
 * publicada — mexeu na arte, gera de novo.
 */
import { COLLIDER_GRAPPLE_ONLY, COLLIDER_SHOT_AND_GRAPPLE, COLLIDER_SOLID } from '@shobu/core'
import type { Vec3 } from './arenaBlock.ts'
import { type PropCollider, propBetween } from './propCollider.ts'

/** O que a peça para, por nome: o json não carrega os bits do núcleo. */
export const ART_COLLIDER_MASKS = {
  solid: COLLIDER_SOLID,
  shotAndGrapple: COLLIDER_SHOT_AND_GRAPPLE,
  grappleOnly: COLLIDER_GRAPPLE_ONLY,
} as const

export interface ArtColliderEntry {
  readonly name: string
  readonly mask: keyof typeof ART_COLLIDER_MASKS
  readonly min: Vec3
  readonly max: Vec3
}

/** Uma entrada como o json a traz: texto e lista de números, ainda sem validar. */
export interface RawArtCollider {
  readonly name: string
  readonly mask: string
  readonly min: readonly number[]
  readonly max: readonly number[]
}

/**
 * Valida cada entrada do json e devolve as peças. Máscara desconhecida ou
 * canto sem três números é erro com o nome da peça: um json de outra versão
 * do gerador não pode virar colisão errada em silêncio.
 *
 * ```ts
 * artCollidersFrom(neonKaidoArt.colliders)
 * ```
 */
export function artCollidersFrom(entries: readonly RawArtCollider[]): readonly PropCollider[] {
  return entries.map((entry) =>
    propBetween(entry.name, maskOf(entry), cornerOf(entry, 'min'), cornerOf(entry, 'max')),
  )
}

function maskOf(entry: RawArtCollider): number {
  if (entry.mask in ART_COLLIDER_MASKS) {
    return ART_COLLIDER_MASKS[entry.mask as ArtColliderEntry['mask']]
  }
  throw new RangeError(
    `${entry.name} recebeu máscara ${entry.mask}; esperado ${Object.keys(ART_COLLIDER_MASKS).join(', ')}`,
  )
}

function cornerOf(entry: RawArtCollider, key: 'min' | 'max'): Vec3 {
  const [x, y, z, ...rest] = entry[key]
  if (x === undefined || y === undefined || z === undefined || rest.length > 0) {
    throw new RangeError(
      `${entry.name} recebeu ${key} [${entry[key].join(', ')}]; esperado três números`,
    )
  }
  return [x, y, z]
}
