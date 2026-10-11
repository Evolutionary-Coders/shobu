import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Scene } from '@babylonjs/core/scene'
import type { MeleeState, MeleeWeapon } from '@shobu/core'
import type { LocalCharacter } from '../controller/localCharacter.ts'
import { BLADE_FINISHES, SNIPER_FINISHES, type WeaponFinish } from '../loadout/weaponFinishes.ts'
import { attachBladeViewmodel } from './attachBladeViewmodel.ts'
import type { BodyMotion } from './driveViewmodelRig.ts'
import { driveViewmodelRig } from './driveViewmodelRig.ts'
import { dropLeftArm } from './dropLeftArm.ts'
import { SNIPER_GRIP_M, type SniperViewmodelSlot, swayRigOf } from './loadSniperViewmodel.ts'
import { paintSniper } from './paintWeapons.ts'
import type { ViewBob } from './viewBob.ts'
import { createViewmodelStage, stageViewmodels, type ViewmodelStage } from './viewmodelStage.ts'
import { createViewmodelSway } from './viewmodelSway.ts'
import type { WeaponRecoil } from './weaponRecoil.ts'

/** Os acabamentos da classe em uso. Mutável: o menu troca entre partidas. */
export interface WeaponLooks {
  sniper: WeaponFinish
  blades: Record<MeleeWeapon, WeaponFinish>
}

export function createWeaponLooks(): WeaponLooks {
  return {
    sniper: SNIPER_FINISHES[0] as WeaponFinish,
    blades: {
      katana: BLADE_FINISHES.katana[0] as WeaponFinish,
      knife: BLADE_FINISHES.knife[0] as WeaponFinish,
    },
  }
}

export interface FirstPersonStageOptions {
  readonly camera: UniversalCamera
  readonly character: LocalCharacter
  readonly melee: Readonly<MeleeState>
  readonly bob: ViewBob
  /** O coice da sniper, já avançado no quadro por `driveArenaWeapon`. */
  readonly recoil: WeaponRecoil
  /** Falso para quem pediu menos movimento. */
  readonly motion: boolean
  readonly sniper: SniperViewmodelSlot
  readonly looks: WeaponLooks
  readonly frameDeltaMs: () => number
  readonly onMasked: () => void
}

/**
 * As mãos em primeira pessoa (ADR 0021): o palco de quadro — a corrida e os
 * gestos da lâmina —, a sniper e a lâmina posadas por ele, e o acabamento das
 * armas. Adapter: registra o passo do palco **antes** dos rigs, para eles
 * lerem a pose já deste quadro, e depois do balanço de câmera, de quem lê a
 * passada.
 *
 * ```ts
 * const stage = attachFirstPersonStage(scene, { camera, character, melee, bob, recoil, ... })
 * stage.shot.sniperVisible // falso com a katana na mão
 * ```
 */
export function attachFirstPersonStage(
  scene: Scene,
  options: FirstPersonStageOptions,
): ViewmodelStage {
  const stage = createViewmodelStage()
  const motion = { verticalSpeedMps: 0, sliding: false }
  const body = (): BodyMotion => bodyMotionOf(options.character, motion)
  stageEveryFrame(scene, stage, options)
  swaySniper(scene, stage, options, body)
  attachBladeViewmodel(scene, {
    camera: options.camera,
    stage,
    bob: options.bob,
    motion: options.motion,
    finish: (weapon) => options.looks.blades[weapon],
    body,
    frameDeltaMs: options.frameDeltaMs,
    onMasked: options.onMasked,
  })
  return stage
}

/** O palco anda, e a sniper ganha o acabamento quando ele muda — ou quando ela chega. */
function stageEveryFrame(
  scene: Scene,
  stage: ViewmodelStage,
  options: FirstPersonStageOptions,
): void {
  const { character, bob, looks } = options
  const cue = { melee: options.melee, body: character.current, stride: bob, motion: options.motion }
  let paintedSniper: WeaponFinish | undefined
  scene.onBeforeRenderObservable.add(() => {
    stageViewmodels(stage, cue, options.frameDeltaMs() / 1000)
    const sniper = options.sniper.current
    if (!sniper || paintedSniper === looks.sniper) return
    paintSniper(sniper.root.getChildMeshes(), looks.sniper)
    paintedSniper = looks.sniper
  })
}

/**
 * A sniper respira, balança com a passada e arrasta atrás da mira. O glb não
 * tem idle — o `allanims` é animação de vitrine — então a pose parada é um
 * quadro congelado, e sem isto seria uma arma morta na tela. Por cima, a pose
 * do palco: a corrida e o afundo do golpe rápido.
 *
 * O balanço espera o glb chegar: o passo roda todo quadro e desiste enquanto o
 * rig não existe, em vez de a cena esperar o download.
 */
function swaySniper(
  scene: Scene,
  stage: ViewmodelStage,
  options: FirstPersonStageOptions,
  body: () => BodyMotion,
): void {
  const slot = options.sniper
  const sway = createViewmodelSway(options.motion)
  let driving = false
  scene.onBeforeRenderObservable.add(() => {
    if (driving || !slot.current) return
    driving = true
    // a corrida plena solta a mão esquerda da arma, na medida em que entra.
    dropLeftArm(scene, slot.current.root, options.camera, () => stage.gait.tactical)
    driveViewmodelRig(scene, {
      rig: swayRigOf(slot.current.rig),
      aim: options.camera,
      body,
      placement: () => slot.placement,
      sway,
      recoil: options.recoil,
      bob: options.bob,
      pose: () => stage.sniperPose,
      gripM: SNIPER_GRIP_M,
      frameDeltaMs: options.frameDeltaMs,
    })
  })
}

/** Um objeto só, reescrito por quadro: o literal por quadro seria lixo para o coletor. */
function bodyMotionOf(
  character: LocalCharacter,
  into: { verticalSpeedMps: number; sliding: boolean },
): BodyMotion {
  into.verticalSpeedMps = character.current.velocity.y
  into.sliding = character.current.stance === 'sliding'
  return into
}
