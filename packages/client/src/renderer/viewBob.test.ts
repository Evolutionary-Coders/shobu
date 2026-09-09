import { describe, expect, it } from 'vitest'
import { advanceViewBob, createViewBob, type ViewBobSample, viewBobOffset } from './viewBob.ts'

const RUN = 9
const running: ViewBobSample = {
  grounded: true,
  stance: 'standing',
  horizontalSpeedMps: RUN,
  runSpeedMps: RUN,
}
const still: ViewBobSample = { ...running, horizontalSpeedMps: 0 }
const airborne: ViewBobSample = { ...running, grounded: false }

const FRAME_S = 1 / 60

function runFrames(bob: ReturnType<typeof createViewBob>, sample: ViewBobSample, frames: number) {
  for (let index = 0; index < frames; index += 1) advanceViewBob(bob, sample, FRAME_S)
  return viewBobOffset(bob, { up: 0, right: 0 })
}

describe('viewBob', () => {
  it('parado não balança', () => {
    const bob = createViewBob(true)
    const offset = runFrames(bob, still, 30)
    expect(offset.up).toBe(0)
    expect(offset.right).toBe(0)
  })

  it('correndo, a fase avança com a distância e o olho sobe e desce', () => {
    const bob = createViewBob(true)
    const seen = new Set<number>()
    for (let index = 0; index < 60; index += 1) {
      advanceViewBob(bob, running, FRAME_S)
      seen.add(Math.sign(viewBobOffset(bob, { up: 0, right: 0 }).up))
    }
    expect(seen.has(1)).toBe(true)
    expect(seen.has(-1)).toBe(true)
    // 9 m/s por 1 s são 9 m: pouco mais de cinco ciclos de 1,7 m
    expect(bob.amplitude).toBeCloseTo(1, 1)
  })

  /** A mira não balança: as amplitudes são de centímetros, não de metros. */
  it('a amplitude fica em centímetros', () => {
    const bob = createViewBob(true)
    let peak = 0
    for (let index = 0; index < 120; index += 1) {
      advanceViewBob(bob, running, FRAME_S)
      peak = Math.max(peak, Math.abs(viewBobOffset(bob, { up: 0, right: 0 }).up))
    }
    expect(peak).toBeGreaterThan(0.01)
    expect(peak).toBeLessThan(0.03)
  })

  it('a corrida tática balança mais, com teto', () => {
    const sprint = createViewBob(true)
    runFrames(sprint, { ...running, horizontalSpeedMps: 12 }, 60)
    expect(sprint.amplitude).toBeCloseTo(12 / 9, 1)
    const absurd = createViewBob(true)
    runFrames(absurd, { ...running, horizontalSpeedMps: 40 }, 60)
    expect(absurd.amplitude).toBeCloseTo(1.4, 1)
  })

  it('agachado balança a metade', () => {
    const bob = createViewBob(true)
    runFrames(bob, { ...running, stance: 'crouching', horizontalSpeedMps: 4.5 }, 60)
    expect(bob.amplitude).toBeCloseTo(0.25, 1)
  })

  it('no ar e no slide a fase congela e a amplitude cai', () => {
    const bob = createViewBob(true)
    runFrames(bob, running, 30)
    const phase = bob.phase
    runFrames(bob, airborne, 30)
    expect(bob.phase).toBe(phase)
    expect(bob.amplitude).toBeLessThan(0.05)
    runFrames(bob, { ...running, stance: 'sliding', horizontalSpeedMps: 13 }, 5)
    expect(bob.phase).toBe(phase)
  })

  it('aterrissar afunda a câmera e o afundo decai', () => {
    const bob = createViewBob(true)
    runFrames(bob, airborne, 10)
    advanceViewBob(bob, still, FRAME_S)
    const landed = viewBobOffset(bob, { up: 0, right: 0 }).up
    expect(landed).toBeLessThan(-0.03)
    runFrames(bob, still, 60)
    expect(viewBobOffset(bob, { up: 0, right: 0 }).up).toBeGreaterThan(-0.001)
  })

  /** Quem pediu menos movimento não ganha balanço nem afundo, correndo ou pousando. */
  it('desligado, nada se mexe', () => {
    const bob = createViewBob(false)
    runFrames(bob, running, 60)
    runFrames(bob, airborne, 10)
    const offset = runFrames(bob, running, 1)
    // Math.abs porque seno de fase zero vezes amplitude zero dá -0, e -0 não é 0 para toEqual
    expect(Math.abs(offset.up)).toBe(0)
    expect(Math.abs(offset.right)).toBe(0)
  })

  it('recusa tempo de quadro inválido', () => {
    expect(() => advanceViewBob(createViewBob(true), running, Number.NaN)).toThrow(
      /dtS recebeu NaN/,
    )
  })
})
