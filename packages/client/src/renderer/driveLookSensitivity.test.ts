import type { CameraConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../settings/playerSettingsSpec.ts'
import { driveLookSensitivity, type LookTarget } from './driveLookSensitivity.ts'
import type { LensRenderLoop } from './firstPersonLens.ts'
import { BASE_PIXELS_PER_RADIAN } from './lookSensitivity.ts'
import { createScopeZoom, scopeBlend } from './scopeZoom.ts'

/** Laço de render de mentira: guarda os passos e roda todos quando mandado. */
class FakeRenderLoop implements LensRenderLoop {
  private readonly steps: Array<() => void> = []
  readonly onBeforeRenderObservable = {
    add: (step: () => void): void => {
      this.steps.push(step)
    },
  }
  renderFrame(): void {
    for (const step of this.steps) step()
  }
}

/** Câmera de mentira: só o campo que este módulo escreve. */
class FakeLookTarget implements LookTarget {
  angularSensibility = Number.NaN
}

const CAMERA: CameraConfig = { baseFovDeg: 90, scopedFovDeg: 22, scopeTransitionS: 0.12 }

function driveOnce(overrides: Partial<PlayerSettings> = {}, progress = 0) {
  const scene = new FakeRenderLoop()
  const camera = new FakeLookTarget()
  const zoom = createScopeZoom(true)
  zoom.progress = progress
  const settings = { ...DEFAULT_PLAYER_SETTINGS, ...overrides }
  driveLookSensitivity(scene, { camera, zoom, cameraConfig: CAMERA, settings: () => settings })
  scene.renderFrame()
  return camera.angularSensibility
}

describe('driveLookSensitivity', () => {
  it('não escreve nada antes do primeiro quadro', () => {
    const camera = new FakeLookTarget()
    const zoom = createScopeZoom(true)
    driveLookSensitivity(new FakeRenderLoop(), {
      camera,
      zoom,
      cameraConfig: CAMERA,
      settings: () => DEFAULT_PLAYER_SETTINGS,
    })
    expect(Number.isNaN(camera.angularSensibility)).toBe(true)
  })

  it('no quadril e no padrão escreve a linha de base', () => {
    expect(driveOnce()).toBeCloseTo(BASE_PIXELS_PER_RADIAN, 9)
  })

  it('com a luneta aberta o ganho cai junto com o campo', () => {
    expect(driveOnce({}, 1)).toBeGreaterThan(driveOnce({}, 0))
  })

  it('a rampa da luneta é a mesma que o fov usa, sem degrau', () => {
    const zoom = createScopeZoom(true)
    zoom.progress = 0.5
    expect(scopeBlend(zoom)).toBeCloseTo(0.5, 9)
  })

  /**
   * Lê as configurações **por quadro** e não na criação: mexer no menu com o
   * jogo já rodando tem que valer no quadro seguinte, sem recriar a câmera.
   */
  it('acompanha a preferência mudando entre dois quadros', () => {
    const scene = new FakeRenderLoop()
    const camera = new FakeLookTarget()
    let settings = DEFAULT_PLAYER_SETTINGS
    driveLookSensitivity(scene, {
      camera,
      zoom: createScopeZoom(true),
      cameraConfig: CAMERA,
      settings: () => settings,
    })
    scene.renderFrame()
    const antes = camera.angularSensibility
    settings = { ...settings, mouseSensitivity: 2 }
    scene.renderFrame()
    expect(camera.angularSensibility).toBeCloseTo(antes / 2, 9)
  })

  /** O objeto de câmera é vivo: o menu reescreve `baseFovDeg` nele. */
  it('acompanha o fov de quadril mudando entre dois quadros', () => {
    const scene = new FakeRenderLoop()
    const camera = new FakeLookTarget()
    const cameraConfig = { ...CAMERA }
    driveLookSensitivity(scene, {
      camera,
      zoom: createScopeZoom(true),
      cameraConfig,
      settings: () => DEFAULT_PLAYER_SETTINGS,
    })
    scene.renderFrame()
    const antes = camera.angularSensibility
    cameraConfig.baseFovDeg = 120
    scene.renderFrame()
    // no quadril o coeficiente é 1 em qualquer fov: o ganho não muda.
    expect(camera.angularSensibility).toBeCloseTo(antes, 9)
  })
})
