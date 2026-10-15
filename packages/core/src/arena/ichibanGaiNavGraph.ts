import type { NavGraph } from '../bots/navGraph.ts'
import type { Vec3 } from './arenaBlock.ts'
import { drop, type HalfLink, halfTurnNavGraph, jump, seam, walk } from './halfTurnNavGraph.ts'

/**
 * Por onde os bots andam no Ichiban-gai (ADR 0016): os pontos em que se pisa
 * nas três camadas do gdd e as ligações entre eles — andando, pulando ou
 * caindo.
 *
 * Escrito como o layout (`ichibanGai.ts`): **metade** do mapa, e a outra
 * metade é ela girada meia volta. O que atravessa de uma metade para a outra
 * (o eixo norte-sul do cruzamento, a ponte, a rua debaixo dela) é ligação de
 * costura, marcada com `twin`: ela liga o ponto desta metade ao gêmeo do
 * outro.
 *
 * **Quem prova que o grafo e a arena concordam é o teste**, que anda cada
 * ligação com o `stepCharacter` de verdade, contra as caixas de verdade. Mexer
 * numa caixa do layout sem mexer aqui é o teste falhando com o nome da
 * ligação que deixou de passar.
 *
 * Os pontos estão **no pé**, e não na convenção de olho dos spawns: é onde o
 * bot pisa.
 */

/** As alturas de projeto de `ichibanGai.ts`, repetidas porque lá elas são privadas. */
const MID_M = 4.5
const TOP_M = 9
/** O teto do caminhão, que é cobertura de 2,2 m: só sobe quem usa o pulo duplo. */
const TRUCK_TOP_M = 2.2

const HALF_OF_THE_NODES: Readonly<Record<string, Vec3>> = {
  // chão: a rua norte, de oeste para leste.
  'rua-norte-oeste': [-24.5, 0, 28],
  'rua-norte-pachinko': [-12.5, 0, 25.5],
  'avenida-norte': [-0.5, 0, 22.3],
  'rua-norte-carro': [11, 0, 25.5],
  'rua-norte-leste': [24, 0, 27],
  'incendio-pe': [18, 0, 23.4],
  // chão: os becos dos lados e a avenida do meio.
  'beco-oeste-norte': [-24.5, 0, 22],
  'beco-oeste': [-21.5, 0, 14],
  'beco-leste': [23.5, 0, 15],
  'beco-leste-sul': [23.5, 0, 8],
  'escada-pachinko-pe': [-6.8, 0, 21.5],
  'avenida-centro': [1, 0, 17],
  'escada-ponte-pe': [4, 0, 12.5],
  'avenida-sul': [6, 0, 9.5],
  // chão: o cruzamento e a transversal, debaixo e em volta da ponte.
  'cruzamento-norte': [0, 0, 9],
  'cruzamento-oeste': [-10, 0, 7.4],
  'cruzamento-leste': [10, 0, 4],
  'sob-ponte': [12, 0, 0],
  'transversal-oeste': [-19.5, 0, 4],
  'transversal-leste': [27, 0, 1],
  // em cima do caminhão da rua norte: o único ponto que pede o pulo duplo.
  'caminhao-topo': [-0.5, TRUCK_TOP_M, 26.25],
  // meio: a ponte, a passarela e o terraço do pachinko.
  'escada-ponte-topo': [4, MID_M, 0.3],
  'ponte-ponta': [15.2, MID_M, 0],
  'passarela-pachinko': [-15, MID_M, 5],
  'pachinko-telhado-sul': [-12, MID_M, 10],
  'pachinko-telhado': [-12, MID_M, 14.5],
  'pachinko-telhado-norte': [-14, MID_M, 17.5],
  'pachinko-borda-leste': [-7.8, MID_M, 14],
  'escada-pachinko-topo': [-16.5, MID_M, 21],
  'incendio-patamar': [18.3, MID_M, 12],
  'incendio-lance2-pe': [20, MID_M, 12.3],
  // topo: o telhado do mercado e a laje da escada de incêndio.
  'mercado-telhado-sul': [15.5, TOP_M, 10.8],
  'mercado-telhado': [11, TOP_M, 15],
  'mercado-telhado-norte': [10, TOP_M, 21],
  'incendio-topo': [16.5, TOP_M, 22.9],
  'incendio-lance2-topo': [20, TOP_M, 22.7],
}

