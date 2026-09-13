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
  verticalSpeedMps: 0,
  sliding: false,
}

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
  return viewmodelSwayOffset(sway, sample, {
    right: 0,
    up: 0,
    yawRad: 0,
    pitchRad: 0,
    rollRad: 0,
  })
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
    const striding = { ...STILL, stridePhase: Math.PI, strideAmplitude: 1 }
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
    const striding = { ...STILL, stridePhase: Math.PI, strideAmplitude: 1 }
    advanceViewmodelSway(sway, striding, FRAME_S)
    const firstFrame = Math.abs(offsetOf(sway, striding).right)
    for (let tick = 0; tick < 60; tick += 1) advanceViewmodelSway(sway, striding, FRAME_S)
    expect(firstFrame).toBeLessThan(Math.abs(offsetOf(sway, striding).right) / 4)
  })

  it('parar de andar devolve a arma ao centro sem solavanco', () => {
    const sway = createViewmodelSway(true)
    const striding = { ...STILL, stridePhase: Math.PI, strideAmplitude: 1 }
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
    const striding = { ...STILL, stridePhase: 0, strideAmplitude: 1 }
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
      const sample = { ...STILL, strideAmplitude: 1.4, stridePhase: (tick / 60) * Math.PI * 2 }
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
      advanceViewmodelSway(sway, { ...STILL, stridePhase: 2, strideAmplitude: 1 }, FRAME_S)
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
 * O atraso da mira: o "peso" da arma arrastando atrás do giro.
 *
 * Ele já foi removido por engano, quando a arma tremia ao girar e ele era o
 * suspeito óbvio. A causa era outra — a câmera do viewmodel desenhava com a
 * matriz de vista do quadro anterior — e removê-lo por inteiro não resolveu
 * nada. Estes testes existem para ele não ser removido de novo pelo mesmo
 * engano, e o limite de tremor abaixo é o que separa "peso" de "tremedeira".
 */
describe('o atraso da mira', () => {
  it('girar o mouse joga a arma para trás', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 0.1 }, FRAME_S)
    expect(sway.lagYawRad).toBeLessThan(0)
  })

  it('parar de girar traz a arma de volta ao centro', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 0.1 }, FRAME_S)
    const kicked = Math.abs(sway.lagYawRad)
    for (let tick = 0; tick < 120; tick += 1) advanceViewmodelSway(sway, STILL, FRAME_S)
    expect(Math.abs(sway.lagYawRad)).toBeLessThan(kicked * 0.05)
  })

  /**
   * O atraso gira o rig inteiro, e a arma tem quase um metro de cano: cada grau
   * joga a luneta um punhado de pixels para o lado.
   */
  it('o atraso não passa de dois graus, por maior que seja o giro', () => {
    const sway = createViewmodelSway(true)
    advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 50 }, FRAME_S)
    expect((Math.abs(sway.lagYawRad) * 180) / Math.PI).toBeLessThanOrEqual(2)
  })

  /**
   * O teste que corresponde ao que o jogador vê. Entrada em **rajada**, porque
   * o navegador entrega mouse em lotes que não batem com o quadro, e `dt`
   * **irregular**, de 13 a 21 ms. Com entrada limpa a saída é lisa por
   * construção, e é por isso que nenhum teste antigo dizia nada.
   *
   * 0,0012 rad entre quadros vizinhos é cerca de 1,4 px na tela.
   */
  function turnWithJitter(): readonly number[] {
    const sway = createViewmodelSway(true)
    const next = frameClock(7)
    const seen: number[] = []
    for (let frame = 0; frame < 400; frame += 1) {
      const dtS = (13 + next() * 8) / 1000
      const burst = next() < 0.45 ? 0 : 0.05 * (0.6 + next() * 0.8)
      advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: burst }, dtS)
      if (frame > 150) seen.push(offsetOf(sway).yawRad)
    }
    return seen
  }

  it('o maior salto entre quadros vizinhos é imperceptível', () => {
    const seen = turnWithJitter()
    const jumps = seen.slice(1).map((value, index) => Math.abs(value - (seen[index] ?? 0)))
    expect(Math.max(...jumps)).toBeLessThan(0.0012)
  })

  it('mas a arma continua arrastando atrás da mira', () => {
    const seen = turnWithJitter()
    const drag = seen.reduce((total, value) => total + value, 0) / seen.length
    expect(Math.abs(drag)).toBeGreaterThan(0.008)
  })

  /**
   * Uma engasgada de quadro não pode teleportar a arma para o centro, que é o
   * que a aproximação linear fazia acima de `dt > 1/k`.
   */
  it('um quadro de 200 ms não zera o atraso de uma vez', () => {
    const sway = createViewmodelSway(true)
    for (let frame = 0; frame < 30; frame += 1) {
      advanceViewmodelSway(sway, { ...STILL, yawDeltaRad: 0.05 }, 1 / 60)
    }
    const before = Math.abs(sway.lagYawRad)
    advanceViewmodelSway(sway, STILL, 0.2)
    expect(Math.abs(sway.lagYawRad)).toBeGreaterThan(0)
    expect(Math.abs(sway.lagYawRad)).toBeLessThan(before)
  })
})

describe('wrapAngleRad', () => {
  /** O babylon não normaliza rotation.y: sem isto, a volta completa vira tranco. */
  it('a volta completa não vira giro nenhum', () => {
    expect(wrapAngleRad(Math.PI * 2)).toBeCloseTo(0)
    expect(wrapAngleRad(-Math.PI * 2)).toBeCloseTo(0)
  })

  it('escolhe sempre o caminho curto', () => {
    expect(wrapAngleRad(Math.PI * 1.9)).toBeCloseTo(-Math.PI * 0.1)
  })
})
