import { MEDAL_CATALOG, SCORESTREAK_CATALOG } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { HUMAN_SKINS } from '../character/humanSkins.ts'
import { preloadKillArt } from './preloadKillArt.ts'

/** O renderer só pelo aviso de controle: o teste o dispara à mão. */
class FakeControl {
  #listener: (inControl: boolean) => void = () => {}

  onPlayerControlChange(listener: (inControl: boolean) => void): void {
    this.#listener = listener
  }

  change(inControl: boolean): void {
    this.#listener(inControl)
  }
}

describe('preloadKillArt', () => {
  it('decodifica a arte toda no primeiro controle, e só nele', () => {
    const control = new FakeControl()
    const decoded: string[] = []
    preloadKillArt(control, (url) => decoded.push(url))
    control.change(false)
    expect(decoded).toEqual([])
    control.change(true)
    control.change(false)
    control.change(true)
    expect(decoded).toHaveLength(
      MEDAL_CATALOG.length + HUMAN_SKINS.length + SCORESTREAK_CATALOG.length,
    )
    expect(new Set(decoded).size).toBe(decoded.length)
  })
})
