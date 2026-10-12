/**
 * Um deslocamento do rig de uma arma em primeira pessoa, no espaço da câmera:
 * metros (x para a direita, y para cima, z para a frente) e o giro **em volta
 * da mão**, nos eixos da câmera, na ordem em que se descreve uma pose olhando
 * a tela (`cameraTurnQuaternion` em `gripPivot.ts`): deitar a arma em volta do
 * cano (`cantRad`), apontar o cano (`yawRad`, `pitchRad`) e incliná-la no
 * plano da tela (`rollRad`). É a moeda comum da corrida (`gaitPose.ts`) e dos
 * golpes (`bladeGestures.ts`).
 *
 * As poses de uma camada se **misturam** por peso (`addScaledPose` com pesos
 * que somam 1); o giro de uma pose sobre o ajuste de descanso **compõe**, não
 * soma ângulo com ângulo (`poseAboutGrip`).
 *
 * Mutável e reaproveitado: um por rig, reescrito por quadro, sem alocar.
 */
export interface RigPose {
  x: number
  y: number
  z: number
  pitchRad: number
  yawRad: number
  rollRad: number
  /** Deita a arma em volta do próprio cano, antes de apontá-lo. Positivo deita o topo para a esquerda. */
  cantRad: number
}

export const REST_POSE: Readonly<RigPose> = Object.freeze(createRigPose())

export function createRigPose(): RigPose {
  return { x: 0, y: 0, z: 0, pitchRad: 0, yawRad: 0, rollRad: 0, cantRad: 0 }
}

/** Volta ao descanso, sem alocar. */
export function resetRigPose(out: RigPose): RigPose {
  return copyRigPose(REST_POSE, out)
}

export function copyRigPose(from: Readonly<RigPose>, out: RigPose): RigPose {
  out.x = from.x
  out.y = from.y
  out.z = from.z
  out.pitchRad = from.pitchRad
  out.yawRad = from.yawRad
  out.rollRad = from.rollRad
  out.cantRad = from.cantRad
  return out
}

/**
 * Soma `pose × weight` em `out`. É como as camadas se empilham: a corrida
 * pesa o quanto já entrou, o golpe soma por cima.
 *
 * ```ts
 * addScaledPose(out, SNIPER_GAIT.sprint, state.sprint)
 * ```
 */
export function addScaledPose(out: RigPose, pose: Readonly<RigPose>, weight: number): RigPose {
  out.x += pose.x * weight
  out.y += pose.y * weight
  out.z += pose.z * weight
  out.pitchRad += pose.pitchRad * weight
  out.yawRad += pose.yawRad * weight
  out.rollRad += pose.rollRad * weight
  out.cantRad += pose.cantRad * weight
  return out
}

/**
 * Uma pose parcial vira pose inteira: as tabelas de golpe só escrevem o que
 * mexe, e o resto é zero.
 *
 * ```ts
 * rigPose({ y: -0.2, pitchRad: 0.6 })
 * ```
 */
export function rigPose(partial: Partial<RigPose>): Readonly<RigPose> {
  return Object.freeze({ ...createRigPose(), ...partial })
}
