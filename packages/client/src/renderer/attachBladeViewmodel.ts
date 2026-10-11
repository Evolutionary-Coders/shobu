import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import { MELEE_WEAPONS, type MeleeWeapon } from '@shobu/core'
import type { WeaponFinish } from '../loadout/weaponFinishes.ts'
import { driveViewmodelRig } from './driveViewmodelRig.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import { type BladeColors, paintBlade } from './paintWeapons.ts'
import type { ViewBob } from './viewBob.ts'
import { maskAsViewmodel } from './viewmodelCamera.ts'
import { BLADE_PLACEMENTS, type ViewmodelStage } from './viewmodelStage.ts'
import { createViewmodelSway } from './viewmodelSway.ts'
import { createWeaponRecoil } from './weaponRecoil.ts'

/** Servidos de `public/`, gerados por `scripts/blender/melee_blades.py`. */
const BLADE_URLS: Readonly<Record<MeleeWeapon, string>> = {
  katana: '/assets/viewmodel/katana.glb',
  knife: '/assets/viewmodel/knife.glb',
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
 * A katana e a faca em primeira pessoa (ADR 0021). Adapter: baixa as duas
 * (são ~95 kB juntas), prende cada uma num rig na câmera, e por quadro mostra
 * a que o palco pede, na pose que ele pede. O balanço é o mesmo da sniper
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
  scene.onBeforeRenderObservable.add(() => showBlade(rig, blades, options))
}

interface LoadedBlade {
  readonly root: AbstractMesh
  readonly meshes: readonly AbstractMesh[]
  readonly origin: BladeColors
  painted: WeaponFinish | undefined
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
  return { root, meshes: loaded.meshes, origin, painted: undefined }
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
    rig,
    aim: options.camera,
    body: options.body,
    placement: () => BLADE_PLACEMENTS[stage.shot.weapon],
    sway: createViewmodelSway(options.motion),
    recoil: createWeaponRecoil(false),
    bob: options.bob,
    pose: () => stage.bladePose,
    frameDeltaMs: options.frameDeltaMs,
  })
}

/** Só muda a engine quando muda o que aparece: ligar e desligar nó por quadro é desperdício. */
function showBlade(
  rig: TransformNode,
  blades: Partial<Record<MeleeWeapon, LoadedBlade>>,
  options: BladeViewmodelOptions,
): void {
  const { shot } = options.stage
  if (rig.isEnabled() !== shot.bladeVisible) rig.setEnabled(shot.bladeVisible)
  // laço por índice: `for...of` num `Map` alocaria um par por entrada a cada quadro.
  for (let index = 0; index < MELEE_WEAPONS.length; index += 1) {
    const weapon = MELEE_WEAPONS[index] as MeleeWeapon
    const blade = blades[weapon]
    if (blade) dressBlade(blade, weapon === shot.weapon, options.finish(weapon))
  }
}

function dressBlade(blade: LoadedBlade, shown: boolean, finish: WeaponFinish): void {
  if (blade.root.isEnabled(false) !== shown) blade.root.setEnabled(shown)
  if (blade.painted === finish) return
  paintBlade(blade.meshes, finish, blade.origin)
  blade.painted = finish
}
