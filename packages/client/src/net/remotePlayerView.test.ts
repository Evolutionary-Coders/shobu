import { readFileSync } from 'node:fs'
import { encodeStance, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  createRemotePlayerView,
  interpolationDelayMs,
  readRemotePlayer,
} from './remotePlayerView.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

describe('readRemotePlayer', () => {
  it('converte o snapshot em metros, mira unitária e postura', () => {
    const view = readRemotePlayer(
      {
        x: 26000,
        y: 7500,
        z: -12345,
        aimX: 32767,
        aimY: 0,
        aimZ: 0,
        stance: encodeStance('sliding', true),
      },
      createRemotePlayerView(),
    )
    expect(view.feetM).toEqual({ x: 26, y: 7.5, z: -12.345 })
    expect(view.aim).toEqual({ x: 1, y: 0, z: 0 })
    expect(view).toMatchObject({ stance: 'sliding', grounded: true })
  })

  /** Entre dois patches o `Predict` devolve o meio do caminho; a conversão não pode arredondar. */
  it('aceita posição fracionária da interpolação', () => {
    const view = readRemotePlayer(
      { x: 1000.5, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: -32767, stance: 0 },
      createRemotePlayerView(),
    )
    expect(view.feetM.x).toBeCloseTo(1.0005, 9)
  })
})

describe('interpolationDelayMs', () => {
  it('é três intervalos de patch', () => {
    expect(interpolationDelayMs(config)).toBe((3 * 1000) / config.simulation.patchHz)
  })
})
