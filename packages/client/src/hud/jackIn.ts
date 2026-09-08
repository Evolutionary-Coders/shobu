import { dottedField } from './dottedField.ts'

/**
 * A transição da intro para o jogo: o jogador **acordando dentro do corpo** que
 * o trilho esquerdo passou a intro inteira ligando. A moldura rasga e sai em
 * cortes secos, as pálpebras abrem, a arena aparece desfocada e vem ao foco, e
 * a mira trava sobre a cruz do jogo. A linguagem é a de um jack-in: chapado,
 * fatiado, sem fade — o oposto de tela de carregamento.
 *
 * **A transição não segura ninguém, e essa regra vence a estética.** Quando a
 * primeira pálpebra abre o ponteiro já está travado e o jogador já pode andar e
 * atirar: a coreografia acontece por cima de uma arena viva, não no lugar dela.
 * O pilar 2 proíbe cutscene, e transição que bloqueia é cutscene curta. Por
 * isso o número aqui é pequeno e tem teste em cima dele.
 *
 * Este módulo é dado puro. Ele sabe o que mostrar, quando e por quanto tempo;
 * `jackIn.css` faz o movimento. O trato é o mesmo do resto da intro, e aqui ele
 * aperta: neste momento o laço de render já está no ar, e animação em
 * javascript disputaria o quadro com ele bem onde o nfr.md cobra o percentil 1.
 */

/** Duração total do salto, casada com as animações de `jackIn.css`. */
export const JACK_IN_MS = 960

/**
 * Quem pediu menos movimento não vê pálpebra, faixa nem foco: campo largo em
 * movimento é o caso de manual do gatilho vestibular. Sobra um corte curto, e
 * o javascript precisa saber a diferença: esperar 960 ms por uma animação que
 * não existe deixaria o jogador olhando uma tela morta com o jogo já rodando
 * atrás dela.
 */
export const JACK_IN_REDUCED_MS = 220

/**
 * Quantas faixas de interferência varrem a tela depois das pálpebras abrirem.
 * Cinco lê como sinal se acertando; mais que isso vira cortina, e a arena
 * precisa aparecer entre elas desde o começo.
 */
export const GLITCH_BAND_COUNT = 5

/**
 * ```ts
 * jackInDurationMs(false) // 960
 * ```
 */
export function jackInDurationMs(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? JACK_IN_REDUCED_MS : JACK_IN_MS
}

/* as faixas só começam com as pálpebras **abertas** (140→540ms em jackIn.css):
   a faixa inverte o que está atrás dela, e atrás de pálpebra fechada há preto —
   a faixa sairia branca e sólida, um retângulo colado em vez de sinal. a última
   termina antes da mira travar: primeiro + escalonamento + varredura mais longa
   fecham em 800ms. o teste vigia essa soma. */
const BAND_FIRST_MS = 540
const BAND_STAGGER_MS = 100
const SWEEP_MIN_MS = 120
const SWEEP_SPREAD_MS = 40
const BAND_HEIGHT_MIN_VH = 1.5
const BAND_HEIGHT_SPREAD_VH = 5

export interface GlitchBand {
  /** Borda superior da faixa, em % da altura da tela. */
  readonly topPct: number
  readonly heightVh: number
  /** Atraso até esta faixa começar a varrer. */
  readonly delayMs: number
  readonly durationMs: number
  /** 1 varre da esquerda para a direita, -1 ao contrário. */
  readonly direction: 1 | -1
}

export interface GlitchOptions {
  readonly count: number
  /** Semente do sorteio. Entra por parâmetro para o teste ser repetível. */
  readonly seed: number
}

/**
 * ```ts
 * const bands = buildGlitchBands({ count: GLITCH_BAND_COUNT, seed: Date.now() })
 * bands[0].delayMs // 550
 * ```
 */
export function buildGlitchBands(options: GlitchOptions): readonly GlitchBand[] {
  if (!Number.isInteger(options.count) || options.count < 1) {
    throw new RangeError(`count recebeu ${options.count}; esperado inteiro >= 1`)
  }
  const roll = createRoll(options.seed)
  return Array.from({ length: options.count }, (_, index) => rollBand(roll, index))
}

/** Quando a última faixa acaba de varrer. É o orçamento que o teste vigia. */
export function glitchDurationMs(bands: readonly GlitchBand[]): number {
  return bands.reduce((longest, band) => Math.max(longest, band.delayMs + band.durationMs), 0)
}

/**
 * O mostrador do salto, três linhas que fecham a ficção do trilho esquerdo: a
 * intro inteira foi ligar um corpo alugado peça por peça, e aqui ele passa a
 * ser seu. A última linha é a deixa das pálpebras terem aberto.
 *
 * ```ts
 * buildJackInReadout()[1] // 'CORPO ........ SEU'
 * ```
 */
export function buildJackInReadout(): readonly string[] {
  return [
    dottedField('ENLACE', 'FECHADO'),
    dottedField('CORPO', 'SEU'),
    dottedField('OLHOS', 'ABERTOS'),
  ]
}

/**
 * As faixas alternam direção e se espalham pela altura sem se sobrepor: cada
 * uma sorteia dentro da própria fatia da tela, senão duas faixas na mesma
 * altura viram uma faixa grossa e a tela lê como cortina.
 */
function rollBand(roll: () => number, index: number): GlitchBand {
  const slicePct = 100 / GLITCH_BAND_COUNT
  return {
    topPct: round1(index * slicePct + roll() * (slicePct - BAND_HEIGHT_SPREAD_VH)),
    heightVh: round1(BAND_HEIGHT_MIN_VH + roll() * BAND_HEIGHT_SPREAD_VH),
    delayMs: BAND_FIRST_MS + Math.round(roll() * BAND_STAGGER_MS),
    durationMs: SWEEP_MIN_MS + Math.round(roll() * SWEEP_SPREAD_MS),
    direction: index % 2 === 0 ? 1 : -1,
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * mulberry32, um gerador de 32 bits em quatro linhas. Não é `Math.random`
 * porque teste tem que ser repetível (F.I.R.S.T): a mesma semente devolve as
 * mesmas faixas, senão o teste que vigia o orçamento da transição vira loteria.
 */
function createRoll(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}
