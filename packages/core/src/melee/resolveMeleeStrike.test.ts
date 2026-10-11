import { describe, expect, it } from 'vitest'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import type { Fighter } from '../match/fighter.ts'
import { createCharacterState } from '../movement/characterState.ts'
import { createMeleeReach } from './meleeReach.ts'
import { shippedConfig } from './meleeTestKit.ts'
import { createMeleeHit, resolveMeleeStrike } from './resolveMeleeStrike.ts'

const config = shippedConfig()
const reach = createMeleeReach(config)
const RADIUS_M = config.collision.capsuleRadiusM
const EYE = { x: 0, y: 1.66, z: 0 }
const AHEAD = { x: 0, y: 0, z: 1 }

function fighterAt(id: string, x: number, z: number, alive = true): Fighter {
  const body = createCharacterState({ x, y: 0, z }, config)
  return { id, body, facingM: { x: 0, y: 0, z: 1 }, alive, respawnLeftS: 0 }
}

const striker = fighterAt('striker', 0, 0)

function strike(
  fighters: readonly Fighter[],
  weapon: 'knife' | 'katana' = 'knife',
  boxes: readonly StaticBox[] = [],
) {
  const hit = createMeleeHit()
  const victim = resolveMeleeStrike(
    { strikerIndex: 0, eyeM: EYE, aimM: AHEAD, reach: reach[weapon] },
    fighters,
    boxes,
    RADIUS_M,
    hit,
  )
  return { victim, hit }
}

describe('resolveMeleeStrike', () => {
  it('pega quem está à frente dentro do alcance, contado até a superfície da cápsula', () => {
    const { victim, hit } = strike([striker, fighterAt('a', 0, config.melee.knifeReachM + 0.3)])
    expect(victim).toBe(1)
    expect(hit.distanceM).toBeCloseTo(config.melee.knifeReachM + 0.3)
  })

  it('não pega além do alcance da faca, mas a katana alcança', () => {
    const fighters = [striker, fighterAt('a', 0, config.melee.knifeReachM + 0.6)]
    expect(strike(fighters).victim).toBe(-1)
    expect(strike(fighters, 'katana').victim).toBe(1)
  })

  it('não pega quem está ao lado, fora do arco, nem quem está atrás', () => {
    expect(strike([striker, fighterAt('a', 1.8, 0.4)]).victim).toBe(-1)
    expect(strike([striker, fighterAt('a', 0, -1.5)]).victim).toBe(-1)
  })

  it('o arco largo da katana pega de lado o que a faca não pega', () => {
    const fighters = [striker, fighterAt('a', 1.4, 1.2)]
    expect(strike(fighters).victim).toBe(-1)
    expect(strike(fighters, 'katana').victim).toBe(1)
  })

  it('pega o mais perto entre dois, e ignora os mortos', () => {
    const fighters = [
      striker,
      fighterAt('far', 0, 1.9),
      fighterAt('near', 0, 1),
      fighterAt('dead', 0, 0.8, false),
    ]
    expect(strike(fighters).victim).toBe(2)
  })

  it('colado, dentro da cápsula, pega sem olhar a direção', () => {
    expect(strike([striker, fighterAt('a', 0.1, -0.1)]).victim).toBe(1)
  })

  it('a parede no meio protege', () => {
    const wall = boxFromCenterSize([0, 1, 1], [4, 4, 0.2])
    expect(strike([striker, fighterAt('a', 0, 1.8)], 'knife', [wall]).victim).toBe(-1)
  })

  it('sem vítima, a distância é zero', () => {
    expect(strike([striker]).hit.distanceM).toBe(0)
  })
})

describe('createMeleeReach', () => {
  it('o arco vira cosseno arredondado, menor para o arco mais largo', () => {
    expect(reach.knife.minCos).toBeGreaterThan(reach.katana.minCos)
    expect(Math.round(reach.katana.minCos * 1e6)).toBe(reach.katana.minCos * 1e6)
  })
})
