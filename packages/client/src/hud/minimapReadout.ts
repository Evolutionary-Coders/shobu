import {
  isRadarJammedFor,
  type RadarConfig,
  type RadarState,
  radarPulseLeftS,
  type Vector3,
} from '@shobu/core'
import { blipLifeS, type MinimapBlip } from '../controller/arenaRadar.ts'
import type { MinimapBlipView, MinimapView } from './minimapModel.ts'

/**
 * Do radar da sessão para o minimapa (ADR 0035): o que a tela recebe a cada
 * quadro. Dado puro, testado; o driver só chama e repassa ao hud.
 */

/** O raio do canvas do minimapa, em pixels do próprio canvas (`#hud-minimap`). */
export const MINIMAP_RADIUS_PX = 100

/** O radar como a sessão o mostra: o estado do núcleo e os pontos. */
export interface MinimapRadarSource {
  readonly state: RadarState
  readonly blips: readonly MinimapBlip[]
}

export interface MinimapSource {
  readonly arenaId: string
  /** O relógio da sessão (`matchTimeS`), o mesmo dos pontos. */
  readonly nowS: number
  readonly viewerId: string
  readonly selfM: Readonly<Vector3>
  readonly facingM: Readonly<Vector3>
  readonly radar: MinimapRadarSource
  readonly config: RadarConfig
}

/**
 * O quadro do minimapa.
 *
 * ```ts
 * hud.setMinimap(minimapViewOf({ arenaId, nowS, viewerId: LOCAL_PLAYER_ID, ... }))
 * ```
 */
export function minimapViewOf(source: MinimapSource): MinimapView {
  const { radar, config, nowS, viewerId } = source
  return {
    arenaId: source.arenaId,
    nowS,
    selfM: source.selfM,
    facingM: source.facingM,
    rangeM: config.minimapRangeM,
    radiusPx: MINIMAP_RADIUS_PX,
    jammed: isRadarJammedFor(radar.state, viewerId, nowS),
    pinging: radarPulseLeftS(radar.state, viewerId, nowS) > 0,
    blips: radar.blips.map((blip) => blipViewOf(blip, config)),
  }
}

function blipViewOf(blip: MinimapBlip, config: RadarConfig): MinimapBlipView {
  return { ...blip, lifeS: blipLifeS(blip, config) }
}
