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

/**
 * Quanto do giro da mira vira atraso da arma.
 *
 * Baixo de propósito. O atraso gira o rig inteiro, e a arma tem quase um metro
 * de cano: cada grau de giro joga a luneta um punhado de pixels para o lado da
 * tela. Com meio de ganho e 5,7° de teto, virar o mouse arrastava a arma para
 * fora do quadro.
 */
const LAG_GAIN = 0.28

/** Teto do atraso, em radianos: pouco menos de 2,5°. */
const LAG_MAX_RAD = 0.042

/** Quanto do caminho de volta ao centro o atraso percorre por segundo. */
const LAG_RETURN_PER_S = 9

/**
 * Quanto do caminho até o giro **medido** o giro **usado** percorre por segundo.
 *
 * O delta de mira por quadro é um sinal sujo: o navegador entrega os eventos de
 * mouse em rajadas que não batem com o ritmo do quadro, então um quadro recebe
 * dois movimentos e o seguinte nenhum. Alimentar o atraso com esse número cru
 * fazia a arma tremer em vez de arrastar — ela seguia o ruído da amostragem, e
 * não o giro do jogador.
 *
 * O filtro é passa-baixa no **delta**, não no atraso: o atraso continua
 * respondendo na hora, o que ele deixa de ver é a alternância entre quadros.
 */
const AIM_DELTA_FOLLOW_PER_S = 22

/**
 * Amplitudes da passada, na corrida base.
 *
 * Pequenas de propósito: a arma fica a 0,65 m do olho e ocupa um terço da
 * tela, então um centímetro no rig é um palmo na tela. O balanço tem que dizer
 * "estou correndo", não passear a arma pelo quadro — e a mira, que mora nela,
 * não pode sair do lugar.
 */
const STRIDE_RIGHT_M = 0.004
const STRIDE_UP_M = 0.0025
const STRIDE_ROLL_RAD = 0.009

/**
 * A arma balança na **metade** da frequência da passada da câmera.
 *
 * A fase vem do balanço de câmera, que bate uma vez por passo — e o passo, na
 * corrida, é duas vezes por segundo. A arma seguindo isso batia quatro vezes
 * por segundo no eixo vertical, que é o que lia como tremedeira em vez de
 * corrida. A meia frequência ela faz um oito lento, e continua presa à mesma
 * fase: o pé e a arma nunca saem de sincronia, só contam a passada em
 * compassos diferentes.
 */
const WEAPON_STRIDE_RATIO = 0.5

/**
 * Quanto do caminho até o balanço alvo cada segundo percorre.
 *
 * O filtro existe porque a amplitude do balanço de câmera salta quando o
 * jogador começa e para de andar, e a arma seguindo esse salto dá um tranco. A
 * passada continua vindo da fase da câmera; o que este número suaviza é só o
 * quanto dela chega à arma.
 */
const STRIDE_FOLLOW_PER_S = 7

const TWO_PI = Math.PI * 2

export interface ViewmodelSway {
  /** Ângulo da respiração, de 0 a 2π. */
  breathPhase: number
  /** Atraso da arma atrás da mira, em radianos, decaindo para zero. */
  lagYawRad: number
  lagPitchRad: number
  /** O giro da mira já filtrado: é o que alimenta o atraso, no lugar do delta cru. */
  smoothYawDeltaRad: number
  smoothPitchDeltaRad: number
  /** A amplitude da passada já filtrada: segue a da câmera com atraso. */
  strideAmplitude: number
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
    lagYawRad: 0,
    lagPitchRad: 0,
    smoothYawDeltaRad: 0,
    smoothPitchDeltaRad: 0,
    strideAmplitude: 0,
    enabled,
  }
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
  const follow = Math.min(1, dtS * AIM_DELTA_FOLLOW_PER_S)
  sway.smoothYawDeltaRad += (sample.yawDeltaRad - sway.smoothYawDeltaRad) * follow
  sway.smoothPitchDeltaRad += (sample.pitchDeltaRad - sway.smoothPitchDeltaRad) * follow
  sway.lagYawRad = returnToCenter(sway.lagYawRad - sway.smoothYawDeltaRad * LAG_GAIN, dtS)
  sway.lagPitchRad = returnToCenter(sway.lagPitchRad - sway.smoothPitchDeltaRad * LAG_GAIN, dtS)
  sway.strideAmplitude +=
    (sample.strideAmplitude - sway.strideAmplitude) * Math.min(1, dtS * STRIDE_FOLLOW_PER_S)
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
