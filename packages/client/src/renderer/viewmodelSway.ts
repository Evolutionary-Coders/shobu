/**
 * O movimento que a arma tem quando nenhum clipe está tocando: respiração e
 * balanço de passada.
 *
 * O `allanims` do sniper não tem idle — é animação de vitrine, e a arma gira o
 * tempo todo (ver `viewmodelClips.ts`). A pose parada é um quadro congelado, e
 * um quadro congelado é uma arma morta na tela. A vida vem daqui.
 *
 * São três fontes, e cada uma responde a uma coisa diferente: **tempo** (a
 * respiração), **distância percorrida** (a passada) e **giro da mira** (o
 * atraso, o "peso" que faz a arma arrastar atrás do movimento).
 *
 * O atraso já chegou a ser removido por engano, quando a arma tremia ao girar
 * e ele era o suspeito óbvio. Não era: o tremor vinha da câmera do viewmodel
 * desenhar com a matriz de vista do quadro anterior (ver
 * `followViewmodelCamera`), e removê-lo por inteiro não resolveu nada — foi
 * justamente essa a prova de que o problema estava noutro lugar.
 *
 * O que **é** verdade sobre ele é que o giro do mouse é um sinal ruidoso: o
 * navegador entrega os eventos em lotes que não batem com o ritmo do quadro.
 * Daí o filtro do delta e o decaimento exponencial: medido com entrada em
 * rajada e tempo de quadro irregular, o atraso arrasta 24 px e treme 1,15 px.
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

/**
 * Quanto do giro da mira vira atraso da arma.
 *
 * Baixo de propósito: o atraso gira o rig inteiro, e a arma tem quase um metro
 * de cano, então cada grau joga a luneta um punhado de pixels para o lado.
 */
const LAG_GAIN = 0.12

/** Teto do atraso, em radianos: pouco mais de 1,2°. */
const LAG_MAX_RAD = 0.022

/** Quanto do caminho de volta ao centro o atraso percorre por segundo. */
const LAG_RETURN_PER_S = 6

/**
 * Quanto do caminho até o giro **medido** o giro **usado** percorre por segundo.
 *
 * O passa-baixa fica no delta, não no atraso: o atraso continua respondendo na
 * hora, o que ele deixa de ver é a alternância entre quadros que vem de o
 * navegador entregar o mouse em lotes.
 */
const AIM_DELTA_FOLLOW_PER_S = 6

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
  /** Atraso da arma atrás da mira, em radianos, decaindo para zero. */
  lagYawRad: number
  lagPitchRad: number
  /** O giro da mira já filtrado: é o que alimenta o atraso, no lugar do delta cru. */
  smoothYawDeltaRad: number
  smoothPitchDeltaRad: number
  /** Falso para quem pediu menos movimento, como no balanço de câmera. */
  readonly enabled: boolean
}

export interface ViewmodelSwaySample {
  /** Quanto a mira girou neste quadro, em radianos. */
  readonly yawDeltaRad: number
  readonly pitchDeltaRad: number
  /** A passada que o balanço de câmera já calculou — não recalcular aqui. */
  readonly stridePhase: number
  readonly strideAmplitude: number
}

export interface ViewmodelSwayOffset {
  right: number
  up: number
  yawRad: number
  pitchRad: number
  rollRad: number
}

export function createViewmodelSway(enabled: boolean): ViewmodelSway {
  return {
    breathPhase: 0,
    strideAmplitude: 0,
    lagYawRad: 0,
    lagPitchRad: 0,
    smoothYawDeltaRad: 0,
    smoothPitchDeltaRad: 0,
    enabled,
  }
}

/**
 * Traz um delta de ângulo para (-π, π]. O babylon não normaliza `rotation.y`,
 * então passar de 2π dá um salto de 6,28 rad num quadro — que viraria o tranco
 * mais visível do jogo se entrasse no atraso da arma.
 */
export function wrapAngleRad(angleRad: number): number {
  const wrapped = (angleRad + Math.PI) % TWO_PI
  return (wrapped < 0 ? wrapped + TWO_PI : wrapped) - Math.PI
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
  const follow = followFraction(dtS, AIM_DELTA_FOLLOW_PER_S)
  sway.smoothYawDeltaRad += (sample.yawDeltaRad - sway.smoothYawDeltaRad) * follow
  sway.smoothPitchDeltaRad += (sample.pitchDeltaRad - sway.smoothPitchDeltaRad) * follow
  sway.lagYawRad = returnToCenter(sway.lagYawRad - sway.smoothYawDeltaRad * LAG_GAIN, dtS)
  sway.lagPitchRad = returnToCenter(sway.lagPitchRad - sway.smoothPitchDeltaRad * LAG_GAIN, dtS)
}

function returnToCenter(lagRad: number, dtS: number): number {
  const capped = Math.max(-LAG_MAX_RAD, Math.min(LAG_MAX_RAD, lagRad))
  return capped - capped * followFraction(dtS, LAG_RETURN_PER_S)
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
  out.right = Math.sin(phase) * STRIDE_RIGHT_M * stride + sway.lagYawRad * 0.05
  out.up = Math.sin(2 * phase) * STRIDE_UP_M * stride + breath * BREATH_UP_M
  out.yawRad = sway.lagYawRad
  out.pitchRad = sway.lagPitchRad
  out.rollRad = Math.sin(phase) * STRIDE_ROLL_RAD * stride + breath * BREATH_ROLL_RAD
  return out
}
