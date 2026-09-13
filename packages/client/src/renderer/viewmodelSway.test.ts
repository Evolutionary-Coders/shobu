import { describe, expect, it } from 'vitest'
import {
  advanceViewmodelSway,
  createViewmodelSway,
  followFraction,
  type ViewmodelSwayOffset,
  type ViewmodelSwaySample,
  viewmodelSwayOffset,
} from './viewmodelSway.ts'

const STILL: ViewmodelSwaySample = { stridePhase: 0, strideAmplitude: 0 }

/**
 * Sorteio repetível para simular tempo de quadro irregular — o mesmo gerador
 * do `replay.test.ts`, para os testes do projeto falarem uma língua só.
 */
function frameClock(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

const FRAME_S = 1 / 60

function offsetOf(
  sway: ReturnType<typeof createViewmodelSway>,
  sample: ViewmodelSwaySample = STILL,
): ViewmodelSwayOffset {
  return viewmodelSwayOffset(sway, sample, { right: 0, up: 0, rollRad: 0 })
}

describe('advanceViewmodelSway', () => {
  /** Parado, a arma ainda respira — mas em milímetros, que é sniper. */
  it('parado, só a respiração mexe, e em milímetros', () => {
    const sway = createViewmodelSway(true)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    const offset = offsetOf(sway)
    expect(Math.abs(offset.up)).toBeGreaterThan(0)
    expect(Math.abs(offset.up)).toBeLessThan(0.005)
  })

  it('a respiração completa um ciclo em quatro segundos', () => {
    const sway = createViewmodelSway(true)
    for (let tick = 0; tick < 240; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    expect(sway.breathPhase).toBeCloseTo(0, 1)
  })

  it('a passada balança a arma na fase que o balanço de câmera já calculou', () => {
    const sway = createViewmodelSway(true)
    const striding = { stridePhase: Math.PI, strideAmplitude: 1 }
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    const offset = offsetOf(sway, striding)
    expect(Math.abs(offset.right)).toBeGreaterThan(0)
    expect(Math.abs(offset.rollRad)).toBeGreaterThan(0)
  })

  /**
   * A amplitude do balanço de câmera salta quando o jogador começa a andar, e a
   * arma seguindo o salto dá um tranco. O filtro é o que tira isso.
   */
  it('a passada entra filtrada, sem tranco no quadro em que o jogador anda', () => {
    const sway = createViewmodelSway(true)
    const striding = { stridePhase: Math.PI, strideAmplitude: 1 }
    advanceViewmodelSway(sway, striding, FRAME_S)
    const firstFrame = Math.abs(offsetOf(sway, striding).right)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    expect(firstFrame).toBeLessThan(Math.abs(offsetOf(sway, striding).right) / 4)
  })

  it('parar de andar devolve a arma ao centro sem solavanco', () => {
    const sway = createViewmodelSway(true)
    const striding = { stridePhase: Math.PI, strideAmplitude: 1 }
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    for (let tick = 0; tick < 120; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    expect(Math.abs(offsetOf(sway, STILL).right)).toBeLessThan(0.001)
  })

  /**
   * A arma bate na metade da frequência da passada: seguindo a da câmera ela
   * batia quatro vezes por segundo em corrida, que lia como tremedeira.
   */
  it('a arma completa um balanço a cada duas passadas da câmera', () => {
    const sway = createViewmodelSway(true)
    const striding = { stridePhase: 0, strideAmplitude: 1 }
    for (let tick = 0; tick < 120; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    const atPeak = offsetOf(sway, { ...striding, stridePhase: Math.PI }).right
    const afterOneStride = offsetOf(sway, { ...striding, stridePhase: Math.PI * 3 }).right
    const afterTwoStrides = offsetOf(sway, { ...striding, stridePhase: Math.PI * 5 }).right
    expect(afterOneStride).toBeCloseTo(-atPeak, 5)
    expect(afterTwoStrides).toBeCloseTo(atPeak, 5)
  })

  /** A mira mora na arma: o balanço inteiro tem que caber em poucos milímetros. */
  it('o balanço inteiro cabe em menos de um centímetro', () => {
    const sway = createViewmodelSway(true)
    for (let tick = 0; tick < 240; tick += 1) {
      const sample = { strideAmplitude: 1.4, stridePhase: (tick / 60) * Math.PI * 2 }
      advanceViewmodelSway(sway, sample, FRAME_S)
      const offset = offsetOf(sway, sample)
      expect(Math.abs(offset.right)).toBeLessThan(0.01)
      expect(Math.abs(offset.up)).toBeLessThan(0.01)
    }
  })

  /** Quem pediu menos movimento não ganha nem a respiração. */
  it('desligado, nada se mexe', () => {
    const sway = createViewmodelSway(false)
    for (let tick = 0; tick < 120; tick += 1) {
      advanceViewmodelSway(sway, { stridePhase: 2, strideAmplitude: 1 }, FRAME_S)
    }
    const offset = offsetOf(sway)
    expect(Math.abs(offset.up)).toBe(0)
    expect(Math.abs(offset.right)).toBe(0)
  })

  it('recusa tempo de quadro que não é número, ou que anda para trás', () => {
    const sway = createViewmodelSway(true)
    expect(() => advanceViewmodelSway(sway, STILL, Number.NaN)).toThrow(/dtS recebeu NaN/)
    expect(() => advanceViewmodelSway(sway, STILL, -1)).toThrow(/dtS recebeu -1/)
  })
})

/**
 * **A garantia que o jogador pediu, e ela é estrutural.**
 *
 * A arma tremia ao girar a mira porque um atraso a arrastava atrás do giro, e o
 * giro do mouse é sinal ruidoso: o navegador entrega os eventos em lotes que não
 * batem com o ritmo do quadro. Três rodadas de filtro não resolveram — qualquer
 * atraso rápido o bastante para ser sentido também é rápido o bastante para
 * transformar o ruído em tremor.
 *
 * O atraso foi removido. O que estes testes prendem não é um número bem
 * ajustado: é que **a câmera não entra na conta**, e por isso não existe caminho
 * pelo qual girar possa mexer na arma.
 */
describe('girar a mira não mexe na arma', () => {
  it('o balanço não tem por onde receber a mira', () => {
    const sample: ViewmodelSwaySample = STILL
    expect(Object.keys(sample).sort()).toEqual(['strideAmplitude', 'stridePhase'])
  })

  it('o deslocamento não tem eixo de giro para escrever', () => {
    expect(Object.keys(offsetOf(createViewmodelSway(true))).sort()).toEqual([
      'right',
      'rollRad',
      'up',
    ])
  })

  /**
   * Parado, girando ou não, a saída depende só do tempo: dois balanços que
   * receberam os mesmos quadros dão exatamente o mesmo resultado, aconteça o
   * que acontecer com a câmera.
   */
  it('parado, a saída depende só do tempo decorrido', () => {
    const a = createViewmodelSway(true)
    const b = createViewmodelSway(true)
    const next = frameClock(7)
    for (let frame = 0; frame < 200; frame += 1) {
      const dtS = (13 + next() * 8) / 1000
      advanceViewmodelSway(a, STILL, dtS)
      advanceViewmodelSway(b, STILL, dtS)
    }
    expect(offsetOf(a)).toEqual(offsetOf(b))
  })

  /**
   * O que sobra entre dois quadros é a **própria respiração**: 0,004 m de
   * amplitude num ciclo de 4 s dá 0,13 mm no quadro mais rápido, que a 0,65 m
   * do olho e 65° de fov é um quarto de pixel na tela.
   */
  it('parado, o maior salto entre quadros vizinhos é imperceptível', () => {
    const sway = createViewmodelSway(true)
    const next = frameClock(11)
    const seen: number[] = []
    for (let frame = 0; frame < 300; frame += 1) {
      advanceViewmodelSway(sway, STILL, (13 + next() * 8) / 1000)
      seen.push(offsetOf(sway).up)
    }
    const jumps = seen.slice(1).map((value, index) => Math.abs(value - (seen[index] ?? 0)))
    expect(Math.max(...jumps)).toBeLessThan(0.00015)
  })
})

describe('followFraction', () => {
  /** Meio segundo de engasgada ainda deixa resto: a aproximação linear zerava. */
  it('não satura num quadro longo, onde a aproximação linear zerava', () => {
    expect(followFraction(0.5, 6)).toBeLessThan(1)
    expect(followFraction(0.5, 6)).toBeGreaterThan(0.9)
    expect(Math.min(1, 0.5 * 6)).toBe(1)
  })

  it('quadro de duração zero não anda nada', () => {
    expect(followFraction(0, 6)).toBe(0)
  })

  /** Perto de zero ela concorda com a aproximação linear que substituiu. */
  it('num quadro curto vale quase o mesmo que a taxa vezes o tempo', () => {
    expect(followFraction(1 / 60, 6)).toBeCloseTo(6 / 60, 2)
  })
})
