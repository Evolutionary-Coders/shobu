/**
 * A colisão do que a **arte** veste por cima do blockout: lanterna, letreiro,
 * telão, platibanda, casa de máquinas, guarda-corpo (ADR 0024). Até 12/10 isso
 * era arte pura — o gancho atravessava a lanterna e o corpo atravessava a
 * platibanda no topo do prédio.
 *
 * Não é bloco do blockout de propósito: a impressão digital do layout
 * (`layoutFingerprint.ts`) é o que o build do blender grava, e o blender
 * **lê** o blockout para vestir. Isto aqui é o contrário — é o que o blender
 * pôs, descrito do lado do layout para o núcleo enxergar. Quem garante que as
 * duas descrições batem é o teste de cada mapa contra o glb publicado.
 *
 * Não importa a engine: é o mesmo dado no cliente e no servidor.
 */
import type { Vec3 } from './arenaBlock.ts'

export interface PropCollider {
  readonly name: string
  readonly centerM: Vec3
  readonly sizeM: Vec3
  /** O que a peça para (`colliderMask.ts`): corpo, tiro, gancho. */
  readonly mask: number
}

/**
 * Uma peça pelos dois cantos, em qualquer ordem, como `blockBetween`.
 *
 * ```ts
 * propBetween('lanterna-1', COLLIDER_GRAPPLE_ONLY, [-0.32, 5.1, 9.68], [0.32, 5.6, 10.32])
 * ```
 */
export function propBetween(
  name: string,
  mask: number,
  cornerA: Vec3,
  cornerB: Vec3,
): PropCollider {
  const [ax, ay, az] = cornerA
  const [bx, by, bz] = cornerB
  const sizeM: Vec3 = [Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az)]
  if (sizeM.some((side) => !(side > 0))) {
    throw new RangeError(
      `${name} recebeu cantos [${cornerA.join(', ')}] e [${cornerB.join(', ')}]; esperado volume > 0 nos três eixos`,
    )
  }
  return { name, mask, centerM: [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], sizeM }
}
