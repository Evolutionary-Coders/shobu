import type { NavGraph } from '@shobu/core'
import type { Vec3 } from './arenaBlock.ts'
import {
  drop,
  type HalfLink,
  halfTurnNavGraph,
  jump,
  seam,
  seamDrop,
  walk,
} from './halfTurnNavGraph.ts'
import { NEON_KAIDO_MID_M, NEON_KAIDO_TOP_M } from './neonKaido.ts'

/**
 * Por onde os bots andam no Neon-kaidō (ADR 0016). Metade do mapa, como o
 * layout (`neonKaido.ts`), e o resto é a meia volta (`halfTurnNavGraph.ts`).
 *
 * As costuras de uma metade para a outra são o meio do Kaidō, a passarela (que
 * chega na engawa do outro lado), a ponte de cano e a queda do fim norte do
 * terraço, que cai na rua do lado gêmeo.
 *
 * Quem prova que o grafo e a arena concordam é o teste, que anda cada ligação
 * com a física de verdade.
 */

const MID_M = NEON_KAIDO_MID_M
const TOP_M = NEON_KAIDO_TOP_M
/** O teto do caminhão, cobertura de 2,2 m: só sobe quem usa o pulo duplo. */
const TRUCK_TOP_M = 2.2

const HALF_OF_THE_NODES: Readonly<Record<string, Vec3>> = {
  // chão: o Kaidō, de sul para o centro.
  'kaido-sul': [0, 0, -33],
  'kaido-yatai': [1.5, 0, -21],
  'kaido-caminhao': [-0.5, 0, -13],
  'kaido-centro': [-1, 0, -4],
  'caminhao-topo': [3.4, TRUCK_TOP_M, -13.5],
  // chão: o roji, o ura-dōri e o hiroba.
  'roji-boca': [-8, 0, -8.5],
  'roji-meio': [-15, 0, -8.5],
  'ura-roji': [-24.8, 0, -8.5],
  'ura-sul': [-24.8, 0, -30],
  'ura-norte': [-24.8, 0, 12],
  'ura-fim': [-25.7, 0, 32],
  'escada-fundo-pe': [-26.5, 0, -5],
  hiroba: [-11, 0, -29.5],
  'escada-engawa-pe': [-5.5, 0, -31],
  'escada-mezanino-pe': [-8.2, 0, -26],
  // meio: a engawa, a passarela, o mezanino e o telhado do fundo.
  'engawa-sul': [-5.5, MID_M, -21],
  'engawa-meio': [-5.5, MID_M, -15],
  'engawa-roji': [-5.5, MID_M, -7.5],
  'engawa-ponte': [-5.5, MID_M, -4.5],
  'engawa-norte': [-5.5, MID_M, 3.5],
  'passarela-oeste': [-3, MID_M, 4.5],
  'passarela-leste': [3, MID_M, 4.5],
  mezanino: [-20, MID_M, -30],
  'escada-mezanino-topo': [-16.8, MID_M, -26],
  'escada-fundo-topo': [-26.5, MID_M, 3.8],
  'fundo-leste': [-29.5, MID_M, 4],
  'fundo-centro': [-31, MID_M, -10],
  // topo: o terraço e a ponte de cano.
  'escada-terraco-topo': [-12.35, TOP_M, -7.5],
  'terraco-sul': [-11, TOP_M, -5],
  'ponte-pe': [-8, TOP_M, 0],
  ponte: [-4, TOP_M, 0],
  'terraco-centro': [-8.5, TOP_M, 6],
  'terraco-meio': [-8.5, TOP_M, 12],
  'terraco-norte': [-8, TOP_M, 19],
}

const HALF_OF_THE_LINKS: readonly HalfLink[] = [
  // o Kaidō
  walk('kaido-sul', 'kaido-yatai'),
  walk('kaido-yatai', 'kaido-caminhao'),
  walk('kaido-caminhao', 'kaido-centro'),
  seam('kaido-centro', 'kaido-centro'),
  jump('kaido-caminhao', 'caminhao-topo'),
  drop('caminhao-topo', 'kaido-yatai'),
  // o roji e o ura-dōri
  walk('kaido-centro', 'roji-boca'),
  walk('kaido-caminhao', 'roji-boca'),
  walk('roji-boca', 'roji-meio'),
  walk('roji-meio', 'ura-roji'),
  walk('ura-roji', 'ura-sul'),
  walk('ura-roji', 'escada-fundo-pe'),
  walk('ura-roji', 'ura-norte'),
  walk('ura-norte', 'ura-fim'),
  // o hiroba
  walk('ura-sul', 'hiroba'),
  walk('hiroba', 'kaido-sul'),
  walk('hiroba', 'escada-mezanino-pe'),
  walk('kaido-sul', 'escada-engawa-pe'),
  walk('hiroba', 'escada-engawa-pe'),
  // chão → meio
  walk('escada-engawa-pe', 'engawa-sul'),
  walk('escada-mezanino-pe', 'escada-mezanino-topo'),
  walk('escada-fundo-pe', 'escada-fundo-topo'),
  // o meio
  walk('engawa-sul', 'engawa-meio'),
  walk('engawa-meio', 'engawa-roji'),
  walk('engawa-roji', 'engawa-ponte'),
  walk('engawa-ponte', 'engawa-norte'),
  walk('engawa-norte', 'passarela-oeste'),
  walk('passarela-oeste', 'passarela-leste'),
  seam('passarela-leste', 'engawa-ponte'),
  walk('escada-mezanino-topo', 'mezanino'),
  walk('escada-fundo-topo', 'fundo-leste'),
  walk('fundo-leste', 'fundo-centro'),
  // meio → chão, pela borda
  drop('engawa-sul', 'kaido-yatai'),
  drop('mezanino', 'hiroba'),
  drop('fundo-centro', 'ura-roji'),
  // meio → topo, por cima da boca do roji
  walk('engawa-roji', 'escada-terraco-topo'),
  // o topo
  walk('escada-terraco-topo', 'terraco-sul'),
  walk('terraco-sul', 'ponte-pe'),
  walk('ponte-pe', 'ponte'),
  seam('ponte', 'ponte'),
  walk('ponte-pe', 'terraco-centro'),
  walk('terraco-centro', 'terraco-meio'),
  walk('terraco-meio', 'terraco-norte'),
  // topo → chão: a ponta norte do terraço não tem platibanda, e cai no Kaidō.
  seamDrop('terraco-norte', 'kaido-yatai'),
]

/**
 * ```ts
 * neonKaidoNavGraph().nodes.length // 74
 * ```
 */
export function neonKaidoNavGraph(): NavGraph {
  return halfTurnNavGraph(HALF_OF_THE_NODES, HALF_OF_THE_LINKS)
}
