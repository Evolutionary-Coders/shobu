/**
 * **Ichiban-gai** (一番街): a arena, uma rua de tóquio de dia desenhada com a
 * gramática de mapa do valorant (ADR 0010). O split é a referência — três
 * faixas no sentido norte-sul, um cruzamento no meio, e subida curta de uma
 * camada para a outra.
 *
 * Em metros, com x de oeste para leste e z de sul para norte. O miolo da arena
 * tem 48 × 60 m: menor que a arena de oito jogadores, porque a partida agora é
 * de quatro, e arena grande demais para quatro é arena em que ninguém se
 * encontra. A área de jogo vai 8 m além dele, e o bairro continua até
 * 112 × 124 m (ADR 0011).
 *
 * As três camadas do gdd são alturas de projeto, e todo piso em que se pisa
 * cai numa delas:
 *
 * - **chão**, y 0: ruas e becos, distância curta;
 * - **meio**, y 4,5: a ponte do cruzamento e o terraço do pachinko;
 * - **topo**, y 9: o telhado do mercado, linha longa e jogador exposto.
 *
 * Metade do mapa é escrita aqui e a outra metade é ela girada meia volta
 * (`withHalfTurnTwins`): num free-for-all nenhum spawn pode nascer do lado
 * melhor, e simetria de rotação — e não de espelho — mantém as rotas cruzadas
 * em vez de paralelas.
 *
 * ```
 *  z=30 ┌──────────────────────────────────────────────┐
 *       │  rua norte   (caminhão, máquinas de venda)    │
 *  z=22 │ escada→meio        ║          escada de incêndio
 *       │┌─────────┐  beco   ║ avenida  ┌─────────┐ beco│
 *       ││PACHINKO │  oeste  ║          │ MERCADO │leste│
 *  z=8  │└─────────┘         ║          └─────────┘     │
 *       │  ════════ ponte ══ CRUZAMENTO ══ ponte ═════   │
 *  z=-8 │       ┌─────────┐       ┌─────────┐           │
 *       │       │ MERCADO │       │PACHINKO │           │
 *  z=-22│       └─────────┘       └─────────┘           │
 *  z=-30└──────────────────────────────────────────────┘
 *        x=-24                                     x=24
 * ```
 */
import type { PlayArea } from '../match/playArea.ts'
import {
  blockBetween,
  COVER_HEIGHT_M,
  type GreyboxBlock,
  halfTurn,
  type StairFlight,
  stairFlight,
  type Vec3,
  withHalfTurnTwins,
} from './arenaBlock.ts'
import { mapEdgeBlockades, type StreetMouth, worldShell } from './mapEdges.ts'
import { outskirtLedges } from './outskirtLedges.ts'

/** As alturas de projeto das três camadas. */
const MID_FLOOR_M = 4.5
const TOP_FLOOR_M = 9

/**
 * O bairro em volta da área de jogo (ADR 0011): as ruas da arena continuam
 * por mais 32 m para cada lado, até uma parede invisível que ninguém alcança
 * nos 5 s de prazo fora da área — a 7,5 m/s, são 37 m ida e volta.
 */
/**
 * A área de jogo: 64 × 76 m, o retângulo que a regra de fora da área vigia.
 * Era 48 × 60 — o pé do casco antigo — até 29/09, e a rua colada na arena
 * ficava fora dela: 8 m a mais de cada lado trazem essas ruas para o jogo.
 */
const HALF_WIDTH_M = 32
const HALF_DEPTH_M = 38

const WORLD_HALF_WIDTH_M = 56
const WORLD_HALF_DEPTH_M = 62
const WORLD_WALL_HEIGHT_M = 40

/**
 * O carro estacionado: 1,4 m, a altura do golf do kit. Esconde quem está
 * agachado (1,2 m), deixa à mostra quem está em pé e sobe com um pulo simples
 * (1,5 m) — é a cobertura de quem troca tiro abaixado, e o degrau de quem quer
 * subir rápido. O teste do envelope baixo vigia as três coisas.
 */
const CAR_SIZE_M: Vec3 = [3.7, 1.4, 1.8]

/**
 * Quinze degraus de 0,3 m por camada. O `stepHeightM` é 0,4: 0,3 sobe sem
 * depender de o número bater na casa decimal.
 */
const STEPS_PER_TIER = 15

