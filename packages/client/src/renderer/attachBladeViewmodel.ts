import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Quaternion } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import { MELEE_WEAPONS, type MeleeWeapon } from '@shobu/core'
import type { WeaponFinish } from '../loadout/weaponFinishes.ts'
import { bladeGroupName, clipDurationMismatches } from './bladeClips.ts'
import {
  type AnimationGroupLike,
  createSkeletalMixer,
  mixSkeletalClip,
  NODE_STRIDE,
  readSkeletalLibrary,
  type SkeletalLibrary,
  type SkeletalMixer,
} from './bladeSkeleton.ts'
import { type BladeTrailMesh, createBladeTrailMesh, type TrailAnchors } from './bladeTrailMesh.ts'
import { driveViewmodelRig } from './driveViewmodelRig.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import { swayRigOf } from './loadSniperViewmodel.ts'
import { type BladeColors, paintBlade } from './paintWeapons.ts'
import type { ViewBob } from './viewBob.ts'
import { maskAsViewmodel } from './viewmodelCamera.ts'
import { BLADE_PIVOT_M, BLADE_PLACEMENTS, type ViewmodelStage } from './viewmodelStage.ts'
import { createViewmodelSway } from './viewmodelSway.ts'
import { createWeaponRecoil } from './weaponRecoil.ts'

/** Servidos de `public/`, gerados por `scripts/blender/melee_blades.py`. */
const BLADE_URLS: Readonly<Record<MeleeWeapon, string>> = {
  katana: '/assets/viewmodel/katana.glb',
  knife: '/assets/viewmodel/knife.glb',
}

/**
 * O meio e a ponta de cada lâmina, no espaço da malha dela (o glTF leva o -y
 * do blender, para onde a lâmina aponta, a +z): de onde a fita do rastro sai.
 * Medidos em `melee_blades.py` — a katana vai de 6 a 76 cm do punho, a faca
 * de 5,5 a 22,5 cm.
 */
const TRAIL_ANCHORS: Readonly<Record<MeleeWeapon, TrailAnchors>> = {
  katana: { innerM: [0, 0, 0.3], tipM: [0, 0.02, 0.75] },
  knife: { innerM: [0, 0, 0.08], tipM: [0, 0, 0.22] },
}

export interface BladeViewmodelOptions {
  readonly camera: UniversalCamera
  /** O palco do quadro, já posado por quem registrou o passo antes deste. */
  readonly stage: ViewmodelStage
  readonly bob: ViewBob
  readonly motion: boolean
  /** O acabamento de cada lâmina, lido por quadro: o menu troca entre partidas. */
  readonly finish: (weapon: MeleeWeapon) => WeaponFinish
  readonly body: () => { readonly verticalSpeedMps: number; readonly sliding: boolean }
  readonly frameDeltaMs: () => number
  /** A arma entrou na camada da câmera dela: a lista de candidatos tem que ser refeita. */
  readonly onMasked: () => void
}

/**
 * A katana e a faca em primeira pessoa (ADR 0021). Adapter: baixa as duas,
 * prende cada uma num rig no olho, e por quadro mostra a que o palco pede,
 * tocando o clipe dele nos ossos dos braços (`bladeSkeleton.ts`) com o
 * rastro do corte por cima. O balanço é o mesmo da sniper
 * (`driveViewmodelRig`), com sway próprio e sem coice.
 *
 * ```ts
 * attachBladeViewmodel(scene, { camera, stage, bob, motion, finish, body, frameDeltaMs, onMasked })
 * ```
 */
export function attachBladeViewmodel(scene: Scene, options: BladeViewmodelOptions): void {
  const rig = new TransformNode('blade-rig', scene)
  rig.parent = options.camera
  rig.setEnabled(false)
  const trail = createBladeTrailMesh(scene, rig)
  const blades: Partial<Record<MeleeWeapon, LoadedBlade>> = {}
  for (const weapon of MELEE_WEAPONS) {
    loadBlade(scene, weapon, rig)
      .then((loaded) => {
        blades[weapon] = loaded
        options.onMasked()
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason)
        console.error(JSON.stringify({ event: 'blade-viewmodel-load-failed', weapon, message }))
      })
  }
  driveBladeRig(scene, rig, options)
  scene.onBeforeRenderObservable.add(() => showBlade(rig, blades, trail, options))
}

