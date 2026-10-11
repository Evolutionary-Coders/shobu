import type { MeleeState, MeleeWeapon } from '@shobu/core'
import {
  type BladeDirector,
  type BladeShot,
  createBladeDirector,
  createBladeShot,
  directBlade,
} from './bladeDirector.ts'
import {
  advanceGaitBlend,
  createGaitBlend,
  type GaitBlend,
  type GaitStride,
  gaitOf,
  gaitRigPose,
  KATANA_GAIT,
  SNIPER_GAIT,
} from './gaitPose.ts'
import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'
import { addScaledPose, createRigPose, type RigPose, resetRigPose } from './rigPose.ts'

/**
 * Onde cada lâmina fica em relação ao olho, como o `SNIPER_PLACEMENT`. A
 * origem do glb é o centro do punho fechado (`melee_blades.py`), então isto é
 * **onde a mão fica**: no canto inferior direito, o pulso e o antebraço
 * entrando pela borda, a lâmina erguida para a frente e para o alto, o fio
 * para longe da câmera. Acertado num render do blender e nas capturas.
 */
export const BLADE_PLACEMENTS: Readonly<Record<MeleeWeapon, ViewmodelPlacement>> = {
  katana: {
    offsetM: [0.13, -0.1, 0.46],
    yawRad: -0.3,
    pitchRad: -0.85,
    rollRad: 0.15,
    cantRad: 0.3,
  },
  knife: {
    offsetM: [0.13, -0.1, 0.42],
    yawRad: -0.25,
    pitchRad: -0.85,
    rollRad: 0.15,
    cantRad: 0.3,
  },
}

/**
 * O cotovelo do braço que segura a lâmina, no espaço do glb dela: o pivô da
 * corrida e dos golpes. Girar em volta do punho (a origem) jogava o antebraço
 * por cima da cabeça em todo corte; em volta do cotovelo o golpe é um arco.
 * Medido no blender, do `R_elbow_026` levado ao quadro da lâmina por
 * `quadro_do_punho` (`melee_blades.py`), no eixo do babylon.
 */
export const BLADE_PIVOT_M = { x: 0.19, y: 0.27, z: -0.05 } as const

/**
 * O estado de quadro das duas mãos em primeira pessoa: a passada (a corrida
 * abaixa ou ergue a arma) e o gesto da lâmina, juntos numa pose por rig.
 */
export interface ViewmodelStage {
  readonly director: BladeDirector
  readonly gait: GaitBlend
  readonly shot: BladeShot
  /** Somada à pose de descanso da sniper: a passada e o afundo do golpe rápido. */
  readonly sniperPose: RigPose
  /** Somada à da lâmina: a passada (com a katana na mão) e o gesto. */
  readonly bladePose: RigPose
}

export function createViewmodelStage(): ViewmodelStage {
  return {
    director: createBladeDirector(),
    gait: createGaitBlend(),
    shot: createBladeShot(),
    sniperPose: createRigPose(),
    bladePose: createRigPose(),
  }
}

/** O que o quadro lê do jogo para posar as mãos. */
export interface ViewmodelCue {
  readonly melee: Readonly<MeleeState>
  readonly body: { readonly sprinting: boolean; readonly tacticalSprinting: boolean }
  readonly stride: GaitStride
  /** Falso para quem pediu menos movimento: some o sacolejo, a pose fica. */
  readonly motion: boolean
}

/**
 * Um quadro: o gesto, a passada, e as duas poses. A corrida vale para a arma
 * que está **na mão** — a sniper, ou a katana empunhada; o golpe rápido passa
 * sem ela, porque é um gesto de meio segundo.
 *
 * ```ts
 * stageViewmodels(stage, { melee: session.melee, body, stride, motion }, frameS)
 * ```
 */
export function stageViewmodels(
  stage: ViewmodelStage,
  cue: ViewmodelCue,
  frameS: number,
): ViewmodelStage {
  directBlade(stage.director, cue.melee, frameS, stage.shot)
  advanceGaitBlend(stage.gait, gaitOf(cue.body), frameS)
  gaitRigPose(stage.gait, SNIPER_GAIT, cue.stride, cue.motion, stage.sniperPose)
  addScaledPose(stage.sniperPose, stage.shot.sniperPose, 1)
  // a katana só corre empunhada: no golpe rápido a corrida é da sniper.
  if (cue.melee.bladeDrawn)
    gaitRigPose(stage.gait, KATANA_GAIT, cue.stride, cue.motion, stage.bladePose)
  else resetRigPose(stage.bladePose)
  addScaledPose(stage.bladePose, stage.shot.bladePose, 1)
  return stage
}
