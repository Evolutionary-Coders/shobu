import type { ScorestreakSlug } from '@shobu/core'

/**
 * O que cada série faz, numa linha, para o menu (ADR 0029). Só o PING, o
 * SONAR e o CONTRA-PING têm efeito hoje (ADR 0035); as outras dizem o que vão fazer e saem marcadas
 * EM BREVE, para o jogador do playtest não gastar uma série que não faz
 * nada achando que é defeito. Quem ganhar efeito vira `live` aqui. As cinco
 * bloqueadas do catálogo (`available: false` no core) mantêm a linha — a
 * grade ainda conta o que elas vão fazer —, mas o selo delas é INDISPONÍVEL,
 * e quem decide isso é o `scorestreakCardStatus`, não este mapa.
 *
 * ```ts
 * SCORESTREAK_BLURBS.ping.live // true
 * ```
 */
export interface ScorestreakBlurb {
  readonly text: string
  readonly live: boolean
}

export const SCORESTREAK_BLURBS: Readonly<Record<ScorestreakSlug, ScorestreakBlurb>> = {
  echo: { text: 'MARCA QUEM TE MATOU NO MINIMAPA.', live: false },
  'grapple-overclock': { text: 'O GANCHO SEM RECARGA POR 20 s.', live: true },
  ping: { text: 'VARRE OS INIMIGOS NO MINIMAPA A CADA 3 s, POR 15 s.', live: true },
  decoy: { text: 'UM HOLOGRAMA SEU QUE ATRAI O FOGO INIMIGO.', live: false },
  'counter-ping': { text: 'EMBARALHA O MINIMAPA E A LUNETA DOS OUTROS POR 15 s.', live: true },
  'rapid-bolt': { text: 'SEM FERROLHO E COM RECARGA NA HORA POR 15 s.', live: true },
  sonar: { text: 'MOSTRA TODOS OS INIMIGOS NO MINIMAPA POR 4 s, DE UMA VEZ.', live: true },
  'optic-camo': { text: 'SOME DO RADAR E QUASE SOME DA VISTA.', live: false },
  'orbital-strike': { text: 'UM GOLPE DO CÉU NO PONTO QUE VOCÊ MARCAR.', live: false },
  'kamikaze-drone': { text: 'UM DRONE QUE CAÇA O INIMIGO MAIS PERTO.', live: false },
  emp: { text: 'TIRA O GANCHO, A LUNETA E O HUD DOS OUTROS POR 10 s.', live: true },
  'neon-sentry': { text: 'UMA TORRE NEON QUE ATIRA EM QUEM APARECER.', live: false },
}
