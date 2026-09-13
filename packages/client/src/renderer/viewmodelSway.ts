/**
 * O movimento que a arma tem quando nenhum clipe está tocando: respiração e
 * balanço de passada.
 *
 * O `allanims` do sniper não tem idle — é animação de vitrine, e a arma gira o
 * tempo todo (ver `viewmodelClips.ts`). A pose parada é um quadro congelado, e
 * um quadro congelado é uma arma morta na tela. A vida vem daqui.
 *
 * **Girar a mira não mexe na arma, de propósito.** Existia aqui um atraso que
 * arrastava a arma atrás do giro, o tal "peso" que quase todo fps tem. Ele foi
 * removido: o giro do mouse é um sinal ruidoso — o navegador entrega os eventos
 * em lotes que não batem com o ritmo do quadro — e qualquer atraso que responda
 * rápido o bastante para ser sentido também responde rápido o bastante para
 * transformar esse ruído em tremor na tela. Foram três tentativas de filtrar o
 * ruído e manter o peso; nenhuma ficou boa, e a arma tremendo custa mais do que
 * o peso vale num jogo em que mirar é a mecânica inteira.
 *
 * O que sobra depende só de **tempo** (a respiração) e de **distância
 * percorrida** (a passada). Nenhum dos dois lê a câmera, e é por isso que virar
 * a mira não pode mais mexer na arma — não é uma questão de ajuste, é de o
 * caminho não existir.
 *
 * É **render**, igual ao `viewBob.ts`: nunca mexe na posição do jogador nem na
 * direção do tiro, então pode usar seno e não precisa ser igual em duas
 * máquinas.
 */

/** Uma respiração a cada 4 s: 15 por minuto, respiração de quem está parado e atento. */
const BREATH_CYCLE_S = 4

/** Milímetros. É sniper: a mira não pode passear. */
const BREATH_UP_M = 0.004
const BREATH_ROLL_RAD = 0.005

/**
 * Amplitudes da passada, na corrida base.
 *
 * Pequenas de propósito: a arma fica a 0,65 m do olho e ocupa um terço da
 * tela, então um centímetro no rig é um palmo na tela.
 */
const STRIDE_RIGHT_M = 0.004
const STRIDE_UP_M = 0.0025
const STRIDE_ROLL_RAD = 0.009

/**
 * A arma balança na **metade** da frequência da passada da câmera.
 *
 * A fase vem do balanço de câmera, que bate uma vez por passo — e o passo, na
 * corrida, é duas vezes por segundo. A arma seguindo isso batia quatro vezes
 * por segundo no eixo vertical, que lia como tremedeira em vez de corrida. A
 * meia frequência ela faz um oito lento, e continua presa à mesma fase.
 */
const WEAPON_STRIDE_RATIO = 0.5

/**
 * Quanto do caminho até o balanço alvo cada segundo percorre.
 *
 * A amplitude do balanço de câmera salta quando o jogador começa e para de
 * andar, e a arma seguindo esse salto dá um tranco.
 */
const STRIDE_FOLLOW_PER_S = 7

const TWO_PI = Math.PI * 2

/**
 * Quanto de um decaimento exponencial cabe num quadro de `dtS`.
 *
 * `1 - e^(-k·dt)` e não `min(1, k·dt)`. A aproximação linear tem dois defeitos:
 * **depende da taxa de quadros**, porque o tempo de quadro varia de 13 a 21 ms
 * num monitor de 60 Hz e ela transforma essa variação em variação da resposta;
 * e **satura** acima de `dt > 1/k`, quando passa a valer 1 e o valor perseguido
 * salta de uma vez para o alvo.
 */
export function followFraction(dtS: number, perSecond: number): number {
  return 1 - Math.exp(-perSecond * dtS)
}

export interface ViewmodelSway {
  /** Ângulo da respiração, de 0 a 2π. */
  breathPhase: number
  /** A amplitude da passada já filtrada: segue a da câmera com atraso. */
  strideAmplitude: number
  /** Falso para quem pediu menos movimento, como no balanço de câmera. */
  readonly enabled: boolean
}

/**
 * O que o balanço lê por quadro. **Nada aqui vem da mira**: a câmera não entra
 * nesta conta, e é essa ausência que garante que girar não mexe na arma.
 */
export interface ViewmodelSwaySample {
  /** A passada que o balanço de câmera já calculou — não recalcular aqui. */
  readonly stridePhase: number
  readonly strideAmplitude: number
}

export interface ViewmodelSwayOffset {
  right: number
  up: number
  rollRad: number
}

export function createViewmodelSway(enabled: boolean): ViewmodelSway {
  return { breathPhase: 0, strideAmplitude: 0, enabled }
}

/**
 * ```ts
 * advanceViewmodelSway(sway, { stridePhase, strideAmplitude }, dtS)
 * viewmodelSwayOffset(sway, sample, offset)
 * ```
 */
export function advanceViewmodelSway(
  sway: ViewmodelSway,
  sample: ViewmodelSwaySample,
  dtS: number,
): void {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  if (!sway.enabled) return
  sway.breathPhase = (sway.breathPhase + (dtS * TWO_PI) / BREATH_CYCLE_S) % TWO_PI
  sway.strideAmplitude +=
    (sample.strideAmplitude - sway.strideAmplitude) * followFraction(dtS, STRIDE_FOLLOW_PER_S)
}

export function viewmodelSwayOffset(
  sway: ViewmodelSway,
  sample: ViewmodelSwaySample,
  out: ViewmodelSwayOffset,
): ViewmodelSwayOffset {
  const breath = Math.sin(sway.breathPhase)
  // a amplitude filtrada, e não a crua da câmera: é o que tira o tranco de
  // começar e parar de andar.
  const stride = sway.strideAmplitude
  const phase = sample.stridePhase * WEAPON_STRIDE_RATIO
  out.right = Math.sin(phase) * STRIDE_RIGHT_M * stride
  out.up = Math.sin(2 * phase) * STRIDE_UP_M * stride + breath * BREATH_UP_M
  out.rollRad = Math.sin(phase) * STRIDE_ROLL_RAD * stride + breath * BREATH_ROLL_RAD
  return out
}
