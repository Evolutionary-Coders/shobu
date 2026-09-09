import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { buildGreyboxArena } from '../arena/buildGreyboxArena.ts'
import { blockoutToStaticBoxes } from '../arena/collisionBoxes.ts'
import { competitorFeetM } from '../character/competitorAvatar.ts'
import {
  createLocomotionPose,
  poseOfLocalCharacter,
  thirdPersonClipFor,
} from '../character/thirdPersonClips.ts'
import {
  type HeldKeys,
  type KeyTracker,
  releaseAll,
  trackHeldKeys,
} from '../controller/heldKeys.ts'
import { createLocalCharacter, type LocalCharacter } from '../controller/localCharacter.ts'
import { lightArena } from './arenaLighting.ts'
import { arenaLightingSpec } from './arenaLightingSpec.ts'
import type { ArenaRenderer, ArenaRendererOptions } from './arenaRenderer.ts'
import { driveCameraFromCharacter } from './driveCameraFromCharacter.ts'
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
  const { keyboard, character } = attachLocalCharacter(engine, scene, camera, options)
  mirrorLocalCharacter(scene, options, character, keyboard.keys)
  const control = createPlayerControlNotifier(options.canvas)
  // sem o ponteiro travado não há partida: solta as teclas, senão um W preso no
  // instante do esc deixa o jogador correndo sozinho atrás da tela de boot.
  control.subscribe((inControl) => {
    if (!inControl) releaseAll(keyboard.keys)
  })
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
      keyboard.dispose()
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
  lightArena(scene, arenaLightingSpec())
  buildGreyboxArena(scene, options.blockout)
  const camera = createFirstPersonViewer(scene, options)
  camera.attachControl(true)
  return { scene, camera }
}

interface LocalPlayer {
  readonly keyboard: KeyTracker
  readonly character: LocalCharacter
}

/**
 * O controlador do núcleo ligado à câmera: teclado no canvas, estado do jogador
 * em tick fixo, câmera no olho interpolado. O spawn está na convenção de olho
 * dos `GREYBOX_SPAWN_POINTS_M`; o núcleo trabalha com o pé.
 */
function attachLocalCharacter(
  engine: Engine,
  scene: Scene,
  camera: UniversalCamera,
  options: ArenaRendererOptions,
): LocalPlayer {
  const [x, y, z] = competitorFeetM(options.spawnPointM, options.config.collision.capsuleHeightM)
  const character = createLocalCharacter(
    options.config,
    { x, y, z },
    blockoutToStaticBoxes(options.blockout),
  )
  const keyboard = trackHeldKeys(options.canvas)
  driveCameraFromCharacter(scene, {
    camera,
    character,
    keys: keyboard.keys,
    frameDeltaMs: () => engine.getDeltaTime(),
  })
  return { keyboard, character }
}

/**
 * O competidor de revisão **imita o jogador local**, parado no posto: correr,
 * agachar, deslizar e pular na frente dele mostra o clipe de terceira pessoa de
 * cada estado sem precisar de segundo jogador. É o mesmo caminho que o jogador
 * remoto vai percorrer (ADR 0002), com o estado vindo da rede em vez do teclado.
 *
 * Sem `await`: a cena renderiza no primeiro quadro e o avatar entra quando
 * chegar. Falha de carregamento não pode derrubar a arena, então ela vira log
 * estruturado em vez de exceção não tratada.
 */
function mirrorLocalCharacter(
  scene: Scene,
  options: ArenaRendererOptions,
  character: LocalCharacter,
  keys: HeldKeys,
): void {
  const { config } = options
  const pose = createLocomotionPose()
  loadCompetitorAvatar(scene, {
    eyeM: REVIEW_POST_M,
    capsuleHeightM: config.collision.capsuleHeightM,
  })
    .then((avatar) => {
      scene.onBeforeRenderObservable.add(() => {
        poseOfLocalCharacter(character.current, keys, pose)
        avatar.animator.play(thirdPersonClipFor(pose, config.movement))
      })
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'competitor-avatar-load-failed', message }))
    })
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
