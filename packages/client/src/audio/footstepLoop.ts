import type { MovementConfig } from '@shobu/core'
import type { SfxName } from './soundCatalog.ts'

/**
 * Qual laço de passo deveria estar tocando.
 *
 * **Laço e não passo por passo**: os dois arquivos de origem já são sequências
 * de passadas (`walking.wav` tem 3,7 s e `running.wav` 7,7 s), então disparar
 * um por passo tocaria a sequência inteira a cada pé no chão. Quem cuida de
 * não reiniciar o laço a cada quadro é o mixer, que ignora pedido igual ao que
 * já toca.
 *
 * ```ts
 * footstepLoopFor({ grounded: true, groundSpeedMps: 6 }, config.movement) // 'running'
 * ```
 */
export interface FootstepSample {
  readonly grounded: boolean
  readonly groundSpeedMps: number
}

/** O nome do laço no mixer. Um só, e por isso trocar de ritmo não empilha som. */
export const FOOTSTEP_LOOP = 'passo'

export function footstepLoopFor(
  sample: FootstepSample,
  config: MovementConfig,
): SfxName | undefined {
  // no ar não há passo, e a aterrissagem tem som próprio.
  if (!sample.grounded) return undefined
  // metade da velocidade agachada é o piso do "andando de fato": abaixo disso
  // é escorregada de fim de slide e resto de aceleração, não passada.
  if (sample.groundSpeedMps < config.crouchSpeedMps / 2) return undefined
  return sample.groundSpeedMps >= runningThreshold(config) ? 'running' : 'walking'
}

/**
 * O meio do caminho entre correr e esprintar. Usar a `runSpeedMps` crua faria
 * o laço piscar entre os dois no exato ritmo em que o jogador anda.
 */
function runningThreshold(config: MovementConfig): number {
  return (config.runSpeedMps + config.sprintSpeedMps) / 2
}
