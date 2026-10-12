import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { CompetitorAccent } from '../character/competitorPalette.ts'
import type { HumanSkinId } from '../character/humanSkins.ts'
import type { ClipSelection } from '../character/thirdPersonClips.ts'
import { PODIUM_FOV_DEG, type PodiumVec3, podiumShot } from '../matchEnd/podiumShot.ts'
import type { CompetitorAvatar, CompetitorLibrary } from './loadCompetitorAvatar.ts'

/**
 * O pódio do MVP: o corpo do melhor jogador, com a skin dele, de pé num disco
 * de neon no céu sobre o mapa, e a câmera do jogo cortando para lá durante a
 * tela de MVP. **Nada de cena nova**: é a mesma cena, a mesma câmera, e um
 * avatar a mais saído da mesma biblioteca dos bots (`loadCompetitorAvatar.ts`).
 *
 * O custo fica no carregamento, e não na tela: `raise` instancia o corpo de
 * cada skin da sala e **compila os shaders antes** (`forceCompilationAsync`),
 * junto com os bots, dentro da barra do boot; `show` só liga o que já está
 * pronto. Medido em 12/10: subir o corpo na hora em que o tempo acabava custava
 * um quadro de 500 ms no congelamento. Cada corpo fica guardado, desligado e
 * com o clipe pausado — desligado, não custa quadro nenhum.
 *
 * No óculos o pódio não aparece: a câmera é a cabeça do jogador, e cortá-la é
 * enjoo garantido (ADR 0012). Lá o MVP é o cartão do visor, com o retrato.
 */
export interface MvpPodium {
  /**
   * Sobe o corpo de cada skin da sala, desligado e compilado. Devolve quando
   * todos subiram (ou falharam: sem corpo, a tela fica com o retrato).
   */
  raise(looks: readonly PodiumLook[]): Promise<void>
  /** Corta a câmera para o pódio, com o corpo da skin pedida. */
  show(skin: HumanSkinId): void
  /** A câmera volta ao jogador. */
  hide(): void
}

export interface MvpPodiumOptions {
  readonly camera: UniversalCamera
  /** A câmera da arma: sai de cena no pódio, senão a sniper aparece na frente do MVP. */
  readonly viewmodelCamera: UniversalCamera
  readonly competitors: CompetitorLibrary
  readonly feetM: PodiumVec3
  readonly capsuleHeightM: number
  readonly headsetActive: () => boolean
  readonly frameDeltaMs: () => number
}

/** A skin de um corpo do pódio, e o acento que ele tem na arena. */
export interface PodiumLook {
  readonly skin: HumanSkinId
  readonly accent: CompetitorAccent
}

/** Parado e de mãos vazias: o clipe de quem já ganhou. */
const MVP_POSE: ClipSelection = { clip: 'Idle_Loop', loop: true, speedRatio: 1 }

/**
 * ```ts
 * const podium = createMvpPodium(scene, { camera, viewmodelCamera, competitors, feetM, ... })
 * await podium.raise([{ skin: 'vex', accent: 'lime' }])
 * podium.show('vex')
 * ```
 */
export function createMvpPodium(scene: Scene, options: MvpPodiumOptions): MvpPodium {
  const stage = buildStage(scene, options.feetM)
  const bodies = new Map<HumanSkinId, Promise<CompetitorAvatar | undefined>>()
  const shot: PodiumCut = { active: false, skin: undefined, body: undefined, elapsedS: 0 }
  followTheCut(scene, options, shot)
  return {
    raise: async (looks) => {
      for (const look of looks) {
        if (!bodies.has(look.skin)) bodies.set(look.skin, raiseBody(scene, options, stage, look))
      }
      await Promise.all(bodies.values())
    },
    show: (skin) => {
      if (options.headsetActive()) return
      Object.assign(shot, { active: true, skin, body: undefined, elapsedS: 0 })
      cutTo(scene, options, stage, true)
      void bodies.get(skin)?.then((body) => putOnStage(shot, skin, body))
    },
    hide: () => {
      if (!shot.active) return
      shot.active = false
      shot.body = undefined
      cutTo(scene, options, stage, false)
      for (const body of bodies.values()) void body.then((avatar) => avatar && pose(avatar, false))
    },
  }
}

