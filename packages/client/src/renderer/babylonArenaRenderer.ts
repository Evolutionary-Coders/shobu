import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { buildGreyboxArena } from '../arena/buildGreyboxArena.ts'
import type { ArenaRenderer, ArenaRendererOptions } from './arenaRenderer.ts'
import { createFirstPersonViewer } from './firstPersonViewer.ts'
import { createJackInLens, type JackInLens } from './jackInLens.ts'
import { loadCompetitorAvatar } from './loadCompetitorAvatar.ts'

/**
 * Oito metros à frente do spawn 0, na linha em que a câmera nasce olhando, na
 * convenção de altura de olho dos spawns. **Não** é o centro da arena: o
 * `mid-pillar-ne` em (16, 16) tapa exatamente essa diagonal, e um avatar atrás
 * dele não serve de revisão nenhuma. É onde o competidor fica de pé enquanto
 * não há jogador remoto.
 */
const REVIEW_POST_M: readonly [number, number, number] = [20, 1.8, 20]

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
  const { scene, camera } = createArenaScene(engine, options)
  const control = createPlayerControlNotifier(options.canvas)
  openLensOnControl(
    control,
    createJackInLens(scene, camera, () => performance.now()),
  )
  const resize = (): void => engine.resize()
  window.addEventListener('resize', resize)

  return {
    start: () => engine.runRenderLoop(() => scene.render()),
    enterPointerLock: async () => {
      focusForKeyboard(options.canvas)
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

interface ArenaScene {
  readonly scene: Scene
  readonly camera: UniversalCamera
}

function createArenaScene(engine: Engine, options: ArenaRendererOptions): ArenaScene {
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
  const camera = createFirstPersonViewer(scene, options)
  camera.attachControl(true)
  spawnReviewCompetitor(scene, config.collision.capsuleHeightM)
  return { scene, camera }
}

/**
 * A lente fecha e abre toda vez que o jogador ganha o controle — inclusive ao
 * reentrar depois de um esc, porque a tela de boot também refaz a transição
 * dela nesse caso, e o mundo e a tela têm que contar a mesma história.
 *
 * Quem pediu menos movimento não vê a lente mexer: mudança de fov é o mesmo
 * gatilho vestibular que fez jackIn.css cortar as pálpebras e as faixas.
 */
function openLensOnControl(control: PlayerControlNotifier, lens: JackInLens): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  control.subscribe((inControl) => {
    if (inControl && !reducedMotion.matches) lens.play()
  })
}

/**
 * Um competidor parado no `REVIEW_POST_M`, **só para revisão**: dá escala
 * humana ao greybox, que sem figura no chão não tem referência de tamanho
 * nenhuma. Sai quando o jogador remoto chegar pelo colyseus.
 *
 * Sem `await`: a cena renderiza no primeiro quadro e o avatar entra quando
 * chegar. Falha de carregamento não pode derrubar a arena, então ela vira log
 * estruturado em vez de exceção não tratada.
 */
function spawnReviewCompetitor(scene: Scene, capsuleHeightM: number): void {
  loadCompetitorAvatar(scene, { eyeM: REVIEW_POST_M, capsuleHeightM }).catch((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(JSON.stringify({ event: 'competitor-avatar-load-failed', message }))
  })
}

/**
 * O babylon escuta `keydown` **no canvas**, e um canvas só recebe tecla quando
 * tem foco. O clique que pede o ponteiro cai na tela de boot, nunca no canvas,
 * então sem isto o WASD morria antes de chegar ao motor. `tabIndex` porque
 * canvas não é focável por padrão — o babylon só o define quando o ponteiro
 * passa por cima, o que a tela de boot impede.
 */
function focusForKeyboard(canvas: HTMLCanvasElement): void {
  canvas.tabIndex = 0
  canvas.focus({ preventScroll: true })
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
