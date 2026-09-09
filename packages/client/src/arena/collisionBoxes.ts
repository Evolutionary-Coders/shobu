import { boxFromCenterSize, type StaticBox } from '@shobu/core'
import type { GreyboxBlock } from './greyboxBlockout.ts'

/**
 * O blockout como geometria de colisão do núcleo. É a promessa que
 * `greyboxBlockout.ts` faz — "o mesmo dado alimenta o renderer hoje e a
 * colisão depois" — cumprida: as mesmas caixas que o babylon desenha são as
 * que o controlador varre, então o que se vê é o que se pisa.
 *
 * ```ts
 * const boxes = blockoutToStaticBoxes(GREYBOX_BLOCKOUT)
 * ```
 */
export function blockoutToStaticBoxes(blockout: readonly GreyboxBlock[]): readonly StaticBox[] {
  if (blockout.length === 0) {
    throw new RangeError('blockout recebeu lista vazia; esperado ao menos um bloco de arena')
  }
  return blockout.map((block) => boxFromCenterSize(block.centerM, block.sizeM))
}