interface LoadedBlade {
  readonly root: AbstractMesh
  readonly meshes: readonly AbstractMesh[]
  readonly origin: BladeColors
  /** A malha da lâmina: o quadro dela é o da lâmina, de onde o rastro sai. */
  readonly blade: AbstractMesh | undefined
  readonly library: SkeletalLibrary<TransformNode>
  readonly mixer: SkeletalMixer
  painted: WeaponFinish | undefined
  /** Ainda não desenhada: o primeiro desenho sobe o programa e os buffers para a gpu. */
  cold: boolean
}

async function loadBlade(
  scene: Scene,
  weapon: MeleeWeapon,
  rig: TransformNode,
): Promise<LoadedBlade> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(BLADE_URLS[weapon], scene)
  const root = loaded.meshes[0]
  if (!root) throw new Error(`${BLADE_URLS[weapon]} carregou 0 malhas; esperado o root do glb`)
  root.parent = rig
  root.setEnabled(false)
  maskAsViewmodel(loaded.meshes)
  const origin = originColors(loaded.meshes)
  for (const mesh of loaded.meshes) flattenPbrMaterial(mesh, scene, 'blade')
  const library = readClips(weapon, loaded.animationGroups)
  return {
    root,
    meshes: loaded.meshes,
    origin,
    blade: loaded.meshes.find((mesh) => mesh.material?.name.endsWith('M_Lamina') === true),
    library,
    mixer: createSkeletalMixer(restPose(library)),
    painted: undefined,
    cold: true,
  }
}

/**
 * Os grupos do glb em tabelas. O loader começa a tocar o primeiro grupo
 * sozinho; aqui quem toca é o diretor, à mão (`bladeSkeleton.ts`).
 */
function readClips(
  weapon: MeleeWeapon,
  groups: readonly AnimationGroup[],
): SkeletalLibrary<TransformNode> {
  for (const group of groups) group.stop()
  const library = readSkeletalLibrary(
    groups as unknown as readonly AnimationGroupLike<TransformNode>[],
  )
  reportMismatches(weapon, library)
  return library
}

/** O glb e `bladeClips.ts` têm de concordar: divergência é log, não queda da arena. */
function reportMismatches(weapon: MeleeWeapon, library: SkeletalLibrary<TransformNode>): void {
  const durations = new Map<string, number>()
  for (const [name, clip] of library.clips) durations.set(name, clip.durationS)
  const problems = clipDurationMismatches(weapon, durations)
  if (problems.length === 0) return
  console.error(JSON.stringify({ event: 'blade-clips-mismatch', weapon, problems }))
}

/** O TRS que o glb trouxe para cada osso animado: o ponto de partida da mistura. */
function restPose(library: SkeletalLibrary<TransformNode>): Float32Array {
  const rest = new Float32Array(library.nodes.length * NODE_STRIDE)
  library.nodes.forEach((node, index) => {
    node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation)
    const q = node.rotationQuaternion
    rest.set([q.x, q.y, q.z, q.w, node.position.x, node.position.y, node.position.z], index * 7)
  })
  return rest
}

/** As cores do glb antes de achatar: é para onde o acabamento padrão volta. */
function originColors(meshes: readonly AbstractMesh[]): BladeColors {
  const colorOf = (name: string): readonly [number, number, number] => {
    const material = meshes.find((mesh) => mesh.material?.name === name)?.material as
      | { albedoColor?: { r: number; g: number; b: number } }
      | undefined
    const color = material?.albedoColor
    return color ? [color.r, color.g, color.b] : [1, 1, 1]
  }
  return { blade: colorOf('M_Lamina'), glow: colorOf('M_Fio') }
}

function driveBladeRig(scene: Scene, rig: TransformNode, options: BladeViewmodelOptions): void {
  const { stage } = options
  driveViewmodelRig(scene, {
    rig: swayRigOf(rig),
    aim: options.camera,
    body: options.body,
    placement: () => BLADE_PLACEMENTS[stage.shot.weapon],
    sway: createViewmodelSway(options.motion),
    recoil: createWeaponRecoil(false),
    bob: options.bob,
    pose: () => stage.bladePose,
    gripM: BLADE_PIVOT_M,
    frameDeltaMs: options.frameDeltaMs,
  })
}

