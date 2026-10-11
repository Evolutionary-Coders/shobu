import type { MeleeState, MeleeWeapon } from '@shobu/core'
import {
  BLADE_GESTURES,
  type BladeGesture,
  gestureDurationS,
  sampleTrack,
} from './bladeGestures.ts'
import { createRigPose, type RigPose, resetRigPose } from './rigPose.ts'

/**
 * Quem decide, por quadro, o que a mão mostra: a sniper, a lâmina, ou as duas
 * no meio de um golpe — e em que ponto do gesto cada uma está. Lê **só** o
 * estado do corpo a corpo que o núcleo produziu (`MeleeState`): o golpe novo
 * é o contador `strikes` que mudou, e o saque é o `bladeDrawn` que virou.
 *
 * Sem relógio próprio de jogo: o tempo do gesto é render, e anda com o quadro.
 */
export interface BladeDirector {
  gesture: BladeGesture | undefined
  gestureS: number
  lastStrikes: number
  wasDrawn: boolean
}

/** O que o adapter aplica no quadro. Reaproveitado. */
export interface BladeShot {
  bladeVisible: boolean
  sniperVisible: boolean
  weapon: MeleeWeapon
  readonly bladePose: RigPose
  readonly sniperPose: RigPose
}

export function createBladeDirector(): BladeDirector {
  return { gesture: undefined, gestureS: 0, lastStrikes: 0, wasDrawn: false }
}

export function createBladeShot(): BladeShot {
  return {
    bladeVisible: false,
    sniperVisible: true,
    weapon: 'katana',
    bladePose: createRigPose(),
    sniperPose: createRigPose(),
  }
}

/**
 * Um quadro: começa o gesto que o núcleo pediu, anda o que está tocando, e
 * escreve em `out` quem aparece e em que pose.
 *
 * - **katana na mão**: só ela aparece; a sniper está no coldre.
 * - **golpe rápido e guarda**: a lâmina aparece só enquanto o gesto dura.
 *
 * ```ts
 * directBlade(director, session.melee, frameS, shot)
 * ```
 */
export function directBlade(
  director: BladeDirector,
  melee: Readonly<MeleeState>,
  frameS: number,
  out: BladeShot,
): BladeShot {
  startNewGesture(director, melee)
  director.gestureS += frameS
  if (director.gesture && director.gestureS >= gestureDurationS(director.gesture)) {
    director.gesture = undefined
  }
  out.weapon = melee.weapon
  out.sniperVisible = !melee.bladeDrawn
  out.bladeVisible = melee.bladeDrawn || director.gesture !== undefined
  poseGesture(director, out)
  return out
}

function startNewGesture(director: BladeDirector, melee: Readonly<MeleeState>): void {
  if (melee.strikes !== director.lastStrikes) {
    director.lastStrikes = melee.strikes
    begin(director, strikeGesture(melee))
  }
  if (melee.bladeDrawn === director.wasDrawn) return
  director.wasDrawn = melee.bladeDrawn
  begin(director, melee.bladeDrawn ? 'draw' : 'holster')
}

/** O corte alterna o lado a cada golpe: dois cortes iguais seguidos leem como travamento. */
function strikeGesture(melee: Readonly<MeleeState>): BladeGesture {
  if (melee.strikeKind === 'slash') return melee.strikes % 2 ? 'slash-left' : 'slash-right'
  return melee.weapon === 'knife' ? 'knife-quick' : 'katana-quick'
}

function begin(director: BladeDirector, gesture: BladeGesture): void {
  director.gesture = gesture
  director.gestureS = 0
}

function poseGesture(director: BladeDirector, out: BladeShot): void {
  if (!director.gesture) {
    resetRigPose(out.bladePose)
    resetRigPose(out.sniperPose)
    return
  }
  const track = BLADE_GESTURES[director.gesture]
  sampleTrack(track.blade, director.gestureS, out.bladePose)
  sampleTrack(track.sniper, director.gestureS, out.sniperPose)
}
