import { createMeleeState, type MeleeState } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { bladeClipSpec } from './bladeClips.ts'
import { createBladeDirector, createBladeShot, directBlade } from './bladeDirector.ts'
import { sniperTrackDurationS } from './bladeGestures.ts'

const FRAME_S = 1 / 60

function strike(melee: MeleeState, kind: 'quick' | 'slash'): MeleeState {
  melee.strikes += 1
  melee.strikeKind = kind
  return melee
}

function drawn(weapon: 'katana' | 'knife'): MeleeState {
  const melee = createMeleeState(weapon)
  melee.bladeDrawn = true
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
    expect([shot.sniperVisible, shot.bladeVisible, shot.clip]).toEqual([true, false, undefined])
    expect([shot.sniperPose.y, shot.trail, shot.cameraRollRad]).toEqual([0, 0, 0])
  })

  it('o golpe rápido de faca mostra a faca e tira a sniper da frente, e acaba', () => {
    const director = createBladeDirector()
    const melee = strike(createMeleeState('knife'), 'quick')
    const shot = createBladeShot()
    directBlade(director, melee, 0.1, shot)
    expect([shot.clip, shot.weapon, shot.bladeVisible, shot.sniperVisible]).toEqual([
      'quick',
      'knife',
      true,
      true,
    ])
    expect(shot.sniperPose.y).toBeLessThan(0)
    directBlade(director, melee, bladeClipSpec('knife', 'quick').durationS, shot)
    expect([shot.clip, shot.bladeVisible]).toEqual([undefined, false])
    directBlade(director, melee, sniperTrackDurationS('dip'), shot)
    expect(shot.sniperPose.y).toBe(0)
  })

  it('o golpe rápido de katana é o clipe dela, com rastro no meio do corte', () => {
    const director = createBladeDirector()
    const shot = directBlade(
      director,
      strike(createMeleeState('katana'), 'quick'),
      0.12,
      createBladeShot(),
    )
    expect([shot.clip, shot.weapon]).toEqual(['quick', 'katana'])
    expect(shot.trail).toBeGreaterThan(0)
    expect(shot.cameraRollRad).not.toBe(0)
  })

  it('empunhar saca a katana, guarda a sniper e assenta no descanso, que dá a volta', () => {
    const director = createBladeDirector()
    const melee = drawn('katana')
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    expect([shot.clip, shot.bladeVisible, shot.sniperVisible]).toEqual(['draw', true, false])
    directBlade(director, melee, bladeClipSpec('katana', 'draw').durationS, shot)
    expect(shot.clip).toBe('idle')
    directBlade(director, melee, bladeClipSpec('katana', 'idle').durationS + 0.5, shot)
    expect([shot.clip, shot.clipS]).toEqual(['idle', 0.5])
    expect(shot.cameraRollRad).toBe(0)
  })

  it('os cortes da katana giram entre as duas diagonais e o deitado', () => {
    const director = createBladeDirector()
    const melee = drawn('katana')
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    const clips = [1, 2, 3, 4].map(
      () => directBlade(director, strike(melee, 'slash'), 0, shot).clip,
    )
    expect(clips).toEqual(['slash_1', 'slash_2', 'slash_3', 'slash_1'])
  })

  it('cada troca de clipe conta, para a mistura recomeçar', () => {
    const director = createBladeDirector()
    const melee = drawn('katana')
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    const before = shot.clipChanges
    directBlade(director, strike(melee, 'slash'), FRAME_S, shot)
    expect(shot.clipChanges).toBe(before + 1)
  })

  it('a faca na mão alterna a estocada e o corte', () => {
    const director = createBladeDirector()
    const melee = drawn('knife')
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    const clips = [1, 2, 3].map(() => directBlade(director, strike(melee, 'slash'), 0, shot).clip)
    expect(clips).toEqual(['stab', 'slash', 'stab'])
  })

  it('a investida da katana é a recarga dela que recomeça; a faca não investe', () => {
    const director = createBladeDirector()
    const melee = drawn('katana')
    const shot = directBlade(director, melee, FRAME_S, createBladeShot())
    melee.dashCooldownLeftS = 1.5
    expect(directBlade(director, melee, FRAME_S, shot).clip).toBe('dash')
    melee.dashCooldownLeftS = 1.4
    directBlade(director, melee, FRAME_S, shot)
    expect(shot.clip).toBe('dash')
    const knife = drawn('knife')
    const knifeDirector = createBladeDirector()
    directBlade(knifeDirector, knife, FRAME_S, shot)
    knife.dashCooldownLeftS = 1.5
    expect(directBlade(knifeDirector, knife, FRAME_S, shot).clip).toBe('draw')
  })

  it('guardar desce a lâmina e traz a sniper de baixo, e a lâmina sai de cena', () => {
    const director = createBladeDirector()
    director.wasDrawn = true
    const melee = createMeleeState('katana')
    const shot = directBlade(director, melee, 0.05, createBladeShot())
    expect([shot.clip, shot.bladeVisible, shot.sniperVisible]).toEqual(['holster', true, true])
    expect(shot.sniperPose.y).toBeLessThan(0)
    directBlade(director, melee, bladeClipSpec('katana', 'holster').durationS, shot)
    expect([shot.clip, shot.bladeVisible]).toEqual([undefined, false])
  })

  it('a lâmina já na mão sem clipe nenhum (o renascer) volta direto ao descanso', () => {
    const director = createBladeDirector()
    director.wasDrawn = true
    expect(directBlade(director, drawn('knife'), FRAME_S, createBladeShot()).clip).toBe('idle')
  })
})
