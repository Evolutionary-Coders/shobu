import { createRadarState, type RadarConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { MINIMAP_RADIUS_PX, minimapViewOf, pingTimerOf } from './minimapReadout.ts'

const RADAR: RadarConfig = {
  pingDurationS: 15,
  pingSweepEveryS: 3,
  blipFadeS: 2.5,
  shotRevealS: 1.5,
  minimapRangeM: 35,
}

function sourceAt(nowS: number) {
  const state = createRadarState()
  return {
    arenaId: 'neon-kaido',
    nowS,
    viewerId: 'local',
    selfM: { x: 1, y: 0, z: 2 },
    facingM: { x: 0, y: 0, z: 1 },
    config: RADAR,
    radar: {
      state,
      blips: [
        { id: 'bot-0', xM: 4, yM: 0, zM: 5, seenAtS: 9, kind: 'sweep' as const },
        { id: 'bot-1', xM: 6, yM: 0, zM: 7, seenAtS: 9, kind: 'shot' as const },
      ],
    },
  }
}

describe('minimapViewOf', () => {
  it('leva o alcance da config, o raio do canvas e a vida de cada ponto', () => {
    const view = minimapViewOf(sourceAt(10))
    expect(view).toMatchObject({
      arenaId: 'neon-kaido',
      nowS: 10,
      rangeM: 35,
      radiusPx: MINIMAP_RADIUS_PX,
      jammed: false,
      pinging: false,
    })
    expect(view.blips.map((blip) => blip.lifeS)).toEqual([2.5, 1.5])
  })

  it('o PING próprio acende a borda, e o embaralhamento de outro vira ruído', () => {
    const source = sourceAt(10)
    source.radar.state.pulses.set('local', { endsAtS: 20, sweepEveryS: 3, nextSweepAtS: 13 })
    source.radar.state.jams.set('bot-0', 20)
    expect(minimapViewOf(source)).toMatchObject({ jammed: true, pinging: true })
  })
})

describe('pingTimerOf', () => {
  it('a barra do PING de quem olha, cheia no acionamento, e nada sem PING', () => {
    const state = createRadarState()
    expect(pingTimerOf(state, 'local', 10, RADAR)).toBeUndefined()
    state.pulses.set('local', { endsAtS: 25, sweepEveryS: 3, nextSweepAtS: 13 })
    expect(pingTimerOf(state, 'local', 10, RADAR)).toEqual({ fraction: 1, text: 'PING 15s' })
    expect(pingTimerOf(state, 'bot-0', 10, RADAR)).toBeUndefined()
  })
})
