import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Scene } from '@babylonjs/core/scene'
import { buildGreyboxArena } from '../arena/buildGreyboxArena.ts'
import { blockoutToStaticBoxes } from '../arena/collisionBoxes.ts'
import { trainingDummyPostsM } from '../arena/trainingDummyPosts.ts'
import { bodyYawTargetRad, followBodyYawRad } from '../character/bodyYaw.ts'
import { competitorFeetM } from '../character/competitorAvatar.ts'
import { accentForIndex } from '../character/competitorPalette.ts'
import {
  createLocomotionPose,
  poseOfLocalCharacter,
  thirdPersonClipFor,
} from '../character/thirdPersonClips.ts'
import { type ArenaSession, createArenaSession } from '../controller/arenaSession.ts'
import { releaseAllButtons, trackHeldButtons } from '../controller/heldButtons.ts'
import {
  type HeldKeys,
  type KeyTracker,
  releaseAll,
  trackHeldKeys,
} from '../controller/heldKeys.ts'
import { createLocalCharacter, type LocalCharacter } from '../controller/localCharacter.ts'
import { createWeaponInput } from '../controller/weaponInputFrom.ts'
import { createMovementInput } from '../controller/wishDirection.ts'
import { type ArenaHud, createSilentHud } from '../hud/arenaHud.ts'
import { lightArena } from './arenaLighting.ts'
import { arenaLightingSpec } from './arenaLightingSpec.ts'
import type { ArenaRenderer, ArenaRendererOptions } from './arenaRenderer.ts'
import { createViewmodelCamera } from './createViewmodelCamera.ts'
import { driveArenaReadouts } from './driveArenaReadouts.ts'
import { driveArenaWeapon } from './driveArenaWeapon.ts'
import { driveCameraFromCharacter } from './driveCameraFromCharacter.ts'
import { driveViewmodelRig } from './driveViewmodelRig.ts'
import { driveFirstPersonLens } from './firstPersonLens.ts'
import { createFirstPersonViewer } from './firstPersonViewer.ts'
import { createJackInLens, type JackInLens } from './jackInLens.ts'
import { loadCompetitorAvatar } from './loadCompetitorAvatar.ts'
import {
  loadSniperViewmodel,
  SNIPER_PLACEMENT,
  type SniperViewmodel,
} from './loadSniperViewmodel.ts'
import { createScopeZoom, scopeFovDeg } from './scopeZoom.ts'
import { createTracerBeams } from './tracerBeams.ts'
import { createViewBob, type ViewBob } from './viewBob.ts'
import type { ClipTempo } from './viewmodelAnimator.ts'
import { followWorldCamera, VIEWMODEL_FOV_DEG } from './viewmodelCamera.ts'
import { createViewmodelSway } from './viewmodelSway.ts'
import { createWeaponRecoil, type WeaponRecoil } from './weaponRecoil.ts'

/**
 * Onde o competidor de revisão fica de pé, na convenção de altura de olho dos
 * spawns. **Não** é o centro da arena: o `mid-pillar-ne` em (16, 16) tapa
 * exatamente a diagonal do spawn 0, e um avatar atrás dele não serve de
 * revisão nenhuma.
 *
 * Também **não** é o poste de treino de (20, 20): os bonecos ocupam aquele
 * ponto agora, e dois avatares no mesmo lugar viram um borrão. Este fica no
 * beco do spawn 0, de lado, onde dá para olhar os dois.
 */
const REVIEW_POST_M: readonly [number, number, number] = [13, 2, 27]

/**
 * Adapter de babylon para a interface `ArenaRenderer`. É o único lugar do
 * cliente que conhece a engine.
 *
 * ```ts
 * const renderer = createBabylonArenaRenderer({ canvas, config, blockout, spawnPointM })
 * renderer.start()
 * ```
 */
