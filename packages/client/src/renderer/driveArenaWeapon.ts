import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { type GameplayConfig, type ShotHit, weaponPhase } from '@shobu/core'
import { clipForWeaponPhase } from '../character/viewmodelClips.ts'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { HeldButtons } from '../controller/heldButtons.ts'
import type { HeldKeys } from '../controller/heldKeys.ts'
import { type MutableWeaponInput, weaponInputFrom } from '../controller/weaponInputFrom.ts'
import type { ScopeView } from '../hud/scopeView.ts'
import { clampPitchRad } from './driveCameraFromCharacter.ts'
import { SNIPER_MUZZLE_M, type SniperViewmodel } from './loadSniperViewmodel.ts'
import type { MuzzleFlash } from './muzzleFlashMesh.ts'
import { fireFlashOnRig, warmUpFlash } from './muzzleFlashMount.ts'
import { advanceScopeZoom, isScopeOpen, isViewmodelVisible, type ScopeZoom } from './scopeZoom.ts'
import { whenShotTexturesReady } from './shotMaterials.ts'
import type { ShotVisuals } from './shotVisuals.ts'
import { matchViewmodelProjection } from './viewmodelProjection.ts'
import { advanceRecoil, kickRecoil, type RecoilOffset, type WeaponRecoil } from './weaponRecoil.ts'

export interface ArenaWeaponOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly keys: Readonly<HeldKeys>
  readonly buttons: Readonly<HeldButtons>
  readonly weaponInput: MutableWeaponInput
  readonly zoom: ScopeZoom
  readonly scopeView: ScopeView
  readonly shots: ShotVisuals
  /** O clarão do cano do jogador, preso à arma quando ela chega. */
  readonly muzzleFlash: MuzzleFlash
  /**
   * O fov vertical da câmera da arma, ou `undefined` quando a arma é
   * desenhada pela câmera do mundo (no óculos): é o que põe o começo do
   * feixe sobre o cano desenhado (`viewmodelProjection.ts`).
   */
  readonly viewmodelFovRad: () => number | undefined
  readonly recoil: WeaponRecoil
  readonly camera: UniversalCamera
  /** Onde a arma está, ou `undefined` enquanto o glb não chegou. */
  readonly viewmodel: () => SniperViewmodel | undefined
  /** Falso com a katana na mão: a sniper está no coldre (ADR 0021). */
  readonly sniperShown: () => boolean
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
  const { config, session, zoom, scopeView, recoil, camera } = options
  const muzzle = new Vector3()
  const kick: RecoilOffset = { pitchDeltaRad: 0, rollRad: 0 }
  const own: OwnTracer = { ticket: -1, leftS: 0 }
  let scopeWasOpen = false
  warmUpBeams(scene, options)
  anchorOwnTracer(scene, options, own)
  scene.onBeforeRenderObservable.add(() => {
    const frameS = options.frameDeltaMs() / 1000
    weaponInputFrom(options.keys, options.buttons, options.weaponInput)
    advanceScopeZoom(zoom, session.weapon.scoped, frameS, config.camera.scopeTransitionS)
    const viewmodel = options.viewmodel()
    // morto, a câmera fica onde ele caiu (GDD), e a arma na mão de um corpo
    // que já não está lá mentiria sobre o estado dele.
    viewmodel?.setVisible(isViewmodelVisible(zoom) && session.local.alive && options.sniperShown())
    viewmodel?.animator.play(clipForWeaponPhase(weaponPhase(session.weapon)))
    scopeWasOpen = toggleScopeView(scopeView, isScopeOpen(zoom), scopeWasOpen)
    if (session.lastShot) {
      fireShot(options, session.lastShot, muzzle, own)
      kickRecoil(recoil)
    }
    advanceShots(options, own, frameS)
    applyRecoil(camera, recoil, frameS, kick)
  })
}

/**
 * Um feixe de verdade no primeiro quadro, diante da câmera e atrás da tela do
 * menu: o jogador não vê, e a gpu já recebe o programa e os buffers do feixe.
 * Sem isto, o primeiro tiro da partida pagava essa subida com um quadro de
 * ~50 ms (medição de 11/10). `forceCompilationAsync` não basta: ele compila,
 * mas a finalização do programa e a subida dos buffers só acontecem no
 * primeiro desenho.
 *
 * Espera as texturas do tiro (`whenShotTexturesReady`): no primeiro quadro
 * elas ainda estão baixando, e o aquecimento passava sem desenhar nada. O
 * clarão aquece no olho se a arma ainda não chegou (`warmUpFlash`): sem pai,
 * ele acendia na origem do mundo.
 */