/** A metade do mapa que é escrita; a outra é ela girada. */
function halfOfTheMap(): readonly GreyboxBlock[] {
  return [
    ...buildings(),
    ...STAIR_FLIGHTS.flatMap(stairFlight),
    ...fireEscape(),
    ...walkways(),
    ...streetCover(),
    ...roofCover(),
    ...outskirts(),
  ]
}

/**
 * Os quarteirões de fora da área de jogo, entre as ruas que a arena continua:
 * a avenida para norte, a rua norte para leste e oeste, e uma transversal na
 * altura do cruzamento. Cada um com calçada de 2 m e altura própria, de 10 a
 * 24 m — nunca abaixo do alcance de pulo, porque prédio de fora não se sobe.
 *
 * Não é paredão: as ruas abrem a vista entre eles, e é por ela que a cidade
 * continua até a névoa.
 */
function outskirts(): readonly GreyboxBlock[] {
  return [
    // até o limite do bairro, sem fresta: sobra aberto só o que é rua e beco,
    // e é lá que entram os bloqueios de obra (`mapEdgeBlockades`).
    outskirt('bairro-norte-oeste', [-56, 32], [-32, 62], 18),
    outskirt('bairro-norte-centro-oeste', [-29, 32], [-9, 62], 12),
    outskirt('bairro-norte-centro-leste', [9, 32], [30, 62], 14),
    outskirt('bairro-norte-leste', [33, 32], [56, 62], 24),
    outskirt('bairro-leste-perto', [26, 8], [40, 20], 10),
    outskirt('bairro-leste-longe', [43, 8], [56, 20], 20),
    outskirt('bairro-oeste-perto', [-40, 8], [-26, 20], 16),
    outskirt('bairro-oeste-longe', [-56, 8], [-43, 20], 11),
    ...mapEdgeBlockades(STREET_MOUTHS),
  ]
}

/**
 * Onde cada rua e cada beco chega ao limite do bairro: a borda, o sentido de
 * quem entra no mapa e o trecho aberto. A outra metade é a meia volta destes.
 */
const STREET_MOUTHS: readonly StreetMouth[] = [
  { name: 'fim-avenida', axis: 'z', edgeM: WORLD_HALF_DEPTH_M, inward: -1, span: [-9, 9] },
  { name: 'fim-beco-oeste', axis: 'z', edgeM: WORLD_HALF_DEPTH_M, inward: -1, span: [-32, -29] },
  { name: 'fim-beco-leste', axis: 'z', edgeM: WORLD_HALF_DEPTH_M, inward: -1, span: [30, 33] },
  { name: 'fim-rua-norte-leste', axis: 'x', edgeM: WORLD_HALF_WIDTH_M, inward: -1, span: [20, 32] },
  { name: 'fim-rua-norte-oeste', axis: 'x', edgeM: -WORLD_HALF_WIDTH_M, inward: 1, span: [20, 32] },
  { name: 'fim-transversal', axis: 'x', edgeM: WORLD_HALF_WIDTH_M, inward: -1, span: [-8, 8] },
]

function outskirt(
  name: string,
  cornerXz: readonly [number, number],
  farXz: readonly [number, number],
  heightM: number,
): GreyboxBlock {
  return blockBetween(
    name,
    'outskirt',
    'rua',
    [cornerXz[0], 0, cornerXz[1]],
    [farXz[0], heightM, farXz[1]],
  )
}

function buildings(): readonly GreyboxBlock[] {
  return [
    blockBetween('mercado', 'building', 'mercado', [7, 0, 10], [17, TOP_FLOOR_M, 22]),
    blockBetween('pachinko', 'building', 'pachinko', [-17, 0, 8], [-7, MID_FLOOR_M, 20]),
  ]
}

/**
 * Os lances que ligam uma camada à outra. Tabela e não chamadas soltas: cada
 * lance é uma linha de level design, e é a lista inteira que o teste de rotas
 * tira um a um.
 */