/** O corpo chegou: sobe ao pódio, se o corte ainda é dele. */
function putOnStage(shot: PodiumCut, skin: HumanSkinId, body: CompetitorAvatar | undefined): void {
  if (!body || !shot.active || shot.skin !== skin) return
  shot.body = body
  pose(body, true)
}

interface PodiumCut {
  active: boolean
  skin: HumanSkinId | undefined
  /** O corpo no pódio, quando ele já subiu. */
  body: CompetitorAvatar | undefined
  elapsedS: number
}

/**
 * Por quadro, com o corte no ar: a câmera no plano do pódio, chegando devagar.
 *
 * Na hora de desenhar o mundo, e não antes: o olho e a lente de fov escrevem
 * na câmera no `onBeforeRender`, e o corte tem que vir depois deles sem
 * depender da ordem em que foram registrados. O babylon já calculou a matriz
 * antes deste observável (a mesma armadilha de `followViewmodelCamera`), e
 * refazê-la é o que faz o corte valer neste quadro, culling incluído.
 */
function followTheCut(scene: Scene, options: MvpPodiumOptions, shot: PodiumCut): void {
  scene.onBeforeRenderObservable.add(() => {
    if (!shot.active) return
    const frameS = options.frameDeltaMs() / 1000
    shot.elapsedS += frameS
    // o animador anda o crossfade a cada chamada: sem ela, o corpo ficaria
    // parado no meio da troca para o clipe do MVP.
    shot.body?.animator.play(MVP_POSE, frameS)
  })
  scene.onBeforeCameraRenderObservable.add((rendering) => {
    if (!shot.active || rendering !== options.camera) return
    aimCamera(options, shot.elapsedS)
    scene.updateTransformMatrix()
  })
}

interface Stage {
  readonly meshes: readonly Mesh[]
  readonly lights: readonly PointLight[]
  /** Para onde a câmera olhava antes do corte. */
  readonly savedAim: Vector3
}

/**
 * O disco escuro e o anel de neon vermelho, e duas luzes que só tocam o
 * pódio (`includedOnlyMeshes`): uma luz nova que tocasse a arena mudaria o
 * shader de todo material dela, e cada um recompilaria no primeiro quadro.
 */
function buildStage(scene: Scene, feetM: PodiumVec3): Stage {
  const [x, y, z] = feetM
  const disc = CreateCylinder('mvp-podium', { diameter: 2.4, height: 0.3, tessellation: 40 }, scene)
  disc.position.set(x, y - 0.15, z)
  disc.material = flatMaterial(scene, 'mvp-podium', new Color3(0.04, 0.04, 0.06))
  const ring = CreateTorus(
    'mvp-podium-ring',
    { diameter: 2.5, thickness: 0.06, tessellation: 48 },
    scene,
  )
  ring.position.set(x, y + 0.02, z)
  ring.material = flatMaterial(scene, 'mvp-podium-ring', Color3.FromHexString('#ff2a3c'))
  const lights = [
    podiumLight(scene, 'mvp-rim', [x - 1.6, y + 2.8, z - 1.4], '#ff2a3c', 40),
    podiumLight(scene, 'mvp-key', [x + 1.4, y + 2.2, z + 2.6], '#ffe6c8', 14),
  ]
  const meshes = [disc, ring]
  for (const mesh of meshes) {
    mesh.isPickable = false
    mesh.setEnabled(false)
  }
  return { meshes, lights, savedAim: new Vector3() }
}

/** Sem luz de cena: o disco e o anel são a cor que têm, como um letreiro. */
function flatMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.disableLighting = true
  material.emissiveColor = color
  return material
}

function podiumLight(
  scene: Scene,
  name: string,
  atM: PodiumVec3,
  hex: string,
  intensity: number,
): PointLight {
  const light = new PointLight(name, new Vector3(...atM), scene)
  light.diffuse = Color3.FromHexString(hex)
  light.specular = Color3.Black()
  light.intensity = intensity
  light.range = 9
  // ninguém ainda: as malhas do corpo entram quando ele sobe. Lista vazia é
  // "toca todo mundo", então a luz nasce desligada.
  light.setEnabled(false)
  return light
}

