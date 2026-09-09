/**
 * Caixa alinhada aos eixos, em metros. É a geometria de colisão do jogador
 * enquanto a arena for greybox: a ADR 0003 autoriza restringir a colisão a
 * caixas alinhadas e resolver por interseção analítica, e é o que este módulo
 * faz. Quando a arena vier do blender, a malha de colisão entra por outra
 * implementação da mesma varredura, sem tocar no controlador.
 *
 * Não importa nada da engine: é o mesmo dado no cliente e no servidor, que é o
 * que faz a reconciliação convergir (ADR 0002).
 */
export interface StaticBox {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

/**
 * ```ts
 * boxFromCenterSize([0, -0.5, 0], [64, 1, 64]) // piso: y de -1 a 0
 * ```
 */
export function boxFromCenterSize(
  centerM: readonly [number, number, number],
  sizeM: readonly [number, number, number],
): StaticBox {
  const [width, height, depth] = sizeM
  if (!(width > 0 && height > 0 && depth > 0)) {
    throw new RangeError(`sizeM recebeu [${sizeM.join(', ')}]; esperado três medidas > 0`)
  }
  const [x, y, z] = centerM
  return {
    minX: x - width / 2,
    minY: y - height / 2,
    minZ: z - depth / 2,
    maxX: x + width / 2,
    maxY: y + height / 2,
    maxZ: z + depth / 2,
  }
}

/**
 * O volume do jogador: uma caixa de meia-largura `radius` apoiada no pé. A
 * cápsula da ADR 0003 vira caixa aqui pelo mesmo motivo que a arena: contra
 * geometria alinhada, a diferença é canto arredondado, e o custo é zero.
 */
export interface PlayerBox {
  readonly feetX: number
  readonly feetY: number
  readonly feetZ: number
  readonly radiusM: number
  readonly heightM: number
}

/** Interseção estrita: encostar não é penetrar, e é isso que deixa o jogador apoiado. */
export function overlaps(player: PlayerBox, box: StaticBox): boolean {
  return (
    player.feetX - player.radiusM < box.maxX &&
    player.feetX + player.radiusM > box.minX &&
    player.feetY < box.maxY &&
    player.feetY + player.heightM > box.minY &&
    player.feetZ - player.radiusM < box.maxZ &&
    player.feetZ + player.radiusM > box.minZ
  )
}

export function overlapsAny(player: PlayerBox, boxes: readonly StaticBox[]): boolean {
  for (const box of boxes) if (overlaps(player, box)) return true
  return false
}
