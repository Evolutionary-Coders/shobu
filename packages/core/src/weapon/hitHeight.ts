import type { Vector3 } from '../math/vector3.ts'

/**
 * Onde o tiro pegou na cápsula da vítima, de 0 no pé a 1 no topo da cabeça.
 * É o único dado que falta para o `headshot`, e ele sai do que a resolução de
 * acerto já devolve — `origin.y + direction.y * distanceM` é o ponto do
 * acerto, e o resto é regra de três contra a altura da cápsula.
 *
 * **Nenhuma cápsula de cabeça, nenhuma mudança no rewind.** Agachado ou
 * deslizando, a razão acompanha o `capsuleHeightM` sozinha, porque é ele o
 * denominador.
 *
 * Recorta em 0 e 1: o raio pode encostar na calota da cápsula um fio acima do
 * topo, e razão maior que 1 viraria `headshot` concedido fora do corpo.
 *
 * ```ts
 * hitHeightRatio(shot.endpointM, victimFeetM, config.collision.capsuleHeightM) // 0.82
 * ```
 */
export function hitHeightRatio(
  hitM: Readonly<Vector3>,
  feetM: Readonly<Vector3>,
  capsuleHeightM: number,
): number {
  if (!(capsuleHeightM > 0)) {
    throw new RangeError(
      `hitHeightRatio recebeu capsuleHeightM ${capsuleHeightM}; esperado número > 0`,
    )
  }
  const ratio = (hitM.y - feetM.y) / capsuleHeightM
  return Math.min(1, Math.max(0, ratio))
}
