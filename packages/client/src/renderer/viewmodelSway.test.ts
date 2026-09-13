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

  /**
   * O atraso gira o rig inteiro, e a arma tem quase um metro de cano: cada grau
   * joga a luneta um punhado de pixels para o lado. Girar o mouse arrastava a
   * arma para fora do quadro, e o teto é o que impede isso.
   */
  it('o atraso não passa de dois graus e meio, por maior que seja o giro', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 50 }, FRAME_S)
    expect((Math.abs(sway.lagYawRad) * 180) / Math.PI).toBeLessThanOrEqual(2.5)
  })

  /**
   * A arma bate na metade da frequência da passada: seguindo a da câmera ela
   * batia quatro vezes por segundo em corrida, que lia como tremedeira.
   */
  it('a arma completa um balanço a cada duas passadas da câmera', () => {
    const sway = createViewmodelSway(true)
    const striding = { ...STILL, strideAmplitude: 1 }
    for (let tick = 0; tick < 120; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    // o pico do balanço da arma, e o mesmo ponto uma e duas passadas depois.
    const atPeak = offsetOf(sway, { ...striding, stridePhase: Math.PI }).right
    const afterOneStride = offsetOf(sway, { ...striding, stridePhase: Math.PI * 3 }).right
    const afterTwoStrides = offsetOf(sway, { ...striding, stridePhase: Math.PI * 5 }).right
    // uma passada depois a arma está do outro lado; duas depois, de volta.
    expect(afterOneStride).toBeCloseTo(-atPeak, 5)
    expect(afterTwoStrides).toBeCloseTo(atPeak, 5)
  })

  it('a passada balança a arma na fase que o balanço de câmera já calculou', () => {
    const sway = createViewmodelSway(true)
    const striding = { ...STILL, stridePhase: Math.PI / 2, strideAmplitude: 1 }
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    const offset = offsetOf(sway, striding)
    expect(offset.right).toBeGreaterThan(0)
    expect(Math.abs(offset.rollRad)).toBeGreaterThan(0)
  })

  /**
   * A amplitude do balanço de câmera salta quando o jogador começa a andar, e a
   * arma seguindo o salto dá um tranco. O filtro é o que tira isso.
   */
  it('a passada entra filtrada, sem tranco no quadro em que o jogador anda', () => {
    const sway = createViewmodelSway(true)
    const striding = { ...STILL, stridePhase: Math.PI / 2, strideAmplitude: 1 }
    advanceViewmodelSway(sway, striding, FRAME_S)
    const firstFrame = Math.abs(offsetOf(sway, striding).right)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    expect(firstFrame).toBeLessThan(Math.abs(offsetOf(sway, striding).right) / 4)
  })

  it('parar de andar devolve a arma ao centro sem solavanco', () => {
    const sway = createViewmodelSway(true)
    const striding = { ...STILL, stridePhase: Math.PI / 2, strideAmplitude: 1 }
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    expect(Math.abs(offsetOf(sway, STILL).right)).toBeLessThan(0.001)
  })

  /**
   * A mira mora na arma: o balanço inteiro — passada na amplitude máxima mais
   * respiração — tem que caber em menos de um centímetro no rig.
   */
  it('o balanço inteiro cabe em menos de um centímetro', () => {
    const sway = createViewmodelSway(true)
    for (let tick = 0; tick < 240; tick += 1) {
      const sample = { ...STILL, strideAmplitude: 1.4, stridePhase: (tick / 60) * Math.PI * 2 }
      advanceViewmodelSway(sway, sample, FRAME_S)
      const offset = offsetOf(sway, sample)
      expect(Math.abs(offset.right)).toBeLessThan(0.01)
      expect(Math.abs(offset.up)).toBeLessThan(0.01)
    }
  })

  /** Parado a respiração continua; o que some é a contribuição da passada. */
  it('parado, a fase da passada não muda nada', () => {
    const sway = createViewmodelSway(true)
    const still = { ...STILL, strideAmplitude: 0 }
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, still, FRAME_S)
    const atZero = offsetOf(sway, { ...still, stridePhase: 0 })
    const atHalf = offsetOf(sway, { ...still, stridePhase: Math.PI / 2 })
    expect(atZero.right).toBe(atHalf.right)
    expect(atZero.rollRad).toBe(atHalf.rollRad)
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
