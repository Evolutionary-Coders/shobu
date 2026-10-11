import { followFraction } from './frameDecay.ts'

/**
 * A câmera sente a corda: o fov abre com a velocidade enquanto o carretel
 * puxa, e o horizonte inclina um pouco para o lado do balanço — a referência é
 * o titanfall 2, onde a câmera conta a velocidade antes do velocímetro.
 *
 * É **render**: não toca na mira nem na simulação (o tiro sai da frente da
 * câmera, e a rolagem não muda a frente). Quem pediu menos movimento não ganha
 * nenhum dos dois — fov que respira e horizonte torto são o gatilho vestibular
 * clássico, o mesmo motivo do `viewBob.ts`.
 */
export interface GrappleCameraKick {
  /** Graus somados ao fov horizontal de quadril. */
  fovDeg: number
  /**
   * Rolagem da câmera, em radianos, no sentido do `rotation.z` do babylon:
   * positivo inclina a cabeça para a esquerda (conferido na matriz de
   * `RotationYawPitchRoll`).
   */
  rollRad: number
  /** Mutável porque o óculos desliga enquanto está posto, como o balanço. */
  enabled: boolean
}

/** O que o efeito lê do jogador a cada quadro. */
export interface GrappleCameraSample {
  readonly attached: boolean
  /** Velocidade inteira, em m/s. */
  readonly speedMps: number
  /** Velocidade no eixo da direita da câmera, em m/s: é o lado do balanço. */
  readonly lateralMps: number
  /** O teto do gancho (`grapple.maxPullSpeedMps`): é o 100 % dos dois efeitos. */
  readonly maxPullSpeedMps: number
}

/**
 * Oito graus no teto da velocidade: em fov 90 é um nono a mais de campo, o
 * bastante para sentir o puxão sem a borda da tela esticar.
 */
export const MAX_FOV_KICK_DEG = 8

/** Quatro graus: inclinar mais que isso já disputa com a mira. */
export const MAX_ROLL_RAD = (4 * Math.PI) / 180

/**
 * O quanto o efeito persegue o alvo por segundo. Doze: chega em ~0,2 s, que
 * acompanha o puxão sem tremer junto com cada tick do balanço.
 */
const FOLLOW_PER_S = 12

export function createGrappleCameraKick(enabled: boolean): GrappleCameraKick {
  return { fovDeg: 0, rollRad: 0, enabled }
}

/**
 * Um quadro do efeito. Solto, os dois voltam a zero pela mesma curva, então
 * soltar a corda não dá tranco de fov.
 *
 * ```ts
 * advanceGrappleCameraKick(kick, { attached, speedMps, lateralMps, maxPullSpeedMps }, frameS)
 * ```
 */
export function advanceGrappleCameraKick(
  kick: GrappleCameraKick,
  sample: GrappleCameraSample,
  dtS: number,
): void {
  if (!kick.enabled) {
    kick.fovDeg = 0
    kick.rollRad = 0
    return
  }
  const follow = followFraction(dtS, FOLLOW_PER_S)
  kick.fovDeg += (targetFovDeg(sample) - kick.fovDeg) * follow
  kick.rollRad += (targetRollRad(sample) - kick.rollRad) * follow
}

function targetFovDeg(sample: GrappleCameraSample): number {
  if (!sample.attached) return 0
  return MAX_FOV_KICK_DEG * clampUnit(sample.speedMps / sample.maxPullSpeedMps)
}

/** Indo para a direita, o horizonte inclina para a direita — a câmera rola para lá. */
function targetRollRad(sample: GrappleCameraSample): number {
  if (!sample.attached) return 0
  const lateral = sample.lateralMps / sample.maxPullSpeedMps
  return -MAX_ROLL_RAD * Math.max(-1, Math.min(1, lateral))
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * O fov de quadril com o efeito, que some à medida que a luneta fecha: com a
 * mira aberta o campo é da luneta, e um puxão que alargasse o zoom tiraria o
 * alvo do centro.
 *
 * ```ts
 * kickedFovDeg(scopeFovDeg(zoom, camera), kick, scopeBlend(zoom))
 * ```
 */
export function kickedFovDeg(
  fovDeg: number,
  kick: Readonly<GrappleCameraKick>,
  scopeBlend: number,
): number {
  return fovDeg + kick.fovDeg * (1 - scopeBlend)
}