// raiz de composição: cada linha é uma ligação só, e quebrar em duas funções
// aqui inventaria um nível de indireção que não existe no problema.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: raiz de composição
export function createBabylonArenaRenderer(options: ArenaRendererOptions): ArenaRenderer {
  const engine = new Engine(options.canvas, true, { stencil: false })
  const { scene, camera, viewmodelCamera } = createArenaScene(engine, options)
  const mouse = trackHeldButtons(options.canvas)
  const movementInput = createMovementInput()
  const weaponInput = createWeaponInput()
  const boxes = blockoutToStaticBoxes(options.blockout)
  const character = createLocalCharacter(options.config, feetOfSpawn(options), boxes)
  const session = createArenaSession({
    config: options.config,
    character,
    boxes,
    dummyPostsM: trainingDummyPostsM(options.config.match.trainingDummies),
    movementInput,
    weaponInput,
  })
  const { keyboard, viewBob } = attachLocalCharacter(engine, scene, camera, options, {
    character,
    session,
    movementInput,
  })
  mirrorLocalCharacter(scene, options, character, keyboard.keys, () => engine.getDeltaTime())
  showTrainingDummies(scene, options, session)
  const viewmodel = attachSniperViewmodel(scene, camera, options.config.weapon)
  const hud: ArenaHud = options.hud ?? createSilentHud()
  const zoom = createScopeZoom(!prefersReducedMotion())
  // tremor de câmera é o mesmo gatilho vestibular do balanço: quem pediu menos
  // movimento não ganha nem o coice. o recuo da **arma** sobrevive, porque
  // mexer num objeto a 65 cm do olho não é mexer na câmera.
  const recoil = createWeaponRecoil(!prefersReducedMotion())
  swayViewmodel(engine, scene, camera, character, viewBob, recoil, viewmodel)
  driveArenaWeapon(scene, {
    config: options.config,
    session,
    keys: keyboard.keys,
    buttons: mouse.buttons,
    weaponInput,
    zoom,
    scopeView: hud,
    beams: createTracerBeams(scene, TRACER_POOL_SIZE, options.config.weapon.tracerLifetimeS),
    recoil,
    camera,
    viewmodel: () => viewmodel.current,
    frameDeltaMs: () => engine.getDeltaTime(),
  })
  driveArenaReadouts(scene, { config: options.config, session, hud })
  const control = createPlayerControlNotifier(options.canvas)
  // sem o ponteiro travado não há partida: solta as teclas, senão um W preso no
  // instante do esc deixa o jogador correndo sozinho atrás da tela de boot.
  // o visor chega com o controle e sai com o esc, junto com a tela de boot.
  control.subscribe((inControl) => {
    hud.setVisible(inControl)
    if (inControl) return
    releaseAll(keyboard.keys)
    releaseAllButtons(mouse.buttons)
  })
  const jackIn = createJackInLens(() => performance.now())
  openLensOnControl(control, jackIn)
  driveFirstPersonLens(scene, {
    worldCamera: camera,
    viewmodelCamera,
    aspectRatio: () => engine.getAspectRatio(camera),
    // a luneta manda no fov do mundo; a lente de entrada multiplica por cima.
    horizontalFovDeg: () => scopeFovDeg(zoom, options.config.camera),
    viewmodelFovDeg: VIEWMODEL_FOV_DEG,
    jackIn,
  })
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
      mouse.dispose()
      control.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}

interface ArenaScene {
  readonly scene: Scene
  readonly camera: UniversalCamera
  readonly viewmodelCamera: UniversalCamera
}

/**
 * Duas câmeras, nesta ordem: o mundo primeiro, a arma depois. O babylon limpa a
 * cor **uma vez** por quadro e dá à segunda câmera um clear só de depth e
 * stencil, que é exatamente o que faz a arma nunca entrar na parede.
 *
 * Por isso `scene.autoClear` tem que continuar ligado: desligá-lo pararia a
 * limpeza de cor do mundo, não a da arma.
 */
function createArenaScene(engine: Engine, options: ArenaRendererOptions): ArenaScene {
  const { canvas } = options
  const scene = new Scene(engine)
  lightArena(scene, arenaLightingSpec())
  buildGreyboxArena(scene, options.blockout)
  const camera = createFirstPersonViewer(scene, options)
  camera.attachControl(true)
  const viewmodelCamera = createViewmodelCamera(scene, canvas.clientWidth / canvas.clientHeight)
  scene.activeCamera = camera
  scene.activeCameras = [camera, viewmodelCamera]
  followViewmodelCamera(scene, camera, viewmodelCamera)
  return { scene, camera, viewmodelCamera }
}

