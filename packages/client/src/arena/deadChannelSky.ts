/**
 * O céu da arena: *"o céu sobre o porto tinha a cor de televisão num canal
 * fora do ar"*, Gibson, **Neuromancer**, 1984.
 *
 * A frase resolve dois problemas de uma vez, e é por isso que ela entra e não
 * é só enfeite de referência:
 *
 * - **chuvisco de tv é escuro e sem croma**, que é exatamente o fundo de que
 *   uma silhueta de alvo precisa num jogo em que um tiro mata (pilar 1);
 * - **é granulado e quantizado**, que é o vocabulário ps1 da [ADR 0004] e o
 *   mesmo que a [ADR 0008] decide aplicar na saída.
 *
 * Leitura de 1984 — **chuvisco cinza** —, não a moderna, de tela azul: azul
 * saturado seria um fundo colorido atrás de cada alvo e brigaria com o ciano e
 * o magenta do neon. O céu é cinza porque tem que perder para o neon.
 *
 * O que ele substitui é um `clearColor` de cor única, que é o corte mais duro
 * que a imagem tinha: acima da linha dos prédios havia um vazio chapado.
 *
 * Não importa nada da engine de propósito: toda a aritmética de pixel mora
 * aqui e é testada em node, e `deadChannelSky.ts` do renderer só sobe os bytes
 * para uma textura.
 */
import { arenaFogSpec, type Rgb } from './arenaFogSpec.ts'

export interface DeadChannelSkySpec {
  /** O horizonte. **É a cor da névoa**, não uma cópia dela — ver `arenaFogSpec`. */
  readonly horizonRgb: Rgb
  /** O zênite, acima da poluição luminosa da cidade. Quase preto. */
  readonly zenithRgb: Rgb
  /** Largura e altura da textura, em texels. Pequena de propósito (ADR 0004). */
  readonly sizePx: readonly [number, number]
  /** Amplitude do chuvisco, em fração de canal. Baixa: é grão, não neve. */
  readonly grainAmplitude: number
  /**
   * Quantas vezes por segundo o chuvisco troca de semente. **Não é por
   * quadro**: televisão fora do ar não atualiza a 144 Hz, e chuvisco por quadro
   * deixa de ler como tv e passa a ler como ruído de renderizador.
   */
  readonly grainHz: number
  /** Voltas por segundo da banda que rola — o vertical dessincronizado da tv. */
  readonly rollHz: number
  /** Quanto a banda clareia o céu por onde passa, em fração de canal. */
  readonly bandAmplitude: number
  /** Altura da banda, em fração da textura. */
  readonly bandHeightFraction: number
}

/**
 * Teto de luminância do céu. **É regra de jogabilidade disfarçada de arte**: o
 * céu é o fundo contra o qual toda silhueta da camada `top` é lida, e céu
 * claro apaga alvo. O valor é baixo porque a cena é noturna e o neon é que
 * tem que ser a coisa mais clara da imagem.
 */
export const SKY_LUMINANCE_MAX = 0.25

/**
 * ```ts
 * deadChannelSkySpec().grainHz // 10
 * ```
 */
export function deadChannelSkySpec(): DeadChannelSkySpec {
  return {
    horizonRgb: arenaFogSpec().colorRgb,
    // o zênite foi [0.03, 0.03, 0.05] e o céu inteiro lia **preto**, com o
    // chuvisco aparecendo como sujeira em cima do preto em vez de estática.
    // Televisão fora do ar é cinza uniforme, não um gradiente que morre: o
    // zênite é mais escuro que o horizonte, e pouco.
    zenithRgb: [0.062, 0.062, 0.08],
    sizePx: [64, 128],
    // grão e banda são baixos porque somam ao horizonte, e o teto de
    // `SKY_LUMINANCE_MAX` vale no pior texel, não na média — é o teste que
    // impede alguém de subir o chuvisco até apagar a silhueta do alvo.
    grainAmplitude: 0.04,
    grainHz: 10,
    rollHz: 0.04,
    // 0,035 era luz que **se move** no fundo, e num sniper isso disputa atenção
    // com o alvo. Baixou para o limite em que ainda se percebe a rolagem da tv
    // e já não puxa o olho para fora do retículo (ADR 0009).
    bandAmplitude: 0.015,
    bandHeightFraction: 0.18,
  }
}

/** Luminância perceptual (Rec. 709), que é o que o teto acima mede. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * A cor do céu na altura `v`, onde 0 é o polo de baixo e 1 o de cima — a
 * convenção de uv da esfera do babylon.
 *
 * Abaixo do equador a cor não muda: aquela metade fica atrás do piso da arena
 * de qualquer jeito, e gradiente ali só gastaria faixa de cor. Acima, a
 * potência menor que 1 faz o horizonte subir depressa e o brilho ficar
 * **colado na linha do horizonte**, que é como poluição luminosa se comporta.
 *
 * ```ts
 * skyColourAt(deadChannelSkySpec(), 0.5) // o horizonte, igual à cor da névoa
 * ```
 */
