import { describe, expect, it } from 'vitest'
import { type Duel, duel, open, seat, wire } from './roomDuelFixture.ts'
import { chooseScorestreaks, requestScorestreak } from './roomScorestreaks.ts'
import { stepRoom } from './roomSimulation.ts'

/** O duelo valendo, com a Ana levando o PULSO EMP pronto na terceira linha. */
function empDuel(): Duel {
  const live = duel()
  live.room.match.cycle.phase = 'live'
  chooseScorestreaks(live.room, 'ana', ['ping', 'sonar', 'emp'])
  const slots = live.room.scorestreaks.ledger.slotsById.get('ana')
  if (slots) slots.ready[2] = true
  return live
}

/** Um tick com a Bia pedindo a luneta: é no input dela que a sala anda a arma e o corpo. */
function biaScopes({ room, io }: Duel): readonly boolean[] {
  io.push('ana', wire())
  io.push('bia', wire({ scope: true }))
  stepRoom(room, io, open)
  const ana = seat(room, 'ana')
  const bia = seat(room, 'bia')
  return [bia.arsenal.weapon.scoped, bia.body.grappleLocked, ana.body.grappleLocked]
}

describe('PULSO EMP na sala', () => {
  it('acionado, a Bia perde a luneta e o gancho, e a Ana, dona, não', () => {
    const live = empDuel()
    requestScorestreak(live.room, 'ana', 2)
    stepRoom(live.room, live.io, open)
    expect(biaScopes(live)).toEqual([false, true, false])
  })

  it('sem acionar, a luneta da Bia abre', () => {
    expect(biaScopes(empDuel())).toEqual([true, false, false])
  })
})
