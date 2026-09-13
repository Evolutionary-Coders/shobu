import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { type GameplayConfig, weaponPhase } from '@shobu/core'
import { clipForWeaponPhase } from '../character/viewmodelClips.ts'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { HeldButtons } from '../controller/heldButtons.ts'
import type { HeldKeys } from '../controller/heldKeys.ts'
import { type MutableWeaponInput, weaponInputFrom } from '../controller/weaponInputFrom.ts'
import type { ScopeView } from '../hud/scopeView.ts'
import { clampPitchRad } from './driveCameraFromCharacter.ts'
import { SNIPER_MUZZLE_M, type SniperViewmodel } from './loadSniperViewmodel.ts'
import { advanceScopeZoom, isScopeOpen, isViewmodelVisible, type ScopeZoom } from './scopeZoom.ts'
import type { TracerBeams } from './tracerBeams.ts'
import { advanceRecoil, kickRecoil, type RecoilOffset, type WeaponRecoil } from './weaponRecoil.ts'

export interface ArenaWeaponOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly keys: Readonly<HeldKeys>
  readonly buttons: Readonly<HeldButtons>
  readonly weaponInput: MutableWeaponInput
  readonly zoom: ScopeZoom
  readonly scopeView: ScopeView
  readonly beams: TracerBeams
  readonly recoil: WeaponRecoil
  readonly camera: UniversalCamera
  /** Onde a arma está, ou `undefined` enquanto o glb não chegou. */
  readonly viewmodel: () => SniperViewmodel | undefined
  readonly frameDeltaMs: () => number
}

/**
 * O laço de quadro da arma: entrada, luneta, clipe e rastro.
 *
 * Nada aqui decide regra de jogo — a arma é do núcleo. Este módulo lê o estado
 * que a sessão produziu e traduz em fov, visibilidade, clipe e feixe.
 *
 * ```ts
 * driveArenaWeapon(scene, { config, session, keys, buttons, ... })
 * ```
 */
export function driveArenaWeapon(scene: Scene, options: ArenaWeaponOptions): void {
  const { config, session, zoom, scopeView, beams, recoil, camera } = options
  const muzzle = new Vector3()
  const kick: RecoilOffset = { pitchDeltaRad: 0, rollRad: 0 }
  let scopeWasOpen = false
  scene.onBeforeRenderObservable.add(() => {
    const frameS = options.frameDeltaMs() / 1000
    weaponInputFrom(options.keys, options.buttons, options.weaponInput)
    advanceScopeZoom(zoom, session.weapon.scoped, frameS, config.camera.scopeTransitionS)
    const viewmodel = options.viewmodel()
    viewmodel?.setVisible(isViewmodelVisible(zoom))
    viewmodel?.animator.play(clipForWeaponPhase(weaponPhase(session.weapon)))
    scopeWasOpen = toggleScopeView(scopeView, isScopeOpen(zoom), scopeWasOpen)
    if (session.lastShot) {
      beams.fire(muzzleOf(options, muzzle), session.lastShot.endpointM)
      kickRecoil(recoil)
    }
    beams.advance(frameS)
    applyRecoil(camera, recoil, frameS, kick)
  })
}

/**
 * O coice entra **depois** do tiro do quadro: a bala já saiu pela mira que o
 * jogador tinha, e o que sobe é onde ele vai mirar no próximo tiro.
 *
 * A trava de inclinação é reaplicada aqui porque o coice escreve na mesma
 * rotação **depois** de `driveCameraFromCharacter` ter travado: sem isto, uma
 * sequência de tiros olhando para cima passaria da vertical.
 */
function applyRecoil(
  camera: UniversalCamera,
  recoil: WeaponRecoil,
  frameS: number,
  kick: RecoilOffset,
): void {
  advanceRecoil(recoil, frameS, kick)
  camera.rotation.x = clampPitchRad(camera.rotation.x + kick.pitchDeltaRad)
  camera.rotation.z = kick.rollRad
}

/** Só na mudança: `open`/`close` são idempotentes, mas chamar por quadro é desperdício. */
function toggleScopeView(view: ScopeView, isOpen: boolean, wasOpen: boolean): boolean {
  if (isOpen === wasOpen) return wasOpen
  if (isOpen) view.open()
  else view.close()
  return isOpen
}

/**
 * A boca do cano em mundo. Sai do rig da arma, então já acompanha o coice e o
 * balanço; quando a arma não chegou, sai do olho, que é onde o raio saiu.
 *
 * O feixe sai do cano e o **raio** sai do olho de propósito: é o que todo fps
 * desenha, e é o olho que o servidor rebobina (ADR 0002).
 */
function muzzleOf(options: ArenaWeaponOptions, out: Vector3): Vector3 {
  const viewmodel = options.viewmodel()
  if (!viewmodel) return out.copyFrom(options.camera.position)
  Vector3.TransformCoordinatesFromFloatsToRef(
    SNIPER_MUZZLE_M[0],
    SNIPER_MUZZLE_M[1],
    SNIPER_MUZZLE_M[2],
    viewmodel.rig.getWorldMatrix(),
    out,
  )
  return out
}
