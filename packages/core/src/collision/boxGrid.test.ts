import { describe, expect, it } from 'vitest'
import { createSeededRandom, nextUnit, type SeededRandom } from '../math/seededRandom.ts'
import { boxGridOf } from './boxGrid.ts'
import { COLLIDER_GRAPPLE_ONLY, COLLIDER_SOLID, STOPS_GRAPPLE, STOPS_SHOT } from './colliderMask.ts'
import { createBoxHit, nearestBoxHit, rayBoxDistance } from './raycastBoxes.ts'
import { boxFromCenterSize, type StaticBox } from './staticBox.ts'

/** A resposta sem grade: toda caixa, em ordem, e o empate fica com o menor índice. */
function bruteForce(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  boxes: readonly StaticBox[],
  maxDistanceM: number,
  stops: number,
) {
  let best = { index: -1, distanceM: maxDistanceM }
  for (const [index, box] of boxes.entries()) {
    if ((box.mask & stops) === 0) continue
    const distance = rayBoxDistance(origin, direction, box)
    if (distance !== undefined && distance < best.distanceM) best = { index, distanceM: distance }
  }
  return best
}

const between = (rng: SeededRandom, low: number, high: number) => low + (high - low) * nextUnit(rng)

/** Uma cidade de mentira: piso, parede grande e centenas de caixas pequenas, de dois tipos. */
function randomCity(rng: SeededRandom): readonly StaticBox[] {
  const boxes = [
    boxFromCenterSize([0, -0.5, 0], [120, 1, 120]),
    boxFromCenterSize([0, 20, 61], [122, 40, 2]),
  ]
  for (let index = 0; index < 400; index += 1) {
    const center = [between(rng, -55, 55), between(rng, 0, 30), between(rng, -55, 55)] as const
    const size = [between(rng, 0.2, 9), between(rng, 0.2, 6), between(rng, 0.2, 9)] as const
    boxes.push(boxFromCenterSize(center, size, index % 3 ? COLLIDER_SOLID : COLLIDER_GRAPPLE_ONLY))
  }
  return boxes
}

describe('boxGridOf', () => {
  it('monta a grade uma vez por lista e a reaproveita', () => {
    const boxes = [boxFromCenterSize([0, 0, 0], [1, 1, 1])]
    expect(boxGridOf(boxes)).toBe(boxGridOf(boxes))
  })

  it('põe a caixa enorme na lista de sempre, e a pequena nas células dela', () => {
    const grid = boxGridOf([
      boxFromCenterSize([0, -0.5, 0], [100, 1, 100]),
      boxFromCenterSize([3, 1, 3], [1, 1, 1]),
    ])
    expect([...grid.always]).toEqual([0])
    expect([...grid.cellBoxes]).toEqual([1])
  })
})

describe('nearestBoxHit com a grade', () => {
  const rng = createSeededRandom(2024)
  const city = randomCity(rng)
  const hit = createBoxHit()

  it('acha a mesma caixa, à mesma distância, que a varredura de todas', () => {
    for (let ray = 0; ray < 2000; ray += 1) {
      const origin = {
        x: between(rng, -70, 70),
        y: between(rng, 0.5, 35),
        z: between(rng, -70, 70),
      }
      const direction = { x: between(rng, -1, 1), y: between(rng, -1, 1), z: between(rng, -1, 1) }
      const stops = ray % 2 ? STOPS_SHOT : STOPS_GRAPPLE
      const expected = bruteForce(origin, direction, city, 60, stops)
      nearestBoxHit(origin, direction, city, 60, stops, hit)
      expect({ index: hit.index, distanceM: hit.distanceM }, `raio ${ray}`).toEqual(expected)
    }
  })

  it('anda certo no raio paralelo a um eixo e no raio vertical', () => {
    for (const direction of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]) {
      const origin = { x: 3.3, y: 12, z: -7.1 }
      const expected = bruteForce(origin, direction, city, 200, STOPS_SHOT)
      nearestBoxHit(origin, direction, city, 200, STOPS_SHOT, hit)
      expect({ index: hit.index, distanceM: hit.distanceM }).toEqual(expected)
    }
  })

  it('no empate de distância fica com o menor índice, como a varredura', () => {
    const twins = [
      boxFromCenterSize([0, 0, 30], [2, 2, 2]),
      boxFromCenterSize([9, 0, 10], [2, 2, 2]),
      boxFromCenterSize([0, 0, 10], [2, 2, 2]),
      boxFromCenterSize([0, 0, 10], [2, 2, 2]),
    ]
    nearestBoxHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, twins, 50, STOPS_SHOT, hit)
    expect(hit.index).toBe(2)
  })

  it('raio que nunca entra na grade ainda vê a caixa de sempre', () => {
    const origin = { x: 0, y: 5, z: 300 }
    nearestBoxHit(origin, { x: 0, y: -1, z: 0 }, city, 50, STOPS_SHOT, hit)
    expect(hit.index).toBe(-1)
    nearestBoxHit(
      { x: 0, y: 5, z: 0 },
      { x: 0, y: -1, z: 0 },
      [city[0] as StaticBox],
      50,
      STOPS_SHOT,
      hit,
    )
    expect(hit.distanceM).toBeCloseTo(5)
  })

  it('a marca de "já testada" dá a volta sem esquecer caixa', () => {
    const grid = boxGridOf(city)
    grid.stamp = 0xffffffff
    const origin = { x: 1, y: 2, z: 3 }
    const direction = { x: 0.3, y: -0.1, z: 1 }
    nearestBoxHit(origin, direction, city, 60, STOPS_SHOT, hit)
    expect(grid.stamp).toBe(1)
    expect(hit.index).toBe(bruteForce(origin, direction, city, 60, STOPS_SHOT).index)
  })
})
