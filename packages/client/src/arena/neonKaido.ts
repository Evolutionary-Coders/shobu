/**
 * **Neon-kaidō** (ネオン街道): a rua-cânion noturna. Um eixo norte-sul de 13 m
 * de fachada a fachada entre paredões de 28 a 46 m, com a megatorre no fim do
 * eixo — Kabukichō, a Jig-Jig Street de Night City, Mong Kok.
 *
 * Em metros, x de oeste para leste e z de sul para norte. A área de jogo tem
 * 70 × 70 m, e as três camadas do gdd sobem mais que no Ichiban-gai:
 *
 * - **chão**, y 0: o Kaidō, o roji (beco que liga a rua ao fundo), o ura-dōri
 *   (beco de fundo norte-sul) e o hiroba (pátio do canto);
 * - **meio**, y 6: a engawa (varanda corrida da fachada), as passarelas que
 *   cruzam a rua, o mezanino do hiroba e o telhado baixo do fundo;
 * - **topo**, y 13: o terraço na frente da torre recuada, e a ponte de cano que
 *   cruza a rua por cima — a travessia exposta.
 *
 * As torres (`tower`) sobem acima do teto da partida (`NEON_KAIDO_PLAY_AREA`):
 * o gancho alcança o topo delas, mas lá é fora da área (ADR 0011).
 *
 * Como no Ichiban-gai, metade do mapa é escrita e a outra é a meia volta.
 *
 * ```
 *  z=36 ┌─────┬──────────── W4 (torre 28) ─┬──Kaidō──┬─ ...gêmeo ...
 *       │fundo│ura│ W2 13 + torre 46       │engawa   │
 *  z=20 │ 20  │   │  terraço y 13 (x-12,5..-6,5)  ═══ ponte de cano (y 13, z 0)
 *       │fundo│   │                        │passarela│
 *       │ y 6 │   ├──── roji (z -10,5..-6,5) ────────┤
 *  z=-20│     │   │ W1 (torre 34)          │engawa   │
 *       │fundo│   ├── hiroba + mezanino ───┤         │
 *  z=-36└─────┴───┴────────────────────────┴─────────┴─
 *        x=-35   -24                     -6,5   0
 * ```
 */
import type { PlayArea } from '@shobu/core'
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

/** As alturas de projeto das três camadas. */
export const NEON_KAIDO_MID_M = 6
export const NEON_KAIDO_TOP_M = 13

/**
 * O teto da partida: três metros acima do terraço. Cabe o pulo duplo de quem
 * está no topo (2,68 m), e fica muito abaixo de qualquer telhado de torre.
 */
const CEILING_FEET_M = NEON_KAIDO_TOP_M + 3

const HALF_PLAY_M = 35
const WORLD_HALF_WIDTH_M = 60
const WORLD_HALF_DEPTH_M = 62
const WORLD_WALL_HEIGHT_M = 60

/** A laje das passarelas: por baixo se passa andando, como no Ichiban-gai. */
const SLAB_M = 0.5

/** A fachada do Kaidō, em x = ±6,5: 13 m de rua com calçada. */
const FACADE_X = 6.5

/** Vinte degraus por camada: 0,3 m na de 6 m, 0,35 m na de 7 m (`stepHeightM` é 0,4). */
const STEPS_PER_TIER = 20

/** O carro estacionado do kit: esconde quem está agachado, sobe com um pulo simples. */
const CAR_SIZE_M: Vec3 = [1.8, 1.4, 3.7]

function halfOfTheMap(): readonly GreyboxBlock[] {
  return [
    ...buildings(),
    ...walkways(),
    ...STAIR_FLIGHTS.flatMap(stairFlight),
    ...streetCover(),
    ...roofCover(),
    ...outskirts(),
  ]
}

/**
 * Os quarteirões. O W2 é o único prédio de topo pisável: o telhado dele é o
 * terraço de 6 m na frente da torre, que sobe por cima dele a partir de 13 m.
 */
function buildings(): readonly GreyboxBlock[] {
  const top = NEON_KAIDO_TOP_M
  return [
    blockBetween('w1', 'tower', 'kaido', [-24, 0, -24], [-FACADE_X, 34, -10.5]),
    blockBetween('w2', 'building', 'terraco', [-24, 0, -6.5], [-FACADE_X, top, 22]),
    blockBetween('w2-torre', 'tower', 'terraco', [-24, top, -6.5], [-12.5, 46, 22]),
    blockBetween('w4', 'tower', 'kaido', [-24, 0, 22], [-FACADE_X, 28, 36]),
    blockBetween('fundo', 'building', 'ura', [-35, 0, -20], [-27.5, NEON_KAIDO_MID_M, 20]),
    blockBetween('fundo-sul', 'tower', 'ura', [-35, 0, -36], [-27.5, 20, -20]),
    blockBetween('fundo-norte', 'tower', 'ura', [-35, 0, 20], [-27.5, 20, 36]),
  ]
}

