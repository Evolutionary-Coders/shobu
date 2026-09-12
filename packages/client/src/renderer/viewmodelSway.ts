/**
 * O movimento que a arma tem quando nenhum clipe está tocando: respiração,
 * atraso atrás da mira e balanço de passada.
 *
 * O `allanims` do sniper não tem idle — é animação de vitrine, e a arma gira o
 * tempo todo (ver `viewmodelClips.ts`). A pose parada é um quadro congelado, e
 * um quadro congelado é uma arma morta na tela. A vida vem daqui, que é como
 * fps faz de qualquer jeito: procedural responde ao que o jogador acabou de
 * fazer, coisa que clipe gravado não faz.
 *
 * É **render**, igual ao `viewBob.ts`: nunca mexe na posição do jogador nem na
 * direção do tiro, então pode usar seno e não precisa ser igual em duas
 * máquinas. O balanço de passada reaproveita a fase do `ViewBob` em vez de
 * recalcular a passada: dois relógios de passada sairiam de fase e a arma
 * balançaria contra a câmera.
 */

/** Uma respiração a cada 4 s: 15 por minuto, respiração de quem está parado e atento. */
const BREATH_CYCLE_S = 4

/** Milímetros. É sniper: a mira não pode passear. */
const BREATH_UP_M = 0.004
const BREATH_ROLL_RAD = 0.005

/** Quanto do giro da mira vira atraso da arma. */
const LAG_GAIN = 0.5

/** Teto do atraso: um giro de 180° não pode jogar a arma para fora do quadro. */
const LAG_MAX_RAD = 0.1

/** Quanto do caminho de volta ao centro o atraso percorre por segundo. */
const LAG_RETURN_PER_S = 9

/** Amplitudes da passada, na corrida base. Maiores que as da câmera: a arma é o que se vê. */
const STRIDE_RIGHT_M = 0.01
const STRIDE_UP_M = 0.006
const STRIDE_ROLL_RAD = 0.02

const TWO_PI = Math.PI * 2

export interface ViewmodelSway {
  /** Ângulo da respiração, de 0 a 2π. */
  breathPhase: number
  /** Atraso da arma atrás da mira, em radianos, decaindo para zero. */
  lagYawRad: number
  lagPitchRad: number
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
  return { breathPhase: 0, lagYawRad: 0, lagPitchRad: 0, enabled }
}

/**
 * ```ts
 * advanceViewmodelSway(sway, { yawDeltaRad, pitchDeltaRad, stridePhase, strideAmplitude }, dtS)
 * viewmodelSwayOffset(sway, offset)
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
  sway.lagYawRad = returnToCenter(sway.lagYawRad - sample.yawDeltaRad * LAG_GAIN, dtS)
  sway.lagPitchRad = returnToCenter(sway.lagPitchRad - sample.pitchDeltaRad * LAG_GAIN, dtS)
}

export function viewmodelSwayOffset(
  sway: ViewmodelSway,
  sample: ViewmodelSwaySample,
  out: ViewmodelSwayOffset,
): ViewmodelSwayOffset {
  const breath = Math.sin(sway.breathPhase)
  const stride = sample.strideAmplitude
  out.right = Math.sin(sample.stridePhase) * STRIDE_RIGHT_M * stride + sway.lagYawRad * 0.05
  out.up = Math.sin(2 * sample.stridePhase) * STRIDE_UP_M * stride + breath * BREATH_UP_M
  out.yawRad = sway.lagYawRad
  out.pitchRad = sway.lagPitchRad
  out.rollRad = Math.sin(sample.stridePhase) * STRIDE_ROLL_RAD * stride + breath * BREATH_ROLL_RAD
  return out
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

function returnToCenter(lagRad: number, dtS: number): number {
  const capped = Math.max(-LAG_MAX_RAD, Math.min(LAG_MAX_RAD, lagRad))
  return capped - capped * Math.min(1, dtS * LAG_RETURN_PER_S)
}
