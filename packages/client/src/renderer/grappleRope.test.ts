import { describe, expect, it } from 'vitest'
import {
  advanceGrappleRope,
  createGrappleRope,
  isAnchorMarked,
  isRopeVisible,
  ROPE_RETRACT_S,
  ROPE_SHOOT_S,
  ropeTipM,
} from './grappleRope.ts'

const ANCHOR = { x: 0, y: 10, z: 20 }
const OTHER_ANCHOR = { x: 5, y: 3, z: 0 }
const HAND = { x: 0, y: 2, z: 0 }

describe('grappleRope', () => {
  it('nasce recolhido e invisível', () => {
    const rope = createGrappleRope()
    expect(isRopeVisible(rope)).toBe(false)
    expect(isAnchorMarked(rope)).toBe(false)
  })

  it('no engate, viaja da mão até a âncora em ROPE_SHOOT_S', () => {
    const rope = createGrappleRope()
    advanceGrappleRope(rope, true, ANCHOR, ROPE_SHOOT_S / 2)
    expect(rope.extension).toBeCloseTo(0.5)
    expect(isRopeVisible(rope)).toBe(true)
    expect(isAnchorMarked(rope)).toBe(false)
    advanceGrappleRope(rope, true, ANCHOR, ROPE_SHOOT_S)
    expect(rope.extension).toBe(1)
    expect(isAnchorMarked(rope)).toBe(true)
  })

  it('a ponta desacelera na chegada e para na âncora', () => {
    const rope = createGrappleRope()
    const tip = { x: 0, y: 0, z: 0 }
    advanceGrappleRope(rope, true, ANCHOR, ROPE_SHOOT_S / 2)
    ropeTipM(rope, HAND, tip)
    // metade do tempo, três quartos do caminho.
    expect(tip.z).toBeCloseTo(15)
    advanceGrappleRope(rope, true, ANCHOR, ROPE_SHOOT_S)
    expect(ropeTipM(rope, HAND, tip)).toEqual(ANCHOR)
  })

  it('na soltura, recolhe em ROPE_RETRACT_S e some, sem perder de onde volta', () => {
    const rope = createGrappleRope()
    advanceGrappleRope(rope, true, ANCHOR, 1)
    advanceGrappleRope(rope, false, OTHER_ANCHOR, ROPE_RETRACT_S / 2)
    expect(rope.extension).toBeCloseTo(0.5)
    expect(rope.anchorM).toEqual(ANCHOR)
    expect(isAnchorMarked(rope)).toBe(false)
    advanceGrappleRope(rope, false, OTHER_ANCHOR, ROPE_RETRACT_S)
    expect(isRopeVisible(rope)).toBe(false)
  })

  it('um engate novo no meio do recolhimento recomeça da mão, na âncora nova', () => {
    const rope = createGrappleRope()
    advanceGrappleRope(rope, true, ANCHOR, 1)
    advanceGrappleRope(rope, false, ANCHOR, ROPE_RETRACT_S / 4)
    advanceGrappleRope(rope, true, OTHER_ANCHOR, 0)
    expect(rope.extension).toBe(0)
    expect(rope.anchorM).toEqual(OTHER_ANCHOR)
  })

  it.each([Number.NaN, -0.01])('recusa tempo de quadro inválido: %p', (dtS) => {
    expect(() => advanceGrappleRope(createGrappleRope(), true, ANCHOR, dtS)).toThrow(
      `dtS recebeu ${dtS}`,
    )
  })
})
