/**
 * **Ichiban-gai** (一番街): a arena, uma rua de tóquio de dia desenhada com a
 * gramática de mapa do valorant (ADR 0010). O split é a referência — três
 * faixas no sentido norte-sul, um cruzamento no meio, e subida curta de uma
 * camada para a outra.
 *
 * Em metros, com x de oeste para leste e z de sul para norte. O piso tem 48 ×
 * 60 m: menor que a arena de oito jogadores, porque a partida agora é de
 * quatro, e arena grande demais para quatro é arena em que ninguém se encontra.
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
import {
  blockBetween,
  type GreyboxBlock,
  halfTurn,
  type StairFlight,
  stairFlight,
  type Vec3,
  withHalfTurnTwins,
} from './arenaBlock.ts'

const HALF_WIDTH_M = 24
const HALF_DEPTH_M = 30

/** As alturas de projeto das três camadas. */
const MID_FLOOR_M = 4.5
const TOP_FLOOR_M = 9

/**
 * O casco: prédios de borda que ninguém sobe. 20 m é o dobro do telhado mais
 * alto mais o pulo duplo, com folga. Quando o gancho existir, com 45 m de
 * alcance, o casco precisa ganhar teto de colisão (ADR 0010).
 */
const BARRIER_HEIGHT_M = 20

/**
 * 2,2 m: esconde um jogador de 2 m em pé e **cabe no pulo duplo** (2,68 m),
 * mas não no simples (1,5 m) — o teste do envelope vigia as três coisas.
 */
const COVER_HEIGHT_M = 2.2

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
  ]
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
  // chão → meio: do cruzamento até a ponte, subindo para oeste.
  {
    ...tierFlight('escada-ponte', 'cruzamento', 0),
    runAxis: 'x',
    fromM: 6.5,
    toM: -2.5,
    acrossM: [1.5, 3.5],
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

/** O que não tem gêmeo: o piso e o casco já são simétricos sozinhos. */
function shell(): readonly GreyboxBlock[] {
  const x = HALF_WIDTH_M
  const z = HALF_DEPTH_M
  const h = BARRIER_HEIGHT_M
  return [
    blockBetween('piso', 'floor', 'rua', [-x, -1, -z], [x, 0, z]),
    blockBetween('casco-norte', 'barrier', 'rua', [-x - 1, 0, z], [x + 1, h, z + 1]),
    blockBetween('casco-sul', 'barrier', 'rua', [-x - 1, 0, -z - 1], [x + 1, h, -z]),
    blockBetween('casco-leste', 'barrier', 'rua', [x, 0, -z], [x + 1, h, z]),
    blockBetween('casco-oeste', 'barrier', 'rua', [-x - 1, 0, -z], [-x, h, z]),
  ]
}

export const ICHIBAN_GAI_BLOCKOUT: readonly GreyboxBlock[] = [
  ...shell(),
  ...withHalfTurnTwins(halfOfTheMap()),
]

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
