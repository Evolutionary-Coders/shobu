import { boxFromCenterSize } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  advanceTracers,
  beamLengthM,
  createTracerPool,
  fireTracer,
  TRACER_CORE_FRACTION,
  TRACER_FLASH_FRACTION,
  tracerCoreOpacity,
  tracerFlashOpacity,
  tracerOpacity,
} from './tracerPool.ts'

const LIFETIME_S = 0.25
const MUZZLE = { x: 0, y: 1.6, z: 0 }
const IMPACT = { x: 0, y: 1.6, z: 40 }

describe('fireTracer', () => {
  it('acende um feixe do cano ao impacto', () => {
    const pool = createTracerPool(4, LIFETIME_S)
    const slot = pool.slots[fireTracer(pool, MUZZLE, IMPACT)]
    expect(slot?.remainingS).toBe(LIFETIME_S)
    expect(slot?.startZ).toBe(0)
    expect(slot?.endZ).toBe(40)
  })

  it('usa os slots em rodízio', () => {
    const pool = createTracerPool(3, LIFETIME_S)
    expect([fireTracer(pool, MUZZLE, IMPACT), fireTracer(pool, MUZZLE, IMPACT)]).toEqual([0, 1])
  })

  it('com a piscina cheia, o tiro novo rouba o slot mais velho', () => {
    const pool = createTracerPool(2, LIFETIME_S)
    fireTracer(pool, MUZZLE, IMPACT)
    fireTracer(pool, MUZZLE, IMPACT)
    expect(fireTracer(pool, MUZZLE, IMPACT)).toBe(0)
  })

  it('reaproveita os slots, sem alocar por tiro', () => {
    const pool = createTracerPool(2, LIFETIME_S)
    const first = pool.slots[fireTracer(pool, MUZZLE, IMPACT)]
    fireTracer(pool, MUZZLE, IMPACT)
    expect(pool.slots[fireTracer(pool, MUZZLE, IMPACT)]).toBe(first)
  })
})

describe('advanceTracers', () => {
  it('o feixe apaga depois da vida que a configuração manda', () => {
    const pool = createTracerPool(2, LIFETIME_S)
    fireTracer(pool, MUZZLE, IMPACT)
    advanceTracers(pool, LIFETIME_S / 2)
    expect(pool.slots[0]?.remainingS).toBeGreaterThan(0)
    advanceTracers(pool, LIFETIME_S)
    expect(pool.slots[0]?.remainingS).toBe(0)
  })

  it('slot apagado não fica com tempo negativo', () => {
    const pool = createTracerPool(2, LIFETIME_S)
    advanceTracers(pool, 10)
    expect(pool.slots[0]?.remainingS).toBe(0)
  })

  it('recusa tempo de quadro que anda para trás', () => {
    expect(() => advanceTracers(createTracerPool(1, LIFETIME_S), -1)).toThrow(/dtS recebeu -1/)
  })
})

describe('tracerOpacity', () => {
  it('cai de 1 a 0 ao longo da vida do feixe', () => {
    const pool = createTracerPool(1, LIFETIME_S)
    fireTracer(pool, MUZZLE, IMPACT)
    const slot = pool.slots[0]
    if (!slot) throw new Error('a piscina nasceu vazia')
    expect(tracerOpacity(slot, LIFETIME_S)).toBe(1)
    advanceTracers(pool, LIFETIME_S / 2)
    expect(tracerOpacity(slot, LIFETIME_S)).toBeCloseTo(0.25, 1)
    advanceTracers(pool, LIFETIME_S)
    expect(tracerOpacity(slot, LIFETIME_S)).toBe(0)
  })
})

describe('beamLengthM', () => {
  const wall = boxFromCenterSize([0, 5, 12], [20, 10, 1])

  it('para na primeira parede no caminho', () => {
    expect(beamLengthM(MUZZLE, { x: 0, y: 0, z: 1 }, [wall], 400)).toBeCloseTo(11.5)
  })

  it('sem parede, vai até o alcance da arma', () => {
    expect(beamLengthM(MUZZLE, { x: 0, y: 0, z: 1 }, [], 400)).toBe(400)
  })

  it('parede atrás do atirador não encurta o feixe', () => {
    expect(beamLengthM(MUZZLE, { x: 0, y: 0, z: -1 }, [wall], 400)).toBe(400)
  })
})

describe('as três camadas do rastro', () => {
  function firedPool(): ReturnType<typeof createTracerPool> {
    const pool = createTracerPool(1, LIFETIME_S)
    fireTracer(pool, MUZZLE, IMPACT)
    return pool
  }

  function slotOf(pool: ReturnType<typeof createTracerPool>) {
    const slot = pool.slots[0]
    if (!slot) throw new Error('a piscina nasceu vazia')
    return slot
  }

  /** Rampa reta lê como faixa pendurada no ar; ao quadrado lê como clarão. */
  it('o halo cai mais rápido no começo do que no fim', () => {
    const pool = firedPool()
    const slot = slotOf(pool)
    advanceTracers(pool, LIFETIME_S * 0.25)
    const afterQuarter = tracerOpacity(slot, LIFETIME_S)
    expect(afterQuarter).toBeLessThan(0.75)
    expect(afterQuarter).toBeGreaterThan(0.4)
  })

  /** Núcleo, halo e estouro com tempos diferentes é o que separa feixe de cilindro. */
  it('o núcleo e o estouro apagam antes do halo', () => {
    const pool = firedPool()
    const slot = slotOf(pool)
    advanceTracers(pool, LIFETIME_S * 0.5)
    expect(tracerCoreOpacity(slot, LIFETIME_S)).toBe(0)
    expect(tracerFlashOpacity(slot, LIFETIME_S)).toBe(0)
    expect(tracerOpacity(slot, LIFETIME_S)).toBeGreaterThan(0)
  })

  it('o estouro apaga antes do núcleo', () => {
    expect(TRACER_FLASH_FRACTION).toBeLessThan(TRACER_CORE_FRACTION)
  })

  it('as três camadas acendem cheias no quadro do tiro', () => {
    const slot = slotOf(firedPool())
    expect(tracerOpacity(slot, LIFETIME_S)).toBeCloseTo(1, 6)
    expect(tracerCoreOpacity(slot, LIFETIME_S)).toBeCloseTo(1, 6)
    expect(tracerFlashOpacity(slot, LIFETIME_S)).toBeCloseTo(1, 6)
  })

  it('slot livre não acende camada nenhuma', () => {
    const pool = createTracerPool(1, LIFETIME_S)
    const slot = slotOf(pool)
    expect(tracerOpacity(slot, LIFETIME_S)).toBe(0)
    expect(tracerCoreOpacity(slot, LIFETIME_S)).toBe(0)
    expect(tracerFlashOpacity(slot, LIFETIME_S)).toBe(0)
  })
})
