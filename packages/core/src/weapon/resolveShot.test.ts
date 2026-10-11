import { describe, expect, it } from 'vitest'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import { createTargetList, pushTarget, type TargetList } from '../collision/targetList.ts'
import { createSeededRandom } from '../math/seededRandom.ts'
import { createShotHit, resolveShot, type ShotOrigin } from './resolveShot.ts'
import { spreadTangent } from './spreadTangent.ts'

const EYE = { x: 0, y: 1.66, z: 0 }
const FORWARD = { x: 0, y: 0, z: 1 }
const RANGE_M = 400

const exactShot: ShotOrigin = {
  originM: EYE,
  aimM: FORWARD,
  exact: true,
  spreadTangent: spreadTangent(4.5),
  maxDistanceM: RANGE_M,
}

function targetAt(z: number, sourceIndex = 3): TargetList {
  const list = createTargetList(4)
  pushTarget(list, sourceIndex, { x: 0, y: 0, z }, 0.4, 1.8)
  return list
}

function shoot(
  world: readonly StaticBox[],
  targets: TargetList,
  over: Partial<ShotOrigin> = {},
): ReturnType<typeof createShotHit> {
  return resolveShot(
    { ...exactShot, ...over },
    world,
    targets,
    createSeededRandom(1),
    createShotHit(),
  )
}

describe('resolveShot', () => {
  it('o tiro exato acerta o alvo na mira', () => {
    const hit = shoot([], targetAt(30))
    expect(hit.targetIndex).toBe(3)
    expect(hit.distanceM).toBeCloseTo(29.6)
  })

  /** A regra que impede matar através de cobertura. */
  it('a parede mais perto ganha do alvo atrás dela', () => {
    const wall = boxFromCenterSize([0, 5, 15], [20, 10, 1])
    const hit = shoot([wall], targetAt(30))
    expect(hit.targetIndex).toBe(-1)
    expect(hit.distanceM).toBeCloseTo(14.5)
  })

  it('o alvo mais perto ganha da parede atrás dele', () => {
    const wall = boxFromCenterSize([0, 5, 50], [20, 10, 1])
    expect(shoot([wall], targetAt(30)).targetIndex).toBe(3)
  })

  it('sem acerto nenhum, o rastro vai até o alcance da arma', () => {
    const hit = shoot([], createTargetList(4))
    expect(hit.targetIndex).toBe(-1)
    expect(hit.distanceM).toBe(RANGE_M)
    expect(hit.endpointM.z).toBeCloseTo(RANGE_M)
  })

  it('o rastro termina exatamente no ponto do acerto', () => {
    const hit = shoot([], targetAt(30))
    expect(hit.endpointM.y).toBeCloseTo(EYE.y)
    expect(hit.endpointM.z).toBeCloseTo(29.6)
  })

  it('normaliza a mira: direção comprida não estica a distância', () => {
    const hit = shoot([], targetAt(30), { aimM: { x: 0, y: 0, z: 17 } })
    expect(hit.distanceM).toBeCloseTo(29.6)
  })

  /** A reprodução que o servidor precisa: mesma entrada, mesmo tiro. */
  it('a mesma semente e a mesma mira produzem exatamente o mesmo tiro', () => {
    const spread = { exact: false }
    const first = resolveShot(
      { ...exactShot, ...spread },
      [],
      targetAt(30),
      createSeededRandom(9),
      createShotHit(),
    )
    const second = resolveShot(
      { ...exactShot, ...spread },
      [],
      targetAt(30),
      createSeededRandom(9),
      createShotHit(),
    )
    expect(first).toEqual(second)
  })

  it('o disparo com mira não sofre desvio nenhum', () => {
    const hit = shoot([], createTargetList(4))
    expect(hit.directionM).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('sem mira o disparo desvia', () => {
    const hit = shoot([], createTargetList(4), { exact: false })
    expect(hit.directionM.z).toBeLessThan(1)
  })

  /** A 60 m o no scope erra muito: é o número que o primeiro playtest vai reescrever. */
  it('sem mira, o alvo distante às vezes escapa', () => {
    let misses = 0
    for (let shotIndex = 0; shotIndex < 60; shotIndex += 1) {
      const hit = resolveShot(
        { ...exactShot, exact: false },
        [],
        targetAt(60),
        createSeededRandom(shotIndex),
        createShotHit(),
      )
      if (hit.targetIndex === -1) misses += 1
    }
    expect(misses).toBeGreaterThan(0)
  })
})
