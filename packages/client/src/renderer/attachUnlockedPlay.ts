import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { HeldButtons } from '../controller/heldButtons.ts'
import type { HeldKeys } from '../controller/heldKeys.ts'
import { createHeldStick, type HeldStick } from '../controller/heldStick.ts'
import type { UnlockedSession } from '../controller/unlockedSession.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { HeadMountedView } from './cardboardView.ts'
import { driveGamepad, driveGamepadRumble } from './gamepadControls.ts'
import type { LockedMouseLook } from './lockedMouseLook.ts'
import { attachTouchPlay } from './touchPlay.ts'

export interface UnlockedPlayParts {
  readonly canvas: HTMLCanvasElement
  readonly session: UnlockedSession
  readonly arena: ArenaSession
  readonly headset: HeadMountedView
  readonly camera: UniversalCamera
  readonly look: LockedMouseLook
  readonly keys: HeldKeys
  readonly buttons: HeldButtons
  readonly stick: HeldStick
  readonly settings: () => PlayerSettings
  readonly inControl: () => boolean
  readonly frameDeltaMs: () => number
}

/**
 * As entradas que jogam **sem** o ponteiro travado — controle e toque — e a
 * vibração do controle, ligadas à cena numa chamada só. As três escrevem nos
 * mesmos estados de tecla, botão e analógico que o teclado e o mouse.
 *
 * A ordem dos registros importa: os dois leitores entram no **começo** da
 * fila do quadro (`insertFirst`), e o último a entrar roda primeiro. O
 * gamepad, registrado depois, lê antes do toque — e o toque só escreve o
 * analógico com o polegar nele (`touchRouter.writeMove`), então os dois
 * convivem no mesmo celular.
 *
 * ```ts
 * attachUnlockedPlay(scene, { canvas, session, arena, headset, camera, look, keys, buttons, stick, settings, inControl, frameDeltaMs })
 * ```
 */
export function attachUnlockedPlay(scene: Scene, parts: UnlockedPlayParts): void {
  const { session, keys, buttons, stick, settings, inControl } = parts
  // sem trava, o esc não solta nada sozinho: é ele que tira do controle
  // quem quer voltar ao menu pelo teclado (revisão do #17).
  parts.canvas.ownerDocument.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') session.exit()
  })
  driveGamepadRumble(scene, { session: parts.arena, settings, inControl })
  const document = parts.canvas.ownerDocument
  const { camera, look } = parts
  attachTouchPlay(scene, { keys, buttons, stick }, { document, session, camera, look, settings })
  driveGamepad(
    scene,
    { keys, buttons, stick, look: createHeldStick() },
    {
      headset: parts.headset,
      session,
      camera,
      look,
      settings,
      inControl,
      frameDeltaMs: parts.frameDeltaMs,
    },
  )
}
