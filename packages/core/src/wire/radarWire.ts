import type { RadarBlip } from '../streaks/radarPulse.ts'

/**
 * Do servidor só para o dono do PING ou do SONAR (ADR 0035): os inimigos
 * vivos no instante da varredura, quanto falta de PING e quanto o ponto fica
 * no minimapa — o do SONAR fica mais que o do PING. Três pontos a cada 3 s não
 * pesam no fio, e por isso vão em metros, sem quantizar. O embaralhamento
 * do CONTRA-PING não precisa de mensagem: cada cliente o
 * tira do `SCORESTREAK_ACTIVATED_MESSAGE`, que já vai para todos, com a mesma
 * `applyScorestreakActivation` da sala.
 */
export const RADAR_SWEEP_MESSAGE = 'radar.sweep'

export interface RadarSweepMessage {
  readonly blips: readonly RadarBlip[]
  readonly pulseLeftS: number
  readonly revealS: number
}
