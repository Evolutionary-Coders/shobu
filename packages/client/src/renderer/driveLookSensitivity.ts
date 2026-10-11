import type { CameraConfig } from '@shobu/core'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { LensRenderLoop } from './firstPersonLens.ts'
import { lookPixelsPerRadian } from './lookSensitivity.ts'
import { type ScopeZoom, scopeBlend, scopeFovDeg } from './scopeZoom.ts'

/** O que este módulo escreve na câmera. Estrutural: o teste roda em node. */
export interface LookTarget {
  angularSensibility: number
}

export interface LookSensitivityOptions {
  readonly camera: LookTarget
  readonly zoom: ScopeZoom
  /** O mesmo objeto vivo que a lente lê: o `baseFovDeg` dele muda com o menu. */
  readonly cameraConfig: CameraConfig
  readonly settings: () => PlayerSettings
}

/**
 * O **único** dono do `angularSensibility`, irmão do `firstPersonLens.ts` e pelo
 * mesmo motivo: a preferência do jogador e a compensação da luneta querem as
 * duas mexer no mesmo campo, e compor num lugar só é o que impede uma apagar a
 * outra.
 *
 * Por quadro e não por evento, ao contrário do resto do hud: o valor depende do
 * fov **deste** quadro, que a luneta muda continuamente durante a transição.
 * Ler por evento daria a sensibilidade certa só nas duas pontas.
 *
 * Registrar **depois** do `driveArenaWeapon`, que é quem avança o `zoom`, para o
 * ganho não ficar um quadro atrasado — a mesma ordem que a lente já respeita.
 *
 * ```ts
 * driveLookSensitivity(scene, { camera, zoom, cameraConfig: live.camera, settings: live.current })
 * ```
 */
export function driveLookSensitivity(scene: LensRenderLoop, options: LookSensitivityOptions): void {
  scene.onBeforeRenderObservable.add(() => {
    options.camera.angularSensibility = lookPixelsPerRadian({
      currentFovDeg: scopeFovDeg(options.zoom, options.cameraConfig),
      baseFovDeg: options.cameraConfig.baseFovDeg,
      scopeBlend: scopeBlend(options.zoom),
      settings: options.settings(),
    })
  })
}
