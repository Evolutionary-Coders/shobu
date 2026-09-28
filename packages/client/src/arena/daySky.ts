/**
 * O céu de dia da arena (ADR 0010), em dado puro: as cores do gradiente e a
 * direção do sol. Quem traduz para o babylon é `renderer/arenaSky.ts`.
 *
 * O sol mora aqui, e não na especificação de luz, porque **três consumidores
 * precisam do mesmo sol**: a luz dinâmica dos personagens, o bake do blender e
 * a névoa, que desbota para a cor do horizonte. Sol de bake diferente do sol
 * do personagem é o competidor com a sombra do lado errado do prédio.
 */

export type Rgb = readonly [number, number, number]

export interface DaySkySpec {
  /** Azul do alto. É o que aparece atrás de quem está no telhado olhando para cima. */
  readonly zenithRgb: Rgb
  /** Branco azulado de neblina de cidade. É também a cor da névoa (`arenaFogSpec.ts`). */
  readonly horizonRgb: Rgb
  /** Abaixo do horizonte: só aparece nas frestas entre as fachadas de fundo. */
  readonly belowHorizonRgb: Rgb
  /** Para onde a luz do sol **anda**, do céu para o chão. Não precisa ser unitário. */
  readonly sunTravelM: readonly [number, number, number]
  readonly sunRgb: Rgb
  /** Largura × altura da textura do gradiente. O céu só muda na vertical. */
  readonly sizePx: readonly [number, number]
}

/**
 * ```ts
 * daySkySpec().horizonRgb // [0.78, 0.84, 0.9]
 * ```
 */
export function daySkySpec(): DaySkySpec {
  return {
    zenithRgb: [0.3, 0.52, 0.86],
    horizonRgb: [0.78, 0.84, 0.9],
    belowHorizonRgb: [0.6, 0.62, 0.66],
    // sol de fim de manhã, alto e vindo de nordeste: as fachadas que dão para
    // o cruzamento ficam metade ao sol e metade à sombra, e o chão das ruas
    // estreitas fica na sombra — é o contraste de valor que dá lugar ao mapa.
    sunTravelM: [-0.45, -1, -0.35],
    sunRgb: [1, 0.95, 0.86],
    sizePx: [4, 128],
  }
}

/** Luminância relativa (Rec. 709), a medida de valor de todo teste de legibilidade. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * A cor do céu na altura `v` da textura, com 0 no pé da cúpula, 0,5 no
 * horizonte e 1 no zênite.
 *
 * ```ts
 * skyColourAt(daySkySpec(), 0.5) // o horizonte
 * ```
 */
export function skyColourAt(spec: DaySkySpec, v: number): Rgb {
  if (v < 0.5) return spec.belowHorizonRgb
  // expoente abaixo de 1: o branco do horizonte sobe pouco e o azul toma o céu
  // cedo, que é como um céu limpo se parece de dentro de uma rua.
  const above = Math.min((v - 0.5) * 2, 1) ** 0.55
  return mix(spec.horizonRgb, spec.zenithRgb, above)
}

/** Unitário na direção em que a luz do sol anda. */
export function sunTravelDirection(spec: DaySkySpec): readonly [number, number, number] {
  const [x, y, z] = spec.sunTravelM
  const length = Math.hypot(x, y, z)
  if (length === 0) {
    throw new RangeError('sunTravelM recebeu [0, 0, 0]; esperado vetor com comprimento > 0')
  }
  return [x / length, y / length, z / length]
}

/**
 * O gradiente como pixels rgba, linha 0 no pé da cúpula.
 *
 * ```ts
 * RawTexture.CreateRGBATexture(paintDaySky(spec), ...spec.sizePx, scene)
 * ```
 */
export function paintDaySky(spec: DaySkySpec): Uint8Array<ArrayBuffer> {
  const [width, height] = spec.sizePx
  if (width <= 0 || height <= 1) {
    throw new RangeError(`sizePx recebeu [${width}, ${height}]; esperado largura > 0 e altura > 1`)
  }
  const pixels = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    const colour = skyColourAt(spec, row / (height - 1))
    for (let column = 0; column < width; column += 1) {
      pixels.set([...colour.map(toByte), 255], (row * width + column) * 4)
    }
  }
  return pixels
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ]
}

function toByte(channel: number): number {
  return Math.round(Math.min(Math.max(channel, 0), 1) * 255)
}