/**
 * A engawa corre pela fachada oeste e a passarela cruza a rua até a do outro
 * lado; o gêmeo de cada uma fecha o anel do meio. O mezanino é o poleiro do
 * hiroba.
 */
function walkways(): readonly GreyboxBlock[] {
  const mid = NEON_KAIDO_MID_M
  const underside = mid - SLAB_M
  return [
    blockBetween('engawa', 'walkway', 'kaido', [-FACADE_X, underside, -22], [-4.5, mid, 4]),
    blockBetween('passarela', 'walkway', 'kaido', [-4.5, underside, 3], [4.5, mid, 6]),
    blockBetween('mezanino', 'walkway', 'hiroba', [-24, underside, -35], [-17, mid, -25]),
  ]
}

/**
 * A ponte de cano: o único bloco do meio do mapa, simétrico sozinho. Liga os
 * dois terraços a 13 m, por cima de tudo, sem cobertura nenhuma.
 */
function pipeBridge(): GreyboxBlock {
  const top = NEON_KAIDO_TOP_M
  return blockBetween(
    'ponte-cano',
    'walkway',
    'kaido',
    [-FACADE_X, top - SLAB_M, -1],
    [FACADE_X, top, 1],
  )
}

/** Os lances. Cada um é uma linha de level design, e o teste tira um por um. */
const STAIR_FLIGHTS: readonly StairFlight[] = [
  // chão → meio: da calçada do Kaidō até a ponta sul da engawa.
  {
    ...tierFlight('escada-engawa', 'kaido', 0, NEON_KAIDO_MID_M),
    runAxis: 'z',
    fromM: -30,
    toM: -22,
    acrossM: [-FACADE_X, -4.5],
  },
  // chão → meio: do hiroba ao mezanino.
  {
    ...tierFlight('escada-mezanino', 'hiroba', 0, NEON_KAIDO_MID_M),
    runAxis: 'x',
    fromM: -9,
    toM: -17,
    acrossM: [-27, -25],
  },
  // chão → meio: do ura-dōri ao telhado do fundo, apertando o beco para 1,5 m.
  {
    ...tierFlight('escada-fundo', 'ura', 0, NEON_KAIDO_MID_M),
    runAxis: 'z',
    fromM: -4,
    toM: 4,
    acrossM: [-27.5, -25.5],
  },
  // meio → topo: da engawa ao terraço, por cima da boca do roji.
  {
    ...tierFlight('escada-terraco', 'roji', NEON_KAIDO_MID_M, NEON_KAIDO_TOP_M),
    runAxis: 'x',
    fromM: -FACADE_X,
    toM: -12.5,
    acrossM: [-8.5, -6.5],
  },
]

function tierFlight(
  name: string,
  zone: GreyboxBlock['zone'],
  baseM: number,
  topM: number,
): Pick<StairFlight, 'name' | 'zone' | 'baseM' | 'topM' | 'steps'> {
  return { name, zone, baseM, topM, steps: STEPS_PER_TIER }
}

/**
 * A cobertura do chão. O Kaidō tem 70 m de ponta a ponta, e o gdd pede
 * cobertura no meio de toda linha longa: a barraca e o caminhão (e os gêmeos)
 * fatiam a rua em trechos de no máximo ~20 m.
 */
function streetCover(): readonly GreyboxBlock[] {
  return [
    cover('caminhao', 'kaido', [2.2, 0, -17], [4.6, -10]),
    cover('yatai', 'kaido', [-3, 0, -26], [-0.6, -23.6]),
    cover('conteiner', 'hiroba', [-23, 0, -34.8], [-20.6, -32.4]),
    cover('caixotes-ura', 'ura', [-27.3, 0, -16], [-25.8, -13.5]),
    cover('maquinas-venda', 'roji', [-20, 0, -10.5], [-18.8, -9.5]),
    car('carro-kaido', 'kaido', [4.6, -31.7]),
    car('carro-engawa', 'kaido', [-6.4, -16]),
    car('carro-hiroba', 'hiroba', [-15, -33.8], 'x'),
  ]
}

/**
 * O terraço: casa de máquinas e caixa d'água no meio da linha de 28 m, e a
 * platibanda na beira da rua — aberta onde a ponte chega e no fim norte, que é
 * por onde se pula de volta para a rua.
 */
