import type { Engine } from '@babylonjs/core/Engines/engine'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { Scene } from '@babylonjs/core/scene'
import { createFrameStats, type FrameMeter } from '../instrumentation/frameMeter.ts'
import { createAutoQuality, stepAutoQuality } from '../settings/autoQuality.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import {
  pixelRatioFor,
  type QualityLevel,
  qualityLevelFor,
  qualityPresetAt,
} from '../settings/qualityPreset.ts'

/** Uma amostra a cada dois segundos: a janela do medidor é de ~4 s, e o AUTO não precisa de mais. */
const SAMPLE_EVERY_MS = 2000

/** O nome do disco de `attachContactShadow.ts`. */
const CONTACT_SHADOW_NAME = 'sombra-de-contato'

export interface QualitySources {
  readonly scene: Scene
  readonly engine: Engine
  readonly meter: FrameMeter
  readonly settings: () => PlayerSettings
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
  const monitor = { refreshMs: Number.POSITIVE_INFINITY }
  const tick = (): void => {
    const preset = qualityPresetAt(sources.settings().quality)
    if (preset === 'auto') sampleAuto(sources.meter, stats, monitor, auto)
    applyLevel(sources, qualityLevelFor(preset, auto.scale))
  }
  tick()
  setInterval(tick, SAMPLE_EVERY_MS)
}

/** A taxa do monitor é a menor mediana já vista: quando o jogo acompanha o vsync, é a varredura. */
function sampleAuto(
  meter: FrameMeter,
  stats: ReturnType<typeof createFrameStats>,
  monitor: { refreshMs: number },
  auto: ReturnType<typeof createAutoQuality>,
): void {
  meter.stats(stats)
  if (stats.frames > 0) monitor.refreshMs = Math.min(monitor.refreshMs, stats.medianMs)
  stepAutoQuality(auto, stats, monitor.refreshMs)
}

function applyLevel(sources: QualitySources, level: QualityLevel): void {
  const { scene, engine } = sources
  const scaling = 1 / pixelRatioFor(level, window.devicePixelRatio)
  if (engine.getHardwareScalingLevel() !== scaling) engine.setHardwareScalingLevel(scaling)
  document.documentElement.dataset.grading = level.grading ? 'on' : 'off'
  applyAnisotropy(scene, level.anisotropy)
  applyContactShadows(scene, level.contactShadows)
  for (const layer of scene.effectLayers) layer.isEnabled = level.neonGlow
}

function applyAnisotropy(scene: Scene, anisotropy: number): void {
  for (const texture of scene.textures) {
    if (!(texture instanceof Texture)) continue
    if (texture.anisotropicFilteringLevel !== anisotropy)
      texture.anisotropicFilteringLevel = anisotropy
  }
}

function applyContactShadows(scene: Scene, enabled: boolean): void {
  for (const mesh of scene.meshes) {
    if (mesh.name === CONTACT_SHADOW_NAME) mesh.setEnabled(enabled)
  }
}
