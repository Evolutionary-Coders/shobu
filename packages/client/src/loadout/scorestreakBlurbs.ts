import type { ScorestreakSlug } from '@shobu/core'

/**
 * O que cada série faz, numa linha, para o menu (ADR 0029). Toda série tem
 * efeito desde o plano de 09/11 — PING, SONAR, CONTRA-PING (ADR 0035),
 * FERROLHO RÁPIDO, GANCHO OVERCLOCK, PULSO EMP e ECO —, e a linha dela diz o
 * que ela faz de fato, com os tempos de `config/gameplay.json`.
 *
 * ```ts
 * SCORESTREAK_BLURBS.ping // 'VARRE OS INIMIGOS NO MINIMAPA A CADA 3 s, POR 15 s.'
 * ```
 */
export const SCORESTREAK_BLURBS: Readonly<Record<ScorestreakSlug, string>> = {
  echo: 'SEGUE NO MINIMAPA QUEM TE MATOU POR ÚLTIMO, POR 10 s.',
  'grapple-overclock': 'O GANCHO SEM RECARGA POR 20 s.',
  ping: 'VARRE OS INIMIGOS NO MINIMAPA A CADA 3 s, POR 15 s.',
  'counter-ping': 'EMBARALHA O MINIMAPA E A LUNETA DOS OUTROS POR 15 s.',
  'rapid-bolt': 'SEM FERROLHO E COM RECARGA NA HORA POR 15 s.',
  sonar: 'MOSTRA TODOS OS INIMIGOS NO MINIMAPA POR 4 s, DE UMA VEZ.',
  emp: 'TIRA O GANCHO, A LUNETA E O HUD DOS OUTROS POR 10 s.',
}
