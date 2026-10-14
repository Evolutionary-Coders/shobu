import type { Engine } from '@babylonjs/core/Engines/engine'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { Scene } from '@babylonjs/core/scene'
import { textureAnisotropy } from '../arena/arenaScenery.ts'
import { createFrameStats, type FrameMeter } from '../instrumentation/frameMeter.ts'
import { createAutoQuality, stepAutoQuality } from '../settings/autoQuality.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import {
  pixelRatioFor,
  type QualityLevel,
  qualityLevelFor,
  qualityPresetAt,
} from '../settings/qualityPreset.ts'
import { setPuddleMirror } from './puddleMirror.ts'

/** Uma amostra a cada dois segundos: a janela do medidor é de ~4 s, e o AUTO não precisa de mais. */
const SAMPLE_EVERY_MS = 2000

/** O nome do disco de `attachContactShadow.ts`. */
const CONTACT_SHADOW_NAME = 'sombra-de-contato'

export interface QualitySources {
  readonly scene: Scene
  readonly engine: Engine
  readonly meter: FrameMeter
  readonly settings: () => PlayerSettings
  /** O jogador está no controle: só então o AUTO amostra — o boot não é a partida. */
  readonly inControl: () => boolean
  /** Avisa quando o controle muda; ao entrar, a janela do medidor recomeça. */
  readonly onControlChange: (listener: (inControl: boolean) => void) => void
}

/**
 * Aplica a predefinição de qualidade ao vivo: muda a configuração no menu e o
 * próximo ciclo já desenha diferente. Quem decide é `qualityPreset.ts` e
 * `autoQuality.ts`; aqui só se traduz para o babylon e o dom.
 *
 * ```ts
 * applyQuality({ scene, engine, meter: perf.meter, settings: live.current })
 * ```
 */
export function applyQuality(sources: QualitySources): void {
  const auto = createAutoQuality()
  const stats = createFrameStats()
  // os quadros do carregamento e do menu não são a partida (revisão do #23):
  // a janela recomeça na entrada, e só se amostra com o jogador no controle.
  sources.onControlChange((inControl) => {
    if (inControl) sources.meter.reset()
  })
  const tick = (): void => {
    const preset = qualityPresetAt(sources.settings().quality)
    if (preset === 'auto' && sources.inControl()) stepAutoQuality(auto, sources.meter.stats(stats))
    applyLevel(sources, qualityLevelFor(preset, auto.scale))
  }
  tick()
  setInterval(tick, SAMPLE_EVERY_MS)
}

function applyLevel(sources: QualitySources, level: QualityLevel): void {
  const { scene, engine } = sources
  const scaling = 1 / pixelRatioFor(level, window.devicePixelRatio)
  if (engine.getHardwareScalingLevel() !== scaling) engine.setHardwareScalingLevel(scaling)
  document.documentElement.dataset.grading = level.grading ? 'on' : 'off'
  applyAnisotropy(scene, level.anisotropy)
  applyContactShadows(scene, level.contactShadows)
  for (const layer of scene.effectLayers) layer.isEnabled = level.neonGlow
  setPuddleMirror(scene, level.puddleReflections)
}

function applyAnisotropy(scene: Scene, anisotropy: number): void {
  for (const texture of scene.textures) {
    if (!(texture instanceof Texture)) continue
    const level = textureAnisotropy(anisotropy, texture.metadata?.minAnisotropy)
    if (texture.anisotropicFilteringLevel !== level) texture.anisotropicFilteringLevel = level
  }
}

function applyContactShadows(scene: Scene, enabled: boolean): void {
  for (const mesh of scene.meshes) {
    if (mesh.name === CONTACT_SHADOW_NAME) mesh.setEnabled(enabled)
  }
}
