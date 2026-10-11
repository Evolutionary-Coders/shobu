import { describe, expect, it } from 'vitest'
import { BOXES, config, standingFighter } from '../bots/botTestKit.ts'
import { createTargetList } from '../collision/targetList.ts'
import { createKillEvent } from '../scoring/killEvent.ts'
import { createShotHit } from '../weapon/resolveShot.ts'
import { spreadTangent } from '../weapon/spreadTangent.ts'
import { createWeaponState } from '../weapon/weaponState.ts'
import type { Fighter } from './fighter.ts'
import { describeSniperKill, resolveFighterShot, type ShotRange } from './fighterShot.ts'

const RANGE: ShotRange = {
  boxes: BOXES,
  config,
  coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
  targets: createTargetList(4),
}

/** O atirador em z -10 olhando para o norte; a parede da arena de bolso fica em z 0. */
function lineUp(): Fighter[] {
  return [
    standingFighter('bot-0', { x: 8, y: 0, z: -10 }),
    standingFighter('local', { x: 8, y: 0, z: 10 }),
    standingFighter('bot-1', { x: 0, y: 0, z: 10 }),
  ]
}

function exactWeapon(shotsFired = 1): ReturnType<typeof createWeaponState> {
  return { ...createWeaponState(config), firedExact: true, firedScoped: true, shotsFired }
}

describe('resolveFighterShot', () => {
  it('o tiro exato no peito acerta, e devolve o índice da vítima', () => {
    const fighters = lineUp()
    const shot = createShotHit()
    const victim = resolveFighterShot(
      {
        shooterIndex: 0,
        eyeM: { x: 8, y: 1.6, z: -10 },
        aimM: { x: 0, y: 0, z: 1 },
        weapon: exactWeapon(),
        seedBase: 1,
      },
      fighters,
      RANGE,
      shot,
    )
    expect(victim).toBe(1)
    expect(shot.distanceM).toBeCloseTo(19.6, 1)
  })

  it('a parede no meio para o tiro', () => {
    const shot = createShotHit()
    const victim = resolveFighterShot(
      {
        shooterIndex: 0,
        eyeM: { x: 0, y: 1.6, z: -10 },
        aimM: { x: 0, y: 0, z: 1 },
        weapon: exactWeapon(),
        seedBase: 1,
      },
      lineUp(),
      RANGE,
      shot,
    )
    expect(victim).toBe(-1)
    expect(shot.distanceM).toBeCloseTo(9, 1)
  })

  it('o atirador não acerta a si mesmo', () => {
    const victim = resolveFighterShot(
      {
        shooterIndex: 1,
        eyeM: { x: 8, y: 1.6, z: 10 },
        aimM: { x: 0, y: -1, z: 0 },
        weapon: exactWeapon(),
        seedBase: 1,
      },
      lineUp(),
      RANGE,
      createShotHit(),
    )
    expect(victim).toBe(-1)
  })

  /** Dois combatentes no mesmo número de tiro não podem desviar igual. */
  it('sem mira, o desvio muda com o atirador e repete com a mesma entrada', () => {
    const weapon = { ...createWeaponState(config), firedExact: false, shotsFired: 3 }
    const directionOf = (shooterIndex: number): unknown => {
      const shot = createShotHit()
      resolveFighterShot(
        {
          shooterIndex,
          eyeM: { x: 30, y: 1.6, z: 0 },
          aimM: { x: 1, y: 0, z: 0 },
          weapon,
          seedBase: 5,
        },
        lineUp(),
        RANGE,
        shot,
      )
      return { ...shot.directionM }
    }
    expect(directionOf(0)).toEqual(directionOf(0))
    expect(directionOf(0)).not.toEqual(directionOf(2))
  })
})

describe('describeSniperKill', () => {
  it('escreve quem, quando, de onde e em que altura, com o ar dos dois corpos', () => {
    const [shooter, victim] = lineUp() as [Fighter, Fighter]
    ;(victim.body as { grounded: boolean }).grounded = false
    const shot = createShotHit()
    shot.distanceM = 20
    shot.endpointM.y = victim.body.position.y + victim.body.capsuleHeightM * 0.9
    const kill = describeSniperKill(createKillEvent(), {
      shooter,
      victim,
      shot,
      weapon: exactWeapon(),
      atS: 42,
    })
    expect(kill).toMatchObject({
      shooterId: 'bot-0',
      victimId: 'local',
      atS: 42,
      scoped: true,
      distanceM: 20,
      shooterAirborne: false,
      victimAirborne: true,
      shooterGrappling: false,
      victimsInShot: 1,
    })
    expect(kill.hitHeightRatio).toBeCloseTo(0.9)
  })
})
