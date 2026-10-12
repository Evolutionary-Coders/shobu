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
 * Onde cada lâmina fica em relação ao olho. Os glb das lâminas nascem **no
 * espaço da câmera** — a origem é o olho, e os clipes (`bladeClips.ts`) põem
 * os braços e a lâmina na tela —, então o ajuste é nenhum: o rig fica no olho
 * e só carrega o balanço, a passada e a corrida por cima do clipe.
 */
export const BLADE_PLACEMENTS: Readonly<Record<MeleeWeapon, ViewmodelPlacement>> = {
  katana: { offsetM: [0, 0, 0], yawRad: 0, pitchRad: 0 },
  knife: { offsetM: [0, 0, 0], yawRad: 0, pitchRad: 0 },
}

/**
 * As mãos na guarda, no espaço da câmera (`GUARDA_KATANA` em
 * `melee_golpes.py`): o pivô da corrida e do balanço da lâmina. Girar o rig
 * em volta do olho, que é a origem do glb, varreria os braços pela tela
 * inteira; em volta das mãos, a corrida inclina a lâmina na mão.
 */
export const BLADE_PIVOT_M = { x: 0.15, y: -0.1, z: 0.42 } as const

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
  /** Somada ao clipe da lâmina: a passada, com a lâmina na mão. */
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
 * Um quadro: o clipe da lâmina, a passada, e as duas poses. A corrida vale
 * para a arma que está **na mão** — a sniper, ou a lâmina empunhada; o golpe
 * rápido passa sem ela, porque é um gesto de meio segundo.
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
  // a lâmina só corre empunhada: no golpe rápido a corrida é da sniper.
  if (cue.melee.bladeDrawn)
    gaitRigPose(stage.gait, KATANA_GAIT, cue.stride, cue.motion, stage.bladePose)
  else resetRigPose(stage.bladePose)
  // menos movimento pedido, nada de câmera rolando no corte.
  if (!cue.motion) stage.shot.cameraRollRad = 0
  return stage
}
