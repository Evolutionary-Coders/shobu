import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Scene } from '@babylonjs/core/scene'
import type { TouchTargets } from '../controller/touchButtons.ts'
import { touchGainFrom, touchLookTurn } from '../controller/touchLook.ts'
import { createTouchRouter } from '../controller/touchRouter.ts'
import type { UnlockedSession } from '../controller/unlockedSession.ts'
import { createTouchControls } from '../hud/touchControls.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { LockedMouseLook } from './lockedMouseLook.ts'

export interface TouchPlayOptions {
  readonly document: Document
  readonly session: UnlockedSession
  readonly camera: UniversalCamera
  /** O dono do ganho do mouse: o arrasto gira na mesma escala, luneta incluída. */
  readonly look: LockedMouseLook
  readonly settings: () => PlayerSettings
}

/**
 * Jogar pelo toque, no celular sem óculos: a camada de toque aparece quando a
 * sessão sem trava é **de toque**, e a cada quadro o polegar esquerdo escreve
 * o andar e o direito gira a câmera.
 *
 * Lido antes de tudo, como o gamepad (`gamepadControls.ts`): o núcleo pergunta
 * o que está preso, e a resposta tem que estar escrita quando ele perguntar.
 *
 * ```ts
 * attachTouchPlay(scene, { keys, buttons, stick }, { document, session, camera, look, settings })
 * ```
 */
export function attachTouchPlay(
  scene: Scene,
  targets: TouchTargets,
  options: TouchPlayOptions,
): void {
  const router = createTouchRouter()
  const controls = createTouchControls(options.document, router, targets)
  controls.onPause(() => options.session.exit())
  options.session.onChange(() => controls.setVisible(options.session.input === 'touch'))
  const drag = { x: 0, y: 0 }
  const turn = { x: 0, y: 0 }
  const gain = touchGainFrom(options.settings(), options.look.angularSensibility)
  scene.onBeforeRenderObservable.add(
    () => {
      if (options.session.input !== 'touch') return
      router.writeMove(targets.stick, targets.keys)
      router.takeLook(drag)
      touchGainFrom(options.settings(), options.look.angularSensibility, gain)
      touchLookTurn(drag, gain, turn)
      options.camera.rotation.x += turn.x
      options.camera.rotation.y += turn.y
    },
    undefined,
    true,
  )
}