const STAIR_FLIGHTS: readonly StairFlight[] = [
  // chão → meio: encostada na fachada norte do pachinko, subindo para oeste.
  {
    ...tierFlight('escada-pachinko', 'pachinko', 0),
    runAxis: 'x',
    fromM: -8,
    toM: -17,
    acrossM: [20, 22],
  },
  // chão → meio: do cruzamento até a ponte, subindo para o sul e chegando nela
  // de frente. Corria paralela à ponte até 29/09, e o jogador saía dela de
  // lado para cima da laje — uma escada que não parecia levar a lugar nenhum.
  {
    ...tierFlight('escada-ponte', 'cruzamento', 0),
    runAxis: 'z',
    fromM: 11,
    toM: 1.5,
    acrossM: [3, 5],
  },
  // meio → topo: da ponte até o telhado do mercado, maciça até a rua.
  {
    ...tierFlight('escada-mercado', 'mercado', MID_FLOOR_M),
    runAxis: 'z',
    fromM: 1.5,
    toM: 10,
    acrossM: [14, 17],
    footM: 0,
  },
  // chão → topo pela escada de incendio, em zigue-zague na fachada leste do mercado.
  {
    ...tierFlight('incendio-lance-1', 'mercado', 0),
    runAxis: 'z',
    fromM: 22,
    toM: 13,
    acrossM: [17, 19],
  },
  {
    ...tierFlight('incendio-lance-2', 'mercado', MID_FLOOR_M),
    runAxis: 'z',
    fromM: 13,
    toM: 22,
    acrossM: [19, 21],
  },
]

/** O que todo lance tem em comum: sobe uma camada inteira em `STEPS_PER_TIER` degraus. */
function tierFlight(
  name: string,
  zone: GreyboxBlock['zone'],
  baseM: number,
): Pick<StairFlight, 'name' | 'zone' | 'baseM' | 'topM' | 'steps'> {
  return { name, zone, baseM, topM: baseM + MID_FLOOR_M, steps: STEPS_PER_TIER }
}

/**
 * O que segura os dois lances da escada de incêndio: o patamar do meio, a base
 * maciça do segundo lance e a laje do topo. É a rota de quem quer o telhado sem
 * atravessar a ponte, e aperta o beco leste para 3 m — o beco estreito é onde a
 * distância curta vive.
 */
function fireEscape(): readonly GreyboxBlock[] {
  return [
    blockBetween('incendio-patamar', 'stair', 'mercado', [17, 0, 11], [21, MID_FLOOR_M, 13]),
    blockBetween('incendio-base', 'stair', 'mercado', [19, 0, 13], [21, MID_FLOOR_M, 22]),
    blockBetween('incendio-topo', 'walkway', 'mercado', [15, 8.6, 22], [21, TOP_FLOOR_M, 23.5]),
  ]
}

/**
 * Lajes de 0,5 m, soltas no ar: por baixo delas se passa andando, e é isso que
 * faz do cruzamento um lugar de três alturas em vez de uma praça.
 */
function walkways(): readonly GreyboxBlock[] {
  const underside = MID_FLOOR_M - 0.5
  return [
    blockBetween('ponte', 'walkway', 'cruzamento', [0, underside, -1.5], [17, MID_FLOOR_M, 1.5]),
    blockBetween(
      'passarela-pachinko',
      'walkway',
      'pachinko',
      [-17, underside, 1.5],
      [-13, MID_FLOOR_M, 8],
    ),
  ]
}

function streetCover(): readonly GreyboxBlock[] {
  return [
    cover('caminhao', 'rua', [-4, 0, 25], [3, 27.5]),
    cover('maquinas-venda', 'rua', [-23, 0, 23], [-21.8, 26.5]),
    cover('quiosque', 'cruzamento', [-5.5, 0, 4.5], [-3, 7]),
    cover('conteiner', 'rua', [21.5, 0, -6], [23.5, 0]),
    // estacionado na calçada do fundo da rua norte, de frente para o cruzamento.
    car('carro-rua', 'rua', [5, 28.1], 'x'),
    // encostado na fachada oeste do mercado, na avenida.
    car('carro-avenida', 'rua', [4.9, 13], 'z'),
  ]
}

/** Um carro com o canto de menor x e z em `cornerXz`, comprido no eixo pedido. */
function car(
  name: string,
  zone: GreyboxBlock['zone'],
  cornerXz: readonly [number, number],
  lengthAxis: 'x' | 'z',
): GreyboxBlock {
  const [length, height, width] = CAR_SIZE_M
  const [x, z] = cornerXz
  const far: Vec3 =
    lengthAxis === 'x' ? [x + length, height, z + width] : [x + width, height, z + length]
  return blockBetween(name, 'lowCover', zone, [x, 0, z], far)
}

function roofCover(): readonly GreyboxBlock[] {
  return [
    cover('caixa-dagua', 'mercado', [13.5, TOP_FLOOR_M, 18.5], [16, 21]),
    cover('outdoor', 'mercado', [7, TOP_FLOOR_M, 13], [7.8, 18]),
    cover('ar-condicionado', 'pachinko', [-16, MID_FLOOR_M, 9], [-14, 11]),
    cover('letreiro', 'pachinko', [-11, MID_FLOOR_M, 18.6], [-8, 19.4]),
  ]
}

