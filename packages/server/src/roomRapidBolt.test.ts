import { describe, expect, it } from 'vitest'
import { type Duel, duel, FIRE_WIRE, open, seat, wire } from './roomDuelFixture.ts'
import { chooseScorestreaks, requestScorestreak } from './roomScorestreaks.ts'
import { stepRoom } from './roomSimulation.ts'

/** O duelo valendo, com a Ana levando o FERROLHO RÁPIDO pronto na primeira linha. */
function rapidDuel(): Duel {
  const live = duel()
  live.room.match.cycle.phase = 'live'
  chooseScorestreaks(live.room, 'ana', ['rapid-bolt', 'ping', 'emp'])
  const slots = live.room.scorestreaks.ledger.slotsById.get('ana')
  if (slots) slots.ready[0] = true
  return live
}

/** Atira, solta e atira de novo, um input por tick: o ferrolho comum recusa o segundo. */
function fireTwice({ room, io }: Duel): number {
  for (const input of [FIRE_WIRE, wire(), FIRE_WIRE]) {
    io.push('ana', input)
    stepRoom(room, io, open)
  }
  return seat(room, 'ana').arsenal.weapon.shotsFired
}

describe('FERROLHO RÁPIDO na sala', () => {
  it('acionado, o segundo tiro sai sem esperar o ferrolho', () => {
    const live = rapidDuel()
    requestScorestreak(live.room, 'ana', 0)
    stepRoom(live.room, live.io, open)
    expect(fireTwice(live)).toBe(2)
  })

  it('sem acionar, o ferrolho recusa o segundo tiro', () => {
    expect(fireTwice(rapidDuel())).toBe(1)
  })
})
