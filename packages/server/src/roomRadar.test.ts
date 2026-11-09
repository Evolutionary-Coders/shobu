import { describe, expect, it } from 'vitest'
import { DUEL_M, type Duel, duel, open, shipped } from './roomDuelFixture.ts'
import { stepRoomRadar } from './roomRadar.ts'
import { chooseScorestreaks, requestScorestreak } from './roomScorestreaks.ts'
import { stepRoom } from './roomSimulation.ts'

const TICK_S = 1 / shipped.simulation.tickHz

/** O duelo já valendo. */
function liveDuel(): Duel {
  const live = duel()
  live.room.match.cycle.phase = 'live'
  return live
}

/** A primeira série de `playerId` pronta: o PING, na escolha padrão. */
function readyPing({ room }: Duel, playerId: string): void {
  const slots = room.scorestreaks.ledger.slotsById.get(playerId)
  if (slots) slots.ready[0] = true
}

/** Anda a sala `seconds` segundos, tick a tick, como o colyseus faria. */
function runFor({ room, io }: Duel, seconds: number): void {
  for (let t = 0; t < seconds; t += TICK_S) stepRoom(room, io, open)
}

describe('stepRoomRadar', () => {
  it('quem aciona o PING recebe a posição do inimigo; o inimigo não recebe nada', () => {
    const live = liveDuel()
    readyPing(live, 'ana')
    requestScorestreak(live.room, 'ana', 0)
    runFor(live, 0.1)
    expect(live.io.sweeps).toHaveLength(1)
    const [first] = live.io.sweeps
    expect(first?.playerId).toBe('ana')
    expect(first?.sweep.blips).toEqual([{ id: 'bia', xM: 0, yM: 0, zM: -DUEL_M }])
    expect(first?.sweep.pulseLeftS).toBeCloseTo(shipped.radar.pingDurationS, 5)
    expect(first?.sweep.revealS).toBe(shipped.radar.blipFadeS)
  })

  it('o SONAR varre uma vez só, e o ponto dele fica o `sonarRevealS`', () => {
    const live = liveDuel()
    chooseScorestreaks(live.room, 'ana', ['sonar', 'rapid-bolt', 'emp'])
    readyPing(live, 'ana')
    requestScorestreak(live.room, 'ana', 0)
    runFor(live, shipped.radar.sonarRevealS + 5)
    expect(live.io.sweeps.map(({ sweep }) => [sweep.blips.length, sweep.revealS])).toEqual([
      [1, shipped.radar.sonarRevealS],
    ])
  })

  it('varre a cada intervalo enquanto o PING dura, e depois para', () => {
    const live = liveDuel()
    readyPing(live, 'ana')
    requestScorestreak(live.room, 'ana', 0)
    runFor(live, shipped.radar.pingDurationS + 5)
    const expected = Math.ceil(shipped.radar.pingDurationS / shipped.radar.pingSweepEveryS)
    expect(live.io.sweeps).toHaveLength(expected)
  })

  it('o radar embaralhado por outro cala as varreduras do PING', () => {
    const live = liveDuel()
    readyPing(live, 'ana')
    live.room.scorestreaks.radar.jams.set('bia', 99)
    requestScorestreak(live.room, 'ana', 0)
    runFor(live, 10)
    expect(live.io.sweeps).toEqual([])
  })

  it('no aquecimento o radar não anda', () => {
    const live = liveDuel()
    live.room.scorestreaks.radar.pulses.set('ana', {
      endsAtS: 99,
      sweepEveryS: 3,
      revealS: 2.5,
      nextSweepAtS: 0,
    })
    live.room.match.cycle.phase = 'warmup'
    stepRoomRadar(live.room, live.io)
    expect(live.io.sweeps).toEqual([])
  })

  it('a varredura de quem não está sentado, como o bot, não sai para o fio', () => {
    const live = liveDuel()
    live.room.scorestreaks.radar.pulses.set('bot-0', {
      endsAtS: 99,
      sweepEveryS: 3,
      revealS: 2.5,
      nextSweepAtS: 0,
    })
    stepRoomRadar(live.room, live.io)
    expect(live.io.sweeps).toEqual([])
  })
})
