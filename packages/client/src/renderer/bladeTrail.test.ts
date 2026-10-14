import { describe, expect, it } from 'vitest'
import {
  clearBladeTrail,
  createBladeTrail,
  pushTrailSample,
  TRAIL_PEAK,
  TRAIL_SAMPLES,
  trailIndices,
  writeTrailRibbon,
} from './bladeTrail.ts'

const RED: readonly [number, number, number] = [1, 0.2, 0.2]

function ribbon(trail: ReturnType<typeof createBladeTrail>, strength: number, nowS = 0) {
  const positions = new Float32Array(TRAIL_SAMPLES * 6)
  const colors = new Float32Array(TRAIL_SAMPLES * 8)
  writeTrailRibbon(trail, strength, nowS, RED, positions, colors)
  return { positions, colors }
}

describe('bladeTrail', () => {
  it('a amostra nova entra na frente e empurra as velhas', () => {
    const trail = createBladeTrail()
    pushTrailSample(trail, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0)
    pushTrailSample(trail, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, 0.02)
    expect([...trail.samples.slice(0, 12)]).toEqual([1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0])
    expect(trail.count).toBe(2)
  })

  it('a fita brilha mais na ponta e na amostra nova, e apaga com a idade', () => {
    const trail = createBladeTrail()
    const lastS = (TRAIL_SAMPLES + 2) * 0.03
    for (let step = 0; step < TRAIL_SAMPLES + 3; step += 1) {
      pushTrailSample(trail, { x: step, y: 0, z: 0 }, { x: step, y: 1, z: 0 }, step * 0.03)
    }
    expect(trail.count).toBe(TRAIL_SAMPLES)
    const { colors } = ribbon(trail, 1, lastS)
    // vértice 1 é a ponta da amostra nova; 0, o meio dela, que esfuma.
    expect(colors[7]).toBeCloseTo(TRAIL_PEAK)
    expect(colors[3]).toBe(0)
    // a amostra de mais de TRAIL_LIFE_S atrás já apagou, esteja onde estiver na fila.
    expect(colors[colors.length - 1]).toBe(0)
    expect(colors[2 * 5 * 4 - 1]).toBe(0)
    expect([...colors.slice(4, 7)]).toEqual(RED.map((c) => Math.fround(c)))
  })

  it('com uma amostra só, ou limpa, a fita é achatada e apagada', () => {
    const trail = createBladeTrail()
    pushTrailSample(trail, { x: 5, y: 0, z: 0 }, { x: 5, y: 1, z: 0 }, 0)
    const { positions, colors } = ribbon(trail, 1)
    expect(positions[6 * (TRAIL_SAMPLES - 1)]).toBe(5)
    expect(colors.every((value, index) => index % 4 !== 3 || value === 0)).toBe(true)
    clearBladeTrail(trail)
    expect(trail.count).toBe(0)
    expect(ribbon(trail, 1).positions[0]).toBe(5)
  })

  it('dois triângulos entre cada amostra e a seguinte', () => {
    const indices = trailIndices()
    expect(indices).toHaveLength((TRAIL_SAMPLES - 1) * 6)
    expect(Math.max(...indices)).toBe(TRAIL_SAMPLES * 2 - 1)
  })
})
