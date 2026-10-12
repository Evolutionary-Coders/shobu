/**
 * A chuva presa à câmera, como dado. São poucas cortinas — quads verticais a
 * distâncias fixas na frente do olho — com uma textura de riscos que desliza
 * para baixo: a chuva acompanha o jogador para onde ele for, e custa o mesmo
 * em qualquer ponto do mapa (um draw call por cortina, nenhum por gota).
 *
 * As cortinas de chuva cozidas no glb do look-dev ficavam no lugar: andando,
 * o jogador saía da chuva. Aqui ela é do olho, não do mapa.
 *
 * Não importa nada da engine: `renderer/cameraRain.ts` traduz isto.
 */

export interface RainSpec {
  /** Largura × altura da textura de riscos. */
  readonly sizePx: readonly [number, number]
  readonly streaks: number
  /** Semente do gerador: a mesma chuva em toda máquina. */
  readonly seed: number
  /** A velocidade de queda, em metros por segundo. */
  readonly fallMps: number
  /** A distância de cada cortina ao olho, da mais perto para a mais longe. */
  readonly curtainsM: readonly number[]
  /** Largura × altura de cada cortina, em metros. */
  readonly curtainSizeM: readonly [number, number]
  /**
   * Quanto de cortina cada repetição da textura cobre, largura × altura, em
   * metros. Pequeno de propósito: com a textura esticada na cortina inteira,
   * um pixel virava 25 cm e a chuva saía em bolotas de neve (captura de 11/10).
   */
  readonly tileM: readonly [number, number]
  /** O brilho do risco mais claro, de 0 a 1: a chuva soma luz, então pouco basta. */
  readonly brightness: number
}

/**
 * Os riscos da chuva em RGBA, preto onde não há gota: a cortina é aditiva, e
 * preto não soma nada. Cada risco é uma linha vertical de 6 a 22 px, mais
 * clara no meio, num azul-acinzentado que pega a cor do neon por baixo.
 *
 * ```ts
 * paintRainStreaks(neonRain()).length // 64 * 256 * 4
 * ```
 */
export function paintRainStreaks(spec: RainSpec): Uint8Array<ArrayBuffer> {
  const [width, height] = spec.sizePx
  const pixels = new Uint8Array(width * height * 4)
  const next = lcg(spec.seed)
  for (let streak = 0; streak < spec.streaks; streak += 1) {
    const x = Math.floor(next() * width)
    const top = Math.floor(next() * height)
    const length = 6 + Math.floor(next() * 17)
    const level = spec.brightness * (0.4 + 0.6 * next())
    for (let step = 0; step < length; step += 1) {
      const y = (top + step) % height
      const fade = Math.sin((Math.PI * (step + 0.5)) / length)
      paintPixel(pixels, (y * width + x) * 4, level * fade)
    }
  }
  return pixels
}

function paintPixel(pixels: Uint8Array, offset: number, level: number): void {
  pixels[offset] = Math.round(255 * level * 0.82)
  pixels[offset + 1] = Math.round(255 * level * 0.88)
  pixels[offset + 2] = Math.round(255 * level)
  pixels[offset + 3] = 255
}

/**
 * Quanto a textura da cortina `index` deslizou no instante `timeS`, em uv, de
 * 0 a 1. Cada cortina cai 7% mais rápido que a de trás: a mesma chuva em todas
 * deixaria os riscos alinhados, e alinhado parece grade, não chuva.
 *
 * ```ts
 * rainScrollAt(neonRain(), 0, 0.5) // a meio caminho da volta, ou perto disso
 * ```
 */
export function rainScrollAt(spec: RainSpec, index: number, timeS: number): number {
  const speed = (spec.fallMps * (1 + 0.07 * index)) / spec.tileM[1]
  return (((timeS * speed) % 1) + 1) % 1
}

/** Gerador congruente linear: repetível, sem o `Math.random` global. */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}