function roofCover(): readonly GreyboxBlock[] {
  const top = NEON_KAIDO_TOP_M
  return [
    cover('casa-maquinas', 'terraco', [-12.3, top, 1], [-9.5, 3.3]),
    cover('caixa-dagua', 'terraco', [-12, top, 8], [-10, 10]),
    blockBetween('condensadoras', 'lowCover', 'terraco', [-12.4, top, 14], [-11.2, top + 1.2, 19]),
    blockBetween(
      'platibanda-sul',
      'lowCover',
      'terraco',
      [-FACADE_X - 0.3, top, -6.5],
      [-FACADE_X, top + 1.1, -1.5],
    ),
    blockBetween(
      'platibanda-norte',
      'lowCover',
      'terraco',
      [-FACADE_X - 0.3, top, 1.5],
      [-FACADE_X, top + 1.1, 16],
    ),
  ]
}

/** O fim do Kaidō no limite do bairro: o único ponto onde o bairro abre. */
const KAIDO_MOUTHS: readonly StreetMouth[] = [
  {
    name: 'fim-kaido',
    axis: 'z',
    edgeM: WORLD_HALF_DEPTH_M,
    inward: -1,
    span: [-FACADE_X, FACADE_X],
    zone: 'kaido',
  },
]

/** O bairro em volta: alto, sem fresta, aberto só no fim do Kaidō. */
function outskirts(): readonly GreyboxBlock[] {
  const w = WORLD_HALF_WIDTH_M
  const d = WORLD_HALF_DEPTH_M
  return [
    outskirt('bairro-oeste', 'ura', [-w, -36], [-HALF_PLAY_M, 36], 40),
    outskirt('bairro-sudoeste', 'kaido', [-w, -d], [-FACADE_X, -36], 30),
    outskirt('bairro-noroeste', 'kaido', [-w, 36], [-FACADE_X, d], 36),
    ...mapEdgeBlockades(KAIDO_MOUTHS),
  ]
}

function outskirt(
  name: string,
  zone: GreyboxBlock['zone'],
  cornerXz: readonly [number, number],
  farXz: readonly [number, number],
  heightM: number,
): GreyboxBlock {
  return blockBetween(
    name,
    'outskirt',
    zone,
    [cornerXz[0], 0, cornerXz[1]],
    [farXz[0], heightM, farXz[1]],
  )
}

/** Cobertura de altura padrão, apoiada em `baseCorner[1]`. */
function cover(
  name: string,
  zone: GreyboxBlock['zone'],
  baseCorner: Vec3,
  farCornerXz: readonly [number, number],
): GreyboxBlock {
  const [farX, farZ] = farCornerXz
  return blockBetween(name, 'cover', zone, baseCorner, [farX, baseCorner[1] + COVER_HEIGHT_M, farZ])
}

/** Um carro com o canto de menor x e z em `cornerXz`, comprido em z (ou em x). */
function car(
  name: string,
  zone: GreyboxBlock['zone'],
  cornerXz: readonly [number, number],
  lengthAxis: 'x' | 'z' = 'z',
): GreyboxBlock {
  const [width, height, length] = CAR_SIZE_M
  const [x, z] = cornerXz
  const far: Vec3 =
    lengthAxis === 'z' ? [x + width, height, z + length] : [x + length, height, z + width]
  return blockBetween(name, 'lowCover', zone, [x, 0, z], far)
}

export const NEON_KAIDO_BLOCKOUT: readonly GreyboxBlock[] = [
  ...worldShell(WORLD_HALF_WIDTH_M, WORLD_HALF_DEPTH_M, WORLD_WALL_HEIGHT_M),
  pipeBridge(),
  ...withHalfTurnTwins(halfOfTheMap()),
]

/** O olho a 1,8 m do piso: `collision.capsuleHeightM`, como no Ichiban-gai. */
const EYE_OVER_FLOOR_M = 1.8

/** Quatro no chão, dois no meio, dois no topo, cada um com o gêmeo. */
const HALF_OF_THE_SPAWNS_M: readonly Vec3[] = [
  [-15, EYE_OVER_FLOOR_M, -8.5],
  [-11, EYE_OVER_FLOOR_M, -30],
  [-5.5, NEON_KAIDO_MID_M + EYE_OVER_FLOOR_M, -16],
  [-9.5, NEON_KAIDO_TOP_M + EYE_OVER_FLOOR_M, 12],
]

export const NEON_KAIDO_SPAWN_POINTS_M: readonly Vec3[] = [
  ...HALF_OF_THE_SPAWNS_M,
  ...HALF_OF_THE_SPAWNS_M.map(halfTurn),
]

/** Até onde a partida vai: 70 × 70 m, e o teto acima do terraço. */
export const NEON_KAIDO_PLAY_AREA: PlayArea = {
  minX: -HALF_PLAY_M,
  maxX: HALF_PLAY_M,
  minZ: -HALF_PLAY_M,
  maxZ: HALF_PLAY_M,
  maxFeetY: CEILING_FEET_M,
}
