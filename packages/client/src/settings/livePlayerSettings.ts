import type { CameraConfig } from '@shobu/core'
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from './playerSettingsSpec.ts'

type MutableCameraConfig = { -readonly [Key in keyof CameraConfig]: CameraConfig[Key] }

/**
 * As configurações do jogador na forma que o laço de render consome: **um objeto
 * só, criado uma vez, mutado no lugar**.
 *
 * A lente lê `camera.baseFovDeg` todo quadro (`babylonArenaRenderer.ts`, no
 * `horizontalFovDeg`). Montar ali um literal `{ ...config.camera, baseFovDeg }`
 * alocaria um objeto por quadro no caminho quente, que é o que o `docs/nfr.md`
 * proíbe — daí o `camera` ser exposto como `CameraConfig` somente-leitura sobre
 * um mutável privado.
 *
 * `scopedFovDeg` e `scopeTransitionS` continuam vindo do `config/gameplay.json`:
 * são balanço, e o jogador não mexe neles (ADR 0005).
 *
 * ```ts
 * const live = createLivePlayerSettings(config.camera, store.read())
 * live.apply({ ...live.current(), fieldOfViewDeg: 110 })  // vale no próximo quadro
 * ```
 */
export interface LivePlayerSettings {
  /** O objeto vivo que a lente e a sensibilidade leem por quadro. */
  readonly camera: CameraConfig
  current(): PlayerSettings
  apply(settings: PlayerSettings): void
}

export function createLivePlayerSettings(
  camera: CameraConfig,
  settings: PlayerSettings = DEFAULT_PLAYER_SETTINGS,
): LivePlayerSettings {
  const live: MutableCameraConfig = { ...camera, baseFovDeg: settings.fieldOfViewDeg }
  let current = settings
  return {
    camera: live,
    current: () => current,
    apply: (next) => {
      current = next
      live.baseFovDeg = next.fieldOfViewDeg
    },
  }
}
