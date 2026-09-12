/**
 * A escada da luneta.
 *
 * **É telêmetro, não escada de queda de bala.** O sniper é hitscan — não há
 * queda —, e marca de queda seria decoração fingindo ser instrumento, que é
 * exatamente o que este projeto não faz (ver `progressSink.ts`). Cada traço
 * tem a largura angular verdadeira de uma cápsula humana naquele alcance:
 * encostar o alvo no traço **lê a distância**.
 */
export interface ScopeTick {
  /** y no viewBox da lente. */
  readonly y: number
  /** Meia largura do traço: a altura angular da cápsula naquele alcance. */
  readonly halfWidth: number
  readonly label: string
}

export interface ScopeLadderOptions {
  readonly scopedFovDeg: number
  readonly capsuleHeightM: number
  readonly rangesM: readonly number[]
  readonly viewBoxSize: number
}

export const LADDER_RANGES_M: readonly number[] = [100, 200, 300, 400]

/**
 * A lente cobre esta fração da largura da tela a 16:9. Fora dessa proporção a
 * escada erra alguns por cento; a alternativa seria remontar a cada resize, e
 * a escada é leitura de campo, não balística.
 */
export const LENS_FOV_FRACTION = 0.46

/**
 * ```ts
 * buildScopeLadder({ scopedFovDeg: 22, capsuleHeightM: 1.8, rangesM: LADDER_RANGES_M, viewBoxSize: 1000 })
 * ```
 */
export function buildScopeLadder(options: ScopeLadderOptions): readonly ScopeTick[] {
  const { scopedFovDeg, capsuleHeightM, rangesM, viewBoxSize } = options
  if (!(scopedFovDeg > 0) || scopedFovDeg >= 180) {
    throw new RangeError(`scopedFovDeg recebeu ${scopedFovDeg}; esperado entre 0 e 180`)
  }
  if (!(capsuleHeightM > 0)) {
    throw new RangeError(`capsuleHeightM recebeu ${capsuleHeightM}; esperado número > 0`)
  }
  // quantos viewBox cabem no fov que a lente cobre.
  const lensFovDeg = scopedFovDeg * LENS_FOV_FRACTION
  const unitsPerDeg = viewBoxSize / lensFovDeg
  const center = viewBoxSize / 2
  const spacing = viewBoxSize / (rangesM.length * 2 + 2)
  return rangesM.map((rangeM, index) => ({
    y: center + spacing * (index + 1),
    halfWidth: angularHalfWidth(capsuleHeightM, rangeM, unitsPerDeg),
    label: `${Math.round(rangeM)}`,
  }))
}

/** Meio ângulo subtendido pela cápsula àquela distância, em unidades do viewBox. */
function angularHalfWidth(capsuleHeightM: number, rangeM: number, unitsPerDeg: number): number {
  const degrees = (2 * Math.atan(capsuleHeightM / (2 * rangeM)) * 180) / Math.PI
  return (degrees * unitsPerDeg) / 2
}
