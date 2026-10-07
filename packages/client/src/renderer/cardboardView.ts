import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { VRCameraMetrics } from '@babylonjs/core/Cameras/VR/vrCameraMetrics'
import { VRDeviceOrientationFreeCamera } from '@babylonjs/core/Cameras/VR/vrDeviceOrientationFreeCamera'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  type DeviceAngles,
  eulerOf,
  type HeadEuler,
  type HeadQuaternion,
  headFromDevice,
  turnHead,
  yawOffsetFor,
} from './headPose.ts'
import { eyeToScreenFor, headsetMagnification } from './headsetLens.ts'
import { VIEWMODEL_LAYER, WORLD_LAYER } from './viewmodelCamera.ts'

/**
 * A visão de capacete (ADR 0012): a interface que o resto do cliente conhece. O
 * cardboard é a primeira implementação; um headset de verdade entra depois, por
 * webxr, atrás dela.
 */
export interface HeadMountedView {
  readonly active: boolean
  /** Entra no óculos. Só funciona dentro de um gesto do jogador (tela cheia). */
  enter(): Promise<void>
  exit(): void
  onActiveChange(listener: (active: boolean) => void): void
  /** O botão de trás da cabeça do controle. */
  pressHeadButton(): void
  dispose(): void
}

export interface CardboardViewOptions {
  readonly scene: Scene
  /** A câmera do jogo: mira, movimento e arma continuam lendo dela. */
  readonly worldCamera: UniversalCamera
  /** A câmera só da arma, que sai de cena no óculos. */
  readonly viewmodelCamera: UniversalCamera
  readonly canvas: HTMLCanvasElement
  /** O fov horizontal de quadril e o de agora (com a luneta), em graus. */
  readonly baseFovDeg: () => number
  readonly currentFovDeg: () => number
}

/**
 * O botão da cabeça dá meia-volta: no cardboard o jogador costuma estar sentado,
 * e virar o corpo inteiro para o inimigo atrás dele não é opção.
 */
const HEAD_BUTTON_TURN_RAD = Math.PI

/**
 * Por cima de tudo: um retículo que some atrás de um poste não é retículo. O
 * céu (`arenaSky.ts`) põe toda malha nova no grupo 1, e por isso o grupo é
 * reescrito a cada quadro em vez de uma vez só.
 */
const RETICLE_GROUP = 3

/** O retículo fica a 5 m: longe o bastante para os dois olhos convergirem nele sem esforço. */
const RETICLE_DISTANCE_M = 5
const RETICLE_RADIUS_M = 0.012

/**
 * O cardboard. A câmera do jogo continua sendo **a** câmera — mira, movimento,
 * hitscan e a arma presa a ela não sabem do óculos —, e quem desenha é uma
 * `VRDeviceOrientationFreeCamera` que copia a posição dela e a pose da cabeça.
 *
 * A entrada de orientação daquela câmera é removida: ela espelha o mundo (ver
 * `headPose.ts`). A pose vem do nosso `deviceorientation`, e é escrita **na
 * câmera do jogo** no começo do quadro, antes de qualquer um ler a frente dela;
 * sem giroscópio (`?vr=1` no desktop), a câmera do jogo segue o mouse e a do
 * óculos copia.
 *
 * ```ts
 * const headset = createCardboardView({ scene, worldCamera, viewmodelCamera, canvas, ... })
 * button.onclick = () => headset.enter()
 * ```
 */
export function createCardboardView(options: CardboardViewOptions): HeadMountedView {
  const state = createCardboardState()
  const exit = (): void => exitCardboard(state, options)
  const stopWatching = exitWhenPageLeaves(exit, state.sensor)
  followEveryFrame(state, options)
  return {
    get active() {
      return state.rig !== undefined
    },
    enter: () => enterCardboard(state, options),
    exit,
    onActiveChange: (listener) => void state.listeners.add(listener),
    pressHeadButton: () => {
      state.head.offsetRad += HEAD_BUTTON_TURN_RAD
    },
    dispose: () => {
      exit()
      state.sensor.dispose()
      stopWatching()
    },
  }
}

/**
 * Sair da tela cheia (o gesto de voltar do android) ou esconder a página tira do
 * óculos; o segundo é a saída de quem não conseguiu tela cheia. Sem giroscópio
 * (`?vr=1` no desktop), soltar o ponteiro com esc também: é o mesmo gesto que
 * tira do jogo no desktop, e sem ele o estéreo prendia o jogador. Devolve quem
 * para de vigiar.
 */
function exitWhenPageLeaves(exit: () => void, sensor: OrientationSensor): () => void {
  const onFullscreenChange = (): void => {
    if (!document.fullscreenElement) exit()
  }
  const onVisibilityChange = (): void => {
    if (document.hidden) exit()
  }
  const onPointerLockChange = (): void => {
    if (!document.pointerLockElement && !sensor.available()) exit()
  }
  const events: readonly [string, () => void][] = [
    ['fullscreenchange', onFullscreenChange],
    ['visibilitychange', onVisibilityChange],
    ['pointerlockchange', onPointerLockChange],
  ]
  for (const [type, listener] of events) document.addEventListener(type, listener)
  return () => {
    for (const [type, listener] of events) document.removeEventListener(type, listener)
  }
}

