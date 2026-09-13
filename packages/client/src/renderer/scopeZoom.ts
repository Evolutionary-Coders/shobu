import type { CameraConfig } from '@shobu/core'

/**
 * A abertura da luneta, do lado do render: fov e visibilidade da arma.
 *
 * São **dois relógios**, de propósito. Este decide o zoom, em
 * `camera.scopeTransitionS`; o `weapon.scopeSettleS` do núcleo decide a
 * precisão, e é menor. É o quick scope do modelo de simulação: a precisão
 * total chega antes de o zoom terminar. Misturar os dois num número só
 * apagaria a mecânica.
 */
export interface ScopeZoom {
  /** 0 no quadril, 1 na luneta cheia. */
  progress: number
  /** Falso para quem pediu menos movimento: a rampa vira salto, a luneta continua. */
  readonly enabled: boolean
}

/**
 * Acima disto a luneta já engoliu a tela e a arma pode sumir.
 *
 * No meio da transição, não no começo: esconder a arma em t=0 mostra um quadro
 * de mãos vazias antes de a lente cobrir a tela.
 */
export const VIEWMODEL_HIDE_PROGRESS = 0.35

/** Abaixo disto a luneta ainda não cobre a tela, e o sobreposto de dom não entra. */
const SCOPE_OPEN_PROGRESS = 0.999

export function createScopeZoom(enabled: boolean): ScopeZoom {
  return { progress: 0, enabled }
}

export function advanceScopeZoom(
  zoom: ScopeZoom,
  scoped: boolean,
  dtS: number,
  transitionS: number,
): void {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  if (!(transitionS > 0)) {
    throw new RangeError(`transitionS recebeu ${transitionS}; esperado número > 0`)
  }
  const target = scoped ? 1 : 0
  if (!zoom.enabled) {
    zoom.progress = target
    return
  }
  const step = dtS / transitionS
  zoom.progress = scoped ? Math.min(1, zoom.progress + step) : Math.max(0, zoom.progress - step)
}

/**
 * Fov horizontal em graus neste instante da transição. Suavizado nas duas
 * pontas: a rampa linear do fov é visível como um solavanco no começo e no fim.
 */
export function scopeFovDeg(zoom: ScopeZoom, camera: CameraConfig): number {
  const eased = smoothstep(zoom.progress)
  return camera.baseFovDeg + (camera.scopedFovDeg - camera.baseFovDeg) * eased
}

export function isViewmodelVisible(zoom: ScopeZoom): boolean {
  return zoom.progress < VIEWMODEL_HIDE_PROGRESS
}

/** O sobreposto de dom entra só com a transição terminada, como no counter-strike. */
export function isScopeOpen(zoom: ScopeZoom): boolean {
  return zoom.progress >= SCOPE_OPEN_PROGRESS
}

function smoothstep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return clamped * clamped * (3 - 2 * clamped)
}
