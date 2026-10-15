import { COLLIDER_BODY_ONLY, COLLIDER_SOLID } from '../collision/colliderMask.ts'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import type { ArenaLayer, GreyboxBlock } from './arenaBlock.ts'
import type { ArenaLayout } from './arenaLayout.ts'
import type { PropCollider } from './propCollider.ts'

/**
 * O que cada tipo de bloco para (`colliderMask.ts`, ADR 0024). Tudo que se vê
 * para tudo; a parede invisível do fim do bairro só para o corpo — a bala e a
 * corda que chegam nela atravessam para o cenário, que não tem colisão, em vez
 * de parar no ar. Tabela inteira e não "tudo menos a barreira": um tipo novo
 * de bloco obriga a decidir aqui.
 */
export const LAYER_COLLIDER_MASK: Readonly<Record<ArenaLayer, number>> = {
  floor: COLLIDER_SOLID,
  barrier: COLLIDER_BODY_ONLY,
  building: COLLIDER_SOLID,
  walkway: COLLIDER_SOLID,
  stair: COLLIDER_SOLID,
  cover: COLLIDER_SOLID,
  lowCover: COLLIDER_SOLID,
  outskirt: COLLIDER_SOLID,
  blockade: COLLIDER_SOLID,
  ledge: COLLIDER_SOLID,
  tower: COLLIDER_SOLID,
}

/**
 * O blockout como geometria de colisão do núcleo. É a promessa que
 * `greyboxBlockout.ts` faz — "o mesmo dado alimenta o renderer hoje e a
 * colisão depois" — cumprida: as mesmas caixas que o babylon desenha são as
 * que o controlador varre, então o que se vê é o que se pisa.
 *
 * ```ts
 * const boxes = blockoutToStaticBoxes(ICHIBAN_GAI_BLOCKOUT)
 * ```
 */
export function blockoutToStaticBoxes(blockout: readonly GreyboxBlock[]): readonly StaticBox[] {
  if (blockout.length === 0) {
    throw new RangeError('blockout recebeu lista vazia; esperado ao menos um bloco de arena')
  }
  return blockout.map((block) =>
    boxFromCenterSize(block.centerM, block.sizeM, LAYER_COLLIDER_MASK[block.layer]),
  )
}

/** As peças da arte como caixas do núcleo, cada uma com o que ela para. */
export function propsToStaticBoxes(props: readonly PropCollider[]): readonly StaticBox[] {
  return props.map((prop) => boxFromCenterSize(prop.centerM, prop.sizeM, prop.mask))
}

/**
 * Toda a colisão de um mapa: o blockout e, depois dele, a arte que tem
 * colisão. O blockout vem primeiro para o índice de cada bloco continuar o
 * mesmo do layout.
 *
 * ```ts
 * const boxes = arenaCollisionBoxes(ICHIBAN_GAI_MAP)
 * ```
 */
export function arenaCollisionBoxes(
  map: Pick<ArenaLayout, 'blockout' | 'props'>,
): readonly StaticBox[] {
  return [...blockoutToStaticBoxes(map.blockout), ...propsToStaticBoxes(map.props)]
}
