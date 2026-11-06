import type { RadarBlip } from '../streaks/radarPulse.ts'

/**
 * Do servidor só para o dono do PING (ADR 0035): os inimigos vivos no
 * instante da varredura e quanto falta de PING. Três pontos a cada 3 s não
 * pesam no fio, e por isso vão em metros, sem quantizar. O CONTRA-PING não
 * tem mensagem: cada cliente o tira do `SCORESTREAK_ACTIVATED_MESSAGE`, que
 * já vai para todos, com a mesma `applyRadarActivation` da sala.
 */
export const RADAR_SWEEP_MESSAGE = 'radar.sweep'

export interface RadarSweepMessage {
  readonly blips: readonly RadarBlip[]
  readonly pulseLeftS: number
}