interface CardboardState {
  rig: CardboardRig | undefined
  readonly listeners: Set<(active: boolean) => void>
  readonly sensor: OrientationSensor
  readonly head: HeadState
}

function createCardboardState(): CardboardState {
  return {
    rig: undefined,
    listeners: new Set(),
    sensor: trackDeviceOrientation(),
    head: createHeadState(),
  }
}

async function enterCardboard(state: CardboardState, options: CardboardViewOptions): Promise<void> {
  if (state.rig) return
  await goFullscreenLandscape(options.canvas, state.sensor.available())
  state.head.aligned = false
  state.rig = createRig(options)
  notifyActive(state)
}

function exitCardboard(state: CardboardState, options: CardboardViewOptions): void {
  if (!state.rig) return
  state.rig.dispose()
  state.rig = undefined
  restoreDesktopCameras(options)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  notifyActive(state)
}

function notifyActive(state: CardboardState): void {
  for (const listener of state.listeners) listener(state.rig !== undefined)
}

/**
 * Dois passos por quadro. A pose vai para a câmera do jogo **primeiro**, antes
 * de o movimento e a mira lerem a frente dela; a câmera do óculos copia **por
 * último**, depois de o personagem andar e a câmera do jogo ir para o olho.
 */
function followEveryFrame(state: CardboardState, options: CardboardViewOptions): void {
  const { onBeforeRenderObservable } = options.scene
  const pose = (): void => {
    if (state.rig) poseWorldCamera(options, state.sensor, state.head)
  }
  onBeforeRenderObservable.add(pose, undefined, true)
  onBeforeRenderObservable.add(() => state.rig?.follow(options, state.head))
}

interface HeadState {
  readonly pose: HeadQuaternion
  readonly euler: HeadEuler
  /** Para a pose do mouse, sem alocar um quaternion por quadro. */
  readonly scratch: Quaternion
  offsetRad: number
  aligned: boolean
}

function createHeadState(): HeadState {
  return {
    pose: { x: 0, y: 0, z: 0, w: 1 },
    euler: { x: 0, y: 0, z: 0 },
    scratch: new Quaternion(),
    offsetRad: 0,
    aligned: false,
  }
}

/**
 * Escreve a pose da cabeça na câmera do jogo. Na primeira amostra depois de
 * entrar, o deslocamento de guinada é o que mantém a vista onde a câmera já
 * olhava: entrar no óculos não pode girar o mundo.
 */
function poseWorldCamera(
  options: CardboardViewOptions,
  sensor: OrientationSensor,
  head: HeadState,
): void {
  const angles = sensor.latest()
  const camera = options.worldCamera
  if (!angles) {
    // sem giroscópio: o mouse manda na câmera do jogo, e a pose é a dela.
    const { rotation } = camera
    const q = Quaternion.RotationYawPitchRollToRef(rotation.y, rotation.x, rotation.z, head.scratch)
    head.pose.x = q.x
    head.pose.y = q.y
    head.pose.z = q.z
    head.pose.w = q.w
    return
  }
  headFromDevice(angles, head.pose)
  if (!head.aligned) {
    head.offsetRad = yawOffsetFor(head.pose, camera.rotation.y)
    head.aligned = true
  }
  turnHead(head.offsetRad, head.pose)
  eulerOf(head.pose, head.euler)
  camera.rotation.set(head.euler.x, head.euler.y, head.euler.z)
}

interface CardboardRig {
  follow(options: CardboardViewOptions, head: HeadState): void
  dispose(): void
}

/**
 * A câmera do óculos e o retículo. Criados ao entrar e descartados ao sair: o
 * rig vr tem duas câmeras e dois pós-processos de distorção, e quem nunca põe o
 * óculos não paga por eles.
 */
function createRig(options: CardboardViewOptions): CardboardRig {
  const { scene, worldCamera } = options
  const metrics = VRCameraMetrics.GetDefault()
  const baseEyeToScreen = metrics.eyeToScreenDistance
  const camera = createEyeCamera(options, metrics)
  scene.activeCameras = [camera]
  scene.activeCamera = camera
  const reticle = createReticle(scene, camera.layerMask)
  return {
    follow: (current, head) => {
      camera.position.copyFrom(worldCamera.position)
      // a pose da cabeça, e não a rotação da câmera do jogo: o coice gira aquela
      // (e a arma, presa nela, recua), mas a cabeça de quem está de óculos não.
      camera.rotationQuaternion?.set(head.pose.x, head.pose.y, head.pose.z, head.pose.w)
      placeReticle(reticle, camera)
      const magnification = headsetMagnification(current.baseFovDeg(), current.currentFovDeg())
      metrics.eyeToScreenDistance = eyeToScreenFor(baseEyeToScreen, magnification)
    },
    dispose: () => {
      reticle.dispose()
      camera.dispose()
    },
  }
}

