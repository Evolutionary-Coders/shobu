import type { MeleeState, MeleeWeapon } from '@shobu/core'
import {
  type BladeClip,
  type BladeClipSpec,
  bladeClipSpec,
  sampleScalar,
  trailStrength,
} from './bladeClips.ts'
import {
  SNIPER_TRACKS,
  type SniperTrack,
  sampleTrack,
  sniperTrackDurationS,
} from './bladeGestures.ts'
import { createRigPose, type RigPose, resetRigPose } from './rigPose.ts'

/**
 * Quem decide, por quadro, o que a mão mostra: a sniper, a lâmina, ou as duas
 * no meio de um golpe — e que clipe da lâmina toca, em que ponto. Lê **só** o
 * estado do corpo a corpo que o núcleo produziu (`MeleeState`): o golpe novo
 * é o contador `strikes` que mudou, o saque é o `bladeDrawn` que virou, e a
 * investida é a recarga dela que recomeçou.
 *
 * Sem relógio próprio de jogo: o tempo do clipe é render, e anda com o quadro.
 */
export interface BladeDirector {
  clip: BladeClip | undefined
  clipS: number
  sniper: SniperTrack | undefined
  sniperS: number
  lastStrikes: number
  wasDrawn: boolean
  lastDashCooldownS: number
}

/** O que os adapters aplicam no quadro. Reaproveitado. */
export interface BladeShot {
  bladeVisible: boolean
  sniperVisible: boolean
  weapon: MeleeWeapon
  /** O clipe da lâmina e o ponto dele; sem clipe, a lâmina não aparece. */
  clip: BladeClip | undefined
  clipS: number
  /** Conta as trocas de clipe: quem mistura um no outro começa a mistura quando muda. */
  clipChanges: number
  /** O rastro de luz da lâmina, de 0 a 1. */
  trail: number
  /** A rolagem de câmera do golpe, em radianos. */
  cameraRollRad: number
  readonly sniperPose: RigPose
}

export function createBladeDirector(): BladeDirector {
  return {
    clip: undefined,
    clipS: 0,
    sniper: undefined,
    sniperS: 0,
    lastStrikes: 0,
    wasDrawn: false,
    lastDashCooldownS: 0,
  }
}

export function createBladeShot(): BladeShot {
  return {
    bladeVisible: false,
    sniperVisible: true,
    weapon: 'katana',
    clip: undefined,
    clipS: 0,
    clipChanges: 0,
    trail: 0,
    cameraRollRad: 0,
    sniperPose: createRigPose(),
  }
}

/**
 * Um quadro: começa o clipe que o núcleo pediu, anda o que está tocando, e
 * escreve em `out` quem aparece, que clipe e em que pose fica a sniper.
 *
 * - **lâmina na mão**: só ela aparece, no descanso entre um clipe e outro;
 * - **golpe rápido e guarda**: a lâmina aparece só enquanto o clipe dura.
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
  out.weapon = melee.weapon
  startNewClip(director, melee, out)
  advance(director, melee, frameS, out)
  out.sniperVisible = !melee.bladeDrawn
  out.bladeVisible = director.clip !== undefined
  out.clip = director.clip
  out.clipS = director.clipS
  writeEffects(director, melee.weapon, out)
  poseSniper(director, out)
  return out
}

function startNewClip(director: BladeDirector, melee: Readonly<MeleeState>, out: BladeShot): void {
  if (melee.strikes !== director.lastStrikes) {
    director.lastStrikes = melee.strikes
    begin(director, strikeClip(melee), out)
    if (melee.strikeKind === 'quick') beginSniper(director, 'dip')
  }
  // a recarga da investida só sobe quando ela sai: é o sinal, quadro a quadro.
  if (melee.dashCooldownLeftS > director.lastDashCooldownS && melee.weapon === 'katana') {
    begin(director, 'dash', out)
  }
  director.lastDashCooldownS = melee.dashCooldownLeftS
  if (melee.bladeDrawn === director.wasDrawn) return
  director.wasDrawn = melee.bladeDrawn
  begin(director, melee.bladeDrawn ? 'draw' : 'holster', out)
  if (!melee.bladeDrawn) beginSniper(director, 'raise')
}

/**
 * O golpe com a lâmina na mão varia: a katana gira três cortes (as duas
 * diagonais e o deitado), a faca alterna a estocada e o corte. O mesmo golpe
 * duas vezes seguidas lê como travamento.
 */
function strikeClip(melee: Readonly<MeleeState>): BladeClip {
  if (melee.strikeKind === 'quick') return 'quick'
  if (melee.weapon === 'knife') return melee.strikes % 2 === 1 ? 'stab' : 'slash'
  const cut = melee.strikes % 3
  if (cut === 1) return 'slash_1'
  return cut === 2 ? 'slash_2' : 'slash_3'
}

function begin(director: BladeDirector, clip: BladeClip, out: BladeShot): void {
  director.clip = clip
  director.clipS = 0
  out.clipChanges += 1
}

function beginSniper(director: BladeDirector, track: SniperTrack): void {
  director.sniper = track
  director.sniperS = 0
}

/**
 * O clipe que acaba devolve a lâmina ao descanso, se ela está na mão; senão
 * ela sai de cena. O descanso dá a volta.
 */
function advance(
  director: BladeDirector,
  melee: Readonly<MeleeState>,
  frameS: number,
  out: BladeShot,
): void {
  director.sniperS += frameS
  if (director.sniper && director.sniperS >= sniperTrackDurationS(director.sniper)) {
    director.sniper = undefined
  }
  if (!director.clip) {
    if (melee.bladeDrawn) begin(director, 'idle', out)
    return
  }
  director.clipS += frameS
  const spec = bladeClipSpec(melee.weapon, director.clip)
  if (director.clipS < spec.durationS) return
  if (spec.loop) {
    director.clipS %= spec.durationS
    return
  }
  director.clip = undefined
  if (melee.bladeDrawn) begin(director, 'idle', out)
}

function writeEffects(director: BladeDirector, weapon: MeleeWeapon, out: BladeShot): void {
  if (!director.clip) {
    out.trail = 0
    out.cameraRollRad = 0
    return
  }
  const spec: BladeClipSpec = bladeClipSpec(weapon, director.clip)
  out.trail = trailStrength(spec, director.clipS)
  out.cameraRollRad = spec.roll ? sampleScalar(spec.roll, director.clipS) : 0
}

function poseSniper(director: BladeDirector, out: BladeShot): void {
  if (!director.sniper) {
    resetRigPose(out.sniperPose)
    return
  }
  sampleTrack(SNIPER_TRACKS[director.sniper], director.sniperS, out.sniperPose)
}
