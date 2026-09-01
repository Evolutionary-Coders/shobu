import { Engine } from '@babylonjs/core/Engines/engine'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { buildGreyboxArena } from '../arena/buildGreyboxArena.ts'
import type { ArenaRenderer, ArenaRendererOptions } from './arenaRenderer.ts'
import { createFirstPersonViewer } from './firstPersonViewer.ts'

/**
 * Adapter de babylon para a interface `ArenaRenderer`. É o único lugar do
 * cliente que conhece a engine.
 *
 * ```ts
 * const renderer = createBabylonArenaRenderer({ canvas, config, blockout, spawnPointM })
 * renderer.start()
 * ```
 */
export function createBabylonArenaRenderer(options: ArenaRendererOptions): ArenaRenderer {
  const engine = new Engine(options.canvas, true, { stencil: false })
  const scene = createArenaScene(engine, options)
  const control = createPlayerControlNotifier(options.canvas)
  const resize = (): void => engine.resize()
  window.addEventListener('resize', resize)

  return {
    start: () => engine.runRenderLoop(() => scene.render()),
    enterPointerLock: async () => {
      await options.canvas.requestPointerLock()
    },
    onPlayerControlChange: control.subscribe,
    dispose: () => {
      window.removeEventListener('resize', resize)
      control.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}

function createArenaScene(engine: Engine, options: ArenaRendererOptions): Scene {
  const { config } = options
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.02, 0.02, 0.03, 1)
  scene.collisionsEnabled = true
  // gravidade do babylon é por quadro; ver applyPlaceholderLocomotion.
  scene.gravity = new Vector3(0, config.movement.gravityMps2 / config.simulation.tickHz, 0)
  // groundColor não é decoração: sem ela a face de baixo de toda plataforma
  // fica preta, e plataforma sem silhueta é o que torna greybox ilegível.
  const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene)
  sky.intensity = 1
  sky.groundColor = new Color3(0.24, 0.24, 0.3)
  buildGreyboxArena(scene, options.blockout)
  createFirstPersonViewer(scene, options).attachControl(true)
  return scene
}

interface PlayerControlNotifier {
  subscribe(listener: (inControl: boolean) => void): void
  dispose(): void
}

/** O ponteiro travado no canvas *é* o jogador no controle — o teste do pilar 2. */
function createPlayerControlNotifier(canvas: HTMLCanvasElement): PlayerControlNotifier {
  const listeners = new Set<(inControl: boolean) => void>()
  const notify = (): void => {
    const inControl = document.pointerLockElement === canvas
    for (const listener of listeners) listener(inControl)
  }
  document.addEventListener('pointerlockchange', notify)
  return {
    subscribe: (listener) => void listeners.add(listener),
    dispose: () => document.removeEventListener('pointerlockchange', notify),
  }
}
