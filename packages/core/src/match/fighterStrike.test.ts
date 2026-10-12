import { describe, expect, it } from 'vitest'
import { createMeleeReach } from '../melee/meleeReach.ts'
import { createMeleeHit } from '../melee/resolveMeleeStrike.ts'
import { createCharacterState } from '../movement/characterState.ts'
import { shippedConfig } from '../movement/movementTestKit.ts'
import { createKillEvent } from '../scoring/killEvent.ts'
import type { Fighter } from './fighter.ts'
import { describeMeleeKill, facingCosine, resolveFighterStrike } from './fighterStrike.ts'

const config = shippedConfig()

function fighterAt(id: string, z: number, facingZ: number): Fighter {
  const body = createCharacterState({ x: 0, y: 0, z }, config)
  body.grounded = true
  return { id, body, facingM: { x: 0, y: 0, z: facingZ }, alive: true, respawnLeftS: 0 }
}

describe('resolveFighterStrike', () => {
  it('usa o alcance da arma pedida', () => {
    const fighters = [fighterAt('a', 0, 1), fighterAt('b', 2.9, 1)]
    const range = { boxes: [], config, reach: createMeleeReach(config) }
    const hit = createMeleeHit()
    const strikeWith = (weapon: 'knife' | 'katana') =>
      resolveFighterStrike(
        { strikerIndex: 0, eyeM: { x: 0, y: 1.6, z: 0 }, aimM: { x: 0, y: 0, z: 1 }, weapon },
        fighters,
        range,
        hit,
      )
    expect(strikeWith('knife')).toBe(-1)
    expect(strikeWith('katana')).toBe(1)
  })
})

describe('describeMeleeKill', () => {
  it('escreve a kill de lâmina, de costas, sem luneta e sem altura de acerto', () => {
    const striker = fighterAt('striker', 0, 1)
    const victim = fighterAt('victim', 1.5, 1)
    const kill = describeMeleeKill(createKillEvent(), {
      striker,
      victim,
      weapon: 'katana',
      hit: { targetIndex: 1, distanceM: 1.5 },
      atS: 12,
    })
    expect(kill).toMatchObject({
      shooterId: 'striker',
      victimId: 'victim',
      weapon: 'katana',
      scoped: false,
      distanceM: 1.5,
      hitHeightRatio: 0,
      shooterAirborne: false,
      atS: 12,
    })
    expect(kill.victimFacingCos).toBeCloseTo(-1)
  })
})

describe('facingCosine', () => {
  it('de frente é 1, de lado 0, de costas -1', () => {
    const striker = fighterAt('s', 0, 1)
    expect(facingCosine(fighterAt('v', 2, -1), striker)).toBeCloseTo(1)
    expect(
      facingCosine({ ...fighterAt('v', 2, 0), facingM: { x: 1, y: 0, z: 0 } }, striker),
    ).toBeCloseTo(0)
    expect(facingCosine(fighterAt('v', 2, 1), striker)).toBeCloseTo(-1)
  })

  it('sem olhar no plano, ou no mesmo ponto, não há costas', () => {
    const striker = fighterAt('s', 0, 1)
    expect(facingCosine({ ...fighterAt('v', 2, 0), facingM: { x: 0, y: 1, z: 0 } }, striker)).toBe(
      1,
    )
    expect(facingCosine(fighterAt('v', 0, 1), striker)).toBe(1)
  })
})
