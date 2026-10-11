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
 * origem do glb é o punho fechado (`melee_blades.py`), então isto é **onde a
 * mão fica**: no canto inferior direito, com a lâmina erguida e cruzando a
 * tela para a esquerda, sem cobrir a retícula. Acertado nas capturas.
 */
export const BLADE_PLACEMENTS: Readonly<Record<MeleeWeapon, ViewmodelPlacement>> = {
  katana: { offsetM: [0.12, -0.085, 0.42], yawRad: -0.25, pitchRad: -0.6, rollRad: -0.9 },
  knife: { offsetM: [0.11, -0.08, 0.36], yawRad: -0.25, pitchRad: -0.25, rollRad: -0.9 },
}

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