export function skyColourAt(spec: DeadChannelSkySpec, v: number): Rgb {
  const above = Math.min(Math.max((v - 0.5) * 2, 0), 1) ** 0.6
  const [horizonR, horizonG, horizonB] = spec.horizonRgb
  const [zenithR, zenithG, zenithB] = spec.zenithRgb
  return [
    horizonR + (zenithR - horizonR) * above,
    horizonG + (zenithG - horizonG) * above,
    horizonB + (zenithB - horizonB) * above,
  ]
}

/**
 * Qual quadro de chuvisco está no ar em `elapsedS`. O adapter repinta quando
 * este número muda, e não a cada quadro — ver `grainHz`.
 *
 * ```ts
 * grainFrameAt(deadChannelSkySpec(), 0.25) // 2
 * ```
 */
export function grainFrameAt(spec: DeadChannelSkySpec, elapsedS: number): number {
  return Math.floor(elapsedS * spec.grainHz)
}

/**
 * O deslocamento vertical da banda em `elapsedS`, em voltas de textura [0, 1).
 *
 * ```ts
 * rollOffsetAt(deadChannelSkySpec(), 12.5) // 0.5
 * ```
 */
export function rollOffsetAt(spec: DeadChannelSkySpec, elapsedS: number): number {
  const turns = elapsedS * spec.rollHz
  return turns - Math.floor(turns)
}

/**
 * O quanto a banda clareia a altura `v`, com o centro dela em `rollOffset`.
 *
 * **Só a banda rola, não o céu.** Girar a textura inteira — que seria de graça,
 * um `vOffset` animado — levaria o zênite para a linha do horizonte a cada
 * volta, e o gradiente deixaria de dizer para onde é para cima. Televisão fora
 * de sincronia rola uma faixa sobre a imagem, não a imagem.
 *
 * ```ts
 * bandBoostAt(deadChannelSkySpec(), 0.5, 0.5) // 0.05, o centro da banda
 * ```
 */
export function bandBoostAt(spec: DeadChannelSkySpec, v: number, rollOffset: number): number {
  const raw = Math.abs(v - rollOffset)
  // a textura fecha em volta da esfera: a banda que sai por cima entra por
  // baixo, e sem esta linha ela desapareceria na emenda.
  const distance = Math.min(raw, 1 - raw)
  const halfHeight = spec.bandHeightFraction / 2
  if (distance >= halfHeight) return 0
  return spec.bandAmplitude * (0.5 + 0.5 * Math.cos((Math.PI * distance) / halfHeight))
}

/**
 * A textura do céu inteira, em bytes RGBA, linha por linha de baixo para cima.
 *
 * `random` entra por parâmetro e não como `Math.random` importado para o teste
 * poder fixar o chuvisco — é a mesma injeção que o resto do projeto faz.
 *
 * ```ts
 * paintDeadChannel(deadChannelSkySpec(), Math.random, 0).length // 64 * 128 * 4
 * ```
 */
export function paintDeadChannel(
  spec: DeadChannelSkySpec,
  random: () => number,
  rollOffset: number,
): Uint8Array<ArrayBuffer> {
  const [width, height] = spec.sizePx
  if (width <= 0 || height <= 0) {
    throw new RangeError(`sizePx recebeu [${width}, ${height}]; esperado dois lados > 0`)
  }
  const pixels = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    const v = row / (height - 1)
    // o mesmo gradiente vale para a linha inteira: o céu só muda na vertical,
    // e o que varia na horizontal é chuvisco, que é ruído e não cor.
    const colour = skyColourAt(spec, v)
    const boost = bandBoostAt(spec, v, rollOffset)
    paintRow(pixels, row * width * 4, width, colour, boost, spec, random)
  }
  return pixels
}

/**
 * O chuvisco é **monocromático**: o mesmo empurrão nos três canais. Ruído com
 * cor por canal vira confete colorido, que é o defeito clássico de quem faz
 * estática por acidente — tv fora do ar não tem croma.
 */
function paintRow(
  pixels: Uint8Array,
  start: number,
  width: number,
  colour: Rgb,
  boost: number,
  spec: DeadChannelSkySpec,
  random: () => number,
): void {
  const [red, green, blue] = colour
  for (let column = 0; column < width; column += 1) {
    const grain = boost + (random() - 0.5) * spec.grainAmplitude
    const texel = start + column * 4
    pixels[texel] = toByte(red + grain)
    pixels[texel + 1] = toByte(green + grain)
    pixels[texel + 2] = toByte(blue + grain)
    pixels[texel + 3] = 255
  }
}

function toByte(channel: number): number {
  return Math.round(Math.min(Math.max(channel, 0), 1) * 255)
}
