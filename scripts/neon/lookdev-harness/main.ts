import { Camera } from '@babylonjs/core/Cameras/camera'
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Scene } from '@babylonjs/core/scene'
import { type ArenaMap, arenaMapById } from '../../../packages/client/src/arena/arenaCatalog.ts'
import { animateBillboards } from '../../../packages/client/src/renderer/animateBillboards.ts'
import { fogArena } from '../../../packages/client/src/renderer/arenaFog.ts'
import { lightArena } from '../../../packages/client/src/renderer/arenaLighting.ts'
import { coverWithDaySky } from '../../../packages/client/src/renderer/arenaSky.ts'
import { attachCameraRain } from '../../../packages/client/src/renderer/cameraRain.ts'
import { loadArenaScenery } from '../../../packages/client/src/renderer/loadArenaScenery.ts'
import { glowNeon } from '../../../packages/client/src/renderer/neonGlow.ts'
import {
  attachPuddleMirror,
  setPuddleMirror,
} from '../../../packages/client/src/renderer/puddleMirror.ts'
import { qualityLevelFor } from '../../../packages/client/src/settings/qualityPreset.ts'

/**
 * A página que o `capture-lookdev.mjs` fotografa: um mapa do catálogo com o
 * código de cenário do jogo — a mesma carga, névoa, céu, chuva, telão, halo e
 * poça. `?arena=neon-kaido&view=kaido&quality=performance`.
 *
 * `?arena=lookdev` é o recorte da fase 1, sem layout (impressão digital do
 * blockout vazio), com a noite do Neon-kaidō.
 */
const LOOKDEV_MAP: ArenaMap = {
  ...arenaMapById('neon-kaido'),
  id: 'lookdev',
  blockout: [],
  sceneryManifest: 'neon-lookdev.json',
}

type Pose = readonly [Vector3, Vector3]

/** As vistas, em coordenada do jogo: olho a 1,8 m do piso e o alvo. `topo` é a planta vista de cima. */
const VIEWS: Record<string, Pose> = {
  rua: [new Vector3(1, 1.8, -19), new Vector3(0, 9.5, 60)],
  passarela: [new Vector3(-1.5, 7.8, 4.5), new Vector3(1.5, 7, 60)],
  telhado: [new Vector3(-9, 14.8, -3), new Vector3(1, 11, 80)],
  beco: [new Vector3(-30, 1.8, -8.6), new Vector3(10, 4.5, -8.4)],
  kaido: [new Vector3(1, 1.8, -33), new Vector3(0, 9, 60)],
  roji: [new Vector3(-22, 1.8, -8.5), new Vector3(10, 4, -8.5)],
  ura: [new Vector3(-24.8, 1.8, -31), new Vector3(-24.8, 4, 40)],
  hiroba: [new Vector3(-7.5, 1.8, -34), new Vector3(-24, 5, -24)],
  engawa: [new Vector3(-5.5, 7.8, -21), new Vector3(-3, 7, 40)],
  terraco: [new Vector3(-9, 14.8, -4), new Vector3(2, 11, 80)],
  ponte: [new Vector3(0, 14.8, 0), new Vector3(0, 10, 80)],
  fundo: [new Vector3(-31, 7.8, -15), new Vector3(-29, 8, 30)],
  topo: [new Vector3(0, 120, 0.01), new Vector3(0, 0, 0)],
}

interface LookdevReadout {
  ready: boolean
  error?: string
  drawCalls?: number
  activeTriangles?: number
  totalTriangles?: number
  meshes?: number
  materials?: number
  textures?: number
  frameMs?: number
}

declare global {
  interface Window {
    lookdev: LookdevReadout
  }
}

window.lookdev = { ready: false }
const params = new URLSearchParams(window.location.search)
const quality = params.get('quality') ?? 'performance'
const arenaId = params.get('arena') ?? 'neon-kaido'

async function run(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#lookdev')
  if (!canvas) throw new Error("querySelector('#lookdev') não achou o canvas")
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
  const level = qualityLevelFor(quality === 'quality' ? 'quality' : 'performance', 1)
  engine.setHardwareScalingLevel(1 / level.renderScale)
  document.documentElement.dataset.grading = level.grading ? 'on' : 'off'
  const map = arenaId === 'lookdev' ? LOOKDEV_MAP : arenaMapById(arenaId)
  const scene = new Scene(engine)
  const camera = nightScene(scene, map)
  const neons = await loadArenaScenery(scene, map.blockout, map.sceneryManifest, () => {})
  if (neons) dressNight(scene, camera, neons, level.neonGlow, level.puddleReflections)
  const instrumentation = new SceneInstrumentation(scene)
  instrumentation.captureFrameTime = true
  engine.runRenderLoop(() => scene.render())
  await scene.whenReadyAsync()
  await settle(90)
  window.lookdev = readout(scene, instrumentation)
}

/** Luz, névoa, céu, olho e chuva do mapa — a planta de cima sai sem névoa e sem chuva. */
function nightScene(scene: Scene, map: ArenaMap): UniversalCamera {
  const atmosphere = map.atmosphere()
  const view = params.get('view') ?? 'kaido'
  lightArena(scene, atmosphere.lighting)
  fogArena(scene, atmosphere.fog)
  coverWithDaySky(scene, atmosphere.sky, 2000)
  const camera = placeCamera(scene, view)
  if (view === 'topo') {
    scene.fogEnabled = false
    return camera
  }
  if (atmosphere.rain) attachCameraRain(scene, camera, atmosphere.rain)
  return camera
}

/** O que o jogo faz depois de carregar a arte (`dressArenaScenery.ts`), sem o greybox. */
function dressNight(
  scene: Scene,
  camera: Camera,
  neons: readonly AbstractMesh[],
  glow: boolean,
  puddles: boolean,
): void {
  animateBillboards(scene)
  attachPuddleMirror(scene, neons)
  setPuddleMirror(scene, puddles)
  if (glow) glowNeon(scene, camera, neons, [])
}

function placeCamera(scene: Scene, view: string): UniversalCamera {
  const pose = VIEWS[view]
  if (!pose) throw new Error(`view ${view} desconhecida; esperado ${Object.keys(VIEWS).join(', ')}`)
  const camera = new UniversalCamera('olho', pose[0].clone(), scene)
  camera.setTarget(pose[1])
  // o fov do jogo é horizontal (`firstPersonViewer.ts`), 90° no padrão; a
  // planta de cima fecha para caber a área de jogo.
  camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED
  camera.fov = view === 'topo' ? Math.PI / 2.4 : Math.PI / 2
  camera.minZ = 0.05
  camera.maxZ = 2000
  return camera
}

function settle(frames: number): Promise<void> {
  return new Promise((resolve) => {
    let left = frames
    const tick = (): void => {
      left -= 1
      if (left <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function readout(scene: Scene, instrumentation: SceneInstrumentation): LookdevReadout {
  return {
    ready: true,
    drawCalls: instrumentation.drawCallsCounter.current,
    activeTriangles: scene.getActiveIndices() / 3,
    totalTriangles: scene.meshes.reduce((sum, mesh) => sum + (mesh.getTotalIndices() || 0) / 3, 0),
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    frameMs: instrumentation.frameTimeCounter.lastSecAverage,
  }
}

run().catch((reason: unknown) => {
  window.lookdev = { ready: true, error: reason instanceof Error ? reason.message : String(reason) }
})
