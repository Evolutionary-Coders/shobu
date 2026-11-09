import { describe, expect, it } from 'vitest'
import {
  createScorestreakTrigger,
  latchScorestreakSlot,
  releaseScorestreakTrigger,
  scorestreakSlotOf,
  takeScorestreakSlot,
} from './scorestreakTrigger.ts'

describe('scorestreakTrigger', () => {
  it('nasce sem aperto', () => {
    expect(takeScorestreakSlot(createScorestreakTrigger())).toBe(-1)
  })

  it('o aperto sobrevive até um tick o ler, e só uma vez', () => {
    const trigger = createScorestreakTrigger()
    latchScorestreakSlot(trigger, 2)
    expect(takeScorestreakSlot(trigger)).toBe(2)
    expect(takeScorestreakSlot(trigger)).toBe(-1)
  })

  it('o último aperto vale', () => {
    const trigger = createScorestreakTrigger()
    latchScorestreakSlot(trigger, 0)
    latchScorestreakSlot(trigger, 1)
    expect(takeScorestreakSlot(trigger)).toBe(1)
  })

  it('slot negativo não arma nem apaga o aperto pendente', () => {
    const trigger = createScorestreakTrigger()
    latchScorestreakSlot(trigger, 1)
    latchScorestreakSlot(trigger, -1)
    expect(takeScorestreakSlot(trigger)).toBe(1)
  })

  it('soltar esquece o aperto', () => {
    const trigger = createScorestreakTrigger()
    latchScorestreakSlot(trigger, 0)
    releaseScorestreakTrigger(trigger)
    expect(takeScorestreakSlot(trigger)).toBe(-1)
  })
})

describe('scorestreakSlotOf', () => {
  it.each([
    ['scorestreak1', 0],
    ['scorestreak2', 1],
    ['scorestreak3', 2],
    ['jump', -1],
  ] as const)('%s → %i', (action, slot) => {
    expect(scorestreakSlotOf(action)).toBe(slot)
  })
})