/**
 * O corpo sobe desligado, virado para a câmera, com as duas luzes nele, e os
 * shaders compilados antes de qualquer quadro o desenhar.
 */
async function raiseBody(
  scene: Scene,
  options: MvpPodiumOptions,
  stage: Stage,
  look: { readonly skin: HumanSkinId; readonly accent: CompetitorAccent },
): Promise<CompetitorAvatar | undefined> {
  const [x, y, z] = options.feetM
  try {
    const body = await options.competitors.spawn({
      eyeM: [x, y + options.capsuleHeightM, z],
      capsuleHeightM: options.capsuleHeightM,
      ...look,
    })
    // de frente para +z, que é onde a câmera fica (`podiumShot`).
    body.root.lookAt(new Vector3(x, y, z + 1))
    const meshes = [body.root, ...body.root.getChildMeshes(false)]
    lightOnly(stage, [...stage.meshes, ...meshes])
    await precompile(scene, [...stage.meshes, ...meshes])
    pose(body, false)
    return body
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(JSON.stringify({ event: 'mvp-podium-load-failed', skin: look.skin, message }))
    return undefined
  }
}

/** As luzes do pódio passam a tocar também este corpo, e só o pódio. */
function lightOnly(stage: Stage, meshes: readonly AbstractMesh[]): void {
  for (const light of stage.lights) {
    for (const mesh of meshes)
      if (!light.includedOnlyMeshes.includes(mesh)) light.includedOnlyMeshes.push(mesh)
    light.setEnabled(true)
  }
}

async function precompile(scene: Scene, meshes: readonly AbstractMesh[]): Promise<void> {
  await Promise.all(
    meshes.map((mesh) => mesh.material?.forceCompilationAsync(mesh).catch(() => undefined)),
  )
  // um quadro de folga para a gpu terminar o que o compilador paralelo ainda devia.
  await new Promise<void>((settle) => scene.onAfterRenderObservable.addOnce(() => settle()))
}

/** Liga o corpo no clipe do MVP, ou o desliga com o clipe pausado. */
function pose(body: CompetitorAvatar, shown: boolean): void {
  body.root.setEnabled(shown)
  if (shown) resumeClips(body)
  else pauseClips(body)
}

/** O clipe que estava tocando volta de onde parou; o do MVP entra pelo animador, por quadro. */
function resumeClips(body: CompetitorAvatar): void {
  for (const group of body.clips) {
    if (group.isStarted && !group.isPlaying) group.play(true)
  }
}

/** Desligado, o corpo não gasta animação: os clipes param onde estão. */
function pauseClips(body: CompetitorAvatar): void {
  for (const group of body.clips) {
    if (group.isPlaying) group.pause()
  }
}

/**
 * A câmera da arma sai (ou volta), e o pódio liga (ou desliga). A mira de
 * antes do corte volta junto: sem isso, a partida seguinte começava olhando
 * para onde o pódio olhava — para baixo, numa parede.
 */
function cutTo(scene: Scene, options: MvpPodiumOptions, stage: Stage, podium: boolean): void {
  if (podium) stage.savedAim.copyFrom(options.camera.rotation)
  else options.camera.rotation.copyFrom(stage.savedAim)
  for (const mesh of stage.meshes) mesh.setEnabled(podium)
  // o fov de jogo volta sozinho: a lente o reescreve todo quadro (`firstPersonLens.ts`).
  scene.activeCameras = podium ? [options.camera] : [options.camera, options.viewmodelCamera]
}

const target = new Vector3()

/** Por cima do olho e da lente de fov do quadro: o corte vale até o `hide`. */
function aimCamera(options: MvpPodiumOptions, elapsedS: number): void {
  const { eyeM, targetM } = podiumShot(options.feetM, options.capsuleHeightM, elapsedS)
  options.camera.position.set(...eyeM)
  options.camera.setTarget(target.set(...targetM))
  options.camera.fov = verticalFovRad(
    PODIUM_FOV_DEG,
    options.camera.getEngine().getAspectRatio(options.camera),
  )
}

function verticalFovRad(horizontalDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((horizontalDeg * Math.PI) / 360) / aspect)
}
