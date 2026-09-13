import type { CameraConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createLivePlayerSettings } from './livePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS } from './playerSettingsSpec.ts'

const CAMERA: CameraConfig = { baseFovDeg: 90, scopedFovDeg: 22, scopeTransitionS: 0.12 }

describe('createLivePlayerSettings', () => {
  it('nasce com o fov do jogador, não com o do config', () => {
    const live = createLivePlayerSettings(CAMERA, {
      ...DEFAULT_PLAYER_SETTINGS,
      fieldOfViewDeg: 110,
    })
    expect(live.camera.baseFovDeg).toBe(110)
  })

  it('sem configurações guardadas parte do padrão', () => {
    expect(createLivePlayerSettings(CAMERA).current()).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('preserva os números de balanço, que não são do jogador', () => {
    const live = createLivePlayerSettings(CAMERA)
    expect(live.camera.scopedFovDeg).toBe(CAMERA.scopedFovDeg)
    expect(live.camera.scopeTransitionS).toBe(CAMERA.scopeTransitionS)
  })

  /**
   * A razão de este módulo existir: a lente lê `camera` por quadro, então o
   * objeto tem que ser **o mesmo** entre quadros. Trocar por um literal novo a
   * cada ajuste alocaria no caminho quente e ainda deixaria a lente lendo o
   * objeto velho.
   */
  it('mantém a identidade do objeto de câmera entre ajustes', () => {
    const live = createLivePlayerSettings(CAMERA)
    const antes = live.camera
    live.apply({ ...DEFAULT_PLAYER_SETTINGS, fieldOfViewDeg: 75 })
    expect(live.camera).toBe(antes)
    expect(live.camera.baseFovDeg).toBe(75)
  })

  it('não mexe no config que recebeu', () => {
    const config = { ...CAMERA }
    createLivePlayerSettings(config).apply({ ...DEFAULT_PLAYER_SETTINGS, fieldOfViewDeg: 60 })
    expect(config.baseFovDeg).toBe(CAMERA.baseFovDeg)
  })

  it('devolve na leitura o que foi aplicado', () => {
    const live = createLivePlayerSettings(CAMERA)
    const escolhido = { ...DEFAULT_PLAYER_SETTINGS, mouseSensitivity: 2.5 }
    live.apply(escolhido)
    expect(live.current()).toEqual(escolhido)
  })
})
