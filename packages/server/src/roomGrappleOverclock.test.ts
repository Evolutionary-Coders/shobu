import { describe, expect, it } from 'vitest'
import { type Duel, duel, open, seat, wire } from './roomDuelFixture.ts'
import { chooseScorestreaks, requestScorestreak } from './roomScorestreaks.ts'
import { stepRoom } from './roomSimulation.ts'

/** O duelo valendo, com a Ana levando o GANCHO OVERCLOCK pronto na primeira linha. */
function overclockDuel(): Duel {
  const live = duel()
  live.room.match.cycle.phase = 'live'
  chooseScorestreaks(live.room, 'ana', ['grapple-overclock', 'ping', 'emp'])
  const slots = live.room.scorestreaks.ledger.slotsById.get('ana')
  if (slots) slots.ready[0] = true
  return live
}

/** Um input parado da Ana: é no input que a sala anda o corpo dela. */
function idleTick({ room, io }: Duel): boolean {
  io.push('ana', wire())
  stepRoom(room, io, open)
  return seat(room, 'ana').body.grappleFree
}

describe('GANCHO OVERCLOCK na sala', () => {
  it('acionado, o corpo da Ana anda sem recarga no gancho', () => {
    const live = overclockDuel()
    requestScorestreak(live.room, 'ana', 0)
    stepRoom(live.room, live.io, open)
    expect(idleTick(live)).toBe(true)
  })

  it('sem acionar, o gancho tem recarga', () => {
    expect(idleTick(overclockDuel())).toBe(false)
  })
})
