import { describe, expect, it } from 'vitest'
import { fireFlashOnRig, type MountableFlash, warmUpFlash } from './muzzleFlashMount.ts'

const MUZZLE_M = [0, 0.09, 1.026] as const

class FakeFlash implements MountableFlash {
  fired = 0
  readonly mesh = {
    parent: null as object | null,
    positionM: [0, 0, 0] as [number, number, number],
    positionSets: 0,
    position: {
      set: (x: number, y: number, z: number): void => {
        this.mesh.positionM = [x, y, z]
        this.mesh.positionSets += 1
      },
    },
  }

  fire(): void {
    this.fired += 1
  }
}

describe('fireFlashOnRig', () => {
  /** Revisão do PR #30: o tiro antes do glb acendia o clarão solto na origem do mundo. */
  it('sem arma na mão, o tiro não acende o clarão', () => {
    const flash = new FakeFlash()
    expect(fireFlashOnRig(flash, undefined, MUZZLE_M)).toBe(false)
    expect([flash.fired, flash.mesh.parent]).toEqual([0, null])
  })

  it('com a arma, prende o clarão na boca do cano e acende', () => {
    const flash = new FakeFlash()
    const rig = {}
    expect(fireFlashOnRig(flash, rig, MUZZLE_M)).toBe(true)
    expect(flash.mesh.parent).toBe(rig)
    expect([flash.mesh.positionM, flash.fired]).toEqual([[...MUZZLE_M], 1])
  })

  it('já no rig, não mexe na posição de novo', () => {
    const flash = new FakeFlash()
    const rig = {}
    fireFlashOnRig(flash, rig, MUZZLE_M)
    fireFlashOnRig(flash, rig, MUZZLE_M)
    expect([flash.mesh.positionSets, flash.fired]).toEqual([1, 2])
  })
})

describe('warmUpFlash', () => {
  it('sem arma, aquece no olho, onde o menu esconde o clarão', () => {
    const flash = new FakeFlash()
    const eye = {}
    warmUpFlash(flash, undefined, eye, MUZZLE_M)
    expect(flash.mesh.parent).toBe(eye)
    expect(flash.fired).toBe(1)
  })

  it('com a arma, aquece já no rig', () => {
    const flash = new FakeFlash()
    const rig = {}
    warmUpFlash(flash, rig, {}, MUZZLE_M)
    expect(flash.mesh.parent).toBe(rig)
  })

  it('o primeiro tiro com a arma tira o clarão do olho e leva para o rig', () => {
    const flash = new FakeFlash()
    const rig = {}
    warmUpFlash(flash, undefined, {}, MUZZLE_M)
    fireFlashOnRig(flash, rig, MUZZLE_M)
    expect(flash.mesh.parent).toBe(rig)
  })
})
