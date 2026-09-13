import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../math/seededRandom.ts'
import { dot, lengthSquared, type Vector3 } from '../math/vector3.ts'
import { applySpread } from './aimSpread.ts'
import { spreadTangent } from './spreadTangent.ts'

const AIM: Readonly<Vector3> = { x: 0, y: 0, z: 1 }
const SPREAD_DEG = 4.5

function spreadOnce(seed: number, tangent = spreadTangent(SPREAD_DEG)): Vector3 {
  const direction = { ...AIM }
  applySpread(direction, tangent, createSeededRandom(seed))
  return direction
}

describe('applySpread', () => {
  it('dispersão zero devolve a mira intacta: é o tiro com a luneta', () => {
    expect(spreadOnce(1, 0)).toEqual(AIM)
  })

  it('o resultado continua unitário', () => {
    expect(lengthSquared(spreadOnce(3))).toBeCloseTo(1, 6)
  })

  /** A garantia do número: o no scope erra até o ângulo configurado, nunca além. */
  it('o desvio nunca passa do semi-ângulo configurado', () => {
    const minimumCosine = Math.cos((SPREAD_DEG * Math.PI) / 180)
    for (let seed = 0; seed < 2_000; seed += 1) {
      expect(dot(spreadOnce(seed), AIM)).toBeGreaterThanOrEqual(minimumCosine - 1e-9)
    }
  })

  /**
   * Uniforme **no disco**, não gaussiana. Dois anéis de mesma área têm que
   * receber a mesma contagem; é este teste que pega quem "simplificar" a
   * amostragem depois e concentrar os tiros no centro.
   */
  it('a dispersão é uniforme no disco, não concentrada no centro', () => {
    const tangent = spreadTangent(SPREAD_DEG)
    // metade da área está dentro do raio r/raiz(2).
    const halfAreaCosine = Math.cos(Math.atan(tangent / Math.SQRT2))
    let inner = 0
    const draws = 4_000
    for (let seed = 0; seed < draws; seed += 1) {
      if (dot(spreadOnce(seed), AIM) >= halfAreaCosine) inner += 1
    }
    expect(inner / draws).toBeGreaterThan(0.45)
    expect(inner / draws).toBeLessThan(0.55)
  })

  it('a mesma semente produz exatamente o mesmo desvio', () => {
    expect(spreadOnce(77)).toEqual(spreadOnce(77))
  })

  it('sementes diferentes desviam para lados diferentes', () => {
    expect(spreadOnce(1)).not.toEqual(spreadOnce(2))
  })

  /** Olhando para o céu o produto vetorial com a vertical degenera e daria NaN. */
  it('mirar direto para cima não produz NaN', () => {
    const straightUp = { x: 0, y: 1, z: 0 }
    applySpread(straightUp, spreadTangent(SPREAD_DEG), createSeededRandom(5))
    expect(Number.isFinite(straightUp.x)).toBe(true)
    expect(lengthSquared(straightUp)).toBeCloseTo(1, 6)
  })
})

/**
 * A rejeição aceita π/4 das tiradas, então oito recusas seguidas são raras mas
 * possíveis: 0,215⁸ ≈ 1 em 217 mil sementes. A semente abaixo é uma delas,
 * achada por varredura — o ramo existe porque um laço sem teto no caminho
 * determinístico seria um travamento possível, e este teste prova que a saída
 * é **atirar reto**, e não uma direção degenerada ou `NaN`.
 */
describe('applySpread: a desistência da amostragem', () => {
  const REJECTING_SEED = 86_513

  it('atira reto quando oito tiradas seguidas caem fora do disco', () => {
    const direction = { ...AIM }
    applySpread(direction, spreadTangent(SPREAD_DEG), createSeededRandom(REJECTING_SEED))
    expect(direction).toEqual(AIM)
  })

  it('devolve direção unitária mesmo desistindo', () => {
    const direction = { ...AIM }
    applySpread(direction, spreadTangent(SPREAD_DEG), createSeededRandom(REJECTING_SEED))
    expect(lengthSquared(direction)).toBeCloseTo(1, 12)
  })
})
