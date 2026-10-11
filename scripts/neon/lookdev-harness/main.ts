import { Camera } from '@babylonjs/core/Cameras/camera'
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import type { ArenaFogSpec } from '../../../packages/client/src/arena/arenaFogSpec.ts'
import type { DaySkySpec } from '../../../packages/client/src/arena/daySky.ts'
import { fogArena } from '../../../packages/client/src/renderer/arenaFog.ts'
import { lightArena } from '../../../packages/client/src/renderer/arenaLighting.ts'
import type { ArenaLightingSpec } from '../../../packages/client/src/renderer/arenaLightingSpec.ts'
import { coverWithDaySky } from '../../../packages/client/src/renderer/arenaSky.ts'
import { loadArenaScenery } from '../../../packages/client/src/renderer/loadArenaScenery.ts'
import { glowNeon } from '../../../packages/client/src/renderer/neonGlow.ts'

/**
 * A página que o `capture-lookdev.mjs` fotografa: o recorte do blender com o
 * código de cenário do jogo. `?view=rua&quality=performance`.
 *
 * O céu, a névoa e a luz da noite estão aqui como **proposta** para a entrada
 * do mapa no catálogo (fase 2): a névoa respeita o piso de transmitância de
 * `arenaFogSpec.ts` (0,9 na diagonal de 99 m da área de 70 × 70).
 */
const NIGHT_SKY: DaySkySpec = {
  zenithRgb: [0.1, 0.11, 0.17],
  horizonRgb: [0.36, 0.38, 0.5],
  belowHorizonRgb: [0.12, 0.12, 0.16],
  sunTravelM: [0.3, -0.8, 0.4],
  sunRgb: [0.55, 0.65, 0.95],
  sizePx: [4, 128],
}

const NIGHT_FOG: ArenaFogSpec = { colorRgb: NIGHT_SKY.horizonRgb, density: 0.0032 }

const NIGHT_LIGHTING: ArenaLightingSpec = {
  key: { directionM: [0.3, -0.8, 0.4], intensity: 0.3, colorRgb: [0.6, 0.7, 1] },
  fill: { intensity: 0.4, skyRgb: [0.4, 0.45, 0.7], groundRgb: [0.6, 0.2, 0.5] },
  skyClearRgb: NIGHT_SKY.horizonRgb,
}

/** As mesmas quatro vistas de `neon_lookdev.py`: olho e alvo em coordenada do jogo. */
const VIEWS: Record<string, readonly [Vector3, Vector3]> = {
  rua: [new Vector3(1, 1.8, -19), new Vector3(0, 9.5, 60)],
  passarela: [new Vector3(-1.5, 7.8, 4.5), new Vector3(1.5, 7, 60)],
  telhado: [new Vector3(-9, 14.8, -3), new Vector3(1, 11, 80)],
  beco: [new Vector3(-30, 1.8, -8.6), new Vector3(10, 4.5, -8.4)],
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

async function run(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#lookdev')
  if (!canvas) throw new Error("querySelector('#lookdev') não achou o canvas")
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
  // DESEMPENHO desenha a 75% da resolução (`qualityPreset.ts`); QUALIDADE a 100%.
  engine.setHardwareScalingLevel(quality === 'performance' ? 1 / 0.75 : 1)
  document.documentElement.dataset.grading = quality === 'performance' ? 'off' : 'on'
  const scene = new Scene(engine)
  lightArena(scene, NIGHT_LIGHTING)
  fogArena(scene, NIGHT_FOG)
  coverWithDaySky(scene, NIGHT_SKY, 2000)
  const camera = placeCamera(scene, params.get('view') ?? 'rua')
  const neons = await loadArenaScenery(scene, [], 'neon-lookdev.json', () => {})
  if (quality !== 'performance' && neons) glowNeon(scene, camera, neons, [])
  const instrumentation = new SceneInstrumentation(scene)
  instrumentation.captureFrameTime = true
  engine.runRenderLoop(() => scene.render())
  await scene.whenReadyAsync()
  await settle(60)
  window.lookdev = readout(scene, instrumentation)
}

function placeCamera(scene: Scene, view: string): UniversalCamera {
  const pose = VIEWS[view]
  if (!pose) throw new Error(`view ${view} desconhecida; esperado ${Object.keys(VIEWS).join(', ')}`)
  const camera = new UniversalCamera('olho', pose[0].clone(), scene)
  camera.setTarget(pose[1])
  // o fov do jogo é horizontal (`firstPersonViewer.ts`), 90° no padrão.
  camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED
  camera.fov = Math.PI / 2
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