/** Só muda a engine quando muda o que aparece: ligar e desligar nó por quadro é desperdício. */
function showBlade(
  rig: TransformNode,
  blades: Partial<Record<MeleeWeapon, LoadedBlade>>,
  trail: BladeTrailMesh,
  options: BladeViewmodelOptions,
): void {
  const { shot } = options.stage
  if (warmUpCold(rig, blades, trail)) return
  const shown = blades[shot.weapon]
  const visible = shot.bladeVisible && shown !== undefined
  // a lâmina só tem matriz de mundo fresca se foi desenhada no quadro passado:
  // a primeira amostra depois de aparecer ligava o arco a uma pose velha.
  const drawnLastFrame = visible && rig.isEnabled() && shown.root.isEnabled(false)
  if (rig.isEnabled() !== visible) rig.setEnabled(visible)
  dressBlades(blades, options)
  trail.update(drawnLastFrame ? shown?.blade : undefined, TRAIL_ANCHORS[shot.weapon], shot.trail)
  if (!visible || !shown || !shot.clip) return
  trail.setColor(options.finish(shot.weapon).glow ?? shown.origin.glow)
  playClip(shown, shot.weapon, options)
}

/**
 * A lâmina que acabou de chegar é desenhada um quadro, na guarda e com o
 * rastro: o jogador está no menu de boot, e o primeiro golpe da partida não
 * paga a compilação dos materiais dela. Foi o que a captura de 12/10 mostrou —
 * o primeiro golpe rápido travava 130 ms e a katana só aparecia no fim.
 */
function warmUpCold(
  rig: TransformNode,
  blades: Partial<Record<MeleeWeapon, LoadedBlade>>,
  trail: BladeTrailMesh,
): boolean {
  for (let index = 0; index < MELEE_WEAPONS.length; index += 1) {
    const blade = blades[MELEE_WEAPONS[index] as MeleeWeapon]
    if (!blade?.cold) continue
    blade.cold = false
    rig.setEnabled(true)
    blade.root.setEnabled(true)
    trail.warmUp()
    return true
  }
  return false
}

function dressBlades(
  blades: Partial<Record<MeleeWeapon, LoadedBlade>>,
  options: BladeViewmodelOptions,
): void {
  const { weapon: shown } = options.stage.shot
  // laço por índice: `for...of` num `Map` alocaria um par por entrada a cada quadro.
  for (let index = 0; index < MELEE_WEAPONS.length; index += 1) {
    const weapon = MELEE_WEAPONS[index] as MeleeWeapon
    const blade = blades[weapon]
    if (blade) dressBlade(blade, weapon === shown, options.finish(weapon))
  }
}

function playClip(blade: LoadedBlade, weapon: MeleeWeapon, options: BladeViewmodelOptions): void {
  const { shot } = options.stage
  const clip = blade.library.clips.get(bladeGroupName(weapon, shot.clip ?? 'idle'))
  if (!clip) return
  const frameS = options.frameDeltaMs() / 1000
  const pose = mixSkeletalClip(blade.mixer, clip, shot.clipS, shot.clipChanges, frameS)
  writePose(blade.library, pose)
}

function writePose(library: SkeletalLibrary<TransformNode>, pose: Float32Array): void {
  const { nodes, movesPosition } = library
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index] as TransformNode
    const at = index * NODE_STRIDE
    node.rotationQuaternion?.set(
      pose[at] as number,
      pose[at + 1] as number,
      pose[at + 2] as number,
      pose[at + 3] as number,
    )
    if (movesPosition[index]) {
      node.position.set(pose[at + 4] as number, pose[at + 5] as number, pose[at + 6] as number)
    }
  }
}

function dressBlade(blade: LoadedBlade, shown: boolean, finish: WeaponFinish): void {
  if (blade.root.isEnabled(false) !== shown) blade.root.setEnabled(shown)
  if (blade.painted === finish) return
  paintBlade(blade.meshes, finish, blade.origin)
  blade.painted = finish
}
