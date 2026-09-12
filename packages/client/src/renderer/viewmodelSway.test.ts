import { describe, expect, it } from 'vitest'
import {
  advanceViewmodelSway,
  createViewmodelSway,
  type ViewmodelSwayOffset,
  type ViewmodelSwaySample,
  viewmodelSwayOffset,
  wrapAngleRad,
} from './viewmodelSway.ts'

const STILL: ViewmodelSwaySample = {
  yawDeltaRad: 0,
  pitchDeltaRad: 0,
  stridePhase: 0,
  strideAmplitude: 0,
}

const FRAME_S = 1 / 60

function offsetOf(
  sway: ReturnType<typeof createViewmodelSway>,
  sample: ViewmodelSwaySample = STILL,
): ViewmodelSwayOffset {
  return viewmodelSwayOffset(sway, sample, {
    right: 0,
    up: 0,
    yawRad: 0,
    pitchRad: 0,
    rollRad: 0,
  })
}

describe('advanceViewmodelSway', () => {
  /** Parado e sem girar, a arma ainda respira — mas em milímetros, que é sniper. */
  it('parado, só a respiração mexe, e em milímetros', () => {
    const sway = createViewmodelSway(true)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    const offset = offsetOf(sway)
    expect(Math.abs(offset.up)).toBeGreaterThan(0)
    expect(Math.abs(offset.up)).toBeLessThan(0.005)
    expect(offset.yawRad).toBe(0)
  })

  it('a respiração completa um ciclo em quatro segundos', () => {
    const sway = createViewmodelSway(true)
    for (let tick = 0; tick < 240; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    expect(sway.breathPhase).toBeCloseTo(0, 1)
  })

  it('girar o mouse joga a arma para trás', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 0.1 }, FRAME_S)
    expect(sway.lagYawRad).toBeLessThan(0)
  })

  it('parar de girar traz a arma de volta ao centro', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 0.1 }, FRAME_S)
    const kicked = Math.abs(sway.lagYawRad)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    expect(Math.abs(sway.lagYawRad)).toBeLessThan(kicked * 0.05)
  })

  /** Um giro de 180° num quadro não pode jogar a arma para fora do quadro. */
  it('o atraso tem teto, por maior que seja o giro', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 50 }, FRAME_S)
    expect(Math.abs(sway.lagYawRad)).toBeLessThanOrEqual(0.1)
  })

  it('a passada balança a arma na fase que o balanço de câmera já calculou', () => {
    const sway = createViewmodelSway(true)
    const striding = { ...STILL, stridePhase: Math.PI / 2, strideAmplitude: 1 }
    const offset = offsetOf(sway, striding)
    expect(offset.right).toBeGreaterThan(0)
    expect(Math.abs(offset.rollRad)).toBeGreaterThan(0)
  })

  it('parado, a passada não balança nada, por mais que a fase avance', () => {
    const sway = createViewmodelSway(true)
    const offset = offsetOf(sway, { ...STILL, stridePhase: Math.PI / 2, strideAmplitude: 0 })
    expect(offset.right).toBe(0)
    expect(offset.rollRad).toBe(0)
  })

  /** Quem pediu menos movimento não ganha nem a respiração. */
  it('desligado, nada se mexe', () => {
    const sway = createViewmodelSway(false)
    for (let tick = 0; tick < 120; tick += 1) {
      advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 0.3 }, FRAME_S)
    }
    const offset = offsetOf(sway)
    expect(Math.abs(offset.up)).toBe(0)
    expect(Math.abs(offset.yawRad)).toBe(0)
  })

  it('recusa tempo de quadro que não é número, ou que anda para trás', () => {
    const sway = createViewmodelSway(true)
    expect(() => advanceViewmodelSway(sway, STILL, Number.NaN)).toThrow(/dtS recebeu NaN/)
    expect(() => advanceViewmodelSway(sway, STILL, -1)).toThrow(/dtS recebeu -1/)
  })
})

describe('wrapAngleRad', () => {
  /** O babylon não normaliza rotation.y: sem isto, a volta completa vira um tranco. */
  it('a volta completa não vira giro nenhum', () => {
    expect(wrapAngleRad(Math.PI * 2)).toBeCloseTo(0)
    expect(wrapAngleRad(-Math.PI * 2)).toBeCloseTo(0)
  })

  it('deixa o ângulo pequeno como está', () => {
    expect(wrapAngleRad(0.3)).toBeCloseTo(0.3)
    expect(wrapAngleRad(-0.3)).toBeCloseTo(-0.3)
  })

  it('escolhe sempre o caminho curto', () => {
    expect(wrapAngleRad(Math.PI * 1.9)).toBeCloseTo(-Math.PI * 0.1)
  })
})
