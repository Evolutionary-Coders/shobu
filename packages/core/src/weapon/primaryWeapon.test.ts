import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRIMARY_WEAPON,
  decodePrimaryWeapon,
  encodePrimaryWeapon,
  isPrimaryWeapon,
  PRIMARY_WEAPONS,
} from './primaryWeapon.ts'

describe('primaryWeapon', () => {
  it('puts the laser first, as the default', () => {
    expect(PRIMARY_WEAPONS[0]).toBe('laser')
    expect(DEFAULT_PRIMARY_WEAPON).toBe('laser')
  })

  it.each(PRIMARY_WEAPONS)('round-trips %s through its code', (weapon) => {
    expect(decodePrimaryWeapon(encodePrimaryWeapon(weapon))).toBe(weapon)
  })

  it('codes the classic sniper as 1', () => {
    expect(encodePrimaryWeapon('classic')).toBe(1)
  })

  it.each([7, -1, 0.5, undefined])('falls back to the laser for code %s', (code) => {
    expect(decodePrimaryWeapon(code)).toBe('laser')
  })

  it.each([
    ['laser', true],
    ['classic', true],
    ['rocket', false],
    [0, false],
    [undefined, false],
  ])('tells whether %s is a primary weapon', (candidate, expected) => {
    expect(isPrimaryWeapon(candidate)).toBe(expected)
  })
})