function warmUpBeams(scene: Scene, options: ArenaWeaponOptions): void {
  whenShotTexturesReady(scene, () => warmUpNextFrame(scene, options))
}

function warmUpNextFrame(scene: Scene, options: ArenaWeaponOptions): void {
  scene.onBeforeRenderObservable.addOnce(() => {
    const from = options.camera.position
    const ahead = options.camera.getDirection(Vector3.Forward()).scaleInPlace(3).addInPlace(from)
    options.shots.warmUp(from, ahead)
    warmUpFlash(options.muzzleFlash, options.viewmodel()?.rig, options.camera, SNIPER_MUZZLE_M)
  })
}

/**
 * O feixe do próprio tiro, enquanto ele está aceso: o começo dele segue o cano.
 * Pelo bilhete, e não pelo slot: a piscina é dividida com os bots, e o rodízio
 * pode entregar o slot a um deles antes de o feixe do jogador apagar.
 */
interface OwnTracer {
  ticket: number
  leftS: number
}

/**
 * O feixe do jogador sai do cano **de agora** enquanto vive: o coice levanta
 * a arma logo depois do disparo, e o feixe preso ao cano de antes nascia
 * solto, um palmo abaixo dela (medido no headless, 12/10). O fim fica onde a
 * bala bateu.
 *
 * No quadro da câmera do mundo, e não em `onBeforeRenderObservable`: o coice
 * e o olho interpolado mexem na câmera depois deste módulo, e só aqui a pose
 * dela — e a do rig, filho dela — é a que vai ser desenhada. No óculos essa
 * câmera não desenha, e o feixe fica no cano do disparo.
 */
function anchorOwnTracer(scene: Scene, options: ArenaWeaponOptions, own: OwnTracer): void {
  const muzzle = new Vector3()
  scene.onBeforeCameraRenderObservable.add((camera) => {
    if (camera !== options.camera || own.leftS <= 0) return
    options.viewmodel()?.rig.computeWorldMatrix(true)
    options.shots.anchorTracer(own.ticket, muzzleOf(options, muzzle))
  })
}

/** O feixe e o impacto no mundo, e o clarão na arma. */
function fireShot(
  options: ArenaWeaponOptions,
  shot: Readonly<ShotHit>,
  muzzle: Vector3,
  own: OwnTracer,
): void {
  own.ticket = options.shots.fire(muzzleOf(options, muzzle), shot.endpointM, shot.targetIndex >= 0)
  own.leftS = options.config.weapon.tracerLifetimeS
  flashAtMuzzle(options)
}

/** Um quadro dos efeitos do tiro: o mundo e o clarão na arma. */
function advanceShots(options: ArenaWeaponOptions, own: OwnTracer, frameS: number): void {
  own.leftS = Math.max(0, own.leftS - frameS)
  options.shots.advance(frameS)
  options.muzzleFlash.advance(frameS)
}

/**
 * O clarão vai para a boca do cano da arma na primeira vez que ela existe, e
 * fica: filho do rig, ele acompanha o coice e o balanço sem conta nenhuma, e
 * some junto com a arma na luneta. Antes de o glb chegar, não acende
 * (`fireFlashOnRig`).
 */
function flashAtMuzzle(options: ArenaWeaponOptions): void {
  fireFlashOnRig(options.muzzleFlash, options.viewmodel()?.rig, SNIPER_MUZZLE_M)
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
  // na luneta a arma some: o feixe sai do olho, de ponta, e não atravessa a
  // lente aumentada como uma barra a um metro do rosto (medido no headless,
  // 12/10).
  if (!viewmodel?.rig.isEnabled(false)) return out.copyFrom(options.camera.position)
  Vector3.TransformCoordinatesFromFloatsToRef(
    SNIPER_MUZZLE_M[0],
    SNIPER_MUZZLE_M[1],
    SNIPER_MUZZLE_M[2],
    viewmodel.rig.getWorldMatrix(),
    out,
  )
  const viewmodelFovRad = options.viewmodelFovRad()
  if (viewmodelFovRad === undefined) return out
  // a arma é desenhada com outro fov: o cano em mundo cai noutro pixel que o
  // cano desenhado. Leva-se para o espaço da câmera, corrige-se, e volta.
  const view = options.camera.getViewMatrix()
  Vector3.TransformCoordinatesToRef(out, view, out)
  matchViewmodelProjection(out, viewmodelFovRad, options.camera.fov)
  view.invertToRef(viewToWorld)
  return Vector3.TransformCoordinatesToRef(out, viewToWorld, out)
}

/** O inverso da vista, de rascunho: um tiro por quadro, sem alocar. */
const viewToWorld = new Matrix()
