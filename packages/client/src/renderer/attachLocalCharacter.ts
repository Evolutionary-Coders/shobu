import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Engine } from '@babylonjs/core/Engines/engine'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { HeldButtons } from '../controller/heldButtons.ts'
import { type KeyTracker, trackHeldKeys } from '../controller/heldKeys.ts'
import { createHeldStick, type HeldStick } from '../controller/heldStick.ts'
import type { LocalCharacter } from '../controller/localCharacter.ts'
import { type MutableWeaponInput, settleWeaponPresses } from '../controller/weaponInputFrom.ts'
import type { createMovementInput } from '../controller/wishDirection.ts'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { driveCameraFromCharacter } from './driveCameraFromCharacter.ts'
import { prefersReducedMotion } from './reducedMotion.ts'
import { createViewBob, type ViewBob } from './viewBob.ts'

export interface LocalPlayer {
  readonly keyboard: KeyTracker
  readonly viewBob: ViewBob
  readonly stick: HeldStick
}

export interface SimulationParts {
  readonly character: LocalCharacter
  readonly session: ArenaSession
  readonly movementInput: ReturnType<typeof createMovementInput>
  readonly buttons: HeldButtons
  readonly weaponInput: Readonly<MutableWeaponInput>
  /** Quanto um `session.advance` que rodou tick levou, em ms (`framePerf.ts`). */
  readonly recordSimulation: (ms: number) => void
}

/**
 * O controlador do núcleo ligado à câmera: teclado no canvas, estado do jogador
 * em tick fixo, câmera no olho interpolado. O spawn está na convenção de olho
 * dos `GREYBOX_SPAWN_POINTS_M`; o núcleo trabalha com o pé.
 *
 * ```ts
 * const { keyboard, viewBob, stick } = attachLocalCharacter(engine, scene, camera, options, simulation)
 * ```
 */
export function attachLocalCharacter(
  engine: Engine,
  scene: Scene,
  camera: UniversalCamera,
  options: ArenaRendererOptions,
  simulation: SimulationParts,
): LocalPlayer {
  const { character, session, movementInput, buttons, weaponInput, recordSimulation } = simulation
  const keyboard = trackHeldKeys(options.canvas)
  // balanço de câmera é o gatilho vestibular clássico: quem pediu menos
  // movimento não ganha nenhum, nem o afundo da aterrissagem.
  const viewBob = createViewBob(!prefersReducedMotion())
  const stick = createHeldStick()
  driveCameraFromCharacter(scene, {
    camera,
    character,
    advance: (frame) => {
      const startedMs = performance.now()
      const ticks = session.advance(frame)
      if (ticks > 0) recordSimulation(performance.now() - startedMs)
      // o aperto guardado só some depois de um tick tê-lo lido (`weaponInputFrom.ts`).
      if (ticks > 0) settleWeaponPresses(buttons, weaponInput)
      return ticks
    },
    keys: keyboard.keys,
    stick,
    movementInput,
    frameDeltaMs: () => engine.getDeltaTime(),
    viewBob,
    runSpeedMps: options.config.movement.runSpeedMps,
  })
  return { keyboard, viewBob, stick }
}