/** Uma cobertura de altura padrão, apoiada em `baseCorner[1]`. */
function cover(
  name: string,
  zone: GreyboxBlock['zone'],
  baseCorner: Vec3,
  farCornerXz: readonly [number, number],
): GreyboxBlock {
  const [farX, farZ] = farCornerXz
  return blockBetween(name, 'cover', zone, baseCorner, [farX, baseCorner[1] + COVER_HEIGHT_M, farZ])
}

const SOLID_BLOCKOUT: readonly GreyboxBlock[] = [
  ...worldShell(WORLD_HALF_WIDTH_M, WORLD_HALF_DEPTH_M, WORLD_WALL_HEIGHT_M),
  ...withHalfTurnTwins(halfOfTheMap()),
]

/**
 * Os toldos e as escadas de incêndio do bairro saem da metade escrita, como o
 * resto, e giram junto com ela: é o que mantém a meia volta exata. Quem decide
 * se a face está aberta para a rua é o mapa inteiro.
 */
const OUTSKIRT_LEDGES = withHalfTurnTwins(
  outskirtLedges(
    halfOfTheMap().filter((block) => block.layer === 'outskirt'),
    SOLID_BLOCKOUT,
    { halfWidthM: WORLD_HALF_WIDTH_M, halfDepthM: WORLD_HALF_DEPTH_M },
  ),
)

export const ICHIBAN_GAI_BLOCKOUT: readonly GreyboxBlock[] = [...SOLID_BLOCKOUT, ...OUTSKIRT_LEDGES]

/**
 * Oito spawns para quatro jogadores: quatro no chão, dois no meio, dois no
 * topo, e cada um com o gêmeo girado. A dispersão é a defesa contra camping de
 * spawn — não regra de invulnerabilidade, que o pilar 1 proíbe.
 *
 * Estão na **convenção de altura de olho**: o y é o piso mais
 * `collision.capsuleHeightM`, e quem converte para pé é `competitorFeetM`.
 * Mexer na altura da cápsula **obriga** a mexer aqui junto — é o que o teste de
 * `collisionBoxes` vigia.
 *
 * O spawn 0 é onde o jogador nasce enquanto não há servidor: a rua norte,
 * olhando para o cruzamento.
 */
/**
 * A altura do spawn acima do piso: é `collision.capsuleHeightM`, que o layout
 * não pode importar (a configuração chega por parâmetro, ADR 0005). O teste de
 * `collisionBoxes` confere que os dois números são o mesmo.
 *
 * Caiu de 2 para 1,8 m em 28/09: com cápsula de 2 m o olho ficava a 1,84 m, a
 * altura de uma pessoa de dois metros, e carro e prédio pareciam de brinquedo.
 */
const EYE_OVER_FLOOR_M = 1.8

const HALF_OF_THE_SPAWNS_M: readonly Vec3[] = [
  [-14, EYE_OVER_FLOOR_M, 26],
  [20.5, EYE_OVER_FLOOR_M, -14],
  [-12, MID_FLOOR_M + EYE_OVER_FLOOR_M, 14],
  [11, TOP_FLOOR_M + EYE_OVER_FLOOR_M, 16],
]

export const ICHIBAN_GAI_SPAWN_POINTS_M: readonly Vec3[] = [
  ...HALF_OF_THE_SPAWNS_M,
  ...HALF_OF_THE_SPAWNS_M.map(halfTurn),
]

/**
 * Até onde a partida vai: o piso do Ichiban-gai, sem folga. A cidade continua
 * em volta e dá para chegar nela, mas fora deste retângulo o jogador tem
 * `match.outOfBoundsGraceS` para voltar antes de morrer e reaparecer num spawn.
 *
 * Os mesmos meios lados que o layout usa para a arena, e não números
 * repetidos: se a arena crescer, a área cresce junto. O bairro em volta vai
 * até `WORLD_HALF_WIDTH_M` por `WORLD_HALF_DEPTH_M` (ADR 0011).
 */
export const ICHIBAN_GAI_PLAY_AREA: PlayArea = {
  minX: -HALF_WIDTH_M,
  maxX: HALF_WIDTH_M,
  minZ: -HALF_DEPTH_M,
  maxZ: HALF_DEPTH_M,
}
