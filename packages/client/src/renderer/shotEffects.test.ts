import { createSeededRandom } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  advanceEffects,
  BODY_HIT,
  burstLook,
  claimEffect,
  createBurstLook,
  createEffectPool,
  DECAL_FADE_S,
  decalOpacity,
  type EffectSlot,
  flashIntensity,
  isLive,
  MUZZLE_SMOKE,
  WALL_SPARK,
} from './shotEffects.ts'

describe('createEffectPool', () => {
  it('recusa tamanho que não é inteiro positivo', () => {
    expect(() => createEffectPool(0)).toThrow(/size recebeu 0/)
    expect(() => createEffectPool(1.5)).toThrow(RangeError)
  })

  it('nasce com todos os slots livres', () => {
    expect(createEffectPool(3).slots.every((slot) => !isLive(slot))).toBe(true)
  })
})

describe('claimEffect', () => {
  it('acende em rodízio, e o tiro novo rouba o slot mais velho', () => {
    const pool = createEffectPool(2)
    const random = createSeededRandom(1)
    expect([0, 1, 2].map(() => claimEffect(pool, 1, random))).toEqual([0, 1, 0])
  })

  it('sorteia giro e escala dentro das faixas', () => {
    const pool = createEffectPool(8)
    const random = createSeededRandom(9)
    for (let shot = 0; shot < 8; shot += 1) {
      const slot = pool.slots[claimEffect(pool, 1, random)]
      expect(slot?.roll).toBeGreaterThanOrEqual(0)
      expect(slot?.roll).toBeLessThan(Math.PI * 2)
      expect(slot?.scale).toBeGreaterThanOrEqual(0.85)
      expect(slot?.scale).toBeLessThan(1.2)
    }
  })

  it('dois clarões seguidos não saem iguais', () => {
    const pool = createEffectPool(2)
    const random = createSeededRandom(3)
    claimEffect(pool, 1, random)
    claimEffect(pool, 1, random)
    expect(pool.slots[0]?.roll).not.toBe(pool.slots[1]?.roll)
  })

  it('recusa vida que não é positiva', () => {
    expect(() => claimEffect(createEffectPool(1), 0, createSeededRandom(1))).toThrow(/lifeS/)
  })
})

describe('advanceEffects', () => {
  it('envelhece o vivo e o libera depois da vida', () => {
    const pool = createEffectPool(1)
    claimEffect(pool, 0.1, createSeededRandom(1))
    advanceEffects(pool, 0.05)
    expect(pool.slots[0]?.ageS).toBeCloseTo(0.05)
    expect(isLive(pool.slots[0] as EffectSlot)).toBe(true)
    advanceEffects(pool, 0.06)
    expect(isLive(pool.slots[0] as EffectSlot)).toBe(false)
  })

  it('slot livre não envelhece', () => {
    const pool = createEffectPool(1)
    advanceEffects(pool, 3)
    expect(pool.slots[0]?.ageS).toBe(0)
  })

  it('recusa passo de quadro inválido', () => {
    expect(() => advanceEffects(createEffectPool(1), -1)).toThrow(/dtS recebeu -1/)
    expect(() => advanceEffects(createEffectPool(1), Number.NaN)).toThrow(RangeError)
  })
})

describe('burstLook', () => {
  it('o clarão nasce cheio, pequeno, e cai ao quadrado', () => {
    const look = burstLook(WALL_SPARK, 0, createBurstLook())
    expect(look.alpha).toBe(1)
    expect(look.sizeM).toBe(WALL_SPARK.sizeFromM)
    burstLook(WALL_SPARK, WALL_SPARK.lifeS / 2, look)
    expect(look.alpha).toBeCloseTo(0.25)
  })

  it('cresce rápido e freia: na metade da vida já passou de três quartos', () => {
    const look = burstLook(BODY_HIT, BODY_HIT.lifeS / 2, createBurstLook())
    const span = BODY_HIT.sizeToM - BODY_HIT.sizeFromM
    expect(look.sizeM).toBeCloseTo(BODY_HIT.sizeFromM + span * 0.75)
  })

  it('a fumaça entra suave, sobe e some no fim', () => {
    const look = createBurstLook()
    expect(burstLook(MUZZLE_SMOKE, 0, look).alpha).toBe(0)
    burstLook(MUZZLE_SMOKE, MUZZLE_SMOKE.lifeS * 0.15, look)
    expect(look.alpha).toBeCloseTo(MUZZLE_SMOKE.peakAlpha * 0.85)
    expect(look.riseM).toBeGreaterThan(0)
    expect(burstLook(MUZZLE_SMOKE, MUZZLE_SMOKE.lifeS, look).alpha).toBe(0)
  })

  it('depois da vida fica no fim, sem passar do tamanho final', () => {
    const look = burstLook(WALL_SPARK, 10, createBurstLook())
    expect(look.sizeM).toBe(WALL_SPARK.sizeToM)
    expect(look.alpha).toBe(0)
  })
})

describe('decalOpacity', () => {
  it('cheia até o começo do esmaecimento, e em rampa até zero', () => {
    const slot = { ageS: 0, lifeS: 6, roll: 0, scale: 1 }
    expect(decalOpacity(slot)).toBe(1)
    slot.ageS = 6 - DECAL_FADE_S / 2
    expect(decalOpacity(slot)).toBeCloseTo(0.5)
  })

  it('slot livre não tem furo', () => {
    expect(decalOpacity({ ageS: 0, lifeS: 0, roll: 0, scale: 1 })).toBe(0)
  })
})

describe('flashIntensity', () => {
  it('menos movimento, clarão mais fraco', () => {
    expect(flashIntensity(false)).toBe(1)
    expect(flashIntensity(true)).toBeLessThan(1)
  })
})