const HALF_OF_THE_LINKS: readonly HalfLink[] = [
  // a rua norte
  walk('rua-norte-oeste', 'rua-norte-pachinko'),
  walk('rua-norte-pachinko', 'avenida-norte'),
  walk('avenida-norte', 'rua-norte-carro'),
  walk('rua-norte-carro', 'rua-norte-leste'),
  walk('rua-norte-carro', 'incendio-pe'),
  walk('incendio-pe', 'rua-norte-leste'),
  // os becos
  walk('rua-norte-oeste', 'beco-oeste-norte'),
  walk('beco-oeste-norte', 'beco-oeste'),
  walk('beco-oeste', 'transversal-oeste'),
  walk('rua-norte-leste', 'beco-leste'),
  walk('beco-leste', 'beco-leste-sul'),
  walk('beco-leste-sul', 'transversal-leste'),
  // a avenida
  walk('escada-pachinko-pe', 'rua-norte-pachinko'),
  walk('escada-pachinko-pe', 'avenida-norte'),
  walk('escada-pachinko-pe', 'avenida-centro'),
  walk('avenida-norte', 'avenida-centro'),
  walk('avenida-centro', 'escada-ponte-pe'),
  walk('avenida-centro', 'cruzamento-norte'),
  walk('avenida-sul', 'escada-ponte-pe'),
  walk('avenida-sul', 'cruzamento-leste'),
  // o cruzamento e a transversal
  walk('cruzamento-norte', 'cruzamento-oeste'),
  walk('cruzamento-oeste', 'transversal-oeste'),
  walk('cruzamento-leste', 'sob-ponte'),
  walk('sob-ponte', 'transversal-leste'),
  seam('cruzamento-norte', 'cruzamento-norte'),
  seam('sob-ponte', 'sob-ponte'),
  seam('cruzamento-oeste', 'sob-ponte'),
  seam('transversal-oeste', 'sob-ponte'),
  // o caminhão: sobe no pulo duplo, desce caindo para os dois lados.
  jump('avenida-norte', 'caminhao-topo'),
  drop('caminhao-topo', 'rua-norte-pachinko'),
  drop('caminhao-topo', 'rua-norte-carro'),
  // chão → meio: a escada da ponte e a do pachinko.
  walk('escada-ponte-pe', 'escada-ponte-topo'),
  walk('escada-pachinko-pe', 'escada-pachinko-topo'),
  // o meio
  seam('escada-ponte-topo', 'escada-ponte-topo'),
  walk('escada-ponte-topo', 'ponte-ponta'),
  seam('passarela-pachinko', 'ponte-ponta'),
  walk('passarela-pachinko', 'pachinko-telhado-sul'),
  walk('pachinko-telhado-sul', 'pachinko-telhado'),
  walk('pachinko-telhado', 'pachinko-telhado-norte'),
  walk('pachinko-telhado-norte', 'escada-pachinko-topo'),
  walk('pachinko-telhado', 'pachinko-borda-leste'),
  // meio → chão, pela borda: é o atalho de quem desce brigando.
  drop('pachinko-borda-leste', 'avenida-centro'),
  drop('pachinko-telhado', 'beco-oeste'),
  // meio → topo: a escada do mercado, da ponta da ponte ao telhado.
  walk('ponte-ponta', 'mercado-telhado-sul'),
  // chão → meio → topo pela escada de incêndio.
  walk('incendio-pe', 'incendio-patamar'),
  walk('incendio-patamar', 'incendio-lance2-pe'),
  walk('incendio-lance2-pe', 'incendio-lance2-topo'),
  walk('incendio-lance2-topo', 'incendio-topo'),
  // o topo
  walk('mercado-telhado-sul', 'mercado-telhado'),
  walk('mercado-telhado', 'mercado-telhado-norte'),
  walk('mercado-telhado-norte', 'incendio-topo'),
  drop('mercado-telhado-norte', 'avenida-norte'),
]

/**
 * O grafo inteiro: cada ponto e cada ligação da metade escrita, mais o gêmeo
 * girado de cada um. Costura de um ponto com o próprio gêmeo vira **uma**
 * ligação, não duas: as duas metades descreveriam o mesmo trecho.
 *
 * ```ts
 * const graph = ichibanGaiNavGraph()
 * graph.nodes.length // 72
 * ```
 */
export function ichibanGaiNavGraph(): NavGraph {
  return halfTurnNavGraph(HALF_OF_THE_NODES, HALF_OF_THE_LINKS)
}