/**
 * A câmera estéreo, sem a entrada de orientação do babylon (que espelha o
 * mundo) e enxergando a camada da arma. A arma vive numa camada que a câmera
 * do mundo não vê, e quem a desenhava era a câmera da arma; no óculos não há
 * segunda câmera, porque o rig vr distorce cada câmera por conta própria e dois
 * rigs empilhados não compõem.
 */
function createEyeCamera(
  options: CardboardViewOptions,
  metrics: VRCameraMetrics,
): VRDeviceOrientationFreeCamera {
  const { worldCamera } = options
  const position = worldCamera.position.clone()
  const camera = new VRDeviceOrientationFreeCamera(
    'cardboard',
    position,
    options.scene,
    true,
    metrics,
  )
  camera.inputs.clear()
  camera.rotationQuaternion = new Quaternion()
  camera.minZ = worldCamera.minZ
  camera.maxZ = worldCamera.maxZ
  const layers = WORLD_LAYER | VIEWMODEL_LAYER
  camera.layerMask = layers
  for (const eye of camera.rigCameras) eye.layerMask = layers
  return camera
}

function createReticle(scene: Scene, layers: number): Mesh {
  const reticle = CreateDisc(
    'cardboard-reticle',
    { radius: RETICLE_RADIUS_M * RETICLE_DISTANCE_M },
    scene,
  )
  const material = new StandardMaterial('cardboard-reticle', scene)
  material.disableLighting = true
  material.emissiveColor = Color3.FromHexString('#ff2a3c')
  material.disableDepthWrite = true
  reticle.material = material
  reticle.rotationQuaternion = new Quaternion()
  reticle.layerMask = layers
  reticle.isPickable = false
  return reticle
}

const RETICLE_AHEAD = new Vector3(0, 0, RETICLE_DISTANCE_M)
const reticleOffset = new Vector3()

/**
 * O retículo vai para a frente da cabeça a cada quadro, e não como filho da
 * câmera do óculos: quem desenha são as câmeras dos olhos, e a matriz da câmera
 * pai do rig não é recalculada — filho dela ficava parado na origem (07/10).
 */
function placeReticle(reticle: Mesh, camera: VRDeviceOrientationFreeCamera): void {
  const pose = camera.rotationQuaternion
  if (!pose) return
  reticle.renderingGroupId = RETICLE_GROUP
  reticle.rotationQuaternion?.copyFrom(pose)
  RETICLE_AHEAD.rotateByQuaternionToRef(pose, reticleOffset)
  reticle.position.copyFrom(camera.position).addInPlace(reticleOffset)
}

function restoreDesktopCameras(options: CardboardViewOptions): void {
  options.scene.activeCameras = [options.worldCamera, options.viewmodelCamera]
  options.scene.activeCamera = options.worldCamera
}

/**
 * Tela cheia, paisagem travada e tela acesa: o que o celular dentro do óculos
 * pede, e que o navegador só concede dentro de um gesto e com a aba visível.
 * Sem giroscópio (`?vr=1` no desktop), o ponteiro trava, para o mouse olhar.
 *
 * **Tudo é tentativa.** Recusa vira log estruturado, e o jogador entra assim
 * mesmo: na feira, um óculos com a barra do navegador aparecendo ainda joga, e
 * um botão que não entra é jogo morto.
 */
async function goFullscreenLandscape(canvas: HTMLCanvasElement, hasSensor: boolean): Promise<void> {
  await attempt('cardboard-fullscreen-refused', () =>
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }),
  )
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>
  }
  await attempt('cardboard-orientation-lock-refused', () => orientation.lock?.('landscape'))
  await attempt('cardboard-wake-lock-refused', () => navigator.wakeLock?.request('screen'))
  if (!hasSensor) await attempt('cardboard-pointer-lock-refused', () => canvas.requestPointerLock())
}

async function attempt(event: string, request: () => Promise<unknown> | undefined): Promise<void> {
  try {
    await request()
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.warn(JSON.stringify({ event, message }))
  }
}

interface OrientationSensor {
  /** Já chegou alguma amostra de verdade do giroscópio. */
  available(): boolean
  latest(): DeviceAngles | undefined
  dispose(): void
}

/**
 * Guarda a última leitura do `deviceorientation`. O evento chega no ritmo do
 * sensor, e a câmera é escrita no ritmo do quadro: quem lê pega a mais recente.
 * Um evento sem `alpha` é de aparelho sem giroscópio, e não conta.
 */
function trackDeviceOrientation(): OrientationSensor {
  // um objeto só, reescrito a cada evento: o quadro lê sem alocar.
  const latest = { alphaDeg: 0, betaDeg: 0, gammaDeg: 0, screenDeg: 0 }
  let seen = false
  const onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.alpha === null || event.beta === null || event.gamma === null) return
    latest.alphaDeg = event.alpha
    latest.betaDeg = event.beta
    latest.gammaDeg = event.gamma
    seen = true
  }
  window.addEventListener('deviceorientation', onOrientation)
  return {
    available: () => seen,
    latest: () => {
      if (!seen) return undefined
      latest.screenDeg = screen.orientation?.angle ?? 0
      return latest
    },
    dispose: () => window.removeEventListener('deviceorientation', onOrientation),
  }
}