/**
 * Mantém a câmera do viewmodel colada na do mundo, **na matriz que de fato
 * desenha**.
 *
 * A cópia tem que acontecer depois de tudo que mexe na câmera do mundo no
 * quadro — o olho interpolado e o coice — e por isso não pode ficar em
 * `onBeforeRenderObservable`, que roda antes desses passos quando registrada
 * cedo.
 *
 * E copiar em `onBeforeCameraRenderObservable` **também não basta sozinho**: o
 * babylon chama `updateTransformMatrix()` **antes** de notificar esse
 * observável (`scene.pure.js`, em `_renderForCamera`), então a matriz de vista
 * já foi calculada com a pose antiga e a cópia só valeria no quadro seguinte.
 * Era isso que fazia a arma tremer quando o jogador girava a mira: ela é filha
 * da câmera do mundo e ia junto na hora, mas era desenhada por uma câmera um
 * quadro atrás.
 *
 * Refazer a matriz depois de copiar é o que fecha a conta. **Medido**: com a
 * câmera girando a 0,02 rad por quadro, a arma andava até 2293 px na tela sem
 * a segunda linha, e 0,01 px com ela.
 */
function followViewmodelCamera(
  scene: Scene,
  world: UniversalCamera,
  viewmodel: UniversalCamera,
): void {
  scene.onBeforeCameraRenderObservable.add((rendering) => {
    if (rendering !== viewmodel) return
    followWorldCamera(world, viewmodel)
    scene.updateTransformMatrix()
  })
}

interface LocalPlayer {
  readonly keyboard: KeyTracker
  readonly viewBob: ViewBob
}

/** Quantos feixes cabem vivos ao mesmo tempo: oito jogadores num ferrolho cada. */
const TRACER_POOL_SIZE = 8

interface SimulationParts {
  readonly character: LocalCharacter
  readonly session: ArenaSession
  readonly movementInput: ReturnType<typeof createMovementInput>
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
  simulation: SimulationParts,
): LocalPlayer {
  const { character, session, movementInput } = simulation
  const keyboard = trackHeldKeys(options.canvas)
  // balanço de câmera é o gatilho vestibular clássico: quem pediu menos
  // movimento não ganha nenhum, nem o afundo da aterrissagem.
  const viewBob = createViewBob(!prefersReducedMotion())
  driveCameraFromCharacter(scene, {
    camera,
    character,
    advance: (frame) => session.advance(frame),
    keys: keyboard.keys,
    movementInput,
    frameDeltaMs: () => engine.getDeltaTime(),
    viewBob,
    runSpeedMps: options.config.movement.runSpeedMps,
  })
  return { keyboard, viewBob }
}

function feetOfSpawn(options: ArenaRendererOptions): { x: number; y: number; z: number } {
  const [x, y, z] = competitorFeetM(options.spawnPointM, options.config.collision.capsuleHeightM)
  return { x, y, z }
}

/**
 * A arma respira, balança com a passada e arrasta atrás da mira. O glb não tem
 * idle — o `allanims` é animação de vitrine — então a pose parada é um quadro
 * congelado, e sem isto seria uma arma morta na tela.
 *
 * O balanço espera o glb chegar: o passo roda todo quadro e desiste enquanto o
 * rig não existe, em vez de a cena esperar o download.
 */
