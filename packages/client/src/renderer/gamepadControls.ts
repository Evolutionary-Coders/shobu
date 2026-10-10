import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Scene } from '@babylonjs/core/scene'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import { createGamepadReader, type GamepadTargets } from '../controller/gamepadInput.ts'
import { createRumbleCues } from '../controller/gamepadRumble.ts'
import type { GamepadSession } from '../controller/gamepadSession.ts'
import {
  createStartGestureReader,
  type StartAction,
  startActionFor,
} from '../controller/startGesture.ts'
import { type StickTurn, stickGainFrom, stickLookTurn } from '../controller/stickLook.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { HeadMountedView } from './cardboardView.ts'
import type { LockedMouseLook } from './lockedMouseLook.ts'

export interface GamepadAim {
  readonly headset: HeadMountedView
  readonly session: GamepadSession
  readonly camera: UniversalCamera
  /** O dono do ganho do mouse: o analógico gira na mesma escala, luneta incluída. */
  readonly look: LockedMouseLook
  readonly settings: () => PlayerSettings
  readonly inControl: () => boolean
  readonly frameDeltaMs: () => number
}

/**
 * O gamepad é lido por quadro, **antes** de tudo: o núcleo pergunta o que está
 * preso, e a resposta tem que estar escrita quando ele perguntar. O primeiro
 * gamepad conectado é o do jogador.
 *
 * ```ts
 * driveGamepad(scene, { keys, buttons, stick, look: lookStick }, { headset, session, camera, look, inControl, frameDeltaMs })
 * ```
 */
export function driveGamepad(scene: Scene, targets: GamepadTargets, aim: GamepadAim): void {
  const reader = createGamepadReader()
  const start = createStartGestureReader()
  const turn: StickTurn = { x: 0, y: 0 }
  scene.onBeforeRenderObservable.add(
    () => {
      const pad = connectedGamepad()
      // o controle que cai (bateria, alcance) encerra a sessão dele: sem isto
      // ela não tinha saída, porque só o START a encerrava (revisão do #17).
      if (!pad) aim.session.exit()
      const inControl = aim.inControl()
      const gesture = start.read(reader.read(pad, targets, inControl), performance.now())
      if (gesture) runStart(startActionFor(gesture, aim.headset.active), aim)
      if (!inControl) return
      const gain = stickGainFrom(aim.settings(), aim.look.angularSensibility)
      stickLookTurn(targets.look, gain, lookStepS(aim.frameDeltaMs()), turn)
      applyStickTurn(turn, aim)
    },
    undefined,
    true,
  )
}

/**
 * O quadro de volta de uma aba escondida pode durar segundos, e com o
 * analógico inclinado isso era um giro enorme de uma vez: o passo do olhar
 * para em 50 ms, o pior quadro que ainda é jogo.
 */
function lookStepS(frameDeltaMs: number): number {
  return Math.min(frameDeltaMs, 50) / 1000
}

const START_ACTIONS: Readonly<Record<StartAction, (aim: GamepadAim) => void>> = {
  recenter: (aim) => aim.headset.pressHeadButton(),
  'leave-headset': (aim) => aim.headset.exit(),
  pause: (aim) => aim.session.exit(),
}

function runStart(action: StartAction, aim: GamepadAim): void {
  START_ACTIONS[action](aim)
}

/**
 * No desktop o analógico direito gira a câmera como o mouse; no óculos a
 * cabeça é que olha, e ele só vira o corpo para os lados.
 */
function applyStickTurn(turn: StickTurn, aim: GamepadAim): void {
  if (aim.headset.active) {
    aim.headset.turnBy(turn.y)
    return
  }
  aim.camera.rotation.x += turn.x
  aim.camera.rotation.y += turn.y
}

/** O primeiro gamepad conectado é o do jogador. */
function connectedGamepad(): Gamepad | undefined {
  return navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? undefined
}

export interface GamepadRumbleOptions {
  readonly session: ArenaSession
  readonly settings: () => PlayerSettings
  readonly inControl: () => boolean
}

/**
 * Treme o controle no tiro, no acerto e na kill (`gamepadRumble.ts`).
 * Registrado **depois** do passo da sessão, como o áudio: é ali que o tiro do
 * quadro passa a existir. Controle sem motor, ou navegador sem a api, só não
 * treme.
 *
 * ```ts
 * driveGamepadRumble(scene, { session, settings: live.current, inControl })
 * ```
 */
export function driveGamepadRumble(scene: Scene, options: GamepadRumbleOptions): void {
  const cues = createRumbleCues()
  scene.onBeforeRenderObservable.add(() => {
    const { session } = options
    const kills = session.scoreboard.players.get(LOCAL_PLAYER_ID)?.kills ?? 0
    // a borda é lida sempre, para a kill de antes de ligar não tremer depois.
    const effect = cues.since({ shot: session.lastShot, kills })
    if (!effect || !options.inControl() || options.settings().gamepadRumble !== 1) return
    void connectedGamepad()?.vibrationActuator?.playEffect('dual-rumble', effect)
  })
}
