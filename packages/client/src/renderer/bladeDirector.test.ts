import { createMeleeState, type MeleeState } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createBladeDirector, createBladeShot, directBlade } from './bladeDirector.ts'
import { gestureDurationS } from './bladeGestures.ts'

const FRAME_S = 1 / 60

function strike(melee: MeleeState, kind: 'quick' | 'slash'): MeleeState {
  melee.strikes += 1
  melee.strikeKind = kind
  return melee
}

describe('directBlade', () => {
  it('sem golpe, só a sniper, no descanso', () => {
    const shot = directBlade(
      createBladeDirector(),
      createMeleeState('katana'),
      FRAME_S,
      createBladeShot(),
    )
    expect([shot.sniperVisible, shot.bladeVisible]).toEqual([true, false])
    expect(shot.sniperPose.y).toBe(0)
  })

  it('o golpe rápido de faca mostra a faca e afunda a sniper, e acaba', () => {
    const director = createBladeDirector()
    const melee = strike(createMeleeState('knife'), 'quick')
    const shot = createBladeShot()
    directBlade(director, melee, 0.1, shot)
    expect(director.gesture).toBe('knife-quick')
    expect([shot.weapon, shot.bladeVisible, shot.sniperVisible]).toEqual(['knife', true, true])
    expect(shot.sniperPose.y).toBeLessThan(0)
    directBlade(director, melee, gestureDurationS('knife-quick'), shot)
    expect([director.gesture, shot.bladeVisible]).toEqual([undefined, false])
  })

  it('o golpe rápido de katana é o gesto dela', () => {
    const director = createBladeDirector()
    directBlade(director, strike(createMeleeState('katana'), 'quick'), FRAME_S, createBladeShot())
    expect(director.gesture).toBe('katana-quick')
  })

  it('empunhar saca a katana e guarda a sniper; o corte alterna o lado', () => {
    const director = createBladeDirector()
    const melee = createMeleeState('katana')
    melee.bladeDrawn = true
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    expect(director.gesture).toBe('draw')
    expect([shot.bladeVisible, shot.sniperVisible]).toEqual([true, false])
    directBlade(director, strike(melee, 'slash'), FRAME_S, shot)
    expect(director.gesture).toBe('slash-left')
    directBlade(director, strike(melee, 'slash'), FRAME_S, shot)
    expect(director.gesture).toBe('slash-right')
  })

  it('a faca na mão corta com os gestos dela, alternando o lado', () => {
    const director = createBladeDirector()
    const melee = createMeleeState('knife')
    melee.bladeDrawn = true
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    directBlade(director, strike(melee, 'slash'), FRAME_S, shot)
    expect([director.gesture, shot.weapon]).toEqual(['knife-slash-left', 'knife'])
    directBlade(director, strike(melee, 'slash'), FRAME_S, shot)
    expect(director.gesture).toBe('knife-slash-right')
  })

  it('guardar desce a katana e traz a sniper de baixo', () => {
    const director = createBladeDirector()
    director.wasDrawn = true
    const shot = directBlade(director, createMeleeState('katana'), 0.05, createBladeShot())
    expect(director.gesture).toBe('holster')
    expect([shot.bladeVisible, shot.sniperVisible]).toEqual([true, true])
    expect(shot.sniperPose.y).toBeLessThan(0)
  })
})
