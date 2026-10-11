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
 * A sniper, girando em volta da mão (`SNIPER_GRIP_M`):
 *
 * - **corrida**: o cano aponta para baixo e para a esquerda, e a arma deita
 *   para mostrar o topo — a luneta e o ferrolho cruzando o pé da tela na
 *   diagonal, a coronha saindo pelo canto de baixo à direita;
 * - **corrida plena**: a mão sobe para a altura do peito, à direita, e a arma
 *   fica quase em pé, de lado (o esquerdo dela, com os dedos fechados no
 *   punho), o cano saindo pelo alto inclinado para a esquerda — no ombro. O
 *   braço esquerdo sai do quadro (`dropLeftArm.ts`).
 *
 * Acertados num render do blender com a mesma conta e o mesmo fov, e
 * conferidos no navegador.
 */
export const SNIPER_GAIT: GaitProfile = {
  sprint: rigPose({ x: -0.04, y: -0.03, z: 0.04, pitchRad: 0.45, yawRad: -0.9, cantRad: 0.5 }),
  tactical: rigPose({ x: 0.08, z: 0.25, pitchRad: -1.3, rollRad: 0.2, cantRad: -1.3 }),
}

/**
 * A katana, girando em volta do cotovelo (`BLADE_PIVOT_M`): na corrida a mão
 * desce e a lâmina deita para a esquerda; na corrida plena ela fica em pé,
 * junto do corpo, com a mão e o cabo à vista.
 */
export const KATANA_GAIT: GaitProfile = {
  sprint: rigPose({ x: 0.06, y: -0.1, z: 0.04, pitchRad: 0.15, yawRad: -0.3, rollRad: -0.3 }),
  tactical: rigPose({ x: 0.04, y: -0.06, pitchRad: -0.4, yawRad: 0.15, rollRad: -0.1 }),
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
