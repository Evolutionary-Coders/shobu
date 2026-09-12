import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  advanceScopeZoom,
  createScopeZoom,
  isScopeOpen,
  isViewmodelVisible,
  type ScopeZoom,
  scopeFovDeg,
  VIEWMODEL_HIDE_PROGRESS,
} from './scopeZoom.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const { camera } = config
const FRAME_S = 1 / 60

function ramp(zoom: ScopeZoom, scoped: boolean, seconds: number): ScopeZoom {
  const frames = Math.ceil(seconds / FRAME_S)
  for (let frame = 0; frame < frames; frame += 1) {
    advanceScopeZoom(zoom, scoped, FRAME_S, camera.scopeTransitionS)
  }
  return zoom
}

describe('advanceScopeZoom', () => {
  it('a luneta abre no tempo que o gameplay.json manda', () => {
    const zoom = ramp(createScopeZoom(true), true, camera.scopeTransitionS)
    expect(zoom.progress).toBe(1)
  })

  it('no meio do caminho a luneta está no meio do caminho', () => {
    const zoom = ramp(createScopeZoom(true), true, camera.scopeTransitionS / 2)
    expect(zoom.progress).toBeGreaterThan(0.3)
    expect(zoom.progress).toBeLessThan(0.7)
  })

  it('fecha no mesmo tempo em que abre', () => {
    const zoom = ramp(createScopeZoom(true), true, camera.scopeTransitionS)
    ramp(zoom, false, camera.scopeTransitionS)
    expect(zoom.progress).toBe(0)
  })

  /** Quem pediu menos movimento não perde a luneta: perde a rampa do fov. */
  it('com menos movimento a transição é instantânea, mas a luneta continua', () => {
    const zoom = createScopeZoom(false)
    advanceScopeZoom(zoom, true, FRAME_S, camera.scopeTransitionS)
    expect(zoom.progress).toBe(1)
    advanceScopeZoom(zoom, false, FRAME_S, camera.scopeTransitionS)
    expect(zoom.progress).toBe(0)
  })

  it('recusa tempo de quadro e transição impossíveis', () => {
    const zoom = createScopeZoom(true)
    expect(() => advanceScopeZoom(zoom, true, -1, 0.12)).toThrow(/dtS recebeu -1/)
    expect(() => advanceScopeZoom(zoom, true, FRAME_S, 0)).toThrow(/transitionS recebeu 0/)
  })
})

describe('scopeFovDeg', () => {
  it('no quadril é o fov base e na luneta cheia é o fov de mira', () => {
    expect(scopeFovDeg(createScopeZoom(true), camera)).toBeCloseTo(camera.baseFovDeg)
    const scoped = ramp(createScopeZoom(true), true, camera.scopeTransitionS)
    expect(scopeFovDeg(scoped, camera)).toBeCloseTo(camera.scopedFovDeg)
  })

  it('o fov só fecha, nunca abre no meio da transição', () => {
    const zoom = createScopeZoom(true)
    let previous = scopeFovDeg(zoom, camera)
    for (let frame = 0; frame < 12; frame += 1) {
      advanceScopeZoom(zoom, true, FRAME_S, camera.scopeTransitionS)
      const current = scopeFovDeg(zoom, camera)
      expect(current).toBeLessThanOrEqual(previous)
      previous = current
    }
  })
})

describe('isViewmodelVisible', () => {
  /** Esconder a arma em t=0 mostra um quadro de mãos vazias antes de a lente cobrir. */
  it('a arma some no meio da transição, não no começo', () => {
    const zoom = createScopeZoom(true)
    expect(isViewmodelVisible(zoom)).toBe(true)
    zoom.progress = VIEWMODEL_HIDE_PROGRESS / 2
    expect(isViewmodelVisible(zoom)).toBe(true)
    zoom.progress = VIEWMODEL_HIDE_PROGRESS
    expect(isViewmodelVisible(zoom)).toBe(false)
  })
})

describe('isScopeOpen', () => {
  it('o sobreposto entra só com a transição terminada', () => {
    const zoom = createScopeZoom(true)
    zoom.progress = 0.9
    expect(isScopeOpen(zoom)).toBe(false)
    zoom.progress = 1
    expect(isScopeOpen(zoom)).toBe(true)
  })
})
