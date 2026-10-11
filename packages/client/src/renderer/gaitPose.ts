import { addScaledPose, type RigPose, resetRigPose, rigPose } from './rigPose.ts'

/**
 * A pose da arma pela passada (ADR 0021): andando, na mira; na corrida
 * tática, **abaixada**, cruzando o peito; na corrida plena do shift duplo,
 * **erguida**, cano para cima e para o lado, a mão perto do ombro — a
 * corrida do warzone. A katana vai com a lâmina para trás nas duas.
 *
 * É render, como o balanço: pode usar seno, e o servidor não sabe que existe.
 */
export type Gait = 'walk' | 'sprint' | 'tactical'

/** O quanto de cada pose está aplicado agora, de 0 a 1. Os dois somam no máximo 1. */
export interface GaitBlend {
  sprint: number
  tactical: number
}

/** As duas poses de corrida de uma arma, e o quanto a passada a sacode nelas. */
export interface GaitProfile {
  readonly sprint: Readonly<RigPose>
  readonly tactical: Readonly<RigPose>
}

/**
 * Quanto a troca de pose leva, de uma ponta à outra. Entre 0,15 e 0,2 s: mais
 * curto é estalo; mais longo e a arma ainda está descendo quando o tiro do
 * sprint-to-fire sai.
 */
export const GAIT_BLEND_S = 0.18

/**
 * A sniper: abaixada cruzando o peito (cano para a esquerda e para baixo), e
 * erguida no ombro (cano para cima e para a esquerda, a arma puxada para
 * perto). Os números foram acertados olhando as capturas do navegador.
 */
export const SNIPER_GAIT: GaitProfile = {
  sprint: rigPose({ x: 0, y: -0.07, z: -0.02, pitchRad: 0.3, yawRad: -0.55, rollRad: 0.45 }),
  tactical: rigPose({ x: 0.14, y: -0.06, z: -0.1, pitchRad: 0.75, yawRad: -0.3, rollRad: -0.6 }),
}

/**
 * A katana: a lâmina baixa, cruzando a tela para a esquerda na corrida, e
 * para trás na corrida plena, onde só a mão aparece.
 */
export const KATANA_GAIT: GaitProfile = {
  sprint: rigPose({ x: 0, y: -0.04, z: 0, pitchRad: 0.5, yawRad: -0.45, rollRad: -0.2 }),
  tactical: rigPose({ x: -0.01, y: -0.06, z: -0.02, pitchRad: 0.65, yawRad: -0.6, rollRad: -0.3 }),
}

export function createGaitBlend(): GaitBlend {
  return { sprint: 0, tactical: 0 }
}

/**
 * A passada do corpo do núcleo.
 *
 * ```ts
 * gaitOf(character.current) // 'tactical' no shift duplo
 * ```
 */
export function gaitOf(body: {
  readonly sprinting: boolean
  readonly tacticalSprinting: boolean
}): Gait {
  if (body.tacticalSprinting) return 'tactical'
  return body.sprinting ? 'sprint' : 'walk'
}

/**
 * Anda os dois pesos em linha reta para a pose pedida, à razão de
 * `GAIT_BLEND_S` de ponta a ponta. Linear e não exponencial: a troca termina,
 * em vez de ficar devendo um resto que nunca chega a zero.
 *
 * ```ts
 * advanceGaitBlend(blend, gaitOf(character.current), frameS)
 * ```
 */
export function advanceGaitBlend(blend: GaitBlend, gait: Gait, dtS: number): GaitBlend {
  const step = dtS / GAIT_BLEND_S
  blend.sprint = approach(blend.sprint, gait === 'sprint' ? 1 : 0, step)
  blend.tactical = approach(blend.tactical, gait === 'tactical' ? 1 : 0, step)
  return blend
}

function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(target, value + step)
  return Math.max(target, value - step)
}

/** A passada: a fase e a amplitude do `ViewBob`, a mesma da câmera. */
export interface GaitStride {
  readonly phase: number
  readonly amplitude: number
}

/** O sacolejo a mais da corrida, em metros e radianos, por unidade de amplitude. */
const STRIDE_SWING = { sideM: 0.02, upM: 0.014, rollRad: 0.07 }
/** A corrida plena sacode mais que a tática: é a arma solta no ombro. */
const SPRINT_SWING = 0.7
const TACTICAL_SWING = 1.3

/**
 * A pose da passada em `out`: a mistura das duas poses de corrida, mais o
 * sacolejo forte da passada, que some para quem pediu menos movimento — a
 * **pose** fica, porque ela diz que o jogador está correndo.
 *
 * ```ts
 * gaitRigPose(blend, SNIPER_GAIT, { phase: bob.phase, amplitude: bob.amplitude }, true, pose)
 * ```
 */
export function gaitRigPose(
  blend: Readonly<GaitBlend>,
  profile: GaitProfile,
  stride: GaitStride,
  motion: boolean,
  out: RigPose,
): RigPose {
  resetRigPose(out)
  addScaledPose(out, profile.sprint, blend.sprint)
  addScaledPose(out, profile.tactical, blend.tactical)
  if (!motion) return out
  const swing = stride.amplitude * (blend.sprint * SPRINT_SWING + blend.tactical * TACTICAL_SWING)
  out.x += Math.sin(stride.phase) * STRIDE_SWING.sideM * swing
  out.y += Math.abs(Math.sin(stride.phase)) * STRIDE_SWING.upM * swing
  out.rollRad += Math.sin(stride.phase) * STRIDE_SWING.rollRad * swing
  return out
}
