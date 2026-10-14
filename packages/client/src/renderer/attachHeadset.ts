import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { createCardboardView, type HeadMountedView } from './cardboardView.ts'
import type { HeadsetVisor } from './headsetVisor.ts'
import {
  HEADSET_PLACEMENT,
  SNIPER_PLACEMENT,
  type ViewmodelPlacement,
} from './loadSniperViewmodel.ts'
import { type ScopeZoom, scopeFovDeg } from './scopeZoom.ts'
import type { ViewBob } from './viewBob.ts'

export interface HeadsetParts {
  readonly camera: UniversalCamera
  readonly viewmodelCamera: UniversalCamera
  readonly options: ArenaRendererOptions
  readonly zoom: ScopeZoom
  readonly viewBob: ViewBob
  /** Onde a arma fica: o óculos troca pela posição dele ao entrar. */
  readonly viewmodel: { placement: ViewmodelPlacement }
  readonly visor: HeadsetVisor
}

/**
 * O cardboard, com a luneta lida da mesma conta de fov do desktop. O balanço de
 * câmera desliga enquanto o óculos está posto, e volta à preferência do jogador
 * ao sair: mexer na cabeça de quem está de óculos é o gatilho clássico de enjoo.
 *
 * ```ts
 * const headset = attachHeadset(scene, { camera, viewmodelCamera, options, zoom, viewBob, viewmodel, visor })
 * ```
 */
export function attachHeadset(scene: Scene, parts: HeadsetParts): HeadMountedView {
  const { options } = parts
  const headset = createCardboardView({
    scene,
    worldCamera: parts.camera,
    viewmodelCamera: parts.viewmodelCamera,
    canvas: options.canvas,
    baseFovDeg: () => options.settings.camera.baseFovDeg,
    currentFovDeg: () => scopeFovDeg(parts.zoom, options.settings.camera),
    visor: parts.visor,
  })
  const bobPreference = parts.viewBob.enabled
  headset.onActiveChange((active) => {
    parts.viewBob.enabled = active ? false : bobPreference
    parts.viewmodel.placement = active ? HEADSET_PLACEMENT : SNIPER_PLACEMENT
  })
  return headset
}