function swayViewmodel(
  engine: Engine,
  scene: Scene,
  camera: UniversalCamera,
  character: LocalCharacter,
  viewBob: ViewBob,
  recoil: WeaponRecoil,
  slot: SniperViewmodelSlot,
): void {
  const sway = createViewmodelSway(!prefersReducedMotion())
  let driving = false
  scene.onBeforeRenderObservable.add(() => {
    if (driving || !slot.current) return
    driving = true
    driveViewmodelRig(scene, {
      rig: slot.current.rig,
      aim: camera,
      body: () => ({
        verticalSpeedMps: character.current.velocity.y,
        sliding: character.current.stance === 'sliding',
      }),
      placement: SNIPER_PLACEMENT,
      sway,
      recoil,
      bob: viewBob,
      frameDeltaMs: () => engine.getDeltaTime(),
    })
  })
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
  frameDeltaMs: () => number,
): void {
  const { config } = options
  const pose = createLocomotionPose()
  loadCompetitorAvatar(scene, {
    eyeM: REVIEW_POST_M,
    capsuleHeightM: config.collision.capsuleHeightM,
    accent: accentForIndex(0),
  })
    .then((avatar) => {
      faceTheSpawn(avatar.root, options.spawnPointM)
      const aimYaw = avatar.root.rotation.y
      let bodyYaw = 0
      scene.onBeforeRenderObservable.add(() => {
        const frameS = frameDeltaMs() / 1000
        poseOfLocalCharacter(character.current, keys, pose)
        avatar.animator.play(thirdPersonClipFor(pose, config.movement), frameS)
        // o corpo se vira para onde anda; o tronco continua devendo a mira, e
        // é por isso que o giro tem teto (ver `bodyYaw.ts`).
        bodyYaw = followBodyYawRad(bodyYaw, bodyYawTargetRad(pose), frameS)
        avatar.root.rotation.y = aimYaw + bodyYaw
      })
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'competitor-avatar-load-failed', message }))
    })
}

/**
 * Os bonecos do campo de treino: um avatar por poste, virado para o centro da
 * arena, ligado enquanto o boneco está vivo.
 *
 * `setEnabled` e não animação de morte: o Mannequin tem `Death01`, mas o
 * boneco volta em 1,5 s e o clipe dura 2,4 — encaixar os dois é trabalho de
 * timing que não muda nada de gameplay, e fica para depois do servidor.
 */
function showTrainingDummies(
  scene: Scene,
  options: ArenaRendererOptions,
  session: ArenaSession,
): void {
  for (const [index, dummy] of session.dummies.entries()) {
    const eyeM: readonly [number, number, number] = [
      dummy.feetM.x,
      dummy.feetM.y + options.config.collision.capsuleHeightM,
      dummy.feetM.z,
    ]
    loadCompetitorAvatar(scene, {
      eyeM,
      capsuleHeightM: options.config.collision.capsuleHeightM,
      accent: accentForIndex(index),
    })
      .then((avatar) => {
        avatar.root.lookAt(new Vector3(-eyeM[0], 0, -eyeM[2]))
        scene.onBeforeRenderObservable.add(() => avatar.root.setEnabled(dummy.alive))
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason)
        console.error(JSON.stringify({ event: 'training-dummy-load-failed', message }))
      })
  }
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
  control.subscribe((inControl) => {
    if (inControl && !prefersReducedMotion()) lens.play()
  })
}

/**
 * Onde a arma fica enquanto ela não chegou. O handle **não** é descartado: quem
 * atira, recarrega e mira precisa dele, e o glb chega alguns quadros depois do
 * primeiro render.
 */
interface SniperViewmodelSlot {
  current: SniperViewmodel | undefined
}

/**
 * Braços e arma presos à câmera. Sem `await` pelo mesmo motivo do avatar: a
 * arena renderiza no primeiro quadro e a arma entra quando chegar, e falha de
 * carregamento vira log estruturado em vez de derrubar a cena.
 */
function attachSniperViewmodel(
  scene: Scene,
  camera: UniversalCamera,
  tempo: ClipTempo,
): SniperViewmodelSlot {
  const slot: SniperViewmodelSlot = { current: undefined }
  loadSniperViewmodel(scene, camera, SNIPER_PLACEMENT, tempo)
    .then((loaded) => {
      slot.current = loaded
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'sniper-viewmodel-load-failed', message }))
    })
  return slot
}

/**
 * O espelho olha para quem ele imita. O `__root__` que o loader do glTF cria
 * já vem girado meia-volta para trocar a mão do sistema de coordenadas, então
 * `lookAt` no spawn viraria as costas: mira-se no ponto **oposto** ao spawn.
 */
function faceTheSpawn(root: AbstractMesh, spawnM: readonly [number, number, number]): void {
  const [postX, , postZ] = REVIEW_POST_M
  root.lookAt(new Vector3(2 * postX - spawnM[0], 0, 2 * postZ - spawnM[2]))
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
