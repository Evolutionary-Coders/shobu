import type { LocomotionPose } from './thirdPersonClips.ts'

/**
 * Quanto o corpo se vira em relação a para onde o jogador olha.
 *
 * É a contrapartida da regressão registrada em `thirdPersonClips.ts`: a
 * Universal Animation Library não tem clipe de strafe, então andar de lado toca
 * a corrida para a frente, e sem isto o avatar desliza de lado com os pés
 * apontando para a frente — o defeito de terceira pessoa mais fácil de ver.
 *
 * Girar a raiz resolve porque os pés passam a bater na direção em que o corpo
 * de fato anda. O que **não** se resolve girando tudo é a mira: o tronco
 * continua devendo apontar para onde o jogador olha, e por isso o giro tem
 * teto — 40°, não 90°.
 */

/**
 * O giro do strafe puro, que é o máximo. Acima disto o boneco vira de costas
 * para a própria mira, e um sniper andando de lado passa a parecer que está
 * fugindo em vez de mirando.
 */
export const MAX_BODY_YAW_RAD = (40 * Math.PI) / 180

/** Quanto do caminho até o giro alvo o corpo percorre por segundo. */
const BODY_YAW_FOLLOW_PER_S = 8

/**
 * ```ts
 * bodyYawTargetRad({ ahead: 0, side: 1, ... }) // +0.698 rad: strafe puro, no teto
 * ```
 */
export function bodyYawTargetRad(pose: LocomotionPose): number {
  if (pose.ahead === 0 && pose.side === 0) return 0
  // `abs(ahead)`: andar para trás toca a corrida ao contrário, então o corpo
  // inclina para o mesmo lado do strafe, e não 135° para o outro.
  const angle = Math.atan2(pose.side, Math.abs(pose.ahead))
  // proporcional, não cortado: com corte, a diagonal (45°) e o strafe puro
  // (90°) caem os dois no teto e o corpo faz a mesma pose nos dois casos.
  return (angle / (Math.PI / 2)) * MAX_BODY_YAW_RAD
}

/**
 * Persegue o giro alvo com atraso. Sem isto o corpo salta 40° no quadro em que
 * a tecla desce, que lê pior do que não girar.
 */
export function followBodyYawRad(currentRad: number, targetRad: number, dtS: number): number {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  return currentRad + (targetRad - currentRad) * Math.min(1, dtS * BODY_YAW_FOLLOW_PER_S)
}
