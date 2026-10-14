/**
 * O que a revisão de colisão desenha (`?perf=1&colisao=1`, ADR 0024), e de que
 * cor: dado puro, para o adapter (`renderer/colliderOverlay.ts`) só traçar
 * linha.
 *
 * O blockout que para tudo fica de fora — ele é a própria arte, e desenhado
 * escondia o resto. Entra a colisão que não se vê como caixa: a da arte
 * (lanterna, letreiro, platibanda) e a parede invisível do bairro.
 */
import {
  blockoutToStaticBoxes,
  COLLIDER_BODY_ONLY,
  COLLIDER_GRAPPLE_ONLY,
  COLLIDER_SHOT_AND_GRAPPLE,
  COLLIDER_SOLID,
  propsToStaticBoxes,
  type StaticBox,
} from '@shobu/core'
import type { ArenaMap } from './arenaCatalog.ts'

export interface ColliderOverlayGroup {
  readonly mask: number
  /** Cor da linha, de 0 a 1. */
  readonly colour: readonly [number, number, number]
  readonly boxes: readonly StaticBox[]
}

/**
 * Uma cor por máscara: amarelo para tudo, azul para só o corpo, verde para só
 * o gancho, branco para tiro e gancho. Nenhuma é cor de neon do mapa — com
 * magenta e ciano, a caixa sumia no letreiro (captura de 12/10).
 */
export const COLLIDER_OVERLAY_COLOURS: ReadonlyMap<number, readonly [number, number, number]> =
  new Map([
    [COLLIDER_SOLID, [1, 0.9, 0]],
    [COLLIDER_BODY_ONLY, [0.2, 0.5, 1]],
    [COLLIDER_GRAPPLE_ONLY, [0.2, 1, 0.3]],
    [COLLIDER_SHOT_AND_GRAPPLE, [1, 1, 1]],
  ])

/**
 * ```ts
 * colliderOverlayGroups(NEON_KAIDO_MAP) // [{ mask: 7, colour, boxes }, ...]
 * ```
 */
export function colliderOverlayGroups(
  map: Pick<ArenaMap, 'blockout' | 'props'>,
): readonly ColliderOverlayGroup[] {
  const hidden = blockoutToStaticBoxes(map.blockout).filter((box) => box.mask !== COLLIDER_SOLID)
  const boxes = [...hidden, ...propsToStaticBoxes(map.props)]
  return [...COLLIDER_OVERLAY_COLOURS]
    .map(([mask, colour]) => ({ mask, colour, boxes: boxes.filter((box) => box.mask === mask) }))
    .filter((group) => group.boxes.length > 0)
}
