/**
 * O rastro de luz da lâmina na fase rápida do corte: uma fita entre as
 * últimas posições do meio e da ponta da lâmina, que o adapter
 * (`bladeTrailMesh.ts`) desenha aditiva, na cor do fio. É o borrão de
 * movimento barato: um corte de 60 ms a 60 Hz são quatro quadros, e sem o
 * rastro o olho vê a lâmina em quatro lugares, e não um arco.
 *
 * Código puro e sem alocação: o histórico é um buffer fixo, deslocado no
 * lugar a cada amostra.
 */

/**
 * Quantas amostras a fita guarda: ~80 ms a 60 Hz, a passagem pela retícula.
 * Com nove, a 45 Hz a fita pegava o alto do corte inteiro e virava uma faixa
 * vermelha parada no canto da tela depois de a lâmina já ter passado (12/10).
 */
export const TRAIL_SAMPLES = 6

/** A luz da ponta na amostra nova: soma aditiva cheia estourava o vermelho. */
export const TRAIL_PEAK = 0.45

/** Por amostra: o ponto de dentro (x, y, z) e a ponta (x, y, z). */
const SAMPLE_FLOATS = 6

/**
 * Quanto uma amostra vive, em segundos: a luz cai com a **idade**, e não com
 * a posição na fila. A 30 Hz, seis amostras são 200 ms, e a fila apagando
 * por índice deixava o arco inteiro aceso depois de a lâmina já ter passado.
 */
export const TRAIL_LIFE_S = 0.08

export interface BladeTrail {
  readonly samples: Float32Array
  /** O instante de cada amostra, em segundos, na mesma ordem. */
  readonly timesS: Float32Array
  count: number
}

export function createBladeTrail(): BladeTrail {
  return {
    samples: new Float32Array(TRAIL_SAMPLES * SAMPLE_FLOATS),
    timesS: new Float32Array(TRAIL_SAMPLES),
    count: 0,
  }
}

/**
 * Entra a amostra deste quadro, na frente; a mais velha sai.
 *
 * ```ts
 * pushTrailSample(trail, inner, tip, nowS)
 * ```
 */
export function pushTrailSample(
  trail: BladeTrail,
  inner: { readonly x: number; readonly y: number; readonly z: number },
  tip: { readonly x: number; readonly y: number; readonly z: number },
  nowS: number,
): void {
  trail.samples.copyWithin(SAMPLE_FLOATS, 0, (TRAIL_SAMPLES - 1) * SAMPLE_FLOATS)
  trail.timesS.copyWithin(1, 0, TRAIL_SAMPLES - 1)
  trail.timesS[0] = nowS
  trail.samples[0] = inner.x
  trail.samples[1] = inner.y
  trail.samples[2] = inner.z
  trail.samples[3] = tip.x
  trail.samples[4] = tip.y
  trail.samples[5] = tip.z
  trail.count = Math.min(TRAIL_SAMPLES, trail.count + 1)
}

/** O corte acabou: a próxima fita começa do zero, e não ligada ao golpe anterior. */
export function clearBladeTrail(trail: BladeTrail): void {
  trail.count = 0
}

/** Os índices da fita, fixos: dois triângulos entre cada amostra e a seguinte. */
export function trailIndices(): number[] {
  const indices: number[] = []
  for (let sample = 0; sample < TRAIL_SAMPLES - 1; sample += 1) {
    const inner = sample * 2
    indices.push(inner, inner + 1, inner + 3, inner, inner + 3, inner + 2)
  }
  return indices
}

/**
 * As posições e as cores dos vértices da fita: dois por amostra (dentro e
 * ponta). A luz cai com a idade da amostra (`TRAIL_LIFE_S`) e é mais forte na ponta, que é o
 * que corre mais; as amostras que ainda não existem repetem a mais velha, e a
 * fita fica achatada até o corte andar.
 *
 * ```ts
 * writeTrailRibbon(trail, shot.trail, nowS, [1, 0.16, 0.24], positions, colors)
 * ```
 */
export function writeTrailRibbon(
  trail: Readonly<BladeTrail>,
  strength: number,
  nowS: number,
  color: readonly [number, number, number],
  positions: Float32Array,
  colors: Float32Array,
): void {
  const newest = Math.max(trail.count, 1) - 1
  for (let sample = 0; sample < TRAIL_SAMPLES; sample += 1) {
    const from = Math.min(sample, newest) * SAMPLE_FLOATS
    // cópia à mão: `subarray` criaria uma vista nova por amostra, por quadro.
    for (let c = 0; c < SAMPLE_FLOATS; c += 1) {
      positions[sample * SAMPLE_FLOATS + c] = trail.samples[from + c] as number
    }
    const life = sample <= newest ? 1 - (nowS - (trail.timesS[sample] as number)) / TRAIL_LIFE_S : 0
    const fade = Math.max(0, life)
    const glow = trail.count > 1 ? TRAIL_PEAK * strength * fade * fade : 0
    // o lado de dentro apagado: a fita esfuma para o cabo, em vez de uma placa.
    writeColor(colors, sample * 2, color, 0)
    writeColor(colors, sample * 2 + 1, color, glow)
  }
}

function writeColor(
  colors: Float32Array,
  vertex: number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  const at = vertex * 4
  colors[at] = color[0]
  colors[at + 1] = color[1]
  colors[at + 2] = color[2]
  colors[at + 3] = alpha
}
