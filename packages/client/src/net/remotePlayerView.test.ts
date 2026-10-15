import { readFileSync } from 'node:fs'
import { encodeStance, parseGameplayConfig, quantizePositionM } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  createRemotePlayerView,
  interpolationDelayMs,
  playersOf,
  readRemotePlayer,
} from './remotePlayerView.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

describe('readRemotePlayer', () => {
  it('converte o snapshot em metros, mira unitária e postura', () => {
    const view = readRemotePlayer(
      {
        x: quantizePositionM(26),
        y: quantizePositionM(7.5),
        z: quantizePositionM(-12.346),
        aimX: 32767,
        aimY: 0,
        aimZ: 0,
        stance: encodeStance('sliding', true),
        alive: false,
        name: 'ANA',
      },
      createRemotePlayerView(),
    )
    expect(view.feetM).toEqual({ x: 26, y: 7.5, z: -12.346 })
    expect(view.aim).toEqual({ x: 1, y: 0, z: 0 })
    expect(view).toMatchObject({ stance: 'sliding', grounded: true, alive: false })
  })

  /** Entre dois patches o `Predict` devolve o meio do caminho; a conversão não pode arredondar. */
  it('aceita posição fracionária da interpolação', () => {
    const view = readRemotePlayer(
      { x: 500.5, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: -32767, stance: 0, alive: true, name: '' },
      createRemotePlayerView(),
    )
    expect(view.feetM.x).toBeCloseTo(1.001, 9)
  })
})

describe('interpolationDelayMs', () => {
  it('é dois intervalos de patch', () => {
    expect(interpolationDelayMs(config)).toBe((2 * 1000) / config.simulation.patchHz)
  })
})

describe('playersOf', () => {
  /** Regressão: nos primeiros quadros depois de entrar, o estado ainda não chegou. */
  it('não tem jogador nenhum antes de o estado chegar', () => {
    expect(playersOf(undefined).size).toBe(0)
    expect(playersOf({}).size).toBe(0)
  })

  it('devolve o mapa de jogadores quando o estado chegou', () => {
    const players = new Map([
      ['ana', { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: -1, stance: 0, alive: true, name: '' }],
    ])
    expect(playersOf({ players })).toBe(players)
  })
})
