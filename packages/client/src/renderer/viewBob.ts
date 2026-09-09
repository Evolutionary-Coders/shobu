import type { Stance } from '@shobu/core'

/**
 * Balanço de câmera ao andar: o olho sobe e desce duas vezes por ciclo de
 * passada e oscila de lado uma vez, com amplitude que cresce com a velocidade
 * e some no ar, no slide e parado. Mais um afundo curto ao aterrissar.
 *
 * É **render**, não simulação: mexe onde a câmera é desenhada, nunca na
 * posição do jogador nem na mira — o servidor não sabe que isto existe, e o
 * tiro sai do olho sem balanço. Por isso vive aqui e não no núcleo, e por isso
 * pode usar seno: o resultado não precisa ser igual em duas máquinas.
 *
 * A fase avança por **distância**, não por tempo: é o que faz o balanço parar
 * junto com os pés em vez de continuar marchando com o jogador parado.
 */
export interface ViewBob {
  /** Ângulo da passada, em radianos, de 0 a 2π. */
  phase: number
  /** 0 parado, 1 na corrida base; segue o alvo com atraso para não dar solavanco. */
  amplitude: number
  /** Afundo da aterrissagem, em metros, decaindo para zero. */
  landDip: number
  wasGrounded: boolean
  /** Falso para quem pediu menos movimento: balanço de câmera é o gatilho clássico. */
  readonly enabled: boolean
}

/** O que o balanço lê do jogador a cada quadro. */
export interface ViewBobSample {
  readonly grounded: boolean
  readonly stance: Stance
  readonly horizontalSpeedMps: number
  readonly runSpeedMps: number
}

export interface ViewBobOffset {
  up: number
  right: number
}

/**
 * Metros por ciclo lateral completo — duas passadas. 2,4 m é passada de
 * corrida leve: a 5,2 m/s dá 2,2 ciclos por segundo, uns quatro passos. Com
 * 1,7 m o balanço batia seis passos por segundo e parecia tremor.
 */
const STRIDE_CYCLE_M = 2.4

/** Amplitudes na corrida base. Pequenas de propósito: é sniper, e a mira não balança. */
const VERTICAL_AMPLITUDE_M = 0.02
const LATERAL_AMPLITUDE_M = 0.012

/** Acima disto a amplitude não cresce mais: a corrida tática ganha só 33 %. */
const AMPLITUDE_MAX = 1.4

/** Agachado balança a metade: passo curto, corpo baixo. */
const CROUCH_AMPLITUDE_SCALE = 0.5

/** Abaixo disto é parado, o mesmo limiar da escolha de clipe em terceira pessoa. */
const IDLE_SPEED_MPS = 0.3

/** Quanto do caminho até a amplitude alvo cada segundo percorre. */
const AMPLITUDE_FOLLOW_PER_S = 6

const LAND_DIP_M = 0.05
const LAND_DIP_DECAY_PER_S = 8

const TWO_PI = Math.PI * 2

export function createViewBob(enabled: boolean): ViewBob {
  return { phase: 0, amplitude: 0, landDip: 0, wasGrounded: true, enabled }
}

/**
 * ```ts
 * advanceViewBob(bob, { grounded, stance, horizontalSpeedMps, runSpeedMps }, dtS)
 * viewBobOffset(bob, offset) // offset.up e offset.right em metros
 * ```
 */
export function advanceViewBob(bob: ViewBob, sample: ViewBobSample, dtS: number): void {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  const moving = isStriding(sample)
  const target = bob.enabled && moving ? amplitudeTarget(sample) : 0
  bob.amplitude += (target - bob.amplitude) * Math.min(1, dtS * AMPLITUDE_FOLLOW_PER_S)
  if (moving) {
    bob.phase = (bob.phase + (sample.horizontalSpeedMps * dtS * TWO_PI) / STRIDE_CYCLE_M) % TWO_PI
  }
  advanceLandDip(bob, sample, dtS)
}

export function viewBobOffset(bob: ViewBob, out: ViewBobOffset): ViewBobOffset {
  out.up = Math.sin(2 * bob.phase) * VERTICAL_AMPLITUDE_M * bob.amplitude - bob.landDip
  out.right = Math.sin(bob.phase) * LATERAL_AMPLITUDE_M * bob.amplitude
  return out
}

/** Só há passada com os pés no chão: no ar e no slide o corpo não pisa. */
function isStriding(sample: ViewBobSample): boolean {
  return (
    sample.grounded && sample.stance !== 'sliding' && sample.horizontalSpeedMps > IDLE_SPEED_MPS
  )
}

function amplitudeTarget(sample: ViewBobSample): number {
  const bySpeed = Math.min(AMPLITUDE_MAX, sample.horizontalSpeedMps / sample.runSpeedMps)
  return sample.stance === 'crouching' ? bySpeed * CROUCH_AMPLITUDE_SCALE : bySpeed
}

/** O afundo dispara no quadro em que o chão volta, e decai exponencialmente. */
function advanceLandDip(bob: ViewBob, sample: ViewBobSample, dtS: number): void {
  if (bob.enabled && sample.grounded && !bob.wasGrounded) bob.landDip = LAND_DIP_M
  bob.landDip -= bob.landDip * Math.min(1, dtS * LAND_DIP_DECAY_PER_S)
  bob.wasGrounded = sample.grounded
}
