/**
 * O vocabulário com que a arena é escrita: caixas alinhadas aos eixos, em
 * **metros** (ADR 0004, ADR 0005). A mesma lista alimenta a colisão do núcleo
 * (`collisionBoxes.ts`), o greybox do babylon e o build de arte do blender
 * (ADR 0010) — não há segunda descrição da geometria que possa divergir.
 *
 * Não importa nada da engine de propósito.
 */

/**
 * O **tipo de superfície** de um bloco, que decide material e papel no mapa.
 * `cover` esconde um jogador em pé; `lowCover` — carro, mureta — só esconde
 * quem está agachado, e sobe com um pulo simples.
 *
 * A camada vertical do gdd (chão, meio, topo) **não** é isto: ela é a altura
 * do topo em que se pisa, e é derivada — ver `standingTierOf`.
 */
export type ArenaLayer =
  | 'floor'
  | 'barrier'
  | 'building'
  | 'walkway'
  | 'stair'
  | 'cover'
  | 'lowCover'

/**
 * A zona do mapa, no sentido de callout do valorant: cada uma tem cor e marco
 * próprios, para o jogador dizer onde está sem olhar o minimapa que não existe.
 */
export type ArenaZone = 'rua' | 'cruzamento' | 'mercado' | 'pachinko'

export type Vec3 = readonly [number, number, number]

export interface GreyboxBlock {
  readonly name: string
  readonly centerM: Vec3
  readonly sizeM: Vec3
  readonly layer: ArenaLayer
  readonly zone: ArenaZone
}

/**
 * Um bloco pelos dois cantos, que é como se desenha uma planta: "o mercado vai
 * de x 7 a 17 e de z 10 a 22". Os cantos podem vir em qualquer ordem.
 *
 * ```ts
 * blockBetween('mercado', 'building', 'mercado', [7, 0, 10], [17, 9, 22])
 * ```
 */
export function blockBetween(
  name: string,
  layer: ArenaLayer,
  zone: ArenaZone,
  cornerA: Vec3,
  cornerB: Vec3,
): GreyboxBlock {
  const low = perAxis((axis) => Math.min(cornerA[axis], cornerB[axis]))
  const high = perAxis((axis) => Math.max(cornerA[axis], cornerB[axis]))
  const sizeM = perAxis((axis) => high[axis] - low[axis])
  if (sizeM.some((side) => side <= 0)) {
    throw new RangeError(
      `${name} recebeu cantos [${cornerA.join(', ')}] e [${cornerB.join(', ')}]; esperado volume > 0 nos três eixos`,
    )
  }
  const centerM = perAxis((axis) => (low[axis] + high[axis]) / 2)
  return { name, layer, zone, centerM, sizeM }
}

export interface StairFlight {
  readonly name: string
  readonly zone: ArenaZone
  /** O eixo em que a escada corre. */
  readonly runAxis: 'x' | 'z'
  /** Onde o primeiro degrau começa, e onde o último termina, no eixo da escada. */
  readonly fromM: number
  readonly toM: number
  /** Onde a escada fica no outro eixo horizontal, de um lado ao outro. */
  readonly acrossM: readonly [number, number]
  /** O topo do chão de onde a escada sai, e o topo do piso aonde ela chega. */
  readonly baseM: number
  readonly topM: number
  readonly steps: number
  /**
   * De onde o degrau maciço começa, embaixo. Por padrão é `baseM`; uma escada
   * que sai de uma passarela e desce maciça até a rua passa 0 aqui.
   */
  readonly footM?: number
}

/**
 * Um lance de escada como degraus maciços, cada um da base até o próprio topo.
 * Maciço e não laje: é o volume que o bake e a colisão enxergam como uma peça,
 * e ninguém passa por baixo de uma escada encostada num prédio.
 *
 * O degrau é o único jeito de subir de camada sem pulo (gdd), e é por isso que
 * a altura dele é conferida contra `collision.stepHeightM` no teste da arena.
 *
 * ```ts
 * stairFlight({ name: 'escada', zone: 'rua', runAxis: 'x', fromM: -8, toM: -17,
 *   acrossM: [20, 22], baseM: 0, topM: 4.5, steps: 15 })
 * ```
 */
export function stairFlight(flight: StairFlight): readonly GreyboxBlock[] {
  if (!Number.isInteger(flight.steps) || flight.steps < 1) {
    throw new RangeError(`${flight.name} recebeu steps ${flight.steps}; esperado inteiro >= 1`)
  }
  const runPerStepM = (flight.toM - flight.fromM) / flight.steps
  const risePerStepM = (flight.topM - flight.baseM) / flight.steps
  const footM = flight.footM ?? flight.baseM
  return Array.from({ length: flight.steps }, (_, index) => {
    const startM = flight.fromM + runPerStepM * index
    const endM = startM + runPerStepM
    const stepTopM = flight.baseM + risePerStepM * (index + 1)
    const [acrossLow, acrossHigh] = flight.acrossM
    const cornerA: Vec3 =
      flight.runAxis === 'x' ? [startM, footM, acrossLow] : [acrossLow, footM, startM]
    const cornerB: Vec3 =
      flight.runAxis === 'x' ? [endM, stepTopM, acrossHigh] : [acrossHigh, stepTopM, endM]
    return blockBetween(`${flight.name}-${index + 1}`, 'stair', flight.zone, cornerA, cornerB)
  })
}

/**
 * Cada bloco e o seu gêmeo girado meia volta em torno do eixo vertical do
 * centro. É a simetria que um free-for-all pede: nenhum spawn nasce num lado
 * melhor do mapa, e cada callout existe duas vezes, com sufixo `-a` e `-b`.
 *
 * ```ts
 * withHalfTurnTwins([mercado]) // [mercado-a, mercado-b]
 * ```
 */
export function withHalfTurnTwins(blocks: readonly GreyboxBlock[]): readonly GreyboxBlock[] {
  return blocks.flatMap((block) => [
    { ...block, name: `${block.name}-a` },
    { ...block, name: `${block.name}-b`, centerM: halfTurn(block.centerM) },
  ])
}

/** Meia volta em torno do eixo y que passa pela origem. */
export function halfTurn([x, y, z]: Vec3): Vec3 {
  return [zeroSafe(-x), y, zeroSafe(-z)]
}

/**
 * O topo de um bloco, em metros. É a altura em que se pisa.
 *
 * ```ts
 * blockTopM(mercado) // 9
 * ```
 */
export function blockTopM(block: GreyboxBlock): number {
  return block.centerM[1] + block.sizeM[1] / 2
}

/** As três camadas verticais do gdd, pela altura do piso. */
export type StandingTier = 'chão' | 'meio' | 'topo'

/**
 * A camada vertical de quem pisa a `floorM` metros. Os limites ficam no meio
 * entre as alturas de projeto (0, 4,5 e 9 m): um degrau no meio da escada ainda
 * é da camada de onde ela sai.
 *
 * ```ts
 * standingTierOf(4.5) // 'meio'
 * ```
 */
export function standingTierOf(floorM: number): StandingTier {
  if (floorM < 2.25) return 'chão'
  if (floorM < 6.75) return 'meio'
  return 'topo'
}

function perAxis(coordinateOn: (axis: 0 | 1 | 2) => number): Vec3 {
  return [coordinateOn(0), coordinateOn(1), coordinateOn(2)]
}

/** `-0` não é um bug em ponto flutuante, mas é um bug em `toEqual` e em nome de arquivo. */
function zeroSafe(value: number): number {
  return value === 0 ? 0 : value
}
